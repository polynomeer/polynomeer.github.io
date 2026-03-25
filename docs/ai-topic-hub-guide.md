# AI Guide for Topic Hub Work

Use this document when implementing or extending topic hub functionality in this repository.

For general repository rules, read [`AGENTS.md`](../AGENTS.md) first.

## Purpose

Topic hubs are curated subject landing pages.

They are not:

- simple category pages
- ordered series pages
- roadmap pages

They should combine:

- editorial context
- featured reads
- related series
- related roadmaps
- a broader set of matched posts

## Primary Data Sources

- `_data/topic_hubs.yml`
- `_topics/*`
- `site.posts`
- `_data/roadmaps.yml`

Use existing post metadata first:

- `categories`
- `tags`
- `series`
- `roadmaps`

Avoid introducing a required new post field for the first implementation.

## Files Likely to Change

Primary:

- `_config.yml`
- `_data/topic_hubs.yml`
- `_layouts/topic-hubs.html`
- `_layouts/topic-hub.html`
- `_tabs/topics.md`
- `_topics/*.md`
- locale files in `_data/locales`

Possible:

- `_sass/layout/post.scss`
- `_includes`

## Matching Rules

A post can be matched to a topic hub if:

- its categories intersect the hub categories
- its tags intersect the hub tags
- its `series` appears in `featured_series`
- its `roadmaps` intersect the hub's `featured_roadmaps`

Prefer centralized hub definitions over per-post topic annotations in the first rollout.

## UI Rules

Directory page should show:

- icon
- title
- short description
- post count

Detail page should show:

- summary
- start-here content
- featured roadmaps
- featured series
- matched posts

Do not render a topic hub as a raw archive-style list only.

## Safety Rules

- Do not bulk-edit posts to introduce topic hub metadata unless asked.
- Do not duplicate category pages under a different name.
- Keep topic hub descriptions curated and concise.
- Use a small number of hubs at first.

## Validation

Before finishing:

1. ensure the new hub pages are reachable from a top-level tab or index page
2. ensure pages still render if a hub has no matched series or roadmaps
3. avoid breaking builds when a hub references missing ids
4. run `bundle exec jekyll build` when feasible

## Recommended First Step

The safest first implementation is:

1. add `_data/topic_hubs.yml`
2. add topic hub directory and detail layouts
3. match posts using existing category and tag metadata

This gives useful discovery pages without requiring content migration.

