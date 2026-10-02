// A deliberately small Markdown renderer for the preview pane.
//
// Safety comes from the order of operations, not from a sanitiser: the source
// is HTML-escaped first, and only then are the handful of recognised
// constructs turned into tags this file generates. Nothing the author types
// can become an element, so `<script>` and `<img onerror=...>` arrive in the
// preview as visible text. There is no sanitiser to misconfigure and no
// allowlist to get wrong.
//
// It renders less than Jekyll does, and says so: Liquid is reported rather
// than guessed at, because the preview cannot run the site's plugins and a
// silently wrong preview is worse than an honest gap.

const INLINE_CODE = /`([^`]+)`/g;
const BOLD = /\*\*([^*]+)\*\*/g;
const ITALIC = /(^|[^*])\*([^*]+)\*/g;
const LINK = /\[([^\]]*)\]\(([^)\s]+)\)/g;
const IMAGE = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Only http(s) and same-site references survive. Everything else - javascript:,
 * data:, vbscript: - becomes '#', so a crafted link cannot run anything.
 * The input is already escaped, so `&amp;` is what a real `&` looks like here.
 */
export function safeUrl(url) {
  const value = String(url).trim();

  if (/^(https?:)?\/\//i.test(value)) {
    return value;
  }
  if (value.startsWith('/') || value.startsWith('#') || value.startsWith('./')) {
    return value;
  }
  // A bare word like `page.md` is a relative path; a scheme is not.
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return '#';
  }
  return value;
}

/**
 * The site-root path an asset reference means, or null if it is not one.
 *
 * Posts here write `../../../assets/img/...`, which only resolves because it
 * overshoots the root from a two-segment permalink. Both that and the plain
 * `/assets/...` form name the same file.
 */
export function assetPath(url) {
  if (url.startsWith('/assets/')) {
    return url;
  }
  const climbed = url.replace(/^(\.\.?\/)+/, '');
  return climbed !== url && climbed.startsWith('assets/') ? `/${climbed}` : null;
}

function renderInline(escaped, images, siteBase) {
  return escaped
    .replace(IMAGE, (_match, alt, src) => {
      // An image picked in this session is not committed yet, so its URL
      // 404s. `images` maps the exact path the markdown names to an object
      // URL this editor created; it is our own string, not author input, so
      // it does not go through safeUrl - and a src that is not an exact key
      // still does.
      const pending = images?.get?.(src);
      if (pending) {
        return `<img src="${pending}" alt="${alt}">`;
      }

      // The editor is not served from the blog, so without this every image
      // already committed is a broken icon here. Only after safeUrl, and
      // only for a path that points at the site's own assets.
      const url = safeUrl(src);
      const rooted = siteBase ? assetPath(url) : null;
      return `<img src="${rooted ? siteBase + rooted : url}" alt="${alt}">`;
    })
    .replace(LINK, (_match, text, href) =>
      `<a href="${safeUrl(href)}" rel="noopener noreferrer" target="_blank">${text}</a>`)
    .replace(INLINE_CODE, '<code>$1</code>')
    .replace(BOLD, '<strong>$1</strong>')
    .replace(ITALIC, '$1<em>$2</em>');
}

/** Liquid the preview cannot run. Reported with line numbers, never executed. */
export function findLiquid(source) {
  const found = [];
  String(source).split('\n').forEach((line, index) => {
    const match = line.match(/\{%[^%]*%\}|\{\{[^}]*\}\}/);
    if (match) {
      found.push({ line: index + 1, text: match[0] });
    }
  });
  return found;
}

export function renderMarkdown(source, { images, siteBase } = {}) {
  const lines = String(source).split('\n');
  const out = [];

  let inFence = false;
  let fence = [];
  let list = null;
  let paragraph = [];

  const closeParagraph = () => {
    if (paragraph.length) {
      out.push(`<p>${renderInline(paragraph.join(' '), images, siteBase)}</p>`);
      paragraph = [];
    }
  };

  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };

  for (const rawLine of lines) {
    const line = escapeHtml(rawLine);

    if (/^\s*```/.test(rawLine)) {
      if (inFence) {
        out.push(`<pre><code>${fence.join('\n')}</code></pre>`);
        fence = [];
        inFence = false;
      } else {
        closeParagraph();
        closeList();
        inFence = true;
      }
      continue;
    }

    if (inFence) {
      fence.push(line);
      continue;
    }

    if (!rawLine.trim()) {
      closeParagraph();
      closeList();
      continue;
    }

    const heading = rawLine.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeParagraph();
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${renderInline(escapeHtml(heading[2]), images, siteBase)}</h${level}>`);
      continue;
    }

    const quote = rawLine.match(/^>\s?(.*)$/);
    if (quote) {
      closeParagraph();
      closeList();
      out.push(`<blockquote>${renderInline(escapeHtml(quote[1]), images, siteBase)}</blockquote>`);
      continue;
    }

    const bullet = rawLine.match(/^\s*[-*+]\s+(.*)$/);
    const numbered = rawLine.match(/^\s*\d+\.\s+(.*)$/);
    if (bullet || numbered) {
      closeParagraph();
      const wanted = bullet ? 'ul' : 'ol';
      if (list !== wanted) {
        closeList();
        out.push(`<${wanted}>`);
        list = wanted;
      }
      out.push(`<li>${renderInline(escapeHtml((bullet || numbered)[1]), images, siteBase)}</li>`);
      continue;
    }

    closeList();
    paragraph.push(line);
  }

  if (inFence) {
    // An unterminated fence still renders as code rather than leaking out.
    out.push(`<pre><code>${fence.join('\n')}</code></pre>`);
  }
  closeParagraph();
  closeList();

  return out.join('\n');
}
