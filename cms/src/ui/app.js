// The editor. No framework and no build step: the Worker serves this file as
// written, so what runs in the browser is what is in the repository.

import { findLiquid, renderMarkdown } from '/markdown.js';
import {
  joinFrontMatter, postPath, slugify, splitFrontMatter
} from '/frontmatter.js';

const $ = (id) => document.getElementById(id);
const DRAFT_PREFIX = 'cms:draft:';

let posts = [];
let current = null;
let saving = false;

const say = (text, cls = 'muted') => {
  $('state').textContent = text;
  $('state').className = cls;
};

async function api(path, options) {
  const response = await fetch(path, { credentials: 'same-origin', ...options });
  if (response.status === 401) {
    show('signin');
    throw new Error('sign_in_required');
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(body?.error?.message || `HTTP ${response.status}`), { body });
  }
  return body;
}

function show(which) {
  $('signin').hidden = which !== 'signin';
  $('app').hidden = which !== 'app';
}

// --- local recovery -------------------------------------------------------
// A phone can be killed at any moment, so every keystroke goes to
// localStorage under the post's path. It is only ever read back when the
// stored copy differs from what the server returned.

const draftKey = (path) => `${DRAFT_PREFIX}${path}`;

function saveLocal() {
  if (!current) return;
  try {
    localStorage.setItem(draftKey(current.path), JSON.stringify({
      meta: $('meta').value, body: $('body').value, at: Date.now()
    }));
  } catch { /* private mode, or full: the server copy is still authoritative */ }
}

function clearLocal(path) {
  try { localStorage.removeItem(draftKey(path)); } catch { /* ignore */ }
}

function pendingLocal(path, serverText) {
  try {
    const stored = JSON.parse(localStorage.getItem(draftKey(path)) || 'null');
    if (!stored) return null;
    return joinFrontMatter(stored.meta, stored.body) === serverText ? null : stored;
  } catch {
    return null;
  }
}

// --- list -----------------------------------------------------------------

function renderList() {
  const needle = $('search').value.trim().toLowerCase();
  const shown = posts
    .filter((p) => !needle || p.path.toLowerCase().includes(needle) ||
      (p.title || '').toLowerCase().includes(needle))
    .slice(0, 200);

  $('count').textContent = `${shown.length} / ${posts.length}`;
  $('posts').replaceChildren(...shown.map((post) => {
    const li = document.createElement('li');
    if (current && current.path === post.path) li.setAttribute('aria-current', 'true');

    const button = document.createElement('button');
    button.type = 'button';
    // textContent, not innerHTML: a title is author input and this list is
    // the one place it would otherwise be injected as markup.
    button.textContent = post.title || post.path.split('/').pop();

    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = post.path;
    button.append(meta);

    button.addEventListener('click', () => open(post.path));
    li.append(button);
    return li;
  }));
}

// --- editing --------------------------------------------------------------

function setTab(name) {
  for (const tab of document.querySelectorAll('[data-tab]')) {
    tab.setAttribute('aria-selected', String(tab.dataset.tab === name));
  }
  for (const panel of document.querySelectorAll('[data-panel]')) {
    panel.hidden = panel.dataset.panel !== name;
  }
  if (name === 'preview') refreshPreview();
}

function refreshPreview() {
  $('preview').innerHTML = renderMarkdown($('body').value);

  const liquid = findLiquid($('body').value);
  $('liquid').hidden = liquid.length === 0;
  if (liquid.length) {
    $('liquid').textContent =
      `Liquid ${liquid.length}곳은 미리보기에서 실행되지 않습니다 (${liquid
        .slice(0, 3).map((l) => `${l.line}행`).join(', ')}${liquid.length > 3 ? ' 외' : ''}).`;
  }
}

async function open(path) {
  say('여는 중…');
  const file = await api(`/api/posts/${encodeURIComponent(path)}`);
  const parts = splitFrontMatter(file.text);

  current = { path, sha: file.sha, serverText: file.text };
  $('path').textContent = path;
  $('meta').value = parts.raw;
  $('body').value = parts.body;

  const pending = pendingLocal(path, file.text);
  $('restore').hidden = !pending;
  if (pending) {
    $('restore').onclick = () => {
      $('meta').value = pending.meta;
      $('body').value = pending.body;
      $('restore').hidden = true;
      say('복구본을 불러왔습니다', 'warn');
    };
    say('저장되지 않은 복구본이 있습니다', 'warn');
  } else {
    say('');
  }

  renderList();
  setTab('write');
}

function startNew() {
  const title = prompt('제목');
  if (!title) return;

  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
  const path = postPath('notes', today, slugify(title) || 'untitled');

  current = { path, sha: null, serverText: '' };
  $('path').textContent = path;
  $('meta').value = [
    `title: "${title.replace(/"/g, '\\"')}"`,
    `date: ${today} 09:00:00 +0900`,
    'categories: [Notes]',
    'tags: []',
    'status: draft'
  ].join('\n');
  $('body').value = '';
  $('restore').hidden = true;
  say('새 글 (status: draft)');
  setTab('meta');
}

async function save() {
  if (!current || saving) return;
  saving = true;
  $('save').disabled = true;
  say('저장 중…');

  const text = joinFrontMatter($('meta').value, $('body').value);
  const usePr = $('pr').checked;
  // Stable for this edit, so a retry after a dropped reply is recognised as
  // the same change rather than committed twice.
  current.changeId ||= `cms-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const result = await api('/api/changes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: `post: update ${current.path.split('/').pop()}`,
        changeId: current.changeId,
        files: [{ path: current.path, content: text }],
        ...(usePr ? { branch: `cms/${slugify(current.path)}`, pullRequest: {} } : {})
      })
    });

    clearLocal(current.path);
    current.serverText = text;
    current.changeId = null;
    $('restore').hidden = true;
    $('result').innerHTML = '';
    $('result').textContent = result.alreadyApplied
      ? '이미 반영되어 있었습니다'
      : `커밋 ${result.commitSha.slice(0, 7)}`;

    if (result.pullRequest) {
      const link = document.createElement('a');
      link.href = result.pullRequest.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = ` PR #${result.pullRequest.number}`;
      $('result').append(link);
    }
    say('저장됨', 'ok');
  } catch (error) {
    // The local copy is deliberately kept on failure - it is the only copy
    // of the edit that is not on screen.
    say(error.body?.error?.code === 'branch_moved'
      ? '브랜치가 그 사이 바뀌었습니다. 다시 열고 적용하세요'
      : `저장 실패: ${error.message}`, 'warn');
  } finally {
    saving = false;
    $('save').disabled = false;
  }
}

// --- wiring ---------------------------------------------------------------

for (const tab of document.querySelectorAll('[data-tab]')) {
  tab.addEventListener('click', () => setTab(tab.dataset.tab));
}
$('search').addEventListener('input', renderList);
$('new').addEventListener('click', startNew);
$('save').addEventListener('click', save);
for (const id of ['meta', 'body']) {
  $(id).addEventListener('input', saveLocal);
}
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 's') {
    event.preventDefault();
    save();
  }
});

(async function start() {
  try {
    const me = await api('/api/me');
    $('who').textContent = `@${me.login}`;
    show('app');
    posts = (await api('/api/posts')).posts;
    renderList();
    say('');
  } catch {
    show('signin');
  }
})();
