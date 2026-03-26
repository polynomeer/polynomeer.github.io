# Recommendation Quality Improvement Design

## Goal

Improve the quality of related post recommendations so they reflect semantic proximity better than basic tag and category overlap alone.

The current logic in [`_includes/related-posts.html`](../_includes/related-posts.html) is simple and useful, but limited:

- it uses only tags and categories
- it treats all matches as shallow overlap
- it does not use the new `series`, `roadmaps`, or topic hub context

The new design should produce more context-aware recommendations while remaining fully static and Jekyll-compatible.

## Why This Feature Fits This Repository

This repository now has multiple layers of content structure:

- categories
- tags
- series
- roadmaps
- topic hubs

Recommendation quality should leverage those layers so that:

- a post in a series recommends adjacent or same-series content first
- posts in the same roadmap feel connected
- topic-adjacent articles are surfaced even when tags are inconsistent

## Non-Goals

- Do not introduce dynamic recommendation services.
- Do not add a backend or external indexing system.
- Do not require full-site content migration before improvement can work.

## Design Principles

- Prefer stronger editorial signals over weaker taxonomy overlap.
- Keep logic deterministic and transparent.
- Avoid dramatic complexity that makes Liquid templates hard to maintain.
- Preserve graceful fallback behavior for older posts with sparse metadata.

## Ranking Signals

Recommended scoring hierarchy:

### Strong signals

- same `series`
- same `roadmaps`
- same topic hub matches

### Medium signals

- shared tags
- shared categories

### Support signals

- recency as a tie-breaker
- post quality hints in future, if such metadata is introduced

## Proposed Score Model

Example weights:

- same series: `+10`
- shared roadmap: `+4`
- shared topic hub: `+3`
- shared tag: `+1.5`
- shared category: `+0.75`

Optional tie-breakers:

- newer date wins when scores are equal
- lower distance in `series_order` can be favored for same-series posts

The exact numbers can be tuned later, but the relative hierarchy matters more than the absolute values.

## Recommendation Rules

### Rule 1: Prefer same-series recommendations

If the current post belongs to a series, posts from the same series should almost always outrank tag-only matches.

### Rule 2: Prefer roadmap-near content

If the current post belongs to one or more roadmaps, posts from the same roadmap should receive a meaningful boost.

### Rule 3: Use topic hub overlap as a semantic fallback

When tags are noisy or sparse, topic hub overlap provides a stronger subject-level signal than raw taxonomy alone.

### Rule 4: Preserve fallback behavior

If a post has no series, no roadmap, and no hub overlap, tag and category scoring should still work.

## Matching Model

### Series

A candidate shares series with the current page when:

- `post.series == page.series`

### Roadmaps

A candidate shares roadmap context when:

- `post.roadmaps` intersects `page.roadmaps`

### Topic hubs

A post shares topic hub context when both posts match at least one same topic hub definition.

Initial implementation can derive topic hub matches from `_data/topic_hubs.yml` by checking:

- category overlap with hub categories
- tag overlap with hub tags
- series listed in `featured_series`
- roadmap overlap with `featured_roadmaps`

## Display Improvements

Recommendations should not only rank better, but also communicate why the recommendation is relevant.

Suggested lightweight display metadata on each card:

- series badge when in same series
- roadmap badge when same roadmap matched
- topic badge when topic hub matched

The first rollout may keep display minimal and improve only ranking. Badges can follow immediately after if the template remains maintainable.

## Rollout Plan

### Phase 1

- improve ranking logic
- include series, roadmaps, and topic hub overlap
- keep card design mostly unchanged

### Phase 2

- add recommendation reason badges
- add same-series continuity emphasis

### Phase 3

- use reading path context from roadmaps to suggest "next best" content

## Risks

### Overfitting to sparse metadata

Risk:

- some posts have only category and tag metadata

Mitigation:

- keep tag/category scoring as fallback

### Liquid complexity

Risk:

- recommendation logic becomes unreadable inside one include

Mitigation:

- keep signal blocks clearly separated
- prefer small helper includes only if complexity grows further

### Duplicate semantics

Risk:

- series, roadmaps, and topic hubs may all push the same candidates

Mitigation:

- this is acceptable because those are strong semantic matches
- cap result size and sort by total score

## Recommended First Implementation

Upgrade the current related-posts include to:

1. score same-series candidates much higher
2. add roadmap overlap scoring
3. add topic hub overlap scoring
4. keep tag/category scoring as fallback

This yields an immediate recommendation quality jump without redesigning the entire component.

