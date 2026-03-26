# Topic Hub Feature Design

## Goal

Topic hubs provide curated entry pages for major subject areas in the blog.

Unlike:

- `series`, which focuses on ordered post sequences
- `roadmaps`, which focus on learning paths

topic hubs focus on discoverability and orientation.

They answer questions such as:

- "Where should I start with Redis on this blog?"
- "What are the key Spring posts here?"
- "Which articles belong to backend fundamentals versus database internals?"

## Why This Feature Fits This Repository

This repository already has:

- many posts
- category and tag archives
- series and roadmap support

However, category and tag pages are still low-context listing pages.

Topic hubs fill the gap by adding:

- editorial summaries
- curated starting points
- grouped related content
- explicit connections between posts, series, and roadmaps

## Non-Goals

- Do not replace categories or tags.
- Do not force all posts into a topic hub.
- Do not require per-post migration for initial rollout.
- Do not introduce dynamic search or a database-backed index.

## Design Principles

- Curated over automatic: topic hubs should feel intentional, not like another archive page.
- Static-first: generate with Jekyll only.
- Metadata-light rollout: use existing categories, tags, series, and roadmaps before requiring new post fields.
- Incremental: start with a small number of strong topic hubs.

## Information Model

### Topic hub definition

Store hub metadata in `_data/topic_hubs.yml`.

Recommended shape:

```yaml
backend-foundations:
  title: "Backend Foundations"
  description: "Start here for the core concepts behind backend systems."
  icon: "fas fa-server"
  order: 1
  categories:
    - Authentication
    - Network
    - Spring
  tags:
    - Timeout
    - TLS
  featured_series:
    - authentication-basics
  featured_roadmaps:
    - backend-core
  featured_posts:
    - /posts/authentication/
```

This model supports:

- broad automatic collection using categories and tags
- curated highlights through explicit featured items
- integration with the series and roadmap features

### Topic hub pages

Use a dedicated Jekyll collection such as `_topics`.

Each topic page should contain:

- `topic_hub_id`
- `title`
- `permalink`
- `order`

Minimal example:

```yaml
---
title: Backend Foundations
topic_hub_id: backend-foundations
permalink: /topics/backend-foundations/
order: 1
---
```

## Rendering Model

### 1. Topic hub directory page

Add a top-level `/topics/` page listing all topic hubs.

Each card should show:

- title
- short description
- optional icon
- rough post count
- link to detail page

### 2. Topic hub detail page

Each topic page should render:

- topic summary
- featured roadmaps
- featured series
- featured posts
- automatically matched posts

Recommended section order:

1. Why this topic matters
2. Start here
3. Related roadmaps
4. Series in this topic
5. Core posts
6. Additional reading

### 3. Future post-level integration

Later, posts may show a small "topic hubs" block, but this is not required for initial rollout.

## Matching Strategy

### Automatic matching

A post belongs to a topic hub when any of these are true:

- it has a category listed in the hub definition
- it has a tag listed in the hub definition
- it belongs to a series listed in `featured_series`
- it belongs to a roadmap listed in `featured_roadmaps`

This lets topic hubs become useful without touching many posts.

### Curated highlights

Use explicit lists for:

- `featured_posts`
- `featured_series`
- `featured_roadmaps`

These should appear before automatically matched long-tail posts.

## Sorting Rules

### Topic hub directory

- use `order` from `_data/topic_hubs.yml` or the topic page front matter

### Posts inside a hub

Recommended order:

1. featured posts
2. featured series
3. featured roadmaps
4. remaining matched posts sorted by date descending

## Rollout Plan

### Phase 1

- add `_data/topic_hubs.yml`
- add topic collection
- add `/topics/` page
- add topic detail pages

### Phase 2

- improve topic page grouping
- add better featured sections
- connect hubs with series and roadmap pages

### Phase 3

- add post-level topic hub references
- improve recommendation logic using topic hubs

## Good First Hubs for This Repository

- `backend-foundations`
- `spring-backend`
- `database-internals`

These are broad enough to matter and aligned with the repository's existing content.

## Risks

### Topic overlap

Risk:

- one post may fit multiple hubs

Mitigation:

- allow overlap
- rely on curated descriptions to clarify each hub's purpose

### Archive duplication

Risk:

- hub pages may feel like richer category pages

Mitigation:

- require editorial copy and featured sections
- do not render topic hubs as plain post lists

### Metadata sprawl

Risk:

- too many content classification systems create confusion

Mitigation:

- keep the semantics clear:
  - category = taxonomy bucket
  - tag = keyword
  - series = ordered sequence
  - roadmap = learning path
  - topic hub = curated topic landing page

## Recommended First Implementation

Implement topic hubs using data-driven matching first.

This avoids large post migrations and makes the feature immediately useful with the content already in the repository.

