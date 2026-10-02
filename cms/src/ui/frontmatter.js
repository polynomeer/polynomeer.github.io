// Front matter read and written as text.
//
// The design requires that a form edit preserve comments, key order, quoting
// style and fields the CMS does not know about. The usual way to break all
// four at once is to parse YAML into an object and serialise it back.
//
// So nothing is serialised. A field edit rewrites the one line that holds
// that key and leaves every other byte alone, which preserves those four
// properties by construction rather than by effort. Reading for display can
// still use a real YAML parser; writing goes through here.

const DELIMITER = /^---\s*$/;

/** { raw, body, hasFrontMatter } - raw excludes the --- fences. */
export function splitFrontMatter(text) {
  const source = String(text);
  const lines = source.split('\n');

  if (!DELIMITER.test(lines[0] ?? '')) {
    return { raw: '', body: source, hasFrontMatter: false };
  }

  for (let i = 1; i < lines.length; i += 1) {
    if (DELIMITER.test(lines[i])) {
      return {
        raw: lines.slice(1, i).join('\n'),
        body: lines.slice(i + 1).join('\n'),
        hasFrontMatter: true
      };
    }
  }

  // An unterminated block is front matter the author is still typing, not body.
  return { raw: lines.slice(1).join('\n'), body: '', hasFrontMatter: true };
}

export function joinFrontMatter(raw, body) {
  return `---\n${raw.replace(/\n+$/, '')}\n---\n${body.replace(/^\n+/, '')}`;
}

/** Top-level `key:` only - an indented line belongs to a nested mapping. */
function topLevelKeyIndex(lines, key) {
  const pattern = new RegExp(`^${key.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*:`);
  return lines.findIndex((line) => pattern.test(line));
}

export function readField(raw, key) {
  const lines = String(raw).split('\n');
  const index = topLevelKeyIndex(lines, key);
  if (index === -1) {
    return null;
  }
  return lines[index].slice(lines[index].indexOf(':') + 1).trim();
}

/**
 * Replaces the value on an existing top-level key, or appends the key when it
 * is absent. `value` is written verbatim, so the caller decides the quoting -
 * that is the point: nothing re-quotes what the author already wrote.
 *
 * Passing null removes the line.
 */
export function setField(raw, key, value) {
  const lines = String(raw).split('\n');
  const index = topLevelKeyIndex(lines, key);

  if (value === null) {
    if (index === -1) {
      return raw;
    }
    lines.splice(index, 1);
    return lines.join('\n');
  }

  if (index === -1) {
    const trimmed = lines.length && lines.at(-1).trim() === '' ? lines.slice(0, -1) : lines;
    return [...trimmed, `${key}: ${value}`].join('\n');
  }

  lines[index] = `${key}: ${value}`;
  return lines.join('\n');
}

/** Quotes a scalar only when YAML would otherwise read it as something else. */
export function yamlScalar(value) {
  const text = String(value);
  if (text === '') {
    return '""';
  }
  if (/^[\w가-힣][\w가-힣 .\-/]*$/u.test(text) && !/^(true|false|null|yes|no|on|off)$/i.test(text)) {
    return text;
  }
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** `[a, b]` - the flow style the repository already uses for tags and categories. */
export function yamlList(values) {
  return `[${values.map((v) => yamlScalar(v)).join(', ')}]`;
}

/** _posts/<type>/<YYYY-MM-DD>-<slug>.md */
export function postPath(contentType, date, slug) {
  return `_posts/${contentType}/${date}-${slug}.md`;
}

export function slugify(title) {
  return String(title)
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
