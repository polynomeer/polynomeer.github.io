# AI Guide for Capability Map Graph Work

Use this guide when changing the capability map feature in this repository.

For general repository rules, read [`AGENTS.md`](../../../AGENTS.md) first.

## Current Direction

The capability map is a curated knowledge graph, not an automatic taxonomy page.

That means:

- nodes are editorial
- edges are editorial
- positions are editorial

Do not infer graph structure from tags, categories, or search data unless the user explicitly asks for automation.

## Source Of Truth

Primary data file:

- [`_data/capability_map.yml`](../../../_data/capability_map.yml)

Primary layout:

- [`_layouts/capability-map.html`](../../../_layouts/capability-map.html)

Primary styles:

- [`_sass/layout/post.scss`](../../../_sass/layout/post.scss)

Likely locale files:

- [`_data/locales/ko-KR.yml`](../../../_data/locales/ko-KR.yml)
- [`_data/locales/en.yml`](../../../_data/locales/en.yml)

## Safe Data Model Rules

Every node should have:

- `id`
- `title`
- `summary`
- `icon`
- `x`
- `y`

Edges should reference valid node ids only.

If you add:

- `related_series`
- `supporting_links`
- `representative_posts`

make sure links resolve and degrade gracefully when targets are missing.

## Rendering Rules

- Use lightweight JavaScript only for state switching.
- Keep all important content in server-rendered HTML.
- Do not depend on external graph libraries for the first-party capability map.
- Avoid making the page unusable when JavaScript is disabled.

## Preferred Interaction Model

- one selected node at a time
- edge highlighting based on the selected node
- detail panel updates on click
- compact, readable mobile fallback

Avoid:

- drag physics
- zoom-heavy controls
- dozens of nodes

## Validation Checklist

Before finishing:

1. verify node buttons render and are clickable
2. verify the initial selected node matches `default_focus`
3. verify edge highlighting updates with selection
4. verify representative post links resolve
5. run `bundle exec jekyll build` when feasible

## Common Mistakes

- treating the capability graph like a generic chart widget
- adding too many nodes
- relying on JS for content that should be rendered in HTML
- leaving broken references in `edges`
- making nodes overlap visually on mobile
