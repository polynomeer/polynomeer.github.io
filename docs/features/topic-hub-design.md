# Topic Hub Design

## Goal

Give a reader (typically a recruiter) one page per question the blog keeps
returning to, such as "how far has this person taken Kafka", instead of a tag
cloud they have to assemble themselves. Each hub lists the author's own
project and note posts first, then tech blog reviews, then conference talk
reviews on the same topic.

## Data Model

Hubs live in the `topics` collection (`_topics/<id>.md`, rendered at
`/topics/<id>/`, directory at `/topics/`). Front matter:

| Field | Meaning |
| --- | --- |
| `title`, `question`, `description` | Hero copy. `question` is the one-line recruiter question the hub answers. |
| `order` | Position in the directory and sidebar-independent ordering. |
| `tags` | Post tags that pull a post into the hub. Compared case- and punctuation-insensitively. |
| `featured` | Post slugs pinned to the top of their section and shown as "먼저 읽을 글". |
| `posts` | Extra slugs to include when the tags miss them. |
| `exclude` | Slugs to drop when a tag matches too broadly. |

The body of a topic file, if any, renders between the hero and the featured
cards.

## Build

`_plugins/topic-hub.rb` runs at `site, :post_read` with low priority, after the
status filter, so hidden posts never join a hub. It sorts matching posts into
`own` (everything else), `review` (`_posts/techblog`) and `talk`
(`_posts/conference`), pins featured posts, orders the rest by date, and
stores the result in `topic.data.topic_sections`. Posts under `_posts/TIL` and
`_posts/problemsolving` are skipped. Each post receives
`topic_hubs` (id, title, url) so the post layout can link back to its hubs.

## Rendering

- `_layouts/topic-directory.html` (`_tabs/topics.md`, order 3.5 between
  Tags and Series): one card per hub with the question, counts per section
  and the first featured post.
- `_layouts/topic-detail.html`: hero, featured cards, then one section per
  non-empty group. Section lists use the series pager (`data-series-pager`)
  at 12 items per page.
- `_layouts/post.html`: hub chips under the tag list.
- Styles in `_sass/layout/topics.scss`; strings under `topic:` in the locale
  files.

## Tuning

Match quality is a data problem: adjust `tags`, `posts` and `exclude` in the
topic file. A quick way to see what a tag list pulls in is
`ruby scripts/check-post-consistency.rb` for tag spelling and a local build
with `JEKYLL_SHOW_DRAFTS=1` unset. Topics with fewer than a handful of posts
should be merged rather than shipped empty.
