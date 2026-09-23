#!/usr/bin/env ruby
# frozen_string_literal: true

# Attaches generated Open Graph images to posts, topic hubs and series pages.
#
# tools/og/generate.mjs renders assets/img/og/<slug>.jpg for published posts,
# assets/img/og/topics/<id>.jpg and assets/img/og/series/<id>.jpg for the
# curation pages (locally on demand, and in the deploy workflow before the
# Jekyll build). When the file exists and the document declares no `image` of
# its own, it gets `og_image` so head.html can emit it as og:image /
# twitter:image without turning it into an in-page preview image, which is
# what `image` would do.

module Jekyll
  module OgImage
    class << self
      def relative_path_for(doc)
        case doc.collection&.label
        when 'posts'
          slug = doc.url.to_s[%r{/posts/([^/]+)/?}, 1]
          "og/#{slug}.jpg" if slug
        when 'topics'
          id = doc.data['topic_id']
          "og/topics/#{id}.jpg" if id
        when 'series_pages'
          id = doc.data['series_id']
          "og/series/#{id}.jpg" if id
        end
      end
    end
  end
end

Jekyll::Hooks.register :documents, :pre_render do |doc|
  next if doc.data['image'] || doc.data['og_image']

  rel = Jekyll::OgImage.relative_path_for(doc)
  next unless rel

  doc.data['og_image'] = "/assets/img/#{rel}" if File.file?(File.join(doc.site.source, 'assets', 'img', rel))
end
