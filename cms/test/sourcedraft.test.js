import test from 'node:test';
import assert from 'node:assert/strict';

import { draftSource, metaTag } from '../src/sourcedraft.js';

function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, headers: init.headers ?? {} });
    const hit = Object.entries(routes).find(([prefix]) => url.startsWith(prefix));
    if (!hit) return { ok: false, status: 404, text: async () => '' };
    const [, body] = hit;
    if (body instanceof Error) throw body;
    return { ok: true, status: 200, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) };
  };
  fn.calls = calls;
  return fn;
}

test('an RFC gets its number and the datatracker title', async () => {
  const fetch = fakeFetch({
    'https://datatracker.ietf.org/doc/html/rfc9110': '<title>RFC 9110 - HTTP Semantics</title>'
  });
  const { entry } = await draftSource('https://www.rfc-editor.org/rfc/rfc9110.html', { fetch });
  assert.deepEqual(entry, {
    type: 'rfc', title: 'RFC 9110 HTTP Semantics', publisher: 'IETF', number: '9110',
    url: 'https://datatracker.ietf.org/doc/html/rfc9110'
  });
});

test('a GitHub branch is pinned to its commit, and the token only goes to GitHub', async () => {
  const sha = 'a'.repeat(40);
  const fetch = fakeFetch({ 'https://api.github.com/repos/netty/netty/commits/4.1': { sha } });
  const { entry, warnings } = await draftSource(
    'https://github.com/netty/netty/blob/4.1/transport/src/NioEventLoop.java#L100-L120', { fetch, token: 'T' });
  assert.equal(entry.commit, sha);
  assert.equal(entry.lines, '100-120');
  assert.equal(entry.path, 'transport/src/NioEventLoop.java');
  assert.match(warnings[0], /고정/);
  assert.equal(fetch.calls[0].headers.authorization, 'Bearer T');

  const pinned = await draftSource(`https://github.com/o/r/blob/${sha}/a.c`, { fetch: fakeFetch({}), token: 'T' });
  assert.equal(pinned.entry.commit, sha);
  assert.equal(pinned.entry.lines, undefined);
});

test('a branch that cannot be resolved is kept and flagged', async () => {
  const { entry, warnings } = await draftSource('https://github.com/o/r/blob/main/a.c#L3', { fetch: fakeFetch({}) });
  assert.equal(entry.commit, 'main');
  assert.equal(entry.lines, '3');
  assert.ok(warnings.some((w) => w.includes('어긋납니다')));
});

test('a DOI reads CSL JSON, subtitle and all', async () => {
  const fetch = fakeFetch({
    'https://doi.org/10.1145/1': {
      title: 'Optuna', subtitle: ['A Next-generation Framework'],
      author: [{ given: 'A', family: 'One' }, { given: 'B', family: 'Two' }, { given: 'C', family: 'Three' }, { family: 'Four' }],
      'container-title': 'KDD', issued: { 'date-parts': [[2019, 7]] }
    }
  });
  const { entry } = await draftSource('10.1145/1', { fetch });
  assert.equal(entry.title, 'Optuna: A Next-generation Framework');
  assert.equal(entry.author, 'A One et al.');
  assert.equal(entry.publisher, 'KDD');
  assert.equal(entry.published, '2019-07-01');
});

test('a YouTube timestamp becomes a locator, not part of the source', async () => {
  const fetch = fakeFetch({ 'https://www.youtube.com/oembed': { title: 'Talk', author_name: 'Chan' } });
  const { entry } = await draftSource('https://youtu.be/abc?t=90', { fetch });
  assert.deepEqual(entry, {
    type: 'video', title: 'Talk', author: 'Chan', publisher: 'YouTube',
    url: 'https://www.youtube.com/watch?v=abc', at: '90'
  });
});

test('a page uses its meta tags; docs drop the build date', async () => {
  const html = '<meta property="og:title" content="Locks &amp; Leases">' +
    '<meta content="Jane Roe" name="author"><meta property="og:site_name" content="Blog">' +
    '<meta property="article:published_time" content="2024-03-05T10:00:00Z"><meta name="date" content="2026-01-01">';
  const { entry } = await draftSource('https://blog.example/post', { fetch: fakeFetch({ 'https://blog.example/': html }) });
  assert.deepEqual(entry, {
    type: 'article', title: 'Locks & Leases', url: 'https://blog.example/post',
    author: 'Jane Roe', publisher: 'Blog', published: '2024-03-05'
  });

  const docs = await draftSource('https://www.postgresql.org/docs/current/x.html',
    { fetch: fakeFetch({ 'https://www.postgresql.org/': html }) });
  assert.equal(docs.entry.type, 'doc');
  assert.equal(docs.entry.published, undefined);
});

test('a failed fetch still returns a draft to fill in by hand', async () => {
  const { entry, warnings } = await draftSource('https://down.example/a',
    { fetch: fakeFetch({ 'https://down.example/': new Error('boom') }) });
  assert.equal(entry.title, 'https://down.example/a');
  assert.match(warnings[0], /boom/);
});

test('only http(s) URLs are drafted', async () => {
  for (const bad of ['not a url', 'file:///etc/passwd', 'javascript:alert(1)']) {
    await assert.rejects(draftSource(bad, { fetch: fakeFetch({}) }), { code: 'bad_url' });
  }
});

test('meta tags are found in either attribute order', () => {
  assert.equal(metaTag('<meta content="x" property="og:title">', 'og:title'), 'x');
  assert.equal(metaTag('<meta name="author" content="y">', 'nope', 'author'), 'y');
});
