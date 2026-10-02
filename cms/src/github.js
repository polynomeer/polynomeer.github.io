// The write path: one commit per change, compare-and-swap on the ref, and
// retries that do not duplicate anything.
//
// `fetch` is injected so the whole thing runs under node --test against a
// fake. Nothing here imports anything.
//
// Three failure modes from the design's blocking criteria drive the shape:
//
//   - adding a file must not drop the rest of the tree. The Git Data API
//     builds a tree from scratch unless you pass `base_tree`, so a forgotten
//     base_tree deletes the entire repository in one commit. It is always
//     sent, and there is a test that fails if it ever stops being sent.
//   - a concurrent edit must not be overwritten. The ref update is a
//     compare-and-swap: force is false, so GitHub rejects it if the branch
//     moved under us, and that rejection surfaces as ConflictError.
//   - a retry after a lost response must not commit twice. Each change
//     carries an idempotency key in a commit trailer; before writing we look
//     at the branch head and stop if it already carries the same key.

export const BLOB_MODE = '100644';
export const IDEMPOTENCY_TRAILER = 'X-CMS-Change-Id';

export class GitHubError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
    this.body = body;
  }
}

/** The branch moved while we were building the commit. */
export class ConflictError extends GitHubError {
  constructor(message, details) {
    super(message, details);
    this.name = 'ConflictError';
  }
}

export function changeIdTrailer(changeId) {
  return `${IDEMPOTENCY_TRAILER}: ${changeId}`;
}

export function commitMessageWithChangeId(message, changeId) {
  return changeId ? `${message.trimEnd()}\n\n${changeIdTrailer(changeId)}\n` : message;
}

export function createGitHubClient({
  fetch: fetchImpl,
  token,
  owner,
  repo,
  userAgent = 'polynomeer-cms'
}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('a fetch implementation is required');
  }

  const base = `https://api.github.com/repos/${owner}/${repo}`;

  async function request(method, path, body) {
    const response = await fetchImpl(`${base}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': userAgent,
        ...(body ? { 'content-type': 'application/json' } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });

    const text = await response.text();
    const parsed = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const message = `${method} ${path} failed with ${response.status}`;
      // 409 is GitHub's "fast forward" refusal, 422 covers a stale ref on a
      // non-force update. Both mean somebody else moved the branch.
      if (response.status === 409 || response.status === 422) {
        throw new ConflictError(message, { status: response.status, body: parsed });
      }
      throw new GitHubError(message, { status: response.status, body: parsed });
    }

    return parsed;
  }

  const api = {
    request,

    getRef: (branch) => request('GET', `/git/ref/heads/${encodeURIComponent(branch)}`),
    getCommit: (sha) => request('GET', `/git/commits/${sha}`),

    createBlob: (content, encoding) =>
      request('POST', '/git/blobs', { content, encoding }),

    createTree: (baseTree, tree) =>
      // base_tree is the whole point: without it the new tree replaces the
      // repository instead of layering on it.
      request('POST', '/git/trees', { base_tree: baseTree, tree }),

    createCommit: (message, tree, parents) =>
      request('POST', '/git/commits', { message, tree, parents }),

    updateRef: (branch, sha) =>
      request('PATCH', `/git/refs/heads/${encodeURIComponent(branch)}`, { sha, force: false }),

    createRef: (branch, sha) =>
      request('POST', '/git/refs', { ref: `refs/heads/${branch}`, sha }),

    /**
     * One commit carrying every file in the change - markdown and images
     * together, so the site is never built from a post whose image has not
     * landed yet.
     *
     * files: [{ path, content, encoding? }] or [{ path, delete: true }]
     *   encoding 'utf-8' (default) sends the text inline; 'base64' uploads a
     *   blob first, which is what images need.
     *
     * Returns { commitSha, alreadyApplied }.
     */
    async commitFiles({ branch, message, files, changeId }) {
      if (!Array.isArray(files) || files.length === 0) {
        throw new Error('commitFiles needs at least one file');
      }

      const ref = await api.getRef(branch);
      const headSha = ref.object.sha;
      const head = await api.getCommit(headSha);

      if (changeId && typeof head.message === 'string' &&
          head.message.includes(changeIdTrailer(changeId))) {
        // A previous attempt already landed; its response was just lost.
        return { commitSha: headSha, alreadyApplied: true };
      }

      const tree = [];
      for (const file of files) {
        if (file.delete) {
          tree.push({ path: file.path, mode: BLOB_MODE, type: 'blob', sha: null });
          continue;
        }

        if (file.encoding === 'base64') {
          const blob = await api.createBlob(file.content, 'base64');
          tree.push({ path: file.path, mode: BLOB_MODE, type: 'blob', sha: blob.sha });
          continue;
        }

        tree.push({ path: file.path, mode: BLOB_MODE, type: 'blob', content: file.content });
      }

      const created = await api.createTree(head.tree.sha, tree);
      const commit = await api.createCommit(
        commitMessageWithChangeId(message, changeId),
        created.sha,
        [headSha]
      );

      await api.updateRef(branch, commit.sha);
      return { commitSha: commit.sha, alreadyApplied: false };
    },

    /**
     * Returns the open pull request for `head` if there already is one, so a
     * retry reuses it instead of opening a second.
     */
    async findOpenPullRequest(head) {
      const query = `?state=open&head=${encodeURIComponent(`${owner}:${head}`)}`;
      const found = await request('GET', `/pulls${query}`);
      return Array.isArray(found) && found.length > 0 ? found[0] : null;
    },

    async openPullRequest({ head, base: baseBranch, title, body }) {
      const existing = await api.findOpenPullRequest(head);
      if (existing) {
        return { pullRequest: existing, created: false };
      }

      const pullRequest = await request('POST', '/pulls', {
        title,
        body,
        head,
        base: baseBranch
      });
      return { pullRequest, created: true };
    }
  };

  return api;
}
