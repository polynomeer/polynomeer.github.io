# AI Supabase Comments Guide

This guide explains how AI agents should maintain the first-stage Supabase comment system.

Use this together with:

- `AGENTS.md`
- `docs/features/supabase-comments-design.md`

## Scope

This feature replaces Giscus with:

- GitHub OAuth through Supabase Auth
- Supabase-hosted post comments
- a browser-rendered comment UI on post pages

## Source of Truth

- `_config.yml`
  - `comments.provider`
  - `comments.supabase.*`
- `_includes/comments/supabase.html`
  - auth flow
  - comment CRUD
  - rendering
- locale files
- `_sass/layout/post.scss`

## Editing Rules

- Keep the initial implementation top-level comments only.
- Do not add replies or notifications unless explicitly requested.
- Use `post_id` first and `page.url` as fallback.
- Escape user-generated content before rendering it.
- Never commit private Supabase credentials.

## Safe Change Pattern

When modifying this feature:

1. update config shape if needed
2. update UI copy in locale files
3. update the comment include logic
4. update post styles
5. verify with a local build

## Debug Checklist

If comments do not work:

1. confirm `comments.provider` is `supabase`
2. confirm Supabase GitHub Auth is enabled
3. confirm the redirect URL matches the deployed site or local dev URL
4. confirm the `post_comments` table exists
5. confirm RLS allows `select`, `insert`, and `delete` as designed
6. inspect browser console and network requests

## Future Work Boundaries

- Replies require a data model extension.
- Notifications require separate event handling and delivery.
- Push notifications should not be mixed into the Stage 1 comment rollout.
