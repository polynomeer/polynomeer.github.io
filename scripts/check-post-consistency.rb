#!/usr/bin/env ruby
# frozen_string_literal: true

# Catches post front matter problems that surface as Jekyll build warnings:
#   - tags or categories that differ only by case/punctuation (they collide on
#     the same /tags/<slug>/ page)
#   - two posts that resolve to the same /posts/<slug>/ URL
#   - posts without front matter
#   - internal /posts/<slug>/ links whose target does not exist
#
# Exit status is 1 when a collision is found (the first two checks); the other
# findings are printed as warnings only. `--quiet` prints errors only, which is
# what the pre-commit hook uses. Run from the repository root:
#   ruby scripts/check-post-consistency.rb [--quiet]

require 'yaml'
require 'date'

POSTS_DIR = File.expand_path('../_posts', __dir__)
quiet = ARGV.include?('--quiet')

def slugify(value)
  value.to_s.downcase.gsub(/[^a-z0-9]+/, '-').gsub(/\A-|-\z/, '')
end

posts = []
no_front_matter = []

Dir.glob(File.join(POSTS_DIR, '**', '*.{md,markdown}')).sort.each do |path|
  rel = path.sub("#{File.dirname(POSTS_DIR)}/", '')
  # Jekyll only treats date-prefixed files as posts; anything else is ignored.
  next unless File.basename(path) =~ /\A\d{4}-\d{2}-\d{2}-/

  text = File.read(path, encoding: 'UTF-8')

  unless text.start_with?('---')
    no_front_matter << rel
    next
  end

  head, body = text.split(/\n---\s*\n/, 2)
  data = begin
    YAML.safe_load(head.sub(/\A---\s*\n/, ''), permitted_classes: [Date, Time]) || {}
  rescue StandardError => e
    warn "invalid front matter: #{rel} (#{e.message.lines.first.strip})"
    next
  end

  basename = File.basename(path, File.extname(path))
  slug = data['slug'] || basename.sub(/\A\d{4}-\d{2}-\d{2}-/, '')
  posts << {
    path: rel,
    slug: slug.to_s,
    status: (data['status'] || 'published').to_s,
    tags: Array(data['tags']).map(&:to_s),
    categories: Array(data['categories']).map(&:to_s),
    links: body.to_s.scan(%r{\(/posts/([a-z0-9\-]+)/?[)#?]}).flatten +
           body.to_s.scan(%r{href="/posts/([a-z0-9\-]+)/?["#?]}).flatten
  }
end

errors = []
warnings = []

# 1. tag / category variants that collide after slugifying
{ 'tag' => :tags, 'category' => :categories }.each do |label, key|
  variants = Hash.new { |h, k| h[k] = Hash.new { |h2, k2| h2[k2] = [] } }
  posts.each do |post|
    post[key].each { |value| variants[slugify(value)][value] << post[:path] }
  end
  variants.each do |slug, by_value|
    next if by_value.size < 2

    detail = by_value.map { |value, files| "#{value.inspect} (#{files.size}: #{files.first})" }.join(', ')
    errors << "#{label} variants collide on /#{label == 'tag' ? 'tags' : 'categories'}/#{slug}/: #{detail}"
  end
end

# 2. duplicate post slugs
posts.group_by { |post| post[:slug] }.each do |slug, group|
  next if group.size < 2

  errors << "slug '#{slug}' is shared by: #{group.map { |p| p[:path] }.join(', ')}"
end

# 3. posts without front matter
no_front_matter.each { |rel| warnings << "no front matter: #{rel}" }

# 4. internal links to posts that do not exist
known = posts.map { |post| post[:slug] }.to_a
hidden = posts.select { |post| post[:status] != 'published' }.map { |post| post[:slug] }
posts.each do |post|
  post[:links].uniq.each do |target|
    next if target == post[:slug]

    if !known.include?(target)
      warnings << "missing link target /posts/#{target}/ in #{post[:path]}"
    elsif hidden.include?(target) && post[:status] == 'published'
      warnings << "link to hidden post /posts/#{target}/ in #{post[:path]}"
    end
  end
end

puts "Post consistency: #{posts.size} posts checked" unless quiet
errors.each { |line| puts "ERROR   #{line}" }
warnings.each { |line| puts "warning #{line}" } unless quiet
puts "#{errors.size} error(s), #{warnings.size} warning(s)" if !quiet || !errors.empty?

exit(errors.empty? ? 0 : 1)
