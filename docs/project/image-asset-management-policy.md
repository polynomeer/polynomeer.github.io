# Image Asset Management Policy

This document defines how image assets should be handled in this repository as the number of posts and screenshots grows.

The main goal is to prevent `assets/img/posts` from growing into an unreviewed dump of large original files.

## Why This Matters

For this repository, image growth is one of the easiest ways to make the site heavier without noticing immediately.

Large post images affect:

- repository size
- `_site` output size
- deployment weight
- browser load time
- long-term maintenance cost

This is especially relevant because the blog already includes many technical screenshots and diagram-style images.

## Scope

This policy applies to:

- `assets/img/posts`
- post-level screenshots
- post-level diagrams exported as raster images
- temporary editorial images before publication

## Preferred Rules

### 1. Do Not Commit Large Originals By Default

Do not commit the raw original export if a smaller derivative is enough for the post.

Preferred workflow:

1. keep the original outside the repository if it is only an editing source
2. generate a web-sized version for the post
3. commit only the version that is actually used by the site

### 2. Use One Canonical Published Asset Per Visual

Avoid keeping multiple nearly identical screenshots in the repository unless the post genuinely needs the comparison.

Bad pattern:

- `diagram-final.png`
- `diagram-final-2.png`
- `diagram-final-fixed.png`

Preferred pattern:

- one published file with a stable descriptive name

### 3. Prefer Compression Before Commit

Before committing a post image:

- crop unnecessary whitespace
- reduce dimensions if the image is much larger than the rendered width
- export in a web-friendly format when quality allows

### 4. Keep Naming Explicit

Use descriptive filenames tied to the post topic.

Good examples:

- `redis-server.png`
- `layered-cache.png`
- `stake-system-sequence.png`

Avoid opaque filenames such as:

- `image1.png`
- `final-final.png`
- `screenshot.png`

## Review Thresholds

These are repository operating thresholds, not absolute bans.

### Acceptable By Default

- under `300 KB`

### Review Before Commit

- `300 KB` to `800 KB`

Ask:

- does the post really need this resolution?
- can the file be cropped or compressed further?

### Strong Review Required

- over `800 KB`

Files in this range should be treated as exceptions. They usually need a deliberate reason.

## Audit Workflow

Use the repository audit script:

- [`scripts/audit-post-images.sh`](../../scripts/audit-post-images.sh)

It reports post image sizes and highlights files that exceed the repository review thresholds.

Recommended usage:

```bash
bash scripts/audit-post-images.sh
```

Optional custom thresholds:

```bash
bash scripts/audit-post-images.sh 300 800
```

The arguments are:

1. warning threshold in KB
2. critical review threshold in KB

## Operational Guidance

### When Adding a New Image

- check whether a similar image already exists
- optimize before commit
- keep only the published derivative in the repo

### When Editing an Existing Post

- do not replace a stable image file casually if the change is not intentional
- if the image is much too large, optimize it in a dedicated change

### During Periodic Maintenance

Review:

- largest files in `assets/img/posts`
- duplicates or near-duplicates
- old oversized screenshots from earlier writing phases

## Decision Rule

For this repository:

- a few medium-sized screenshots are fine
- repeated oversized images are not
- if image growth starts to dominate `_site` size, optimize assets before changing the site architecture
