// The Worker: OAuth in, authorised writes out.
//
// Routes are deliberately few. Everything that is not /auth/* requires a
// valid session for the one administrator; there is no public surface here
// beyond the login redirect itself.
//
//   GET  /auth/login     -> redirect to GitHub, state in a short-lived cookie
//   GET  /auth/callback  -> exchange the code, check the allowlist, set session
//   POST /auth/logout    -> clear the session
//   GET  /api/me         -> who is signed in
//   POST /api/changes    -> commit a change, optionally open a pull request
//
// The GitHub token never leaves this file: it is exchanged server-side and
// used server-side. Nothing in a response body or a cookie carries it.

import {
  SESSION_COOKIE,
  STATE_COOKIE,
  clearCookie,
  isAllowed,
  parseAllowlist,
  randomToken,
  readCookie,
  serializeCookie,
  signSession,
  verifySession
} from './auth.js';
import {
  ConflictError, DICTIONARY_DIRS, GitHubError, createGitHubClient
} from './github.js';

const SESSION_TTL_SECONDS = 60 * 60 * 8;
const STATE_TTL_SECONDS = 10 * 60;

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // An admin API has nothing to cache and a stale draft would be worse
      // than a slow one.
      'cache-control': 'no-store',
      ...headers
    }
  });
}

const READABLE = ['_posts/', ...DICTIONARY_DIRS];
const WRITABLE = [...READABLE, 'assets/img/'];

function within(dirs, path) {
  return typeof path === 'string' &&
    !path.includes('..') &&
    !path.startsWith('/') &&
    dirs.some((dir) => path.startsWith(dir));
}

/** Content the editor may read: posts and the dictionaries, nothing else. */
function readable(path) {
  return within(READABLE, path);
}

/**
 * Content the editor may write. Everything else - _config.yml, a workflow, a
 * plugin, a layout, its own source - is not an editing operation, whatever
 * the token is allowed to do.
 */
function writable(path) {
  return within(WRITABLE, path);
}

function problem(status, code, message, extra = {}) {
  return json({ error: { code, message, ...extra } }, status);
}

export async function currentSession(request, env) {
  const token = readCookie(request.headers.get('cookie'), SESSION_COOKIE);
  const payload = await verifySession(token, env.SESSION_SECRET);
  if (!payload) {
    return null;
  }

  // The allowlist is re-checked on every request, so revoking access does not
  // wait for the session to expire.
  return isAllowed(payload.uid, parseAllowlist(env.ADMIN_GITHUB_IDS)) ? payload : null;
}

function loginRedirect(env, url) {
  const state = randomToken();
  const authorize = new URL('https://github.com/login/oauth/authorize');
  authorize.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  authorize.searchParams.set('redirect_uri', new URL('/auth/callback', url.origin).toString());
  // `repo` is the narrowest scope that can commit to a repository's contents.
  authorize.searchParams.set('scope', 'repo');
  authorize.searchParams.set('state', state);

  return new Response(null, {
    status: 302,
    headers: {
      location: authorize.toString(),
      'set-cookie': serializeCookie(STATE_COOKIE, state, { maxAge: STATE_TTL_SECONDS })
    }
  });
}

async function handleCallback(request, env, url, fetchImpl) {
  const expected = readCookie(request.headers.get('cookie'), STATE_COOKIE);
  const received = url.searchParams.get('state');

  // Without this check an attacker can hand the administrator a callback URL
  // and have their own GitHub account signed in on this browser.
  if (!expected || !received || expected !== received) {
    return problem(400, 'oauth_state_mismatch', 'Sign-in could not be verified. Start again.');
  }

  const code = url.searchParams.get('code');
  if (!code) {
    return problem(400, 'oauth_no_code', 'GitHub did not return an authorization code.');
  }

  const tokenResponse = await fetchImpl('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: new URL('/auth/callback', url.origin).toString()
    })
  });

  const tokenBody = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenBody.access_token) {
    return problem(502, 'oauth_exchange_failed', 'GitHub refused the authorization code.');
  }

  const userResponse = await fetchImpl('https://api.github.com/user', {
    headers: {
      authorization: `Bearer ${tokenBody.access_token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'polynomeer-cms'
    }
  });
  const user = await userResponse.json();

  if (!isAllowed(user.id, parseAllowlist(env.ADMIN_GITHUB_IDS))) {
    // Deliberately the same shape for "not on the list" as for a bad token:
    // this endpoint should not confirm who is an administrator.
    return problem(403, 'not_an_administrator', 'This account cannot sign in here.');
  }

  const session = await signSession(
    {
      uid: user.id,
      login: user.login,
      // The GitHub token rides inside the signed, HttpOnly cookie rather than
      // a server-side store. There is one administrator and no revocation
      // list to keep; the cookie is unreadable by script and dies in 8 hours.
      ght: tokenBody.access_token,
      exp: Date.now() + SESSION_TTL_SECONDS * 1000
    },
    env.SESSION_SECRET
  );

  const headers = new Headers({ location: '/' });
  headers.append('set-cookie', serializeCookie(SESSION_COOKIE, session, { maxAge: SESSION_TTL_SECONDS }));
  headers.append('set-cookie', clearCookie(STATE_COOKIE));
  return new Response(null, { status: 302, headers });
}

async function handleChange(request, env, session, fetchImpl) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return problem(400, 'invalid_json', 'The request body is not JSON.');
  }

  const { message, files, changeId, branch, pullRequest } = payload ?? {};

  if (typeof message !== 'string' || !message.trim()) {
    return problem(422, 'message_required', 'A commit message is required.');
  }
  if (!Array.isArray(files) || files.length === 0) {
    return problem(422, 'files_required', 'A change needs at least one file.');
  }

  for (const file of files) {
    if (!writable(file?.path)) {
      return problem(422, 'path_not_allowed', `Cannot write ${String(file?.path)}.`,
        { path: file?.path });
    }
  }

  const client = createGitHubClient({
    fetch: fetchImpl,
    token: session.ght,
    owner: env.GITHUB_OWNER,
    repo: env.GITHUB_REPO
  });

  const base = env.DEFAULT_BRANCH || 'main';
  const target = branch || base;

  try {
    const result = await client.commitFiles({
      branch: target, message, files, changeId, createFrom: base
    });

    if (!pullRequest) {
      return json({ branch: target, ...result });
    }

    const opened = await client.openPullRequest({
      head: target,
      base,
      title: pullRequest.title || message.split('\n')[0],
      body: pullRequest.body || ''
    });

    return json({
      branch: target,
      ...result,
      pullRequest: { number: opened.pullRequest.number, url: opened.pullRequest.html_url },
      pullRequestCreated: opened.created
    });
  } catch (error) {
    if (error instanceof ConflictError) {
      return problem(409, 'branch_moved',
        'The branch changed while this was being saved. Reload and apply the change again.');
    }
    if (error instanceof GitHubError) {
      return problem(502, 'github_error', 'GitHub rejected the change.', { status: error.status });
    }
    throw error;
  }
}

export function createWorker({ fetch: fetchImpl = globalThis.fetch } = {}) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);

      // The editor is a handful of static files served by the platform from
      // src/ui, not imported into this module - so the browser runs exactly
      // the markdown.js and frontmatter.js the tests cover, with no build
      // step in between. It is an empty shell: it calls /api/me and shows
      // either the sign-in link or the editor. Every byte of content behind
      // it still needs a session.
      if (env.ASSETS && request.method === 'GET' &&
          !url.pathname.startsWith('/api/') && !url.pathname.startsWith('/auth/')) {
        return env.ASSETS.fetch(request);
      }

      if (url.pathname === '/auth/login') {
        return loginRedirect(env, url);
      }

      if (url.pathname === '/auth/callback') {
        return handleCallback(request, env, url, fetchImpl);
      }

      if (url.pathname === '/auth/logout' && request.method === 'POST') {
        return json({ ok: true }, 200, { 'set-cookie': clearCookie(SESSION_COOKIE) });
      }

      const session = await currentSession(request, env);
      if (!session) {
        return problem(401, 'sign_in_required', 'Sign in to continue.');
      }

      if (url.pathname === '/api/me') {
        return json({ uid: session.uid, login: session.login, siteUrl: env.SITE_URL ?? null });
      }

      const branch = env.DEFAULT_BRANCH || 'main';
      const client = () => createGitHubClient({
        fetch: fetchImpl, token: session.ght, owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO
      });

      if (url.pathname === '/api/posts' && request.method === 'GET') {
        try {
          const api = client();
          // The tree read is the authority on what exists; the index only adds
          // names to it. A post committed since the index was generated is
          // listed either way, under its filename.
          const [content, index] = await Promise.all([
            api.listContent(branch),
            api.readIndex(branch)
          ]);
          const titles = index.titles;
          const dictionary = index.dictionary;

          return json({
            branch,
            indexed: Object.keys(titles).length,
            posts: content.posts.map((entry) => ({ ...entry, ...(titles[entry.path] ?? {}) })),
            // So the editor can name an upload without overwriting one.
            images: content.images,
            dictionary: content.dictionary.map((entry) => ({
              path: entry.path, ...(dictionary[entry.path] ?? {})
            }))
          });
        } catch (error) {
          return problem(502, 'github_error', 'Could not list posts.', { status: error.status });
        }
      }

      if (url.pathname.startsWith('/api/revisions/') && request.method === 'GET') {
        const path = decodeURIComponent(url.pathname.slice('/api/revisions/'.length));
        if (!readable(path)) {
          return problem(422, 'path_not_allowed', `Cannot read ${path}.`, { path });
        }
        try {
          return json({ path, revisions: await client().listRevisions(path, branch) });
        } catch (error) {
          return problem(502, 'github_error', 'Could not list revisions.', { status: error.status });
        }
      }

      if (url.pathname.startsWith('/api/posts/') && request.method === 'GET') {
        const path = decodeURIComponent(url.pathname.slice('/api/posts/'.length));
        if (!readable(path)) {
          return problem(422, 'path_not_allowed', `Cannot read ${path}.`, { path });
        }

        // A past version is addressed by its commit, and only by a commit:
        // anything else would make this route a way to read an arbitrary ref.
        const ref = url.searchParams.get('ref');
        if (ref !== null && !/^[0-9a-f]{7,40}$/.test(ref)) {
          return problem(422, 'bad_ref', 'A revision is addressed by its commit sha.');
        }

        try {
          return json(await client().readFile(path, ref ?? branch));
        } catch (error) {
          return problem(error.status === 404 ? 404 : 502,
            error.status === 404 ? 'not_found' : 'github_error', 'Could not read the post.');
        }
      }

      if (url.pathname === '/api/changes' && request.method === 'POST') {
        return handleChange(request, env, session, fetchImpl);
      }

      return problem(404, 'not_found', 'No such endpoint.');
    }
  };
}

export default createWorker();
