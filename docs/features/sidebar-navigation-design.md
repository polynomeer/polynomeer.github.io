# Sidebar Navigation Design

## Problem

Every new curation surface (types, series, topics, tech reviews) added another
sidebar entry. At eight entries plus the theme, language and contact controls,
the nav filled the viewport on laptops and pushed the controls below the fold
on phones, while treating a raw tag cloud and the curated topic hubs as equally
important.

## Model

Three groups, decided by what the page is for:

| Group | Entries | Why |
| --- | --- | --- |
| Primary (icon rows) | 홈, 주제, 시리즈, 타입, 아카이브 | The five ways into the posts themselves, from the most curated to the most raw |
| `둘러보기` (chips) | 시작하기, 태그, 카테고리, 그날의 기록 | The other ways in: a guided entry point, the two flat taxonomies, and the archive read by calendar date |
| `기록과 소개` (chips) | 학습 성과, 실측, 기술 리뷰, 통계, 소개 | Pages about the author and the record rather than about the writing |

The first split is subject matter: the primary rows and the `둘러보기` chips
all lead to posts, the `기록과 소개` chips do not. Keeping the portfolio pages
in the primary column made the nav look like the blog was five parts writing
and four parts résumé, which is backwards for a reader who arrived from a
search result.

The second split, between the primary rows and `둘러보기`, is how much the
page decides for the reader. 주제 and 시리즈 are curated, 타입 and 아카이브
group everything without dropping anything, and the chips are either a flat
index or a single entry page. `카테고리` is a chip rather than a row because
the types page already lists each type's second-level categories
(`Notes` → `Spring`, `Database`, …), so the two taxonomies read as one
two-level structure rather than two rival lists.

## Implementation

A tab joins a secondary group with `group: <id>` in its front matter; `order`
then sorts it inside that group. `_includes/sidebar.html` renders tabs without
a `group` as icon rows, so a new tab keeps the old behaviour by default, and
loops over the group ids in `nav_groups` to render each one as a row of small
pill chips carrying the tab icon and label. A group's label is
`sidebar.<id>` in the locale files, so adding a third group is a front matter
key, a locale string and one id in that list. Styles live next to the other
sidebar rules in `_sass/addon/commons.scss`.

The chips reuse the pill language already used for tags and topic hubs:
a muted fill, a border that appears on hover, and an accent ring plus accent
icon on the current page, mirroring how the primary rows light up. The group
label is a micro caption followed by a hairline that fills the rest of the row.
Chip metrics are tuned so a group's entries sit on one or two lines at the
260px sidebar width, and the whole block shares the left edge of the primary
rows' hover pills.

## Notes

- The chips reuse `--text-muted-color` and `--sidebar-active-color`, so they
  follow the light and dark palettes without extra rules.
- Order inside the primary group runs from the most curated to the most raw:
  주제 before 시리즈 because hubs answer a question while series assume a
  reading order, then 타입 and 아카이브, which group everything.
- `기록과 소개` is ordered as the reader would read it: what was learned, what
  was measured, what was read, the archive counted, then who wrote it.
