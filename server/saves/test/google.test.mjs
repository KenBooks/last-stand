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
const OTHER_PREVIEW = 'https://pr-6.ls.wellscoped.dev';
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
    DATA, ORIGINS: `${PRODUCTION},https://pr-*.ls.wellscoped.dev`, GITHUB_REPO: '', ACCOUNTS_PER_DAY: '100', ASKS_PER_HOUR: '200',
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

test('a signed-in browser can preflight the public health request', async () => {
  const response = await fetch(`${base}/saves/health`, {
    method: 'OPTIONS',
    headers: {
      origin: PRODUCTION,
      'access-control-request-method': 'GET',
      'access-control-request-headers': 'authorization',
    },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), PRODUCTION);
  assert.match(response.headers.get('access-control-allow-headers') ?? '', /authorization/);
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
  // its session and Google binding belong to this preview alone
  assert.equal((await call('GET', '/saves/save', { origin: PREVIEW, token: finished.body.token })).status, 200);
  assert.equal((await call('GET', '/saves/save', { origin: PRODUCTION, token: finished.body.token })).status, 401);
  const again = await signInWithGoogle('sub-preview', PREVIEW);
  assert.equal(again.body.account.id, finished.body.account.id);
  const other = await signInWithGoogle('sub-preview', OTHER_PREVIEW);
  assert.notEqual(other.body.account.id, finished.body.account.id);
  const production = await signInWithGoogle('sub-preview');
  assert.notEqual(production.body.account.id, finished.body.account.id);
  assert.notEqual(production.body.account.id, other.body.account.id);
});

test('a preview Google sign-in does not reserve Google on a production passkey account', async () => {
  const preview = await signInWithGoogle('sub-preview-then-link', PREVIEW);
  const token = await signUp(authenticator());
  const linked = await linkWithGoogle(token, 'sub-preview-then-link');
  assert.equal(linked.status, 200);
  const production = await signInWithGoogle('sub-preview-then-link');
  assert.equal(production.body.account.id, linked.body.account.id);
  assert.equal((await signInWithGoogle('sub-preview-then-link', PREVIEW)).body.account.id, preview.body.account.id);
});

test('an existing preview Google account keeps its preview binding after the site field is added', async () => {
  const first = await signInWithGoogle('sub-old-preview', PREVIEW);
  const store = await import('../store.mjs');
  const account = structuredClone(store.account(first.body.account.id));
  account.google = account.googles['pr-5.ls.wellscoped.dev']; // account files from before this change
  delete account.googles;
  await store.keepAccount(account);
  await store.load(DATA);
  assert.equal(store.account(account.id).googles['pr-5.ls.wellscoped.dev'].sub, 'sub-old-preview');
  assert.equal((await signInWithGoogle('sub-old-preview', PREVIEW)).body.account.id, account.id);
  const token = await signUp(authenticator());
  assert.equal((await linkWithGoogle(token, 'sub-old-preview')).status, 200);
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
  // (and a control or wider character, which can't go in the Location header)
  const odd = ['/a\u0001b', '/caf\u00e9'];
  for (const returnPath of ['//evil.example/', 'https://evil.example/', '/\\evil.example', 'relative', ...odd]) {
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

/** Google's answer to a link begun by the session `token` on production, `sub` consenting, finished from the tab
 *  (`nonce`) and session (`finisher`, the same by default) given: the finish's answer. */
async function linkWithGoogle(token, sub, { finisher = token, nonce = NONCE } = {}) {
  const { body } = await begin('link', { token });
  const { location } = await callback(body.url, sub);
  const code = /#cloud-google=(.+)$/.exec(location)?.[1];
  assert.ok(code, `no code in ${location}`);
  return call('POST', '/saves/auth/google/finish', { token: finisher, json: { code, nonce } });
}

test('Google is linked from production alone, to one account, and is never the last way in', async () => {
  const device = authenticator();
  const token = await signUp(device);
  assert.equal((await begin('link')).status, 401);
  // a preview's session may be anyone's token: it links nothing
  const code = (await call('POST', '/saves/link-code', { token })).body.code;
  const preview = (await call('POST', '/saves/link', { origin: PREVIEW, json: { code } })).body.token;
  assert.equal((await begin('link', { origin: PREVIEW, token: preview })).status, 403);
  const linked = await linkWithGoogle(token, 'sub-linked');
  assert.equal(linked.status, 200);
  assert.equal(linked.body.linked, true);
  const account = (await call('GET', '/saves/account', { token })).body;
  assert.equal(account.google, true);
  assert.equal((await signInWithGoogle('sub-linked')).body.account.id, account.id);
  // another account gets an explicit move offer after proving the same Google identity
  const other = await signUp(authenticator());
  const taking = await linkWithGoogle(other, 'sub-linked');
  assert.equal(taking.status, 200);
  assert.ok(taking.body.move.code);
  // with a passkey beside it, Google can go, and comes back; the passkey can go while Google stays
  assert.equal((await call('DELETE', '/saves/google', { origin: PREVIEW, token: preview })).status, 403);
  assert.equal((await call('DELETE', '/saves/google', { token })).status, 204);
  assert.equal((await linkWithGoogle(token, 'sub-linked')).status, 200);
  const passkey = account.passkeys[0].id;
  assert.equal((await call('DELETE', `/saves/passkey/${encodeURIComponent(passkey)}`, { token })).status, 204);
  // now Google is the last way in
  assert.equal((await call('DELETE', '/saves/google', { token })).status, 409);
});

test('an OAuth-proven owner can move Google from preview junk to the account they are signed into', async () => {
  const source = await signInWithGoogle('sub-move');
  const store = await import('../store.mjs');
  const junk = structuredClone(store.account(source.body.account.id));
  await store.keepSite(junk, 'pr-5.ls.wellscoped.dev', { site: 'pr-5.ls.wellscoped.dev', parts: {} });
  await store.keepAccount(junk);
  const target = await signUp(authenticator());
  const stranger = await signUp(authenticator());
  const offer = await linkWithGoogle(target, 'sub-move');
  assert.equal(offer.status, 200);
  assert.equal(offer.body.move.previewSaves, 1);
  assert.equal(offer.body.move.hasProductionSave, false);
  assert.equal(offer.body.move.hasPasskey, false);
  const code = offer.body.move.code;
  assert.equal((await call('POST', '/saves/google/move', { token: stranger, json: { code } })).status, 403);
  const moved = await call('POST', '/saves/google/move', { token: target, json: { code } });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.account.google, true);
  assert.equal((await signInWithGoogle('sub-move')).body.account.id, moved.body.account.id);
  assert.equal((await call('GET', '/saves/account', { token: source.body.token })).body.google, false);
  assert.ok(await store.readSite(source.body.account.id, 'pr-5.ls.wellscoped.dev'), 'old preview save remains');
  assert.equal((await call('POST', '/saves/google/move', { token: target, json: { code } })).status, 401);
  await store.load(DATA);
  assert.equal((await signInWithGoogle('sub-move')).body.account.id, moved.body.account.id, 'the move survives a restart');
});

test('moving Google cannot strand an account with a production save', async () => {
  const source = await signInWithGoogle('sub-kept-save');
  const store = await import('../store.mjs');
  const withSave = structuredClone(store.account(source.body.account.id));
  await store.keepSite(withSave, 'last-stand.cc', { site: 'last-stand.cc', parts: {} });
  await store.keepAccount(withSave);
  const target = await signUp(authenticator());
  const refused = await linkWithGoogle(target, 'sub-kept-save');
  assert.equal(refused.status, 409);
  assert.equal(refused.body, 'taken');
  assert.equal((await signInWithGoogle('sub-kept-save')).body.account.id, source.body.account.id);
  const device = authenticator();
  const options = await call('POST', '/saves/passkey/options', { token: source.body.token, json: { purpose: 'register' } });
  const added = await call('POST', '/saves/passkey/verify', {
    token: source.body.token, json: { purpose: 'register', response: device.create(options.body, PRODUCTION) },
  });
  assert.equal(added.status, 200);
  const offered = await linkWithGoogle(target, 'sub-kept-save');
  assert.equal(offered.status, 200);
  assert.equal(offered.body.move.hasProductionSave, true);
  assert.equal(offered.body.move.hasPasskey, true);
});

test('a link address sent to another player links nothing: it finishes only from the tab and session that began it', async () => {
  const attacker = await signUp(authenticator());
  const victim = await signUp(authenticator());
  // the attacker begins a link and sends its Google address on; the victim opens it and picks their own Google
  const { body } = await begin('link', { token: attacker });
  const { location } = await callback(body.url, 'sub-victim');
  const code = /#cloud-google=(.+)$/.exec(location)?.[1];
  assert.ok(code);
  // nothing is linked by Google's answer itself
  assert.equal((await call('GET', '/saves/account', { token: attacker })).body.google, false);
  // the victim's game, signed in to its own account, finishes it (even knowing the attacker's nonce): refused
  const finish = (token) => call('POST', '/saves/auth/google/finish', { token, json: { code, nonce: NONCE } });
  assert.equal((await finish(victim)).status, 403);
  assert.equal((await call('GET', '/saves/account', { token: attacker })).body.google, false);
  // and the victim's Google is free for the victim's own account
  assert.equal((await linkWithGoogle(victim, 'sub-victim')).status, 200);
});

test('a landing code is good once, whatever shape it is sent in', async () => {
  const { body } = await begin('signin');
  const { location } = await callback(body.url, 'sub-shape');
  const code = /#cloud-google=(.+)$/.exec(location)[1];
  const finish = (sent) => call('POST', '/saves/auth/google/finish', { json: { code: sent, nonce: NONCE } });
  assert.equal((await finish([code])).status, 200);
  assert.equal((await finish([code])).status, 401);
  assert.equal((await finish(code)).status, 401);
});

test('a preview\'s passkey isn\'t a way into production: Google stays while it is the only one there', async () => {
  const signedIn = await signInWithGoogle('sub-preview-passkey');
  const token = signedIn.body.token;
  const code = (await call('POST', '/saves/link-code', { token })).body.code;
  const preview = (await call('POST', '/saves/link', { origin: PREVIEW, json: { code } })).body.token;
  const device = authenticator();
  const options = await call('POST', '/saves/passkey/options', { origin: PREVIEW, token: preview, json: { purpose: 'register' } });
  const added = await call('POST', '/saves/passkey/verify', {
    origin: PREVIEW, token: preview, json: { purpose: 'register', response: device.create(options.body, PREVIEW) },
  });
  assert.equal(added.status, 200, added.body);
  assert.equal((await call('GET', '/saves/account', { token })).body.passkeys.length, 1);
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
  const before = readFileSync(join(RESTORED, 'accounts', accountFile));
  snapshot.files['saves/bad/../../outside.json'] = '{}';
  await assert.rejects(restore(gzipSync(JSON.stringify(snapshot)), RESTORED, { replace: true }), /file out of place/);
  assert.deepEqual(readFileSync(join(RESTORED, 'accounts', accountFile)), before);
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

test('backup retention checks every Drive listing page', async () => {
  const folder = google.folderNamed('Last Stand backups');
  for (let n = 0; n < 205; n++) google.addFile(folder.id, `old-${n}.json.gz`, 20);
  const result = await backups.runBackup(backups.backupSettingsFrom(settings()), DATA, Date.now() + 4 * 86_400_000);
  assert.equal(result.deleted, 205);
  assert.equal(google.childrenOf(folder.id).filter((file) => file.name.startsWith('old-')).length, 0);
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
