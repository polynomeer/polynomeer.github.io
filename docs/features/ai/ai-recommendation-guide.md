# AI Guide for Recommendation Quality Work

Use this guide when updating related post recommendation behavior in this repository.

For general repository rules, read [`AGENTS.md`](../../../AGENTS.md) first.

## Current Baseline

The current related-post logic is implemented in:

- [`_includes/related-posts.html`](../_includes/related-posts.html)

It currently uses:

- category overlap
- tag overlap

This should be treated as the baseline fallback behavior.

## Improvement Targets

Recommendation ranking should now consider:

- series overlap
- tags
- categories

In that order of importance.

## Preferred Implementation Style

- Keep the logic deterministic.
- Keep the output static.
- Avoid introducing plugins unless truly necessary.
- Prefer one include update over a plugin-heavy solution.

## Scoring Guidance

Suggested priorities:

- same series > shared tags > shared categories

Exact weights may vary, but do not let category-only matches outrank same-series matches.

## UI Guidance

If display enhancements are added, prefer lightweight badges such as:

- `Series`

Do not add large explanatory text blocks inside each recommendation card.

## Validation

Before finishing:

1. confirm posts without series metadata still get recommendations
2. confirm same-series posts rank above weak taxonomy matches
3. confirm recommendation size remains bounded
4. run `bundle exec jekyll build` when feasible

## Common Mistakes

- overcomplicating the template before proving value
- breaking fallback recommendations for sparse posts
- duplicating the current page in results
- relying on one taxonomy only when richer metadata already exists

## Recommended First Task

Update [`_includes/related-posts.html`](../_includes/related-posts.html) so that ranking uses:

1. same series
2. shared tags
3. shared categories

This is the highest-value improvement with the smallest surface area.
