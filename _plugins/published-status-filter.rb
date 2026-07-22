#!/usr/bin/env ruby

Jekyll::Hooks.register :site, :post_read do |site|
  posts_collection = site.collections['posts']
  next unless posts_collection

  visible_posts = posts_collection.docs.select do |post|
    status = post.data['status']

    if status.nil? || status.to_s.strip.empty?
      post.data['status'] = 'published'
      true
    else
      status.to_s == 'published'
    end
  end

  posts_collection.docs = visible_posts
end
