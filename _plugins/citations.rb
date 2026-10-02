#!/usr/bin/env ruby
# frozen_string_literal: true

require 'digest'

# Citations: quotes that point at a shared source.
#
# Sources live in `_data/sources.yml`, keyed by id. A post cites one with
#
#   {% citation <source-id> at="p. 42" %}
#   quoted text (markdown)
#   <!-- commentary -->
#   the author's note (markdown, optional)
#   {% endcitation %}
#
# `post:<slug>` cites another post of this blog instead of a registry entry.
#
# Links in a post's reference section (`## 참고`, `## References`, ...) count
# too: a post relies on every source it lists, quoted or not. A link that is not
# in the registry becomes an automatic source keyed by its URL.
#
# At `site, :post_read` the markdown of every published post is scanned and the
# result lands in `site.data['citation_index']` (source id => entries),
# `site.data['source_entries']` (id => resolved source) and
# `post.data['cited_sources']`. The generator below turns that into /sources/
# and /sources/<id>/. The block tag renders the card through
# `_includes/citation-card.html`. See docs/features/citation-design.md.

module Jekyll
  module Citations
    TAG_RE = /\{%-?\s*citation\s+(\S+)(.*?)-?%\}(.*?)\{%-?\s*endcitation\s*-?%\}/m.freeze
    ARG_RE = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/.freeze
    COMMENTARY_RE = /^[ \t]*<!--\s*commentary\s*-->[ \t]*$/.freeze
    # `참고사항` is a note, not a reference list, so the suffixes are spelled out.
    REFERENCE_HEADING_RE = /^(\#{2,4})[ \t]*(?:참고(?:[ \t]*(?:자료|링크|문헌|서적))?|출처|References?|Sources?)[ \t]*$/i.freeze
    HEADING_RE = /^(\#{1,6})[ \t]+\S/.freeze
    LINK_RE = %r{\[([^\]]*)\]\((https?://[^)\s]+)\)|<(https?://[^>\s]+)>|(?<![(<\[])(https?://[^\s)>\]]+)}.freeze
    # An automatic source gets a page once this many posts list it; below that
    # it stays a row in the /sources/ index.
    AUTO_PAGE_MIN_POSTS = 2

    class << self
      def parse_args(markup)
        markup.to_s.scan(ARG_RE).to_h { |key, dq, sq, bare| [key, dq || sq || bare] }
      end

      def split_body(body)
        quote, note = body.to_s.split(COMMENTARY_RE, 2)
        [quote.to_s.strip, note.to_s.strip]
      end

      def slug_of(url)
        url.to_s[%r{/posts/([^/]+)/?}, 1]
      end

      def source_url(source)
        return source['url'] if source['url'].to_s != ''

        case source['type']
        when 'paper'
          "https://doi.org/#{source['doi']}" if source['doi']
        when 'rfc'
          "https://datatracker.ietf.org/doc/html/rfc#{source['number']}" if source['number']
        when 'code'
          code_url(source)
        end
      end

      def code_url(source)
        return unless source['repo'] && source['commit'] && source['path']

        url = "https://github.com/#{source['repo']}/blob/#{source['commit']}/#{source['path']}"
        first, last = source['lines'].to_s.split('-', 2)
        return url if first.to_s.empty?

        last.to_s.empty? ? "#{url}#L#{first}" : "#{url}#L#{first}-L#{last}"
      end

      # A source hash ready for Liquid, or nil when the id is unknown.
      def resolve(site, id)
        id = id.to_s
        if id.start_with?('post:')
          slug = id.delete_prefix('post:')
          post = site.posts.docs.find { |doc| slug_of(doc.url) == slug }
          return unless post

          return {
            'id' => id,
            'type' => 'post',
            'title' => post.data['title'],
            'url' => post.url,
            'internal' => true
          }
        end

        auto = (site.data['auto_sources'] || {})[id]
        return auto if auto

        raw = (site.data['sources'] || {})[id]
        return unless raw.is_a?(Hash)

        source = raw.merge('id' => id)
        source['url'] = source_url(source)
        source['page_url'] = "/sources/#{id}/"
        source
      end

      def normalize_url(url)
        url.to_s.strip.downcase.sub(%r{\Ahttps?://}, '').sub(/\Awww\./, '').sub(/[#?].*\z/, '').chomp('/')
      end

      # The links listed under the post's reference headings, as [text, url].
      # A section runs until the next heading of the same or a higher level.
      def reference_links(markdown)
        links = []
        lines = markdown.to_s.lines
        level = nil
        fence = false
        lines.each do |line|
          fence = !fence if line.start_with?('```', '~~~')
          next if fence

          if (m = line.match(REFERENCE_HEADING_RE))
            level = m[1].size
            next
          end
          if level && (h = line.match(HEADING_RE)) && h[1].size <= level
            level = nil
          end
          next unless level

          line.scan(LINK_RE) do |text, md_url, angle_url, bare_url|
            url = (md_url || angle_url || bare_url).sub(/[.,;:]+\z/, '')
            links << [text.to_s.delete('*`').strip, url]
          end
        end
        links
      end

      # The key two URLs share when they point at the same thing. Unlike
      # normalize_url it keeps a YouTube video id and folds every RFC mirror
      # into one number, since those live in the query or the host.
      def link_key(url)
        if (m = url.match(%r{(?:datatracker\.ietf\.org/doc/(?:html/)?|rfc-editor\.org/rfc/|ietf\.org/rfc/)rfc(\d+)}i))
          return "rfc:#{m[1].to_i}"
        end
        if (m = url.match(%r{(?:youtube\.com/watch\?(?:[^#]*&)?v=|youtu\.be/|youtube\.com/live/)([\w-]{6,})}i))
          return "youtube:#{m[1]}"
        end

        # Keep the query: some sites name the page in it (`?courseId=..&unitId=..`).
        base = url.to_s.strip.sub(/#.*\z/, '')
        path, query = base.split('?', 2)
        params = query.to_s.split('&').reject { |p| p.empty? || p.match?(/\A(utm_|fbclid|gclid|ref=|source=)/i) }.sort
        params.empty? ? normalize_url(path) : "#{normalize_url(path)}?#{params.join('&').downcase}"
      end

      def auto_type(url)
        host = url[%r{\Ahttps?://([^/]+)}i, 1].to_s.downcase
        path = url.sub(%r{\Ahttps?://[^/]+}i, '')
        return 'video' if host.end_with?('youtube.com') || host == 'youtu.be'
        return 'code' if host == 'github.com' && path.match?(%r{\A/[^/]+/[^/]+/blob/})
        return 'doc' if host.start_with?('docs.') || path.match?(%r{/(docs|documentation|reference|manual|javadoc)/}i)

        'web'
      end

      def auto_id(key)
        return "rfc-#{key.delete_prefix('rfc:')}" if key.start_with?('rfc:')
        return "youtube-#{key.delete_prefix('youtube:').downcase}" if key.start_with?('youtube:')

        stem = key.split('/').reject(&:empty?).values_at(0, -1).uniq.join('-')
        stem = stem.downcase.gsub(/[^a-z0-9]+/, '-').gsub(/\A-|-\z/, '')[0, 48].sub(/-\z/, '')
        "#{stem}-#{Digest::SHA1.hexdigest(key)[0, 6]}"
      end

      # Registry id for a URL: an exact match, then the longest `url_prefix`,
      # then an RFC number registered as `rfc-<n>`.
      def registry_id(site, url, by_url, prefixes)
        norm = normalize_url(url)
        return by_url[norm] if by_url[norm]

        hit = prefixes.find { |prefix, _id| norm.start_with?(prefix) }
        return hit[1] if hit

        key = link_key(url)
        if key.start_with?('rfc:')
          id = "rfc-#{key.delete_prefix('rfc:')}"
          return id if (site.data['sources'] || {}).key?(id)
        end
        nil
      end

      def build(site)
        index = Hash.new { |h, k| h[k] = [] }
        by_url = {}
        prefixes = []
        (site.data['sources'] || {}).each do |id, raw|
          url = normalize_url(resolve(site, id)&.dig('url'))
          by_url[url] = id unless url.empty?
          Array(raw.is_a?(Hash) ? raw['url_prefix'] : nil).each do |prefix|
            prefixes << [normalize_url(prefix), id]
          end
        end
        prefixes.sort_by! { |prefix, _id| -prefix.size }

        site.data['auto_sources'] = {}
        auto = Hash.new { |h, k| h[k] = { 'texts' => Hash.new(0), 'urls' => [] } }

        site.posts.docs.each do |post|
          cited = []
          quoted = []
          post.content.to_s.scan(TAG_RE).each_with_index do |(id, markup, body), i|
            unless resolve(site, id)
              Jekyll.logger.warn 'Citations:', "unknown source '#{id}' in #{post.relative_path}"
              next
            end

            quote, note = split_body(body)
            index[id] << {
              'post' => post,
              'quote' => quote,
              'note' => note,
              'at' => parse_args(markup)['at'],
              'anchor' => "cite-#{i + 1}"
            }
            quoted << id unless quoted.include?(id)
          end
          cited.concat(quoted)

          # A review's `source_url` is the original it reads as a whole. When
          # that original is registered and not already quoted in the post,
          # the review counts as one entry for it.
          implicit = by_url[normalize_url(post.data['source_url'])]
          if implicit && !cited.include?(implicit)
            index[implicit] << { 'post' => post, 'implicit' => true }
            cited << implicit
          end

          # The reference section. A source already quoted or reviewed in this
          # post keeps that entry; a listed link adds nothing new to it.
          reference_links(post.content).each do |text, url|
            id = registry_id(site, url, by_url, prefixes)
            unless id
              key = link_key(url)
              id = auto_id(key)
              auto[id]['texts'][text] += 1 unless text.empty? || text.match?(%r{\Ahttps?://})
              auto[id]['urls'] << url
              auto[id]['key'] = key
            end
            next if quoted.include?(id) || id == implicit
            next if index[id].any? { |e| e['post'] == post && e['link'] == url }

            index[id] << { 'post' => post, 'reference' => true, 'text' => text, 'link' => url }
            cited << id unless cited.include?(id)
          end

          post.data['cited_sources'] = cited
        end

        auto.each do |id, info|
          url = info['urls'].first
          key = info['key']
          title = info['texts'].max_by { |text, count| [count, text.size] }&.first
          title ||= key.start_with?('rfc:') ? "RFC #{key.delete_prefix('rfc:')}" : url.sub(%r{\Ahttps?://(www\.)?}i, '')
          type = key.start_with?('rfc:') ? 'rfc' : auto_type(url)
          site.data['auto_sources'][id] = {
            'id' => id,
            'type' => type,
            'title' => title,
            'publisher' => url[%r{\Ahttps?://(?:www\.)?([^/]+)}i, 1],
            'url' => url,
            'auto' => true
          }
        end

        # Every source that some post relies on, resolved once; `page_url` is
        # set only for sources that get a page, so other generators (the
        # connection map) can tell which ones they may link to.
        entries = {}
        index.each do |id, items|
          next if id.start_with?('post:')

          source = resolve(site, id)
          next unless source

          source = source.dup
          posts = items.map { |e| e['post'] }.uniq.size
          source['page_url'] = nil if source['auto'] && posts < AUTO_PAGE_MIN_POSTS
          source['page_url'] ||= "/sources/#{id}/" if source['auto'] && posts >= AUTO_PAGE_MIN_POSTS
          entries[id] = source
        end

        site.data['citation_index'] = index
        site.data['source_entries'] = entries
      end
    end

    # One page per source that has one (every registry source a post relies
    # on, and automatic sources listed by enough posts), plus the rows the
    # /sources/ tab (_tabs/sources.md) lists.
    class Generator < Jekyll::Generator
      safe true
      priority :low

      def generate(site)
        index = site.data['citation_index'] || {}
        entries = site.data['source_entries'] || {}
        rows = []
        single = []

        entries.each do |id, source|
          citations = index[id]
          groups = citations.group_by { |c| c['post'] }.map do |post, items|
            { 'post' => post, 'items' => items }
          end
          groups.sort_by! { |g| g['post'].date }.reverse!

          quotes = citations.count { |c| c['quote'] }
          row = source.merge('count' => quotes, 'post_count' => groups.size)
          unless source['page_url']
            single << row.merge('post' => groups.first['post'])
            next
          end

          rows << row
          site.pages << page(site, "sources/#{id}", {
            'layout' => 'page',
            'title' => source['title'],
            'source' => source,
            'citation_groups' => groups
          }, '{% include source-detail.html %}')
        end

        rows.sort_by! { |r| [-r['post_count'], -r['count'], r['title'].to_s.downcase] }
        single.sort_by! { |r| r['title'].to_s.downcase }
        site.data['citation_sources'] = rows
        site.data['single_post_sources'] = single
      end

      private

      def page(site, dir, data, content)
        page = Jekyll::PageWithoutAFile.new(site, site.source, dir, 'index.html')
        page.data.merge!(data)
        page.content = content
        page
      end
    end

    class Block < Liquid::Block
      def initialize(tag_name, markup, tokens)
        super
        @source_id, rest = markup.to_s.strip.split(/\s+/, 2)
        @args = Citations.parse_args(rest)
      end

      def render(context)
        site = context.registers[:site]
        quote, note = Citations.split_body(super)
        number = (context.registers[:citation_counter] || 0) + 1
        context.registers[:citation_counter] = number

        converter = site.find_converter_instance(Jekyll::Converters::Markdown)
        source = Citations.resolve(site, @source_id) || { 'id' => @source_id, 'title' => @source_id, 'missing' => true }

        html = context.stack do
          context['citation'] = {
            'anchor' => "cite-#{number}",
            'quote_html' => converter.convert(quote),
            'note_html' => note.empty? ? nil : converter.convert(note),
            'at' => @args['at'],
            'source' => source
          }
          Liquid::Template.parse('{% include citation-card.html %}').render!(context)
        end

        # The card goes back into a markdown document; blank lines would let
        # kramdown end the HTML block early.
        "\n#{html.gsub(/\n[ \t]*\n+/, "\n").strip}\n"
      end
    end
  end
end

Liquid::Template.register_tag('citation', Jekyll::Citations::Block)

Jekyll::Hooks.register :site, :post_read, priority: :low do |site|
  Jekyll::Citations.build(site)
end
