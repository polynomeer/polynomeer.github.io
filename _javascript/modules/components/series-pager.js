/**
 * Client-side pagination for long series lists.
 *
 * A list opts in with `data-series-pager` (optionally the page size) and marks
 * each entry with `data-pager-item`. The entry for the current post carries
 * `data-pager-active` so the list opens on the page that contains it. Without
 * JavaScript every entry stays visible.
 */

const LIST_SELECTOR = '[data-series-pager]';
const DEFAULT_PAGE_SIZE = 10;
const SCROLL_OFFSET = 88;

function pageNumbers(current, total) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i);
  }

  const pages = new Set([0, total - 1, current - 1, current, current + 1]);
  const ordered = [...pages]
    .filter((p) => p >= 0 && p < total)
    .sort((a, b) => a - b);
  const withGaps = [];

  ordered.forEach((p, i) => {
    if (i > 0 && p - ordered[i - 1] > 1) {
      withGaps.push('gap');
    }
    withGaps.push(p);
  });

  return withGaps;
}

function createPager(list) {
  const items = [...list.querySelectorAll(':scope > [data-pager-item]')];
  const size = parseInt(list.dataset.seriesPager, 10) || DEFAULT_PAGE_SIZE;

  if (items.length <= size) {
    return;
  }

  const total = Math.ceil(items.length / size);
  const activeIndex = items.findIndex((item) =>
    item.hasAttribute('data-pager-active')
  );
  const labels = {
    prev: list.dataset.labelPrev || '이전',
    next: list.dataset.labelNext || '다음',
    nav: list.dataset.labelNav || '시리즈 목록 페이지'
  };

  let current = activeIndex >= 0 ? Math.floor(activeIndex / size) : 0;

  const nav = document.createElement('nav');
  nav.className = 'series-pager';
  nav.setAttribute('aria-label', labels.nav);
  list.insertAdjacentElement('afterend', nav);

  const button = (page, text, extra = {}) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `series-pager-btn ${extra.className || ''}`.trim();
    btn.dataset.page = page;
    btn.textContent = text;
    if (extra.label) {
      btn.setAttribute('aria-label', extra.label);
    }
    if (extra.disabled) {
      btn.disabled = true;
    }
    if (extra.current) {
      btn.setAttribute('aria-current', 'page');
    }
    return btn;
  };

  const render = () => {
    const start = current * size;
    const end = Math.min(start + size, items.length);

    items.forEach((item, i) => {
      item.hidden = i < start || i >= end;
    });

    nav.replaceChildren();

    nav.appendChild(
      button(current - 1, '‹', {
        className: 'series-pager-arrow',
        label: labels.prev,
        disabled: current === 0
      })
    );

    pageNumbers(current, total).forEach((p) => {
      if (p === 'gap') {
        const gap = document.createElement('span');
        gap.className = 'series-pager-gap';
        gap.textContent = '…';
        nav.appendChild(gap);
        return;
      }
      nav.appendChild(button(p, String(p + 1), { current: p === current }));
    });

    nav.appendChild(
      button(current + 1, '›', {
        className: 'series-pager-arrow',
        label: labels.next,
        disabled: current === total - 1
      })
    );

    const range = document.createElement('span');
    range.className = 'series-pager-range';
    range.textContent = `${start + 1}–${end} / ${items.length}`;
    nav.appendChild(range);
  };

  nav.addEventListener('click', (event) => {
    const target = event.target.closest('button[data-page]');
    if (!target || target.disabled) {
      return;
    }

    const page = parseInt(target.dataset.page, 10);
    if (Number.isNaN(page) || page < 0 || page >= total || page === current) {
      return;
    }

    current = page;
    render();

    const top = list.getBoundingClientRect().top;
    if (top < 0) {
      window.scrollTo({ top: window.scrollY + top - SCROLL_OFFSET });
    }
  });

  render();
}

export function initSeriesPager() {
  document.querySelectorAll(LIST_SELECTOR).forEach(createPager);
}
