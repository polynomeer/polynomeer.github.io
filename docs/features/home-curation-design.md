# Home Curation Design

## Goal

Improve the homepage so it works as a guided entry point, not only a chronological feed.

The homepage should help visitors answer:

- where should I start?
- what are the major themes of this blog?
- what is worth reading next besides the newest post?

## Current Baseline

The current homepage in [`_layouts/home.html`](../_layouts/home.html) primarily renders:

- pinned posts
- regular paginated posts

This is functional, but it underuses the richer structures recently added to the site:

- series

## Problem

When a blog has many posts, a pure latest-first feed is not enough.

It makes it hard to:

- onboard new readers
- expose evergreen technical articles
- surface curated reading sequences
- make the site feel intentionally organized

## Design Principles

- Keep the homepage readable and editorial, not dashboard-like.
- Use a small number of high-value curated sections.
- Reuse featured series and existing post metadata rather than creating one-off homepage data.
- Show curated sections only on page 1 of pagination.

## Recommended Homepage Structure

### Section 1: Featured series

Purpose:

- surface ordered reading sequences

Show:

- series title
- short description
- number of posts
- link to the first post

### Section 2: Latest feed

Purpose:

- preserve the existing chronological blog browsing mode

This remains the main list below curated sections.

## Data Sources

Prefer existing data:

- series inferred from posts already using `series` metadata

Avoid adding a dedicated homepage data file in the first iteration unless curation becomes more complex.

## Rendering Rules

### Featured series

- derive unique featured series from posts using `series` metadata
- resolve them to the series' first post

### Pagination

- render curated sections only on `paginator.page == 1`

## Non-Goals

- Do not replace the latest feed.
- Do not create a fully custom homepage CMS.
- Do not add too many homepage sections in one iteration.

## Risks

### Homepage clutter

Risk:

- too many sections reduce clarity

Mitigation:

- cap the number of curated cards
- keep section copy short

### Stale curation

Risk:

- homepage sections stop reflecting the best content over time

Mitigation:

- derive sections from existing series metadata
- use featured series that already have editorial meaning

## Recommended First Implementation

Implement:

1. featured series cards
2. keep the existing post list unchanged below them

This gives immediate structural improvement while minimizing new complexity.
