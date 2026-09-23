# Post Backlinks

## Goal

Show, at the end of a post, which other posts link to it. Reviews end with
open questions that later project posts answer, and notes get cited by the
posts that apply them, but that relationship is only visible from the citing
side. A backlink is a connection the author actually wrote, so unlike the
similarity-based recommendations it cannot be wrong.

## Build

`_plugins/post-backlinks.rb` runs at `site, :post_read` (`:low`, after the
status filter, so hidden posts neither appear nor contribute). It scans the
markdown source of every published post for `/posts/<slug>/` references —
both `[text](/posts/slug/)` and raw `href="..."` — and inverts the mapping
into `post.data['backlinks']` (newest first, at most 8) plus
`post.data['backlinks_total']`.

Reading the source rather than the rendered HTML keeps the pass independent of
render order, which matters because a post's own page has to include the list.

Two exclusions:

- self-links
- links between posts in the same series, since the series panel already lists
  every part and repeating them would bury the cross-context citations

## Rendering

`_includes/post-backlinks.html` renders the list as the first tail include of
`_layouts/post.html`, above the similarity-based recommendations, with a
"and N more" line when the count exceeds the cap. Styles live with the other
post-tail rules in `_sass/layout/post.scss`; strings are `post.backlinks` and
`post.backlinks_more` in the locale files.

## Current shape

311 citations across 99 posts at the time of writing. The most cited are the
ParityPay posts, which the tech blog and conference reviews refer back to when
the original faces the same problem.
