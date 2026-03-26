# Problem Decision Result Card Design

## Goal

Add a compact proof-oriented summary block to selected posts.

The feature should help readers answer:

- what problem was being solved?
- what decision was made?
- what result or consequence followed?

This is especially useful for recruiters and first-time visitors who want to understand engineering judgment quickly without reading the full post first.

## Why This Feature Fits This Repository

This blog already includes:

- recruiter mode
- representative posts
- topic hubs
- roadmaps
- long-form technical explanations

Those structures help users find important content.

The Problem → Decision → Result card helps them evaluate the quality of thinking inside a post once they arrive there.

## Problem

Many technical posts communicate valuable reasoning, but the signal is buried in long-form prose.

That makes it harder for a visitor to quickly see:

- the actual engineering problem
- the decision process or tradeoff
- the observable outcome

For hiring-focused reading, this summary layer is often more important than the full narrative on a first pass.

## Design Principles

- Keep the feature opt-in at the post level.
- Do not require changes to existing posts.
- Keep the summary concise and factual.
- Place the card near the top of the post.
- Treat it as a framing aid, not a replacement for the article body.

## Data Model

Use post front matter.

Recommended shape:

```yaml
problem_decision_result:
  problem: "A single sequence table became a hotspot under concurrent key generation."
  decision: "Split allocation responsibility and reduce lock contention instead of scaling writes on the same row."
  result: "Improved throughput and made the key-generation path less sensitive to contention spikes."
```

Why this model:

- local to the post
- easy to understand in review
- no extra data file required
- works well for selective adoption

## Rendering Model

Use a reusable include:

- `_includes/problem-decision-result.html`

Render it in the post layout near the top of the article:

- after the post header
- before the main content

### Card structure

Show three cards or rows:

- Problem
- Decision
- Result

Each item should:

- have a clear label
- support one concise paragraph
- render only when that field exists

If fewer than three fields exist, show only the provided ones.

## Selection Rules

- Use this feature on posts that describe engineering tradeoffs, incidents, architecture choices, or performance work.
- Keep each field brief, ideally one or two sentences.
- Prefer concrete language over abstract claims.
- Use it on representative posts first if rollout should stay small.

## Non-Goals

- Do not force this onto every post.
- Do not turn it into a full case-study template.
- Do not replace the post description or excerpt system.
- Do not create a separate collection or data file.

## Risks

### Repetition

Risk:

- the summary may repeat the post introduction

Mitigation:

- keep the card more concrete and outcome-oriented than the general description

### Weak summaries

Risk:

- vague or marketing-heavy text reduces credibility

Mitigation:

- keep wording factual
- emphasize tradeoffs and observed outcomes

### Layout noise

Risk:

- too many top-of-post blocks may crowd the page

Mitigation:

- keep the card visually compact
- render only when front matter exists

## Recommended First Implementation

Implement:

1. `_includes/problem-decision-result.html`
2. post layout integration in `_layouts/post.html`
3. styles in `_sass/layout/post.scss`
4. locale labels for `Problem`, `Decision`, and `Result`

This adds a high-signal summary layer without changing the existing content model.
