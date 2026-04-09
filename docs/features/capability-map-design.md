# Capability Map Design

## Goal

Add a capability-oriented directory page that helps visitors understand the author's engineering strengths as a structured map.

The feature should help visitors answer:

- what technical areas does this blog demonstrate strongly?
- which posts provide evidence for each capability?
- where can I go next for deeper reading in the same area?

## Why This Feature Fits This Repository

This repository already has:

- series
- representative posts
- recruit mode

Those features organize content by reading sequence or recruiter journey.

A capability map organizes the same content by demonstrated engineering strength.

That is especially useful for:

- recruiters
- hiring managers
- first-time visitors evaluating fit quickly

## Problem

Visitors can discover content through chronology, tags, topics, or curated pages, but those paths do not directly answer:

- what can this author actually do well?

Without a capability-oriented surface, readers must infer strengths from many separate posts.

## Design Principles

- Keep the capability model explicit and editorial.
- Reuse existing series and representative posts.
- Focus on evidence, not self-description alone.
- Keep the page compact enough for fast scanning.
- Avoid introducing a separate collection.

## Data Model

Prefer a dedicated data file:

- `_data/capability_map.yml`

Recommended shape:

```yaml
enabled: true

items:
  - id: database-internals
    title: "Database Internals"
    summary: "Transactions, MVCC, locks, and replication behavior."
    icon: "fas fa-database"
    series_url: "/series/"
    representative_posts:
      - "_posts/notes/database/2025-07-29-mvcc.md"
      - "_posts/notes/database/2025-07-29-gap-lock.md"
```

Why this model:

- keeps capability definitions explicit
- allows curated evidence per capability
- stays stable as the archive grows
- works on static hosting

## Rendering Model

Add a dedicated page:

- `/capabilities/`

Recommended files:

- `_tabs/capabilities.md`
- `_layouts/capability-map.html`

Each capability card should show:

- title
- short summary
- one or two supporting links such as series or representative post clusters
- 2 to 3 representative posts

## Selection Rules

- Keep the capability list short, ideally 4 to 8 items.
- Prefer broad engineering strengths, not narrow keywords.
- Link each capability to concrete evidence.
- Reuse representative posts when possible.
- Use series as deeper navigation, not as the primary proof.

## Non-Goals

- Do not auto-score posts into capabilities.
- Do not replace tags, series, or recruit mode.
- Do not require all posts to declare a capability.
- Do not create a skill graph with dynamic filtering in the first iteration.

### Weak evidence

Risk:

- capability labels may look unsupported if evidence links are weak

Mitigation:

- keep the list curated
- attach only strong representative posts

### Maintenance drift

Risk:

- new strong posts may never be reflected in the map

Mitigation:

- review the map when updating representative posts

## Recommended First Implementation

Implement:

1. `_data/capability_map.yml`
2. `_layouts/capability-map.html`
3. `_tabs/capabilities.md`
4. locale labels for the capability map page

This creates a recruiter-friendly overview that reuses the current content architecture instead of replacing it.
