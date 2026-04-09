# Recruit Mode Design

## Goal

Add a recruiter-oriented entry mode so hiring managers can understand the author's profile, strengths, and best writing quickly.

The feature should help a recruiter answer:

- what kind of backend engineer is this?
- what are the strongest proof points on this blog?
- where can I find the resume, contact channel, and representative work?

## Why This Feature Fits This Repository

This repository already has strong long-form technical content, structured series, and content type separation.

Those features are useful for readers who want to explore deeply.

A recruiter usually has a different goal:

- limited time
- low tolerance for navigation friction
- strong interest in signal over volume

Recruit Mode should reuse the current knowledge structure, but present it as a compact proof-of-fit flow.

## Problem

The default blog experience is optimized for browsing and study.

That makes it harder for a recruiter to quickly identify:

- core technical areas
- strongest writing samples
- practical project or architecture experience
- resume and contact paths

Without a dedicated mode, high-value content can be buried behind normal chronological browsing.

## Design Principles

- Keep the default blog experience intact.
- Add a recruiter-specific path, not a site-wide redesign.
- Reuse existing content and metadata whenever possible.
- Prefer explicit editorial curation over fully automatic ranking.
- Optimize for a 1-3 minute evaluation flow.

## Recommended User Journey

### Entry points

Provide one or more lightweight entry points:

- a topbar link such as `For Recruiters`
- a sidebar CTA
- an optional homepage card in curated sections

All of these should lead to a dedicated page such as `/recruit/`.

### Recruit landing flow

The page should present information in this order:

1. concise profile summary
2. core strengths
3. representative posts
4. selected projects or architecture/problem-solving proof
5. resume and contact links

This should feel like a compact briefing page, not a second homepage.

## Page Structure

### 1. Hero summary

Show:

- name or author identity
- one-sentence professional summary
- target roles such as backend engineer or platform engineer
- years of experience or current focus if available

### 2. Strength snapshot

Show 3-6 curated capability cards such as:

- Spring and backend architecture
- database internals and transactions
- performance and troubleshooting
- system design and distributed systems

Each card should link to either:

- a series page
- a representative post

### 3. Featured proof posts

Show a small set of high-signal posts.

Recommended count:

- 4 to 6 posts

Each card should show:

- title
- short why-it-matters summary
- content type badge
- optional post status badge

Recommended editorial mix:

- one deep database article
- one Spring/backend internals article
- one performance or troubleshooting article
- one architecture or design article

### 4. Project and artifact section

Show links to:

- GitHub profile
- selected repositories
- resume PDF
- portfolio or project writeups if available

This section should prioritize direct action over explanation.

### 5. Contact and next step

Show:

- email
- GitHub
- optional LinkedIn or other preferred hiring channel

Keep the CTA simple and visible.

## Data Model

Use two explicit data sources:

- `_data/recruit_mode.yml` for hero, strengths, links, and recruiter-specific paths
- `_data/representative_posts.yml` for the shared flagship post list

Recommended shape:

```yaml
enabled: true
hero:
  eyebrow: "For Recruiters"
  title: "Backend engineer focused on reliable systems and technical writing"
  summary: "Builds maintainable backend systems and explains design tradeoffs clearly."
  roles:
    - "Backend Engineer"
    - "Platform Engineer"
  resume_url: "/assets/files/resume.pdf"
  contact_email: "polynomeer@naver.com"

strengths:
  - title: "Database Internals"
    description: "Transactions, MVCC, locks, replication, and storage behavior."
    url: "/series/"
  - title: "Spring Backend"
    description: "Lifecycle, annotations, transaction boundaries, and application structure."
    url: "/series/"

featured_links:
  - title: "GitHub"
    url: "https://github.com/polynomeer"
  - title: "Resume"
    url: "/assets/files/resume.pdf"
```

Why this model:

- keeps recruiter-specific content explicit
- reuses one shared representative-post list across the site
- avoids editing many posts
- works on static hosting
- supports gradual rollout

## Rendering Model

### Recruit landing page

Add a dedicated page rendered from data:

- `_tabs/recruit.md` if it should live in top-level navigation
- or a standalone page if it should be linked more selectively

Recommended layout options:

- start by reusing `page` layout with a dedicated include
- create a dedicated `recruit-mode` layout only if the page structure becomes large

### Reusable include

Prefer a reusable include such as:

- `_includes/recruit-mode.html`
- `_includes/representative-posts.html`

This keeps the page implementation narrow and consistent with current repository patterns.

### Optional post-level support

Later iterations may add a recruiter signal summary on selected posts, such as:

- why this post matters
- what capability it demonstrates

That should remain optional and should not block the landing page rollout.

## Selection Rules

### Strength cards

- use manually curated items from `_data/recruit_mode.yml`
- prefer links to existing series and representative posts
- cap at 6 items

### Featured posts

- use the shared representative post list from `_data/representative_posts.yml`
- keep the representative list explicit and stable
- prefer evergreen and technically deep posts
- avoid using newest-first logic

### External links

- keep links explicit in data
- prefer resume, GitHub, and one additional hiring channel at most

## Non-Goals

- Do not replace the homepage.
- Do not fork the whole site into separate recruiter and reader themes.
- Do not auto-score all posts for hiring relevance in the first iteration.
- Do not require front matter edits across the full post archive.

## Risks

### Over-marketing

Risk:

- the page may feel like self-promotion rather than engineering signal

Mitigation:

- keep copy factual
- link to concrete technical proof
- avoid exaggerated claims

### Curation drift

Risk:

- the recruiter page becomes stale as better posts are published

Mitigation:

- use a short explicit featured list
- review the page when a new flagship article is published

### Navigation clutter

Risk:

- adding another top-level entry may compete with existing tabs

Mitigation:

- start with one clear entry point
- keep the page compact and role-specific

## Recommended First Implementation

Implement:

1. `_data/recruit_mode.yml`
2. `_data/representative_posts.yml`
3. one `/recruit/` landing page
4. a reusable include to render hero, strengths, links, and structured paths
5. a reusable representative-posts include for proof content
6. one clear navigation entry such as `For Recruiters`

This gives a high-signal recruiter flow without changing the rest of the blog model.
