# Open Graph Image Generation

## Goal

Give every published post its own social preview card so a link shared on
LinkedIn, Slack or X shows the post title, its kind (tech blog review,
conference review, series part) and tags instead of the generic site image.

## Pipeline

1. `tools/og/generate.mjs` (Node, `@napi-rs/canvas`) reads the front matter
   of every date-prefixed post outside `_posts/TIL` and `_posts/problemsolving`,
   skips non-published ones, and renders a 1200x630 JPEG to
   `assets/img/og/<slug>.jpg`. Existing files are kept unless `--force`.
   Pretendard (OFL) is downloaded once into `tools/og/.fonts/`; without
   network access it falls back to system fonts.
2. `_plugins/og-image.rb` sets `page.og_image` on posts whose card exists and
   that declare no `image` of their own.
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
or the categories), the title wrapped to at most four lines with the font size
reduced until it fits, up to four tag chips, and a footer with the avatar,
site name, host and date. `labelFor` and the palette constants in the script
are the places to adjust.

## Limits

- Cards are not regenerated when a title changes unless `--force` is used
  locally; the deploy workflow always starts from a clean checkout.
- A post with its own `image` keeps that image for previews.
- Roughly 60 KB per card; about 300 cards add ~17 MB to the deployed site but
  nothing to the repository.
