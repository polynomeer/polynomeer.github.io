// Runs the real Worker locally against the real _posts, with GitHub faked.
//
// Not a deployment and not a test: it exists so the editor can be clicked
// through before any OAuth app or Cloudflare account is set up. Writes are
// captured and printed instead of committed.
//
//   node cms/tools/dev-server.js   ->  http://127.0.0.1:4010

import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

import { SESSION_COOKIE, signSession } from '../src/auth.js';
import { DICTIONARY_DIRS } from '../src/github.js';
import { createWorker } from '../src/worker.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const UI = path.resolve(import.meta.dirname, '../src/ui');
const PORT = 4010;
const ADMIN_ID = 62940574;
const SECRET = 'dev-secret-not-used-anywhere-else-0000';

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8' };

async function walk(dir, match, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, match, out);
    else if (match.test(entry.name)) out.push(path.relative(ROOT, full));
  }
  return out;
}

const posts = await walk(path.join(ROOT, '_posts'), /\.(md|markdown)$/);
// The real tree read returns these too, and without them nothing local can
// show what happens when an upload collides with an image already committed.
const assets = await walk(path.join(ROOT, 'assets/img'), /\.(png|jpe?g|gif|webp|avif|svg)$/i);
const dictionary = (await Promise.all(
  DICTIONARY_DIRS.map((dir) => walk(path.join(ROOT, dir), /\.md$/))
)).flat();
console.log(
  `fake GitHub serving ${posts.length} posts, ${assets.length} images, ` +
  `${dictionary.length} dictionary entries`
);

// Stands in for api.github.com. Reads are real files; writes are logged.
const fakeGitHub = async (url, init = {}) => {
  const reply = (body, status = 200) => ({
    ok: status < 400, status,
    text: async () => JSON.stringify(body),
    json: async () => body
  });

  if (url.includes('/git/ref/heads/')) return reply({ object: { sha: 'devhead' } });
  if (url.includes('/git/commits/devhead')) return reply({ sha: 'devhead', message: 'dev', tree: { sha: 'devtree' } });
  if (url.includes('/git/trees/devtree')) {
    return reply({
      tree: [...posts, ...assets, ...dictionary].map((p) => ({ type: 'blob', path: p, sha: 'blob' }))
    });
  }
  // Real git history, so the revision view can be used locally rather than
  // just rendered. Reads only; nothing here writes to the repository.
  if (url.includes('/commits?')) {
    const file = new URL(url).searchParams.get('path');
    const { stdout } = await run('git', [
      'log', '--max-count=30', '--format=%H%x1f%s%x1f%aI%x1f%an', '--', file
    ], { cwd: ROOT, maxBuffer: 4 << 20 });

    return reply(stdout.split('\n').filter(Boolean).map((line) => {
      const [sha, message, date, name] = line.split('\x1f');
      return { sha, commit: { message, author: { date, name } } };
    }));
  }

  if (url.includes('/contents/')) {
    const parsed = new URL(url);
    const rel = decodeURIComponent(parsed.pathname.split('/contents/')[1]);
    const ref = parsed.searchParams.get('ref');

    const text = ref && ref !== 'main'
      ? (await run('git', ['show', `${ref}:${rel}`], { cwd: ROOT, maxBuffer: 16 << 20 })).stdout
      : await readFile(path.join(ROOT, rel), 'utf8');

    return reply({ sha: 'blob', content: Buffer.from(text, 'utf8').toString('base64') });
  }
  if (url.endsWith('/git/trees') || url.endsWith('/git/blobs') || url.endsWith('/git/commits')) {
    console.log(`  would write: ${init.method} ${url.split('/').pop()}`);
    return reply({ sha: 'devnew' });
  }
  if (url.includes('/git/refs/')) return reply({});
  if (url.includes('/pulls')) {
    return init.method === 'POST'
      ? reply({ number: 1, html_url: 'https://example.invalid/pull/1' })
      : reply([]);
  }
  throw new Error(`unexpected: ${url}`);
};

const ui = {
  async fetch(request) {
    const name = new URL(request.url).pathname;
    const file = path.join(UI, name === '/' ? 'index.html' : name.slice(1));
    if (!file.startsWith(UI)) return new Response('no', { status: 403 });
    try {
      await stat(file);
      return new Response(await readFile(file), {
        headers: { 'content-type': TYPES[path.extname(file)] ?? 'text/plain', 'cache-control': 'no-store' }
      });
    } catch {
      return new Response('not found', { status: 404 });
    }
  }
};

const worker = createWorker({ fetch: fakeGitHub });
const env = {
  SESSION_SECRET: SECRET, ADMIN_GITHUB_IDS: String(ADMIN_ID),
  GITHUB_OWNER: 'polynomeer', GITHUB_REPO: 'polynomeer.github.io',
  DEFAULT_BRANCH: 'main', SITE_URL: 'https://polynomeer.github.io', ASSETS: ui
};

// Signed in as the administrator, because OAuth is the one part that cannot
// be faked usefully: it needs a real app and a real GitHub round trip.
const devSession = await signSession(
  { uid: ADMIN_ID, login: 'polynomeer (dev)', ght: 'dev-token', exp: Date.now() + 86_400_000 },
  SECRET
);

createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);

  const request = new Request(`http://127.0.0.1:${PORT}${req.url}`, {
    method: req.method,
    headers: { ...req.headers, cookie: `${SESSION_COOKIE}=${devSession}` },
    ...(chunks.length ? { body: Buffer.concat(chunks) } : {})
  });

  const response = await worker.fetch(request, env);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(PORT, '127.0.0.1', () => {
  console.log(`http://127.0.0.1:${PORT}  (signed in as the admin, writes are logged not committed)`);
});
