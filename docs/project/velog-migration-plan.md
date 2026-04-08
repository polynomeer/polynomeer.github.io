# Velog Migration Plan

This document defines the migration policy for moving content from [`@polynomeer` on Velog](https://velog.io/@polynomeer) into this repository.

The goal is not to copy posts mechanically.

The goal is to:

- preserve useful technical content
- avoid duplicating posts that already exist in improved form
- fit migrated content into the current blog taxonomy and writing rules
- keep migration reviewable in small batches

## Current Inventory

As of April 8, 2026:

- Velog profile metadata reports `56` total posts
- Velog RSS feed exposes the latest `20` posts
- Velog GraphQL public post listing currently exposes `50` public posts for `@polynomeer`
- the current repository already contains many rewritten `Notes`, `TIL`, and `Recruit` posts that cover part of the same subject area

This means migration should be handled as a staged editorial merge, not as a raw bulk import.

## Migration Status

As of April 8, 2026, all `50` posts exposed by the current public Velog GraphQL listing have been migrated, rewritten, or intentionally merged into stronger local equivalents.

Current status:

- public Velog posts discovered through GraphQL: `50`
- migrated or merged into this repository: `50`
- remaining public posts from the current listing: `0`

The profile metadata count `56` was not reproducible through the current public GraphQL post listing. If additional historical posts become accessible later, they should be treated as a follow-up migration batch instead of reopening already migrated content.

## Source of Truth

Use these sources in order:

1. Velog post body and title
2. current repository content
3. repository content rules in [`AGENTS.md`](../../AGENTS.md)
4. writing rules in [`docs/guides/content-writing-style-guide.md`](../guides/content-writing-style-guide.md)

If Velog and the current blog both contain the same subject, prefer the current repository version unless the Velog version includes unique details worth merging.

## Migration Principles

### 1. Do not bulk-copy blindly

Velog posts often reflect an earlier writing phase.

Many are:

- shorter
- more note-like
- more reference-heavy
- less aligned with the current `Notes` taxonomy

Migration should produce repository-native posts, not archive artifacts.

### 2. Preserve the better version

If a topic already exists in this repository in a stronger form, do not create a duplicate migrated post.

Instead:

- keep the current post
- optionally merge useful details from Velog into the current post
- note the merge in the migration checklist if the source contributed meaningfully

### 3. Migrate in thematic batches

Do not migrate 56 posts in one pass.

Use small batches such as:

- Java fundamentals
- Spring and backend integration
- Web and API topics
- Database and persistence
- Common engineering notes
- Problem solving and legacy algorithm posts

### 4. Classify by current taxonomy

Imported posts must fit the current repository taxonomy.

Typical targets:

- practical technical explanations -> `Notes`
- day log or reflection -> `TIL`
- interview preparation or hiring reflections -> `Recruit`
- book or lecture notes should stay under their existing dedicated trees only when they genuinely belong there

Do not recreate legacy `Archive` semantics.

## Initial Overlap Assessment

The latest RSS-visible Velog posts include:

- `주니어 백엔드 개발자로서 궁금한 점`
- `Spring Boot 외부 API 연동`
- `배열을 데이터베이스에 저장하는 방법`
- `SOLID principles`
- `Comparing class instance in Java`
- `this and super keyword in Java`
- `Inheritance, Polymorphism`
- `Object, Class, and Instance`
- `Implement Deque using LinkedList in Java`
- `Implement Queue using LinkedList in Java`
- `Java에서의 배열과 리스트`
- `단일(Singly Linked List), 이중(Doubly Linked List), 환형(Circular Linked List) 연결 리스트`
- `배열(Array)과 연결 리스트(Linked List)`
- `빅 오(Big-O)와 시간복잡도`
- `Maven Dependencies를 가져오지 못하는 현상`
- `Git의 기본`
- `C++ Vector`
- `prgms. SELECT`
- `BOJ 14502. 연구소`
- `BOJ 16928. 뱀과 사다리 게임`

### Direct overlap already present in this repository

These topics already exist in similar or improved form:

- `주니어 백엔드 개발자로서 궁금한 점`
  - current post: [`_posts/notes/common/2026-04-08-questions-in-junior.md`](../../_posts/notes/common/2026-04-08-questions-in-junior.md)
- `Comparing class instance in Java`
  - related current post: [`_posts/notes/java/2025-06-25-equals-and-hashcode.md`](../../_posts/notes/java/2025-06-25-equals-and-hashcode.md)
- `배열을 데이터베이스에 저장하는 방법`
  - overlaps with current database modeling and persistence notes, but not as a direct title match
- `Spring Boot 외부 API 연동`
  - overlaps with current web/backend integration material and the junior backend book notes, but not yet as a direct dedicated note

### Likely migration candidates

These appear to be absent or underrepresented in the current repository and are good candidates for direct migration or rewrite:

- `SOLID principles`
- `this and super keyword in Java`
- `Inheritance, Polymorphism`
- `Object, Class, and Instance`
- `Java에서의 배열과 리스트`
- `배열(Array)과 연결 리스트(Linked List)`
- `단일(Singly Linked List), 이중(Doubly Linked List), 환형(Circular Linked List) 연결 리스트`
- `빅 오(Big-O)와 시간복잡도`
- `Maven Dependencies를 가져오지 못하는 현상`
- `Git의 기본`

### Low-priority or selective migration candidates

These should be migrated only if they still fit the editorial direction:

- `Implement Deque using LinkedList in Java`
- `Implement Queue using LinkedList in Java`
- `C++ Vector`
- `prgms. SELECT`
- `BOJ 14502. 연구소`
- `BOJ 16928. 뱀과 사다리 게임`

Reason:

- these are closer to study artifacts, algorithm logs, or language exercises
- they may dilute the current backend-focused positioning if imported without curation

## Proposed Migration Order

### Phase 1. Merge and de-duplicate

Target:

- subjects already represented in the current repository

Actions:

- compare Velog and local versions
- preserve the stronger local version
- merge only unique insights or examples

### Phase 2. Import foundational Java and engineering notes

Target:

- Java fundamentals
- object model topics
- design principles
- build tooling basics

Reason:

- these are stable reference notes
- they fit the `Notes` model well

### Phase 3. Import practical backend integration topics

Target:

- Spring external API integration
- persistence edge cases
- backend implementation notes that still matter

### Phase 4. Decide whether to import old algorithm content

Target:

- SQL problem posts
- BOJ and programmers posts
- language-specific exercise posts

Decision rule:

- migrate only if they add clear value to the current blog direction
- otherwise leave them on Velog or move them later into a narrowly scoped legacy/problem-solving bucket

## File and Taxonomy Mapping

Recommended destination rules:

- Java concept posts -> `_posts/notes/java/`
- Spring/backend integration posts -> `_posts/notes/spring/` or `_posts/notes/web/`
- persistence and DB modeling posts -> `_posts/notes/database/`
- general engineering reflection or backend decision posts -> `_posts/notes/common/`
- algorithm/problem solving posts -> `_posts/problemsolving/` only if they are intentionally preserved

Common front matter expectations:

- valid YAML wrapped with `---`
- explicit `title`
- `categories` as arrays
- `tags` as arrays
- `content_type` determined by path, not front matter
- no legacy `Archive` categories for notes

## Editorial Rewrite Rules During Migration

Each migrated post should be reviewed for:

- AI-like phrasing
- outdated or weak titles
- overly casual or diary-like wording where a technical note is more appropriate
- broken code fences or malformed Markdown
- duplicate or noisy reference lists
- front matter validity

If the source post is too thin, rewrite it into a proper `Notes` article instead of copying it literally.

## Operational Workflow

For each migration batch:

1. inventory source posts
2. compare with local posts
3. mark each post as one of:
   - skip
   - merge into existing post
   - migrate as new post
   - defer
4. edit or create posts in the target directory
5. verify front matter and writing rules
6. commit the batch separately

## Recommended Next Batch

The strongest next migration batch is:

1. `SOLID principles`
2. `this and super keyword in Java`
3. `Inheritance, Polymorphism`
4. `Object, Class, and Instance`
5. `빅 오(Big-O)와 시간복잡도`

Reason:

- high instructional value
- stable subject matter
- low dependency on old Velog context
- easy fit into `Notes / Java` or `Notes / Common`

## Notes

- The Velog profile currently exposes `56` total posts in profile metadata.
- The RSS feed exposes the latest `20` items and is sufficient for a staged migration start, but not a guaranteed full inventory source.
- If a full migration inventory is required later, the remaining Velog pages should be enumerated explicitly before import work begins.
