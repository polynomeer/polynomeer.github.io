#!/usr/bin/env ruby
# frozen_string_literal: true

# Computes the figures behind /stats/.
#
# Everything is derived from `site.posts` after the status filter has run, so
# the numbers agree with what the site actually shows: a draft is not counted
# anywhere, and no figure is maintained by hand.
#
# This is a Generator rather than a `:site, :post_read` hook because it reads
# what the other plugins attach to posts -- topic hub membership, revisions,
# backlinks -- and generators run after every read hook regardless of the order
# the plugin files happen to load in.

module Jekyll
  class BlogStats < Generator
    priority :low

    TOP_TAGS = 12
    # A tag chart over every post is just the TIL log restated: `TIL` and `BOJ`
    # would take the top two rows and say nothing about the subject matter.
    TAG_EXCLUDED_TYPES = %w[til problemsolving].freeze
    # the length buckets are in reading minutes, which is what a reader feels;
    # the thresholds are where this archive actually separates
    LENGTH_BUCKETS = [
      ['note', 0, 3],
      ['short', 3, 8],
      ['long', 8, 20],
      ['deep', 20, nil]
    ].freeze
    WPM = 180

    # Jekyll's `number_of_words: 'auto'`, so the totals here add up to the
    # reading times printed on the posts themselves.
    CJK = /[\p{Han}\p{Katakana}\p{Hiragana}\p{Hangul}]/.freeze
    NON_CJK_WORD = /[^\p{Han}\p{Katakana}\p{Hiragana}\p{Hangul}\s]+/.freeze

    def generate(site)
      posts = site.posts.docs
      return if posts.empty?

      @site = site
      types = types(posts)

      site.data['blog_stats'] = {
        'totals' => totals(posts),
        'weeks' => weeks(posts),
        'type_by_year' => type_by_year(posts, types),
        'types' => types,
        'topics' => topics(posts),
        'tags' => top_tags(posts),
        'lengths' => lengths(posts),
        'sources' => sources(posts),
        'connections' => connections(posts)
      }

      return unless site.config['profile']

      Jekyll.logger.info 'Blog stats:',
                         "#{posts.size} posts over #{site.data['blog_stats']['totals']['years']} years"
    end

    private

    # `count` -> 0..4, the shading steps of the posting heatmap
    def level_of(count)
      case count
      when 0 then 0
      when 1..2 then 1
      when 3..4 then 2
      when 5..7 then 3
      else 4
      end
    end

    def with_share(pairs, total)
      max = pairs.map(&:last).max
      return [] if max.nil? || max.zero?

      pairs.map do |name, count|
        {
          'name' => name,
          'count' => count,
          'share' => (count * 100.0 / max).round,
          'of_total' => total.zero? ? 0 : (count * 100.0 / total).round
        }
      end
    end

    def read_minutes(post)
      words = word_count(post.content.to_s.gsub(/<[^>]+>/, ' '))
      minutes = words / WPM
      minutes.zero? ? 1 : minutes
    end

    def word_count(text)
      cjk = text.scan(CJK).length
      return text.split.length if cjk.zero?

      cjk + text.scan(NON_CJK_WORD).length
    end

    def type_of(post)
      post.relative_path.to_s.split('/')[1].to_s.downcase
    end

    def totals(posts)
      dates = posts.map(&:date)
      minutes = posts.sum { |post| read_minutes(post) }
      {
        'posts' => posts.size,
        'minutes' => minutes,
        'hours' => (minutes / 60.0).round,
        'years' => dates.map { |d| d.year }.uniq.size,
        'first_year' => dates.min.year,
        'last_year' => dates.max.year,
        'series' => posts.filter_map { |post| post.data['series'] }.uniq.size,
        'in_series' => posts.count { |post| post.data['series'] },
        'tags' => posts.flat_map { |post| Array(post.data['tags']) }.uniq.size,
        'tagged_posts' => posts.count { |post| !TAG_EXCLUDED_TYPES.include?(type_of(post)) },
        'topics' => @site.collections['topics']&.docs&.size || 0
      }
    end

    # One cell per week, which is the granularity this archive has: at roughly
    # a post every other day, a day grid would be almost entirely empty.
    def weeks(posts)
      by_year = Hash.new { |hash, key| hash[key] = Array.new(53, 0) }
      posts.each do |post|
        date = post.date.to_date
        by_year[date.year][[(date.yday - 1) / 7, 52].min] += 1
      end

      by_year.sort.map do |year, cells|
        {
          'year' => year.to_s,
          'total' => cells.sum,
          'cells' => cells.each_with_index.map do |count, index|
            { 'week' => index + 1, 'count' => count, 'level' => level_of(count) }
          end
        }
      end
    end

    # The bar's width is the year's share of the busiest year, so the row
    # carries both how much was written and what kind it was.
    def type_by_year(posts, types)
      order = types.map { |type| type['name'] }
      by_year = posts.group_by { |post| post.date.year }.sort
      busiest = by_year.map { |_, group| group.size }.max

      by_year.map do |year, group|
        counts = group.group_by { |post| type_of(post) }.transform_values(&:size)
        {
          'year' => year.to_s,
          'total' => group.size,
          'share' => (group.size * 100.0 / busiest).round,
          'parts' => order.filter_map do |id|
            { 'name' => id, 'count' => counts[id] } if counts[id]
          end
        }
      end
    end

    def types(posts)
      posts.group_by { |post| type_of(post) }.map do |type, group|
        minutes = group.map { |post| read_minutes(post) }.sort
        {
          'name' => type,
          'count' => group.size,
          'minutes' => minutes.sum,
          'median' => minutes[minutes.size / 2]
        }
      end.sort_by { |entry| -entry['count'] }
    end

    def topics(posts)
      counts = Hash.new(0)
      posts.each do |post|
        Array(post.data['topic_hubs']).each { |hub| counts[hub['id']] += 1 }
      end
      with_share(counts.sort_by { |name, count| [-count, name] }, posts.size)
    end

    def top_tags(posts)
      counts = Hash.new(0)
      tagged = 0
      posts.each do |post|
        next if TAG_EXCLUDED_TYPES.include?(type_of(post))

        tagged += 1
        Array(post.data['tags']).each { |tag| counts[tag] += 1 }
      end
      with_share(counts.sort_by { |tag, count| [-count, tag] }.first(TOP_TAGS), tagged)
    end

    def lengths(posts)
      counts = LENGTH_BUCKETS.to_h { |id, _, _| [id, 0] }
      posts.each do |post|
        minutes = read_minutes(post)
        id, = LENGTH_BUCKETS.find { |_, low, high| minutes >= low && (high.nil? || minutes < high) }
        counts[id] += 1
      end
      with_share(counts.to_a, posts.size)
    end

    # Which outside work the reviews are about. The second category of a
    # review post is the source, matching _data/tech_blogs.yml.
    def sources(posts)
      counts = Hash.new(0)
      reviews = 0
      posts.each do |post|
        categories = Array(post.data['categories'])
        next unless %w[TechBlog Conference].include?(categories.first) && categories[1]

        reviews += 1
        counts[categories[1]] += 1
      end
      with_share(counts.sort_by { |name, count| [-count, name] }, reviews)
    end

    def connections(posts)
      {
        'revised_posts' => posts.count { |post| post.data['revisions_total'].to_i.positive? },
        'revisions' => posts.sum { |post| post.data['revisions_total'].to_i },
        'cited_posts' => posts.count { |post| post.data['backlinks_total'].to_i.positive? },
        'citations' => posts.sum { |post| post.data['backlinks_total'].to_i }
      }
    end
  end
end
