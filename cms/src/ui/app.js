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
import {
  SOURCES_PATH, SOURCE_TYPES, TYPE_LABELS, appendSources, citationBlock, isSourceId,
  parseSources, renderWithCitations, suggestSourceId, unknownSources, withoutCitations
} from './citations.js';

const $ = (id) => document.getElementById(id);
const DRAFT_PREFIX = 'cms:draft:';

let posts = [];
let dictionary = [];
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

// The citation registry (_data/sources.yml) as last read, and sources added
// from the "인용하기" dialog that ride along with the next save, like images.
let sources = {};
let sourcesLoaded = false;
let stagedSources = [];

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

// --- what each collection is ----------------------------------------------
//
// The dictionaries the content contract validates posts against. A post can
// name a series, topic, type or status that does not exist yet, and that is
// an error the validator fails on - so the editor has to be able to add one
// rather than send the author to the repository.
//
// The fields are the ones every existing entry in that collection already
// carries. A new entry starts looking like its neighbours.

const COLLECTIONS = {
  topics: {
    dir: '_topics',
    scope: 'topics',
    label: '토픽',
    scaffold: (id, title) => [
      `title: "${title}"`,
      `topic_id: ${id}`,
      `permalink: /topics/${id}/`,
      'order: 99',
      'question: ""',
      'description: ""',
      'tags: []',
      'featured: []',
      'posts: []',
      'exclude: []'
    ]
  },
  series_pages: {
    dir: '_series_pages',
    scope: 'series',
    label: '시리즈',
    scaffold: (id, title) => [
      `title: "${title}"`,
      `series_id: ${id}`,
      'group: study',
      `permalink: /series/${id}/`,
      'description: ""',
      'hero_note: ""'
    ]
  },
  content_types: {
    dir: '_content_types',
    scope: 'content-types',
    label: '유형',
    scaffold: (id, title) => [
      `title: "${title}"`,
      `content_type_id: ${id}`,
      `permalink: /types/${id}/`,
      'order: 99'
    ]
  },
  post_statuses: {
    dir: '_post_statuses',
    scope: 'post-statuses',
    label: '상태',
    scaffold: (id, title) => [
      `title: "${title}"`,
      `post_status_id: ${id}`,
      `permalink: /statuses/${id}/`,
      'order: 99'
    ]
  }
};

const scope = () => $('scope').value;
const collection = () => COLLECTIONS[scope()] ?? null;

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

/**
 * `docs(<scope>): update <slug>`.
 *
 * Conventional Commits, because that is what the repository enforces -
 * @commitlint/config-conventional has no `post` type, and these commits
 * reach the repository through the API where the hook cannot catch one.
 * For a post the scope is its content type, which is what the scopes in
 * this history already are: notes, lecture, til, recruit, book.
 */
function commitMessageFor(path) {
  const name = path.split('/').pop().replace(/\.(md|markdown)$/, '');
  const here = Object.values(COLLECTIONS).find((entry) => path.startsWith(`${entry.dir}/`));
  const scope = here ? here.scope : path.split('/')[1]?.toLowerCase() || 'post';

  return `docs(${scope}): update ${name}`;
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
  // A new source belongs to the post that cites it, like a staged image.
  for (const { id } of stagedSources) delete sources[id];
  stagedSources = [];
  renderCiteStatus();
}

// --- list -----------------------------------------------------------------

function listed() {
  const here = collection();
  return here
    ? dictionary.filter((entry) => entry.path.startsWith(`${here.dir}/`))
    : posts;
}

function renderList() {
  const all = listed();
  const needle = $('search').value.trim().toLowerCase();
  const shown = all
    .filter((p) => !needle || p.path.toLowerCase().includes(needle) ||
      (p.title || '').toLowerCase().includes(needle) ||
      (p.id || '').toLowerCase().includes(needle))
    .slice(0, 200);

  $('count').textContent = `${shown.length} / ${all.length}`;

  $('posts').replaceChildren(...shown.map((post) => {
    const li = document.createElement('li');
    if (current && current.path === post.path) li.setAttribute('aria-current', 'true');

    const button = document.createElement('button');
    button.type = 'button';
    // textContent, not innerHTML: a title is author input and this list is
    // the one place it would otherwise be injected as markup.
    button.textContent = post.title || post.path.split('/').pop();

    // For a dictionary entry the id is what posts actually write, so it is
    // worth more than the path.
    if (post.id) {
      const id = document.createElement('span');
      id.className = 'id';
      id.textContent = post.id;
      button.append(id);
    }

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
  const body = $('body').value;
  // Citation blocks are drawn as cards from the registry; the rest of the
  // Liquid is still only reported.
  $('preview').innerHTML = renderWithCitations(body, sources, {
    images: stagedUrls(), siteBase: siteUrl
  });

  const notes = [];
  const liquid = findLiquid(withoutCitations(body));
  if (liquid.length) {
    notes.push(`Liquid ${liquid.length}곳은 미리보기에서 실행되지 않습니다 (${liquid
      .slice(0, 3).map((l) => `${l.line}행`).join(', ')}${liquid.length > 3 ? ' 외' : ''}).`);
  }
  const missing = sourcesLoaded ? unknownSources(body, sources) : [];
  if (missing.length) {
    notes.push(`등록되지 않은 출처: ${missing.join(', ')} - 빌드 검사에서 막힙니다.`);
  }
  $('liquid').hidden = notes.length === 0;
  $('liquid').textContent = notes.join(' ');
}

// --- citations ------------------------------------------------------------

async function loadSources() {
  try {
    const file = await api(`/api/posts/${encodeURIComponent(SOURCES_PATH)}`);
    const read = parseSources(file.text);
    // Keep sources staged in this session; the server has not seen them yet.
    for (const { id, entry } of stagedSources) read[id] = entry;
    sources = read;
    sourcesLoaded = true;
  } catch {
    // No registry yet, or it could not be read: the dialog still works, it
    // just has nothing to pick from.
    sourcesLoaded = false;
  }
}

function renderCiteStatus() {
  $('citestatus').textContent = stagedSources.length
    ? `새 출처 ${stagedSources.length}개가 다음 저장에 함께 올라갑니다 (${stagedSources.map((s) => s.id).join(', ')})`
    : '';
}

let citeChoice = null;
let citeRange = null;

function sourceLabel(id, entry) {
  return [TYPE_LABELS[entry.type] ?? entry.type, entry.author || entry.publisher]
    .filter(Boolean).join(' · ') || id;
}

function chooseSource(id, entry, isNew = false) {
  citeChoice = { id, entry, isNew };
  $('citechosen').textContent = `${entry.title || id} (${id})${isNew ? ' - 새로 등록' : ''}`;
  $('citechosen').classList.add('set');
  renderSourceList();
}

function renderSourceList() {
  const query = $('citesearch').value.trim().toLowerCase();
  const rows = Object.entries(sources)
    .filter(([id, entry]) => !query || [id, entry.title, entry.author, entry.publisher]
      .some((value) => String(value ?? '').toLowerCase().includes(query)))
    .slice(0, 50);

  $('citesources').replaceChildren(...rows.map(([id, entry]) => {
    const li = document.createElement('li');
    if (citeChoice?.id === id) li.setAttribute('aria-current', 'true');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = entry.title || id;
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = `${id} · ${sourceLabel(id, entry)}`;
    button.append(meta);
    button.addEventListener('click', () => chooseSource(id, entry));
    li.append(button);
    return li;
  }));
  if (!rows.length) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = sourcesLoaded ? '맞는 출처가 없습니다. 아래에서 새로 등록하세요.' : '등록된 출처를 읽지 못했습니다.';
    $('citesources').replaceChildren(li);
  }
}

const NEW_FIELDS = ['type', 'title', 'author', 'publisher', 'published', 'url'];
let draftExtra = {};

function fillNewSource(entry) {
  draftExtra = {};
  for (const [key, value] of Object.entries(entry)) {
    if (key === 'at') continue;
    if (NEW_FIELDS.includes(key)) $(`cn${key}`).value = value ?? '';
    else draftExtra[key] = value;
  }
  $('cnid').value = suggestSourceId(entry, sources);
  if (entry.at && !$('citeat').value) $('citeat').value = entry.at;
}

async function fetchDraft() {
  const url = $('citeurl').value.trim();
  if (!url) return;
  $('citedraftnote').textContent = '불러오는 중…';
  try {
    const { entry, warnings } = await api('/api/source-draft', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url })
    });
    fillNewSource(entry);
    $('citedraftnote').textContent = warnings.length
      ? warnings.join(' / ')
      : '불러왔습니다. 제목과 저자를 확인하세요.';
  } catch (error) {
    $('citedraftnote').textContent = `불러오지 못했습니다: ${error.message}. 직접 채워도 됩니다.`;
  }
}

function useNewSource() {
  const id = $('cnid').value.trim();
  const entry = { ...draftExtra };
  for (const key of NEW_FIELDS) {
    const value = $(`cn${key}`).value.trim();
    if (value) entry[key] = value;
  }

  if (!isSourceId(id)) return citeError('id는 소문자, 숫자, 하이픈만 씁니다 (예: kleppmann-ddia).');
  if (id in sources && !stagedSources.some((s) => s.id === id)) return citeError(`'${id}' 는 이미 등록되어 있습니다. 목록에서 고르세요.`);
  if (!entry.title) return citeError('제목이 필요합니다.');
  if (entry.published && !/^\d{4}-\d{2}-\d{2}$/.test(entry.published)) return citeError('발행일은 YYYY-MM-DD 입니다.');
  citeError('');
  chooseSource(id, entry, true);
}

function citeError(text) {
  $('citeerror').textContent = text;
  return false;
}

async function openCiteDialog() {
  if (!current) {
    say('먼저 글을 여세요', 'warn');
    return;
  }
  const body = $('body');
  citeRange = [body.selectionStart, body.selectionEnd];
  const selected = body.value.slice(...citeRange);
  // A selected `> quote` loses its markers: the card is the quote now.
  $('citequote').value = selected.replace(/^>\s?/gm, '').trim();
  $('citeat').value = '';
  $('citenote').value = '';
  $('citesearch').value = '';
  $('citeurl').value = '';
  $('citedraftnote').textContent = '';
  for (const key of ['id', ...NEW_FIELDS]) $(`cn${key}`).value = '';
  $('cntype').value = 'article';
  $('citenew').open = false;
  citeError('');
  citeChoice = null;
  $('citechosen').textContent = '아직 고르지 않았습니다';
  $('citechosen').classList.remove('set');

  $('citedialog').showModal();
  if (!sourcesLoaded) await loadSources();
  renderSourceList();
  $(selected ? 'citesearch' : 'citequote').focus();
}

function insertCitation() {
  const quote = $('citequote').value.trim();
  if (!quote) return citeError('인용문이 비어 있습니다.');
  if (!citeChoice) return citeError('출처를 고르거나 새로 등록하세요.');

  if (citeChoice.isNew && !stagedSources.some((s) => s.id === citeChoice.id)) {
    stagedSources.push({ id: citeChoice.id, entry: citeChoice.entry });
    sources[citeChoice.id] = citeChoice.entry;
  }

  const block = citationBlock({
    id: citeChoice.id, at: $('citeat').value, quote, note: $('citenote').value
  });
  const body = $('body');
  const [start, end] = citeRange ?? [body.value.length, body.value.length];
  const before = body.value.slice(0, start);
  const after = body.value.slice(end);
  // The plugin's block sits on its own lines, with a blank line around it so
  // the paragraphs next to it stay paragraphs.
  const lead = !before || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const tail = !after || after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  body.value = `${before}${lead}${block}${tail}${after}`;
  const caret = (before + lead + block).length;
  body.setSelectionRange(caret, caret);

  saveLocal();
  renderCiteStatus();
  $('citedialog').close();
  body.focus();
  say(citeChoice.isNew ? `인용을 넣었습니다. 새 출처 '${citeChoice.id}' 는 저장할 때 함께 올라갑니다` : '인용을 넣었습니다');
  return true;
}

/** The registry file for this save: the server's current copy plus what is staged. */
async function sourcesFileForSave() {
  if (!stagedSources.length) return null;
  let text = '';
  try {
    text = (await api(`/api/posts/${encodeURIComponent(SOURCES_PATH)}`)).text;
  } catch (error) {
    // Only "there is no registry yet" may start one from nothing; anything
    // else would overwrite the file blind.
    if (!/404|not found/i.test(error.message) && error.body?.error?.code !== 'not_found') throw error;
  }
  const onServer = parseSources(text);
  const fresh = stagedSources.filter(({ id }) => !(id in onServer));
  return fresh.length ? { path: SOURCES_PATH, content: appendSources(text, fresh) } : null;
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
  const here = collection();
  const title = prompt(here ? `${here.label} 제목` : '제목');
  if (!title) return;

  if (here) {
    startNewDictionaryEntry(here, title);
    return;
  }

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

function startNewDictionaryEntry(here, title) {
  const id = prompt(`${here.label} id (글에서 이 값을 씁니다)`, slugify(title) || '');
  if (!id) return;

  const path = `${here.dir}/${id}.md`;
  if (dictionary.some((entry) => entry.path === path)) {
    say(`${path} 는 이미 있습니다`, 'warn');
    return;
  }

  clearStaged();
  clearRevisions();
  current = { path, sha: null, serverText: '' };
  $('path').textContent = path;
  $('meta').value = here.scaffold(id, title.replace(/"/g, '\\"')).join('\n');
  $('body').value = '';
  $('restore').hidden = true;
  say(`새 ${here.label}`);
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
    // Read right before the commit and only appended to, so a source added
    // elsewhere since the editor loaded is kept rather than overwritten.
    const sourcesFile = await sourcesFileForSave();
    const result = await api('/api/changes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message: commitMessageFor(current.path),
        changeId: current.changeId,
        files: [
          { path: current.path, content: text },
          // One commit, so the site is never built from a post whose image
          // has not landed.
          ...staged.map((item) => ({
            path: item.path, content: item.base64, encoding: 'base64'
          })),
          ...(sourcesFile ? [sourcesFile] : [])
        ],
        ...(usePr ? { branch: `cms/${slugify(current.path)}`, pullRequest: {} } : {})
      })
    });

    clearLocal(current.path);
    images = [...images, ...staged.map((item) => item.path)];
    // Committed now: they stay in `sources` but are no longer pending.
    const committedSources = stagedSources;
    stagedSources = [];
    // A new entry exists from now on, so the list and the id collision check
    // both know about it without a reload.
    const where = Object.values(COLLECTIONS)
      .find((entry) => current.path.startsWith(`${entry.dir}/`));
    if (where && !dictionary.some((entry) => entry.path === current.path)) {
      dictionary = [...dictionary, { path: current.path }];
      renderList();
    }
    clearStaged();
    for (const { id, entry } of committedSources) sources[id] = entry;
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
$('scope').addEventListener('change', () => {
  $('search').value = '';
  renderList();
});

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
$('cite').addEventListener('click', openCiteDialog);
// Enter in a field would submit the dialog's form and close it; only the
// cancel button may do that.
$('citeform').addEventListener('submit', (event) => {
  if (event.submitter?.value !== 'cancel') event.preventDefault();
});
$('citesearch').addEventListener('input', renderSourceList);
$('citefetch').addEventListener('click', fetchDraft);
$('citeurl').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    fetchDraft();
  }
});
$('citeusenew').addEventListener('click', useNewSource);
$('citeinsert').addEventListener('click', insertCitation);
$('cntype').replaceChildren(...SOURCE_TYPES.map((type) => {
  const option = document.createElement('option');
  option.value = type;
  option.textContent = `${TYPE_LABELS[type]} (${type})`;
  return option;
}));
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
    dictionary = listing.dictionary ?? [];
    renderList();
    say('');
    // For the preview's cards; the dialog loads it again if this failed.
    loadSources();
  } catch {
    show('signin');
  }
})();
