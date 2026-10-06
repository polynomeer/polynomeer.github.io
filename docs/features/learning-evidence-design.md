# Learning Evidence Design

## Goal

Restructure the learning evidence surface into two levels:

1. an overview page that works as a compact discovery index
2. a detail page for each course or book

This avoids a long stack of oversized cards as the number of learning items grows.

## Problem

The current page mixes two different jobs:

- listing all learning items
- explaining each item in depth

That works with a small set, but it scales badly when books and lectures increase.

The result is:

- too much scrolling
- weak scanability
- repeated large-card layout even when the visitor only wants a quick overview

## New Information Architecture

### 1. Overview Page

Route:

- `/learning-evidence/`

Purpose:

- show the learning catalog at a glance
- let readers scan titles quickly
- route readers into the specific item they want

This page should not try to show every source post and result post inline.

### 2. Detail Page

Route:

- `/learning-evidence/<slug>/`

Purpose:

- explain one course or book in depth
- show source study notes
- show related result posts written from that learning

## Core Design Principle

The overview page is for scanning.

The detail page is for understanding.

Do not collapse those goals into one card layout again.

## Overview UI

Items are split only by type (course or book). Topic groups were dropped: the
list reads as one catalog, and the year shows how it grew.

- **Opening card**, the same height however many items there are: one column
  of squares per year (a square per item, outlined while in progress), the
  total lessons completed and post counts, and a shelf of book spines.
- **List** grouped by year, newest first. Only the two latest years start
  open. A row shows the title, the provider, and a size marker: a bar for a
  course (its `lessons` against the longest course) or one tick per study post
  for a book. The right column counts study posts and `+n` follow-ups.
- **Panel** beside the list, sticky on wide screens and below the list on
  narrow ones, showing the selected item: summary, study posts with this
  browser's read state (the `series-read-posts` store), follow-up posts, a
  continue link and the detail page link. Squares, spines and rows all select.
- Type chips, a search over titles and post titles (`/` focuses it), and a
  sort (recent, most posts, name).

A row is a link to the item's detail page, which is where it goes without
JavaScript. `_plugins/learning-evidence.rb` resolves post paths (hidden or
moved posts drop out), the year and the totals.

## Recommended Detail Page UI

Each learning item page should include:

1. hero
2. concise summary
3. source study posts
4. related result posts
5. previous and next items, in the overview's default (recent) order

### Hero

Show:

- title
- type
- status
- provider
- period
- short summary

### Source Study Posts

These are the direct notes created while consuming the material.

Typical sources:

- `_posts/book/...`
- `_posts/lecture/...`

### Related Result Posts

These are posts that demonstrate synthesis or application.

Typical results:

- archive posts
- notes posts
- recruit/interview posts

## Data Model

Keep `_data/learning_evidence.yml` as the curated source of truth: one flat `items` list.

Recommended shape:

```yaml
enabled: true

items:
  - id: inflearn-http-basics
    type: course            # course or book
    title: 모든 개발자를 위한 HTTP 웹 기본 지식
    provider: Inflearn · 김영한
    status: completed       # completed or in_progress
    lessons: 41             # course length, optional
    period: "2024"          # used for the year only when no source post is published
    summary:
      ko-KR: ...
      en: ...
    source_posts:           # notes written while studying it
      - _posts/lecture/http/2022-09-03-http-basics-01-introduction.md
    related_posts:          # posts written afterwards that use it
      - _posts/notes/web/2026-02-13-presigned-url.md
```

## Routing Model

Add a dedicated collection for detail pages.

Recommended collection:

- `_learning_evidence_items/`

Each item page should contain:

```yml
title: 모든 개발자를 위한 HTTP 웹 기본 지식
layout: learning-evidence-item
item_id: inflearn-http-basics
permalink: /learning-evidence/inflearn-http-basics/
```

The page body can remain empty if the layout reads its metadata from `_data/learning_evidence.yml`.

## Why Use a Collection

This gives:

- stable URLs for each item
- easy linking from the overview page
- room for item-specific longform content later if needed
- a clean separation between index and detail concerns

## Rendering Model

Recommended files:

- `_data/learning_evidence.yml`
- `learning-evidence.md`
- `_layouts/learning-evidence.html`
- `_layouts/learning-evidence-item.html`
- `_learning_evidence_items/`

## Selection Rules

- Keep the overview page compact.
- Put all meaningful explanation on the detail page.
- Prefer a curated subset over exhaustive raw logs.
- Link only clear source and result posts.

## Non-Goals

- Do not turn the overview page into a chapter log.
- Do not auto-generate learning items from all `book` or `lecture` posts.
- Do not duplicate long explanations both on the index and detail pages.

## Risks

### Metadata duplication

Risk:

- a collection page and data file may drift apart

Mitigation:

- keep the item page minimal
- use `item_id` to read most metadata from the data file

### Weak detail pages

Risk:

- detail pages may feel empty if summaries and links are thin

Mitigation:

- only create detail pages for high-signal items first
- ensure each item has at least one source or result post

## Recommended Implementation

1. keep `_data/learning_evidence.yml` as the source of truth
2. create `_learning_evidence_items/` for detail routing
3. redesign the index page as a compact title-first overview
4. move source and result post lists to the detail page

This creates a scalable structure without losing the original "learning turns into output" concept.
