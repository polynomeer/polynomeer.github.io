// Drafts a citation source from a URL, for the editor's "인용하기" dialog.
// The same rules as scripts/add-source.rb, which is the reference: RFCs,
// GitHub blob URLs pinned to a commit, DOIs through CSL JSON, YouTube through
// oEmbed, anything else through its meta tags. A failed fetch still returns
// what the URL alone says, flagged with `warnings`, so the dialog can always
// be filled in by hand.

const UA = 'polynomeer-cms source-draft';
const MAX_BYTES = 512 * 1024;

function decodeEntities(text) {
  return String(text)
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

const clean = (text) => decodeEntities(text).replace(/\s+/g, ' ').trim();

function escapeRe(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function metaTag(html, ...names) {
  for (const name of names) {
    const n = escapeRe(name);
    for (const re of [
      new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]*content=["']([^"']*)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${n}["']`, 'i')
    ]) {
      const value = html.match(re)?.[1];
      if (value && value.trim()) return clean(value);
    }
  }
  return null;
}

function titleTag(html) {
  const value = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return value ? clean(value) : null;
}

function dateOnly(value) {
  const match = String(value ?? '').match(/(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

async function get(fetchImpl, url, accept, warnings, headers = {}) {
  try {
    const response = await fetchImpl(url, {
      headers: { 'user-agent': UA, accept, ...headers },
      redirect: 'follow'
    });
    if (!response.ok) {
      warnings.push(`${url}: HTTP ${response.status}`);
      return null;
    }
    const text = await response.text();
    return text.length > MAX_BYTES ? text.slice(0, MAX_BYTES) : text;
  } catch (error) {
    warnings.push(`${url}: ${error.message}`);
    return null;
  }
}

async function rfc(number, fetchImpl, warnings) {
  const entry = {
    type: 'rfc', title: `RFC ${number}`, publisher: 'IETF', number: String(Number(number)),
    url: `https://datatracker.ietf.org/doc/html/rfc${Number(number)}`
  };
  const html = await get(fetchImpl, entry.url, 'text/html', warnings);
  if (html) {
    const title = (metaTag(html, 'og:title', 'DC.Title') || titleTag(html) || '')
      .replace(new RegExp(`^RFC\\s*${Number(number)}\\s*[-:–]\\s*`, 'i'), '').trim();
    if (title) entry.title = `RFC ${Number(number)} ${title}`;
    const date = dateOnly(metaTag(html, 'DC.Date.Issued', 'citation_publication_date'));
    if (date) entry.published = date;
  }
  return entry;
}

async function github(owner, repo, ref, path, hash, fetchImpl, warnings, token) {
  const entry = {
    type: 'code', title: path.split('/').pop(), author: `${owner}/${repo}`,
    repo: `${owner}/${repo}`, commit: ref, path
  };
  const lines = String(hash ?? '').match(/^#?L(\d+)(?:-L(\d+))?$/);
  if (lines) entry.lines = lines[2] ? `${lines[1]}-${lines[2]}` : lines[1];

  if (!/^[0-9a-f]{40}$/.test(ref)) {
    const body = await get(
      fetchImpl,
      `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`,
      'application/vnd.github+json', warnings,
      token ? { authorization: `Bearer ${token}` } : {}
    );
    let sha = null;
    try { sha = body ? JSON.parse(body).sha : null; } catch { /* below */ }
    if (sha) {
      entry.commit = sha;
      warnings.push(`'${ref}' 를 커밋 ${sha.slice(0, 7)} 로 고정했습니다`);
    } else {
      warnings.push(`'${ref}' 는 브랜치나 태그라 옮겨지면 인용이 어긋납니다`);
    }
  }
  return entry;
}

async function doi(id, fetchImpl, warnings) {
  const entry = { type: 'paper', title: id, doi: id, url: `https://doi.org/${id}` };
  const body = await get(fetchImpl, entry.url, 'application/vnd.citationstyles.csl+json', warnings);
  if (!body) return entry;
  try {
    const csl = JSON.parse(body);
    const first = (value) => clean([value].flat()[0] ?? '');
    let title = first(csl.title);
    const subtitle = first(csl.subtitle);
    if (subtitle && !title.includes(subtitle)) title = `${title}: ${subtitle}`;
    if (title) entry.title = title;
    const authors = (csl.author ?? []).map((a) => [a.given, a.family].filter(Boolean).join(' ')).filter(Boolean);
    if (authors.length) entry.author = authors.length > 3 ? `${authors[0]} et al.` : authors.join(', ');
    const container = first(csl['container-title']);
    if (container) entry.publisher = container;
    const parts = csl.issued?.['date-parts']?.[0];
    if (parts?.[0]) {
      const [y, m = 1, d = 1] = parts.map(Number);
      entry.published = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  } catch {
    warnings.push('DOI 메타데이터를 읽지 못했습니다');
  }
  return entry;
}

async function youtube(url, fetchImpl, warnings) {
  const id = url.hostname.endsWith('youtu.be') ? url.pathname.slice(1) : url.searchParams.get('v');
  const canonical = id ? `https://www.youtube.com/watch?v=${id}` : url.toString();
  const entry = { type: 'video', title: canonical, publisher: 'YouTube', url: canonical };
  const t = url.searchParams.get('t');
  if (t) entry.at = t;

  const body = await get(fetchImpl,
    `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(canonical)}`,
    'application/json', warnings);
  if (body) {
    try {
      const data = JSON.parse(body);
      if (data.title) entry.title = clean(data.title);
      if (data.author_name) entry.author = clean(data.author_name);
    } catch { /* keep the URL as title */ }
  }
  return entry;
}

async function page(url, fetchImpl, warnings) {
  const entry = { type: 'article', title: url.toString(), url: url.toString() };
  const html = await get(fetchImpl, url.toString(), 'text/html', warnings);
  if (html) {
    entry.title = metaTag(html, 'og:title', 'twitter:title') || titleTag(html) || entry.title;
    const author = metaTag(html, 'author', 'article:author', 'citation_author');
    if (author && !/^https?:\/\//.test(author)) entry.author = author;
    const site = metaTag(html, 'og:site_name');
    if (site) entry.publisher = site;
    // Only tags that mean "first published"; a bare `date` is often the last edit.
    const date = dateOnly(metaTag(html, 'article:published_time', 'citation_publication_date'));
    if (date) entry.published = date;
  }
  // Reference docs are living pages; their "published" stamp is the last build.
  if (url.hostname.startsWith('docs.') || /\/(docs|documentation|reference|manual)\//i.test(url.pathname)) {
    entry.type = 'doc';
    delete entry.published;
  }
  return entry;
}

/**
 * `{ entry, warnings }` for a URL (or a bare DOI). `entry.at` is a locator the
 * URL carried (a YouTube `t=`); it belongs on the citation, not the source.
 */
export async function draftSource(input, { fetch: fetchImpl = globalThis.fetch, token } = {}) {
  const warnings = [];
  let raw = String(input ?? '').trim();
  if (/^10\.\d{4,9}\/\S+$/.test(raw)) raw = `https://doi.org/${raw}`;

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw Object.assign(new Error('URL이 아닙니다'), { code: 'bad_url' });
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw Object.assign(new Error('http(s) 주소만 됩니다'), { code: 'bad_url' });
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const rfcMatch = raw.match(/(?:datatracker\.ietf\.org\/doc\/(?:html\/)?|rfc-editor\.org\/rfc\/|ietf\.org\/rfc\/)rfc(\d+)/i);
  const blob = url.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);

  let entry;
  if (rfcMatch) {
    entry = await rfc(rfcMatch[1], fetchImpl, warnings);
  } else if (host === 'github.com' && blob) {
    entry = await github(blob[1], blob[2], blob[3], decodeURIComponent(blob[4]), url.hash, fetchImpl, warnings, token);
  } else if (host === 'doi.org' || host === 'dx.doi.org') {
    entry = await doi(decodeURIComponent(url.pathname.slice(1)), fetchImpl, warnings);
  } else if (host.endsWith('youtube.com') || host === 'youtu.be') {
    entry = await youtube(url, fetchImpl, warnings);
  } else {
    entry = await page(url, fetchImpl, warnings);
  }
  return { entry, warnings };
}
