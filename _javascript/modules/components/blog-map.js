/**
 * Tech review directory (/tech-reviews/): collapsible entries.
 *
 * Every entry is a native <details>, so the page works without JavaScript.
 * This module adds the "expand all / collapse all" controls per group and
 * opens the entry that a hash link (#kakao) or a TOC chip points at.
 */

const GROUP_SELECTOR = '[data-blog-map]';
const ITEM_SELECTOR = 'details.tech-blog-item';
const TARGET_CLASS = 'is-target';

function openTarget() {
  const hash = window.location.hash;
  if (!hash || hash.length < 2) {
    return;
  }

  let item;
  try {
    item = document.querySelector(`${ITEM_SELECTOR}${hash}`);
  } catch (_error) {
    return;
  }
  if (!item) {
    return;
  }

  document
    .querySelectorAll(`${ITEM_SELECTOR}.${TARGET_CLASS}`)
    .forEach((el) => el.classList.remove(TARGET_CLASS));

  item.open = true;
  item.classList.add(TARGET_CLASS);
  item.scrollIntoView({ block: 'start' });
}

function initGroup(group) {
  const items = [...group.querySelectorAll(ITEM_SELECTOR)];
  const actions = group.querySelector('[data-blog-map-actions]');

  if (!actions || items.length === 0) {
    return;
  }

  actions.hidden = false;

  const expand = actions.querySelector('[data-blog-map-expand]');
  const collapse = actions.querySelector('[data-blog-map-collapse]');

  expand?.addEventListener('click', () => {
    items.forEach((item) => {
      item.open = true;
    });
  });

  collapse?.addEventListener('click', () => {
    items.forEach((item) => {
      item.open = false;
      item.classList.remove(TARGET_CLASS);
    });
  });
}

export function initBlogMap() {
  const groups = document.querySelectorAll(GROUP_SELECTOR);
  if (groups.length === 0) {
    return;
  }

  groups.forEach(initGroup);
  openTarget();
  window.addEventListener('hashchange', openTarget);
}
