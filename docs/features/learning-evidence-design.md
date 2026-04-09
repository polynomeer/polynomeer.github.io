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

## Recommended Overview UI

The overview page should feel more like a curated shelf or editorial index than a stack of article cards.

Preferred characteristics:

- smaller footprint per item
- title-first presentation
- visually differentiated labels by type or topic
- low reading burden before click

Recommended item contents on the overview page:

- title
- type badge
- status badge
- provider or period

Do not show:

- long summaries
- source post lists
- related post lists

Those belong on the detail page only.

## Recommended Detail Page UI

Each learning item page should include:

1. hero
2. concise summary
3. source study posts
4. related result posts
5. optional neighboring items from the same group

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

Keep `_data/learning_evidence.yml` as the curated source of truth for grouped metadata.

Recommended shape:

```yaml
enabled: true

groups:
  - id: backend-and-web
    title:
      ko-KR: 백엔드와 웹 기초
      en: Backend and Web Foundations
    description:
      ko-KR: 프로토콜 이해, 백엔드 기본기, 실용적인 웹 사고를 강화한 강의와 책입니다.
      en: Courses and books that strengthened protocol understanding, backend fundamentals, and practical web reasoning.
    items:
      - id: inflearn-http-basics
        type: course
        title: 모든 개발자를 위한 HTTP 웹 기본 지식
        provider: Inflearn
        status: completed
        period: "2024"
        summary:
          ko-KR: HTTP 의미 체계, 요청-응답 흐름, 백엔드 웹 통신의 기본 사고 모델을 강화했습니다.
          en: Strengthened HTTP semantics, request-response flow understanding, and the mental model behind backend web communication.
        source_posts:
          - _posts/lecture/http/모든_개발자를_위한_HTTP_웹_기본_지식.md
        related_posts:
          - _posts/notes/web/2026-02-13-presigned-url.md
          - _posts/notes/web/2026-02-25-netty.md
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
