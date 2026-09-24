#!/usr/bin/env ruby
# frozen_string_literal: true

# Attaches each post's substantive edit history, read from git in a single pass.
#
# This replaces the upstream Chirpy `posts-lastmod-hook`, which ran
# `git rev-list` and then `git log` once per post -- about 2,400 subprocesses
# for this repository -- and produced only a modification date.
#
# Most commits that touch a post are site-wide maintenance: renaming a category
# across sixty files, merging tag spellings, repointing dead links. Listing
# those as revisions of the writing would be misleading, so a commit counts
# only when it changed at least SUBSTANTIVE_LINES lines of that file, and the
# commit that introduced the file is never a revision of it. What is left is
# roughly a hundred revisions across the whole archive, which is the honest
# number: most posts were written once and never touched again.
#
# Posts are keyed by slug rather than by path. The file name carries the
# publication date, so re-dating a post renames the file, and `--numstat`
# reports renames as `{old => new}` paths. The slug survives both, and
# scripts/check-post-consistency.rb already guarantees it is unique.

require 'set'
require 'time'

module Jekyll
  module PostRevisions
    SUBSTANTIVE_LINES = 6
    MAX_SHOWN = 10
    US = "\x1f"
    BASENAME_RE = /\A\d{4}-\d{2}-\d{2}-(.+)\.(?:md|markdown)\z/.freeze
    RENAME_RE = /\{[^{}]*? => ([^{}]*?)\}/.freeze

    class << self
      # `--numstat` writes a rename as `dir/{old => new}/name.md`, or as
      # `old => new` when the two paths share nothing.
      def destination_path(field)
        path = field.gsub(RENAME_RE, '\1')
        path.include?(' => ') ? path.split(' => ').last : path
      end

      def slug_of(field)
        BASENAME_RE.match(File.basename(destination_path(field)))&.[](1)
      end

      # git writes paths as bytes; Ruby tags the output US-ASCII, and the
      # Korean file names under _posts then break every later String call.
      def git_log(site)
        format = "@%H#{US}%aI#{US}%s"
        out = Dir.chdir(site.source) do
          IO.popen(['git', '-c', 'core.quotePath=false', 'log', '-M', '--no-merges',
                    "--pretty=format:#{format}", '--numstat', '--', '_posts'],
                   err: File::NULL, &:read)
        end
        return nil unless $?&.success?

        out.force_encoding('UTF-8')
      rescue StandardError => e
        Jekyll.logger.warn 'Post revisions:', "git history unavailable (#{e.class})"
        nil
      end

      # slug -> commits that touched it, newest first
      def history(site)
        log = git_log(site)
        return {} if log.nil? || log.empty?

        commits = Hash.new { |hash, key| hash[key] = [] }
        sha = date = subject = nil

        log.each_line do |line|
          line = line.chomp
          if line.start_with?('@')
            sha, date, subject = line[1..].split(US, 3)
            next
          end
          next if line.empty?

          added, deleted, field = line.split("\t", 3)
          # binary files report `-`; there are none under _posts, but the
          # format allows them
          next unless field && added.match?(/\A\d+\z/) && deleted.match?(/\A\d+\z/)

          slug = slug_of(field)
          next if slug.nil?

          commits[slug] << {
            'sha' => sha,
            'date' => date,
            'subject' => subject,
            'insertions' => added.to_i,
            'deletions' => deleted.to_i
          }
        end

        commits
      end

      def build(site)
        commits = history(site)
        return if commits.empty?

        revised = 0
        total = 0

        site.posts.docs.each do |post|
          slug = post.url.to_s[%r{/posts/([^/]+)/?}, 1] || slug_of(post.path)
          entries = commits[slug]
          next if entries.nil? || entries.size < 2

          # a commit that reaches one slug through more than one path moved the
          # file -- git reports the halves separately when it cannot pair them,
          # and a whole-file add is not a revision of the writing
          moved = entries.group_by { |commit| commit['sha'] }
                         .select { |_sha, touches| touches.size > 1 }
                         .keys.to_set

          # the oldest entry introduced the file; everything before it belongs
          # to whatever used to live at that path, not to this post
          revisions = entries[0..-2].reject { |commit| moved.include?(commit['sha']) }
                                    .select do |commit|
            commit['insertions'] + commit['deletions'] >= SUBSTANTIVE_LINES
          end
          next if revisions.empty?

          revisions = revisions.map do |commit|
            commit.merge('date' => Time.parse(commit['date']), 'short_sha' => commit['sha'][0, 7])
          end

          post.data['revisions'] = revisions.first(MAX_SHOWN)
          post.data['revisions_total'] = revisions.size
          post.data['last_modified_at'] = revisions.first['date']
          revised += 1
          total += revisions.size
        end

        return unless site.config['profile']

        Jekyll.logger.info 'Post revisions:', "#{total} revisions across #{revised} posts"
      end
    end
  end
end

Jekyll::Hooks.register :site, :post_read, priority: :low do |site|
  Jekyll::PostRevisions.build(site)
end
