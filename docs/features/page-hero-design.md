# Page Hero

## Problem

Every tab page opened with its own hero. Ten near-identical blocks — eyebrow,
title, summary, sometimes a row of figures — each with its own class names and
its own copy of the same rules. That produced three separate defects.

**Three pages had no heading at all.** `/start/`, `/experiments/` and
`/tech-reviews/` set `hero_title: true`, which tells `_layouts/page.html` not
to render an `<h1>`, and their includes never rendered one either.
`/experiments/` opened on a bare paragraph of prose.

**Most heroes did not follow the language toggle.** They used `data-i18n`
keys, and the `#ui-locales` blob that `assets/js/lang-switch.js` reads carries
only a handful of keys — none of them page headings. Switching to English left
every heading in Korean. The script also honours `data-l10n-ko` /
`data-l10n-en` attribute pairs, which work for any string.

**The two treatments disagreed.** Half the pages used a plain block, half a
gradient card. On `/stats/` and `/archives/` the card contained stat cards, so
the page opened with a card inside a card.

## The component

`_includes/page-hero.html`: eyebrow, `<h1>`, summary, and an `extra` slot for a
row of figures built from `_includes/page-hero-stat.html`.

```liquid
{% assign loc_ko = site.data.locales['ko-KR'].archives %}
{% assign loc_en = site.data.locales.en.archives %}
{% include page-hero.html
   lang=lang
   eyebrow_ko=loc_ko.eyebrow eyebrow_en=loc_en.eyebrow
   title_ko=tabs_ko.archives title_en=tabs_en.archives
   summary_ko=loc_ko.description summary_en=loc_en.description
   extra=archives_stats %}
```

Text is passed as a ko/en pair, so the hero switches language everywhere.
Only the title is required; a page with nothing useful to say leaves the
summary out rather than padding it.

Two notes for anyone extending it. Jekyll's `include` tag rejects a bracket
subscript in a parameter value, so `site.data.locales['ko-KR'].x` has to be
assigned to a local first — that is why every call site starts with a pair of
`assign` lines. And an `extra` block is built with `{% capture %}`, since an
include cannot take a body.

## The treatment

Not a card. A hero card repeated on fifteen pages becomes wallpaper, and on
the pages that open with a grid it puts a card around cards. A rule under the
block gives every page the same rhythm at a fraction of the weight, and the
stat row keeps the card language for the things that are actually figures.

Styles are in `_sass/layout/page-hero.scss`. Adopting it deleted about 220
lines of per-page hero rules across five files.

## Coverage

All fourteen tab pages, each with exactly one `<h1>`. The detail layouts
(`topic-detail`, `series-detail`, `content-type`, `learning-evidence-item`,
`post-status`) keep their own hero containers, which carry a backlink and a
meta row, but their eyebrow and summary lines now use `page-hero-eyebrow` and
`page-hero-summary` instead of three more copies of the same two rules.

New locale strings live under `page_hero` in the locale files, for the pages
whose headings were never in the locale files to begin with.
