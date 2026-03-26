# Search Enhancement Design

## Goal

Improve on-site search so that users can identify the right result faster, not just retrieve a list of vaguely matching posts.

The current search already works, but it is limited by:

- sparse result presentation
- no visibility into series, roadmap, or topic context
- limited metadata in the search index

This design improves both search data quality and result readability.

## Current Baseline

Search is currently powered by:

- [`assets/js/data/search.json`](../assets/js/data/search.json)
- [`_includes/search-loader.html`](../_includes/search-loader.html)
- [`_includes/search-results.html`](../_includes/search-results.html)
- search display support in [`_javascript/modules/components/search-display.js`](../_javascript/modules/components/search-display.js)

It indexes:

- title
- url
- categories
- tags
- date
- snippet
- full content

It displays:

- title
- categories
- tags
- snippet

## Problems to Solve

### Problem 1: Results lack selection context

Users often need to know:

- whether the result is part of a series
- whether it belongs to a roadmap
- which topic hub it fits into
- how recent it is

### Problem 2: Search results look too similar

When many results share broad categories or common keywords, the result list does not help users distinguish which article is the best entry point.

### Problem 3: Search state is too minimal

The UI currently does not clearly indicate:

- how many results were found
- whether the query is empty versus unmatched

## Design Principles

- Keep the search fully static and client-side.
- Improve retrieval context before replacing the search engine itself.
- Reuse the metadata already introduced for series, roadmaps, and topic hubs.
- Keep fallback behavior intact for older posts with sparse metadata.

## Data Model Changes

Extend `search.json` to include:

- `series`
- `series_title`
- `roadmaps`
- `topics`
- `date_label`

These fields improve rendering and optional future ranking.

## Rendering Improvements

Each search result should show:

- title
- formatted date
- categories
- tags
- optional chips for series, roadmap, and topic context
- snippet

This turns search from a plain list into a decision-friendly result view.

## Topic Context in Search Index

Topic hub membership should be derived at build time from `_data/topic_hubs.yml`.

This avoids requiring new topic metadata on every post.

## UI Enhancements

### Search summary

Add a summary area above results showing:

- result count for the current query

### Empty and reset behavior

When query is cleared:

- restore hints cleanly
- clear previous result count

## Rollout Plan

### Phase 1

- enrich `search.json`
- improve result card template
- add result count summary

### Phase 2

- add optional highlighting or matched reason labels
- tune result ordering if needed

## Non-Goals

- Do not replace Simple Jekyll Search in this iteration.
- Do not add server-backed full text search.
- Do not implement advanced ranking unless the current improvements prove insufficient.

## Recommended First Implementation

Implement the following first:

1. add series, roadmap, and topic metadata to `search.json`
2. improve search result template
3. add result count summary
4. fix small UX gaps in search state reset

This gives immediate user-facing improvement with a small surface area.

