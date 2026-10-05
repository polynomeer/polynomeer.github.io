/**
 * Reading progress for series, kept per browser in localStorage.
 *
 * - A post page carrying `[data-read-tracker][data-post-url]` marks that post
 *   as read when it opens.
 * - Every `[data-post-url]` list item gets `.is-read` once it has been read.
 * - `.series-progress` placeholders (post panel, series page) get a bar and a
 *   "read/total" label computed from the `[data-post-url]` items around them;
 *   on the series page the `.series-continue` link points at the first unread
 *   post.
 * - Series directory cards carry `data-series-posts` (comma-separated URLs)
 *   and show a read count.
 * - Any `[data-tick-url]` (one tick per part) gets `.is-read`; in a
 *   `[data-ticks]` row the first unread tick also gets `.is-next`, and on the
 *   series page the first unread part gets `.is-next` too.
 * - `[data-series-resume]` on the series directory turns into an "continue
 *   reading" banner for the series read most recently and not finished,
 *   built from the `#series-index` JSON.
 * Without JavaScript or storage nothing is shown.
 */

const STORAGE_KEY = 'series-read-posts';

function normalize(url) {
  try {
    const path = new URL(url, window.location.origin).pathname;
    return path.endsWith('/') ? path : `${path}/`;
  } catch (_) {
    return url;
  }
}

function loadRead() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return null;
  }
}

function saveRead(read) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(read));
    return true;
  } catch (_) {
    return false;
  }
}

function fill(template, values) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replace(`:${key}`, value),
    template
  );
}

function renderProgress(box, urls, read, firstUnread) {
  const total = urls.length;
  if (!total) {
    return;
  }

  const done = urls.filter((u) => read[u]).length;
  const bar = box.querySelector('.series-progress-fill');
  const label = box.querySelector('.series-progress-label');
  const cont = box.querySelector('.series-continue');

  if (bar) {
    bar.style.width = `${Math.round((done / total) * 100)}%`;
  }
  if (label) {
    label.textContent = fill(box.dataset.labelProgress || ':READ/:TOTAL', {
      READ: done,
      TOTAL: total
    });
  }
  if (cont) {
    if (done === 0) {
      cont.textContent = box.dataset.labelStart || '';
      cont.href = urls[0];
    } else if (firstUnread) {
      cont.textContent = box.dataset.labelContinue || '';
      cont.href = firstUnread;
    } else {
      cont.textContent = `${box.dataset.labelAllRead || ''} · ${box.dataset.labelRestart || ''}`;
      cont.href = urls[0];
    }
    cont.hidden = false;
  }

  box.hidden = false;
}

function renderResume(read) {
  const slot = document.querySelector('[data-series-resume]');
  const source = document.getElementById('series-index');
  if (!slot || !source) {
    return;
  }

  let index;
  try {
    index = JSON.parse(source.textContent);
  } catch (_) {
    return;
  }

  let best = null;
  index.forEach((series) => {
    const urls = series.posts.map((p) => normalize(p.url));
    const times = urls.map((u) => read[u] || 0);
    const done = times.filter(Boolean).length;
    if (done === 0 || done === urls.length) {
      return;
    }
    const last = Math.max(...times);
    if (!best || last > best.last) {
      best = { series, urls, done, last };
    }
  });
  if (!best) {
    return;
  }

  const { series, urls, done } = best;
  const nextIndex = urls.findIndex((u) => !read[u]);
  const next = series.posts[nextIndex];

  slot.querySelector('[data-resume-title]').textContent = series.title;
  slot.querySelector('[data-resume-title]').href = series.url;
  slot.querySelector('[data-resume-ticks]').innerHTML = urls
    .map((u, i) => {
      const cls = read[u] ? 'is-read' : i === nextIndex ? 'is-next' : '';
      return `<span class="${cls}"></span>`;
    })
    .join('');
  slot.querySelector('[data-resume-progress]').textContent = fill(
    slot.dataset.labelProgress || ':READ/:TOTAL',
    { READ: done, TOTAL: urls.length, NEXT: nextIndex + 1 }
  );
  const link = slot.querySelector('[data-resume-link]');
  link.href = next.url;
  link.querySelector('[data-resume-next-label]').textContent = fill(
    slot.dataset.labelNext || ':NEXT',
    { NEXT: nextIndex + 1 }
  );
  link.querySelector('[data-resume-next-title]').textContent = next.title;
  slot.hidden = false;
}

export function initSeriesProgress() {
  const read = loadRead();
  if (read === null) {
    return;
  }

  // 1. record the post being opened
  const tracker = document.querySelector('[data-read-tracker][data-post-url]');
  if (tracker) {
    const url = normalize(tracker.dataset.postUrl);
    if (!read[url]) {
      read[url] = Date.now();
      saveRead(read);
    }
  }

  // 2. mark read items wherever they appear
  const items = [...document.querySelectorAll('[data-post-url]')];
  items.forEach((item) => {
    if (read[normalize(item.dataset.postUrl)]) {
      item.classList.add('is-read');
    }
  });

  // 3. progress boxes: post panel and series page
  document.querySelectorAll('.series-progress').forEach((box) => {
    const scope =
      box.closest('.series-navigation') ||
      box.closest('.series-detail-page') ||
      document;
    const urls = [
      ...scope.querySelectorAll('[data-post-url][data-pager-item]')
    ].map((el) => normalize(el.dataset.postUrl));
    const unique = [...new Set(urls)];
    const firstUnread = unique.find((u) => !read[u]);
    renderProgress(box, unique, read, firstUnread);
  });

  // 4. ticks: one per part, read ones filled, the first unread marked next
  document.querySelectorAll('[data-ticks]').forEach((row) => {
    let nextMarked = false;
    row.querySelectorAll('[data-tick-url]').forEach((tick) => {
      const isRead = Boolean(read[normalize(tick.dataset.tickUrl)]);
      tick.classList.toggle('is-read', isRead);
      if (!isRead && !nextMarked && row.dataset.ticks === 'next') {
        tick.classList.add('is-next');
        nextMarked = true;
      }
    });
  });

  // 5. series page: the first unread part is "next", once something is read
  const detail = document.querySelector('.series-detail-page');
  if (detail) {
    const parts = [...detail.querySelectorAll('[data-part-url]')];
    if (parts.some((p) => read[normalize(p.dataset.partUrl)])) {
      parts.find((p) => !read[normalize(p.dataset.partUrl)])?.classList.add('is-next');
    }
  }

  // 6. directory: continue the series read most recently
  renderResume(read);

  // 7. directory cards
  document.querySelectorAll('.series-card[data-series-posts]').forEach((card) => {
    const urls = card.dataset.seriesPosts
      .split(',')
      .filter(Boolean)
      .map(normalize);
    const done = urls.filter((u) => read[u]).length;
    const slot = card.querySelector('.series-card-progress');
    if (!slot || done === 0) {
      return;
    }
    slot.textContent = fill(slot.dataset.labelProgress || ':READ/:TOTAL', {
      READ: done,
      TOTAL: urls.length
    });
    slot.hidden = false;
  });
}
