// Signing in with Google and the Drive backups (google.mjs, backups.mjs, #503), against a stand-in for Google
// (fakeGoogle.mjs): the redirect's state and where it may send the page, a forged, misdirected or replayed code,
// linking and unlinking, never the last way in, and a backup uploaded, checked, pruned and restored.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { authenticator } from './authenticator.mjs';
import { fakeGoogle, CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN } from './fakeGoogle.mjs';

const ROOT = resolve(import.meta.dirname, '../../..');
const DATA = join(ROOT, '.tmp', `saves-google-test-${process.pid}`);
const RESTORED = `${DATA}-restored`;
const PRODUCTION = 'https://last-stand.cc';
const PREVIEW = 'https://pr-5.ls.wellscoped.dev';
/** the tab's nonce a sign-in is bound to (the page keeps it in session storage) */
const NONCE = 'this-tabs-nonce-0123456789';
let saves, backups, server, base, google;

before(async () => {
  mkdirSync(DATA, { recursive: true });
  google = await fakeGoogle();
  saves = await import('../saves.mjs');
  backups = await import('../backups.mjs');
  server = await saves.start(0, settings());
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
  google?.close();
  // (the folders this test made, and nothing else)
  rmSync(DATA, { recursive: true, force: true });
  rmSync(RESTORED, { recursive: true, force: true });
});

/** The service's settings here: Google's and Drive's addresses the stand-in's, the first backup never on its own. */
function settings(overrides = {}) {
  return {
    DATA, ORIGINS: `${PRODUCTION},https://pr-*.ls.wellscoped.dev`, GITHUB_REPO: '', ACCOUNTS_PER_DAY: '100',
    GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: CLIENT_SECRET, DRIVE_REFRESH_TOKEN: REFRESH_TOKEN,
    GOOGLE_AUTH_URL: `${google.url}/auth`, GOOGLE_TOKEN_URL: `${google.url}/token`, DRIVE_API: google.url,
    BACKUP_FIRST_MS: String(60 * 60_000), ...overrides,
  };
}

async function call(method, path, { origin = PRODUCTION, token, json } = {}) {
  const headers = {};
  if (origin) headers.origin = origin;
  if (token) headers.authorization = `Bearer ${token}`;
  if (json !== undefined) headers['content-type'] = 'application/json';
  const answer = await fetch(`${base}${path}`, {
    method, headers, body: json !== undefined ? JSON.stringify(json) : undefined, redirect: 'manual',
  });
  const type = answer.headers.get('content-type') ?? '';
  return { status: answer.status, body: type.includes('json') ? await answer.json() : await answer.text(), headers: answer.headers };
}

/** A new passkey account on production: its token. */
async function signUp(device) {
  const options = await call('POST', '/saves/passkey/options', { json: { purpose: 'register' } });
  const made = await call('POST', '/saves/passkey/verify', {
    json: { purpose: 'register', response: device.create(options.body, PRODUCTION) },
  });
  assert.equal(made.status, 201);
  return made.body.token;
}

/** Google's sign-in begun from `origin` (signed in with `token` to link): the address the page is sent to. */
async function begin(purpose, { origin = PRODUCTION, token, returnPath = '/?renderer=webgpu', nonce = NONCE } = {}) {
  return call('POST', '/saves/auth/google', { origin, token, json: { purpose, returnPath, nonce } });
}

/** Google coming back to the service for the sign-in at `authUrl`, `sub` consenting: where the page is sent. */
async function callback(authUrl, sub, { code } = {}) {
  const state = new URL(authUrl).searchParams.get('state');
  const query = new URLSearchParams({ state, code: code ?? google.consent(authUrl, sub) });
  const answer = await call('GET', `/saves/auth/google/callback?${query}`, { origin: null });
  return { status: answer.status, location: answer.headers.get('location') ?? '' };
}

/** A whole sign-in from `origin` as `sub`: the session's answer. */
async function signInWithGoogle(sub, origin = PRODUCTION) {
  const { body } = await begin('signin', { origin });
  const { location } = await callback(body.url, sub);
  const code = /#cloud-google=(.+)$/.exec(location)?.[1];
  assert.ok(code, `no code in ${location}`);
  return call('POST', '/saves/auth/google/finish', { origin, json: { code, nonce: NONCE } });
}

test('the health says Google and the backups are on', async () => {
  const health = await call('GET', '/saves/health', { origin: null });
  assert.equal(health.body.google, true);
  assert.deepEqual(health.body.backups, { state: 'pending', last: 0 });
});

test('a Google sign-in goes by Google with PKCE and the openid scope alone, and comes home to the page that asked', async () => {
  const started = await begin('signin', { origin: PREVIEW });
  assert.equal(started.status, 200);
  const sent = new URL(started.body.url);
  assert.equal(`${sent.origin}${sent.pathname}`, `${google.url}/auth`);
  assert.equal(sent.searchParams.get('scope'), 'openid');
  assert.equal(sent.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(sent.searchParams.get('client_id'), CLIENT_ID);
  const back = await callback(started.body.url, 'sub-preview');
  assert.equal(back.status, 303);
  assert.match(back.location, /^https:\/\/pr-5\.ls\.wellscoped\.dev\/\?renderer=webgpu#cloud-google=[\w-]+$/);
  const code = back.location.split('#cloud-google=')[1];
  // the code is that page's alone, and good once
  const finish = (origin, nonce) => call('POST', '/saves/auth/google/finish', { origin, json: { code, nonce } });
  assert.equal((await finish(PRODUCTION, NONCE)).status, 401);
  // nor another tab's: a code sent in a link to someone else's browser signs it in to nobody's account
  assert.equal((await finish(PREVIEW, 'another-tabs-nonce-0123456')).status, 401);
  const finished = await finish(PREVIEW, NONCE);
  assert.equal(finished.status, 200);
  assert.equal(finished.body.account.google, true);
  assert.deepEqual(finished.body.account.passkeys, []);
  assert.equal((await finish(PREVIEW, NONCE)).status, 401);
  // its session is the preview's, and the same Google account signs in to the same account anywhere
  assert.equal((await call('GET', '/saves/save', { origin: PREVIEW, token: finished.body.token })).status, 200);
  assert.equal((await call('GET', '/saves/save', { origin: PRODUCTION, token: finished.body.token })).status, 401);
  const again = await signInWithGoogle('sub-preview');
  assert.equal(again.body.account.id, finished.body.account.id);
});

test('the state is good once, and Google\'s answer never sends the page anywhere the state didn\'t name', async () => {
  const started = await begin('signin');
  const first = await callback(started.body.url, 'sub-once');
  assert.equal(first.status, 303);
  const replayed = await callback(started.body.url, 'sub-once');
  assert.equal(replayed.status, 400);
  assert.equal(replayed.location, '');
  const forged = await call('GET', '/saves/auth/google/callback?state=made-up&code=x', { origin: null });
  assert.equal(forged.status, 400);
  // a return path off the page, or a page that isn't the game's, is refused before Google is asked
  for (const returnPath of ['//evil.example/', 'https://evil.example/', '/\\evil.example', 'relative']) {
    assert.equal((await begin('signin', { returnPath })).status, 400, returnPath);
  }
  assert.equal((await begin('signin', { origin: 'https://evil.example' })).status, 403);
  assert.equal((await begin('signin', { nonce: 'short' })).status, 400);
});

test('a code Google never gave, or an id token for another client, signs nobody in', async () => {
  const started = await begin('signin');
  const refused = await callback(started.body.url, 'sub-x', { code: 'never-given' });
  assert.match(refused.location, /#cloud-google-error=refused$/);
  google.aud = 'another-client';
  try {
    const other = await begin('signin');
    const back = await callback(other.body.url, 'sub-y');
    assert.match(back.location, /#cloud-google-error=refused$/);
  } finally {
    google.aud = CLIENT_ID;
  }
  const cancelled = await begin('signin');
  const state = new URL(cancelled.body.url).searchParams.get('state');
  const denied = await call('GET', `/saves/auth/google/callback?state=${state}&error=access_denied`, { origin: null });
  assert.match(denied.headers.get('location') ?? '', /#cloud-google-error=cancelled$/);
});

test('Google is linked from production alone, to one account, and is never the last way in', async () => {
  const device = authenticator();
  const token = await signUp(device);
  assert.equal((await begin('link')).status, 401);
  // a preview's session may be anyone's token: it links nothing
  const code = (await call('POST', '/saves/link-code', { token })).body.code;
  const preview = (await call('POST', '/saves/link', { origin: PREVIEW, json: { code } })).body.token;
  assert.equal((await begin('link', { origin: PREVIEW, token: preview })).status, 403);
  const linking = await begin('link', { token });
  const linked = await callback(linking.body.url, 'sub-linked');
  assert.match(linked.location, /#cloud-google-linked$/);
  const account = (await call('GET', '/saves/account', { token })).body;
  assert.equal(account.google, true);
  assert.equal((await signInWithGoogle('sub-linked')).body.account.id, account.id);
  // another account can't take that Google account
  const other = await signUp(authenticator());
  const taking = await begin('link', { token: other });
  assert.match((await callback(taking.body.url, 'sub-linked')).location, /#cloud-google-error=taken$/);
  // with a passkey beside it, Google can go, and comes back; the passkey can go while Google stays
  assert.equal((await call('DELETE', '/saves/google', { origin: PREVIEW, token: preview })).status, 403);
  assert.equal((await call('DELETE', '/saves/google', { token })).status, 204);
  assert.match((await callback((await begin('link', { token })).body.url, 'sub-linked')).location, /linked$/);
  const passkey = account.passkeys[0].id;
  assert.equal((await call('DELETE', `/saves/passkey/${encodeURIComponent(passkey)}`, { token })).status, 204);
  // now Google is the last way in
  assert.equal((await call('DELETE', '/saves/google', { token })).status, 409);
});

test('a backup uploads every account and save, checked by its MD5, drops those past 14 days and restores whole', async () => {
  const signedIn = await signInWithGoogle('sub-backup');
  const value = Buffer.from(JSON.stringify({ hero: 'kept' }));
  const { gzipSync } = await import('node:zlib');
  const put = await fetch(`${base}/saves/save/shared`, {
    method: 'PUT', body: gzipSync(value),
    headers: { origin: PRODUCTION, authorization: `Bearer ${signedIn.body.token}`, 'x-save-base': '0', 'x-save-device': 'PC' },
  });
  assert.equal(put.status, 200);
  const on = backups.backupSettingsFrom(settings());
  const first = await backups.runBackup(on, DATA);
  assert.ok(first.uploaded, JSON.stringify(first));
  const folder = google.folderNamed('Last Stand backups');
  assert.ok(folder, 'no backups folder');
  // a run soon after skips: a deploy's restart doesn't upload another
  assert.deepEqual(await backups.runBackup(on, DATA), { skipped: 'recent' });
  // a day on, one 20 days old is dropped and one 3 days old kept
  google.addFile(folder.id, 'old.json.gz', 20);
  google.addFile(folder.id, 'recent.json.gz', 3);
  const later = await backups.runBackup(on, DATA, Date.now() + 86_400_000);
  assert.equal(later.deleted, 1);
  const names = google.childrenOf(folder.id).map((file) => file.name).sort();
  assert.equal(names.length, 3, names.join(', '));
  assert.ok(!names.includes('old.json.gz'));
  const health = await call('GET', '/saves/health', { origin: null });
  assert.equal(health.body.backups.state, 'ok');
  // the snapshot restores into an empty folder as the service keeps it
  const uploaded = google.childrenOf(folder.id).find((file) => file.name === first.uploaded);
  const { restore } = await import('../restore.mjs');
  const written = await restore(uploaded.bytes, RESTORED);
  assert.ok(written >= 2);
  const accountFile = `${signedIn.body.account.id}.json`;
  assert.deepEqual(readFileSync(join(RESTORED, 'accounts', accountFile)), readFileSync(join(DATA, 'accounts', accountFile)));
  const site = readdirSync(join(RESTORED, 'saves', signedIn.body.account.id));
  assert.deepEqual(site, ['last-stand.cc.json']);
  await assert.rejects(restore(uploaded.bytes, RESTORED), /holds \d+ accounts already/);
  const snapshot = JSON.parse(gunzipSync(uploaded.bytes).toString('utf8'));
  assert.equal(snapshot.version, 1);
});

test('an upload whose MD5 Drive reports otherwise fails, and the health says so', async () => {
  google.lie = true;
  try {
    const result = await backups.runBackup(backups.backupSettingsFrom(settings()), DATA, Date.now() + 3 * 86_400_000);
    assert.match(result.failed ?? '', /MD5/);
    const health = await call('GET', '/saves/health', { origin: null });
    assert.equal(health.body.backups.state, 'failing');
  } finally {
    google.lie = false;
  }
});

test('with Google\'s client unset, its sign-in and the backups are off', async () => {
  server.close();
  server = await saves.start(0, settings({ GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' }));
  base = `http://127.0.0.1:${server.address().port}`;
  const health = await call('GET', '/saves/health', { origin: null });
  assert.equal(health.body.google, false);
  assert.deepEqual(health.body.backups, { state: 'off', last: 0 });
  assert.equal((await begin('signin')).status, 404);
  const off = backups.backupSettingsFrom(settings({ DRIVE_REFRESH_TOKEN: '' }));
  assert.deepEqual(await backups.runBackup(off, DATA), { skipped: 'off' });
});
