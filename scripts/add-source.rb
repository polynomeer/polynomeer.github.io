#!/usr/bin/env ruby
# frozen_string_literal: true

# Drafts a `_data/sources.yml` entry from a URL, for the `citation` block tag
# (docs/features/citation-design.md).
#
#   ruby scripts/add-source.rb <url> [--id ID] [--type TYPE] [--write] [--offline]
#
# What it reads, by URL shape:
#   RFC      datatracker.ietf.org / rfc-editor.org  -> type rfc, number, title
#   GitHub   github.com/<o>/<r>/blob/<ref>/<path>#L1-L9
#                                                   -> type code, repo, commit, path, lines
#            a branch or tag ref is resolved to its commit so the quote stays pinned
#   DOI      doi.org/<doi> or a bare 10.xxxx/...    -> type paper, authors, journal, date
#   YouTube  youtube.com / youtu.be                 -> type video, title, channel
#   other    the page's og:/meta tags and <title>   -> type article
#
# Without --write the entry is printed for review. With --write it is appended
# to _data/sources.yml. A URL that is already registered prints the existing id
# instead. --offline skips the network and fills only what the URL itself says.

require 'json'
require 'net/http'
require 'uri'
require 'yaml'
require 'date'
require 'cgi'

SOURCES = File.expand_path('../_data/sources.yml', __dir__)
TYPES = %w[book article web paper video talk doc rfc code].freeze
FIELD_ORDER = %w[type title author publisher published url number doi isbn repo commit path lines].freeze

def usage!(message = nil)
  warn message if message
  warn 'usage: ruby scripts/add-source.rb <url> [--id ID] [--type TYPE] [--write] [--offline]'
  exit 2
end

def parse_args(argv)
  opts = { write: false, offline: false }
  rest = []
  until argv.empty?
    arg = argv.shift
    case arg
    when '--write' then opts[:write] = true
    when '--offline' then opts[:offline] = true
    when '--id' then opts[:id] = argv.shift || usage!('--id needs a value')
    when '--type' then opts[:type] = argv.shift || usage!('--type needs a value')
    when '-h', '--help' then usage!
    else rest << arg
    end
  end
  usage! if rest.size != 1
  usage!("unknown type '#{opts[:type]}' (#{TYPES.join(', ')})") if opts[:type] && !TYPES.include?(opts[:type])
  opts.merge(url: rest.first.strip)
end

# --- network ---------------------------------------------------------------

def fetch(url, accept: 'text/html', limit: 5)
  raise "too many redirects: #{url}" if limit.zero?

  uri = URI(url)
  Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == 'https', open_timeout: 8, read_timeout: 12) do |http|
    req = Net::HTTP::Get.new(uri)
    req['User-Agent'] = 'polynomeer-blog add-source (+https://polynomeer.github.io)'
    req['Accept'] = accept
    res = http.request(req)
    case res
    when Net::HTTPRedirection
      fetch(URI.join(url, res['location']).to_s, accept: accept, limit: limit - 1)
    when Net::HTTPSuccess
      body = res.body.to_s
      body.force_encoding(res.type_params['charset'] || 'UTF-8')
      body.encode('UTF-8', invalid: :replace, undef: :replace)
    else
      raise "#{res.code} #{res.message} for #{url}"
    end
  end
end

def try_fetch(url, **kw)
  fetch(url, **kw)
rescue StandardError => e
  warn "warning: could not fetch #{url} (#{e.message})"
  nil
end

# --- HTML metadata -----------------------------------------------------------

def meta(html, *names)
  names.each do |name|
    [
      /<meta[^>]+(?:property|name)=["']#{Regexp.escape(name)}["'][^>]*content=["']([^"']*)["']/i,
      /<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']#{Regexp.escape(name)}["']/i
    ].each do |re|
      value = html[re, 1]
      return clean(value) if value && !value.strip.empty?
    end
  end
  nil
end

def html_title(html)
  value = html[%r{<title[^>]*>(.*?)</title>}im, 1]
  value && clean(value)
end

def clean(text)
  CGI.unescapeHTML(text.to_s).gsub(/\s+/, ' ').strip
end

def date_only(value)
  return nil if value.to_s.empty?

  Date.parse(value.to_s)
rescue ArgumentError
  nil
end

# --- per-site readers ----------------------------------------------------------

def rfc_entry(url, number, offline)
  entry = { 'type' => 'rfc', 'number' => number.to_i, 'publisher' => 'IETF',
            'url' => "https://datatracker.ietf.org/doc/html/rfc#{number}" }
  entry['title'] = "RFC #{number}"
  return entry if offline

  html = try_fetch(entry['url'])
  title = html && (meta(html, 'og:title', 'DC.Title') || html_title(html))
  # datatracker titles read "RFC 9110 - HTTP Semantics"
  title = title.to_s.sub(/\ARFC\s*#{number}\s*[-:–]\s*/i, '').strip
  entry['title'] = "RFC #{number} #{title}".strip unless title.empty?
  date = html && meta(html, 'DC.Date.Issued', 'citation_publication_date')
  entry['published'] = date_only(date) if date
  entry
rescue StandardError
  entry
end

def github_entry(owner, repo, ref, path, fragment, offline)
  entry = { 'type' => 'code', 'title' => File.basename(path), 'author' => "#{owner}/#{repo}",
            'repo' => "#{owner}/#{repo}", 'commit' => ref, 'path' => path }
  if (m = fragment.to_s.match(/\AL(\d+)(?:-L(\d+))?\z/))
    entry['lines'] = m[2] ? "#{m[1]}-#{m[2]}" : m[1]
  end

  unless ref.match?(/\A[0-9a-f]{40}\z/)
    sha = nil
    unless offline
      body = try_fetch("https://api.github.com/repos/#{owner}/#{repo}/commits/#{CGI.escape(ref)}",
                       accept: 'application/vnd.github+json')
      sha = body && JSON.parse(body)['sha']
    end
    if sha
      warn "note: pinned ref '#{ref}' to commit #{sha}"
      entry['commit'] = sha
    else
      warn "warning: '#{ref}' is a branch or tag, not a commit; the quote will drift if it moves"
    end
  end
  entry
end

def doi_entry(doi, offline)
  entry = { 'type' => 'paper', 'title' => doi, 'doi' => doi, 'url' => "https://doi.org/#{doi}" }
  return entry if offline

  body = try_fetch(entry['url'], accept: 'application/vnd.citationstyles.csl+json')
  return entry unless body

  csl = JSON.parse(body)
  title = clean(Array(csl['title']).first)
  subtitle = clean(Array(csl['subtitle']).first)
  title = "#{title}: #{subtitle}" unless subtitle.empty? || title.include?(subtitle)
  entry['title'] = title unless title.empty?
  authors = Array(csl['author']).map { |a| [a['given'], a['family']].compact.join(' ') }.reject(&:empty?)
  entry['author'] = authors.size > 3 ? "#{authors.first} et al." : authors.join(', ') unless authors.empty?
  container = Array(csl['container-title']).first
  entry['publisher'] = clean(container) if container && !container.empty?
  parts = csl.dig('issued', 'date-parts', 0)
  entry['published'] = Date.new(*(parts + [1, 1]).first(3).map(&:to_i)) if parts&.first
  entry
rescue JSON::ParserError
  entry
end

def youtube_entry(url, offline)
  uri = URI(url)
  query = URI.decode_www_form(uri.query.to_s).to_h
  id = uri.host.to_s.end_with?('youtu.be') ? uri.path.delete_prefix('/') : query['v']
  canonical = id ? "https://www.youtube.com/watch?v=#{id}" : url
  entry = { 'type' => 'video', 'title' => canonical, 'publisher' => 'YouTube', 'url' => canonical }
  warn "note: dropped the timestamp; put it on the citation as at=\"#{query['t']}\"" if query['t']
  return entry if offline

  body = try_fetch("https://www.youtube.com/oembed?format=json&url=#{CGI.escape(canonical)}",
                   accept: 'application/json')
  return entry unless body

  data = JSON.parse(body)
  entry['title'] = clean(data['title']) if data['title']
  entry['author'] = clean(data['author_name']) if data['author_name']
  entry
rescue JSON::ParserError
  entry
end

def page_entry(url, offline)
  entry = { 'type' => 'article', 'title' => url, 'url' => url }
  return entry if offline

  html = try_fetch(url)
  return entry unless html

  entry['title'] = meta(html, 'og:title', 'twitter:title') || html_title(html) || url
  author = meta(html, 'author', 'article:author', 'citation_author')
  entry['author'] = author if author && author !~ %r{\Ahttps?://}
  site = meta(html, 'og:site_name')
  entry['publisher'] = site if site
  # Only tags that mean "first published"; a bare `date` is often the last edit.
  published = meta(html, 'article:published_time', 'citation_publication_date')
  entry['published'] = date_only(published) if published

  # Reference docs are living pages; their "published" stamp is the last build.
  uri = URI(url)
  if uri.host.to_s.start_with?('docs.') || uri.path.match?(%r{/(docs|documentation|reference|manual)/}i)
    entry['type'] = 'doc'
    entry.delete('published')
  end
  entry
end

def draft(url, offline)
  url = "https://doi.org/#{url}" if url.match?(%r{\A10\.\d{4,9}/\S+\z})
  uri = URI(url)
  host = uri.host.to_s.downcase.delete_prefix('www.')

  if (m = url.match(%r{(?:datatracker\.ietf\.org/doc/(?:html/)?|rfc-editor\.org/rfc/|ietf\.org/rfc/)rfc(\d+)}i))
    rfc_entry(url, m[1], offline)
  elsif host == 'github.com' && (m = uri.path.match(%r{\A/([^/]+)/([^/]+)/blob/([^/]+)/(.+)\z}))
    github_entry(m[1], m[2], m[3], m[4], uri.fragment, offline)
  elsif %w[doi.org dx.doi.org].include?(host)
    doi_entry(CGI.unescape(uri.path.delete_prefix('/')), offline)
  elsif host.end_with?('youtube.com') || host == 'youtu.be'
    youtube_entry(url, offline)
  else
    page_entry(url, offline)
  end
rescue URI::InvalidURIError
  usage!("not a URL: #{url}")
end

# --- registry ------------------------------------------------------------------

def normalize_url(url)
  url.to_s.strip.downcase.sub(%r{\Ahttps?://}, '').sub(/\Awww\./, '').sub(/[#?].*\z/, '').chomp('/')
end

def slugify(text)
  text.to_s.downcase.gsub(/[^a-z0-9]+/, '-').gsub(/\A-+|-+\z/, '').split('-').first(6).join('-')
end

def suggest_id(entry, url)
  base = case entry['type']
         when 'rfc' then "rfc-#{entry['number']}"
         when 'code' then slugify("#{entry['repo'].to_s.split('/').last} #{File.basename(entry['path'].to_s, '.*')}")
         else
           who = entry['author'].to_s.sub(/\s+et al\.?\z/, '').split(',').first.to_s.split.last ||
                 entry['publisher'].to_s.split.first
           who = nil if entry['title'] == url
           slugify([who, entry['title'].to_s.sub(/\A[\d.\s]+/, '')].compact.join(' '))
         end
  base = '' if entry['title'] == url
  base = slugify(URI(url).host.to_s.delete_prefix('www.') + ' ' + URI(url).path) if base.empty?
  base.empty? ? 'source' : base
end

def unique_id(id, registry)
  return id unless registry.key?(id)

  n = 2
  n += 1 while registry.key?("#{id}-#{n}")
  "#{id}-#{n}"
end

def to_yaml_block(id, entry)
  lines = ["#{id}:"]
  ordered = FIELD_ORDER.select { |k| entry.key?(k) } + (entry.keys - FIELD_ORDER)
  ordered.each do |key|
    value = entry[key]
    next if value.nil? || value.to_s.empty?

    # Dump each scalar through YAML so titles with ':' or quotes stay valid.
    dumped = { key => value }.to_yaml(line_width: -1).sub(/\A---\n/, '').strip
    lines << dumped.gsub(/^/, '  ')
  end
  lines.join("\n")
end

opts = parse_args(ARGV.dup)
registry = File.exist?(SOURCES) ? (YAML.safe_load(File.read(SOURCES), permitted_classes: [Date]) || {}) : {}

entry = draft(opts[:url], opts[:offline])
entry['type'] = opts[:type] if opts[:type]

target = normalize_url(entry['url'] || opts[:url])
existing = registry.find { |_, s| s.is_a?(Hash) && !target.empty? && normalize_url(s['url']) == target }
if existing
  puts "already registered as '#{existing.first}'"
  exit 0
end

id = opts[:id] || unique_id(suggest_id(entry, opts[:url]), registry)
usage!("id '#{id}' is already in #{File.basename(SOURCES)}") if opts[:id] && registry.key?(id)
usage!("id '#{id}' must be kebab-case") unless id.match?(/\A[a-z0-9]+(?:-[a-z0-9]+)*\z/)

block = to_yaml_block(id, entry)
YAML.safe_load(block, permitted_classes: [Date]) # refuse to write something unparsable

if opts[:write]
  text = File.exist?(SOURCES) ? File.read(SOURCES) : ''
  File.write(SOURCES, "#{text.rstrip}\n\n#{block}\n")
  puts "added '#{id}' to #{SOURCES.sub("#{Dir.pwd}/", '')}"
  puts "cite it with: {% citation #{id} %} ... {% endcitation %}"
else
  puts block
  puts
  puts "# review, then rerun with --write (or paste into _data/sources.yml)"
end
