# Post Revision History

## Goal

Show, at the end of a post, the edits it received after publication. A blog
post looks the same whether it was written once and abandoned or rewritten
three times; the git history already knows the difference, and surfacing it is
a credibility signal that costs no writing.

## What counts as a revision

Most commits that touch a post are site-wide maintenance: renaming a category
across sixty files, merging tag spellings, repointing dead links. Listing those
as revisions of the writing would be false, so two rules filter them out.

1. **Size.** A commit counts only when it changed at least 6 lines of that
   file. Taxonomy sweeps change one or two lines of front matter.
2. **Moves.** A commit that reaches the same post through more than one path
   moved the file. `git log -M` pairs most renames, but the bulk
   `archive/` to `notes/` move left unpaired delete and add halves behind, and
   a whole-file add is not a revision.

The commit that introduced the file is not a revision of it either, so the
oldest entry is always dropped.

Across the archive this leaves about a hundred revisions over eighty-odd
posts. The number is small because it is honest: most posts were written once.

## Build

`_plugins/post-revisions.rb` runs at `site, :post_read` (`:low`) and issues a
single `git log -M --no-merges --numstat -- _posts`, parsing commit metadata
and per-file line counts out of one stream.

This replaces the upstream Chirpy `posts-lastmod-hook`, which ran
`git rev-list` and then `git log` once per post. Measured on this repository
that was 51.3 seconds of subprocess time for 1,041 posts, and all it produced
was a modification date. The single pass takes 0.15 seconds and produces the
full history.

Posts are keyed by **slug**, not by path. The file name carries the
publication date, so re-dating a post renames the file, and `--numstat`
reports renames as `{old => new}` paths that are awkward to follow. The slug
survives both a re-date and a directory move, and
`scripts/check-post-consistency.rb` already guarantees it is unique.

Two things the parser has to get right:

- git writes paths as bytes and Ruby tags the output `US-ASCII`, which breaks
  on the Korean file names under `_posts`; the output is force-encoded to
  UTF-8.
- `actions/checkout` defaults to a shallow clone, which would leave every post
  without a history on the deployed site. `.github/workflows/jekyll.yml` sets
  `fetch-depth: 0`.

## Data

Each post gets:

| key | value |
| --- | --- |
| `revisions` | newest first, at most 10, each with `date`, `subject`, `sha`, `short_sha`, `insertions`, `deletions`, and `note` when the post gives one |
| `revisions_total` | the count before the cap |
| `last_modified_at` | the newest revision's date |

`last_modified_at` keeps the name the theme already used for the "updated"
line in the post header and the "recently updated" sidebar panel, but it now
means *the writing changed* rather than *some commit touched the file*.

## Reader notes

Commit subjects are written for the repository, in English. A post can give
readers its own line for a revision in front matter:

```yaml
revision_notes:
  "83a0a67": PostgreSQL·Hibernate 출처 인용 추가   # commit hash prefix, 7+ characters
  2026-10-01: 측정 조건 표 보강                    # or the revision's date
```

A hash key wins over a date key, and a date key applies to every revision
made that day, so use hashes when two revisions share a date. Quote hash keys:
an all-digit or `1e…` hash would otherwise be read as a number. Adding notes
changes a few lines of front matter, below the 6-line threshold, so it does
not count as a revision itself.

## Rendering

The post header shows "N번 수정" next to the updated date, linking to
`#post-revisions`. `_includes/post-revisions.html` is a tail include placed
right after the mentions (`post-backlinks`): what the post leans on and when
it changed read together. It is a card with the revisions on a timeline -
date, the note or else the commit subject, and the line counts - ending with
the publication date. Rows beyond the first three fold behind a toggle. Each
row links to its commit when `site.revisions.repo` is set; a note shows the
commit subject as its tooltip.

Strings are `post.revisions*` in the locale files; styles sit with the other
post-tail rules in `_sass/layout/post.scss`.
