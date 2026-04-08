# Home Feed Ordering Policy

## Goal

Define a homepage feed ordering policy that serves two purposes at the same time:

- help recruiters quickly see the strongest and most actively maintained writing
- help general readers discover useful technical posts instead of only the newest file by creation date

## Why This Policy Exists

In this repository, many posts use `date` as the post's original creation date.

That makes a plain `date desc` feed less useful for the homepage because:

- older but recently improved notes may still be more valuable than newly created drafts
- recruiters care more about representative and recently maintained content than raw chronology
- visitors benefit from seeing currently active, maintained technical writing near the top

## Recommended Ordering Rule

Homepage posts should be ordered in this priority:

1. pinned posts first
2. all other visible posts sorted by `last_modified_at` descending

When `last_modified_at` is missing, fall back to `date`.

## Rationale

### Pinned Posts

Pinned posts are the explicit editorial override.

Use them sparingly for:

- cornerstone posts
- recruiter-relevant entry points
- posts that should always remain visible regardless of update cadence

### Last Modified Ordering

For the non-pinned feed, `last_modified_at` better reflects the actual editorial signal than creation date.

It helps the homepage answer:

- what has been actively maintained recently?
- which notes or articles did the author recently improve?
- what content is currently alive rather than only historically published?

This is especially useful when the blog contains:

- evergreen notes
- rewritten technical explanations
- long-running structured series

## Reader Experience

### Recruiter Perspective

Recruiters typically spend little time on a blog.

This policy increases the chance that they see:

- curated pinned posts first
- recently updated technical articles next

That is stronger than a pure creation-date feed when the blog is used as part portfolio and part knowledge base.

### General Reader Perspective

General readers often care more about useful and maintained content than about the exact publish date.

Sorting by `last_modified_at` makes the homepage feel more current without requiring all valuable posts to be newly created.

## Operational Rules

### When to Pin

Pin only when a post should remain intentionally near the top for editorial reasons.

Do not use `pin` to compensate for weak metadata or poor homepage structure.

### When Last Modified Should Change

`last_modified_at` should reflect meaningful edits such as:

- substantial content rewrites
- corrected technical explanations
- updated architecture or implementation details
- improved examples or structure

It should not be treated as a cosmetic bump signal.

### Fallback Rule

If `last_modified_at` is absent, order the post by `date`.

This keeps older untouched posts stable while still allowing actively maintained posts to rise.

## Non-Goals

- This policy does not try to rank by popularity.
- This policy does not replace pins with a fully dynamic scoring model.
- This policy does not distinguish between `Notes` and `TIL` in the first iteration.

If the homepage later needs a stronger editorial layer, that should be introduced as a separate ranking policy.

## Implementation Guidance

The homepage layout should:

- collect pinned posts first
- collect non-pinned and non-hidden posts separately
- sort non-pinned posts by `last_modified_at | default: date`
- paginate after that ordering is applied

Implementation should remain compatible with the current Jekyll static build model.

## Future Extensions

Possible later refinements:

- separate pinned posts from editorially featured but unpinned posts
- blend `last_modified_at` with content type weighting
- add a dedicated homepage curation band above the feed

These should be treated as separate policy changes, not part of the baseline rule.
