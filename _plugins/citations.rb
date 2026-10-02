#!/usr/bin/env ruby
# frozen_string_literal: true

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
# At `site, :post_read` the markdown of every published post is scanned and the
# result lands in `site.data['citation_index']` (source id => citations) and
# `post.data['cited_sources']`. The generator below turns that into /sources/
# and /sources/<id>/. The block tag renders the card through
# `_includes/citation-card.html`. See docs/features/citation-design.md.

module Jekyll
  module Citations
    TAG_RE = /\{%-?\s*citation\s+(\S+)(.*?)-?%\}(.*?)\{%-?\s*endcitation\s*-?%\}/m.freeze
    ARG_RE = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/.freeze
    COMMENTARY_RE = /^[ \t]*<!--\s*commentary\s*-->[ \t]*$/.freeze

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

        raw = (site.data['sources'] || {})[id]
        return unless raw.is_a?(Hash)

        source = raw.merge('id' => id)
        source['url'] = source_url(source)
        source['page_url'] = "/sources/#{id}/"
        source
      end

      def build(site)
        index = Hash.new { |h, k| h[k] = [] }

        site.posts.docs.each do |post|
          cited = []
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
            cited << id unless cited.include?(id)
          end
          post.data['cited_sources'] = cited
        end

        site.data['citation_index'] = index
      end
    end

    # /sources/ and one page per registry source that is cited at least once.
    class Generator < Jekyll::Generator
      safe true
      priority :low

      def generate(site)
        index = site.data['citation_index'] || {}
        rows = []

        index.each do |id, citations|
          next if id.start_with?('post:')

          source = Citations.resolve(site, id)
          next unless source

          groups = citations.group_by { |c| c['post'] }.map do |post, items|
            { 'post' => post, 'items' => items }
          end
          groups.sort_by! { |g| g['post'].date }.reverse!

          rows << source.merge('count' => citations.size, 'post_count' => groups.size)
          site.pages << page(site, "sources/#{id}", {
            'layout' => 'page',
            'title' => source['title'],
            'source' => source,
            'citation_groups' => groups
          }, '{% include source-detail.html %}')
        end

        rows.sort_by! { |r| [-r['count'], r['title'].to_s.downcase] }
        site.pages << page(site, 'sources', {
          'layout' => 'page',
          'title' => 'Sources',
          'title_key' => 'sources',
          'sources' => rows
        }, '{% include sources-index.html %}')
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
