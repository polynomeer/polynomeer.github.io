# Chirpy Upstream Upgrade Plan

This document describes how to evaluate and selectively adopt upstream changes from [`cotes2020/jekyll-theme-chirpy`](https://github.com/cotes2020/jekyll-theme-chirpy) for this repository.

It is written for this repository's current state, not for a clean upstream fork.

## Current Baseline

- original fork basis: `v7.1.0`
- current upstream checked: `v7.5.0`
- repository type: heavily customized Chirpy-based blog

This repository is no longer close to stock Chirpy.

It includes substantial custom work in:

- sidebar and topbar behavior
- homepage feed ordering and filtering
- multilingual UI switching
- custom search shaping
- notes-first content taxonomy
- archives, representative posts, and recruiter/profile surfaces
- Supabase likes, comments, and pageviews

Because of this, upstream adoption must be selective.

## Main Conclusion

Do not perform a blind merge from upstream `v7.1.0 -> v7.5.0`.

Recommended approach:

1. identify low-conflict upstream improvements
2. adopt them in small batches
3. manually port high-value fixes from high-conflict files
4. avoid replacing customized core templates wholesale

## Why A Full Merge Is Risky

The following core files were changed both upstream and locally:

- `_config.yml`
- `_layouts/default.html`
- `_layouts/home.html`
- `_layouts/post.html`
- `_includes/sidebar.html`
- `_includes/topbar.html`
- `_includes/search-loader.html`
- `_includes/search-results.html`
- `_includes/related-posts.html`
- `_includes/toc.html`
- `_includes/mode-toggle.html`
- `_includes/js-selector.html`
- `_sass/addon/commons.scss`
- `_sass/colors/syntax-dark.scss`
- `_sass/colors/typography-dark.scss`
- `assets/js/data/search.json`

These files define the repository's current behavior and brand-specific structure.

Replacing them directly with upstream versions would likely break:

- the Korean-first UI localization model
- custom sidebar and theme controls
- the notes-first discovery model
- custom recruiter/profile features
- current build and search optimizations

## Upgrade Risk Levels

### Low-Conflict Candidates

These are usually safe to review and adopt first:

- GitHub workflow improvements under `.github/workflows/`
- tooling updates in `Gemfile`, `package.json`, `eslint.config.js`, `rollup.config.js`
- new locale files under `_data/locales/`
- favicon updates under `assets/img/favicons/`
- newly added optional analytics or embed include files that do not affect current behavior until enabled

Typical handling:

- compare upstream changes directly
- adopt or skip file-by-file
- test locally after each small batch

### Medium-Conflict Candidates

These can often be adopted, but only after manual review:

- `_includes/datetime.html`
- `_includes/post-description.html`
- `_includes/post-paginator.html`
- `_includes/no-linenos.html`
- `_includes/refactor-content.html`
- `_includes/media-url.html`
- `_includes/mermaid.html`
- `_includes/head.html`
- selected JavaScript modules that are not tightly coupled to the customized UI

Typical handling:

- inspect upstream intent
- manually port the relevant logic
- do not overwrite local customization directly

### High-Conflict Candidates

These should not be directly merged without a dedicated review branch and line-by-line reconciliation:

- `_layouts/default.html`
- `_layouts/home.html`
- `_layouts/post.html`
- `_includes/sidebar.html`
- `_includes/topbar.html`
- `_includes/search-loader.html`
- `_includes/search-results.html`
- `_includes/related-posts.html`
- `_includes/toc.html`
- `_includes/mode-toggle.html`
- `_sass/addon/commons.scss`
- `_sass/colors/syntax-dark.scss`
- `_sass/colors/typography-dark.scss`
- `assets/js/data/search.json`
- `_config.yml`

Typical handling:

- do not fast-merge
- review upstream diff for bug fixes or accessibility improvements
- port only the necessary logic into the local customized implementation

## Recommended Upgrade Order

### Phase 1. Tooling and CI

Target:

- `.github/workflows/*`
- `Gemfile`
- `package.json`
- `eslint.config.js`
- `rollup.config.js`

Goal:

- reduce maintenance drift
- keep the local development toolchain reasonably current

### Phase 2. Static Assets and Non-Core Includes

Target:

- favicons
- newly introduced optional include files
- low-impact helpers

Goal:

- adopt improvements that do not interfere with current site behavior

### Phase 3. Locale and Content Infrastructure

Target:

- newly added locale files
- locale key additions that do not collide heavily with current custom keys

Goal:

- reduce future maintenance friction without disturbing the custom language switch behavior

### Phase 4. Manual Porting Of High-Value Fixes

Target:

- accessibility fixes
- bug fixes
- performance fixes
- search or navigation fixes that are relevant to the current customized templates

Goal:

- capture upstream value without surrendering repository-specific behavior

This phase should be done by reading upstream diffs and reimplementing only what is needed.

### Phase 5. Core Template Review

Target:

- `default`, `home`, `post`, `sidebar`, `topbar`, search, TOC, mode toggle

Goal:

- decide whether any structural upstream change is worth integrating

This is the most expensive phase and should only be attempted after the lower-risk phases are complete.

## Merge Strategy Rules

Use these rules when applying upstream changes:

1. prefer file-by-file review over branch merge
2. never overwrite customized files just because upstream is newer
3. preserve repository-local behavior unless upstream clearly fixes a real problem
4. isolate each upgrade batch in its own commit
5. verify locally after each batch

## What Should Be Checked During Review

For every upstream candidate:

- does it touch a customized layout or include?
- does it change rendering behavior that the current blog already overrides?
- does it conflict with Korean-first localization?
- does it increase or decrease build cost?
- does it assume stock Chirpy information architecture that this repository no longer follows?

If the answer is "yes" to several of these, treat it as a manual port, not a merge.

## Suggested First Batch

The first real upgrade batch should focus only on low-conflict areas:

- `.github/workflows/*`
- favicon files
- selected tooling files

This gives the repository a safe baseline before evaluating more invasive upstream changes.

## Decision Rule

For this repository:

- use upstream as a source of reviewed improvements
- do not treat upstream as a state that must be fully re-synced
- prefer selective adoption over version parity
