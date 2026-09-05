# CLAUDE.md

Claude Code guidance for this repository.

The full contributor and agent rules live in [`AGENTS.md`](./AGENTS.md). Read them first — they are authoritative for content safety, writing style, Jekyll conventions, and commit format.

@AGENTS.md

## What this repository is

A personal technical blog built on Jekyll with a customized `jekyll-theme-chirpy`, deployed as a static site (GitHub Pages style). Content is Korean-language technical writing; code and docs are English.

## Repository map

| Path | Purpose |
| --- | --- |
| `_posts/` | Blog posts, grouped by content type (`notes/`, `TIL/`, `lecture/`, `recruit/`, …) |
| `_tabs/` | Top-level nav pages |
| `_layouts/`, `_includes/` | Page structures and reusable view fragments |
| `_sass/` | Styles — palettes in `_sass/colors/`, shared styling in `_sass/addon` and `_sass/layout` |
| `_javascript/` | Source JS, bundled by rollup into `assets/js/dist` |
| `_data/` | Site data files (locales, contact, share targets) |
| `_plugins/` | Custom Jekyll plugins |
| `_content_types/`, `_post_statuses/`, `_topics/`, `_series_pages/`, `_roadmaps/`, `_learning_paths/`, `_learning_evidence_items/` | Custom collections driving taxonomy and curation pages |
| `docs/` | Design docs (`features/`), project docs (`project/`), guides (`guides/`) |
| `scripts/`, `tools/` | Maintenance and build helper scripts |

Design intent for a feature usually already exists under `docs/features/`. Check there before proposing architecture changes.

## Commands

Site build and preview:

```bash
bundle exec jekyll build
```

```bash
bundle exec jekyll serve --incremental
```

Full production build plus link checking (slow, use before release-style changes):

```bash
bash tools/test.sh
```

Frontend assets and lint:

```bash
npm run build
```

```bash
npm run lint:scss
```

Repository health and image audit:

```bash
bash scripts/blog-health-report.sh
```

```bash
bash scripts/audit-post-images.sh
```

## Post front matter contract

```yaml
---
title: "제목"
date: 2026-08-13
status: draft
categories: [Notes, Spring]
tags: [Spring, Java]
series: series-slug
series_title: 시리즈 표시 제목
series_order: 1
series_description: 시리즈 설명
---
```

- `status` is the single editorial visibility field: `draft`, `published`, or `archived` (see `_post_statuses/`). Never add `draft:` or `published:` keys.
- `categories` and `tags` are YAML arrays. Prefer `Notes` over legacy `Archive`.
- Quote titles containing `:`, `@`, `#`, or brackets.
- `series_*` fields are only for posts that belong to a series; keep `series_order` unique within a series.
- File naming: `_posts/<type>/<...>/YYYY-MM-DD-slug.md`.

## Working rules for Claude

- Treat modified and untracked files under `_posts/` as the user's work in progress. Do not reformat, rewrite, or "clean up" posts that the task did not name.
- Do not rename, move, or delete posts, images, or tabs without explicit approval.
- Prefer variable-driven style edits in `_sass/colors/` before changing layout markup.
- Reuse existing layouts and includes before creating new ones.
- Never commit `_site/`, `.jekyll-cache/`, or `node_modules/`.
- Follow Conventional Commits (`type(scope): summary`, lowercase, imperative, no trailing period) — commitlint enforces this via husky.
- Stage only the files relevant to the requested task; the working tree usually carries unrelated drafts.

## Writing style reminders

Full rules are in `AGENTS.md` and [`docs/guides/content-writing-style-guide.md`](./docs/guides/content-writing-style-guide.md). The short version:

- Factual, calm, specific technical prose. No assistant phrasing ("물론입니다", "필요하시면 추가해드릴게요"), no prompt-response scaffolding.
- Prefer zero emoji.
- Headings describe the technical point; no decorative punctuation.
