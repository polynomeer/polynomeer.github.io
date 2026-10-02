#!/usr/bin/env ruby
# frozen_string_literal: true

# Data for the /connections/ page (_tabs/connections.md).
#
# Reads the links post-backlinks.rb and citations.rb already collected at
# `post_read`, so the map follows the same rules as the per-post lists:
# published posts only, no self links, no links inside a series. Produces
#   site.data['connection_map']        hubs, type-to-type flows, totals
#   /assets/js/data/connection-map.json nodes and edges for the neighbourhood view
# See docs/features/connection-map-design.md.

require 'json'

module Jekyll
  module ConnectionMap
    HUB_LIMIT = 15

    class Generator < Jekyll::Generator
      safe true
      priority :lowest

      def generate(site)
        type_of = lambda do |post|
          # An unregistered folder (`_posts/monticker`) keeps its own name; "기타"
          # would hide the one thing it is.
          dir = post.relative_path.to_s.split('/')[1].to_s.downcase
          dir.empty? ? 'other' : dir
        end
        slug_of = ->(post) { post.url.to_s[%r{/posts/([^/]+)/?}, 1] }

        # [citing post, cited post]
        links = site.posts.docs.flat_map do |target|
          Array(target.data['backlinks']).map { |source| [source, target] }
        end

        hubs = links.group_by(&:last).map do |target, pairs|
          from = pairs.map { |source, _| type_of.call(source) }.tally
                      .sort_by { |type, count| [-count, type] }
                      .map { |type, count| { 'type' => type, 'count' => count } }
          { 'post' => target, 'count' => pairs.size, 'from' => from }
        end
        hubs = hubs.sort_by { |hub| [-hub['count'], hub['post'].data['title'].to_s] }.first(HUB_LIMIT)

        flows = links.group_by { |source, target| [type_of.call(source), type_of.call(target)] }
                     .map { |(from, to), pairs| { 'from' => from, 'to' => to, 'count' => pairs.size } }
                     .sort_by { |flow| [-flow['count'], flow['from'], flow['to']] }
        across = flows.reject { |flow| flow['from'] == flow['to'] }
        within = flows.select { |flow| flow['from'] == flow['to'] }

        linked = links.flatten.uniq
        site.data['connection_map'] = {
          'hubs' => hubs,
          'flows_across' => across,
          'flows_within' => within,
          'max_across' => across.map { |flow| flow['count'] }.max || 0,
          'link_count' => links.size,
          'post_count' => linked.size,
          'published_count' => site.posts.docs.size
        }

        site.pages << json_page(site, graph(site, linked, links, type_of, slug_of))
      end

      private

      def graph(site, linked, links, type_of, slug_of)
        nodes = []
        index = {}
        add = lambda do |key, node|
          index[key] ||= begin
            nodes << node
            nodes.size - 1
          end
        end

        linked.sort_by { |post| -post.date.to_i }.each do |post|
          add.call(post, { 'id' => slug_of.call(post), 't' => post.data['title'].to_s,
                           'u' => post.url, 'k' => type_of.call(post) })
        end

        edges = links.map { |source, target| [index[source], index[target], 'link'] }

        # Only sources with a page (see citations.rb): a source node links there,
        # and the links one post alone lists would crowd the map.
        (site.data['source_entries'] || {}).each do |id, source|
          next unless source['page_url']

          citations = (site.data['citation_index'] || {})[id] || []
          citations.map { |c| c['post'] }.uniq.each do |post|
            from = add.call(post, { 'id' => slug_of.call(post), 't' => post.data['title'].to_s,
                                    'u' => post.url, 'k' => type_of.call(post) })
            to = add.call("source:#{id}", { 'id' => "source:#{id}", 't' => source['title'].to_s,
                                            'u' => source['page_url'], 'k' => 'source' })
            edges << [from, to, 'cite']
          end
        end

        { 'nodes' => nodes, 'edges' => edges }
      end

      def json_page(site, data)
        page = Jekyll::PageWithoutAFile.new(site, site.source, 'assets/js/data', 'connection-map.json')
        page.content = JSON.generate(data)
        page.data['layout'] = nil
        # Titles are data here; a '{{' in one must not run as Liquid.
        page.data['render_with_liquid'] = false
        page.data['sitemap'] = false
        page
      end
    end
  end
end
