import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ConflictError,
  IDEMPOTENCY_TRAILER,
  changeIdTrailer,
  createGitHubClient
} from '../src/github.js';

const OWNER = 'polynomeer';
const REPO = 'polynomeer.github.io';
// Distinctive on purpose: a one-letter token would accidentally "appear" in
// any path containing that letter and the leak test would pass for free.
const TOKEN = 'ghs_SECRET0000000000000000000000000000';

/** Records every call and replies from a routing table. */
function fakeGitHub(routes) {
  const calls = [];

  const fetchImpl = async (url, init) => {
    const path = url.replace(`https://api.github.com/repos/${OWNER}/${REPO}`, '');
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method: init.method, path, body, headers: init.headers });

    const key = `${init.method} ${path.split('?')[0]}`;
    const route = routes[key];
    if (!route) {
      throw new Error(`unexpected call: ${init.method} ${path}`);
    }

    const result = typeof route === 'function' ? route(body, path) : route;
    return {
      ok: (result.status ?? 200) < 400,
      status: result.status ?? 200,
      text: async () => JSON.stringify(result.body ?? {})
    };
  };

  return {
    calls,
    client: createGitHubClient({ fetch: fetchImpl, token: TOKEN, owner: OWNER, repo: REPO })
  };
}

const headAt = (sha, treeSha, message = 'previous') => ({
  'GET /git/ref/heads/main': { body: { object: { sha } } },
  [`GET /git/commits/${sha}`]: { body: { sha, message, tree: { sha: treeSha } } }
});

test('a commit always layers on the existing tree', async () => {
  const { calls, client } = fakeGitHub({
    ...headAt('head1', 'tree1'),
    'POST /git/trees': { body: { sha: 'tree2' } },
    'POST /git/commits': { body: { sha: 'commit2' } },
    'PATCH /git/refs/heads/main': { body: {} }
  });

  await client.commitFiles({
    branch: 'main',
    message: 'post: add one',
    files: [{ path: '_posts/notes/2026-10-02-x.md', content: '---\ntitle: x\n---\n' }]
  });

  const tree = calls.find((c) => c.path === '/git/trees');
  assert.equal(tree.body.base_tree, 'tree1',
    'base_tree must be the head tree, or the commit deletes the repository');
  assert.equal(tree.body.tree.length, 1);
  assert.equal(tree.body.tree[0].content, '---\ntitle: x\n---\n');
});

test('markdown and an image land in one commit, the image as a blob', async () => {
  const { calls, client } = fakeGitHub({
    ...headAt('head1', 'tree1'),
    'POST /git/blobs': { body: { sha: 'blob-img' } },
    'POST /git/trees': { body: { sha: 'tree2' } },
    'POST /git/commits': { body: { sha: 'commit2' } },
    'PATCH /git/refs/heads/main': { body: {} }
  });

  await client.commitFiles({
    branch: 'main',
    message: 'post: with image',
    files: [
      { path: '_posts/notes/2026-10-02-x.md', content: 'body' },
      { path: 'assets/img/posts/x.png', content: 'iVBORw0KGgo=', encoding: 'base64' }
    ]
  });

  const blobs = calls.filter((c) => c.path === '/git/blobs');
  assert.equal(blobs.length, 1, 'binary content needs a blob, not inline text');
  assert.equal(blobs[0].body.encoding, 'base64');

  const commits = calls.filter((c) => c.path === '/git/commits' && c.method === 'POST');
  assert.equal(commits.length, 1, 'one commit for the whole change');

  const tree = calls.find((c) => c.path === '/git/trees');
  assert.deepEqual(tree.body.tree.map((e) => e.path),
    ['_posts/notes/2026-10-02-x.md', 'assets/img/posts/x.png']);
  assert.equal(tree.body.tree[1].sha, 'blob-img');
  assert.equal(tree.body.tree[1].content, undefined);
});

test('a deletion is a null sha, not a missing entry', async () => {
  const { calls, client } = fakeGitHub({
    ...headAt('head1', 'tree1'),
    'POST /git/trees': { body: { sha: 'tree2' } },
    'POST /git/commits': { body: { sha: 'commit2' } },
    'PATCH /git/refs/heads/main': { body: {} }
  });

  await client.commitFiles({
    branch: 'main',
    message: 'post: remove one',
    files: [{ path: '_posts/notes/2026-10-02-x.md', delete: true }]
  });

  const entry = calls.find((c) => c.path === '/git/trees').body.tree[0];
  assert.equal(entry.sha, null);
});

test('the ref update is a compare-and-swap, never a force push', async () => {
  const { calls, client } = fakeGitHub({
    ...headAt('head1', 'tree1'),
    'POST /git/trees': { body: { sha: 'tree2' } },
    'POST /git/commits': { body: { sha: 'commit2' } },
    'PATCH /git/refs/heads/main': { body: {} }
  });

  await client.commitFiles({
    branch: 'main', message: 'm', files: [{ path: 'a.md', content: 'a' }]
  });

  const patch = calls.find((c) => c.method === 'PATCH');
  assert.equal(patch.body.force, false);
  assert.equal(patch.body.sha, 'commit2');
});

test('a branch that moved underneath raises ConflictError, not a silent overwrite', async () => {
  for (const status of [409, 422]) {
    const { client } = fakeGitHub({
      ...headAt('head1', 'tree1'),
      'POST /git/trees': { body: { sha: 'tree2' } },
      'POST /git/commits': { body: { sha: 'commit2' } },
      'PATCH /git/refs/heads/main': { status, body: { message: 'Update is not a fast forward' } }
    });

    await assert.rejects(
      () => client.commitFiles({ branch: 'main', message: 'm', files: [{ path: 'a.md', content: 'a' }] }),
      (error) => error instanceof ConflictError && error.status === status
    );
  }
});

test('a retry whose first attempt landed does not commit again', async () => {
  const changeId = 'change-abc';
  const { calls, client } = fakeGitHub({
    ...headAt('head9', 'tree9', `post: add one\n\n${changeIdTrailer(changeId)}\n`)
  });

  const result = await client.commitFiles({
    branch: 'main',
    message: 'post: add one',
    files: [{ path: 'a.md', content: 'a' }],
    changeId
  });

  assert.equal(result.alreadyApplied, true);
  assert.equal(result.commitSha, 'head9');
  assert.equal(calls.filter((c) => c.method === 'POST').length, 0, 'nothing was written');
});

test('the change id travels in the commit message so the retry can see it', async () => {
  const { calls, client } = fakeGitHub({
    ...headAt('head1', 'tree1'),
    'POST /git/trees': { body: { sha: 'tree2' } },
    'POST /git/commits': { body: { sha: 'commit2' } },
    'PATCH /git/refs/heads/main': { body: {} }
  });

  await client.commitFiles({
    branch: 'main', message: 'post: add one',
    files: [{ path: 'a.md', content: 'a' }], changeId: 'change-xyz'
  });

  const message = calls.find((c) => c.path === '/git/commits').body.message;
  assert.match(message, new RegExp(`^post: add one\\n\\n${IDEMPOTENCY_TRAILER}: change-xyz\\n$`));
});

test('an open pull request for the branch is reused instead of duplicated', async () => {
  const { calls, client } = fakeGitHub({
    'GET /pulls': { body: [{ number: 7, html_url: 'https://example.invalid/7' }] }
  });

  const { pullRequest, created } = await client.openPullRequest({
    head: 'cms/post-x', base: 'main', title: 't', body: 'b'
  });

  assert.equal(created, false);
  assert.equal(pullRequest.number, 7);
  assert.equal(calls.filter((c) => c.method === 'POST').length, 0);
});

test('with no open pull request one is created, scoped to owner:branch', async () => {
  const { calls, client } = fakeGitHub({
    'GET /pulls': { body: [] },
    'POST /pulls': { body: { number: 8 } }
  });

  const { created } = await client.openPullRequest({
    head: 'cms/post-x', base: 'main', title: 't', body: 'b'
  });

  assert.equal(created, true);
  const lookup = calls.find((c) => c.method === 'GET');
  assert.ok(lookup.path.includes(encodeURIComponent(`${OWNER}:cms/post-x`)),
    'the head filter must be owner-qualified or it matches other forks');
});

test('the token is sent as a bearer and never in the url', async () => {
  const { calls, client } = fakeGitHub({ 'GET /pulls': { body: [] } });
  await client.findOpenPullRequest('cms/x');
  assert.equal(calls[0].headers.authorization, `Bearer ${TOKEN}`);
  assert.ok(!calls[0].path.includes(TOKEN), 'no token in the path');
  assert.ok(!JSON.stringify(calls[0].body ?? {}).includes(TOKEN), 'no token in the body');
});
