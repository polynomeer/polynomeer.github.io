# Social preview images

`og-default.html` and `og-about.html` are the sources for `assets/img/og-default.png`
(site-wide fallback, `social_preview_image` in `_config.yml`) and `assets/img/og-about.png`
(`image` on `_tabs/about.html`). Re-render after editing:

```bash
for n in default recruit; do
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
    --hide-scrollbars --force-device-scale-factor=1 --window-size=1200,630 \
    --screenshot=assets/img/og-$n.png "file://$PWD/tools/og/og-$n.html"
done
```

Keep the numbers in sync with `_data/home_hero.yml` and `_data/portfolio.yml`.
