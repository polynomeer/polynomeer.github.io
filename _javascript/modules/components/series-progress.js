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

  // 4. directory cards
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
