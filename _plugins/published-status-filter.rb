#!/usr/bin/env ruby

Jekyll::Hooks.register :site, :post_read do |site|
  posts_collection = site.collections['posts']
  next unless posts_collection

  visible_posts = posts_collection.docs.select do |post|
    data = post.data
    status = data['status']&.to_s&.strip

    if status.nil? || status.empty?
      data['status'] = 'published'
      true
    else
      status == 'published'
    end
  end

  posts_collection.docs = visible_posts
end
