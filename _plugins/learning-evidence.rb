#!/usr/bin/env ruby
# frozen_string_literal: true

# Prepares _data/learning_evidence.yml for /learning-evidence/.
#
# Each item's `source_posts` and `related_posts` are paths; only the ones
# that are published posts survive, as `posts` and `followups` ({url, title,
# date}), so a hidden or moved post drops out instead of becoming a dead link.
# Source posts are ordered by date, the order they were written in. When three
# or more of an item's posts share a title prefix before ': ' (a series name,
# ignoring a trailing part number), `short` holds the title without it.
# An item also gets
#   year         - the year of its earliest source post, or the first year
#                  written in `period` when no source post is published
#   detail_url   - its page in the learning_evidence_items collection
#   lesson_share - `lessons` as a percentage of the longest course
#   sort_date    - the earliest source post's date (or 1 January of `year`),
#                  which orders items inside a year
#
# `learning_summary` on the data holds the totals the page opens with and the
# items per year, oldest first, empty years included, and `featured`: the
# item with the most source posts, which the panel shows first.

module Jekyll
  module LearningEvidence
    class << self
      def entry(post)
        { 'url' => post.url, 'title' => post.data['title'].to_s, 'date' => post.date }
      end

      def shorten(entries)
        base = ->(title) { title[/\A([^:]+?)\s*\d*:\s/, 1] }
        shared = entries.filter_map { |entry| base.call(entry['title']) }.tally.select { |_, count| count >= 3 }.keys
        entries.each do |entry|
          entry['short'] = if shared.include?(base.call(entry['title']))
                             entry['title'].sub(/\A[^:]+:\s/, '')
                           else
                             entry['title']
                           end
        end
      end

      def resolve(paths, by_path)
        Array(paths).filter_map { |path| by_path[path] }
      end

      def year_of(item, posts)
        first = posts.map(&:date).min
        return first.year if first

        item['period'].to_s[/\d{4}/].to_i
      end

      def summary(items)
        years = items.map { |item| item['year'] }.select(&:positive?)
        per_year = years.empty? ? [] : (years.min..years.max).map do |year|
          { 'year' => year, 'items' => items.select { |item| item['year'] == year } }
        end
        followups = items.flat_map { |item| item['followups'].map { |post| post['url'] } }.uniq

        {
          'courses' => items.count { |item| item['type'] == 'course' },
          'books' => items.count { |item| item['type'] == 'book' },
          'lessons' => items.select { |item| item['status'] == 'completed' }.sum { |item| item['lessons'].to_i },
          'courses_with_lessons' => items.count { |item| item['status'] == 'completed' && item['lessons'] },
          'books_completed' => items.count { |item| item['type'] == 'book' && item['status'] == 'completed' },
          'books_in_progress' => items.count { |item| item['type'] == 'book' && item['status'] == 'in_progress' },
          'posts' => items.sum { |item| item['posts'].size },
          'followups' => followups.size,
          'years' => per_year,
          'featured' => items.max_by { |item| item['posts'].size }&.fetch('id')
        }
      end
    end

    class Generator < Jekyll::Generator
      safe true
      priority :low

      def generate(site)
        data = site.data['learning_evidence']
        return unless data.is_a?(Hash) && data['items'].is_a?(Array)

        by_path = site.posts.docs.to_h { |post| [post.relative_path, post] }
        details = (site.collections['learning_evidence_items']&.docs || [])
                  .to_h { |doc| [doc.data['item_id'], doc.url] }
        longest = data['items'].filter_map { |item| item['lessons'] }.max

        data['items'].each do |item|
          sources = LearningEvidence.resolve(item['source_posts'], by_path).sort_by(&:date)
          item['posts'] = LearningEvidence.shorten(sources.map { |post| LearningEvidence.entry(post) })
          item['followups'] = LearningEvidence.shorten(
            LearningEvidence.resolve(item['related_posts'], by_path).map { |post| LearningEvidence.entry(post) }
          )
          item['year'] = LearningEvidence.year_of(item, sources)
          item['detail_url'] = details[item['id']]
          item['sort_date'] = (sources.map(&:date).min || Time.new(item['year'].clamp(1, 9999), 1, 1)).strftime('%Y-%m-%d')
          item['lesson_share'] = (item['lessons'] * 100.0 / longest).round if item['lessons'] && longest
        end

        data['learning_summary'] = LearningEvidence.summary(data['items'])
      end
    end
  end
end
