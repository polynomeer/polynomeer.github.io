# Open Graph Image Generation

## Goal

Give every published post its own social preview card so a link shared on
LinkedIn, Slack or X shows the post title, its kind (tech blog review,
conference review, series part) and tags instead of the generic site image.

## Pipeline

1. `tools/og/generate.mjs` (Node, `@napi-rs/canvas`) reads the front matter
   of every date-prefixed post outside `_posts/TIL` and `_posts/problemsolving`,
   skips non-published ones, and renders a 1200x630 JPEG to
   `assets/img/og/<slug>.jpg`. It also renders one card per topic hub
   (`assets/img/og/topics/<topic_id>.jpg`) and per series page
   (`assets/img/og/series/<series_id>.jpg`), since those pages get shared as
   entry points on their own. Existing files are kept unless `--force`.
   Pretendard (OFL) is downloaded once into `tools/og/.fonts/`; without
   network access it falls back to system fonts.
2. `_plugins/og-image.rb` sets `og_image` on any document whose card exists —
   posts, topics and series pages — that declares no `image` of its own.
3. `_includes/head.html` emits `og:image`, `twitter:card=summary_large_image`
   and `twitter:image` from `page.og_image`, falling back to
   `site.social_preview_image`.

The generated files and fonts are ignored by git. The deploy workflow runs the
generator before `jekyll build` (`continue-on-error`, so a rendering problem
never blocks a deploy); locally run it once to preview cards.

```bash
npm install --prefix tools/og
node tools/og/generate.mjs            # all missing cards
node tools/og/generate.mjs --only <slug> --force
```

## Card layout

Dark background matching the theme, accent bar on the left, an uppercase label
(`TECH BLOG REVIEW · KAKAO`, `CONFERENCE REVIEW · SLASH 24`, `<series> · n`,
`TOPIC HUB`, `SERIES`, or the categories), the title wrapped to at most four
lines with the font size reduced until it fits, up to four chips, and a footer
with the avatar, site name, host and a trailing detail.

Every card is built from the same `{label, title, subtitle, chips, footer}`
shape, so the three kinds differ only in what fills it:

| | label | subtitle | chips | footer |
| --- | --- | --- | --- | --- |
| post | kind and source | — | tags | date |
| topic hub | `TOPIC HUB` | the hub's question | its tags | — |
| series page | `SERIES` | `hero_note` | `series_groups` labels | post count |

A topic hub's membership is computed by `_plugins/topic-hub.rb` at build time,
so the card does not print a count it would have to guess at; a series page
counts its own published posts, which the generator can read directly.
`labelFor`, the card builders and the palette constants are the places to
adjust.

## Limits

- Cards are not regenerated when a title changes unless `--force` is used
  locally; the deploy workflow always starts from a clean checkout.
- A post with its own `image` keeps that image for previews.
- Roughly 60 KB per card; 367 cards add ~21 MB to the deployed site but
  nothing to the repository.
- `/topics/` and `/series/` themselves are pages rather than collection
  documents and keep the default social image.
