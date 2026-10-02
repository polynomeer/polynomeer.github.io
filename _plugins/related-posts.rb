#!/usr/bin/env ruby
# frozen_string_literal: true

# Precomputes the "related posts" recommendation for every post.
#
# The scoring used to live in _includes/related-posts.html, where each post
# looped over every other post in Liquid. At ~950 posts that was the single
# slowest part of the build (about 80 of 267 seconds). The scoring is the same
# here; only the place it runs changed, so the include just renders the result
# in `post.data['related_entries']`.
#
# The module is named RelatedRecommendations and writes `related_entries`
# because Jekyll already has a `Jekyll::RelatedPosts` class and a
# `Document#related_posts` (its LSI feature).
#
# Score per candidate:
#   same series                    +10
#   same portfolio project          +8
#   each shared topic hub           +2
#   each shared tag                 +1.5
#   each shared category            +0.75
# Candidates with a score of zero are dropped. Ties fall back to the same keys
# the Liquid version used (date, then position in site.posts compared as a
# string), so the ordering is unchanged.

module Jekyll
  module RelatedRecommendations
    SERIES_SCORE = 10.0
    PROJECT_SCORE = 8.0
    TOPIC_SCORE = 2.0
    TAG_SCORE = 1.5
    CATEGORY_SCORE = 0.75
    TOTAL_SIZE = 3

    class << self
      # site.posts as Liquid sees it: newest first (see Jekyll::Drops::SiteDrop).
      def ordered_posts(site)
        site.posts.docs.sort { |a, b| b <=> a }
      end

      # url -> [urls of every post in the same portfolio entry]
      def project_index(site)
        portfolio = site.data['portfolio']
        return {} unless portfolio && portfolio['enabled']

        series_members = Hash.new { |h, k| h[k] = [] }
        site.posts.docs.each do |post|
          series = post.data['series']
          series_members[series] << post.url if series
        end
        series_by_permalink = site.collections['series_pages']&.docs&.each_with_object({}) do |doc, acc|
          acc[doc.data['permalink']] = doc.data['series_id']
        end || {}

        index = {}
        items = Array(portfolio.dig('career', 'items')) + Array(portfolio.dig('personal', 'items'))
        items.each do |item|
          urls = []
          urls.concat(series_members[item['series']]) if item['series']
          Array(item['posts']).each do |url|
            if url.to_s.include?('/posts/')
              urls << url
            elsif (series_id = series_by_permalink[url])
              urls.concat(series_members[series_id])
            end
          end
          urls.uniq!

          # Every post reachable from this entry shares the entry's members,
          # and the first matching entry wins, as in the Liquid version.
          keys = Array(item['posts']) + (item['series'] ? series_members[item['series']] : [])
          keys.each do |key|
            resolved = key.to_s.include?('/posts/') ? [key] : series_members[series_by_permalink[key]].to_a
            resolved.each { |url| index[url] ||= urls }
          end
        end
        index
      end

      def build(site)
        started = Time.now
        # topic_hubs is set by topic-hub.rb; both hooks are :low priority, so
        # ask for it rather than relying on plugin load order.
        Jekyll::TopicHub.build(site) if defined?(Jekyll::TopicHub)
        posts = ordered_posts(site)
        projects = project_index(site)

        # Tie-break keys are built once per post: the Liquid version rebuilt
        # them for every candidate of every page, which is what made the Ruby
        # port slow in the first place.
        date_keys = posts.map { |post| post.date.strftime('%Y%m%d%H%M%S') }
        index_keys = Array.new(posts.size, &:to_s)

        # tag/category -> post indexes, so a candidate is only scored when it
        # actually shares something with the page.
        by_tag = Hash.new { |h, k| h[k] = [] }
        by_category = Hash.new { |h, k| h[k] = [] }
        by_series = Hash.new { |h, k| h[k] = [] }
        by_topic = Hash.new { |h, k| h[k] = [] }
        posts.each_with_index do |post, i|
          Array(post.data['tags']).each { |t| by_tag[t] << i }
          Array(post.data['categories']).each { |c| by_category[c] << i }
          by_series[post.data['series']] << i if post.data['series']
          # set by _plugins/topic-hub.rb, which runs before this hook
          Array(post.data['topic_hubs']).each { |hub| by_topic[hub['id']] << i }
        end

        posts.each_with_index do |page, page_index|
          scores = Hash.new(0.0)
          series_hits = {}
          project_hits = {}

          Array(page.data['tags']).each do |tag|
            by_tag[tag].each { |i| scores[i] += TAG_SCORE }
          end
          Array(page.data['categories']).each do |category|
            by_category[category].each { |i| scores[i] += CATEGORY_SCORE }
          end
          Array(page.data['topic_hubs']).each do |hub|
            by_topic[hub['id']].each { |i| scores[i] += TOPIC_SCORE }
          end
          if (series = page.data['series'])
            by_series[series].each do |i|
              scores[i] += SERIES_SCORE
              series_hits[i] = true
            end
          end
          Array(projects[page.url]).each do |url|
            i = index_of(posts, url)
            next unless i

            scores[i] += PROJECT_SCORE
            project_hits[i] = true
          end

          scores.delete(page_index)
          # Series neighbours already appear in the reading navigation.
          if page.data['series'] && page.data['series_order']
            members = by_series[page.data['series']].sort_by do |i|
              order = posts[i].data['series_order']
              [order.nil? ? 1 : 0, order || 0]
            end
            position = members.index(page_index)
            scores.delete(members[position - 1]) if position && position.positive?
            scores.delete(members[position + 1]) if position && position + 1 < members.size
          end
          if scores.empty?
            page.data['related_entries'] = []
            next
          end

          top = scores.max_by(TOTAL_SIZE) do |i, score|
            [(score * 100).round, date_keys[i], index_keys[i]]
          end

          page.data['related_entries'] = top.map do |i, _|
            same_series = series_hits[i] ? true : false
            {
              'post' => posts[i],
              'same_series' => same_series,
              'same_project' => (project_hits[i] && !same_series) ? true : false
            }
          end
        end

        if site.config['profile']
          Jekyll.logger.info 'Related posts:',
                             format('scored %d posts in %.2fs', posts.size, Time.now - started)
        end
      end

      def index_of(posts, url)
        @url_index ||= {}
        @url_index[posts.object_id] ||= posts.each_with_index.to_h { |post, i| [post.url, i] }
        @url_index[posts.object_id][url]
      end

      def reset
        @url_index = nil
      end
    end
  end
end

Jekyll::Hooks.register :site, :post_read, priority: :low do |site|
  Jekyll::RelatedRecommendations.reset
  Jekyll::RelatedRecommendations.build(site)
end
