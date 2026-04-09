# Home Tag Filter Design

## Goal

Add a tag filter to the homepage feed without turning the top filter bar into a crowded wall of controls.

The homepage already supports fast filtering by search and content type. Tag filtering should feel lightweight and editorial, not like opening the full tags index.

## Problem

This blog has enough tags that a plain inline dropdown is not a good fit.

If every tag is rendered directly in the top filter area:

- the filter bar becomes visually noisy
- mobile layout becomes unstable
- tag discovery becomes worse, not better

## Recommended Interaction

Use a dedicated tag picker popup triggered from the homepage filter bar.

Flow:

1. visitor clicks the `Tag` filter button
2. a popup opens
3. the popup shows:
   - a small tag search input
   - popular tags first
   - the full tag list below
4. choosing a tag immediately applies the filter
5. the popup closes
6. the homepage feed refreshes to show only posts with that tag
7. the selected tag remains visible in the filter bar as a chip-like button state

## UX Rules

### Single tag first

The first implementation should support one selected tag at a time.

Reasons:

- simpler state management
- clearer meaning for readers
- easier mobile UX
- easier reset behavior

Multi-tag filtering can be added later only if there is a strong need.

### Fast apply

The popup should not require a separate Apply button.

Selecting a tag should:

- set the active tag
- rerender the filtered feed
- close the popup

### Clear selected state

The filter bar should show the selected tag directly.

Examples:

- `Tag`
- `Tag: Redis`

The popup should also visually mark the current selection.

### Easy reset

Users should be able to clear the tag filter through:

- the shared filter reset action
- clicking the selected tag again inside the popup
- optionally a clear action inside the popup header

## UI Structure

## Filter Bar

Recommended order:

- search input
- type select
- tag picker button

The tag button should behave like a compact trigger, not a full chip cloud.

## Popup

Recommended structure:

1. header
   - title
   - short helper text
   - close button
2. search input
3. popular tags section
4. all tags section
5. empty state if no tags match the search

## Visual Direction

The current theme is dark and card-based, so the popup should feel like a floating extension of the feed filter bar.

Use:

- muted dark panel background
- soft border
- slightly brighter selected chips
- compact tag chips with count badges

Avoid:

- full-screen heavy dialog styling on desktop
- giant tag walls with uneven spacing
- separate confirmation steps

## Data Source

Prefer deriving tags from the homepage feed dataset, not from the global tag pages.

Reason:

- the homepage filter should only operate on posts visible to homepage filtering logic
- the available tag set should match the actual feed dataset

Recommended data shape in `assets/js/data/home-feed.json`:

- `tags`
- `tagLabels`

At runtime, build:

- unique tag set
- usage count per tag
- popular tag subset sorted by count

## Filtering Logic

Homepage filters should use AND semantics.

Examples:

- `type = notes` and `tag = redis` => only posts matching both
- `search = cache` and `tag = redis` => only posts matching both

## Accessibility

The popup should support:

- button with `aria-expanded`
- `role="dialog"` or equivalent popup semantics
- close on `Escape`
- close on outside click
- clear focus target when opened

## Non-Goals

- Do not replace the full `/tags/` page.
- Do not support multi-tag boolean logic in the first implementation.
- Do not add server-side filtering.

## Recommended First Implementation

Implement:

1. tag trigger in the homepage filter bar
2. compact tag picker popup
3. single-tag immediate filtering
4. shared reset behavior with existing filters

This keeps the homepage compact while making tag-based exploration much faster.
