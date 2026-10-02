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
into `post.data['backlinks']` (all citations, newest first).

Reading the source rather than the rendered HTML keeps the pass independent of
render order, which matters because a post's own page has to include the list.

Two exclusions:

- self-links
- links between posts in the same series, since the series panel already lists
  every part and repeating them would bury the cross-context citations

## Rendering

`_includes/continue-reading.html` is the first tail include. It groups series
previous/next links and up to three recommendations under one heading. Ordinary
posts have no chronological navigation. Recommendations already shown as a
series neighbour are omitted; the remaining list is not padded with unrelated
posts. Empty reading sections are not rendered.

`_includes/post-backlinks.html` follows this section, before comments. It uses a
native `details` element, collapsed by default, with the citation count in its
summary. Expanding it shows every citation without JavaScript. The label means
"posts that cite this one", not sources cited by the current post.

Both sections use compact title rows instead of cards. Styles live in
`_sass/layout/post.scss`; heading strings are `post.continue_reading` and
`post.backlinks` in the locale files.

## Current shape

311 citations across 99 posts at the time of writing. The most cited are the
ParityPay posts, which the tech blog and conference reviews refer back to when
the original faces the same problem.
