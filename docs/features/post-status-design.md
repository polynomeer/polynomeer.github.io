# Post Status Metadata Design

## Goal

Introduce explicit post status metadata so readers can quickly understand the maintenance state of a post.

The feature should answer:

- is this article still being written?
- is this article published and readable as a normal post?
- is this article currently being revised?
- is this article kept for reference but no longer actively maintained?

## Why This Feature Fits This Repository

This repository contains:

- stable archive-style technical posts
- iterative notes and study material
- content that may age at different speeds

Date alone is not enough to communicate whether a post is:

- still current
- being revised
- intentionally archived

## Status Model

Recommended first rollout statuses:

- `writing`
- `published`
- `modifying`
- `archived`

### Definitions

#### writing

- content is still being written
- readers should expect incomplete structure or changing scope

#### published

- content is publicly readable in its normal state
- this is the default “good to read now” status

#### modifying

- content is already public but currently under revision
- readers should expect updates, corrections, or expansion

#### archived

- content is kept for reference
- it may still be useful, but it is not actively maintained

## Metadata Contract

Use post front matter:

```yaml
status: published
```

Optional future fields:

```yaml
status_note: "Examples are being refreshed for Spring Boot 3.x."
```

For the first rollout, only `status` is required.

## Design Principles

- explicit metadata over inference
- small number of statuses
- strong visual clarity without overwhelming the post header
- graceful fallback when metadata is absent

## Rendering Model

### 1. Post page status badge

Show status near post metadata on the post page.

If a post has no `status`, do not render any status badge.

### 2. Homepage feed status badge

Show status on homepage cards only when present.

This helps users scan the feed more effectively.

### 3. Status directory page

Add `/status/` or `/statuses/` style entry points for browsing posts by status.

Recommended first implementation:

- `/statuses/`
- `/statuses/writing/`
- `/statuses/published/`
- `/statuses/modifying/`
- `/statuses/archived/`

### 4. Future search integration

Later, search results may show status chips. This is optional and not required in the first rollout.

## Data Source

Store display metadata in `_data/post_statuses.yml`.

Recommended shape:

```yaml
writing:
  title: "Writing"
  description: "Still being written and not yet fully settled."
  icon: "fas fa-pen"
  order: 1

published:
  title: "Published"
  description: "Readable normal-state content."
  icon: "fas fa-check-circle"
  order: 2

modifying:
  title: "Modifying"
  description: "Public content that is currently being revised."
  icon: "fas fa-pen-ruler"
  order: 3

archived:
  title: "Archived"
  description: "Kept for reference, not actively maintained."
  icon: "fas fa-box-archive"
  order: 4
```

## Rollout Plan

### Phase 1

- define status metadata
- add status badge rendering to post pages and homepage
- add status directory and detail pages
- apply status to a small curated set of posts

### Phase 2

- extend status usage to search and recommendation display
- add optional `status_note`

## Non-Goals

- Do not auto-assign status to all posts.
- Do not infer status purely from date.
- Do not add too many statuses.

## Risks

### Metadata drift

Risk:

- a post status becomes inaccurate over time

Mitigation:

- keep the status vocabulary small
- apply statuses only to posts where editorial intent is clear

### UI overload

Risk:

- too many badges in the post header

Mitigation:

- keep status visually compact
- place it near content type rather than inside the title line

## Recommended First Implementation

Implement:

1. `_data/post_statuses.yml`
2. post/home status badges
3. status directory and detail pages
4. a few curated sample posts with explicit `status`

This keeps the feature concrete without requiring repository-wide migration.
