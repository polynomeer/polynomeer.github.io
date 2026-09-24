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
| `revisions` | newest first, at most 10, each with `date`, `subject`, `sha`, `short_sha`, `insertions`, `deletions` |
| `revisions_total` | the count before the cap |
| `last_modified_at` | the newest revision's date |

`last_modified_at` keeps the name the theme already used for the "updated"
line in the post header and the "recently updated" sidebar panel, but it now
means *the writing changed* rather than *some commit touched the file*.

## Rendering

`_includes/post-revisions.html` is the first tail include of
`_layouts/post.html`, rendered as a closed `<details>` so it stays a single
pill above the backlinks. Each row is a date, the commit subject, and the
line counts; the subject links to the commit when `site.revisions.repo` is
set. The subjects are the repository's own Conventional Commits, in English —
they are shown as what they are, with a link to the diff, rather than
paraphrased.

Strings are `post.revisions`, `post.revisions_count` and `post.revisions_more`
in the locale files; styles sit with the other post-tail rules in
`_sass/layout/post.scss`.
