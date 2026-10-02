// Naming and sizing for uploaded images.
//
// Pure: no DOM, no fetch. The browser reads the bytes and the Worker commits
// them; what has to be right before either happens is the filename, and that
// is decided here where a test can see it.
//
// Images land beside the ones already in the repository, in assets/img/posts,
// and the thresholds are the ones scripts/audit-post-images.sh reports on, so
// the editor warns about the same file the audit would.

// Relative, not root-absolute: the browser serves these side by side so it
// resolves the same, and `node --test` can then import this file too.
import { slugify } from './frontmatter.js';

export const IMAGE_DIR = 'assets/img/posts';
export const WARN_BYTES = 300 * 1024;
export const CRITICAL_BYTES = 800 * 1024;

// Only what a static site should serve. A type that is not here is refused
// rather than guessed at: a mislabelled upload becomes a file nothing renders.
const EXTENSIONS = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/gif', 'gif'],
  ['image/webp', 'webp'],
  ['image/avif', 'avif'],
  ['image/svg+xml', 'svg']
]);

export function extensionFor(type) {
  return EXTENSIONS.get(String(type).toLowerCase()) ?? null;
}

export function isSupported(type) {
  return extensionFor(type) !== null;
}

/**
 * The stem of the original filename, slugified, with the extension taken from
 * the declared type rather than the name - a .jpeg, a .JPG and a screenshot
 * called "스크린샷 2026-10-02 오후 3.14.15.png" all have to come out usable.
 */
export function imageFileName(originalName, type) {
  const extension = extensionFor(type);
  if (!extension) {
    return null;
  }

  const stem = String(originalName ?? '').replace(/\.[^.]*$/, '');
  return `${slugify(stem) || 'image'}.${extension}`;
}

/**
 * A name nothing in `taken` already uses. Overwriting is the one outcome
 * worth ruling out: the editor cannot see what an existing image is used by,
 * so replacing one silently would break posts it never opened.
 */
export function uniqueImagePath(fileName, taken = []) {
  const used = new Set(taken);
  const match = String(fileName).match(/^(.*?)(\.[^.]*)?$/);
  const stem = match[1] || 'image';
  const extension = match[2] ?? '';

  let candidate = `${IMAGE_DIR}/${stem}${extension}`;
  for (let n = 2; used.has(candidate); n += 1) {
    candidate = `${IMAGE_DIR}/${stem}-${n}${extension}`;
  }
  return candidate;
}

/** `assets/img/posts/x.png` is where it is committed; `/assets/…` is how a page asks for it. */
export function publicUrl(repoPath) {
  return `/${String(repoPath).replace(/^\/+/, '')}`;
}

export function markdownFor(repoPath, alt = '') {
  return `![${String(alt).replace(/[[\]]/g, '')}](${publicUrl(repoPath)})`;
}

export function sizeLevel(bytes) {
  if (bytes >= CRITICAL_BYTES) return 'critical';
  if (bytes >= WARN_BYTES) return 'warn';
  return 'ok';
}

export function formatSize(bytes) {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
