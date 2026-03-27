# Release Notes

## Scope

- Start commit: `20ff139f3d7d37989f652607bebf20defb0d5b70`
- End commit: `HEAD` on `2026-03-27`

This release range covers the transition from a mostly chronological Chirpy-based blog into a portfolio-oriented technical blog with structured discovery, recruiter-facing surfaces, Korean-first internationalization, and multiple rounds of UI refinement.

## Executive Summary

The repository changed in five major ways across this range:

1. structured navigation and knowledge architecture were added
2. post metadata and recommendation quality were significantly enriched
3. portfolio and recruiter-oriented pages were introduced
4. Korean-first UI internationalization and sidebar controls were added
5. archives, search, comments, likes, and page-level polish were iteratively improved

The net effect is that the blog now behaves less like a plain chronological feed and more like a curated technical writing portfolio with topic-, roadmap-, and recruiter-based entry points.

## Major Changes

### 1. Documentation and Repository Workflow

The documentation system was formalized early in this range.

Added documentation:

- agent and repository workflow guides
- blog development and operations guides
- feature design docs for roadmaps, topics, recommendations, search, home curation, content types, post statuses, likes, archives, recruit mode, representative posts, practical validation badges, engineering summary cards, capability map, learning evidence, recruiter panels, and fixed profile links
- AI-oriented maintenance guides for several data-driven features

Structural impact:

- `docs/` became the main reference point for operating the customized blog
- feature work is now accompanied by design-level documentation rather than only code changes

### 2. Structured Discovery: Series, Roadmaps, Topics

This range introduced the first layer of structured knowledge navigation.

Added:

- series navigation on posts
- roadmap index and roadmap detail pages
- topic hub index and topic detail pages
- richer related-post ranking using shared structure, not only tags/categories

Operational impact:

- posts can participate in ordered local series
- multiple posts or series can be grouped into broader roadmap stages
- readers can start from topic-centered hub pages instead of only browsing by time

Later consolidation:

- `Paths` were initially introduced as guided reading pages
- they were later deprioritized, then fully removed
- `Roadmaps` became the primary structured reading model

Final direction at the end of this range:

- `Roadmaps` remain the main structured path surface
- `Topics` remain the main subject-first discovery surface
- `Paths` no longer exist in code or navigation

### 3. Search and Content Metadata

Search was materially upgraded.

Enhancements:

- richer search metadata and result display
- more informative search result chips and supporting metadata
- content-type-derived classification
- post lifecycle/status metadata

Important fixes in this range:

- localized topic labels are now serialized correctly into search JSON
- series chips in search results now use runtime JS values rather than a wrongly inlined Liquid value

User-visible result:

- search results are more expressive
- search no longer leaks multilingual Ruby hash strings such as `{"ko-KR"=>"...", "en"=>"..."}` into the UI

### 4. Homepage and Feed Behavior

The home feed received several rounds of behavior and UI work.

Implemented across the range:

- curated homepage sections
- content type positioning inside feed cards
- restored card navigation after nested-link issues
- cleaned hover and underline behavior
- feed metadata spacing and alignment fixes
- post status filtering
- later expansion into multi-field filtering
- later simplification into a single-row filter toolbar
- final removal of the homepage filter UI on user request

Important note:

- the feed filter feature was built in several iterations, but the final state at the end of this range is that the dedicated filter bar was removed from the home feed

### 5. Post Metadata Surfaces

Several post-level metadata systems were added.

Added:

- content type badges derived from directory structure
- editorial lifecycle/status badges
- practical validation badges
- `Problem / Decision / Result` summary card

Impact:

- posts now communicate more than title/date/tags
- readers and recruiters can infer whether a post is conceptual, evolving, production-informed, or archival

### 6. Analytics, Likes, Comments, and Pageviews

Engagement and post interaction features were added and refined.

Added:

- Supabase pageviews
- Supabase likes using stable post IDs
- Supabase GitHub-authenticated comments

Comment system refinements:

- duplicate sign-in/auth rows were removed
- submit/footer/auth states were cleaned up
- discussion layout and button styling were polished

Impact:

- engagement is now measurable through Supabase-backed primitives
- post interaction moved away from theme defaults toward custom controlled surfaces

### 7. Recruiter and Portfolio Surfaces

This is one of the largest themes in the release range.

Added:

- Recruit mode
- Representative posts
- Capability map
- Learning evidence page
- Recruiter-oriented sidebar panels
- Fixed profile links
- Practical validation badges reused in recruiter contexts

These changes turned the blog into a recruiting surface, not only a knowledge notebook.

Functional outcomes:

- representative writing samples can be surfaced intentionally
- recruiter-oriented reading paths and proof signals can be shown
- capability claims are backed by posts, roadmaps, and learning evidence
- About acts as a hub into deeper portfolio surfaces

### 8. About and Profile Rework

The profile area was significantly reworked.

Changes:

- avatar and sidebar title now link to `About`
- `Recruit` and `Capabilities` were removed from top-level sidebar exposure and moved behind `About`
- About was updated to reflect the user’s resume and technical positioning
- a profile hub was added inside About

Result:

- About now acts as the central profile landing page
- top-level navigation is less cluttered

### 9. Internationalization

The repository shifted to Korean-first UI internationalization.

Implemented:

- default UI language changed to Korean
- KO/EN switching added with persistent client-side toggles
- locale-driven text for menu names, panel titles, descriptions, and data-driven surfaces
- recruiter, roadmap, topic, capability, learning evidence, and panel surfaces localized

Follow-up fixes:

- panel headings were later localized correctly in the injected locale payload
- type names were intentionally reverted to canonical labels rather than translated labels
- multiple toggle interaction and alignment bugs were fixed afterward

Important nuance:

- direct author-controlled content like tags and canonical type labels remain nonlocalized by design

### 10. Sidebar, Topbar, and Theme Controls

The sidebar and topbar saw many UI refinements.

Changes across the range:

- social/contact links were adjusted
- X was removed, reintroduced, then fixed for visibility
- mail behavior was normalized to `mailto:`
- LinkedIn replaced the old X/Twitter slot at one point, then X was re-added alongside it
- theme and language toggles were redesigned multiple times
- toggle sizing, centering, sliding motion, localization, and interaction behavior were repeatedly refined
- controls were visually separated from contact links
- quick access cards were eventually removed from the sidebar

Result:

- the sidebar is more stable and intentionally structured than in the initial state
- the bottom control area now behaves like a designed control cluster rather than a pile of unrelated icons

### 11. Archives

Archives changed from a simple list to a more curated surface, then were visually toned down.

Implemented:

- collapsible year groups
- archive design documentation
- yearly summaries
- archive-level type/status filters
- representative archive highlights

Follow-up changes:

- timeline-style visuals were simplified after looking overly busy
- Liquid comparison assignment was replaced with a safer conditional assignment

Result at the end of the range:

- Archives remain a secondary chronological exploration surface
- the styling is cleaner than the first enhanced version

### 12. Build and Layout Performance

Two performance-oriented commits reduced repeated work during rendering.

Optimizations:

- trimmed locale payload for client-side language switching
- cached recruiter panel rendering
- reduced repeated `site.posts` scans in several layouts

This does not fully eliminate slow Jekyll generation, but it removes avoidable repeated Liquid work in custom surfaces.

## Navigation Evolution

Navigation changed several times in this range.

Important end-state shifts:

- `Home` remains the primary entry point
- `About` moved near the top and acts as the profile hub
- `Roadmaps` became primary over `Paths`
- `Topics`, `Types`, `Archives`, `Categories`, and `Tags` were reordered to better match reader intent
- `Recruit` and `Capabilities` are no longer top-level sidebar tabs
- sidebar quick access links were later removed entirely

## Notable Reversals and Re-scoping

Several features were introduced, then narrowed or removed after real use.

Examples:

- guided `Paths` were added, then removed
- recruiter-only sidebar blocks were trimmed back
- home feed filters were expanded in multiple iterations, then ultimately removed
- archive styling was initially more decorative, then simplified

This matters because the current codebase is not just additive. It reflects multiple rounds of product-direction correction toward a simpler and more coherent final surface.

## Files and Areas Most Affected

The most heavily evolved areas in this range were:

- `_layouts/home.html`
- `_layouts/archives.html`
- `_layouts/default.html`
- `_includes/sidebar.html`
- `_includes/search-loader.html`
- `_sass/addon/commons.scss`
- `_sass/layout/home.scss`
- `_sass/layout/archives.scss`
- `_sass/layout/post.scss`
- `_data/locales/en.yml`
- `_data/locales/ko-KR.yml`
- `_data/roadmaps.yml`
- `_data/topic_hubs.yml`
- `_data/content_types.yml`
- `_data/recruit_mode.yml`
- `_data/recruiter_panel.yml`
- `_data/representative_posts.yml`
- `_data/fixed_profile_links.yml`
- `docs/`

## Current End-State Summary

At the end of this release range, the blog is characterized by:

- Korean-first localized UI with English switching
- roadmap- and topic-driven discovery
- recruiter- and portfolio-oriented profile surfaces
- Supabase-backed likes, comments, and pageviews
- richer search metadata and more controlled metadata display
- a simplified sidebar that prioritizes core navigation over quick-access duplication
- a cleaner archive presentation than the first enhanced iteration

## Risks and Follow-up Work

Areas that still look like follow-up candidates:

- full Sass modernization away from deprecated `@import`
- continued cleanup of client-side locale payload shape
- optional simplification of archive feature scope if chronology is considered low-priority
- additional search QA for multilingual and metadata-derived chips
- possible further pruning of portfolio surfaces if overlap appears between About, Recruit, and Capability Map

## Reference Commit Groups

Selected milestones in this release range:

- `a976a2a` series and roadmap navigation
- `0a6aa3d` topic hub pages
- `c41f83a` enriched search
- `bafb69e` content type pages
- `897f5ee` post lifecycle metadata
- `14e4560` Supabase likes
- `7e5de28` Supabase comments
- `57c731a` recruit mode and representative posts
- `44c82dd` capability map and learning evidence
- `85cb8e5` Korean-first language switching
- `441ecf0` and `4cbe190` build/perf improvements
- `7b5007e` learning path removal
- `d630656` to `4b435bb` archive enhancement wave
- `77a95ab` sidebar quick access removal
