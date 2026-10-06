# Post references box

The `## 참고` list at the end of a post is rendered as a closed box after the
body instead of as part of the body. Implemented in
`_plugins/post-references.rb`, styled in `_sass/layout/post.scss`
(`.post-references`), labels in `_data/locales/*.yml` (`post.references_*`),
publisher names in `_data/publishers.yml`.

## Why

Reference lists were written in at least six shapes (`[제목](URL)`,
`[제목 - 발행처](URL)`, `[제목](URL) — 발행처`, bare URLs, `저자, [제목](URL)`,
several links on one line), under eleven heading spellings. On the page they
read as one more section of the body, often longer than the last real section,
and internal "read next" links sat in the same list as external sources.

Rewriting about 2,800 lines by hand would fix the shape once and drift again.
Rendering fixes the shape at build time, for old and new posts alike, and
keeps the markdown as the author wrote it.

## What it does

After a post converts to HTML (`:posts, :post_convert`):

1. Every reference section is found: an `h2`–`h4` whose text is one of the
   names the citations plugin reads (`참고`, `참고 자료/링크/문헌/서적`, `출처`,
   `References`, `Sources`). A section runs to the next heading of the same or
   a higher level.
2. Each section is cut out of the body. Its list items and paragraphs become
   entries; all sections of a post merge into one box.
3. The box is appended to the end of the body as
   `<details class="post-references" id="references">`, closed by default. The
   summary shows the counts ("외부 출처 7 · 블로그 글 5").
4. Inside, entries split into two groups: external sources, and posts on this
   blog (`/posts/` links). A blog post shows its date; an external source shows
   its publisher.

Because the markdown is untouched, `_plugins/citations.rb` (source pages,
`/sources/`, the connection map) and the backlinks keep reading the same
lists. The headings no longer reach the table of contents, which is intended.

## How an entry is read

| Written | Rendered |
| --- | --- |
| `- [제목](URL) — 발행처` | 제목, 발행처 |
| `- [제목](URL) — 발행처: 메모` | 제목, 발행처, 메모 |
| `- [제목](URL) — 메모` (not a publisher) | 제목, derived publisher, 메모 |
| `- [제목 - 발행처](URL)` | 제목, 발행처, when the tail reads as a publisher |
| `- [제목](URL)` | 제목, derived publisher |
| `- 저자, [제목](URL)` | 제목, 저자 |
| `- 설명: [제목](URL)` | 제목, derived publisher, 설명 |
| `- [제목](URL) · [영상](URL) · [자료](URL)` | 제목 with short extra links |
| `- [A](URL), [B](URL)` | one entry per link |
| `- https://...` or `- 책 이름: https://...` | linked, title from the words or the URL |
| `- 『책』 3장` (no link) | plain entry |
| a paragraph longer than 80 characters | lead-in text above the list |

"Reads as a publisher" means the text shares a word with the publisher the
host resolves to, is a name already used in `_data/publishers.yml` or in a
registered source, or names a kind of publication (docs, blog, manual,
기술 블로그, ...). Otherwise it is kept as a note.

The derived publisher is, in order: a registered source's `publisher` whose
`url` or `url_prefix` matches, the longest matching host in
`_data/publishers.yml` (subdomains included), then the bare host.

## Limits

- A `참고:` paragraph label (not a heading) is left in the body.
- The box is closed, so the browser's find-in-page reaches it only in browsers
  that search closed `<details>` (Chromium does).
- A link to `#references` does not open the box by itself.
