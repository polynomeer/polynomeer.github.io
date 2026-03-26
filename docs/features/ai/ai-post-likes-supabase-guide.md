# AI Post Likes Supabase Guide

This guide explains how AI agents should maintain the Supabase-based post likes feature.

Use this together with:

- `AGENTS.md`
- `docs/features/post-likes-supabase-design.md`
- `docs/guides/blog-development-operations-guide.md`

## Scope

This feature adds a simple browser-scoped like toggle to post pages.

It is not a secure voting system.

## Source of Truth

- `_config.yml`
  - `likes.provider`
  - `likes.supabase.url`
  - `likes.supabase.anon_key`
  - `likes.supabase.table`
- `_layouts/post.html`
  - button placement
- `_includes/likes/supabase.html`
  - browser behavior
- locale files
  - visible labels and failure text
- `_sass/layout/post.scss`
  - button styling

## Editing Rules

- Keep the feature optional and config-gated.
- Do not hardcode private keys or service-role credentials.
- Do not claim the feature is fraud-resistant.
- Prefer using `page.url` as the stable post identifier.
- Keep failures non-fatal.

## Safe Implementation Pattern

For this repository, prefer:

1. render a button only on post pages
2. use `localStorage` for a browser visitor id
3. use direct Supabase REST calls with the public anon key
4. refresh both count and liked state after a mutation

Avoid:

- requiring a build-time token exchange
- introducing a heavyweight frontend framework just for this feature
- storing per-post like state only locally without syncing count

## Common Tasks

### Change the UI copy

Update:

- `_data/locales/en.yml`
- `_data/locales/ko-KR.yml`

### Change button placement

Update:

- `_layouts/post.html`
- `_sass/layout/post.scss`

### Change backend config names

Update together:

- `_config.yml`
- `_includes/likes/supabase.html`
- related docs

### Debug missing likes

Check:

1. `likes.provider` is set
2. `likes.supabase.url` and `anon_key` are not empty
3. the table exists
4. RLS policies allow anon select/insert/delete
5. the browser console shows the expected REST calls

## Verification Checklist

1. run `bundle exec jekyll build --limit_posts 20`
2. inspect generated post HTML for the like button markup
3. confirm no JavaScript is injected when the feature is disabled
4. if possible, test a real post in the browser with configured Supabase values
