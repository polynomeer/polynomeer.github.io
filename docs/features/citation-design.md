# Citations and Sources

## Goal

Quotes in posts are currently plain blockquotes with the source written next to
them by hand (`> "..." (Kleppmann)`). The quote, who said it, and where it came
from are not data, so the blog cannot answer "which posts quote DDIA?" or "what
did I take from RFC 9110?".

This feature turns a quote into a **Citation** that points at a shared
**Source**. One source can be cited many times across posts; each citation keeps
its own quote, locator and the author's commentary. From that, the site renders
a citation card in the post and a `/sources/` section that lets a reader go from
a source back to every passage the blog took from it.

Source: the idea note `quote-features.md` (Citation vs Source split, citation
card, source pages, back citation, commentary, URL-to-metadata, code citations).

## Scope

| Idea from the note | Decision | Why |
| --- | --- | --- |
| Citation / Source split | Phase 1 | Core of everything else; fits Jekyll data files |
| Citation card in posts | Phase 1 | Liquid block tag, no JS |
| Commentary separated from the quote | Phase 1 | Same block, a marker splits quote and note |
| Source index and per-source pages (`/sources/`) | Phase 1 | Generated at build like the topic hubs |
| Code citation pinned to a commit | Phase 1 (`code` type) | Only a URL rule over `repo/commit/path/lines` |
| Sources cited in this post (bibliography at the end) | Phase 2 | Cheap once the index exists |
| Back citation | Already exists | `post-backlinks.rb` lists posts linking to a post. Phase 2 makes `post:<slug>` citations count too |
| Review posts' `source_url` as an implicit citation | Phase 2 | 76 posts carry it; needs a URL match to the registry |
| "Select text → cite" editor action, URL paste → metadata | Phase 3 (CMS) | Belongs to the CMS editor, which is being worked on in parallel. A local `scripts/` helper can come first |
| Hover popover with source details | Dropped for now | The card caption already shows the source; a popover adds JS for little gain |

Static-hosting constraint: everything is computed at build time by plugins. No
runtime fetch.

## Data model

### Source — `_data/sources.yml`

Keyed by a stable id (kebab-case). The id is what posts reference.

```yaml
kleppmann-distributed-locking:
  type: article          # book | article | web | paper | video | doc | rfc | code | talk
  title: How to do distributed locking
  author: Martin Kleppmann
  publisher: martin.kleppmann.com   # optional: publisher, journal, site, conference
  published: 2016-02-08             # optional
  url: https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html
  note: optional one-line description shown on the source page
```

Type-specific optional fields:

- `book`: `isbn`
- `paper`: `doi` (url falls back to `https://doi.org/<doi>`)
- `rfc`: `number` (url falls back to the IETF datatracker page)
- `code`: `repo` (`owner/name`), `commit`, `path`, `lines` (`142-157`); the url
  is built as `https://github.com/<repo>/blob/<commit>/<path>#L142-L157`, so the
  citation stays pinned to that commit

Optional on any type: `url_prefix` (string or list). A reference link whose URL
starts with it resolves to this source, so the chapters of a book or the pages
of one guide gather under one entry (`google-sre-book` takes every
`sre.google/sre-book/...` link). The specific URL stays on the entry.

Internal posts are not registered. A citation can use `post:<slug>` and the
source resolves to that post (type `post`).

### Reference links — the post's reference section

A post relies on every source it lists, not only on the ones it quotes. The
links under a reference heading count as entries for their source:

- headings at level 2 to 4 named `참고`, `참고 자료`, `참고 링크`, `참고 문헌`,
  `참고 서적` (with or without the space), `출처`, `References`, `Sources`;
  `참고사항` is a note, not a list, and is left out
- the section runs until the next heading of the same or a higher level; code
  fences inside it are skipped
- markdown links, `<url>` and bare `http(s)` URLs; internal `/posts/` links are
  left to the backlinks

A link resolves to a source in this order: an exact registry URL, the longest
`url_prefix`, an RFC registered as `rfc-<n>`, otherwise an **automatic
source**. Automatic sources are not written anywhere; the build derives them
from the URL:

- key: the URL without scheme, `www.`, fragment and tracking parameters. The
  rest of the query stays, because some sites name the page in it
  (`?courseId=..&unitId=..`). Every RFC mirror folds into `rfc:<n>` and a
  YouTube link into its video id.
- id: `rfc-<n>`, `youtube-<id>`, or host and last path segment plus six hex
  digits of the key's SHA-1, so it stays the same while the URL does
- title: the link text used most often for it (markdown emphasis removed),
  else the URL
- type: `rfc`, `video` for YouTube, `code` for GitHub blob URLs, `doc` for
  `docs.` hosts or `/docs/`-like paths, else `web`; publisher is the host

There is one relation, "this post relies on this source". Quoting is not a
second category; it is detail on the same relation. The style guide already
asks for every quoted source to be listed under `## 참고`, and in the registry
at the time of writing 20 of 23 quoted sources were also in that list (the
other three were a book cited by chapter URLs and two reviews whose original is
in `source_url`). Per post and source, the entry shown is, in order: the
quotes, else the review label, else the listed links.

### Citation — in the post body

```liquid
{% citation kleppmann-distributed-locking at="Conclusion" %}
"it is unnecessarily heavyweight and expensive for efficiency-optimization locks, ..."
<!-- commentary -->
효율 락으로 쓰기에는 불필요하게 무겁고, ...
{% endcitation %}
```

- First argument: source id (or `post:<slug>`).
- `at="..."`: optional locator (page, chapter, section, timestamp).
- Body: the quote in markdown. Everything after a `<!-- commentary -->` line is
  the author's note, rendered apart from the quote under a "작성자 메모" label.

The card gets an anchor `cite-<n>` (n = order in the post) so the source page
can link straight to the passage.

## Build

`_plugins/citations.rb`:

1. `site, :post_read` (low priority, after the status filter): read the
   registry, scan the markdown of every published post for citation blocks and
   reference links and build `site.data['citation_index']` — per source id,
   the list of `{post, quote, at, anchor}`, `{post, implicit}` or
   `{post, reference, text, link}` — plus `site.data['auto_sources']`,
   `site.data['source_entries']` (every source some post relies on, resolved,
   with `page_url` only when it gets a page) and `post.data['cited_sources']`.
   Unknown source ids are logged as build warnings.
2. `Generator`: one page at `/sources/<id>/` for every registry source a post
   relies on and every automatic source that at least two posts list
   (`AUTO_PAGE_MIN_POSTS`), the rows for the `/sources/` tab
   (`_tabs/sources.md`) in `site.data['citation_sources']`, and the rest in
   `site.data['single_post_sources']`. The index is a tab rather than a
   generated page so it joins the sidebar's "근거" group like the other
   evidence pages. The connection map (`connection-map.rb`) draws only the
   sources with a page.
3. `Liquid::Block` `citation`: renders the card through
   `_includes/citation-card.html`, converting quote and commentary from
   markdown. An unknown id still renders the quote, with the raw id as caption,
   so a typo never drops content.

Scanning the source rather than the rendered output keeps the index independent
of render order (same reasoning as `post-backlinks.rb`).

`scripts/check-post-consistency.rb` reports citations whose source id is not in
the registry, so the pre-commit hook catches typos before the build.

## Rendering

- Card (`_includes/citation-card.html`, styles in `_sass/layout/post.scss`):
  quote, then a caption line `— author, title · locator` with the title linking
  to the original, a type label, and a link to the source page. The commentary
  sits below a divider with its label, visually separate from the quote.
- `/sources/` (`_tabs/sources.md` + `_includes/sources-index.html`): sources
  with a page, sorted by the number of posts that rely on them, then by
  quotes; each row shows title, type, author (or publisher), `n편` and, when
  quoted, `인용 n`. Below, folded in a `<details>`, the sources only one post
  lists, each linking to the original and to that post.
- `/sources/<id>/` (`_includes/source-detail.html`): source metadata with the
  original link, then every post that relies on it, newest first, showing its
  quotes (linking to the cards), the review label, or the links it lists
  ("참고 링크: <link text>" to the exact URL).
- No per-post source list in the post tail. One existed ("이 글의 출처") and
  was removed: the cards in the body already name each source and link to
  its page, so the list only repeated them.
- Strings live under `citation:` in `_data/locales/ko-KR.yml` and `en.yml`.

## Plan

Phase 1 (done)

1. Registry `_data/sources.yml` and the plugin (index, generator, block tag)
2. Card include and styles
3. Source index and detail includes, locale strings
4. Consistency check for unknown source ids
5. Pilot: convert the two quotes in the Kleppmann review to citation blocks
   without changing their text; verify the card, `/sources/` and the detail page
   in a local build

Phase 2 (done)

1. "이 글의 출처" list at the end of posts that cite sources
2. `post:<slug>` citations feed `post-backlinks`
3. Review posts whose `source_url` matches a registry url (scheme, `www.`,
   query and trailing slash ignored) count as one implicit citation, unless the
   post already quotes that source. The source page shows them as "원문 전체를
   읽고 쓴 리뷰". Review sources are registered one by one, not generated from
   all 76 `source_url`s, so the ranking keeps meaning "quoted", not "exists".
4. `/sources/` is a tab in the sidebar "근거" group

Phase 3

1. (done) `scripts/add-source.rb <url> [--id] [--type] [--write] [--offline]`
   drafts a registry entry from a URL and prints it, or appends it with
   `--write`. RFCs read the datatracker title; GitHub blob URLs become `code`
   entries and a branch or tag ref is resolved to its commit through the GitHub
   API so the quote stays pinned; DOIs use CSL JSON content negotiation;
   YouTube uses oEmbed and drops the `t=` timestamp (it belongs on the citation
   as `at=`); other pages use `og:`/`meta` tags. Pages under `docs.`/`/docs/`
   become `doc` and lose `published`, since docs sites stamp it with the last
   build. A URL already in the registry prints its existing id.
2. (done) CMS "인용하기". The write tab has a button that opens a dialog with
   the selected text as the quote (a selected `> ` quote loses its markers).
   The source is picked from the registry, or registered on the spot: a URL
   or DOI goes to `POST /api/source-draft` (`cms/src/sourcedraft.js`, the
   same rules as the script, run in the Worker) and fills the fields, which
   stay editable. Locator and commentary are optional. The block is inserted
   on its own lines. A new source is staged like an image: on save the
   editor re-reads `_data/sources.yml`, appends only entries not already
   there, and commits it with the post in one commit. The preview draws
   citation blocks as cards and names ids missing from the registry.

   The Worker may read and write `_data/sources.yml` and no other file under
   `_data/`; the match is exact, so locales and profile data stay out of the
   editor's reach. The session's GitHub token goes only to `api.github.com`,
   to pin a branch URL to its commit.

Phase 4 (done)

1. Reference links count as entries of their source, quoted or not, through
   one relation (see "Reference links" above). Decided against a separate
   "referenced" category: quoted sources are a subset of listed ones, so two
   categories would double-count one source per post and need rules for which
   count wins.
2. Automatic sources for unregistered links, and `url_prefix` on registry
   entries for sources split over many URLs.
3. `/sources/` ranks by posts; single-post sources fold below. At the time of
   writing: 296 published posts have a reference section, which gave 137
   source pages and 820 single-post sources; the index page is about 500 KB
   (85 KB gzipped).

Not counted: links in the body outside a reference section, since many of them
point at tools or homepages rather than at evidence. A post that wants such a
link counted lists it under `## 참고`.

## Migration

Existing posts are not rewritten in bulk. 25 posts have `> "..."` style quotes;
they move to citation blocks only when the post is edited for another reason or
when asked, starting with the pilot.
