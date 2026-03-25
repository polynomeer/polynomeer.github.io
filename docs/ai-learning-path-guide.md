# AI Guide for Learning Path Work

Use this guide when implementing or extending learning paths in this repository.

For general repository rules, read [`AGENTS.md`](../AGENTS.md) first.

## Objective

Build goal-oriented guided reading and study paths that combine:

- roadmap pages
- topic hubs
- selected posts

## Primary Files Likely to Change

- `_data/learning_paths.yml`
- `_layouts/learning-paths.html`
- `_layouts/learning-path.html`
- `_tabs`
- `_config.yml`
- `_includes/home-curation.html`
- locale files in `_data/locales`
- style files in `_sass/layout`

## Modeling Rules

- keep paths explicit and editorial
- prefer linking to existing roadmaps and topics over copying their content
- use source post paths for curated post references when needed

## UI Guidance

- paths should feel like guided entry points
- show level and duration prominently
- keep phases ordered and scannable

## Safety Rules

- do not bulk-edit many posts
- do not duplicate roadmap logic unnecessarily
- do not redefine existing topic hubs as paths

## Validation

Before finishing:

1. confirm `/paths/` renders all sample paths
2. confirm each path detail page resolves roadmap, topic, and post links cleanly
3. confirm homepage curation still renders without layout regression
4. run `bundle exec jekyll build` when feasible

## Recommended First Task

The safest first implementation is:

1. add the learning path data file
2. add collection layouts and sample entries
3. add a homepage curation section

