#!/usr/bin/env ruby
# frozen_string_literal: true

# Checks the external links in posts and reports the ones that no longer
# resolve. Reviews live or die by their `source_url`, and posts accumulate
# links that quietly rot, so this runs on a schedule rather than in the build
# (see .github/workflows/external-links.yml).
#
#   ruby scripts/check-external-links.rb [options]
#
#     --all                 include _posts/TIL and _posts/problemsolving too
#     --sources-only        only the `source_url` of reviews
#     --include-drafts      also check posts that are not published
#     --max-age DAYS        recheck cached results older than this (default 14)
#     --no-cache            ignore and do not write the cache
#     --concurrency N       parallel requests (default 8)
#     --out PATH            write the Markdown report here as well as stdout
#
# Exit status is 1 when a link is dead (404/410, DNS or connection failure).
# Hosts that answer 403/429 to a script, and transient 5xx or timeouts, are
# listed separately and do not fail the run.

require 'fileutils'
require 'json'
require 'net/http'
require 'optparse'
require 'time'
require 'uri'

ROOT = File.expand_path('..', __dir__)
CACHE_PATH = File.join(ROOT, '.cache', 'external-links.json')
SKIP_DIRS = ['_posts/TIL/', '_posts/problemsolving/'].freeze
# `[text](url)` targets are read first, so a URL may contain the parens that
# Wikipedia and MSDN use; whatever follows the closing paren stays out of it.
MD_LINK_RE = %r{\]\(\s*<?(https?://[^\s<>()]*(?:\([^\s<>()]*\)[^\s<>()]*)*)>?\s*(?:"[^"]*"|'[^']*')?\s*\)}
# A bare URL in prose keeps a balanced `(...)` group, so Wikipedia links
# survive, but stops at a paren that closes something it never opened.
BARE_URL_RE = %r{https?://[^\s<>"'`\]()]*(?:\([^\s<>"'`\]()]*\)[^\s<>"'`\]()]*)*}

# Illustrative or local hosts that appear inside code samples.
PLACEHOLDER_HOSTS = /\A(localhost|127\.0\.0\.1|0\.0\.0\.0|host\.docker\.internal|
                       .*\.(example|local|internal|test|invalid)|
                       example\.(com|org|net)|.*\.example\.(com|org|net)|
                       10\..*|192\.168\..*|172\.(1[6-9]|2[0-9]|3[01])\..*)\z/xi

# Hosts that answer a script with 404 or 403 while serving browsers normally.
# Their links cannot be verified here, so they are reported, not failed.
BOT_HOSTILE = ['www.acmicpc.net', 'acmicpc.net'].freeze
USER_AGENT = 'polynomeer-link-check/1.0 (+https://polynomeer.github.io)'
MAX_REDIRECTS = 5

options = {
  all: false, sources_only: false, drafts: false,
  max_age: 14, cache: true, concurrency: 8, out: nil
}
OptionParser.new do |opts|
  opts.on('--all') { options[:all] = true }
  opts.on('--sources-only') { options[:sources_only] = true }
  opts.on('--include-drafts') { options[:drafts] = true }
  opts.on('--max-age DAYS', Integer) { |v| options[:max_age] = v }
  opts.on('--no-cache') { options[:cache] = false }
  opts.on('--concurrency N', Integer) { |v| options[:concurrency] = v }
  opts.on('--out PATH') { |v| options[:out] = v }
end.parse!

# ---------------------------------------------------------------- collecting

Link = Struct.new(:url, :post, :source, keyword_init: true)

# Trailing sentence punctuation and markdown emphasis are not part of a URL,
# and neither is a closing paren the URL never opened.
def clean_url(url)
  url = url.sub(/[.,;:!?*_]+\z/, '')
  url = url[0..-2] while url.end_with?(')') && url.count(')') > url.count('(')
  url
end

def extract_urls(body)
  urls = []
  rest = body.gsub(MD_LINK_RE) do
    urls << Regexp.last_match(1)
    ' '
  end
  rest.scan(BARE_URL_RE) { |url| urls << url }
  urls.map { |url| clean_url(url) }
end

def skip_host?(host)
  host.nil? || host.empty? || !host.include?('.') || host.match?(PLACEHOLDER_HOSTS)
end

def front_matter_status(head)
  head[/^status: *(\w+)/m, 1]
end

def collect_links(options)
  links = []
  Dir.glob(File.join(ROOT, '_posts', '**', '*.{md,markdown}')).sort.each do |path|
    rel = path.sub("#{ROOT}/", '')
    next unless File.basename(path) =~ /\A\d{4}-\d{2}-\d{2}-/
    next if !options[:all] && SKIP_DIRS.any? { |d| rel.start_with?(d) }

    text = File.read(path, encoding: 'UTF-8')
    head, body = text.start_with?('---') ? text.split(/\n---\s*\n/, 2) : ['', text]
    status = front_matter_status(head)
    next if status && status != 'published' && !options[:drafts]

    if (source = head[/^source_url: *(\S+)/, 1])
      links << Link.new(url: clean_url(source.strip.delete('"\'')), post: rel, source: true)
    end
    next if options[:sources_only]

    extract_urls(body.to_s).each do |url|
      links << Link.new(url: url, post: rel, source: false)
    end
  end
  links.reject do |link|
    URI.parse(link.url).host.then { |host| skip_host?(host) }
  rescue URI::InvalidURIError
    true
  end
end

# ----------------------------------------------------------------- requesting

def classify(code)
  case code
  when 200..399 then :ok
  when 404, 410 then :dead
  when 401, 403, 405, 429, 999 then :blocked
  else :error
  end
end

def fetch(uri, method, limit = MAX_REDIRECTS)
  return [:error, 'too many redirects'] if limit.zero?

  redirected = limit < MAX_REDIRECTS

  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = uri.scheme == 'https'
  http.open_timeout = 10
  http.read_timeout = 15
  request = (method == :head ? Net::HTTP::Head : Net::HTTP::Get).new(uri, 'User-Agent' => USER_AGENT)
  response = http.request(request)

  case response
  when Net::HTTPRedirection
    location = response['location'].to_s
    return [:error, 'redirect without location'] if location.empty?

    fetch(URI.join(uri.to_s, location), method, limit - 1)
  else
    code = response.code.to_i
    # some servers answer HEAD with 403/404/405 and still serve the page
    return fetch(uri, :get, limit) if method == :head && [403, 404, 405, 501].include?(code)

    state = classify(code)
    state = :blocked if state == :dead && BOT_HOSTILE.include?(uri.host)
    [state, code.to_s]
  end
rescue SocketError => e
  # a broken redirect target is the server's problem, not a rotten link
  [redirected ? :error : :dead, "dns: #{e.message.split(' (').first}"]
rescue Errno::ECONNREFUSED, Errno::EHOSTUNREACH
  [redirected ? :error : :dead, 'connection refused']
rescue Net::OpenTimeout, Net::ReadTimeout
  [:blocked, 'timeout']
rescue OpenSSL::SSL::SSLError => e
  [:error, "ssl: #{e.message[0, 60]}"]
rescue StandardError => e
  [:error, "#{e.class}: #{e.message[0, 60]}"]
end

# Name lookups and connections fail for local reasons often enough that one
# failure is not evidence of a dead link.
def retryable?(state, detail)
  (state == :dead && detail.to_s.match?(/\A(dns|connection)/)) || detail == 'timeout'
end

def check(url, attempts = 2)
  uri = URI.parse(url)
  return [:error, 'not http'] unless uri.is_a?(URI::HTTP) && uri.host

  state, detail = fetch(uri, :head)
  if attempts > 1 && retryable?(state, detail)
    sleep 1
    return check(url, attempts - 1)
  end

  [state, detail]
rescue URI::InvalidURIError
  [:error, 'invalid url']
end

# --------------------------------------------------------------------- cache

def load_cache(options)
  return {} unless options[:cache] && File.exist?(CACHE_PATH)

  JSON.parse(File.read(CACHE_PATH))
rescue JSON::ParserError
  {}
end

def save_cache(cache, options)
  return unless options[:cache]

  FileUtils.mkdir_p(File.dirname(CACHE_PATH))
  File.write(CACHE_PATH, JSON.pretty_generate(cache))
end

# ----------------------------------------------------------------------- run

links = collect_links(options)
by_url = links.group_by(&:url)
cache = load_cache(options)
fresh_before = Time.now - (options[:max_age] * 86_400)

pending = by_url.keys.reject do |url|
  entry = cache[url]
  entry && entry['state'] == 'ok' && Time.parse(entry['checked_at']) > fresh_before
rescue ArgumentError
  false
end

warn "checking #{pending.size} of #{by_url.size} urls (#{links.size} references, #{by_url.keys.size - pending.size} cached)"

# One worker per host at a time keeps a single site from seeing a burst.
queue = Queue.new
pending.group_by { |url| URI.parse(url).host rescue url }.each_value { |urls| queue << urls }
results = {}
mutex = Mutex.new
done = 0

workers = Array.new([options[:concurrency], queue.size].min.clamp(1, 32)) do
  Thread.new do
    while (urls = (queue.pop(true) rescue nil))
      urls.each do |url|
        state, detail = check(url)
        mutex.synchronize do
          results[url] = { 'state' => state.to_s, 'detail' => detail, 'checked_at' => Time.now.utc.iso8601 }
          done += 1
          warn "  #{done}/#{pending.size}" if (done % 50).zero?
        end
        sleep 0.2
      end
    end
  end
end
workers.each(&:join)

cache.merge!(results)
save_cache(cache, options)

# -------------------------------------------------------------------- report

states = Hash.new { |h, k| h[k] = [] }
by_url.each_key do |url|
  entry = cache[url]
  next unless entry

  states[entry['state']] << [url, entry['detail']]
end

def section(title, rows, by_url)
  return '' if rows.empty?

  lines = ["\n## #{title} (#{rows.size})\n"]
  rows.sort_by { |url, _| url }.each do |url, detail|
    refs = by_url[url].sort_by(&:post)
    mark = refs.any?(&:source) ? ' **(review source)**' : ''
    lines << "- `#{detail}` #{url}#{mark}"
    refs.map(&:post).uniq.first(5).each { |post| lines << "  - #{post}" }
    lines << "  - ... #{refs.map(&:post).uniq.size - 5} more" if refs.map(&:post).uniq.size > 5
  end
  "#{lines.join("\n")}\n"
end

report = +"# External link check\n\n"
report << "Checked #{by_url.size} unique URLs from #{links.map(&:post).uniq.size} posts on #{Time.now.utc.strftime('%Y-%m-%d')}.\n\n"
report << "| state | count |\n| --- | --- |\n"
%w[ok dead blocked error].each { |s| report << "| #{s} | #{states[s].size} |\n" }
report << section('Dead links', states['dead'], by_url)
report << section('Transient or server errors', states['error'], by_url)
report << section('Blocked or rate limited (not a failure)', states['blocked'], by_url)

puts report
File.write(options[:out], report) if options[:out]

exit(states['dead'].empty? ? 0 : 1)
