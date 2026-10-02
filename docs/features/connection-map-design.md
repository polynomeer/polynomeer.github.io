# Connection Map

## Goal

Backlinks show, at the end of one post, which posts link to it. Nothing shows
the shape of all those links together: which posts the rest of the blog leans
on, whether reviews of other people's writing actually lead into the author's
own measured notes, and what sits around a given post.

## Why not one big graph

At the time of writing, 286 of 1,004 published posts take part in a link
(1,043 links, same-series links excluded, as in `post-backlinks.rb`), and 271
of them form one connected component. A force layout of that is a hairball:
pleasant to look at, nothing to read. So the page answers three questions
separately, each with the representation that fits it.

| Section | Question | Form |
| --- | --- | --- |
| Hubs | Which posts does the rest of the blog lean on? | Top posts by mentions, each with where the mentions come from (review, note, recruit, ...) |
| Flows | Do reviews lead into the author's own notes? | Mentions aggregated by content type, `from → to`, as proportional bars |
| Neighbourhood | What is around this post? | Pick a post; draw it in the middle, what it mentions or quotes on the left, posts that mention it on the right (the same direction as the post tail's connection block). Node size shows how connected each neighbour is |

The whole-graph view is left out: the neighbourhood view keeps what a graph is
good at (seeing what is near) without the hairball. It can be added later
behind a toggle if wanted.

Posts with no links at all (the other ~700) are a maintenance list, not a
public page; they belong in `scripts/blog-health-report.sh` if anywhere.

## Build

`_plugins/connection-map.rb` is a `Generator` (`:lowest`, so backlinks and
the citation index are already built at `post_read`):

- edges are read from `post.data['backlinks']`, so they follow the same rules
  as the per-post list (published only, no self links, no same-series links,
  `{% citation post:... %}` included)
- a post's type is its first `_posts/` folder; registered content types
  (`_data/content_types.yml`) show their title, an unregistered folder such
  as `monticker` shows its own name rather than a vague "other"
- `site.data['connection_map']`: `hubs` (top 15, with per-type counts of
  where the mentions come from), `flows` (type pairs with counts), totals
- `/assets/js/data/connection-map.json`: nodes (`id`, title, url, type) for
  every linked post plus every cited registry source, and edges `[from, to,
  kind]` with kind `link` or `cite`

The hubs and flows are plain Liquid (`_includes/connection-map.html`), so the
page reads without JavaScript. The neighbourhood view is
`assets/js/connection-map.js`, a small script with no library. A first
version laid the neighbours on arcs; a hub with 28 mentions piled its labels
into one unreadable wedge, so each side is now a column that makes the drawing
taller instead, joined to the centre by curves. A post linked both ways sits on
the left with a dashed line. Drawing second-degree neighbours was tried and
dropped for the same reason; node size stands in for "there is more behind
this one". The same neighbours are listed as ordinary links under the
drawing, which is also the accessible version.

## Page

`_tabs/connections.md` at `/connections/`, in the sidebar "근거" group after
"출처". The post tail's connection block links to
`/connections/#<slug>`, which opens the neighbourhood view centred on that
post.
