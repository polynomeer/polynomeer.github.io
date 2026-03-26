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
- roadmaps
- topic hubs

## Problem

When a blog has many posts, a pure latest-first feed is not enough.

It makes it hard to:

- onboard new readers
- expose evergreen technical articles
- surface curated learning paths
- make the site feel intentionally organized

## Design Principles

- Keep the homepage readable and editorial, not dashboard-like.
- Use a small number of high-value curated sections.
- Reuse topic hubs, roadmaps, and featured series rather than creating one-off homepage data.
- Show curated sections only on page 1 of pagination.

## Recommended Homepage Structure

### Section 1: Topic hubs

Purpose:

- help readers pick a subject area quickly

Show:

- top 3 topic hubs
- icon
- title
- description

### Section 2: Roadmaps

Purpose:

- show readers structured reading paths

Show:

- top roadmap cards
- title
- short description

### Section 3: Featured series

Purpose:

- surface ordered reading sequences

Show:

- series title
- short description
- number of posts
- link to the first post

### Section 4: Latest feed

Purpose:

- preserve the existing chronological blog browsing mode

This remains the main list below curated sections.

## Data Sources

Prefer existing data:

- topic hubs from `_data/topic_hubs.yml`
- roadmaps from `_data/roadmaps.yml`
- series inferred from posts already using `series` metadata

Avoid adding a dedicated homepage data file in the first iteration unless curation becomes more complex.

## Rendering Rules

### Topic hubs

- use the first 3 topic hubs sorted by `order`

### Roadmaps

- use the first 2 or 3 roadmap pages sorted by `order`

### Featured series

- derive unique featured series from topic hub definitions
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

- derive sections from existing topic hub and roadmap data
- use featured series that already have editorial meaning

## Recommended First Implementation

Implement:

1. topic hub cards
2. roadmap cards
3. featured series cards
4. keep the existing post list unchanged below them

This gives immediate structural improvement while minimizing new complexity.

