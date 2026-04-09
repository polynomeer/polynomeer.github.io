# AI Guide for Home Curation Work

Use this guide when improving homepage curation in this repository.

For general repository rules, read [`AGENTS.md`](../../../AGENTS.md) first.

## Objective

Make the homepage a stronger guided entry point without removing the existing chronological feed.

## Existing Inputs

Homepage work should reuse:

- `series` metadata on posts

Avoid introducing a separate homepage curation config file in the first implementation.

## Files Likely to Change

Primary:

- [`_layouts/home.html`](../_layouts/home.html)
- [`_sass/layout/home.scss`](../_sass/layout/home.scss)
- locale files in `_data/locales`

Optional:

- a reusable include under `_includes` if the homepage layout becomes too large

## Recommended Homepage Sections

- featured series cards
- existing post feed

## Rules

- Show curated sections only on the first pagination page.
- Keep sections compact and high-signal.
- Do not remove pinned or paginated post logic.

## Featured Series Derivation

Preferred first approach:

- gather `featured_series` from posts already carrying series metadata
- resolve each series to its first post and summary metadata

Do not require adding a separate series registry unless it becomes necessary later.

## UI Guidance

- cards should be scannable
- descriptions should stay short
- avoid dense metric-heavy widgets
- keep the visual style consistent with current dark theme and card language

## Validation

Before finishing:

1. ensure homepage page 1 renders curated sections
2. ensure later pagination pages still show only the normal feed
3. ensure sections degrade gracefully when data is sparse
4. run `bundle exec jekyll build` when feasible

## Recommended First Task

Add curated homepage sections above the post list using:

1. featured series

Then leave the existing post feed intact below them.
