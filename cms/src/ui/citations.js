// Citations in the editor: the `{% citation <id> %}` block the site's
// _plugins/citations.rb renders, and the `_data/sources.yml` registry it
// reads. Pure functions, so the browser runs exactly what the tests cover.
// See docs/features/citation-design.md.

import { escapeHtml, renderMarkdown, safeUrl } from './markdown.js';

export const SOURCES_PATH = '_data/sources.yml';
export const SOURCE_TYPES = ['article', 'book', 'web', 'paper', 'video', 'talk', 'doc', 'rfc', 'code'];
export const TYPE_LABELS = {
  article: '글', book: '책', web: '웹', paper: '논문', video: '영상', talk: '발표',
  doc: '문서', rfc: 'RFC', code: '코드', post: '이 블로그의 글'
};

// Same order scripts/add-source.rb writes, so entries from either look alike.
const FIELD_ORDER = ['type', 'title', 'author', 'publisher', 'published', 'url',
  'number', 'doi', 'isbn', 'repo', 'commit', 'path', 'lines', 'note'];

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const isSourceId = (id) => ID.test(String(id));

function unquote(raw) {
  const value = raw.trim();
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    try { return JSON.parse(value); } catch { return value.slice(1, -1); }
  }
  if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value.replace(/\s+#.*$/, '');
}

/**
 * The registry as `{ id: { field: value } }`. Only the shape the registry
 * uses - top-level ids, two-space indented scalar fields - is understood;
 * anything else is skipped rather than guessed at.
 */
export function parseSources(text) {
  const sources = {};
  let current = null;

  for (const line of String(text ?? '').split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const top = line.match(/^([a-z0-9][a-z0-9-]*):\s*$/);
    if (top) {
      current = sources[top[1]] = {};
      continue;
    }

    const field = line.match(/^ {2}([a-z_]+):\s?(.*)$/);
    if (field && current) {
      current[field[1]] = unquote(field[2]);
    }
  }
  return sources;
}

/** A YAML scalar for one line: plain when it is safe, double-quoted otherwise. */
export function yamlScalar(value) {
  const text = String(value);
  const plain = /^[^\s'"`{}[\],&*#?|<>=!%@:-][^#]*$/.test(text) &&
    !/:\s|:$|\s#/.test(text) &&
    !/^(true|false|yes|no|on|off|null|~)$/i.test(text) &&
    text === text.trim();
  return plain ? text : JSON.stringify(text);
}

export function sourceBlock(id, entry) {
  const keys = [...FIELD_ORDER.filter((key) => key in entry),
    ...Object.keys(entry).filter((key) => !FIELD_ORDER.includes(key))];
  const lines = [`${id}:`];
  for (const key of keys) {
    const value = entry[key];
    if (value === undefined || value === null || String(value).trim() === '') continue;
    lines.push(`  ${key}: ${yamlScalar(String(value).trim())}`);
  }
  return lines.join('\n');
}

/** Appends entries to the registry text, keeping everything already there. */
export function appendSources(text, entries) {
  const head = String(text ?? '').replace(/\s+$/, '');
  const blocks = entries.map(({ id, entry }) => sourceBlock(id, entry));
  return `${head}${head ? '\n\n' : ''}${blocks.join('\n\n')}\n`;
}

function slug(text, words = 6) {
  return String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').split('-').filter(Boolean).slice(0, words).join('-');
}

/** Same rule as scripts/add-source.rb, made unique against `taken`. */
export function suggestSourceId(entry, taken = {}) {
  let base;
  if (entry.type === 'rfc' && entry.number) {
    base = `rfc-${entry.number}`;
  } else if (entry.type === 'code' && entry.repo) {
    const file = String(entry.path ?? '').split('/').pop().replace(/\.[^.]+$/, '');
    base = slug(`${entry.repo.split('/').pop()} ${file}`);
  } else {
    const author = String(entry.author ?? '').replace(/\s+et al\.?$/, '').split(',')[0].trim().split(/\s+/).pop();
    const who = author || String(entry.publisher ?? '').split(/\s+/)[0];
    base = slug(`${who ?? ''} ${String(entry.title ?? '').replace(/^[\d.\s]+/, '')}`);
  }
  if (!base && entry.url) {
    try {
      const url = new URL(entry.url);
      base = slug(`${url.hostname.replace(/^www\./, '')} ${url.pathname}`);
    } catch { /* fall through */ }
  }
  base ||= 'source';

  let id = base;
  for (let n = 2; id in taken; n += 1) id = `${base}-${n}`;
  return id;
}

function attr(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * The block to put in a post. `quote` and `note` are markdown; a note goes
 * under the `<!-- commentary -->` marker the plugin splits on.
 */
export function citationBlock({ id, at, quote, note }) {
  const open = `{% citation ${id}${at && at.trim() ? ` at=${attr(at.trim())}` : ''} %}`;
  const body = [String(quote ?? '').trim()];
  if (note && note.trim()) body.push('<!-- commentary -->', note.trim());
  return `${open}\n${body.join('\n')}\n{% endcitation %}`;
}

const BLOCK = /\{%-?\s*citation\s+(\S+)(.*?)-?%\}([\s\S]*?)\{%-?\s*endcitation\s*-?%\}/g;
const COMMENTARY = /^[ \t]*<!--\s*commentary\s*-->[ \t]*$/m;

function parseAt(markup) {
  const match = String(markup).match(/at\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+))/);
  if (!match) return null;
  return match[1] !== undefined ? match[1].replace(/\\(.)/g, '$1') : (match[2] ?? match[3]);
}

/** The citation blocks in a body, in order, with where they sit. */
export function findCitations(body) {
  const found = [];
  for (const match of String(body).matchAll(BLOCK)) {
    const [quote, note = ''] = match[3].split(COMMENTARY);
    found.push({
      id: match[1],
      at: parseAt(match[2]),
      quote: quote.trim(),
      note: note.trim(),
      start: match.index,
      end: match.index + match[0].length
    });
  }
  return found;
}

/** Ids a body cites that the registry does not have (`post:` ids aside). */
export function unknownSources(body, sources) {
  const missing = new Set();
  for (const { id } of findCitations(body)) {
    if (!id.startsWith('post:') && !(id in sources)) missing.add(id);
  }
  return [...missing];
}

function card(citation, sources, options) {
  const source = citation.id.startsWith('post:')
    ? { type: 'post', title: citation.id.slice(5) }
    : sources[citation.id];
  const caption = source
    ? [
        `<span class="cite-type">${escapeHtml(TYPE_LABELS[source.type] ?? source.type ?? '')}</span>`,
        source.author ? `${escapeHtml(source.author)}, ` : '',
        source.url
          ? `<cite><a href="${safeUrl(source.url)}" rel="noopener noreferrer" target="_blank">${escapeHtml(source.title ?? citation.id)}</a></cite>`
          : `<cite>${escapeHtml(source.title ?? citation.id)}</cite>`,
        citation.at ? ` · ${escapeHtml(citation.at)}` : ''
      ].join('')
    : `<span class="warn">등록되지 않은 출처: ${escapeHtml(citation.id)}</span>`;

  return [
    '<figure class="cite">',
    `<blockquote>${renderMarkdown(citation.quote, options)}</blockquote>`,
    `<figcaption>${caption}</figcaption>`,
    citation.note ? `<div class="cite-note"><span>작성자 메모</span>${renderMarkdown(citation.note, options)}</div>` : '',
    '</figure>'
  ].join('');
}

/**
 * Preview with citation blocks drawn as cards. The text around them goes
 * through the ordinary renderer; nothing in a block is executed.
 */
export function renderWithCitations(body, sources, options) {
  const text = String(body);
  const out = [];
  let at = 0;
  for (const citation of findCitations(text)) {
    out.push(renderMarkdown(text.slice(at, citation.start), options));
    out.push(card(citation, sources, options));
    at = citation.end;
  }
  out.push(renderMarkdown(text.slice(at), options));
  return out.filter(Boolean).join('\n');
}

/** The body with citation blocks blanked out, for the "Liquid not run" notice. */
export function withoutCitations(body) {
  return String(body).replace(BLOCK, (block) => block.replace(/[^\n]/g, ' '));
}
