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
        'connections' => connections(posts),
        'year' => year_summary(posts),
        'days' => day_grid(posts),
        'waffle' => waffle(types, posts.size),
        'treemap' => treemap(topics(posts)),
        'trend' => trend(posts)
      }
      site.data['blog_stats']['lengths'] = with_arcs(site.data['blog_stats']['lengths'])

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

    # The latest year at a glance: posts, days with a post, the longest run of
    # consecutive days, the busiest day and month, and the change on last year.
    def year_summary(posts)
      year = posts.map { |post| post.date.year }.max
      this_year = posts.select { |post| post.date.year == year }
      by_day = this_year.group_by { |post| post.date.to_date }.transform_values(&:size)
      days = by_day.keys.sort
      streak = best = days.empty? ? 0 : 1
      days.each_cons(2) do |a, b|
        streak = (b - a).to_i == 1 ? streak + 1 : 1
        best = [best, streak].max
      end
      busiest_day, busiest_count = by_day.max_by { |day, count| [count, day] } || [nil, 0]
      by_month = this_year.group_by { |post| post.date.month }.transform_values(&:size)
      busiest_month, busiest_month_count = by_month.max_by { |month, count| [count, -month] } || [nil, 0]
      last = posts.count { |post| post.date.year == year - 1 }
      {
        'year' => year,
        'posts' => this_year.size,
        'days' => days.size,
        'streak' => best,
        'busiest_day' => busiest_day && { 'month' => busiest_day.month, 'day' => busiest_day.day, 'key' => busiest_day.strftime('%m-%d'), 'count' => busiest_count },
        'busiest_month' => busiest_month && { 'month' => busiest_month, 'count' => busiest_month_count },
        'last_year' => last,
        'growth' => last.zero? ? nil : ((this_year.size - last) * 100.0 / last).round
      }
    end

    # The latest year as a calendar: one column per week (Monday first), one
    # cell per day. Days after the build date and outside the year are marked
    # so the grid keeps its shape.
    def day_grid(posts)
      year = posts.map { |post| post.date.year }.max
      counts = posts.select { |post| post.date.year == year }
                    .group_by { |post| post.date.to_date }.transform_values(&:size)
      today = @site.time.to_date
      first = Date.new(year, 1, 1)
      start = first - ((first.wday + 6) % 7)
      last = Date.new(year, 12, 31)
      weeks = []
      day = start
      while day <= last
        weeks << (0..6).map do |offset|
          date = day + offset
          next { 'blank' => true } unless date.year == year

          count = counts[date] || 0
          {
            'key' => date.strftime('%m-%d'),
            'month' => date.month,
            'day' => date.day,
            'count' => count,
            'level' => day_level(count),
            'future' => date > today
          }
        end
        day += 7
      end
      # a month label over the week that holds its first day
      months = weeks.each_with_index.filter_map do |week, index|
        cell = week.find { |c| !c['blank'] && c['day'] == 1 }
        { 'index' => index, 'month' => cell['month'] } if cell
      end
      { 'year' => year, 'weeks' => weeks, 'months' => months }
    end

    def day_level(count)
      case count
      when 0 then 0
      when 1 then 1
      when 2 then 2
      when 3..4 then 3
      when 5..6 then 4
      else 5
      end
    end

    # A hundred cells split by type (largest remainder, so they add up to 100).
    def waffle(types, total)
      return [] if total.zero?

      exact = types.map { |type| [type['name'], type['count'] * 100.0 / total] }
      cells = exact.map { |name, value| [name, value.floor, value - value.floor] }
      left = 100 - cells.sum { |_, floor, _| floor }
      cells.sort_by { |_, _, rest| -rest }.first(left).each { |cell| cell[1] += 1 }
      order = types.map { |type| type['name'] }
      cells.sort_by { |name, _, _| order.index(name) }
           .reject { |_, n, _| n.zero? }
           .map { |name, n, _| { 'name' => name, 'cells' => n } }
    end

    # Cumulative start and end percentages for the length donut.
    def with_arcs(lengths)
      total = lengths.sum { |entry| entry['count'] }
      at = 0.0
      lengths.map do |entry|
        from = at
        at += total.zero? ? 0 : entry['count'] * 100.0 / total
        entry.merge('from' => from.round(2), 'to' => at.round(2))
      end
    end

    # Topic counts as treemap rows: the two largest, the next three, the rest.
    # Each row's height follows its total; each tile's width follows its count.
    def treemap(topics)
      sizes = [2, 3]
      rows = []
      rest = topics.dup
      sizes.each { |n| rows << rest.shift(n) unless rest.empty? }
      rows << rest unless rest.empty?
      rows.map { |items| { 'weight' => items.sum { |item| item['count'] }, 'items' => items } }
    end

    # Posts per year as points on a 900x180 chart.
    def trend(posts)
      by_year = posts.group_by { |post| post.date.year }.transform_values(&:size).sort
      max = by_year.map(&:last).max.to_f
      step = by_year.size > 1 ? 798.0 / (by_year.size - 1) : 0
      by_year.each_with_index.map do |(year, count), index|
        {
          'year' => year,
          'count' => count,
          'x' => (40 + index * step).round,
          'y' => (150 - count / max * 130).round
        }
      end
    end

    def connections(posts)
      {
        'revised_posts' => posts.count { |post| post.data['revisions_total'].to_i.positive? },
        'revisions' => posts.sum { |post| post.data['revisions_total'].to_i },
        # post-backlinks.rb leaves the posts that link to a post in `backlinks`
        'cited_posts' => posts.count { |post| Array(post.data['backlinks']).any? },
        'citations' => posts.sum { |post| Array(post.data['backlinks']).size }
      }
    end
  end
end
