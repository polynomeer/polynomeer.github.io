#!/usr/bin/env ruby
# frozen_string_literal: true

# Collects, for each post, the other posts that link to it.
#
# Reviews end with questions that later project posts answer, and notes get
# cited by the posts that put them into practice. Those links only exist in one
# direction; this reads the markdown source of every published post, records
# each `/posts/<slug>/` reference, and hands the reverse list to
# `_includes/post-backlinks.html` as `post.data['backlinks']`.
#
# Unlike the tag-similarity recommendations in related-posts.rb, a backlink is
# something the author actually wrote, so there are no false matches. Links
# inside the same series are skipped because the series panel already lists
# them.

module Jekyll
  module PostBacklinks
    # `[text](/posts/slug/)` and the occasional raw href.
    LINK_RE = %r{(?:\]\(|href=")(/posts/[a-z0-9\-]+)/?[^)"]*(?:\)|")}i

    class << self
      def slug_of(url)
        url.to_s[%r{/posts/([^/]+)/?}, 1]
      end

      def build(site)
        posts = site.posts.docs
        by_slug = posts.to_h { |post| [slug_of(post.url), post] }
        cited = Hash.new { |h, k| h[k] = [] }

        posts.each do |post|
          seen = {}
          post.content.to_s.scan(LINK_RE) do |(path)|
            slug = slug_of(path)
            target = by_slug[slug]
            next if target.nil? || target.equal?(post) || seen[slug]
            # the series navigation already shows every part
            next if post.data['series'] && post.data['series'] == target.data['series']

            seen[slug] = true
            cited[slug] << post
          end
        end

        total_cited = cited.size
        total_citations = cited.values.sum(&:size)

        # Every citation is handed over, not a capped slice. The include shows a
        # few and folds the rest, so a cap here only produced a sentence saying
        # some posts existed with no way to reach them. The most-cited post has
        # 28, which is a few kilobytes of markup.
        posts.each do |post|
          citations = cited[slug_of(post.url)]
          post.data['backlinks'] = citations.sort_by { |citing| -citing.date.to_i }
        end

        return unless site.config['profile']

        Jekyll.logger.info 'Backlinks:',
                           "#{total_citations} citations to #{total_cited} posts"
      end
    end
  end
end

Jekyll::Hooks.register :site, :post_read, priority: :low do |site|
  Jekyll::PostBacklinks.build(site)
end
