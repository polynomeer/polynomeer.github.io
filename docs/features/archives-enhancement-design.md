# Archives Enhancement Design

This document defines the first-stage enhancement plan for the `Archives` page.

## Goal

Turn the archive page from a plain chronological dump into a better discovery surface that still works well for long-term static hosting.

The archive page should help readers:

- scan activity by year quickly
- understand what kind of writing each year contains
- identify representative post metadata without opening every post

## Non-Goals

- full client-side faceted search on the archive page
- replacing `Topics`, `Types`, or `Roadmaps`
- changing post content or post metadata in bulk

## First Iteration Scope

The first iteration focuses on low-risk improvements inside the current archive layout:

1. year summary cards inside each collapsible year group
2. post count and type mix summary per year
3. richer post rows with content type and status badges
4. stronger visual hierarchy for yearly sections

## Information Architecture

Each year group contains:

- year label
- post count
- dominant content types for that year
- collapsible list of post rows

Each post row contains:

- publication date
- post title
- content type badge
- optional post status badge

## Data Strategy

The feature should remain derived from existing post metadata.

Primary inputs:

- `site.posts`
- path-derived content types through `content-type-id`
- optional front matter `status`

No new post-level front matter is required for the first iteration.

## Rendering Strategy

Implementation stays inside the archive layout and existing reusable badge includes.

Main files:

- `_layouts/archives.html`
- `_sass/layout/archives.scss`
- `_includes/content-type-badge.html`
- `_includes/post-status-badge.html`
- locale files for archive-specific labels

## Interaction Model

- the latest year stays expanded by default
- older years remain collapsed by default
- year toggle keeps the current click-to-expand behavior

## Future Extension Path

Possible second-stage improvements:

- lightweight archive filters for type and status
- monthly sub-grouping within a year
- highlighted representative archive posts near the top
- annual retrospective summaries

## Operational Notes

- avoid expensive repeated scans where possible, but prioritize clear Liquid over fragile optimization
- preserve the existing archive URL and page role
- keep the page compatible with GitHub Pages style static builds
