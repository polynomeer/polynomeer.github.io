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
- bold used for rhythm; keep at most one bold phrase per section, for the claim the section exists to make
- slogan endings that restate the previous sentence as a maxim (`정확히 같은 긴장이다`, `~의 정체다`, `~가 전부다`)
- signposting instead of content (`여기서 중요한 성질이 나온다`, `여기가 핵심이다`)
- em dashes (—) in body prose; use a sentence break, comma, or parentheses (reference lists keep the existing ` — ` convention)
- a `정리` section that repeats each section's first sentence; keep only conclusions the reader cannot get from the headings

When a post explains a real incident or design choice, prefer this flow:

1. problem or context
2. why the previous approach failed or was limited
3. the chosen design or interpretation
4. tradeoffs, constraints, or results

Make the chain visible with transitions that carry logic (`그래서`, `그런데`, `그 결과로는 ~를 구분할 수 없었다`). Reorder sentences when the order hides the chain. Never fill a missing step with an invented motivation or thought process; if the post does not say why an alternative was rejected, leave it out and note it as a gap.

When a post draws conclusions from experience rather than measurement (retrospectives, design decisions, incident write-ups), state the conditions they came from before the conclusions: team size, traffic or data volume, stack, and constraints, as numbers where possible. This plays the role that `한계` plays in experiment posts — it tells the reader whether the conclusion transfers to their situation.

## Lightweight Verification

Full experiment posts (a scenario repository, repeated runs, controls) are not the only way to back a claim. Many questions in concept posts are about semantics, not performance — "is this lock taken", "is this row visible", "is this header sent" — and one sitting with a console answers them. Use the formats below so that items under `무엇을 재면 확인되는가` get verified instead of accumulating.

### Step-log experiments

Interleave two or more sessions as numbered steps and show the raw evidence at each step.

- number every step and name the session that runs it (`세션 A`, `세션 B`)
- show the exact statement or command per step
- paste the raw output (console result, `data_locks`, `pg_locks`, response headers) instead of paraphrasing it
- after a long output such as an execution plan or profile, quote again the one line that carries the claim (`loops=184852`) and say what it shows
- explain a difference only with what the output shows; if two variants produce the same plan, do not give them different reasons
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

## Sources and Citations

Concept posts should rest on primary sources: official documentation, RFCs and specs, man pages, JDK Javadoc and JEPs, original papers, the designers' own writing, or a standard book with chapter.

- cite inline at the sentence the source supports, and also list it under `## 참고`
- cite only what you have opened and read; never add a URL from memory
- when a source narrows or contradicts a claim, fix the claim instead of keeping both
- quote at most one or two sentences per post, in the original language and in quotation marks, followed by a Korean gloss when the source is not Korean
- dates and numbers taken from a source must match the source as rendered (for example the date Medium displays, not a reader proxy's timestamp)

## Reviews of External Articles

Tech blog reviews (`_posts/techblog/`) must keep the original and the author's reading apart.

- the section that summarizes the original carries only the original's claims; mark the author's reading (`나는 ~로 읽는다`, `내가 보기에`)
- quote the original's sentences as written; never stitch two sentences into one quotation
- check every claim attributed to the original against the original, including what it says about results, follow-up posts, and future work
- front matter summaries (`problem_decision_result`) follow the same rule

## Diagrams and Code

Add a diagram or code only where a reader would otherwise hold a sequence, structure, state machine, or interleaving in their head from prose alone.

- use Mermaid and add `mermaid: true` to the front matter
- prefer `sequenceDiagram`, `stateDiagram-v2`, or `flowchart TD`; keep diagrams narrow because wide ones scroll sideways
- labels use the post's own terms, identifiers, and numbers; a diagram adds no new facts
- in a review, say in the lead-in whether the diagram shows the original's design or the author's experiment
- code examples stay short and use APIs that exist; when copying the original's code, keep it short and attribute it
- lead into each visual with one sentence in the post's voice

## Terms for Newer Readers

Write so a junior developer can follow without leaving the post confused.

- link a term at its first use in the body to the post that explains it; link once per term per post, not inside headings, code, or diagrams
- link only to posts that are published; `draft` and `archived` posts return 404 to readers
- for a term that needs only a phrase (TPS, OOM, MVP, TTFB), add a short gloss in parentheses at first use instead of a new post
- when no post explains a term that deserves one, write a short concept post (50–90 lines) that opens with the situation where the reader meets the term, explains it from zero, and links back
- split long sentences into cause then effect, replace dense phrasing with plain words, and keep the calm `~다` voice; easier does not mean chatty
- a number that appears without context (`26.6건/초`) needs its source in the same sentence

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

When editing an existing post for style, also confirm mechanically against the previous version:

- no number, measurement, or table value disappeared or changed
- front matter, code blocks, and Mermaid blocks are unchanged unless the task was to change them
- every internal `/posts/...` link points to an existing, published post
- `ruby scripts/check-post-consistency.rb` reports no new errors
- Mermaid blocks render without a syntax error in the built site

## Scope Guidance for Agents

If the user asked to clean up content:

- prefer fixing metadata, headings, and obvious AI artifacts first
- do not rewrite unrelated posts
- do not bulk-normalize the entire repository unless explicitly asked

If the user asked to draft new content:

- write directly in repository style from the start
- avoid inserting temporary scaffolding that must later be removed
