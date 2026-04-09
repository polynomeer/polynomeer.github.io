# Home Feed Ordering Policy

## Goal

Define a homepage feed ordering policy that serves two purposes at the same time:

- keep the homepage easy to predict
- make the feed reflect original publication chronology

## Recommended Ordering Rule

Homepage posts should be ordered by:

1. visible posts only
2. `date` descending

## Rationale

The homepage should behave like a straightforward chronological feed.

## Reader Experience

Readers should be able to assume that:

- newer posts appear first
- the feed does not jump because of hidden editorial scoring
- the visible order matches the post creation date in front matter

## Operational Rules

### Date Is The Only Ordering Signal

The homepage feed should not reorder posts by:

- `last_modified_at`
- pinning
- manual feature weighting

If a post needs more visibility, that should be solved through:

- dedicated navigation
- series pages
- representative post surfaces
- recruiter-specific surfaces

## Non-Goals

- This policy does not try to rank by popularity.
- This policy does not distinguish between `Notes` and `TIL`.

If the homepage later needs stronger editorial curation, that should be introduced as a separate surface above the feed, not by changing chronological ordering.

## Implementation Guidance

The homepage layout should:

- exclude hidden posts
- sort visible posts by `date`
- paginate after that ordering is applied

Implementation should remain compatible with the current Jekyll static build model.
