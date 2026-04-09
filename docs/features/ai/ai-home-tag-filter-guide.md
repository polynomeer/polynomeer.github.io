# AI Guide for Homepage Tag Filter Work

Use this guide when adding or refining the homepage tag picker and tag-based feed filtering.

For repository-wide constraints, read [`AGENTS.md`](../../../AGENTS.md) first.

## Objective

Add a homepage tag picker that filters the feed without overloading the filter bar.

## Primary Files

- [`_layouts/home.html`](../../../_layouts/home.html)
- [`_sass/layout/home.scss`](../../../_sass/layout/home.scss)
- [`assets/js/data/home-feed.json`](../../../assets/js/data/home-feed.json)
- locale files under [`_data/locales`](../../../_data/locales)

## Interaction Model

- one selected tag at a time
- popup opened from a filter-bar button
- selecting a tag applies immediately
- reset clears tag, search, and type filters together

## Data Guidance

Do not pull tag options from the entire repository if homepage feed rules already exclude some posts.

Prefer deriving tag options from the same dataset the homepage feed uses. This keeps:

- tag counts accurate for the current feed universe
- popup options aligned with the actual filterable posts

## Rendering Guidance

The popup should:

- feel like part of the homepage filter system
- stay compact
- highlight selected state clearly
- support keyboard dismissal

Avoid turning it into a second tags index page.

## Filtering Rules

Apply tag filtering together with existing homepage filters using AND semantics.

The result set should be based on:

- search query
- selected content type
- selected tag

## Validation

Before finishing:

1. open the homepage
2. confirm the popup opens and closes normally
3. confirm tag selection filters the feed
4. confirm reset clears the selected tag
5. confirm empty state appears when no posts match
6. run `bundle exec jekyll build` when feasible

## Safe First Scope

Keep the first version limited to:

- single selected tag
- client-side popup
- client-side filtering

Do not add URL query syncing or multi-tag logic in the first pass unless explicitly requested.
