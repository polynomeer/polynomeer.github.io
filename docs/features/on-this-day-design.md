# On This Day

## Goal

Show what this blog wrote on today's month and day in earlier years.

The existing navigation all slices the same posts by subject: type, tag,
category, series, topic. This slices by the calendar instead, which only works
because the archive is long — the TIL notes run from 2020 to 2026. 322 of the
366 calendar dates carry at least one post, 255 carry posts from two or more
different years, and one date has six.

It is also the only page on the site whose contents change between visits
without anything being published.

## Data

`assets/js/data/on-this-day.json` is a Liquid template that groups
`site.posts` by `'%m-%d'`. The status filter has already run, so drafts and
archived posts are absent.

Rows are tuples rather than objects because the file carries the whole archive
in one request:

```json
{ "02-14": [[2026, "제목", "slug", "book"], [2025, "2025-02-14-TIL", "2025-02-14-TIL", "til"]] }
```

`[year, title, slug, content type]`. The post URL is rebuilt from the slug,
and the content type maps to a label through a small dictionary the page
embeds. 950 posts come to 77 KB, 24 KB over the wire.

One request for everything rather than one per day means stepping between
dates is instant and needs no further network, which is the point of the page.

## Page

`_layouts/on-this-day.html` with `_tabs/on-this-day.md` in the `browse` group,
next to the archives. The script is inline, as on the archives page, so no
rollup bundle changes.

Behaviour:

- opens on the visitor's local date, grouped by year, newest first, each year
  labelled with how long ago it was
- arrows step a day at a time and write `#MM-DD`, so a date can be linked or
  bookmarked; a `hashchange` listener handles a pasted link
- a date with nothing offers a jump to the nearest date that has posts
- the cursor is held in a fixed leap year so 02-29 stays reachable

The `#ui-locales` blob that `assets/js/lang-switch.js` reads carries only a
few keys, so static text uses the `data-l10n-ko` / `data-l10n-en` attribute
pair the sidebar uses rather than `data-i18n`. Generated nodes set the same
attributes, which is why the year heading keeps its label in a child span:
the switcher replaces `textContent` on every node that carries them, and the
"N years ago" badge would otherwise be wiped on a language change.

Strings live under `on_this_day` in the locale files; styles in
`_sass/layout/on-this-day.scss`.
