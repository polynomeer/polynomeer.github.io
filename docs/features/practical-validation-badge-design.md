# Practical Validation Badge Design

## Goal

Add explicit badges that communicate what kind of practical evidence or editorial grounding a post has.

The feature should help readers answer:

- is this post based on real-world experience or conceptual study?
- does this post describe troubleshooting, performance work, or interview preparation?
- what kind of signal should I expect before I invest time reading?

## Why This Feature Fits This Repository

This repository already separates:

- content type
- post status
- representative posts
- recruiter-oriented navigation

Those features explain what a post is.

Practical validation badges explain what kind of evidence or working context stands behind the post.

## Problem

A strong technical blog can contain many different kinds of writing:

- practical implementation experience
- troubleshooting writeups
- architecture reasoning
- interview preparation
- concept explanation

Without explicit badges, readers must infer that context from the full article.

That makes scanning slower for:

- recruiters
- first-time visitors
- readers searching for applied engineering signal

## Design Principles

- Keep badges opt-in at the post level.
- Centralize badge definitions in one data file.
- Make badge meaning clear and factual.
- Reuse the same badges across post pages and curated surfaces.
- Avoid forcing every post to declare a badge.

## Data Model

Use a shared badge definition file:

- `_data/practical_validation_badges.yml`

Use post front matter to opt in:

```yaml
validation_badges:
  - production-experience
  - troubleshooting
  - performance
```

Recommended badge definitions:

- `production-experience`
- `troubleshooting`
- `performance`
- `architecture`
- `interview-focused`
- `conceptual`

Why this model:

- clear editorial control
- no repeated display strings in posts
- easy selective adoption

## Rendering Model

Use a reusable include:

- `_includes/practical-validation-badges.html`

### Post page

Render badges near other post metadata.

Recommended placement:

- in the post header badge row

### Curated surfaces

The same include can also be reused in recruiter-oriented or representative-post surfaces.

## Selection Rules

- Use 1 to 3 badges per post.
- Prefer evidence-oriented labels over promotional labels.
- Apply `production-experience` only when the post clearly reflects real implementation or operational experience.
- Use `conceptual` when the post is mainly explanatory rather than field-driven.
- Avoid contradictory badge combinations unless they are genuinely justified.

## Non-Goals

- Do not require badges for every post.
- Do not create dedicated archive pages for each badge in the first iteration.
- Do not auto-infer badges from categories or paths.
- Do not replace content type or post status.

## Risks

### Over-labeling

Risk:

- too many badges reduce clarity

Mitigation:

- keep per-post badge count small

### Weak credibility

Risk:

- badges may feel inflated if applied carelessly

Mitigation:

- define badge meaning centrally
- keep badge names concrete

### Header clutter

Risk:

- post metadata becomes too dense

Mitigation:

- keep badge styling compact
- render only when front matter exists

## Recommended First Implementation

Implement:

1. `_data/practical_validation_badges.yml`
2. `_includes/practical-validation-badges.html`
3. post header integration in `_layouts/post.html`
4. optional reuse in representative post cards

This adds stronger scanning signal without changing the existing content structure.
