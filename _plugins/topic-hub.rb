#!/usr/bin/env ruby
# frozen_string_literal: true

# Builds the topic hub pages (`_topics/*.md`, rendered at /topics/<id>/).
#
# A topic lists the tags it covers. Every published post carrying one of those
# tags (compared case-insensitively) is attached to the topic and sorted into
# a section by where it lives:
#   own    - the author's own project and note posts
#   review - tech blog reviews (_posts/techblog)
#   talk   - conference talk reviews (_posts/conference)
# `featured` slugs are pinned to the top of their section, `posts` adds slugs
# that the tags miss, and `exclude` drops false positives. TIL and problem
# solving posts never join a hub.
#
# Results land in `topic.data['topic_sections']` for the layouts and in
# `post.data['topic_hubs']` so a post can link back to its hubs.

require 'set'

module Jekyll
  module TopicHub
    SKIP_PATHS = %r{\A_posts/(TIL|problemsolving)/}.freeze
    SECTION_KEYS = %w[own review talk].freeze

    class << self
      def normalize(value)
        value.to_s.downcase.gsub(/[^a-z0-9가-힣]+/, '')
      end

      def slug_of(post)
        post.url.to_s[%r{/posts/([^/]+)/?}, 1]
      end

      def section_of(post)
        rel = post.relative_path.to_s
        return 'review' if rel.start_with?('_posts/techblog/')
        return 'talk' if rel.start_with?('_posts/conference/')

        'own'
      end

      def matchers(topics)
        topics.map do |topic|
          [topic, {
            tags: Array(topic.data['tags']).map { |t| normalize(t) }.to_set,
            posts: Array(topic.data['posts']).map(&:to_s).to_set,
            exclude: Array(topic.data['exclude']).map(&:to_s).to_set,
            featured: Array(topic.data['featured']).map(&:to_s)
          }]
        end
      end

      def build(site)
        return if site.data['topic_hubs_ready']

        topics = site.collections['topics']&.docs || []
        if topics.empty?
          site.data['topic_hubs_ready'] = true
          return
        end

        index = matchers(topics)
        buckets = Hash.new { |h, k| h[k] = Hash.new { |h2, k2| h2[k2] = [] } }

        site.posts.docs.each do |post|
          next if post.relative_path.to_s =~ SKIP_PATHS

          slug = slug_of(post)
          post_tags = Array(post.data['tags']).map { |t| normalize(t) }
          hubs = []

          index.each do |topic, m|
            next if m[:exclude].include?(slug)
            next unless m[:posts].include?(slug) || post_tags.any? { |t| m[:tags].include?(t) }

            buckets[topic][section_of(post)] << post
            hubs << { 'id' => topic.data['topic_id'], 'title' => topic.data['title'], 'url' => topic.url }
          end

          post.data['topic_hubs'] = hubs unless hubs.empty?
        end

        index.each do |topic, m|
          sections = SECTION_KEYS.filter_map do |key|
            posts = buckets[topic][key]
            next if posts.empty?

            sorted = posts.sort_by do |post|
              pinned = m[:featured].index(slug_of(post))
              [pinned ? 0 : 1, pinned || 0, -post.date.to_i]
            end
            { 'key' => key, 'posts' => sorted, 'featured' => sorted.select { |p| m[:featured].include?(slug_of(p)) } }
          end

          topic.data['topic_sections'] = sections
          topic.data['topic_post_count'] = sections.sum { |s| s['posts'].size }
          topic.data['topic_counts'] = sections.to_h { |s| [s['key'], s['posts'].size] }
          topic.data['topic_featured'] = sections.flat_map { |s| s['featured'] }
          topic.data['topic_last_date'] = sections.flat_map { |s| s['posts'] }.map(&:date).max
        end

        site.data['topic_hubs_ready'] = true
      end
    end
  end
end

# Registered at the default priority so it runs after published-status-filter.rb
# (hidden posts never reach a hub) and before the :low hooks that read
# `topic_hubs`, such as related-posts.rb. `build` is idempotent, so calling it
# again from those hooks is a no-op.
Jekyll::Hooks.register :site, :post_read do |site|
  site.data['topic_hubs_ready'] = nil
  Jekyll::TopicHub.build(site)
end
