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
| Primary (icon rows) | 홈, 주제, 시리즈, 기술 리뷰, 학습 성과, 소개 | Entry points and curated pages: the feed, the hubs, ordered series, the review directory, the reading record, and the portfolio |
| Browse (chips under a `둘러보기` label) | 타입, 태그, 카테고리, 아카이브, 그날의 기록 | Raw indexes reached when looking for something specific |

The rule for the split is what produced the page: a page someone curated goes
in the primary group, a page generated from front matter goes in the browse
group. `학습 성과` moved up under that rule, and `카테고리` moved in: its index
page existed and was linked from every category page, but not from the nav,
which left the site with three taxonomies and only two of them visible.
`그날의 기록` sits at the end of the same row: it is the archive read by
calendar date rather than by year (see `on-this-day-design.md`).

The types page now lists each type's second-level categories as chips, so the
two taxonomies read as one two-level structure (`Notes` → `Spring`,
`Database`, …) rather than two rival lists.

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
