# Learning Path Design

## Status

This feature remains implemented, but it is no longer the primary public navigation model.

Current repository direction:

- `roadmaps` are the main structured discovery surface
- `learning paths` are legacy or niche guided sequences kept only when they add value beyond a roadmap

## Goal

Introduce curated learning paths that guide readers through a recommended study order.

Unlike a roadmap, which groups posts around a topic area, a learning path should answer:

- where should I start?
- what should I read next?
- which roadmap or topic hub supports this phase?

## Positioning

Use the following distinction:

- `topic hub`: broad landing page for a subject
- `roadmap`: structured topic-level reading sequence
- `learning path`: goal-oriented guided journey for a reader persona

Learning paths should sit above roadmaps and topics.

## Reader-Focused Use Cases

Examples:

- backend beginner path
- secure authentication study path
- database internals reading path

Each path should combine:

- selected roadmap links
- selected topic hub links
- a small number of explicit post recommendations

## Metadata Model

Store path metadata in `_data/learning_paths.yml`.

Recommended shape:

```yml
backend-foundations:
  title: "Backend Foundations Path"
  description: "Start with request flow, authentication, transport security, and timeout basics."
  icon: "fas fa-route"
  audience: "Readers building their first backend fundamentals map."
  level: "Beginner"
  duration: "1-2 weeks"
  order: 1
  phases:
    - title: "Identity and trust"
      description: "Understand authentication, authorization, and token-based access."
      roadmaps: [backend-core, security-foundations]
      topics: [backend-foundations]
      posts:
        - _posts/archive/authentication/2024-09-07-authentication.md
        - _posts/archive/authentication/2024-09-07-token-authentication.md
```

## Rendering Model

### 1. Learning path directory

Add:

- `/paths/`

This page should show:

- title
- description
- level
- duration
- phase count

### 2. Learning path detail page

Add:

- `/paths/<path-id>/`

This page should show:

- hero summary
- audience / level / duration metadata
- ordered phases
- links to related roadmaps
- links to related topic hubs
- links to selected posts

### 3. Homepage curation

Add a home section that highlights a few learning paths.

This gives new readers a clearer “start here” option than raw chronology.

## Design Principles

- reader goal first
- explicit ordering over inferred relationships
- reuse existing roadmap and topic assets
- keep the first rollout small and editorially curated

## Rollout Plan

### Phase 1

- create learning path collection and data
- add directory and detail pages
- add homepage curation section
- create 2-3 initial sample paths

### Phase 2

- show related learning paths on post pages
- expose path metadata in search
- add richer progress markers

## Non-Goals

- do not auto-generate paths from tags
- do not migrate all posts into path metadata
- do not replace roadmaps

## Risks

### Overlap with roadmaps

Risk:

- users may not understand the difference between paths and roadmaps

Mitigation:

- keep the copy explicit
- make paths reader-goal-oriented
- make roadmaps topic-oriented

### Maintenance cost

Risk:

- curated paths can drift as new content is added

Mitigation:

- start with a small number of paths
- reuse stable roadmap and topic pages instead of hand-linking too many posts

## Recommended First Implementation

Implement:

1. `_data/learning_paths.yml`
2. `learning_paths` collection with directory and detail layouts
3. home curation section
4. a few high-signal starter paths
