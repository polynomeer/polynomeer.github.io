#!/usr/bin/env ruby
# frozen_string_literal: true

# Enforces the Stage 0 content contract (docs/features/cms-content-contract.md).
#
# This is the half that has to fail the build. scripts/check-post-consistency.rb
# stays as it is and keeps its own checks - tag/category collisions, duplicate
# slugs, dangling internal links - but it prints a bare warning and exits 0 when
# a post's YAML does not parse, which is exactly the case a CMS cannot survive.
#
#   ruby scripts/cms/validate-content.rb           # report, exit 1 on error
#   ruby scripts/cms/validate-content.rb --quiet   # errors only
#   ruby scripts/cms/validate-content.rb --json    # the content index, no checks

require 'json'
require_relative 'content_contract'

model = CMS::ContentContract.load
records = model[:records]

if ARGV.include?('--json')
  index = records.map do |r|
    {
      path: r.path,
      kind: r.kind,
      slug: r.slug,
      date: r.date,
      contentType: r.content_type,
      registeredType: model[:content_types].include?(r.content_type),
      status: r.status,
      series: r.series,
      seriesOrder: r.series_order,
      title: r.front_matter && r.front_matter['title'],
      tags: r.front_matter ? Array(r.front_matter['tags']).map(&:to_s) : [],
      categories: r.front_matter ? Array(r.front_matter['categories']).map(&:to_s) : [],
      error: r.error
    }.compact
  end

  puts JSON.pretty_generate(
    generatedFrom: 'scripts/cms/validate-content.rb --json',
    counts: records.group_by(&:kind).transform_values(&:size),
    total: records.size,
    posts: index
  )
  exit 0
end

quiet = ARGV.include?('--quiet')
errors = []
warnings = []
posts = records.select { |r| r.kind == 'post' }

records.each do |r|
  errors << "#{r.path}: #{r.error}" if r.kind == 'broken'
end

posts.each do |r|
  if r.no_front_matter
    warnings << "#{r.path}: no front matter - renders with a filename title and no status"
    next
  end

  present = CMS::ContentContract::FORBIDDEN_KEYS.select { |k| r.front_matter.key?(k) }
  unless present.empty?
    errors << "#{r.path}: uses #{present.join(', ')} - status is the only visibility field (AGENTS.md)"
  end

  unless model[:statuses].include?(r.status)
    errors << "#{r.path}: status '#{r.status}' is not one of #{model[:statuses].sort.join(', ')}"
  end

  %w[categories tags].each do |key|
    value = r.front_matter[key]
    next if value.nil? || value.is_a?(Array)

    errors << "#{r.path}: #{key} must be a YAML array, got #{value.class}"
  end

  if r.series && !model[:series].key?(r.series)
    errors << "#{r.path}: series '#{r.series}' has no _series_pages entry"
  end

  # Zero is allowed on purpose: batch-structure-improvement opens with a
  # "Part 0" prologue and runs 0..5.
  if r.series_order && !(r.series_order.is_a?(Integer) && !r.series_order.negative?)
    errors << "#{r.path}: series_order must be a non-negative integer, got #{r.series_order.inspect}"
  end

  warnings << "#{r.path}: series '#{r.series}' without series_order" if r.series && r.series_order.nil?

  unless model[:content_types].include?(r.content_type)
    warnings << "#{r.path}: '#{r.content_type}' is not a registered content type"
  end
end

posts.select(&:series).group_by(&:series).each do |series, group|
  group.group_by(&:series_order).each do |order, same|
    next if order.nil? || same.size < 2

    errors << "series '#{series}' has #{same.size} posts at order #{order}: #{same.map(&:path).join(', ')}"
  end
end

known_slugs = posts.map(&:slug).to_set
model[:topics].each do |topic_id, topic|
  %w[posts featured exclude].each do |key|
    topic[key].each do |slug|
      next if known_slugs.include?(slug)

      errors << "_topics/#{topic_id}: #{key} references unknown slug '#{slug}'"
    end
  end
end

records.count { |r| r.kind == 'not-a-post' }.then do |n|
  warnings << "#{n} file(s) under _posts have no date prefix, so Jekyll ignores them" if n.positive?
end

errors.each { |line| puts "ERROR   #{line}" }
warnings.each { |line| puts "warning #{line}" } unless quiet

unless quiet
  counts = records.group_by(&:kind).transform_values(&:size)
  puts "indexed #{records.size} file(s): " \
       "#{counts.fetch('post', 0)} post, #{counts.fetch('not-a-post', 0)} not-a-post, " \
       "#{counts.fetch('broken', 0)} broken"
end
puts "#{errors.size} error(s), #{warnings.size} warning(s)" if !quiet || !errors.empty?

exit(errors.empty? ? 0 : 1)
