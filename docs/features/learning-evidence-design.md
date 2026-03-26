# Learning Evidence Design

## Goal

Add a dedicated page that shows learning outcomes as a connected record of:

- courses taken
- books read
- related posts written from that study

The page should make it easy for a visitor to understand not only what was consumed, but what was turned into reusable output.

## Why This Feature Fits This Repository

This repository already has clear content types for:

- `book`
- `lecture`
- `archive`
- `reference`

It also has recruiter-oriented surfaces such as:

- About hub
- Recruit mode
- Capability map

A learning evidence page fits naturally between those systems.

It would answer a different question from ordinary post browsing:

- what learning investments were made, and what concrete artifacts came out of them?

## Problem

Right now, books, lectures, and follow-up posts are spread across different directories and browsing modes.

That makes it hard to see:

- which books or lectures were actually completed
- which later posts were produced from that learning
- how learning turned into blog output and technical growth

This is especially valuable for:

- recruiters
- portfolio reviewers
- readers who want to see long-term learning discipline

## Design Principles

- Show learning as input and output together.
- Prefer explicit editorial links over inferred automation in the first iteration.
- Reuse existing post structure instead of migrating old content.
- Keep the page readable as a portfolio surface, not a raw log dump.
- Make it easy to extend over time.

## Recommended Page Positioning

Add a dedicated page linked from `About`.

Recommended route:

- `/learning-evidence/`

This keeps the page profile-oriented without turning it into a top-level navigation priority for all readers.

## Content Model

The page should represent one learning item as a bundle:

- source type
- title
- provider or author
- period or status
- short takeaway summary
- related posts produced from that study

Supported source types:

- `course`
- `book`
- optional later types such as `conference` or `study-group`

## Data Model

Prefer a dedicated data file:

- `_data/learning_evidence.yml`

Recommended shape:

```yaml
enabled: true

groups:
  - id: backend-systems
    title: "Backend and Systems Learning"
    description: "Books and courses that shaped backend, Spring, database, and architecture understanding."
    items:
      - id: spring-mvc-basic
        type: course
        title: "모든 개발자를 위한 HTTP 웹 기본 지식"
        provider: "Inflearn"
        status: completed
        period: "2024"
        summary: "Built stronger grounding in HTTP semantics and request-response reasoning."
        source_posts:
          - "_posts/lecture/http/모든_개발자를_위한_HTTP_웹_기본_지식.md"
        related_posts:
          - "_posts/archive/web/2025-08-22-error-handling.md"
          - "_posts/archive/web/2026-02-13-presigned-url.md"

      - id: fundamentals-software-architecture
        type: book
        title: "Fundamentals of Software Architecture"
        provider: "O'Reilly"
        status: in_progress
        period: "2025"
        summary: "Studied architectural characteristics and tradeoff-driven design."
        source_posts:
          - "_posts/book/fundamentals-of-software-architecture/2025-05-13-fundamentals-of-software-architecture-chap2.md"
        related_posts:
          - "_posts/archive/common/2026-03-20-architectural-decisions.md"
```

Why this model:

- explicit and reviewable
- works across books and courses
- captures both learning inputs and writing outputs
- does not require retrofitting every existing post

## Rendering Model

Recommended files:

- `_data/learning_evidence.yml`
- `_layouts/learning-evidence.html`
- `_tabs/learning-evidence.md` or a standalone page linked from About

### Page structure

#### 1. Hero

Explain what the page is:

- long-term learning inputs
- written outputs
- evidence of growth and synthesis

#### 2. Grouped sections

Group items by a few broad themes such as:

- backend and systems
- Java and Spring
- architecture and design
- hiring and career growth

#### 3. Item cards

Each item card should show:

- type badge such as book or course
- title
- provider/author
- status
- short summary
- source study posts
- related output posts

## Linking Rules

### Source study posts

Use for direct notes from the book or course itself.

Examples:

- `_posts/book/...`
- `_posts/lecture/...`

### Related output posts

Use for later posts that clearly show the learning being applied or extended.

Examples:

- archive posts
- recruit/interview preparation posts
- roadmap-linked technical articles

## Selection Rules

- Start with 5 to 10 high-signal learning items.
- Prefer items that produced visible writing output.
- Keep summaries short and outcome-oriented.
- Do not try to list every single chapter note in the first version.
- Group by meaning, not by provider brand alone.

## Non-Goals

- Do not auto-infer relationships from file paths in the first iteration.
- Do not create a full study log dashboard.
- Do not require every book or lecture post to be included.
- Do not replace existing `book` or `lecture` browsing modes.

## Risks

### Too much raw history

Risk:

- the page can become a long undifferentiated archive

Mitigation:

- curate only strong items first
- emphasize related output posts

### Weak relationship quality

Risk:

- related posts may feel loosely connected

Mitigation:

- keep relationships explicit in the data file
- choose only clear evidence links

### Duplicate navigation

Risk:

- the page may overlap with About, Recruit, and Capability Map

Mitigation:

- position this page as learning input/output evidence
- keep Recruit focused on evaluation
- keep Capability Map focused on strengths

## Recommended First Implementation

Implement:

1. `_data/learning_evidence.yml`
2. one dedicated page linked from `About`
3. grouped cards for books and courses
4. explicit related-post links showing learning outputs

This gives the blog a strong "learning turns into artifacts" surface without requiring a large migration.
