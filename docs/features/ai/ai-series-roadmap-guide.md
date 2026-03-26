# AI Guide for Series and Roadmap Work

This guide helps AI agents implement or extend the series and roadmap feature safely in this repository.

## Purpose

Use this document when working on:

- series navigation
- roadmap pages
- roadmap metadata
- recommendation improvements based on ordered reading paths

For general repository rules, read [`AGENTS.md`](../../../AGENTS.md) first.

## Feature Summary

The feature introduces two concepts:

- `series`: an ordered group of posts
- `roadmap`: a curated learning path that can contain multiple series and standalone posts

Series is local and sequence-oriented.
Roadmap is broader and path-oriented.

## Data Contracts

### Post front matter

Supported metadata:

```yaml
series: "redis-fundamentals"
series_title: "Redis Fundamentals"
series_order: 1
series_description: "Short display summary."
roadmaps:
  - backend-core
roadmap_stage: "beginner"
roadmap_topics:
  - redis
  - cache
```

Minimum fields for a working series item:

- `series`
- `series_order`

Minimum fields for a roadmap-linked post:

- `roadmaps`

### Roadmap registry

Roadmaps should be defined centrally in `_data/roadmaps.yml`.

Do not duplicate roadmap title and stage definitions across many posts unless there is a strong reason.

## Files Likely to Change

Primary:

- [`_layouts/post.html`](../_layouts/post.html)
- [`_layouts/page.html`](../_layouts/page.html)
- [`_includes`](../_includes)
- [`_data/locales/en.yml`](../_data/locales/en.yml)
- [`_data/roadmaps.yml`](../_data/roadmaps.yml) when introduced

Possible:

- [`_tabs`](../_tabs) if a roadmap tab is added
- [`_sass/layout/post.scss`](../_sass/layout/post.scss)
- [`_sass/addon/commons.scss`](../_sass/addon/commons.scss)

## Implementation Strategy

Prefer this order:

1. create a reusable include for series navigation
2. render it from the post layout only when metadata exists
3. introduce roadmap data file
4. add roadmap index page
5. add roadmap detail page layout

Avoid mixing all phases into one change unless explicitly requested.

## Query Patterns

Useful Liquid logic:

- series posts: `site.posts | where: "series", page.series`
- roadmap posts: filter `site.posts` by whether `roadmaps` contains a given roadmap id

When sorting:

- use `series_order` as the primary field
- use date only as fallback

## UI Guidance

### Series block

Show:

- title
- current step position
- previous link
- next link
- optional full list

Do not:

- render an empty block when only partial metadata exists
- assume all posts in a series have perfectly contiguous numbers

### Roadmap page

Show:

- roadmap summary
- stage grouping
- series grouped within a stage
- standalone posts separately

Do not:

- flatten everything into one long unsorted list

## Content Safety

- Do not bulk-edit post front matter without explicit instruction.
- Start with a few curated posts if sample content is needed.
- Do not infer series membership solely from filename conventions unless the task explicitly asks for migration help.
- Some content under `_posts` does not use consistent front matter. Handle this gracefully.

## Validation

Before finishing:

1. check `git status`
2. ensure changes are limited to the intended feature scope
3. verify Liquid conditions do not break posts without series metadata
4. run `bundle exec jekyll build` when feasible

## Recommended Localization Keys

When adding UI text, prefer extending `_data/locales/en.yml` first with keys such as:

- `post.series`
- `post.series_progress`
- `post.series_next`
- `post.series_previous`
- `post.roadmaps`
- `layout.roadmaps`

Keep key naming consistent with the existing locale structure.

## Common Mistakes to Avoid

- using categories as a substitute for ordered series
- making roadmap definitions post-local instead of centralized
- introducing plugin-heavy logic too early
- coupling roadmap rendering to one content area only
- breaking existing post pages when metadata is absent

## Recommended First Task for Implementation

If implementation starts, the safest first task is:

- add a reusable series navigator include
- render it in post pages only when `series` metadata exists

This gives visible value with low repository risk and minimal content migration effort.
