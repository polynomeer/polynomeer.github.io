# AI Blog Feature Maintenance Guide

This document is a task-oriented reference for AI agents and contributors maintaining the customized blog features.

Use this together with:

- `AGENTS.md`
- `docs/guides/blog-development-operations-guide.md`

## Goal

Maintain feature consistency across:

- post metadata
- `_data` curation files
- layouts and includes
- search index generation
- homepage and feed UI
- engagement widgets

## Change Planning Model

When a user asks for a feature or adjustment:

1. identify the user-facing surface
2. find the source of truth
3. update the rendering layer
4. update locale strings if visible labels changed
5. verify with a local build
6. commit only the task-specific files

## Feature Ownership Map

### Series and Roadmaps

Source of truth:

- post front matter
- `_data/roadmaps.yml`

Rendering:

- `_includes/series-navigation.html`
- `_includes/roadmap-membership.html`
- `_layouts/post.html`
- `_layouts/roadmaps.html`
- `_layouts/roadmap.html`

### Topic Hubs

Source of truth:

- `_data/topic_hubs.yml`
- `_topics/`

Rendering:

- `_layouts/topic-hubs.html`
- `_layouts/topic-hub.html`

### Related Recommendations

Source of truth:

- series
- roadmaps
- topic hub relationships
- tags
- categories

Rendering:

- `_includes/related-posts.html`

### Search

Source of truth:

- `assets/js/data/search.json`

Rendering:

- `_includes/search-loader.html`
- `_includes/search-results.html`
- `_javascript/modules/components/search-display.js`

### Homepage

Source of truth:

- `_layouts/home.html`
- optional `_includes/home-curation.html`

Rendering:

- `_sass/layout/home.scss`

### Content Types

Source of truth:

- file paths under `_posts/`
- `_data/content_types.yml`

Rendering:

- `_includes/content-type-badge.html`
- `_layouts/content-types.html`
- `_layouts/content-type.html`

Important:

- current type classification is path-based
- do not claim it is front matter based unless the implementation changes

### Post Status

Source of truth:

- `status` front matter
- `_data/post_statuses.yml`

Rendering:

- `_includes/post-status-badge.html`
- `_layouts/post-statuses.html`
- `_layouts/post-status.html`

### Learning Paths

Source of truth:

- `_data/learning_paths.yml`
- `_learning_paths/`

Rendering:

- `_layouts/learning-paths.html`
- `_layouts/learning-path.html`

### Post Likes

Source of truth:

- `_config.yml`
- Supabase table and RLS configuration

Rendering:

- `_layouts/post.html`
- `_includes/likes/supabase.html`
- `_sass/layout/post.scss`

## Safe Editing Rules

- Do not bulk-edit user draft posts.
- Do not move posts unless the user explicitly asked for path-based type changes.
- Do not infer editorial metadata automatically when a small curated sample is safer.
- Check for nested anchor problems when rendering badges inside cards.
- Watch for global CSS leakage from generic selectors like `.categories`.
- Never commit private Supabase credentials. Only the public anon key belongs in config.

## Common Tasks

### Add a new curated feature item

Use this approach:

1. add or update `_data` entry
2. add collection page if needed
3. connect layout/include
4. add locale text
5. add scoped styles

### Change feed card UI

Check:

- `_layouts/home.html`
- `_sass/layout/home.scss`
- reusable badge includes

Avoid:

- placing clickable `<a>` badges inside the already clickable card link

### Diagnose missing items from listing pages

Check:

1. whether the build used `--limit_posts`
2. whether the item exists in `site.posts` or a collection
3. whether the classification rule is path-based or metadata-based
4. whether future-dated content or drafts are excluded

### Diagnose visual misalignment

Check:

1. local scoped selectors in the relevant layout stylesheet
2. global selectors in `_sass/addon/commons.scss`
3. category- or tag-page styles leaking into card metadata

## Verification Checklist

After any feature change:

1. run `git status`
2. run `bundle exec jekyll build` when feasible
3. if build is too slow, use `bundle exec jekyll build --limit_posts 20` only for structural verification
4. do not use limited build output to judge completeness of listing pages
5. inspect affected generated pages in `_site/`

## Commit Discipline

Use Conventional Commits.

Recommended patterns:

- `docs(blog): add operations guide`
- `feat(path): add guided learning paths`
- `fix(feed): avoid nested links in feed cards`

Keep docs and implementation in separate commits when both are part of the task.

## When to Update Which Doc

- Update `docs/guides/blog-development-operations-guide.md` when feature behavior or operating workflow changes.
- Update this guide when AI-safe editing rules or maintenance strategy changes.
- Update feature-specific design docs when the feature’s structure or intended model changes.
