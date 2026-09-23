# Sidebar Navigation Design

## Problem

Every new curation surface (types, series, topics, tech reviews) added another
sidebar entry. At eight entries plus the theme, language and contact controls,
the nav filled the viewport on laptops and pushed the controls below the fold
on phones, while treating a raw tag cloud and the curated topic hubs as equally
important.

## Model

Two groups, decided by what a reader starts from:

| Group | Entries | Why |
| --- | --- | --- |
| Primary (icon rows) | 홈, 소개, 주제, 시리즈, 기술 리뷰 | Entry points: the feed, the portfolio, the curated hubs, ordered series, and the review directory |
| Browse (compact text row under a `둘러보기` label) | 타입, 태그, 아카이브 | Raw indexes reached when looking for something specific |

`카테고리` stays out of the nav, as before, and is reachable from post meta.

## Implementation

A tab opts into the second group with `group: browse` in its front matter;
`order` then sorts it inside that group. `_includes/sidebar.html` renders tabs
without a `group` as icon rows (so a new tab keeps the old behaviour by
default) and the browse group as small pill chips, each with the tab icon and
label. Styles live next to the other sidebar rules in
`_sass/addon/commons.scss`; the group label comes from `sidebar.browse` in the
locale files.

The chips reuse the pill language already used for tags and topic hubs:
a muted fill, a border that appears on hover, and an accent ring plus accent
icon on the current page, mirroring how the primary rows light up. The group
label is a micro caption followed by a hairline that fills the rest of the row.
Chip metrics are tuned so the three entries sit on one line at the 260px
sidebar width, and the whole block shares the left edge of the primary rows'
hover pills.

## Notes

- The browse row reuses `--text-muted-color` and `--sidebar-active-color`, so
  it follows the light and dark palettes without extra rules.
- Order inside the primary group is editorial: 소개 sits first because the
  portfolio is the page a recruiter is sent to, and 주제 before 시리즈 because
  hubs answer a question while series assume a reading order.
