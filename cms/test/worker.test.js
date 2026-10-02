import test from 'node:test';
import assert from 'node:assert/strict';

import { SESSION_COOKIE, STATE_COOKIE, signSession } from '../src/auth.js';
import { changeIdTrailer } from '../src/github.js';
import { createWorker } from '../src/worker.js';

const ADMIN_ID = 62940574;
const SECRET = 's'.repeat(48);

const env = {
  SESSION_SECRET: SECRET,
  ADMIN_GITHUB_IDS: String(ADMIN_ID),
  GITHUB_CLIENT_ID: 'client-id',
  GITHUB_CLIENT_SECRET: 'client-secret',
  GITHUB_OWNER: 'polynomeer',
  GITHUB_REPO: 'polynomeer.github.io',
  DEFAULT_BRANCH: 'main'
};

async function sessionCookie(overrides = {}) {
  const token = await signSession(
    { uid: ADMIN_ID, login: 'polynomeer', ght: 'ghs_TOKEN', exp: Date.now() + 60_000, ...overrides },
    SECRET
  );
  return `${SESSION_COOKIE}=${token}`;
}

function request(path, { method = 'GET', cookie, body } = {}) {
  return new Request(`https://cms.example.workers.dev${path}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

/** Minimal GitHub stand-in for the commit path. */
function githubFake({ headMessage = 'previous', patch = { status: 200 }, pulls = [] } = {}) {
  const calls = [];
  const reply = (body, status = 200) => ({
    ok: status < 400,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body
  });

  return {
    calls,
    fetchImpl: async (url, init = {}) => {
      calls.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : null });

      if (url.includes('/git/ref/heads/')) return reply({ object: { sha: 'head1' } });
      if (url.includes('/git/commits/')) return reply({ sha: 'head1', message: headMessage, tree: { sha: 'tree1' } });
      if (url.includes('/git/trees/') && url.includes('recursive=1')) {
        return reply({ tree: [
          { type: 'blob', path: '_posts/notes/a.md', sha: 'blob-a' },
          { type: 'blob', path: '_posts/notes/image.png', sha: 'blob-i' },
          { type: 'tree', path: '_posts/notes', sha: 'tree-n' }
        ] });
      }
      if (url.endsWith('/git/blobs')) return reply({ sha: 'blob1' });
      if (url.endsWith('/git/trees')) return reply({ sha: 'tree2' });
      if (url.endsWith('/git/commits')) return reply({ sha: 'commit2' });
      if (url.includes('/git/refs/heads/')) return reply({}, patch.status);
      if (url.includes('/pulls')) {
        return init.method === 'POST'
          ? reply({ number: 11, html_url: 'https://example.invalid/11' })
          : reply(pulls);
      }
      throw new Error(`unexpected github call: ${url}`);
    }
  };
}

test('every api route refuses an anonymous caller', async () => {
  const worker = createWorker({ fetch: async () => { throw new Error('must not call out'); } });

  for (const path of ['/api/me', '/api/changes']) {
    const response = await worker.fetch(request(path), env);
    assert.equal(response.status, 401, path);
  }
});

test('a session signed with the wrong secret is not a session', async () => {
  const worker = createWorker({ fetch: async () => { throw new Error('must not call out'); } });
  const forged = await signSession({ uid: ADMIN_ID, exp: Date.now() + 60_000 }, 'x'.repeat(48));
  const response = await worker.fetch(
    request('/api/me', { cookie: `${SESSION_COOKIE}=${forged}` }), env
  );
  assert.equal(response.status, 401);
});

test('a valid session for someone off the allowlist is refused', async () => {
  const worker = createWorker({ fetch: async () => { throw new Error('must not call out'); } });
  const response = await worker.fetch(
    request('/api/me', { cookie: await sessionCookie({ uid: 999 }) }), env
  );
  assert.equal(response.status, 401,
    'the allowlist is rechecked per request, so removing an id ends the session');
});

test('login sends state to GitHub and keeps a copy in a cookie', async () => {
  const worker = createWorker({ fetch: async () => { throw new Error('must not call out'); } });
  const response = await worker.fetch(request('/auth/login'), env);

  assert.equal(response.status, 302);
  const location = new URL(response.headers.get('location'));
  const state = location.searchParams.get('state');

  assert.equal(location.origin + location.pathname, 'https://github.com/login/oauth/authorize');
  assert.ok(state && state.length >= 20);
  assert.ok(response.headers.get('set-cookie').includes(`${STATE_COOKIE}=${state}`));
  assert.ok(!location.searchParams.has('client_secret'), 'the secret never goes to the browser');
});

test('a callback whose state does not match the cookie is rejected', async () => {
  const worker = createWorker({ fetch: async () => { throw new Error('must not exchange'); } });

  const mismatched = await worker.fetch(
    request('/auth/callback?code=c&state=theirs', { cookie: `${STATE_COOKIE}=ours` }), env
  );
  assert.equal(mismatched.status, 400);

  const missing = await worker.fetch(request('/auth/callback?code=c&state=theirs'), env);
  assert.equal(missing.status, 400);
});

test('a non-administrator cannot exchange a code for a session', async () => {
  const worker = createWorker({
    fetch: async (url) => ({
      ok: true,
      status: 200,
      json: async () => url.includes('access_token')
        ? { access_token: 'ghs_x' }
        : { id: 999, login: 'someone-else' }
    })
  });

  const response = await worker.fetch(
    request('/auth/callback?code=c&state=s', { cookie: `${STATE_COOKIE}=s` }), env
  );

  assert.equal(response.status, 403);
  assert.equal(response.headers.get('set-cookie'), null, 'no session is issued');
});

test('a successful callback sets the session and clears the state cookie', async () => {
  const worker = createWorker({
    fetch: async (url) => ({
      ok: true,
      status: 200,
      json: async () => url.includes('access_token')
        ? { access_token: 'ghs_x' }
        : { id: ADMIN_ID, login: 'polynomeer' }
    })
  });

  const response = await worker.fetch(
    request('/auth/callback?code=c&state=s', { cookie: `${STATE_COOKIE}=s` }), env
  );

  assert.equal(response.status, 302);
  const cookies = response.headers.getSetCookie();
  assert.ok(cookies.some((c) => c.startsWith(`${SESSION_COOKIE}=`)));
  assert.ok(cookies.some((c) => c.startsWith(`${STATE_COOKIE}=`) && c.includes('Max-Age=0')));
});

test('the github token never appears in a response body', async () => {
  const worker = createWorker({
    fetch: async (url) => ({
      ok: true,
      status: 200,
      json: async () => url.includes('access_token')
        ? { access_token: 'ghs_SUPERSECRET' }
        : { id: ADMIN_ID, login: 'polynomeer' }
    })
  });

  const callback = await worker.fetch(
    request('/auth/callback?code=c&state=s', { cookie: `${STATE_COOKIE}=s` }), env
  );
  assert.ok(!(await callback.text()).includes('ghs_SUPERSECRET'));

  const me = await createWorker({ fetch: async () => { throw new Error('no'); } })
    .fetch(request('/api/me', { cookie: await sessionCookie() }), env);
  const body = await me.text();
  assert.ok(!body.includes('ghs_TOKEN'), 'the session carries the token but /api/me must not echo it');
  assert.deepEqual(JSON.parse(body), { uid: ADMIN_ID, login: 'polynomeer' });
});

test('a change outside _posts and assets/img is refused before any call', async () => {
  const github = githubFake();
  const worker = createWorker({ fetch: github.fetchImpl });

  for (const path of ['.github/workflows/jekyll.yml', '_config.yml', '_posts/../_config.yml', '/etc/passwd']) {
    const response = await worker.fetch(request('/api/changes', {
      method: 'POST',
      cookie: await sessionCookie(),
      body: { message: 'm', files: [{ path, content: 'x' }] }
    }), env);

    assert.equal(response.status, 422, path);
    assert.equal((await response.json()).error.code, 'path_not_allowed');
  }

  assert.equal(github.calls.length, 0, 'nothing reached GitHub');
});

test('a post and its image are committed together', async () => {
  const github = githubFake();
  const worker = createWorker({ fetch: github.fetchImpl });

  const response = await worker.fetch(request('/api/changes', {
    method: 'POST',
    cookie: await sessionCookie(),
    body: {
      message: 'post: add one',
      files: [
        { path: '_posts/notes/2026-10-02-x.md', content: '---\ntitle: x\n---\n' },
        { path: 'assets/img/posts/x.png', content: 'iVBORw0KGgo=', encoding: 'base64' }
      ]
    }
  }), env);

  assert.equal(response.status, 200);
  assert.equal((await response.json()).commitSha, 'commit2');
  assert.equal(github.calls.filter((c) => c.url.endsWith('/git/commits') && c.method === 'POST').length, 1);
});

test('a branch that moved comes back as 409, not a silent overwrite', async () => {
  const github = githubFake({ patch: { status: 422 } });
  const worker = createWorker({ fetch: github.fetchImpl });

  const response = await worker.fetch(request('/api/changes', {
    method: 'POST',
    cookie: await sessionCookie(),
    body: { message: 'm', files: [{ path: '_posts/a.md', content: 'a' }] }
  }), env);

  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, 'branch_moved');
});

test('replaying the same change id does not write twice', async () => {
  const github = githubFake({ headMessage: `post: add one\n\n${changeIdTrailer('abc')}\n` });
  const worker = createWorker({ fetch: github.fetchImpl });

  const response = await worker.fetch(request('/api/changes', {
    method: 'POST',
    cookie: await sessionCookie(),
    body: { message: 'post: add one', changeId: 'abc', files: [{ path: '_posts/a.md', content: 'a' }] }
  }), env);

  assert.equal((await response.json()).alreadyApplied, true);
  assert.equal(github.calls.filter((c) => c.method === 'POST').length, 0);
});

test('an existing pull request is reused on retry', async () => {
  const github = githubFake({ pulls: [{ number: 7, html_url: 'https://example.invalid/7' }] });
  const worker = createWorker({ fetch: github.fetchImpl });

  const response = await worker.fetch(request('/api/changes', {
    method: 'POST',
    cookie: await sessionCookie(),
    body: {
      message: 'post: add one',
      branch: 'cms/post-x',
      pullRequest: { title: 'Add one' },
      files: [{ path: '_posts/a.md', content: 'a' }]
    }
  }), env);

  const body = await response.json();
  assert.equal(body.pullRequest.number, 7);
  assert.equal(body.pullRequestCreated, false);
});

test('api responses are not cacheable', async () => {
  const worker = createWorker({ fetch: async () => { throw new Error('no'); } });
  const response = await worker.fetch(request('/api/me', { cookie: await sessionCookie() }), env);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('the read routes need a session too', async () => {
  const worker = createWorker({ fetch: async () => { throw new Error('must not call out'); } });
  for (const path of ['/api/posts', '/api/posts/_posts%2Fnotes%2Fa.md']) {
    assert.equal((await worker.fetch(request(path), env)).status, 401, path);
  }
});

test('reading is confined to _posts', async () => {
  const github = githubFake();
  const worker = createWorker({ fetch: github.fetchImpl });

  for (const path of ['_config.yml', '_posts/../_config.yml', '.github/workflows/jekyll.yml']) {
    const response = await worker.fetch(
      request(`/api/posts/${encodeURIComponent(path)}`, { cookie: await sessionCookie() }), env
    );
    assert.equal(response.status, 422, path);
  }
  assert.equal(github.calls.length, 0);
});

test('the post list comes from one recursive tree read', async () => {
  const github = githubFake();
  const worker = createWorker({ fetch: github.fetchImpl });
  const response = await worker.fetch(request('/api/posts', { cookie: await sessionCookie() }), env);

  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).posts, [{ path: '_posts/notes/a.md', sha: 'blob-a' }]);
  assert.equal(github.calls.filter((c) => c.url.includes('recursive=1')).length, 1);
});

test('the editor shell is served without a session, api and auth are not', async () => {
  const served = [];
  const assets = { fetch: async (req) => { served.push(new URL(req.url).pathname); return new Response('ui'); } };
  const worker = createWorker({ fetch: async () => { throw new Error('must not call out'); } });

  assert.equal((await worker.fetch(request('/'), { ...env, ASSETS: assets })).status, 200);
  assert.equal((await worker.fetch(request('/ui/app.js'), { ...env, ASSETS: assets })).status, 200);
  assert.deepEqual(served, ['/', '/ui/app.js']);

  // The shell is a shell; the data behind it still needs a session.
  assert.equal((await worker.fetch(request('/api/posts'), { ...env, ASSETS: assets })).status, 401);
  assert.equal(served.length, 2, 'assets never answer an api path');
});

