// Session, OAuth state and the admin allowlist.
//
// No dependencies: everything here is Web Crypto, which both Cloudflare
// Workers and Node provide, so the same code runs in the Worker and under
// `node --test`. The parts that must not be wrong - signature verification,
// expiry, the allowlist - are pure functions and are tested directly.
//
// See docs/features/cms-content-contract.md for why there is no server-side
// session store: there is one administrator and the cookie carries its own
// signature, so there is nothing to keep.

const encoder = new TextEncoder();

export const SESSION_COOKIE = '__Host-cms_session';
export const STATE_COOKIE = '__Host-cms_oauth_state';

// __Host- cookies are origin-locked by the browser: Secure, Path=/, and no
// Domain attribute. A subdomain cannot set or overwrite them.
const BASE_COOKIE_FLAGS = 'Path=/; Secure; HttpOnly; SameSite=Lax';

export function base64urlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64urlDecode(text) {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmacKey(secret) {
  if (typeof secret !== 'string' || secret.length < 32) {
    // A short secret is the kind of mistake that still works in testing and
    // fails silently in production, so it is refused outright.
    throw new Error('session secret must be at least 32 characters');
  }

  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/** Constant-time comparison. Returns false for differing lengths. */
export function timingSafeEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/** `<base64url payload>.<base64url hmac>` */
export async function signSession(payload, secret) {
  const key = await hmacKey(secret);
  const body = base64urlEncode(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  return `${body}.${base64urlEncode(new Uint8Array(signature))}`;
}

/**
 * Returns the payload, or null for anything wrong: wrong shape, bad
 * signature, expired. Never throws on malformed input - a visitor controls
 * this string.
 */
export async function verifySession(token, secret, now = Date.now()) {
  if (typeof token !== 'string') {
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const [body, signature] = parts;

  let expected;
  let received;
  try {
    const key = await hmacKey(secret);
    expected = new Uint8Array(
      await crypto.subtle.sign('HMAC', key, encoder.encode(body))
    );
    received = base64urlDecode(signature);
  } catch {
    return null;
  }

  if (!timingSafeEqual(expected, received)) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64urlDecode(body)));
  } catch {
    return null;
  }

  if (!payload || typeof payload !== 'object') {
    return null;
  }

  if (typeof payload.exp !== 'number' || payload.exp <= now) {
    return null;
  }

  return payload;
}

/**
 * The allowlist is numeric GitHub user ids, never logins - a login can be
 * renamed and then claimed by someone else, an id cannot.
 */
export function parseAllowlist(raw) {
  return String(raw ?? '')
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((entry) => Number(entry))
    .filter((id) => Number.isInteger(id) && id > 0);
}

export function isAllowed(userId, allowlist) {
  return Number.isInteger(userId) && userId > 0 && allowlist.includes(userId);
}

export function randomToken(byteLength = 32) {
  return base64urlEncode(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export function serializeCookie(name, value, { maxAge }) {
  return `${name}=${value}; ${BASE_COOKIE_FLAGS}; Max-Age=${maxAge}`;
}

export function clearCookie(name) {
  return `${name}=; ${BASE_COOKIE_FLAGS}; Max-Age=0`;
}

/** Reads one cookie out of a request's Cookie header. */
export function readCookie(header, name) {
  if (!header) {
    return null;
  }

  for (const pair of header.split(';')) {
    const index = pair.indexOf('=');
    if (index === -1) {
      continue;
    }
    if (pair.slice(0, index).trim() === name) {
      return pair.slice(index + 1).trim();
    }
  }
  return null;
}
