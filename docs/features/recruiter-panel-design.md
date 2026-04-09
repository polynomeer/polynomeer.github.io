# Recruiter Panel Design

## Goal

Turn the right-side panel into a recruiter-oriented quick-evaluation surface.

The panel should help a visitor answer:

- where should I start if I am evaluating this author quickly?
- which posts best represent their strengths?
- what evidence and structured paths support those strengths?
- where can I go next without exploring the whole site?

## Why This Feature Fits This Repository

The repository already has:

- recruit mode
- representative posts
- capability map
- series

The right-side panel is the most persistent desktop-side discovery surface.

That makes it the best place for compact recruiter-oriented navigation and proof signals.

## Problem

The current panel model emphasizes:

- recent updates
- trending tags

Those are useful for general browsing, but weak for recruiter-oriented evaluation.

A hiring manager benefits more from:

- recruiter CTA
- flagship posts
- strengths summary
- evidence counts
- structured follow-up paths

## Design Principles

- Keep sections compact and scannable.
- Prefer proof and navigation over generic taxonomy.
- Reuse existing curated data where possible.
- Show high-signal sections before low-signal sections.
- Optimize for desktop panel use, not full-page browsing.

## Recommended Panel Stack

### 1. For Recruiters

Purpose:

- provide an immediate recruiter-specific entry point

Show:

- short summary
- link to `/recruit/`
- one or two action links such as email or capability map

### 2. Representative Posts

Purpose:

- surface flagship writing samples directly

Reuse:

- `_data/representative_posts.yml`

### 3. Core Strengths

Purpose:

- summarize technical strengths at a glance

Reuse:

- recruiter strength data from `_data/recruit_mode.yml`

### 4. Reading Path for Recruiters

Purpose:

- provide a short, intentional evaluation sequence

Recommended flow:

1. recruiter overview
2. capability map
3. representative posts or series

### 5. Proof Signals

Purpose:

- show compact quantitative context

Recommended metrics:

- total posts
- representative posts
- series
- recruit-focused posts

### 6. Featured Series

Purpose:

- provide one structured next step for deeper reading

Show:

- one featured series

## Data Model

Use one panel-specific file for recruiter-panel-only content:

- `_data/recruiter_panel.yml`

Reuse:

- `_data/recruit_mode.yml`
- `_data/representative_posts.yml`

Recommended shape:

```yaml
enabled: true

for_recruiters:
  summary: "Start here for a recruiter-friendly overview."
  links:
    - title: "Recruit Overview"
      url: "/recruit/"
    - title: "Capability Map"
      url: "/capabilities/"

reading_path:
  - title: "See the recruiter overview"
    url: "/recruit/"
  - title: "Review the capability map"
    url: "/capabilities/"
  - title: "Follow the featured series"
    url: "/series/"

featured:
  series:
    id: "authentication-basics"
```

## Rendering Model

Use one orchestration include:

- `_includes/recruiter-panel-stack.html`

And small focused includes:

- `_includes/recruiter-panel.html`
- `_includes/core-strengths-panel.html`
- `_includes/reading-path-panel.html`
- `_includes/proof-signals-panel.html`
- `_includes/featured-focus-panel.html`

Recommended placement:

- inside `_layouts/default.html`
- in the desktop panel column
- before low-priority sections such as trending tags

## Non-Goals

- Do not create an interactive dashboard.
- Do not move core content out of the main page area.
- Do not auto-score recruiter relevance for all content.
- Do not overload the panel with long descriptions.

## Risks

### Panel overload

Risk:

- too many sections make the panel noisy

Mitigation:

- keep each section compact
- use short lists and small counts

### Data duplication

Risk:

- recruiter panel content drifts from recruit mode and representative posts

Mitigation:

- reuse existing shared data wherever possible
- reserve panel-specific data only for panel-specific flows

## Recommended First Implementation

Implement:

1. `_data/recruiter_panel.yml`
2. panel section includes
3. integration in `_layouts/default.html`
4. locale labels for panel headings and proof signals

This turns the right-side panel into a high-signal recruiter surface without changing the main content model.
