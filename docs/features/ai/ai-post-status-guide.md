# AI Guide for Post Status Metadata Work

Use this guide when implementing or extending post status metadata in this repository.

For general repository rules, read [`AGENTS.md`](../../../AGENTS.md) first.

## Objective

Expose editorial maintenance state through a small set of post statuses:

- draft
- published
- archived

## Preferred Metadata

Use post front matter:

```yaml
status: published
```

Do not use `draft: true` or `published: false` for editorial visibility in this repository.

Do not try to infer status automatically from post dates.

## Primary Files Likely to Change

- `_data/post_statuses.yml`
- `_layouts/post.html`
- `_layouts/home.html`
- new status directory/detail layouts
- `_tabs`
- `_sass/layout/post.scss`
- `_sass/layout/home.scss`
- locale files in `_data/locales`

## UI Guidance

- show a compact badge
- do not overwhelm the title area
- keep styling distinct from content type badges, but visually compatible

Good placements:

- post header metadata row
- homepage post cards

## Status Pages

Status directory should explain what each status means.

Status detail pages should list posts with that status.

## Safety Rules

- do not bulk-edit all posts to assign status
- start with a small curated sample
- keep fallback behavior graceful when status is absent
- keep `status` as the only editorial visibility field

## Validation

Before finishing:

1. confirm posts without status still render cleanly
2. confirm badges render only when status exists
3. confirm status pages classify sample posts correctly
4. run `bundle exec jekyll build` when feasible

## Recommended First Task

The safest first implementation is:

1. add `_data/post_statuses.yml`
2. add reusable status badge include
3. add status directory/detail pages
4. annotate a few curated posts
