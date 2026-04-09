# AI Learning Evidence Guide

This guide explains how AI agents should maintain the learning evidence feature.

Use this together with:

- `AGENTS.md`
- `docs/features/learning-evidence-design.md`

## Scope

This feature has two levels:

- overview page at `/learning-evidence/`
- detail pages for individual learning items

## Source of Truth

- `_data/learning_evidence.yml`
  - grouped metadata
  - source post paths
  - related post paths
- `_learning_evidence_items/`
  - stable routes for detail pages
- `_layouts/learning-evidence.html`
  - overview rendering
- `_layouts/learning-evidence-item.html`
  - detail rendering

## Editing Rules

- Keep the overview page compact and scan-oriented.
- Do not reintroduce long summaries and post lists into the index.
- Use the detail page for source study posts and related result posts.
- Keep each collection page minimal and keyed by `item_id`.
- Prefer explicit post links over inferred relationships.

## Safe Change Pattern

When adding a new learning item:

1. add the item to `_data/learning_evidence.yml`
2. add a matching page in `_learning_evidence_items/`
3. verify the overview page links to the detail page
4. verify source and related posts resolve correctly

## Debug Checklist

If a learning item does not show up:

1. confirm the item exists in `_data/learning_evidence.yml`
2. confirm the detail page exists in `_learning_evidence_items/`
3. confirm the item ids match exactly
4. confirm linked post paths match `site.posts` paths

## Visual Rules

- Overview pages should feel shelf-like, compact, and colorful.
- Detail pages should feel editorial and explanatory.
- Keep group-level organization visible on the overview page.
