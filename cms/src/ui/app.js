// The editor. No framework and no build step: the Worker serves this file as
// written, so what runs in the browser is what is in the repository.

import { findLiquid, renderMarkdown } from './markdown.js';
import {
  joinFrontMatter, postPath, slugify, splitFrontMatter
} from './frontmatter.js';
import {
  formatSize, imageFileName, isSupported, markdownFor, publicUrl, sizeLevel, uniqueImagePath
} from './images.js';
import { collapse, diffLines, diffStat } from './diff.js';

const $ = (id) => document.getElementById(id);
const DRAFT_PREFIX = 'cms:draft:';

let posts = [];
let images = [];
let current = null;
let saving = false;

// Images picked but not committed. They ride along with the next save so a
// post and the files it references land in one commit, which is the whole
// reason the change API takes a list of files.
//
// Deliberately not mirrored into localStorage like the text is: one
// screenshot in base64 is most of the quota, and evicting the text draft to
// hold an image would trade the copy that cannot be recovered for one that
// can be picked again.
let staged = [];
let siteUrl = null;
let revisions = null;

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

// --- revisions ------------------------------------------------------------
//
// Read-only. "이 버전 불러오기" puts the old text in the editor and nothing
// else: the save button stays the only thing that writes, so recovering a
// version goes through the same commit, the same conflict check and the same
// pull request as any other edit.

function currentText() {
  return joinFrontMatter($('meta').value, $('body').value);
}

async function loadRevisions() {
  if (!current || revisions) return;

  $('historynote').textContent = '불러오는 중…';
  $('historynote').className = 'muted';
  try {
    revisions = (await api(`/api/revisions/${encodeURIComponent(current.path)}`)).revisions;
  } catch (error) {
    $('historynote').textContent = `이력을 불러오지 못했습니다: ${error.message}`;
    $('historynote').className = 'warn';
    return;
  }
  renderRevisions();
}

function renderRevisions() {
  if (!revisions) return;

  $('historynote').textContent = revisions.length
    ? `${revisions.length}개 (이 파일을 건드린 커밋 전부 — 블로그의 '고쳐 쓴 기록'은 6줄 이상 바뀐 것만 셉니다)`
    : '이 글을 건드린 커밋이 아직 없습니다';
  $('historynote').className = 'muted';

  $('revisions').replaceChildren(...revisions.map((revision, index) => {
    const li = document.createElement('li');

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = revision.message || revision.sha.slice(0, 7);

    if (index === 0) {
      const now = document.createElement('span');
      now.className = 'current';
      now.textContent = '현재';
      button.append(now);
    }

    const when = document.createElement('span');
    when.className = 'when';
    when.textContent = [
      revision.date ? new Date(revision.date).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : null,
      revision.author,
      revision.sha.slice(0, 7)
    ].filter(Boolean).join(' · ');
    button.append(when);

    button.addEventListener('click', () => showRevision(revision, li));
    li.append(button);
    return li;
  }));
}

async function showRevision(revision, li) {
  for (const other of $('revisions').children) {
    other.removeAttribute('aria-current');
  }
  li.setAttribute('aria-current', 'true');

  $('diffbox').hidden = false;
  $('diffwhat').textContent = `${revision.sha.slice(0, 7)} → 지금 편집 중인 내용`;
  $('diffstat').textContent = '불러오는 중…';
  $('diff').replaceChildren();

  let text;
  try {
    text = (await api(
      `/api/posts/${encodeURIComponent(current.path)}?ref=${encodeURIComponent(revision.sha)}`
    )).text;
  } catch (error) {
    $('diffstat').textContent = `불러오지 못했습니다: ${error.message}`;
    return;
  }

  const lines = diffLines(text, currentText());
  const stat = diffStat(lines);
  $('diffstat').textContent = stat.added || stat.removed
    ? `+${stat.added} −${stat.removed}`
    : '지금 내용과 같습니다';

  $('diff').replaceChildren(...collapse(lines).map((line) => {
    const row = document.createElement('div');
    row.className = line.type;
    // textContent: this is file content, and the one place a past version
    // would otherwise reach the page as markup.
    row.textContent = line.type === 'gap' ? `⋯ ${line.count}줄` : line.text;
    return row;
  }));

  $('restorerev').onclick = () => {
    const parts = splitFrontMatter(text);
    $('meta').value = parts.raw;
    $('body').value = parts.body;
    saveLocal();
    setTab('write');
    say(`${revision.sha.slice(0, 7)} 을 불러왔습니다. 저장해야 반영됩니다`, 'warn');
  };
}

// --- images ---------------------------------------------------------------

function stagedUrls() {
  return new Map(staged.map((item) => [publicUrl(item.path), item.url]));
}

function takenImagePaths() {
  return [...images, ...staged.map((item) => item.path)];
}

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    // readAsDataURL rather than ArrayBuffer: the tail of the data URL is
    // already the base64 the API wants, with no re-encoding in between.
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(file);
  });
}

async function stageFiles(fileList) {
  const files = [...fileList];
  const refused = files.filter((file) => !isSupported(file.type));

  for (const file of files.filter((f) => isSupported(f.type))) {
    const name = imageFileName(file.name || 'image', file.type);
    staged.push({
      path: uniqueImagePath(name, takenImagePaths()),
      bytes: file.size,
      base64: await readAsBase64(file),
      url: URL.createObjectURL(file)
    });
  }

  $('imagenote').textContent = refused.length
    ? `${refused.length}개는 지원하지 않는 형식이라 뺐습니다 (png, jpg, gif, webp, avif, svg)`
    : '';
  $('imagenote').className = refused.length ? 'warn' : 'muted';
  renderStaged();
}

function renameStaged(item, value) {
  const name = imageFileName(value, 'image/png') && value.trim();
  if (!name) return;
  // Its own current path must not count as taken, or every edit suffixes it.
  const others = takenImagePaths().filter((path) => path !== item.path);
  item.path = uniqueImagePath(name, others);
  renderStaged();
}

function renderStaged() {
  $('imagecount').textContent = staged.length ? ` ${staged.length}` : '';

  $('staged').replaceChildren(...staged.map((item) => {
    const li = document.createElement('li');

    const thumb = document.createElement('img');
    thumb.src = item.url;
    thumb.alt = '';

    const middle = document.createElement('div');
    const name = document.createElement('input');
    name.className = 'name';
    name.value = item.path.split('/').pop();
    name.spellcheck = false;
    name.addEventListener('change', () => renameStaged(item, name.value));

    const row = document.createElement('div');
    row.className = 'row';
    const size = document.createElement('span');
    const level = sizeLevel(item.bytes);
    size.className = `size ${level}`;
    size.textContent = level === 'ok'
      ? formatSize(item.bytes)
      // The thresholds scripts/audit-post-images.sh uses, said before the
      // file is committed rather than after.
      : `${formatSize(item.bytes)} — ${level === 'critical' ? '너무 큽니다' : '큽니다'}`;
    row.append(size);
    middle.append(name, row);

    const tools = document.createElement('div');
    tools.className = 'tools';

    const insert = document.createElement('button');
    insert.type = 'button';
    insert.className = 'button';
    insert.textContent = '본문에 넣기';
    insert.addEventListener('click', () => insertImage(item));

    const drop = document.createElement('button');
    drop.type = 'button';
    drop.className = 'button';
    drop.textContent = '빼기';
    drop.addEventListener('click', () => {
      URL.revokeObjectURL(item.url);
      staged = staged.filter((other) => other !== item);
      renderStaged();
    });

    tools.append(insert, drop);
    li.append(thumb, middle, tools);
    return li;
  }));
}

function insertImage(item) {
  const body = $('body');
  const markdown = markdownFor(item.path, item.path.split('/').pop().replace(/\.[^.]*$/, ''));
  const at = body.selectionStart ?? body.value.length;
  const before = body.value.slice(0, at);
  const after = body.value.slice(body.selectionEnd ?? at);
  // An image needs a blank line on each side or it is pulled into the
  // paragraph next to it.
  const lead = !before || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const trail = !after || after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';

  body.value = `${before}${lead}${markdown}${trail}${after}`;
  saveLocal();
  setTab('write');
  const caret = (before + lead + markdown).length;
  body.focus();
  body.setSelectionRange(caret, caret);
}

function clearRevisions() {
  revisions = null;
  $('revisions').replaceChildren();
  $('historynote').textContent = '';
  $('diffbox').hidden = true;
}

function clearStaged() {
  staged.forEach((item) => URL.revokeObjectURL(item.url));
  staged = [];
  $('imagenote').textContent = '';
  renderStaged();
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

    // Only the states that mean "not on the site". Saying "published" on a
    // thousand rows says nothing.
    if (post.status && post.status !== 'published') {
      const flag = document.createElement('span');
      flag.className = 'flag';
      flag.textContent = post.status;
      button.append(flag);
    }

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
  if (name === 'history') loadRevisions();
}

function refreshPreview() {
  $('preview').innerHTML = renderMarkdown($('body').value, {
    images: stagedUrls(), siteBase: siteUrl
  });

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

  // Staged images belong to the post they were picked for; carrying them to
  // the next one would commit a file that post never references.
  clearStaged();
  clearRevisions();

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

  clearStaged();
  clearRevisions();
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
        files: [
          { path: current.path, content: text },
          // One commit, so the site is never built from a post whose image
          // has not landed.
          ...staged.map((item) => ({
            path: item.path, content: item.base64, encoding: 'base64'
          }))
        ],
        ...(usePr ? { branch: `cms/${slugify(current.path)}`, pullRequest: {} } : {})
      })
    });

    clearLocal(current.path);
    images = [...images, ...staged.map((item) => item.path)];
    clearStaged();
    clearRevisions();
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

$('pick').addEventListener('change', (event) => {
  stageFiles(event.target.files);
  // So picking the same file twice in a row still fires a change.
  event.target.value = '';
});

for (const [type, over] of [['dragenter', true], ['dragover', true], ['dragleave', false], ['drop', false]]) {
  $('drop').addEventListener(type, (event) => {
    event.preventDefault();
    $('drop').classList.toggle('over', over);
    if (type === 'drop') stageFiles(event.dataTransfer.files);
  });
}

// A screenshot is pasted far more often than it is saved to disk and picked.
$('body').addEventListener('paste', (event) => {
  const files = [...(event.clipboardData?.files ?? [])];
  if (files.length) {
    event.preventDefault();
    stageFiles(files);
    setTab('images');
  }
});
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
    siteUrl = me.siteUrl;
    show('app');
    const listing = await api('/api/posts');
    posts = listing.posts;
    images = listing.images ?? [];
    renderList();
    say('');
  } catch {
    show('signin');
  }
})();
