import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SESSION_COOKIE,
  base64urlDecode,
  base64urlEncode,
  clearCookie,
  isAllowed,
  parseAllowlist,
  randomToken,
  readCookie,
  serializeCookie,
  signSession,
  timingSafeEqual,
  verifySession
} from '../src/auth.js';

const SECRET = 'a'.repeat(48);
const OTHER_SECRET = 'b'.repeat(48);
const future = () => Date.now() + 60_000;

test('base64url round trips and avoids + / =', () => {
  const bytes = new Uint8Array([251, 255, 0, 1, 62, 63]);
  const encoded = base64urlEncode(bytes);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(base64urlDecode(encoded), bytes);
});

test('a signed session verifies and returns its payload', async () => {
  const token = await signSession({ uid: 62940574, login: 'polynomeer', exp: future() }, SECRET);
  const payload = await verifySession(token, SECRET);
  assert.equal(payload.uid, 62940574);
  assert.equal(payload.login, 'polynomeer');
});

test('a tampered payload is rejected', async () => {
  const token = await signSession({ uid: 1, exp: future() }, SECRET);
  const [, signature] = token.split('.');
  const forged = base64urlEncode(new TextEncoder().encode(JSON.stringify({ uid: 62940574, exp: future() })));
  assert.equal(await verifySession(`${forged}.${signature}`, SECRET), null);
});

test('a tampered signature is rejected', async () => {
  const token = await signSession({ uid: 62940574, exp: future() }, SECRET);
  const [body, signature] = token.split('.');
  const flipped = signature.slice(0, -1) + (signature.at(-1) === 'A' ? 'B' : 'A');
  assert.equal(await verifySession(`${body}.${flipped}`, SECRET), null);
});

test('a session signed with another secret is rejected', async () => {
  const token = await signSession({ uid: 62940574, exp: future() }, OTHER_SECRET);
  assert.equal(await verifySession(token, SECRET), null);
});

test('an expired session is rejected, and exp is required', async () => {
  const expired = await signSession({ uid: 62940574, exp: Date.now() - 1 }, SECRET);
  assert.equal(await verifySession(expired, SECRET), null);

  const undated = await signSession({ uid: 62940574 }, SECRET);
  assert.equal(await verifySession(undated, SECRET), null);
});

test('malformed tokens return null instead of throwing', async () => {
  const inputs = [undefined, null, 42, '', 'nodot', 'a.b.c', '....', '%%%.%%%', 'A.A'];
  for (const input of inputs) {
    assert.equal(await verifySession(input, SECRET), null, `input: ${String(input)}`);
  }
});

test('a short secret is refused rather than silently weak', async () => {
  await assert.rejects(() => signSession({ uid: 1, exp: future() }, 'short'), /at least 32/);
});

test('timingSafeEqual compares contents, not identity', () => {
  assert.ok(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3])));
  assert.ok(!timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4])));
  assert.ok(!timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3])));
});

test('the allowlist takes numeric ids and drops everything else', () => {
  assert.deepEqual(parseAllowlist('62940574'), [62940574]);
  assert.deepEqual(parseAllowlist('62940574, 123\n456'), [62940574, 123, 456]);
  assert.deepEqual(parseAllowlist('polynomeer, -1, 0, 1.5, '), []);
  assert.deepEqual(parseAllowlist(undefined), []);
});

test('isAllowed matches on id and never on a login-shaped value', () => {
  const list = parseAllowlist('62940574');
  assert.ok(isAllowed(62940574, list));
  assert.ok(!isAllowed(62940575, list));
  assert.ok(!isAllowed('62940574', list));
  assert.ok(!isAllowed(undefined, list));
});

test('cookies carry the flags __Host- requires', () => {
  const cookie = serializeCookie(SESSION_COOKIE, 'value', { maxAge: 3600 });
  for (const flag of ['Path=/', 'Secure', 'HttpOnly', 'SameSite=Lax', 'Max-Age=3600']) {
    assert.ok(cookie.includes(flag), `missing ${flag}`);
  }
  assert.ok(!cookie.includes('Domain='), '__Host- cookies must not set Domain');
  assert.ok(clearCookie(SESSION_COOKIE).includes('Max-Age=0'));
});

test('readCookie finds one cookie among several and tolerates junk', () => {
  const header = `other=1; ${SESSION_COOKIE}=abc.def; trailing=2`;
  assert.equal(readCookie(header, SESSION_COOKIE), 'abc.def');
  assert.equal(readCookie(header, 'missing'), null);
  assert.equal(readCookie('', SESSION_COOKIE), null);
  assert.equal(readCookie(null, SESSION_COOKIE), null);
  assert.equal(readCookie('novalue; =x', SESSION_COOKIE), null);
});

test('randomToken is url-safe and does not repeat', () => {
  const tokens = new Set(Array.from({ length: 200 }, () => randomToken()));
  assert.equal(tokens.size, 200);
  for (const token of tokens) {
    assert.match(token, /^[A-Za-z0-9_-]+$/);
  }
});
