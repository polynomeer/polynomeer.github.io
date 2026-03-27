# Representative Posts Curation Design

## Goal

Add an explicit curation layer for the blog's most representative posts.

The feature should help visitors answer:

- what are the strongest technical proof points on this blog?
- where should a first-time visitor start?
- which posts best represent the author's core engineering strengths?

## Why This Feature Fits This Repository

This repository already includes:

- topic hubs
- roadmaps
- content type badges
- recruiter-oriented entry points

Those structures help visitors explore deeply.

Representative post curation solves a different problem:

- picking a small number of flagship articles
- surfacing them consistently across the site
- avoiding reliance on latest-first or tag-frequency browsing

## Problem

Without explicit curation, high-value posts can be hidden by:

- chronology
- mixed content types
- uneven tag distribution
- ongoing archive growth

This is especially costly for:

- recruiters
- first-time readers
- visitors who want to assess technical depth quickly

## Design Principles

- Keep the list explicit and editorial.
- Prefer stability over automation.
- Reuse existing post metadata and badges.
- Allow the same curated list to appear in multiple surfaces.
- Avoid requiring per-post schema changes in the first iteration.

## Recommended Use Cases

### 1. Recruit mode

Use representative posts as the primary proof block in `/recruit/`.

### 2. Right-side panel

Show a compact list in the desktop panel so visitors can jump directly to flagship writing.

### 3. Future homepage curation

The same data can later be reused for homepage spotlight sections if needed.

## Data Model

Prefer one central data file:

- `_data/representative_posts.yml`

Recommended shape:

```yaml
enabled: true
description: High-signal writing samples that best represent the blog.

items:
  - path: "_posts/notes/database/2025-07-29-mvcc.md"
    summary: "Shows database concurrency understanding through a core transactional consistency topic."
    capability: "Database internals"
    surfaces: [recruit, panel]

  - path: "_posts/notes/spring/2025-06-30-spring-lifecycle.md"
    summary: "Highlights practical Spring runtime knowledge beyond superficial framework usage."
    capability: "Spring backend"
    surfaces: [recruit, panel]
```

Why this model:

- keeps curation explicit
- avoids editing posts
- lets different surfaces reuse the same list
- supports compact and detailed rendering modes

## Rendering Model

Use one reusable include:

- `_includes/representative-posts.html`

Recommended include inputs:

- `lang`
- `surface`
- `variant`
- `limit`

### Detailed variant

Use for recruiter-facing or dedicated content sections.

Show:

- title
- content type badge
- optional status badge
- capability label
- short summary

### Compact variant

Use for the right-side panel.

Show:

- section title
- 3 to 5 post links
- optional short capability label

## Selection Rules

- Use explicit post paths only.
- Prefer evergreen posts over recent but unproven posts.
- Keep the list small, ideally 4 to 6 flagship items.
- Maintain a balanced mix across core strengths such as database, Spring, architecture, and troubleshooting.
- Use `surfaces` to control where an item appears if different lists are needed later.

## Non-Goals

- Do not auto-rank all posts for representativeness.
- Do not replace topic hubs or roadmaps.
- Do not require front matter additions across the archive.
- Do not create a separate content collection just for flagship posts.

## Risks

### Stale curation

Risk:

- older posts may remain featured after better posts are published

Mitigation:

- keep the list short
- review it when publishing a new flagship article

### Overlap with recruit mode

Risk:

- representative posts and recruiter curation may diverge

Mitigation:

- make recruit mode consume the shared representative post data

### Panel clutter

Risk:

- adding another panel section may reduce scannability

Mitigation:

- keep the panel variant compact
- cap the number of items

## Recommended First Implementation

Implement:

1. `_data/representative_posts.yml`
2. `_includes/representative-posts.html`
3. compact rendering in the right-side panel
4. detailed rendering in `Recruit Mode`

This gives one curated source of truth and makes the blog's strongest posts easier to discover immediately.
