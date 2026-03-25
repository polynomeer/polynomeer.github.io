# AI Guide for Search Enhancement Work

Use this guide when improving search behavior in this repository.

For general repository rules, read [`AGENTS.md`](../AGENTS.md) first.

## Search Architecture

Search currently relies on:

- a generated JSON index
- Simple Jekyll Search on the client
- a lightweight search result view

Primary files:

- [`assets/js/data/search.json`](../assets/js/data/search.json)
- [`_includes/search-loader.html`](../_includes/search-loader.html)
- [`_includes/search-results.html`](../_includes/search-results.html)
- [`_javascript/modules/components/search-display.js`](../_javascript/modules/components/search-display.js)
- [`_sass/addon/commons.scss`](../_sass/addon/commons.scss)

## Preferred Strategy

Improve search in this order:

1. enrich indexed metadata
2. improve result rendering
3. improve search UI state handling
4. only then consider engine replacement or deeper ranking changes

## Good Metadata to Add

- `series`
- `series_title`
- `roadmaps`
- `topics`
- formatted date label

These are useful even if ranking stays simple.

## Topic Derivation

Topic membership should be derived from `_data/topic_hubs.yml`, not manually duplicated into every post.

## UI Rules

Search results should help the user choose quickly.

Show:

- title
- date
- categories
- tags
- compact chips for series, roadmap, topic
- snippet

Avoid:

- very large cards
- long explanatory text
- duplicated metadata noise

## State Handling

When the query is cleared:

- clear rendered results
- clear result count
- restore hints

Be careful not to use `textContent` where `value` is intended for input elements.

## Validation

Before finishing:

1. confirm old posts still appear in search
2. confirm posts with series/roadmap metadata render richer search cards
3. confirm empty query resets UI correctly
4. run `bundle exec jekyll build` when feasible

## Recommended First Task

Safest first implementation:

1. enrich the JSON index
2. improve the template in `_includes/search-loader.html`
3. add a result count area in `_includes/search-results.html`

This gives visible improvement without rewriting the search engine.

