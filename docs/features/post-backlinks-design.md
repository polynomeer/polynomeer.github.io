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

The tail of a post runs, top to bottom:

1. `post-adjacent-nav.html` - chronological previous / next boxes
2. `post-connections.html` - the links the author wrote, both directions:
   - "이 글의 출처" (`post-sources.html`): registry sources this post quotes
     (see citation-design.md)
   - "이 글을 언급한 글" (`post-backlinks.html`): posts whose body links here
   Drawn as a flow: sources (out) -> a "이 글" marker -> mentions (in), each
   list in a card with a count, joined by arrows. A post with only one side
   keeps that side and the marker. Below 768px the flow runs top to bottom
   and the arrows turn downward.
3. `related-posts.html` - up to three similarity recommendations
4. comments

Backlinks used to sit below the recommendations, which contradicted the reason
they exist: a backlink is a connection the author wrote, so it cannot be a
false match, while a recommendation can. Editorial links now come first.

The heading was "이 글을 인용한 글". Once citation blocks arrived, "인용" meant a
quoted passage with a source, while a backlink is mostly a "see this post"
mention. The label became "이 글을 언급한 글" ("Posts that mention this one"),
and the stats page fact `fact_cited` followed. A post that quotes another
with `{% citation post:<slug> %}` still lands in this list; a separate
"이 글을 인용한 글" group showing the quoted passage is left for when such
quotes exist (none at the time of writing).

The first three rows are visible and a button expands the rest; without
JavaScript all rows are visible. Recommendations use cards; navigation and
connections use compact title rows. Styles live in `_sass/layout/post.scss`;
heading strings are `post.relate_posts`, `post.backlinks`, `post.connections`
and `citation.post_sources` in the locale files.

## Current shape

311 citations across 99 posts at the time of writing. The most cited are the
ParityPay posts, which the tech blog and conference reviews refer back to when
the original faces the same problem.
