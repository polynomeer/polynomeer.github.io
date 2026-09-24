# Statistics Page

## Goal

Answer, in one screen, the questions a visitor forms in the first ten seconds:
has this blog been kept up, what is it actually about, and how deep does it
go. The existing pages answer these one post at a time; this answers them at
the scale of the whole archive.

The page is at `/stats/`, in the `기록과 소개` sidebar group, because it is a
page about the record rather than a way into the posts.

## What it shows, and why each figure

| Block | Figures | What it is for |
| --- | --- | --- |
| Headline cards | years active, published posts, total reading time, series | Scale, stated once, in units a reader can feel |
| Posting heatmap | one cell per week, seven year rows | Whether the blog was kept up. The year totals (57, 160, 140, 142, 140, 135, 178) are the claim; the grid shows it was not one burst |
| Type mix per year | a stacked bar per year, its width the year's share of the busiest | The shift from a daily TIL log to notes, reviews and talks. This is the most useful chart on the page: it shows the writing changing kind, not just accumulating |
| Topics and tags | posts per topic hub, top tags | What the writing is about, from the curated axis and the raw one |
| Reading-time buckets | under 3 min / 3–8 / 8–20 / 20+ | That short notes and long analyses share one archive, with the proportions stated rather than implied |
| Sources | reviews per company or conference | What outside work was read closely enough to write about |
| Revised and linked | posts revised after publishing, posts cited by other posts | Whether posts were written and left, or returned to. Few blogs can show this; this one can because `post-revisions.rb` and `post-backlinks.rb` already compute it |

Two deliberate omissions.

**No page views or visitor counts.** They are not build-time data, they measure
promotion rather than the writing, and a low number is noise rather than
information. The footnote says so instead of leaving a reader to wonder.

**No word count.** With Jekyll's `number_of_words: 'auto'`, Korean counts
every syllable, so the figure would be large and meaningless. Total reading
time is the same measurement in a unit that means something, and it is the one
already printed on each post.

The tag chart excludes the TIL log and the problem-solving notes. With them,
`TIL` (562) and `BOJ` sit at the top of the chart and it stops being about
subject matter. The page says that it does this, right under the heading.

## Build

`_plugins/blog-stats.rb` is a `Generator` at `:low` priority, not a
`:site, :post_read` hook, because it reads what the other plugins attach to
posts — topic hub membership, revision counts, backlinks — and generators run
after every read hook no matter which order the plugin files load in.

It reads `site.posts` after the status filter, so a draft is counted nowhere,
and writes `site.data['blog_stats']`.

Every percentage, every heatmap shading level and every bar width is computed
in Ruby. The layout only prints values. The first version did the arithmetic
in Liquid and broke on `divided_by: 0`, because `map: 'last'` over a hash does
not return what it looks like it returns.

Reading time uses Jekyll's `number_of_words: 'auto'` rule at 180 wpm, matching
`_includes/read-time.html`, so the totals here and the per-post figures agree.

## Rendering

`_layouts/stats.html` with `_tabs/stats.md`. There is no chart library and no
script: a bar is a span with a `--fill` percentage, a stacked bar is a flex row
whose parts carry `flex-grow`, and the heatmap is a 53-column CSS grid. The
page renders identically with JavaScript off, follows the light and dark
palettes without a second set of colours, and every cell carries a `title` so
hovering names the week and the count.

Weekly rather than daily cells: at roughly a post every other day, a GitHub
day grid would be almost entirely empty and would read as inactivity. A week
is the honest granularity for this archive.

The page is 21 KB over the wire, about a third of the archives page.

Strings live under `stats` in the locale files; styles in
`_sass/layout/stats.scss`.
