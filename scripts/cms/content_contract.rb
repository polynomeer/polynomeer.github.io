#!/usr/bin/env ruby
# frozen_string_literal: true

# Reads every file under _posts, plus the dictionaries that classify them, and
# returns one record per file. Read-only: nothing here writes to a post, and the
# raw front matter text is carried along untouched so later stages can edit the
# YAML AST without reformatting the file.
#
# See docs/features/cms-content-contract.md for why this exists and what it is
# deliberately not doing.

require 'yaml'
require 'date'
require 'pathname'

module CMS
  module ContentContract
    # CMS_CONTENT_ROOT lets the checks run against a fixture tree instead of the
    # real repository, which is how the negative cases are tested without
    # putting deliberately broken posts into _posts.
    ROOT = File.expand_path(ENV.fetch('CMS_CONTENT_ROOT', File.expand_path('../..', __dir__)))
    POSTS_DIR = File.join(ROOT, '_posts')

    # AGENTS.md: `status` is the single editorial visibility field. Neither of
    # these appears anywhere in _posts today and both must stay out.
    FORBIDDEN_KEYS = %w[published draft].freeze

    DATE_PREFIX = /\A(\d{4})-(\d{2})-(\d{2})-/

    Record = Struct.new(
      :path, :kind, :slug, :date, :front_matter, :raw_front_matter, :body,
      :content_type, :status, :series, :series_order, :no_front_matter, :error,
      keyword_init: true
    )

    class << self
      DICTIONARIES = {
        '_topics' => 'topic_id',
        '_series_pages' => 'series_id',
        '_content_types' => 'content_type_id',
        '_post_statuses' => 'post_status_id'
      }.freeze

      def load
        {
          records: records,
          content_types: ids_in('_content_types', 'content_type_id'),
          statuses: ids_in('_post_statuses', 'post_status_id'),
          series: series_pages,
          topics: topics
        }
      end

      # Every *.md under _posts, in a stable order, whether or not Jekyll would
      # treat it as a post. Classifying the leftovers is the point.
      def records
        Dir.glob(File.join(POSTS_DIR, '**', '*.{md,markdown}')).sort.map do |path|
          build_record(path)
        end
      end

      # The four collections the contract validates posts against. The editor
      # lists and edits them from the same definition, so there is one place
      # that says what a dictionary is.
      def dictionary_entries
        DICTIONARIES.flat_map do |dir, key|
          collection_files(dir).filter_map do |path, front_matter|
            next unless front_matter[key]

            {
              'path' => path,
              'collection' => dir.delete_prefix('_'),
              'id' => front_matter[key].to_s,
              'title' => front_matter['title'].to_s
            }
          end
        end
      end

      private

      def relative(path)
        path.sub("#{ROOT}/", '')
      end

      def build_record(path)
        rel = relative(path)
        basename = File.basename(path, File.extname(path))
        type = rel.split('/')[1].to_s.downcase

        unless basename =~ DATE_PREFIX
          return Record.new(path: rel, kind: 'not-a-post', content_type: type)
        end

        text = File.read(path, encoding: 'UTF-8')

        # A date-prefixed file with no front matter still renders: Jekyll applies
        # the `defaults` from _config.yml and takes the title from the filename.
        # Fifteen of these are live on the site, so they are posts, not wreckage.
        # They have no status and no editable title, which is a problem for an
        # editor but not for the build - hence a warning, not an error.
        unless text.start_with?('---')
          return Record.new(
            path: rel, kind: 'post', content_type: type, no_front_matter: true,
            slug: basename.sub(DATE_PREFIX, ''), date: basename[DATE_PREFIX, 0].to_s.chomp('-'),
            front_matter: {}, body: text, status: 'published'
          )
        end

        raw, body = split_front_matter(text)

        begin
          data = YAML.safe_load(raw, permitted_classes: [Date, Time], aliases: false) || {}
        rescue StandardError => e
          return Record.new(path: rel, kind: 'broken', content_type: type,
                            raw_front_matter: raw,
                            error: "invalid YAML: #{e.message.lines.first.to_s.strip}")
        end

        unless data.is_a?(Hash)
          return Record.new(path: rel, kind: 'broken', content_type: type,
                            raw_front_matter: raw,
                            error: 'front matter is not a mapping')
        end

        Record.new(
          path: rel,
          kind: 'post',
          # Jekyll derives the URL from `slug` when present, otherwise from the
          # filename with the date stripped.
          slug: (data['slug'] || basename.sub(DATE_PREFIX, '')).to_s,
          date: basename[DATE_PREFIX, 0].to_s.chomp('-'),
          front_matter: data,
          raw_front_matter: raw,
          body: body,
          content_type: type,
          # published-status-filter.rb treats a missing or empty status as
          # published. Read it that way; never write it back into the file.
          status: blank?(data['status']) ? 'published' : data['status'].to_s.strip,
          series: data['series']&.to_s,
          series_order: data['series_order']
        )
      end

      def split_front_matter(text)
        head, body = text.split(/\n---\s*\n/, 2)
        [head.sub(/\A---\s*\n/, ''), body.to_s]
      end

      def blank?(value)
        value.nil? || value.to_s.strip.empty?
      end

      def collection_files(dir)
        Dir.glob(File.join(ROOT, dir, '*.md')).sort.filter_map do |path|
          text = File.read(path, encoding: 'UTF-8')
          next unless text.start_with?('---')

          front_matter = begin
            YAML.safe_load(text.split(/\n---\s*\n/, 2).first.sub(/\A---\s*\n/, ''),
                           permitted_classes: [Date, Time], aliases: false)
          rescue StandardError
            nil
          end
          next unless front_matter

          [Pathname.new(path).relative_path_from(Pathname.new(ROOT)).to_s, front_matter]
        end
      end

      def collection_front_matter(dir)
        collection_files(dir).map(&:last)
      end

      def ids_in(dir, key)
        collection_front_matter(dir).filter_map { |fm| fm[key]&.to_s }
      end

      def series_pages
        collection_front_matter('_series_pages').filter_map do |fm|
          next unless fm['series_id']

          [fm['series_id'].to_s, { 'title' => fm['title'].to_s, 'group' => fm['group'].to_s }]
        end.to_h
      end

      def topics
        collection_front_matter('_topics').filter_map do |fm|
          next unless fm['topic_id']

          [fm['topic_id'].to_s, {
            'tags' => Array(fm['tags']).map(&:to_s),
            'posts' => Array(fm['posts']).map(&:to_s),
            'featured' => Array(fm['featured']).map(&:to_s),
            'exclude' => Array(fm['exclude']).map(&:to_s)
          }]
        end.to_h
      end
    end
  end
end
