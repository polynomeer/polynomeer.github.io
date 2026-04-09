# AI Agent Guide

This document helps AI agents understand how to work safely and effectively in this repository.

## Repository Summary

- Project type: Jekyll-based technical blog
- Theme base: `jekyll-theme-chirpy`
- Primary customization areas:
  - `_config.yml`
  - `_layouts`
  - `_includes`
  - `_sass`
  - `assets`
  - `_plugins`

## Important Directories

- `_posts`: blog posts grouped by topic and purpose
- `_tabs`: top-level navigation pages such as categories, tags, archives, and about
- `_layouts`: page and post layout templates
- `_includes`: reusable HTML fragments
- `_sass`: theme and layout styling
- `assets`: images, compiled CSS entrypoints, JS, and static resources
- `_plugins`: custom Jekyll hooks and build-time behavior

## Current Site Structure

- The default shell is defined in [`_layouts/default.html`](../_layouts/default.html).
- The homepage feed is defined in [`_layouts/home.html`](../_layouts/home.html).
- Post rendering is defined in [`_layouts/post.html`](../_layouts/post.html).
- Theme script loading is coordinated in [`_includes/js-selector.html`](../_includes/js-selector.html).
- Dark mode palette is controlled mainly by:
  - [`_sass/colors/typography-dark.scss`](../_sass/colors/typography-dark.scss)
  - [`_sass/colors/syntax-dark.scss`](../_sass/colors/syntax-dark.scss)

## Content Model

- Posts are stored under `_posts` and already exceed one thousand files.
- Categories and tags are heavily used and are part of the navigation model.
- The blog contains mixed content types such as:
  - TIL notes
  - archive articles
  - lectures
  - interview preparation notes
  - reference material

Because of this, changes that affect listing, search, archives, or taxonomy pages should be considered carefully.

## Known Performance Considerations

- Local Jekyll build can be slow because the repository has many posts.
- `jekyll-archives` generates category and tag pages.
- The custom plugin [`_plugins/posts-lastmod-hook.rb`](../_plugins/posts-lastmod-hook.rb) runs Git commands per post and is a likely build bottleneck.

## Safe Editing Guidelines

- Prefer narrow, local edits over repository-wide rewrites.
- Do not modify post content unless asked.
- Do not clean up unrelated untracked files.
- Assume modified post files belong to the user unless told otherwise.
- Keep customizations compatible with the existing Chirpy structure.
- If the task involves post writing or editing, follow [`content-writing-style-guide.md`](./content-writing-style-guide.md).

## Feature Work Guidance

Good candidates:

- navigation improvements
- taxonomy and archive UX improvements
- post metadata enhancements
- series features
- search presentation improvements
- theme and readability improvements

Be cautious with:

- build pipeline changes
- plugin behavior changes
- bulk front matter rewrites
- changes that affect every post page

## Validation Checklist

Before finishing a task, verify as applicable:

1. `git status` only shows intended changes for the task.
2. Layout or style changes are consistent with the current site structure.
3. `bundle exec jekyll build` succeeds when feasible.
4. No generated artifacts are committed unless explicitly requested.

## Commit Guidance

Follow the rules in [`AGENTS.md`](../AGENTS.md).

Preferred format:

```text
type(scope): summary
```

Examples:

- `docs(agent): add repository guidance for AI contributors`
- `feat(series): add ordered reading directory`
- `fix(theme): correct dark mode card contrast`
