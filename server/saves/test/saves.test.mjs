// The saves service (saves.mjs) on a port of its own, its accounts in a folder of the test's: passkeys made and signed
// as a browser's are (authenticator.mjs), sessions bound to their site, each site's save apart, versions that refuse
// a stale write, the caps, the sign-in code, copying production into a preview, deleting, a restart, and the
// cleanup against a stand-in for GitHub's API.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { authenticator } from './authenticator.mjs';

const ROOT = resolve(import.meta.dirname, '../../..');
const DATA = join(ROOT, '.tmp', `saves-test-${process.pid}`);
const PRODUCTION = 'https://last-stand.cc';
const PREVIEW = 'https://pr-5.ls.wellscoped.dev';
const OTHER_PREVIEW = 'https://pr-6.ls.wellscoped.dev';
const COMMIT = 'https://c-0123456789ab.ls.wellscoped.dev';
const OLD_ADDRESS = 'https://victorzakharov.github.io';
const SETTINGS = {
  DATA, ORIGINS: `${PRODUCTION},https://www.last-stand.cc,https://pr-*.ls.wellscoped.dev,https://c-*.ls.wellscoped.dev,`
    + OLD_ADDRESS,
  SAVE_MAX: '4096', ACCOUNTS_PER_DAY: '100', OTHER_SITES_MAX: '3', WRITES_PER_HOUR: '40', WRITES_PER_MINUTE: '30',
};
let saves, server, base, github;
/** PR number -> its state, as the stand-in for GitHub's API answers */
const prStates = { 5: 'closed', 6: 'open' };

async function boot(overrides = {}) {
  server = await saves.start(0, { ...SETTINGS, ...overrides });
  base = `http://127.0.0.1:${server.address().port}`;
}

before(async () => {
  mkdirSync(DATA, { recursive: true });
  github = createServer((req, res) => {
    const number = /\/pulls\/(\d+)$/.exec(req.url ?? '')?.[1];
    const state = prStates[number];
    res.writeHead(state ? 200 : 404, { 'content-type': 'application/json' });
    res.end(JSON.stringify(state ? { number: Number(number), state } : { message: 'Not Found' }));
  });
  await new Promise((done) => github.listen(0, done));
  SETTINGS.GITHUB_API = `http://127.0.0.1:${github.address().port}`;
  saves = await import('../saves.mjs');
  await boot();
});

after(() => {
  server?.close();
  github?.close();
  // (the folder this test made, and nothing else)
  rmSync(DATA, { recursive: true, force: true });
});

/** A request from the page at `origin`, signed in with `token` if given. */
async function call(method, path, { origin = PRODUCTION, token, json, body, headers = {} } = {}) {
  const sent = { ...headers };
  if (origin) sent.origin = origin;
  if (token) sent.authorization = `Bearer ${token}`;
  if (json !== undefined) sent['content-type'] = 'application/json';
  const answer = await fetch(`${base}${path}`, { method, headers: sent, body: json !== undefined ? JSON.stringify(json) : body });
  const type = answer.headers.get('content-type') ?? '';
  const read = type.includes('json') ? await answer.json() : type.includes('gzip')
    ? Buffer.from(await answer.arrayBuffer()) : await answer.text();
  return { status: answer.status, body: read, headers: answer.headers };
}

/** A new account from the page at `origin`, made by the device's passkey `device`: its session's token. */
async function signUp(device, origin = PRODUCTION) {
  const options = await call('POST', '/saves/passkey/options', { origin, json: { purpose: 'register' } });
  assert.equal(options.status, 200);
  const made = await call('POST', '/saves/passkey/verify', { origin,
    json: { purpose: 'register', response: device.create(options.body, origin) } });
  assert.equal(made.status, 201, made.body);
  return made.body.token;
}

/** Signs in on the page at `origin` with the device's passkey: the answer. */
async function signIn(device, origin = PRODUCTION) {
  const options = await call('POST', '/saves/passkey/options', { origin, json: { purpose: 'login' } });
  assert.equal(options.status, 200);
  return call('POST', '/saves/passkey/verify', { origin, json: { purpose: 'login', response: device.get(options.body, origin) } });
}

const part = (value) => gzipSync(JSON.stringify(value));

/** Writes a part of the signed-in site's save, building on version `base`. */
const put = (token, name, value, baseVersion, origin = PRODUCTION, device = 'PC') => call('PUT', `/saves/save/${name}`,
  { origin, token, body: Buffer.isBuffer(value) ? value : part(value),
    headers: { 'x-save-base': String(baseVersion), 'x-save-device': device } });

test('health says what is on, from anywhere; everything else only from the game\'s pages', async () => {
  const health = await call('GET', '/saves/health', { origin: null });
  assert.equal(health.status, 200);
  // (Google's sign-in and the backups are off: their settings are unset here, google.test.mjs sets them)
  const off = { state: 'off', last: 0 };
  assert.deepEqual(health.body, { ok: true, passkeys: true, google: false, cleanup: true, backups: off });
  assert.equal((await call('GET', '/saves/save', { origin: 'https://evil.example' })).status, 403);
  assert.equal((await call('GET', '/saves/save', { origin: null })).status, 403);
  assert.equal((await call('GET', '/saves/save')).status, 401);
});

test('a passkey makes an account, signs in again, and only once per challenge', async () => {
  const device = authenticator();
  const token = await signUp(device);
  const account = await call('GET', '/saves/account', { token });
  assert.equal(account.status, 200);
  assert.equal(account.body.passkeys.length, 1);
  assert.equal(account.body.passkeys[0].rpId, 'last-stand.cc');
  assert.equal(account.body.passkeys[0].publicKey, undefined, 'no key handed back');
  // www is production too: the same relying party, the same site
  const again = await signIn(device, 'https://www.last-stand.cc');
  assert.equal(again.status, 200, again.body);
  assert.equal(again.body.account.id, account.body.id);
  // an answer sent twice signs in once
  const options = await call('POST', '/saves/passkey/options', { json: { purpose: 'login' } });
  const answer = device.get(options.body, PRODUCTION);
  assert.equal((await call('POST', '/saves/passkey/verify', { json: { purpose: 'login', response: answer } })).status, 200);
  assert.equal((await call('POST', '/saves/passkey/verify', { json: { purpose: 'login', response: answer } })).status, 401);
});

test('a forged or misdirected answer signs nobody in', async () => {
  const device = authenticator();
  await signUp(device);
  const stranger = authenticator();
  // another key claiming this passkey's id
  const options = await call('POST', '/saves/passkey/options', { json: { purpose: 'login' } });
  const forged = { ...stranger.get(options.body, PRODUCTION), id: device.id, rawId: device.id };
  assert.equal((await call('POST', '/saves/passkey/verify', { json: { purpose: 'login', response: forged } })).status, 401);
  // a challenge asked for by one page, answered on another
  const elsewhere = await call('POST', '/saves/passkey/options', { json: { purpose: 'login' } });
  const moved = device.get(elsewhere.body, PREVIEW);
  assert.equal((await call('POST', '/saves/passkey/verify', { origin: PREVIEW,
    json: { purpose: 'login', response: moved } })).status, 401);
  // production's passkey on a preview: another relying party
  const preview = await call('POST', '/saves/passkey/options', { origin: PREVIEW, json: { purpose: 'login' } });
  assert.equal(preview.body.rpId, 'ls.wellscoped.dev');
  const wrongParty = device.get(preview.body, PREVIEW, { rpId: 'last-stand.cc' });
  assert.equal((await call('POST', '/saves/passkey/verify', { origin: PREVIEW,
    json: { purpose: 'login', response: wrongParty } })).status, 401);
  // no passkeys where no relying party fits
  assert.equal((await call('POST', '/saves/passkey/options', { origin: OLD_ADDRESS, json: { purpose: 'login' } })).status, 400);
});

test('a session works only on the site it was made for', async () => {
  const token = await signUp(authenticator());
  assert.equal((await call('GET', '/saves/save', { token })).status, 200);
  assert.equal((await call('GET', '/saves/save', { token, origin: PREVIEW })).status, 401);
  assert.equal((await call('POST', '/saves/signout', { token })).status, 204);
  assert.equal((await call('GET', '/saves/save', { token })).status, 401);
});

test('parts keep their versions: a stale write is refused with the version kept', async () => {
  const token = await signUp(authenticator());
  const mage = { classId: 'mage', stash: [{ id: 'a1', name: 'Ashwood Staff' }] };
  const first = await put(token, 'hero.mage', mage, 0);
  assert.equal(first.status, 200, first.body);
  assert.equal(first.body.version, 1);
  const stale = await put(token, 'hero.mage', { classId: 'mage', stash: [] }, 0, PRODUCTION, 'Phone');
  assert.equal(stale.status, 409);
  assert.equal(stale.body.version, 1);
  assert.equal(stale.body.device, 'PC');
  const read = await call('GET', '/saves/save/hero.mage', { token });
  assert.equal(read.status, 200);
  assert.equal(read.headers.get('x-save-version'), '1');
  assert.deepEqual(JSON.parse(gunzipSync(read.body)), mage);
  assert.equal((await put(token, 'hero.mage', { classId: 'mage', stash: [] }, 1)).body.version, 2);
  const listed = await call('GET', '/saves/save', { token });
  assert.deepEqual(Object.keys(listed.body.parts), ['hero.mage']);
  assert.equal(listed.body.parts['hero.mage'].version, 2);
});

test('the caps: size, shape, part names', async () => {
  const token = await signUp(authenticator());
  // random letters don't compress: over SAVE_MAX gzipped
  const big = part({ junk: randomBytes(6000).toString('base64') });
  assert.ok(big.length > 4096);
  assert.equal((await put(token, 'hero.mage', big, 0)).status, 413);
  // two parts under the cap each, over it together
  const half = part({ junk: randomBytes(2200).toString('base64') });
  assert.equal((await put(token, 'hero.mage', half, 0)).status, 200);
  assert.equal((await put(token, 'hero.ranger', half, 0)).status, 413);
  assert.equal((await put(token, 'shared', Buffer.from('not gzip'), 0)).status, 400);
  assert.equal((await put(token, 'shared', gzipSync('[1,2]'), 0)).status, 400);
  assert.equal((await put(token, 'shared', { a: 1 }, -1)).status, 400);
  assert.equal((await put(token, '..%2Fescape', { a: 1 }, 0)).status, 400);
});

test('a sign-in code takes the account to a preview, where a passkey of its own is added', async () => {
  const phone = authenticator();
  const token = await signUp(phone);
  const { body: { code } } = await call('POST', '/saves/link-code', { token });
  assert.match(code, /^[0-9A-HJKMNP-TV-Z]{8}$/);
  const linked = await call('POST', '/saves/link', { origin: PREVIEW, json: { code: `${code.slice(0, 4)}-${code.slice(4)}` } });
  assert.equal(linked.status, 200, linked.body);
  assert.equal((await call('POST', '/saves/link', { origin: PREVIEW, json: { code } })).status, 401, 'once only');
  const previewToken = linked.body.token;
  const previewKey = authenticator();
  const options = await call('POST', '/saves/passkey/options', { origin: PREVIEW, token: previewToken,
    json: { purpose: 'register' } });
  const added = await call('POST', '/saves/passkey/verify', { origin: PREVIEW, token: previewToken,
    json: { purpose: 'register', response: previewKey.create(options.body, PREVIEW) } });
  assert.equal(added.status, 200, added.body);
  assert.deepEqual(added.body.account.passkeys.map((p) => p.rpId).sort(), ['last-stand.cc', 'ls.wellscoped.dev']);
  // that passkey works on every preview and commit build: one relying party
  const onCommit = await signIn(previewKey, COMMIT);
  assert.equal(onCommit.status, 200, onCommit.body);
  assert.equal(onCommit.body.account.id, added.body.account.id);
});

test('a separately signed-in preview copies production with a one-time production code', async () => {
  const device = authenticator();
  const token = await signUp(device);
  await put(token, 'hero.mage', { classId: 'mage', level: 9 }, 0);
  await put(token, 'shared', { tag: 'Ash' }, 0);
  const preview = await signUp(authenticator(), PREVIEW);
  assert.notEqual((await call('GET', '/saves/account', { token })).body.id,
    (await call('GET', '/saves/account', { origin: PREVIEW, token: preview })).body.id);
  assert.deepEqual((await call('GET', '/saves/save', { origin: PREVIEW, token: preview })).body.parts, {});
  // the preview's own write first: the copy must move its version on
  await put(preview, 'hero.mage', { classId: 'mage', level: 1 }, 0, PREVIEW);
  await put(preview, 'hero.ranger', { classId: 'ranger' }, 0, PREVIEW);
  assert.equal((await call('POST', '/saves/copy-code', { origin: PREVIEW, token: preview })).status, 403);
  assert.equal((await call('POST', '/saves/copy-production', { origin: PREVIEW, token: preview })).status, 401);
  const { body: { code } } = await call('POST', '/saves/copy-code', { token });
  const copied = await call('POST', '/saves/copy-production', { origin: PREVIEW, token: preview, json: { code } });
  assert.equal(copied.status, 200, copied.body);
  assert.equal((await call('POST', '/saves/copy-production', { origin: PREVIEW, token: preview, json: { code } })).status, 401);
  const parts = (await call('GET', '/saves/save', { origin: PREVIEW, token: preview })).body.parts;
  assert.deepEqual(Object.keys(parts).sort(), ['hero.mage', 'shared'], 'production\'s whole');
  assert.equal(parts['hero.mage'].version, 2, 'past the preview\'s own');
  const mage = await call('GET', '/saves/save/hero.mage', { origin: PREVIEW, token: preview });
  assert.equal(JSON.parse(gunzipSync(mage.body)).level, 9);
  // a write on the preview leaves production's as it was
  await put(preview, 'hero.mage', { classId: 'mage', level: 10 }, 2, PREVIEW);
  const kept = await call('GET', '/saves/save/hero.mage', { token });
  assert.equal(JSON.parse(gunzipSync(kept.body)).level, 9);
  assert.equal((await call('POST', '/saves/copy-production', { token, json: { code } })).status, 400);
  const sites = (await call('GET', '/saves/account', { token })).body.sites.map((s) => s.site).sort();
  assert.deepEqual(sites, ['last-stand.cc']);
});

test('preview saves are capped per account', async () => {
  const token = await signUp(authenticator());
  for (const [i, origin] of [PREVIEW, OTHER_PREVIEW, COMMIT, 'https://pr-7.ls.wellscoped.dev'].entries()) {
    const { body: { code } } = await call('POST', '/saves/link-code', { token });
    const there = (await call('POST', '/saves/link', { origin, json: { code } })).body.token;
    const wrote = await put(there, 'shared', { i }, 0, origin);
    assert.equal(wrote.status, i < 3 ? 200 : 507, `${origin}: ${JSON.stringify(wrote.body)}`);
  }
  assert.equal((await put(token, 'shared', { production: true }, 0)).status, 200, 'production is never counted');
});

test('deleting: never the last passkey; a site\'s save; the whole account', async () => {
  const device = authenticator();
  const token = await signUp(device);
  await put(token, 'shared', { a: 1 }, 0);
  const { body: account } = await call('GET', '/saves/account', { token });
  assert.equal((await call('DELETE', `/saves/passkey/${account.passkeys[0].id}`, { token })).status, 409);
  assert.equal((await call('DELETE', '/saves/save', { token })).status, 204);
  assert.deepEqual((await call('GET', '/saves/save', { token })).body.parts, {});
  assert.equal((await call('DELETE', '/saves/account', { token })).status, 204);
  assert.equal((await call('GET', '/saves/account', { token })).status, 401);
  assert.equal((await signIn(device)).status, 401);
  assert.equal(existsSync(join(DATA, 'accounts', `${account.id}.json`)), false);
  assert.equal(existsSync(join(DATA, 'saves', account.id)), false);
});

test('a restart keeps accounts, passkeys, sessions and saves', async () => {
  const device = authenticator();
  const token = await signUp(device);
  await put(token, 'shared', { kept: true }, 0);
  server.close();
  await boot();
  assert.equal((await call('GET', '/saves/save/shared', { token })).headers.get('x-save-version'), '1');
  assert.equal((await signIn(device)).status, 200);
});

test('the cleanup: closed PRs\' saves, stale commit builds\'; open PRs and production kept', async () => {
  const token = await signUp(authenticator());
  await put(token, 'shared', { where: 'production' }, 0);
  for (const origin of [PREVIEW, OTHER_PREVIEW, COMMIT]) {
    const { body: { code } } = await call('POST', '/saves/link-code', { token });
    const there = (await call('POST', '/saves/link', { origin, json: { code } })).body.token;
    await put(there, 'shared', { where: origin }, 0, origin);
  }
  const settings = saves.settingsFrom(SETTINGS);
  const sitesNow = async () => (await call('GET', '/saves/account', { token })).body.sites.map((s) => s.site).sort();
  await saves.cleanUp(settings);
  assert.deepEqual(await sitesNow(), ['c-0123456789ab.ls.wellscoped.dev', 'last-stand.cc', 'pr-6.ls.wellscoped.dev']);
  await saves.cleanUp(settings, Date.now() + 31 * 86_400_000);
  assert.deepEqual(await sitesNow(), ['last-stand.cc', 'pr-6.ls.wellscoped.dev']);
});

test('the closed PRs\' cleanup is off when no repository is set', async () => {
  const token = await signUp(authenticator());
  const { body: { code } } = await call('POST', '/saves/link-code', { token });
  const there = (await call('POST', '/saves/link', { origin: 'https://pr-8.ls.wellscoped.dev', json: { code } })).body.token;
  await put(there, 'shared', { a: 1 }, 0, 'https://pr-8.ls.wellscoped.dev');
  prStates[8] = 'closed';
  await saves.cleanUp(saves.settingsFrom({ ...SETTINGS, GITHUB_REPO: '' }));
  const sites = (await call('GET', '/saves/account', { token })).body.sites.map((s) => s.site);
  assert.deepEqual(sites, ['pr-8.ls.wellscoped.dev']);
});

test('a preview\'s token reaches nothing past its own save: codes for previews alone, no deleting, no passkeys', async () => {
  const device = authenticator();
  const token = await signUp(device);
  const { body: { code } } = await call('POST', '/saves/link-code', { token });
  const preview = (await call('POST', '/saves/link', { origin: PREVIEW, json: { code } })).body.token;
  // a preview's code sends its token out: replayed with any Origin, it is still a preview's session
  for (const origin of [PRODUCTION, OTHER_PREVIEW]) {
    assert.equal((await call('GET', '/saves/save', { origin, token: preview })).status, 401, origin);
  }
  // its code signs in on another preview (another device of the player's), never on production
  const made = await call('POST', '/saves/link-code', { origin: PREVIEW, token: preview });
  assert.equal(made.status, 200);
  assert.equal(made.body.previewsOnly, true);
  const onProduction = await call('POST', '/saves/link', { origin: PRODUCTION, json: { code: made.body.code } });
  assert.equal(onProduction.status, 403, 'a preview\'s code signed in on production');
  const onPreview = await call('POST', '/saves/link', { origin: OTHER_PREVIEW, json: { code: made.body.code } });
  assert.equal(onPreview.status, 200, 'a preview\'s code refused on another preview');
  assert.equal((await call('DELETE', '/saves/account', { origin: PREVIEW, token: preview })).status, 403);
  const passkeyId = (await call('GET', '/saves/account', { token })).body.passkeys[0].id;
  assert.equal((await call('DELETE', `/saves/passkey/${passkeyId}`, { origin: PREVIEW, token: preview })).status, 403);
  // its own save it may use, and delete
  assert.equal((await put(preview, 'shared', { a: 1 }, 0, PREVIEW)).status, 200);
  assert.equal((await call('DELETE', '/saves/save', { origin: PREVIEW, token: preview })).status, 204);
  // a preview session made by a passkey (not just now by a code) can't add one
  const previewKey = authenticator();
  const options = await call('POST', '/saves/passkey/options', { origin: PREVIEW, token: preview, json: { purpose: 'register' } });
  await call('POST', '/saves/passkey/verify', { origin: PREVIEW, token: preview,
    json: { purpose: 'register', response: previewKey.create(options.body, PREVIEW) } });
  const byPasskey = (await signIn(previewKey, OTHER_PREVIEW)).body.token;
  const asked = await call('POST', '/saves/passkey/options', { origin: OTHER_PREVIEW, token: byPasskey,
    json: { purpose: 'register' } });
  assert.equal(asked.status, 403);
  // production's account and passkey are as they were
  assert.equal((await signIn(device)).status, 200);
});

test('a new sign-in code replaces the last; a malformed path is a 400', async () => {
  const token = await signUp(authenticator());
  const first = (await call('POST', '/saves/link-code', { token })).body.code;
  const second = (await call('POST', '/saves/link-code', { token })).body.code;
  assert.equal((await call('POST', '/saves/link', { origin: PREVIEW, json: { code: first } })).status, 401);
  assert.equal((await call('POST', '/saves/link', { origin: PREVIEW, json: { code: second } })).status, 200);
  assert.equal((await call('GET', '/saves/save/%E0%A4%A', { token })).status, 400);
  assert.equal((await call('DELETE', '/saves/passkey/%E0%A4%A', { token })).status, 400);
});

test('writes are spread: a minute\'s most refuses the next, and a refused write spends none', async () => {
  server.close();
  await boot({ WRITES_PER_MINUTE: '3' });
  const token = await signUp(authenticator());
  assert.equal((await put(token, 'shared', { n: 1 }, 0)).status, 200);
  assert.equal((await put(token, 'shared', { n: 2 }, 0)).status, 409, 'stale: spends nothing');
  assert.equal((await put(token, 'shared', { n: 2 }, 1)).status, 200);
  assert.equal((await put(token, 'shared', { n: 3 }, 2)).status, 200);
  assert.equal((await put(token, 'shared', { n: 4 }, 3)).status, 429);
  // another site's save counts apart
  const { body: { code } } = await call('POST', '/saves/link-code', { token });
  const preview = (await call('POST', '/saves/link', { origin: PREVIEW, json: { code } })).body.token;
  assert.equal((await put(preview, 'shared', { n: 1 }, 0, PREVIEW)).status, 200);
  server.close();
  await boot();
});

test('a session unused past SESSION_DAYS is refused', async () => {
  server.close();
  await boot({ SESSION_DAYS: String(0.5 / 86_400) });
  const token = await signUp(authenticator());
  assert.equal((await call('GET', '/saves/save', { token })).status, 200);
  await new Promise((done) => setTimeout(done, 700));
  assert.equal((await call('GET', '/saves/save', { token })).status, 401);
  server.close();
  await boot();
});

test('new accounts from one address are capped a day', async () => {
  server.close();
  await boot({ ACCOUNTS_PER_DAY: '2' });
  for (let i = 0; i < 2; i++) await signUp(authenticator());
  const options = await call('POST', '/saves/passkey/options', { json: { purpose: 'register' } });
  const made = await call('POST', '/saves/passkey/verify', { json: { purpose: 'register',
    response: authenticator().create(options.body, PRODUCTION) } });
  assert.equal(made.status, 429);
});
