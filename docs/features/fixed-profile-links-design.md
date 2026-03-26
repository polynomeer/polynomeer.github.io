# Fixed Profile Links Design

## Goal

Add fixed, always-visible profile links so visitors can quickly access:

- resume PDF
- project links
- recruiter-oriented overview pages

The feature should reduce friction for visitors who have already decided they want to learn more or contact the author.

## Why This Feature Fits This Repository

This repository already has strong long-form content and recruiter-oriented discovery features.

What it still needs is a low-friction conversion path.

Even when a visitor is convinced by the content, they should not have to search for:

- resume
- project portfolio
- recruiter overview

## Problem

Important portfolio and recruiting links are easy to bury inside:

- the About page
- scattered post content
- the recruiter page itself

That creates avoidable friction for:

- recruiters
- hiring managers
- collaborators

## Design Principles

- Keep the links visible across the site.
- Place them in a stable location, ideally the sidebar.
- Use a small number of high-value links.
- Make the structure data-driven.
- Allow a PDF resume link when the file is available, but do not require it for the feature to render.

## Data Model

Prefer a dedicated data file:

- `_data/fixed_profile_links.yml`

Recommended shape:

```yaml
enabled: true
eyebrow: "Quick Access"

items:
  - title: "Resume PDF"
    url: "/assets/files/resume.pdf"
    icon: "fas fa-file-pdf"
    external: false

  - title: "Projects"
    url: "https://github.com/polynomeer"
    icon: "fab fa-github"
    external: true

  - title: "Recruit Overview"
    url: "/recruit/"
    icon: "fas fa-user-tie"
    external: false
```

Why this model:

- keeps the feature flexible
- allows internal and external links
- avoids hardcoding portfolio URLs in templates
- supports later resume PDF addition without layout changes

## Rendering Model

Use a reusable include:

- `_includes/fixed-profile-links.html`

Recommended placement:

- inside `_includes/sidebar.html`
- below the profile summary
- above the navigation list

Each item should render as a compact CTA row with:

- icon
- title
- link target

## Selection Rules

- Show 2 to 4 links at most.
- Prefer one resume link, one project link, and one recruiter-oriented link.
- Keep labels short and concrete.
- If the resume PDF is not available yet, leave that item unconfigured rather than linking to a placeholder.

## Non-Goals

- Do not create a full portfolio page builder.
- Do not add tracking or popups.
- Do not require the resume PDF to exist before the feature can ship.
- Do not overload the sidebar with too many CTAs.

## Risks

### Sidebar clutter

Risk:

- too many buttons reduce navigation clarity

Mitigation:

- cap the number of links
- keep the block compact

### Dead resume link

Risk:

- a configured PDF path may not exist

Mitigation:

- configure the resume item only when the asset is present
- keep the data file explicit and easy to audit

## Recommended First Implementation

Implement:

1. `_data/fixed_profile_links.yml`
2. `_includes/fixed-profile-links.html`
3. sidebar integration in `_includes/sidebar.html`
4. sidebar-specific styling in `_sass/addon/commons.scss`

This creates a low-friction contact and portfolio path without changing the overall site structure.
