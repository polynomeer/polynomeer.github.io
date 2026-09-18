#!/usr/bin/env ruby
# frozen_string_literal: true

# Keeps internal post links from turning into 404s.
#
# After a page or document renders, every `<a href="/posts/<slug>/">` is
# checked against the posts that actually exist in this build:
#   - link to a hidden post (status other than published) -> unlinked, marked
#     with the `post.link_hidden` locale text
#   - link to a post that does not exist at all       -> unlinked, marked with
#     `post.link_missing`, and reported as a build warning
# Published posts are left untouched. When drafts are shown locally
# (JEKYLL_SHOW_DRAFTS), hidden posts are real pages and stay linked.

require 'set'

module Jekyll
  module PostLinkGuard
    ANCHOR = %r{<a\b(?<before>[^>]*?)href="(?<href>[^"]*?/posts/[^"#?]+/?)(?<rest>[^"]*)"(?<after>[^>]*)>(?<inner>.*?)</a>}m.freeze

    class << self
      def missing
        @missing ||= Hash.new { |h, k| h[k] = [] }
      end

      def reset
        @missing = nil
        @index = nil
      end

      def index_for(site)
        @index ||= begin
          base = site.baseurl.to_s.sub(%r{/\z}, '')
          published = site.posts.docs.map { |p| normalize(p.url, base) }.to_set
          hidden = Array(site.data['hidden_post_urls']).map { |u| normalize(u, base) }.to_set
          hidden -= published if site.data['showing_drafts']
          { base: base, published: published, hidden: hidden }
        end
      end

      def normalize(url, base)
        path = url.to_s
        path = path.sub(/\A#{Regexp.escape(base)}/, '') unless base.empty?
        path = path.sub(%r{/index\.html\z}, '/')
        path.end_with?('/') ? path : "#{path}/"
      end

      def label(site, key)
        lang = site.config['lang'] || 'en'
        locales = site.data['locales'] || {}
        (locales.dig(lang, 'post', key) || locales.dig('en', 'post', key) || '').to_s
      end

      def html_output?(doc)
        doc.output_ext == '.html' && doc.output.is_a?(String)
      end

      def guard(doc)
        site = doc.site
        return unless html_output?(doc)
        return unless doc.output.include?('/posts/')

        index = index_for(site)
        hidden_label = label(site, 'link_hidden')
        missing_label = label(site, 'link_missing')
        source = doc.respond_to?(:relative_path) ? doc.relative_path : doc.path

        doc.output = doc.output.gsub(ANCHOR) do
          m = Regexp.last_match
          path = normalize(m[:href], index[:base])
          next m[0] unless path.start_with?('/posts/')
          next m[0] if index[:published].include?(path)

          if index[:hidden].include?(path)
            unlink(m, 'hidden', hidden_label, path)
          else
            missing[path] << source unless missing[path].include?(source)
            unlink(m, 'missing', missing_label, path)
          end
        end
      end

      def unlink(match, kind, label, path)
        mark = label.empty? ? '' : %( <small class="post-link-unavailable-mark">#{label}</small>)
        %(<span class="post-link-unavailable post-link-unavailable-#{kind}" data-post-url="#{path}">#{match[:inner]}#{mark}</span>)
      end

      def report
        return if missing.empty?

        missing.sort.each do |path, sources|
          Jekyll.logger.warn 'Post link:', "#{path} does not exist (linked from #{sources.join(', ')})"
        end
        Jekyll.logger.warn 'Post link:', "#{missing.size} missing post link target(s) were unlinked"
      end
    end
  end
end

Jekyll::Hooks.register :site, :post_read do |_site|
  Jekyll::PostLinkGuard.reset
end

Jekyll::Hooks.register :documents, :post_render do |doc|
  Jekyll::PostLinkGuard.guard(doc)
end

Jekyll::Hooks.register :pages, :post_render do |page|
  Jekyll::PostLinkGuard.guard(page)
end

Jekyll::Hooks.register :site, :post_write do |_site|
  Jekyll::PostLinkGuard.report
end
