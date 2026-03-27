# AI Guide for Content Type Separation Work

Use this guide when implementing or extending content type separation in this repository.

For general repository rules, read [`AGENTS.md`](../../../AGENTS.md) first.

## Purpose

Content type separation helps users distinguish between:

- TIL
- Notes
- Article

The first rollout should be path-based, not metadata-heavy.

## Preferred Classification Logic

Use `post.path`:

- `_posts/TIL/...` => `til`
- `_posts/notes/...` => `notes`
- everything else in `_posts` => `article`

Do not bulk-edit posts to add explicit type metadata unless requested.

## Primary Files Likely to Change

- `_data/content_types.yml`
- `_layouts/post.html`
- `_layouts/home.html`
- `_layouts/page.html`
- new layouts for type directory/detail pages
- `_tabs/types.md`
- `_sass/layout/post.scss`
- `_sass/layout/home.scss`
- locale files in `_data/locales`

## UI Guidance

Add small but visible type badges.

Good locations:

- post page header metadata
- homepage post cards
- type directory cards

Do not make type labels visually heavier than titles.

## Detail Pages

Type pages should list matching posts and explain what the type means.

Keep them simple and note-like.

## Validation

Before finishing:

1. verify classification logic works for TIL, notes, and non-TIL/non-notes posts
2. verify pages render without changing existing posts
3. ensure homepage and post pages display type badges correctly
4. run `bundle exec jekyll build` when feasible

## Recommended First Task

The safest first implementation is:

1. add data definitions
2. add type directory/detail pages
3. add type badges to post and home cards

This provides immediate user value with minimal risk.
