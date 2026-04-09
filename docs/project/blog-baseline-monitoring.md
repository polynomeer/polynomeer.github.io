# Blog Baseline Monitoring

This document defines what should be measured regularly in this repository so growth issues are noticed before they become normal.

It complements:

- [`blog-scale-and-growth-strategy.md`](./blog-scale-and-growth-strategy.md)
- [`image-asset-management-policy.md`](./image-asset-management-policy.md)

## Why Baselines Matter

The repository already has enough moving parts that subjective impressions are not enough.

Examples:

- a build can feel slow without being clearly measured
- search can become heavier over time without anyone noticing the payload growth
- `_site` can inflate gradually because of assets and generated pages

For this reason, operational decisions should be based on a small set of recurring measurements.

## What To Track

### 1. Build Time

Track:

- `bundle exec jekyll build`

Goal:

- preserve a local feedback loop that still feels usable during writing and layout work

Warning sign:

- build time starts to interrupt normal edit-and-refresh flow

### 2. Search Payload Size

Track:

- `_site/assets/js/data/search.json`

Goal:

- keep browser-side search responsive

Warning sign:

- the generated search index becomes large enough that initial search feels sluggish

### 3. Generated Site Size

Track:

- `_site`

Goal:

- keep output size reasonable for inspection and deployment

Warning sign:

- site output grows faster than content value

### 4. Post Image Weight

Track:

- `assets/img/posts`

Goal:

- prevent screenshots and diagrams from dominating repository weight

Warning sign:

- large images appear repeatedly without review

### 5. Content Mix

Track:

- total post count
- posts by top-level content path such as `notes`, `TIL`, `problemsolving`, `recruit`

Goal:

- understand whether growth is concentrated in the core blog or in archival content

Warning sign:

- older low-priority content dominates growth but still affects primary discovery surfaces

## Recommended Cadence

### Light Review

Run after:

- a migration batch
- a large content import
- a large image-heavy writing session

### Periodic Review

Run:

- before major theme or search changes
- before making claims about build regressions
- before deciding to split the archive or change the platform

## Reporting Script

Use:

- [`scripts/blog-health-report.sh`](../../scripts/blog-health-report.sh)

Basic usage:

```bash
bash scripts/blog-health-report.sh
```

Build-and-measure usage:

```bash
bash scripts/blog-health-report.sh --build
```

The script reports:

- total post count by top-level post directory
- current `assets/img/posts` size
- current `_site` size if present
- current generated search index size if present
- optional build duration when `--build` is used

## Practical Decision Rule

Use the measurements this way:

- if build time stays acceptable and payloads are modest, continue with local optimization
- if search or `_site` grows faster than expected, tighten indexing and asset rules
- if build time and generated size both rise while editorial flow slows down, move from optimization into content segmentation planning
