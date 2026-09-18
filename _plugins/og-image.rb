#!/usr/bin/env ruby
# frozen_string_literal: true

# Attaches generated Open Graph images to posts.
#
# tools/og/generate.mjs renders assets/img/og/<slug>.jpg for published posts
# (locally on demand, and in the deploy workflow before the Jekyll build).
# When that file exists and the post declares no `image`, the post gets
# `og_image` so head.html can emit it as og:image / twitter:image without
# turning it into the in-post preview image that `image` would produce.

Jekyll::Hooks.register :posts, :pre_render do |post|
  next if post.data['image'] || post.data['og_image']

  slug = post.url.to_s[%r{/posts/([^/]+)/?}, 1]
  next unless slug

  file = File.join(post.site.source, 'assets', 'img', 'og', "#{slug}.jpg")
  post.data['og_image'] = "/assets/img/og/#{slug}.jpg" if File.file?(file)
end
