# Content Writing Style Guide

This document defines the writing and front matter rules that contributors and AI agents should follow when creating or editing blog posts in this repository.

## Purpose

The blog should read like a technically strong personal publication, not like raw AI output.

The goals are:

- consistent tone across posts
- clean Jekyll front matter that builds reliably
- headings and metadata that fit the site's taxonomy and navigation model
- fewer artifacts such as emojis, chatbot phrases, and duplicated scaffolding

## Tone and Voice

Use a tone that is:

- technical
- calm
- explicit
- grounded in implementation or reasoning

Prefer writing that sounds like an engineer documenting a problem, decision, or concept after doing the work.

Avoid writing that sounds like:

- a chatbot responding to a prompt
- a sales page
- motivational copy
- filler-heavy summaries

## Phrases to Avoid

Do not leave assistant-style phrases in the final post. Examples:

- `물론입니다`
- `좋습니다`
- `알겠습니다`
- `원하시면`
- `필요하시면`
- `다음으로 바로`
- `이어서 작성해드릴게요`
- `어떻게 이어갈까요?`

Also remove prompt scaffolding such as:

- `아래는 기술 블로그 형식으로 작성한 예시입니다`
- `회사·도메인 고유 키워드는 제거했습니다`
- `필요하면 확장해드릴 수 있습니다`

These phrases are acceptable in chat, but not inside published posts.

## Emoji Rule

Use emojis very sparingly.

Rules:

- default to no emoji
- do not put emojis in titles unless the user explicitly wants them
- do not prefix every heading with icons
- do not use emojis as substitutes for hierarchy or emphasis

One emoji may be acceptable inside a rare callout, but decorative repetition should be removed.

## Heading Style

Headings should be informative and compact.

Prefer:

- problem-focused headings
- concept-first headings
- implementation-first headings

Examples:

- `왜 Gap Lock이 필요한가`
- `청크 분할 기준`
- `조건부 해제가 필요한 이유`

Avoid:

- decorative separators
- vague headings like `들어가며` repeated too often in short notes
- punctuation-heavy headers
- duplicated title text as the first heading when unnecessary

## Body Style

Prefer:

- short to medium paragraphs
- concrete examples
- implementation details when relevant
- explicit tradeoffs
- technical claims tied to a reason or observation

Avoid:

- generic filler
- repeated restatements
- unexplained superlatives
- overly dramatic phrasing

When a post explains a real incident or design choice, prefer this flow:

1. problem or context
2. why the previous approach failed or was limited
3. the chosen design or interpretation
4. tradeoffs, constraints, or results

## Lightweight Verification

Full experiment posts (a scenario repository, repeated runs, controls) are not the only way to back a claim. Many questions in concept posts are about semantics, not performance — "is this lock taken", "is this row visible", "is this header sent" — and one sitting with a console answers them. Use the formats below so that items under `무엇을 재면 확인되는가` get verified instead of accumulating.

### Step-log experiments

Interleave two or more sessions as numbered steps and show the raw evidence at each step.

- number every step and name the session that runs it (`세션 A`, `세션 B`)
- show the exact statement or command per step
- paste the raw output (console result, `data_locks`, `pg_locks`, response headers) instead of paraphrasing it
- state the environment once: product, version, relevant settings such as isolation level or autocommit
- give a one-line rerun command or a `docker run` line when feasible
- end with the observed answer to the question, not a general lesson

Good fits: locks and isolation, visibility, protocol headers, class loading order, framework proxy behavior.

### Verifying with source code

When the claim is about how something is implemented, back it with the implementation, not only the documentation.

- link source pinned to a tag or commit, never to a moving branch
- quote only the lines that carry the claim and explain them line by line
- say which version the reading applies to

### Questions that lead to the next step

Keep headings claim-first. Inside a section, let each observation open the next question (`그렇다면 shared lock이면?`) so the reader sees why the next step exists. Stop when the original question is answered; do not chain for its own sake.

### Appending results to the original post

When a lightweight verification answers an item listed under `무엇을 재면 확인되는가`, append the result to that same post as `## 직접 확인한 것` instead of opening a new post. Keep the original list intact and mark which items were checked, so the post shows what was hypothesized and what was measured.

Do not import the habits that weaken experiment notes: unedited typos, emotional conclusions, and posts that only transcribe official examples.

## Series and Naming Consistency

When a post belongs to a series:

- keep `series` stable across the series
- keep `series_title` stable across the series
- use consistent `series_order`
- keep title prefixes or part labels consistent

Examples:

- `대량 배치 안정성을 높이기 위한 구조 개선: Part 1 - ...`
- `대량 배치 안정성을 높이기 위한 구조 개선: Part 2 - ...`

Do not mix:

- `Part1`
- `Part 1`
- `1편`
- `Part 01`

inside the same series unless there is a clear editorial reason.

## Categories and Tags

Use categories and tags that match existing repository conventions.

Current guidance:

- notes content should normally use `categories: [Notes, <Subcategory>]` or `categories: [Notes, Common]`
- do not introduce legacy `Archive` category values for new notes posts
- tags should be specific and reusable
- prefer a few precise tags over long noisy lists

Examples:

- `tags: [Batch, Concurrency, Redis Lock, Reliability]`
- `tags: [Logging, Observability, Monitoring, Spring Boot]`

Avoid:

- broad filler tags like `Study`
- duplicated meaning across many tags
- tags that only repeat the category without adding signal

## Jekyll Front Matter Rules

Every post must use valid YAML front matter.

Required baseline:

```yaml
---
title: "Example Title"
date: 2026-03-28
categories: [Notes, Common]
tags: [Example]
---
```

Rules:

- front matter must start at the first line
- use exactly one opening `---` and one closing `---`
- do not leave prose before front matter
- do not duplicate front matter blocks
- do not leave stray `---` blocks near the top of the file

Quote `title` when it contains YAML-sensitive characters, including:

- `:`
- `@`
- `#`
- `[ ]`
- `{ }`
- leading emoji or special symbols

Arrays:

- use YAML arrays for `categories` and `tags`
- keep formatting simple and one-line unless the array is long

Series fields:

- `series`
- `series_title`
- `series_order`
- optional `series_description`

All must remain valid YAML and use stable naming.

## Cleanup Checklist After Content Editing

Before finishing a content task, check the edited files for:

- valid front matter
- no duplicate `---` blocks
- no assistant phrases
- no dangling "next step" or "let me know" endings
- no accidental mixed category system such as `Archive` inside notes posts
- consistent series metadata
- titles that match the actual content

## Scope Guidance for Agents

If the user asked to clean up content:

- prefer fixing metadata, headings, and obvious AI artifacts first
- do not rewrite unrelated posts
- do not bulk-normalize the entire repository unless explicitly asked

If the user asked to draft new content:

- write directly in repository style from the start
- avoid inserting temporary scaffolding that must later be removed
