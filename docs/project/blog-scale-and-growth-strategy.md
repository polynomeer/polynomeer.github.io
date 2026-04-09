# Blog Scale and Growth Strategy

This document defines when the current Jekyll-based blog structure is likely to become difficult to operate, what symptoms to watch for, and how to respond before a full platform migration becomes necessary.

It is specific to this repository, not to Jekyll blogs in general.

## Why This Repository Will Feel Heavier Over Time

This repository is not a plain chronological blog.

It includes additional computed surfaces and metadata-driven pages such as:

- homepage feed ordering and filtering
- archives with yearly grouping and filter UI
- types, topics, and roadmaps
- representative post curation
- recruiter-oriented profile surfaces
- search metadata generation
- Git-based `last_modified_at` handling

These features improve discovery, but they also increase the amount of content scanning performed during build time and the amount of data pushed to the browser at runtime.

In practice, the repository will usually hit operational friction from:

1. repeated `site.posts` scans in Liquid
2. growing client-side search payloads
3. cumulative image and asset weight
4. slow feedback loops during local editing

Not from the raw post count alone.

## Repository-Specific Pressure Points

### 1. Homepage Feed Assembly

Current homepage behavior in [`_layouts/home.html`](../../_layouts/home.html):

- pinned posts are separated first
- remaining posts are reordered by `last_modified_at` or `date`
- feed metadata for client-side filtering is serialized into the page

This is manageable while the post set is moderate, but it scales linearly with the size of `site.posts` and also increases page HTML size.

### 2. Archives Generation

Current archive behavior in [`_layouts/archives.html`](../../_layouts/archives.html):

- all posts are grouped by year
- content type summaries are computed per year
- archive highlight cards are assembled
- filter metadata is embedded for runtime filtering

This page is one of the first places where a large repository starts to feel heavy because it combines global content iteration with a relatively dense UI.

### 3. Search Payload Growth

Current search behavior depends on generated data in:

- [`assets/js/data/search.json`](../../assets/js/data/search.json)
- [`_includes/search-loader.html`](../../_includes/search-loader.html)

Search quality improves as more fields are indexed, but payload size grows with:

- number of posts
- body excerpt length
- extra metadata fields
- multilingual labels

This affects both build time and browser-side responsiveness.

### 4. Taxonomy Surfaces

Pages such as:

- [`_layouts/content-types.html`](../../_layouts/content-types.html)
- [`_layouts/topic-hubs.html`](../../_layouts/topic-hubs.html)
- [`_layouts/roadmaps.html`](../../_layouts/roadmaps.html)

become more expensive as posts accumulate because each surface needs to derive membership counts, card lists, and relationships from the post corpus.

### 5. Git-Based Last Modified Metadata

The repository uses a custom hook:

- [`_plugins/posts-lastmod-hook.rb`](../../_plugins/posts-lastmod-hook.rb)

to derive `last_modified_at` from Git history. This is useful editorially, but it adds extra work to post initialization and should be treated as part of the scaling budget.

### 6. Static Asset Growth

Over time, images are likely to outgrow Markdown and Liquid costs.

Typical asset problems:

- high-resolution screenshots committed directly into `assets/img/posts`
- duplicated images with only slight variants
- older posts retaining oversized original images

When this happens, deploy size and browser weight often degrade before Liquid becomes the main problem.

## Practical Thresholds

These are repository-specific operational thresholds, not hard technical limits.

### Stage 1. Comfortable Range

Approximate state:

- under `300` published posts
- search payload remains modest
- local build loop remains tolerable

Expected action:

- continue with the current architecture
- keep Liquid logic disciplined
- avoid adding unnecessary derived surfaces

### Stage 2. Optimization Range

Approximate state:

- around `300` to `500` posts
- local builds feel noticeably slower
- archive and taxonomy pages become heavier
- search JSON starts becoming meaningfully large

Expected action:

- optimize before adding more discovery features
- reduce repeated `site.posts` scans
- trim search payload fields
- tighten image discipline

This is the range where proactive maintenance matters most.

### Stage 3. Segmentation Range

Approximate state:

- around `500` to `800` posts
- editorial maintenance slows down
- old problem-solving or legacy study posts dilute the main site
- static output size becomes harder to ignore

Expected action:

- separate cold content from the main reading path
- consider reducing what the main site indexes by default
- treat older content as archival rather than equal-priority homepage material

### Stage 4. Platform Reconsideration Range

Approximate state:

- `800+` posts
- slow build feedback becomes part of day-to-day work
- search and archive surfaces are expensive to maintain
- static output and asset footprint are consistently large

Expected action:

- reassess whether Jekyll plus heavy Liquid remains the right fit
- compare against a more scalable content pipeline or hybrid static architecture

This does not automatically require migration, but it is the point where migration becomes a serious engineering option rather than a theoretical one.

## Symptoms That Matter More Than Post Count

Do not make decisions based only on the number of posts.

Use these concrete signals:

- local `bundle exec jekyll build` frequently takes long enough to interrupt writing flow
- editing one post causes noticeable delay before the local site is usable
- `search.json` grows large enough to make first-load search interaction feel sluggish
- archive and taxonomy pages become visibly heavy in the browser
- `_site` becomes cumbersome to generate, inspect, or deploy

If these symptoms appear earlier than expected, respond to the symptoms rather than waiting for a threshold.

## Recommended Response Order

The repository should respond in stages.

### 1. Optimize the Existing Jekyll Structure First

Preferred first moves:

- remove redundant global loops in Liquid
- cache reusable includes where possible
- keep derived metadata explicit in `_data` when that reduces repeated computation
- keep homepage logic focused on the main feed, not on global editorial aggregation

This is usually cheaper and safer than a platform migration.

### 2. Control Search Scope

Do not let search indexing become a dumping ground.

Preferred actions:

- keep only the metadata that materially helps discovery
- shorten indexed excerpts if needed
- avoid serializing large multilingual or structured fields into the search payload when the UI does not need them
- consider separating full-text search from lightweight default search if payload growth becomes significant

### 3. Segment Content by Temperature

This repository already distinguishes content types through path-based classification. Use that structure operationally.

Recommended approach:

- keep the main site focused on high-value `Notes`, `TIL`, and profile-oriented content
- treat older algorithm or legacy study content as lower-priority discovery content
- reduce how aggressively older material is surfaced on the homepage and recruiter-facing surfaces

This preserves value without forcing every old post to remain a first-class homepage candidate.

### 4. Enforce Asset Discipline

Recommended practices:

- prefer optimized web-sized images
- avoid committing oversized originals when a compressed derivative is enough
- use one canonical image per concept where possible
- periodically review `assets/img/posts` for oversized or duplicate assets

If the site feels heavy in deployment or browser load, this is often the highest-leverage fix.

### 5. Introduce Separate Archive Boundaries If Needed

If content volume keeps growing, consider a split such as:

- primary blog for current and representative content
- legacy archive for older problem-solving or historical notes

This can be done without abandoning the current repository immediately.

Possible approaches:

- keep all content in the repo, but reduce default indexing and default navigation weight for legacy areas
- move legacy content to a separate static archive site
- preserve old URLs with redirects if content is physically separated later

### 6. Reevaluate the Platform Only After Operational Mitigation

Only after the above measures stop being enough should the repository consider moving beyond the current structure.

At that point, likely candidates are:

- a faster static site generator
- a hybrid rendering model with stronger content indexing control
- a split architecture where the main site and archival site have different optimization goals

## Recommended Operational Policy For This Repository

For this repository specifically:

1. keep the current Jekyll architecture while the site remains under sustained operational pressure
2. treat `300` to `500` posts as the optimization window
3. treat `500` to `800` posts as the point to review archive segmentation
4. treat `800+` posts as the point to reassess the platform itself

This policy assumes:

- continued use of multilingual UI text
- continued use of search, archives, topics, roadmaps, and profile surfaces
- continued accumulation of image-backed technical notes

## Maintenance Checklist

Review these periodically:

- build time for `bundle exec jekyll build`
- responsiveness of `bundle exec jekyll serve --incremental`
- generated size and field scope of `assets/js/data/search.json`
- cost of homepage and archive generation
- number and size of images in `assets/img/posts`
- whether older content still deserves equal discovery weight

## Decision Rule

Use this rule when deciding whether to stay with the current architecture or escalate:

- if the site is still pleasant to edit and search remains light, optimize locally and continue
- if editing flow slows down but remains acceptable, optimize and segment content
- if the editorial workflow itself is impaired, start planning a structural split or a platform change

The right time to react is before build latency becomes normal.
