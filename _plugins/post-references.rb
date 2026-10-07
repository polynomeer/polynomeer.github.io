#!/usr/bin/env ruby
# frozen_string_literal: true

# Moves a post's reference sections out of the reading flow.
#
# Authors keep writing a `## 참고` list in markdown. After the post converts to
# HTML, every reference section (the headings the citations plugin reads:
# 참고, 참고 자료/링크/문헌/서적, 출처, References, Sources, at level 2 to 4) is
# cut out of the body and rendered once, at the end of the body, as a closed
# `<details>` box. Inside, links are split into external sources and posts on
# this blog, and every external link gets the same shape: title, then
# publisher, then the author's note if there was one.
#
# The markdown is left alone, so the citations plugin, backlinks and the source
# pages keep reading the same lists. See docs/features/post-references-design.md.

require 'nokogiri'
require 'cgi'

module Jekyll
  module PostReferences
    NAMES = /\A(?:참고(?:\s*(?:자료|링크|문헌|서적))?|출처|References?|Sources?)\z/i.freeze
    HEADING = %r{<h([2-4])\b[^>]*>(.*?)</h\1>}m.freeze
    EM_DASH = ' — '

    Item = Struct.new(:title, :href, :publisher, :note, :extras, :date, keyword_init: true)

    class << self
      def reset
        @publishers = nil
        @registry = nil
        @posts = nil
      end

      def locale(site, key, fallback)
        lang = site.config['lang'] || 'en'
        locales = site.data['locales'] || {}
        (locales.dig(lang, 'post', key) || locales.dig('en', 'post', key) || fallback).to_s
      end

      def text_of(html)
        CGI.unescapeHTML(html.to_s.gsub(/<[^>]+>/, '')).gsub(/\s+/, ' ').strip
      end

      # [start, finish] character ranges of every reference section, in order.
      def sections(html)
        found = []
        headings = html.to_enum(:scan, HEADING).map { Regexp.last_match }
        headings.each_with_index do |m, i|
          next unless text_of(m[2]).match?(NAMES)

          level = m[1].to_i
          ending = headings[(i + 1)..].find { |h| h[1].to_i <= level }
          found << [m.begin(0), m.end(0), ending ? ending.begin(0) : html.length]
        end
        found
      end

      def host_of(url)
        url.to_s[%r{\Ahttps?://([^/:?#]+)}i, 1].to_s.downcase.sub(/\Awww\./, '')
      end

      def publishers(site)
        @publishers ||= (site.data['publishers'] || {}).transform_keys { |k| k.to_s.downcase }
                                                        .sort_by { |k, _| -k.length }
      end

      # URL prefix -> publisher, from the registered sources.
      def registry(site)
        @registry ||= (site.data['sources'] || {}).filter_map do |_id, raw|
          next unless raw.is_a?(Hash) && raw['publisher']

          urls = [raw['url'], *Array(raw['url_prefix'])].compact
          urls.map { |u| [u.to_s.downcase.sub(%r{\Ahttps?://}, '').sub(/\Awww\./, ''), raw['publisher'].to_s] }
        end.flatten(1).sort_by { |prefix, _| -prefix.length }
      end

      def publisher_for(site, url)
        bare = url.to_s.downcase.sub(%r{\Ahttps?://}, '').sub(/\Awww\./, '')
        hit = registry(site).find { |prefix, _| !prefix.empty? && bare.start_with?(prefix) }
        return hit[1] if hit

        host = host_of(url)
        hit = publishers(site).find { |h, _| host == h || host.end_with?(".#{h}") }
        hit ? hit[1].to_s : host
      end

      def posts(site)
        @posts ||= site.posts.docs.to_h { |p| [p.url.chomp('/').downcase, p] }
      end

      def internal?(site, href)
        base = site.baseurl.to_s.chomp('/')
        path = href.to_s.sub(/\A#{Regexp.escape(base)}/, '') unless base.empty?
        (path || href).to_s.start_with?('/posts/')
      end

      def post_for(site, href)
        base = site.baseurl.to_s.chomp('/')
        path = base.empty? ? href.to_s : href.to_s.sub(/\A#{Regexp.escape(base)}/, '')
        posts(site)[path.sub(/[#?].*\z/, '').chomp('/').downcase]
      end

      # Text that follows the link inside the same list item: " — Pub: note",
      # ": note" or " (2025-07-17)".
      def split_rest(rest)
        rest = rest.to_s.strip
        return [nil, nil] if rest.empty?

        if rest.start_with?('—', '-', '–')
          body = rest.sub(/\A[—–-]\s*/, '')
          pub, note = body.split(/:\s+/, 2)
          return [pub.strip, note&.strip]
        end
        [nil, rest.sub(/\A[:,]\s*/, '')]
      end

      PUBLICATION = /\b(?:docs?|documentation|tutorials?|api|javadoc|blog|guide|manual|wiki|specification|reference|center|engineering|tech|news(?:room)?|journal|library|book)\b|기술\s*블로그|블로그|문서|공식/i.freeze

      def words(text)
        text.to_s.downcase.tr('.', ' ').scan(/[[:alnum:]]{3,}/)
      end

      # Whether `text` reads as the name of a publisher rather than a note
      # about the page: it shares a word with the publisher the host resolves
      # to, is a name the publisher map or the registry already uses, or names
      # a kind of publication (docs, blog, manual, 기술 블로그...).
      def publisher_like?(site, text, derived)
        head = text.to_s.split(/,\s+/, 2).first.to_s.strip
        return false if head.empty? || head.length > 48

        known = publishers(site).map { |_, v| v.to_s.downcase } + registry(site).map { |_, v| v.downcase }
        (words(head) & words(derived)).any? || known.include?(head.downcase) || head.match?(PUBLICATION)
      end

      # A trailing " - Publisher" inside the link text is moved out when it
      # reads as a publisher.
      def split_title(site, title, derived)
        m = title.match(/\A(.+?)\s+[-–|]\s+([^-–|]{2,48})\z/)
        return [title, nil] unless m

        tail = m[2].strip
        publisher_like?(site, tail, derived) ? [m[1].strip, tail] : [title, nil]
      end

      def items_from(site, fragment)
        external = []
        internal = []
        notes = []

        fragment.css('li, p').each do |node|
          next if node.name == 'p' && node.ancestors('li').any?

          own = node.dup
          own.css('ul, ol').each(&:remove)
          anchors = own.css('a[href]')
          if anchors.empty?
            text = own.text.gsub(/\s+/, ' ').strip
            if (url = text[%r{https?://[^\s()<>]+}])
              add_bare(site, url, external, text.sub(url, '').gsub(/[()]/, '').strip.sub(/\s*[:：-]\z/, '').strip)
            elsif !text.empty?
              notes << text
            end
            next
          end

          raw_label = own.children.take_while { |c| !(c.element? && c.name == 'a') }.map(&:text).join.strip
          # "Author, [Title](url)" names who wrote it; "설명: [Title](url)" is a note.
          author = raw_label.match?(/[:：]\z/) ? nil : raw_label.sub(/[,，]\z/, '').strip
          author = nil if author&.empty? || author.to_s.length > 48
          label = author ? '' : raw_label.sub(/[:：]\z/, '').strip
          first = anchors.first
          rest = first.xpath('following-sibling::node()').map(&:text).join
          short_extras = anchors.drop(1).all? { |a| a.text.strip.length <= 8 } && rest.include?('·')

          if anchors.size > 1 && !short_extras
            anchors.each { |a| add(site, a, label.empty? ? nil : label, nil, [], external, internal, author) }
            next
          end

          extras = short_extras ? anchors.drop(1).map { |a| [a.text.strip, a['href']] } : []
          rest = rest.split('·').first.to_s if short_extras
          add(site, first, label.empty? ? nil : label, rest, extras, external, internal, author)
        end
        [external, internal, notes]
      end

      # A URL written as plain text (kramdown does not autolink it), with any
      # words around it as the title.
      def add_bare(site, url, external, words = '')
        title = words.to_s.empty? ? pretty_url(url) : words
        external << Item.new(title: title, href: url, publisher: publisher_for(site, url), extras: [])
      end

      def pretty_url(url)
        CGI.unescape(url.sub(%r{\Ahttps?://(www\.)?}i, '').chomp('/'))
      rescue ArgumentError
        url
      end

      def add(site, anchor, label, rest, extras, external, internal, author = nil)
        href = anchor['href'].to_s
        title = anchor.text.gsub(/\s+/, ' ').strip
        pub, rest_note = split_rest(rest)
        join = ->(*parts) { parts.compact.map(&:strip).reject(&:empty?).join(' · ').then { |t| t.empty? ? nil : t } }

        if internal?(site, href)
          post = post_for(site, href)
          note = join.(author, label, [pub, rest_note].compact.join(': '))
          internal << Item.new(title: title, href: href, note: note, extras: extras, date: post&.date)
          return
        end

        derived = publisher_for(site, href)
        if pub && !publisher_like?(site, pub, derived)
          rest_note = [pub, rest_note].compact.join(': ')
          pub = nil
        end
        unless pub
          title, from_title = split_title(site, title, derived)
          pub = author || from_title || derived
        end
        external << Item.new(title: title, href: href, publisher: pub, note: join.(label, rest_note), extras: extras)
      end

      def esc(text)
        CGI.escapeHTML(text.to_s)
      end

      def render_item(item, external)
        attrs = external ? ' target="_blank" rel="noopener noreferrer"' : ''
        out = +%(<li class="post-references-item">)
        out << %(<span class="post-references-head">)
        out << %(<a class="post-references-link" href="#{esc(item.href)}"#{attrs}>#{esc(item.title)}</a>)
        item.extras.each do |text, href|
          out << %( <a class="post-references-extra" href="#{esc(href)}"#{attrs}>#{esc(text)}</a>)
        end
        out << '</span>'
        meta = external ? item.publisher : item.date&.strftime('%Y-%m-%d')
        out << %(<span class="post-references-meta">#{esc(meta)}</span>) if meta && !meta.to_s.empty?
        out << %(<span class="post-references-note">#{esc(item.note)}</span>) if item.note
        out << '</li>'
      end

      def render(site, external, internal, notes)
        ext_label = locale(site, 'references_external', 'External sources')
        int_label = locale(site, 'references_internal', 'Related posts on this blog')
        counts = []
        entry_notes = notes.count { |n| n.length <= 80 }
        counts << "#{ext_label} #{external.size + entry_notes}" if external.any? || entry_notes.positive?
        counts << "#{locale(site, 'references_internal_short', 'Posts')} #{internal.size}" if internal.any?

        out = +%(\n<details class="post-references" id="references">\n)
        out << %(<summary class="post-references-summary">)
        out << %(<i class="fas fa-book-open fa-fw" aria-hidden="true"></i>)
        out << %(<span class="post-references-title">#{esc(locale(site, 'references_title', 'References'))}</span>)
        out << %(<span class="post-references-count">#{esc(counts.join(' · '))}</span>)
        out << %(<i class="fas fa-chevron-down post-references-chevron" aria-hidden="true"></i></summary>\n)
        out << %(<div class="post-references-body">\n)
        # Long text under the heading is the author's lead-in, not an entry.
        intros, entries = notes.partition { |n| n.length > 80 }
        intros.each { |n| out << %(<p class="post-references-intro">#{esc(n)}</p>\n) }
        if external.any? || entries.any?
          out << %(<p class="post-references-group">#{esc(ext_label)}</p>\n<ul class="post-references-list">\n)
          external.each { |i| out << render_item(i, true) << "\n" }
          entries.each { |n| out << %(<li class="post-references-item"><span class="post-references-plain">#{esc(n)}</span></li>\n) }
          out << "</ul>\n"
        end
        if internal.any?
          out << %(<p class="post-references-group">#{esc(int_label)}</p>\n<ul class="post-references-list">\n)
          internal.each { |i| out << render_item(i, false) << "\n" }
          out << "</ul>\n"
        end
        out << "</div>\n</details>\n"
      end

      def process(doc)
        html = doc.content.to_s
        return unless html.match?(HEADING)

        found = sections(html)
        return if found.empty?

        site = doc.site
        external = []
        internal = []
        notes = []
        found.each do |_start, body_start, finish|
          fragment = Nokogiri::HTML5.fragment(html[body_start...finish])
          e, i, n = items_from(site, fragment)
          external.concat(e)
          internal.concat(i)
          notes.concat(n)
        end
        external.uniq!(&:href)
        internal.uniq! { |i| i.href.chomp('/') }

        # A `---` written right before the reference heading belonged to the
        # section that is moving out, so it goes with it.
        found.reverse_each do |start, _body, finish|
          hr = html[0...start].match(/<hr\s*\/?>\s*\z/)
          html[(hr ? hr.begin(0) : start)...finish] = ''
        end
        return doc.content = html if external.empty? && internal.empty? && notes.empty?

        doc.content = html.rstrip + render(site, external, internal, notes)
      end
    end
  end
end

Jekyll::Hooks.register :site, :pre_render do |_site|
  Jekyll::PostReferences.reset
end

Jekyll::Hooks.register :posts, :post_convert do |doc|
  Jekyll::PostReferences.process(doc)
end
