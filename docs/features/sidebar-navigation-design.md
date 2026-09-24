# Sidebar Navigation Design

## Problem

Every new curation surface (types, series, topics, tech reviews) added another
sidebar entry. At eight entries plus the theme, language and contact controls,
the nav filled the viewport on laptops and pushed the controls below the fold
on phones, while treating a raw tag cloud and the curated topic hubs as equally
important.

## Model

The blog has two kinds of visitor and they want different first clicks. A
reader arrives from a search result and wants more like the post they landed
on. Someone evaluating the author wants the evidence, and gives it a few
minutes. Grouping the pages by *what they are about* served neither: it put
the portfolio pages in a block a reader scrolls past, and left the evidence
pages as chips under the fold.

The groups are by **what the visitor is trying to do**.

| Group | Entries | The visitor is trying to |
| --- | --- | --- |
| Primary (icon rows) | 홈, 시작하기, 주제, 시리즈, 통계, 소개 | Work out what this is and whether to spend time on it |
| `근거` (chips) | 역량 맵, 실측, 기술 리뷰, 학습 성과 | Check what the author can actually do |
| `둘러보기` (chips) | 타입, 아카이브, 태그, 카테고리, 그날의 기록 | Look something specific up |

The primary rows are the orientation layer, and every one of them answers a
question a stranger has in the first ten seconds: what is new (홈), where do I
start (시작하기), what does it cover (주제), what is the substantial work
(시리즈), how much of it is there and has it been kept up (통계), who wrote it
(소개). Both kinds of visitor need all six, which is why they are the ones
with icons.

`근거` sits directly under them rather than at the bottom. It is the block
someone evaluating the author opens, and it is ordered strongest first: the
capability graph as the overview, then the measured experiments, the reviews
of other engineers' work, and the courses and books. The label is the same
word the repository already uses for this idea.

`둘러보기` is last because a generated index is what you reach for once you
already know what you are looking for. `카테고리` is there rather than in the
primary rows because the types page already lists each type's second-level
categories (`Notes` → `Spring`, `Database`, …), so the two taxonomies read as
one two-level structure rather than two rival lists.

The earlier split — primary for the pages leading to posts, a second group for
the pages about the author — read the nav as a table of contents. This reads
it as a path, and a recruiter's path is three clicks shorter.

## Implementation

A tab joins a secondary group with `group: <id>` in its front matter; `order`
then sorts it inside that group. `_includes/sidebar.html` renders tabs without
a `group` as icon rows, so a new tab keeps the old behaviour by default, and
loops over the group ids in `nav_groups` to render each one as a row of small
pill chips carrying the tab icon and label. A group's label is
`sidebar.<id>` in the locale files, so adding or reordering a group is a front
matter key, a locale string and the ids in that list. Styles live next to the other
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
- Every tab has a distinct icon. `카테고리` moved off `fa-stream`, which
  `시리즈` already used, and `기술 리뷰` off `fa-book-open`, which sat beside
  `학습 성과`'s `fa-book-open-reader`.
- Six icon rows and two chip groups do not fit an 800px-tall laptop screen
  next to the profile block, and the sidebar hides its scrollbar, so the theme
  and language controls simply disappeared. A `max-height: 900px` query on
  desktop shrinks the avatar, drops the tagline and tightens the row padding,
  which brings the sidebar from 964px to 837px without removing an entry. The
  phone layout is untouched.
