# Blog Development and Operations Guide

This document is the main handbook for developing and operating the customized blog features in this repository.

It complements the feature-specific design docs under `docs/` and explains how the features work together in day-to-day maintenance.

## Purpose

This blog is no longer just a chronological post feed.

It now includes layered discovery and curation features:

1. series and roadmaps
2. topic hub pages
3. higher-quality related post recommendations
4. enriched search
5. homepage curation
6. content type separation
7. post status metadata
8. learning paths
9. representative posts
10. capability map
11. practical validation badges
12. fixed profile links
13. recruiter panel
14. learning evidence
15. problem decision result
16. recruiter mode
17. Supabase post likes

The goal of this guide is to explain:

- what each feature is for
- where its data and templates live
- how to update it safely
- how to validate it locally

## Repository Principles

- Keep content and feature metadata explicit.
- Reuse existing layouts and includes before creating new ones.
- Avoid bulk-editing posts unless the change is clearly intentional.
- Treat modified and untracked post files as user work in progress.
- Prefer data-driven curation through `_data` and front matter over hardcoded markup.

## Core Feature Map

### 1. Series and Roadmaps

Purpose:

- Series connect posts that should be read in a strict local order.
- Roadmaps organize multiple series or standalone posts into topic-level reading stages.

Main files:

- `docs/features/series-roadmap-design.md`
- `docs/features/ai/ai-series-roadmap-guide.md`
- `_includes/series-navigation.html`
- `_includes/roadmap-membership.html`
- `_layouts/post.html`
- `_data/roadmaps.yml`
- `_layouts/roadmaps.html`
- `_layouts/roadmap.html`
- `_roadmaps/`
- `_tabs/roadmaps.md`

How to operate:

- Add `series`, `series_title`, `series_order`, and optional `series_description` in post front matter.
- Add `roadmaps` and `roadmap_stage` in post front matter when the post belongs to one or more roadmaps.
- Update `_data/roadmaps.yml` when adding a new roadmap or stage structure.
- Add or edit a page in `_roadmaps/` to expose the roadmap in navigation.

Recommended use:

- Use series for 2-10 closely connected posts.
- Use roadmaps for broader topic progression such as beginner and intermediate stages.

### 2. Topic Hub Pages

Purpose:

- Topic hubs are subject-first landing pages.
- They gather featured posts, related series, and related roadmaps into a curated entry point.

Main files:

- `docs/features/topic-hub-design.md`
- `docs/features/ai/ai-topic-hub-guide.md`
- `_data/topic_hubs.yml`
- `_layouts/topic-hubs.html`
- `_layouts/topic-hub.html`
- `_topics/`
- `_tabs/topics.md`

How to operate:

- Add a new topic definition in `_data/topic_hubs.yml`.
- Add a matching page in `_topics/`.
- Link featured posts, series ids, and roadmap ids from the topic data file.

Recommended use:

- Use topic hubs for important themes where new readers need a clear starting page.

### 3. Related Post Quality

Purpose:

- Improve recommendation quality beyond plain category and tag overlap.

Main files:

- `docs/features/recommendation-quality-design.md`
- `docs/features/ai/ai-recommendation-guide.md`
- `_includes/related-posts.html`
- `_data/topic_hubs.yml`
- `_data/locales/en.yml`
- `_data/locales/ko-KR.yml`
- `_sass/layout/post.scss`

Current ranking signals:

- same series
- same roadmap
- same topic hub
- shared tags
- shared categories

How to operate:

- Improve metadata quality first.
- If recommendations look weak, check whether posts are missing series, roadmap, or topic relationships before changing ranking code.

### 4. Search Enhancement

Purpose:

- Make search results more informative and easier to scan.

Main files:

- `docs/features/search-enhancement-design.md`
- `docs/features/ai/ai-search-guide.md`
- `assets/js/data/search.json`
- `_includes/search-loader.html`
- `_includes/search-results.html`
- `_javascript/modules/components/search-display.js`
- `_data/locales/en.yml`
- `_data/locales/ko-KR.yml`
- `_sass/addon/commons.scss`

Indexed metadata now includes:

- title
- categories
- tags
- content excerpt/body
- date label
- series
- roadmap ids
- derived topic relationships

How to operate:

- Extend `assets/js/data/search.json` when adding new searchable metadata.
- Keep result UI changes coordinated with the JavaScript display module and locale strings.

### 5. Homepage Curation

Purpose:

- Curate discovery entry points on the homepage when desired.

Main files:

- `docs/features/home-curation-design.md`
- `docs/features/ai/ai-home-curation-guide.md`
- `_includes/home-curation.html`
- `_layouts/home.html`
- `_sass/layout/home.scss`
- locale files

Operational note:

- Home curation markup may exist even if it is not currently rendered.
- If homepage behavior changes, verify whether `_layouts/home.html` includes or excludes the curation include.

### 6. Content Type Separation

Purpose:

- Separate short-form learning records from longer archive or article content.

Main files:

- `docs/features/content-type-separation-design.md`
- `docs/features/ai/ai-content-type-guide.md`
- `_data/content_types.yml`
- `_includes/content-type-badge.html`
- `_layouts/content-types.html`
- `_layouts/content-type.html`
- `_content_types/`
- `_tabs/types.md`

Current classification rule:

- `_posts/TIL/` -> `til`
- `_posts/archive/` -> `archive`
- `_posts/book/` -> `book`
- `_posts/conference/` -> `conference`
- `_posts/lecture/` -> `lecture`
- `_posts/problemsolving/` -> `problemsolving`
- `_posts/recruit/` -> `recruit`
- `_posts/reference/` -> `reference`

Important:

- This feature currently uses file path classification, not front matter.
- Moving a post can change its type.

### 7. Post Status Metadata

Purpose:

- Show editorial maintenance state such as whether a post is still being written, normally published, actively being revised, or archived.

Main files:

- `docs/features/post-status-design.md`
- `docs/features/ai/ai-post-status-guide.md`
- `_data/post_statuses.yml`
- `_includes/post-status-badge.html`
- `_layouts/post-statuses.html`
- `_layouts/post-status.html`
- `_post_statuses/`
- `_tabs/statuses.md`

Current status model:

- `writing`
- `published`
- `modifying`
- `archived`

How to operate:

- Add `status` in post front matter when editorial intent is clear.
- Do not force a status onto every post.

### 8. Learning Paths

Purpose:

- Provide reader-goal-oriented study routes that combine posts, roadmaps, and topic hubs.

Main files:

- `docs/features/learning-path-design.md`
- `docs/features/ai/ai-learning-path-guide.md`
- `_data/learning_paths.yml`
- `_layouts/learning-paths.html`
- `_layouts/learning-path.html`
- `_learning_paths/`
- `_tabs/paths.md`

How to operate:

- Define a path in `_data/learning_paths.yml`.
- Add a matching page in `_learning_paths/`.
- Use explicit post paths, roadmap ids, and topic ids for each phase.

Recommended use:

- Use learning paths for beginner onboarding, interview preparation, or domain study sequences.

### 9. Representative Posts

Purpose:

- Surface a small explicit set of flagship posts that represent the blog's strongest technical writing.

Main files:

- `docs/features/representative-posts-design.md`
- `_data/representative_posts.yml`
- `_includes/representative-posts.html`
- `_layouts/default.html`
- `_includes/recruit-mode.html`

How to operate:

- Keep the list explicit and short.
- Use stable post paths rather than automatic ranking.
- Reuse the same data across recruiter and panel surfaces.
- Review the list when publishing a new flagship article.

Recommended use:

- Use this feature to improve first-visit discovery and recruiter-facing proof signals.

### 10. Capability Map

Purpose:

- Present the blog as a map of demonstrated engineering strengths rather than only as topics or timelines.

Main files:

- `docs/features/capability-map-design.md`
- `_data/capability_map.yml`
- `_layouts/capability-map.html`
- `_tabs/capabilities.md`
- locale files

How to operate:

- Keep capability definitions explicit and evidence-oriented.
- Reuse representative posts, topic hubs, and roadmap links.
- Keep the list short enough to scan quickly.

Recommended use:

- Use this feature when the blog should help recruiters or first-time visitors understand technical fit fast.

### 11. Practical Validation Badges

Purpose:

- Signal what kind of real-world or editorial grounding a post has, such as production experience, troubleshooting, or interview focus.

Main files:

- `docs/features/practical-validation-badge-design.md`
- `_data/practical_validation_badges.yml`
- `_includes/practical-validation-badges.html`
- `_layouts/post.html`
- `_includes/representative-posts.html`

How to operate:

- Add `validation_badges` in post front matter.
- Keep badge count small and meanings concrete.
- Reuse badges on curated surfaces when stronger scanning signal is useful.

Recommended use:

- Use this feature on representative posts, recruiter-relevant posts, and tradeoff-heavy writeups.

### 12. Fixed Profile Links

Purpose:

- Keep resume, project, and recruiter-oriented links visible in a stable site-wide location.

Main files:

- `docs/features/fixed-profile-links-design.md`
- `_data/fixed_profile_links.yml`
- `_includes/fixed-profile-links.html`
- `_includes/sidebar.html`
- `_sass/addon/commons.scss`

How to operate:

- Keep the list short and high-value.
- Configure the resume PDF only when the asset exists.
- Prefer one recruiter link and one project link alongside the resume.

Recommended use:

- Use this feature to reduce friction after a visitor decides they want to learn more or contact you.

### 13. Recruiter Panel

Purpose:

- Turn the right-side panel into a recruiter-oriented quick-evaluation surface with CTA, strengths, proof, and structured follow-up paths.

Main files:

- `docs/features/recruiter-panel-design.md`
- `_data/recruiter_panel.yml`
- `_includes/recruiter-panel-stack.html`
- `_includes/recruiter-panel.html`
- `_includes/core-strengths-panel.html`
- `_includes/reading-path-panel.html`
- `_includes/proof-signals-panel.html`
- `_includes/featured-focus-panel.html`
- `_layouts/default.html`

How to operate:

- Keep panel-specific copy in `_data/recruiter_panel.yml`.
- Reuse representative posts and recruit-mode strength data where possible.
- Keep each section short enough to scan in the sidebar.

Recommended use:

- Use this feature to improve recruiter-first navigation on desktop layouts.

### 14. Learning Evidence

Purpose:

- Show books, courses, and related posts together as evidence that learning inputs were turned into written outputs.

Main files:

- `docs/features/learning-evidence-design.md`
- `_data/learning_evidence.yml`
- `_layouts/learning-evidence.html`
- `About` page link or a dedicated page entry

How to operate:

- Keep learning items explicit and curated.
- Link each input to direct study posts and later output posts.
- Group items by broad meaning such as backend, Spring, or architecture.

Recommended use:

- Use this feature when the blog should show long-term learning discipline and synthesis, not only standalone article quality.

### 15. Problem Decision Result

Purpose:

- Add a compact top-of-post summary that makes engineering context and tradeoffs easier to scan.

Main files:

- `docs/features/problem-decision-result-design.md`
- `_includes/problem-decision-result.html`
- `_layouts/post.html`
- `_sass/layout/post.scss`
- locale files

How to operate:

- Use `problem_decision_result` in post front matter.
- Keep each field concise and factual.
- Use the feature selectively on tradeoff-heavy or recruiter-relevant posts.

Recommended use:

- Use this feature on architecture, troubleshooting, performance, and decision-oriented posts.

### 16. Recruit Mode

Purpose:

- Provide a recruiter-specific landing flow that highlights role fit, strongest proof posts, and direct hiring links.

Main files:

- `docs/features/recruit-mode-design.md`
- `_data/recruit_mode.yml`
- `_includes/recruit-mode.html`
- `_tabs/recruit.md` or equivalent standalone page

How to operate:

- Keep recruiter curation explicit in one data file.
- Prefer representative evergreen posts over latest posts.
- Reuse topic hubs, roadmaps, and content type badges instead of creating a parallel content model.
- Keep resume and contact links current.

Recommended use:

- Use this feature when the blog is intended to support job search, portfolio review, or inbound recruiter traffic.

### 17. Supabase Post Likes

Purpose:

- Add lightweight engagement feedback on individual posts.

Main files:

- `docs/features/post-likes-supabase-design.md`
- `docs/features/ai/ai-post-likes-supabase-guide.md`
- `_layouts/post.html`
- `_includes/likes/supabase.html`
- `_includes/js-selector.html`
- `_sass/layout/post.scss`
- `_config.yml`

How to operate:

- Set `likes.provider: supabase`.
- Fill `likes.supabase.url` and `likes.supabase.anon_key`.
- Create the `post_likes` table and RLS policies in Supabase.
- Verify on a real post page that count and toggle state update.

Important:

- This is browser-scoped, not account-scoped.
- It is good enough for a personal blog, not for abuse-sensitive voting.

## Content Metadata Cheat Sheet

### Series and Roadmap

```yaml
series: authentication-basics
series_title: Authentication Basics
series_order: 2
series_description: Core authentication and authorization concepts for backend engineers.
roadmaps: [backend-core, security-foundations]
roadmap_stage: beginner
```

### Post Status

```yaml
status: published
```

### Content Type

No dedicated front matter field is used right now.

Classification depends on file path:

- `_posts/TIL/...`
- `_posts/archive/...`
- `_posts/...` for article fallback

## Typical Editorial Workflows

### Add a New Post to an Existing Series

1. Create the post in the correct `_posts/...` location.
2. Add `series`, `series_title`, `series_order`.
3. Add `roadmaps` and `roadmap_stage` if it belongs to roadmap flows.
4. Add `status` only if the editorial state is clear.
5. Verify post page navigation and related posts.

### Add a New Topic Hub

1. Add a data entry in `_data/topic_hubs.yml`.
2. Add a page in `_topics/`.
3. Link featured posts, relevant series, and roadmap ids.
4. Check the topic directory and topic detail page.

### Add a New Learning Path

1. Add a path entry in `_data/learning_paths.yml`.
2. Add a page in `_learning_paths/`.
3. Add phases with curated post paths, topic ids, and roadmap ids.
4. Verify `/paths/` and the detail page.

### Add a New Post Status

1. Update `_data/post_statuses.yml`.
2. Add a page in `_post_statuses/`.
3. Update locale text if the UI needs new copy.
4. Add the status only to a few posts first.

## Development Workflow

### Before Editing

1. Read the relevant design doc in `docs/`.
2. Check `git status`.
3. Identify whether the change is:
   - data only
   - metadata only
   - layout/include work
   - style work

### While Editing

- Prefer data files for curation logic.
- Prefer includes for reusable view fragments.
- Keep feature-specific styling scoped to the relevant layout area.
- Avoid changing unrelated post content.

### After Editing

1. Run:

```bash
bundle exec jekyll build
```

Or for faster local iteration:

```bash
bundle exec jekyll serve --incremental
```

2. Check the affected pages directly.
3. Commit only the intended files using Conventional Commits.

## Performance and Build Notes

This repository has a large `_posts` tree and a custom last-modified plugin.

Slow builds are mainly affected by:

- many posts
- archive generation
- Git-based last-modified hooks

Operational advice:

- Prefer `jekyll serve --incremental` during local iteration.
- Use `--limit_posts` only for quick structural checks.

Important:

- `--limit_posts` changes what appears in generated listing pages.
- Do not use `_site` output from a limited build as evidence that a listing feature is broken.

## Common Pitfalls

### Homepage looks broken

Check:

- nested links inside cards
- feed-specific badges rendered as `<a>` inside clickable cards
- global category styles leaking into feed metadata

### Type pages show fewer posts than expected

Check:

- whether the build used `--limit_posts`
- whether posts were placed under `_posts/TIL/` or `_posts/archive/`

### Recommendations feel weak

Check:

- missing `series`
- missing `roadmaps`
- weak topic hub coverage

### Search feels incomplete

Check:

- whether the indexed metadata was added to `assets/js/data/search.json`
- whether result rendering and locale strings were updated too

## Recommended Operating Discipline

- Add metadata gradually and deliberately.
- Prefer a small number of clear curation assets over many partially maintained ones.
- Keep roadmaps topic-oriented.
- Keep learning paths reader-goal-oriented.
- Keep statuses editorially meaningful.

## Related Docs

- `docs/features/series-roadmap-design.md`
- `docs/features/topic-hub-design.md`
- `docs/features/recommendation-quality-design.md`
- `docs/features/search-enhancement-design.md`
- `docs/features/home-curation-design.md`
- `docs/features/content-type-separation-design.md`
- `docs/features/post-status-design.md`
- `docs/features/learning-path-design.md`
