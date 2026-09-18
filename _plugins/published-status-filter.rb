#!/usr/bin/env ruby
# frozen_string_literal: true

# Drops posts whose `status` is not `published` before the site renders.
#
# Set JEKYLL_SHOW_DRAFTS=1 (or `show_drafts_locally: true` in the config) to
# keep every post for local preview; hidden posts then render with their
# status badge instead of disappearing.
#
# The URLs of the dropped posts are recorded in `site.data['hidden_post_urls']`
# so that other plugins (see post-link-guard.rb) can tell a hidden post apart
# from a post that never existed.

module Jekyll
  module PostVisibility
    TRUTHY = %w[1 true yes on].freeze

    def self.show_drafts?(site)
      env = ENV['JEKYLL_SHOW_DRAFTS'].to_s.strip.downcase
      return true if TRUTHY.include?(env)

      site.config['show_drafts_locally'] == true
    end
  end
end

Jekyll::Hooks.register :site, :post_read do |site|
  posts_collection = site.collections['posts']
  next unless posts_collection

  show_drafts = Jekyll::PostVisibility.show_drafts?(site)
  hidden_urls = []

  visible_posts = posts_collection.docs.select do |post|
    data = post.data
    status = data['status']&.to_s&.strip

    if status.nil? || status.empty?
      data['status'] = 'published'
      next true
    end

    next true if status == 'published'

    hidden_urls << post.url
    show_drafts
  end

  posts_collection.docs = visible_posts
  site.data['hidden_post_urls'] = hidden_urls
  site.data['showing_drafts'] = show_drafts

  if show_drafts && !hidden_urls.empty?
    Jekyll.logger.info 'Post status:', "showing #{hidden_urls.size} hidden post(s) for local preview (JEKYLL_SHOW_DRAFTS)"
  end
end
