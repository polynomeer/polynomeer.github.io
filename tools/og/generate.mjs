#!/usr/bin/env node
/**
 * Renders an Open Graph preview image (1200x630 JPEG) for every published post
 * into assets/img/og/<slug>.jpg. The Jekyll plugin _plugins/og-image.rb picks
 * the file up and head.html emits it as og:image.
 *
 * Usage (from the repository root):
 *   npm install --prefix tools/og
 *   node tools/og/generate.mjs [--force] [--limit N] [--only <slug>]
 *
 * Fonts: Pretendard (OFL) is downloaded once into tools/og/.fonts/. Set
 * OG_FONT_DIR to use fonts from elsewhere, or OG_OFFLINE=1 to skip the
 * download and fall back to whatever the system provides.
 */

import { promises as fs, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createCanvas, GlobalFonts, loadImage } = require('@napi-rs/canvas');
const yaml = require('js-yaml');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const POSTS_DIR = path.join(ROOT, '_posts');
const OUT_DIR = path.join(ROOT, 'assets', 'img', 'og');
const AVATAR = path.join(ROOT, 'assets', 'img', 'avatar.jpg');
const FONT_DIR = process.env.OG_FONT_DIR || path.join(HERE, '.fonts');
const SKIP_DIRS = ['TIL', 'problemsolving'];
const SITE = { name: 'Polynomeer', host: 'polynomeer.github.io' };

const FONTS = [
  ['Pretendard-Bold.otf', 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-Bold.otf'],
  ['Pretendard-Medium.otf', 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-Medium.otf']
];

// palette mirrors _sass/colors/typography-dark.scss
const C = {
  bg: '#282a36',
  panel: '#2f3140',
  text: '#f8f8f2',
  muted: '#7f86a3',
  label: '#8be9fd',
  accent: '#bd93f9',
  chip: 'rgba(98, 114, 164, 0.28)'
};
const W = 1200;
const H = 630;

const args = process.argv.slice(2);
const force = args.includes('--force');
const limit = Number(args[args.indexOf('--limit') + 1]) || Infinity;
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

async function ensureFonts() {
  mkdirSync(FONT_DIR, { recursive: true });
  let family = null;
  for (const [file, url] of FONTS) {
    const target = path.join(FONT_DIR, file);
    if (!existsSync(target) && !process.env.OG_OFFLINE) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        await fs.writeFile(target, Buffer.from(await res.arrayBuffer()));
      } catch (err) {
        console.warn(`font download failed for ${file}: ${err.message}`);
      }
    }
    if (existsSync(target) && GlobalFonts.registerFromPath(target, 'Pretendard')) {
      family = 'Pretendard';
    }
  }
  if (!family) {
    console.warn('Pretendard not available; falling back to system fonts');
  }
  return family ? `Pretendard, "Apple SD Gothic Neo", "Noto Sans CJK KR", "Noto Sans KR", sans-serif` : `"Apple SD Gothic Neo", "Noto Sans CJK KR", "Noto Sans KR", sans-serif`;
}

async function walk(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (/\.(md|markdown)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function frontMatter(text) {
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end < 0) return null;
  try {
    return yaml.load(text.slice(3, end)) || {};
  } catch {
    return null;
  }
}

async function collectPosts() {
  const files = (await walk(POSTS_DIR)).sort();
  const posts = [];
  for (const file of files) {
    const rel = path.relative(POSTS_DIR, file);
    if (SKIP_DIRS.some((d) => rel.startsWith(`${d}${path.sep}`))) continue;
    const base = path.basename(file).replace(/\.(md|markdown)$/, '');
    const m = base.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
    if (!m) continue;
    const data = frontMatter(await fs.readFile(file, 'utf8'));
    if (!data || !data.title) continue;
    if (data.status && data.status !== 'published') continue;
    const date = data.date ? new Date(data.date) : new Date(m[1]);
    posts.push({
      rel,
      slug: String(data.slug || m[2]),
      title: String(data.title),
      date: Number.isNaN(date.getTime()) ? m[1] : date.toISOString().slice(0, 10),
      categories: [].concat(data.categories || []).map(String),
      tags: [].concat(data.tags || []).map(String),
      series: data.series_title ? String(data.series_title) : null,
      seriesOrder: data.series_order || null
    });
  }
  return posts;
}

function labelFor(post) {
  const [type, second] = post.categories;
  if (post.rel.startsWith('techblog')) return `Tech Blog Review${second ? ` · ${second}` : ''}`;
  if (post.rel.startsWith('conference')) {
    const event = post.tags.find((t) => /^(SLASH|TMC|DEVIEW|if\(kakao\)|WOOWACON|INFCON|SpringOne|KotlinConf|QCon)/i.test(t));
    return `Conference Review${event ? ` · ${event}` : second ? ` · ${second}` : ''}`;
  }
  if (post.series) return post.seriesOrder ? `${post.series} · ${post.seriesOrder}` : post.series;
  return post.categories.length ? post.categories.join(' · ') : type || 'Post';
}

function wrap(ctx, text, maxWidth, maxLines) {
  const words = text.split(/(\s+)/).filter((w) => w.length);
  const lines = [];
  let line = '';
  const push = () => {
    if (line.trim()) lines.push(line.trim());
    line = '';
  };
  for (const word of words) {
    const test = line + word;
    if (ctx.measureText(test).width <= maxWidth || !line.trim()) {
      // a single over-long token is broken by characters
      if (ctx.measureText(test).width > maxWidth && !line.trim()) {
        let chunk = '';
        for (const ch of word) {
          if (ctx.measureText(chunk + ch).width > maxWidth && chunk) {
            lines.push(chunk);
            chunk = '';
          }
          chunk += ch;
        }
        line = chunk;
      } else {
        line = test;
      }
    } else {
      push();
      line = word.trimStart();
    }
  }
  push();
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (ctx.measureText(`${last}…`).width > maxWidth && last.length) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last.replace(/[\s,.·—-]+$/, '')}…`;
    return kept;
  }
  return lines;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function render(post, family, avatar) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W - 120, 80, 20, W - 120, 80, 520);
  glow.addColorStop(0, 'rgba(189, 147, 249, 0.22)');
  glow.addColorStop(1, 'rgba(189, 147, 249, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.accent;
  ctx.fillRect(0, 0, 14, H);

  const left = 72;
  const contentWidth = W - left - 72;

  // label
  ctx.fillStyle = C.label;
  ctx.font = `700 26px ${family}`;
  ctx.textBaseline = 'top';
  ctx.fillText(labelFor(post).toUpperCase(), left, 64);

  // title: shrink until it fits in 4 lines
  let size = 60;
  let lines;
  for (;;) {
    ctx.font = `700 ${size}px ${family}`;
    lines = wrap(ctx, post.title, contentWidth, 4);
    const needed = lines.length * size * 1.28;
    if (needed <= 330 || size <= 38) break;
    size -= 4;
  }
  ctx.fillStyle = C.text;
  ctx.font = `700 ${size}px ${family}`;
  let y = 122;
  for (const line of lines) {
    ctx.fillText(line, left, y);
    y += size * 1.28;
  }

  // tags
  const tags = post.tags.filter((t) => !/^(Tech Blog Review|Conference|Tech|monticker)$/i.test(t)).slice(0, 4);
  let x = left;
  const chipY = 486;
  ctx.font = `500 24px ${family}`;
  for (const tag of tags) {
    const w = ctx.measureText(tag).width + 36;
    if (x + w > W - 240) break;
    ctx.fillStyle = C.chip;
    roundRect(ctx, x, chipY, w, 44, 22);
    ctx.fill();
    ctx.fillStyle = C.text;
    ctx.fillText(tag, x + 18, chipY + 9);
    x += w + 12;
  }

  // footer: avatar, site, date
  const footerY = 574;
  if (avatar) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(left + 22, footerY, 22, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, left, footerY - 22, 44, 44);
    ctx.restore();
  }
  ctx.textBaseline = 'middle';
  const nameX = left + (avatar ? 60 : 0);
  ctx.fillStyle = C.text;
  ctx.font = `700 26px ${family}`;
  ctx.fillText(SITE.name, nameX, footerY);
  const nameWidth = ctx.measureText(SITE.name).width;
  ctx.fillStyle = C.muted;
  ctx.font = `500 22px ${family}`;
  ctx.fillText(`${SITE.host}  ·  ${post.date.replace(/-/g, '.')}`, nameX + nameWidth + 18, footerY);

  return canvas.encode('jpeg', 88);
}

async function main() {
  const family = await ensureFonts();
  const avatar = existsSync(AVATAR) ? await loadImage(AVATAR) : null;
  mkdirSync(OUT_DIR, { recursive: true });

  let posts = await collectPosts();
  if (only) posts = posts.filter((p) => p.slug === only);
  posts = posts.slice(0, limit);

  let written = 0;
  let skipped = 0;
  for (const post of posts) {
    const target = path.join(OUT_DIR, `${post.slug}.jpg`);
    if (!force && existsSync(target)) {
      skipped += 1;
      continue;
    }
    await fs.writeFile(target, await render(post, family, avatar));
    written += 1;
  }
  console.log(`og images: ${written} written, ${skipped} kept, ${posts.length} posts -> ${path.relative(ROOT, OUT_DIR)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
