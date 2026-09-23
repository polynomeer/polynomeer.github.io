#!/usr/bin/env ruby
# frozen_string_literal: true

# `strip_code_blocks`: drops rendered code from HTML before it goes into the
# search index (assets/js/data/search.json).
#
# The index keeps only the first few hundred characters of each post, and on a
# technical blog that window is often filled by a configuration listing or a
# stack trace, which pushes the prose that people actually search for out of
# the index and wastes bytes on tokens nobody types.

module Jekyll
  module SearchTextFilter
    HIGHLIGHT = %r{<(?:figure|div)[^>]*class="[^"]*(?:highlight|highlighter-rouge)[^"]*".*?</(?:figure|div)>}m
    PRE = %r{<pre\b.*?</pre>}m
    CODE = %r{<code\b.*?</code>}m

    def strip_code_blocks(input)
      input.to_s.gsub(HIGHLIGHT, ' ').gsub(PRE, ' ').gsub(CODE, ' ')
    end
  end
end

Liquid::Template.register_filter(Jekyll::SearchTextFilter)
