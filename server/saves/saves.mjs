// The saves service (server/saves/AGENTS.md): a player signs in with a passkey and each site's save is kept for every
// device. A process of its own beside the co-op relay and the traces, on the same host under /saves. Each page's
// save is filed under its origin (production, each PR preview, each commit build: a site each), which the browser
// sets, so a preview's page can never write production's heroes. A save is parts (a hero each, what they share),
// each gzipped JSON with a version: a write names the version it builds on, and a stale one is refused (409) with
// the version kept, so the game can ask its player which copy to keep (#382).
//   GET    /saves/health               { ok, passkeys, google, cleanup }: what is on
//   POST   /saves/passkey/options      { purpose: 'register' | 'login' } -> the options for navigator.credentials
//   POST   /saves/passkey/verify       { purpose, response } -> { token, account } (a new passkey or a sign-in)
//   GET    /saves/account              the account: its passkeys, its sites' saves (sizes, times)
//   DELETE /saves/account              the account, every site's save and every way in, gone
//   DELETE /saves/passkey/<id>         one passkey (never the last way in)
//   POST   /saves/signout              this session ended
//   POST   /saves/link-code            a sign-in code for another site or device: 8 letters, once, 10 minutes (a
//                                      preview's: previews alone)
//   POST   /saves/link                 { code } -> { token, account }: signed in here as the account that made it
//   GET    /saves/save                 this site's save's parts: version, device, updated, bytes each
//   GET    /saves/save/<part>          a part's gzip (x-save-version, x-save-device, x-save-updated)
//   PUT    /saves/save/<part>          a part's gzip, x-save-base: the version it builds on (0: new) -> { version }
//   DELETE /saves/save                 this site's save, gone (the device keeps its copy)
//   POST   /saves/copy-production      production's save copied over this site's (a preview's, a commit build's)
// Everything but the health takes a page of the game's (ORIGINS) and, but the passkey's, a session: `Authorization:
// Bearer <token>`, a token made at sign-in for that one site (only its digest is kept).
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import * as store from './store.mjs';
import * as passkeys from './passkeys.mjs';
import { cleanUp, forgetPrs, isCommitBuild, prOf } from './cleanup.mjs';

const env = process.env;
/** The game's pages: production and the previews and commit builds. Never localhost (any local app is) or the
 *  github.io address the game moved from (every Pages site of that user is): set ORIGINS to try it locally. */
const ORIGINS = 'https://last-stand.cc,https://www.last-stand.cc,https://pr-*.ls.wellscoped.dev,'
  + 'https://c-*.ls.wellscoped.dev';

/** Origins from a comma-separated list, a `*` standing for one DNS label (the relay's and the traces' rule). */
export function originsFrom(list) {
  const exact = new Set();
  const patterns = [];
  for (const origin of list.split(',').map((s) => s.trim()).filter(Boolean)) {
    if (!origin.includes('*')) {
      exact.add(origin);
      continue;
    }
    const parts = origin.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'));
    patterns.push(new RegExp(`^${parts.join('[a-z0-9-]+')}$`));
  }
  return { has: (origin) => exact.has(origin) || patterns.some((pattern) => pattern.test(origin)) };
}

const list = (text) => String(text).split(',').map((s) => s.trim()).filter(Boolean);

/** The service's settings, from the environment (`start` may give others: its tests'). None is required: each has
 *  a default, and an empty one turns its part off (GITHUB_REPO: the closed PRs' cleanup). */
export function settingsFrom(vars) {
  return {
    port: Number(vars.PORT ?? 8080),
    data: vars.DATA ?? '/data',
    origins: originsFrom(vars.ORIGINS ?? ORIGINS),
    /** production's page: the save a preview copies, and the one site that isn't counted as another */
    production: vars.PRODUCTION ?? 'https://last-stand.cc',
    /** the passkeys' relying parties: a page's is the longest its host is or ends in */
    rpIds: list(vars.RP_IDS ?? 'last-stand.cc,ls.wellscoped.dev,localhost'),
    /** the most a site's save takes, gzipped (about 2 times a full save: src/loot/AGENTS.md) */
    saveMax: Number(vars.SAVE_MAX ?? 16 << 10),
    /** a save's parts at most (a hero each, what they share) */
    partsMax: Number(vars.PARTS_MAX ?? 16),
    /** writes per account and site, spread evenly: so many an hour, in any 10 minutes, in any minute */
    writes: [
      { most: Number(vars.WRITES_PER_HOUR ?? 300), windowMs: 60 * 60_000 },
      { most: Number(vars.WRITES_PER_10_MIN ?? 50), windowMs: 10 * 60_000 },
      { most: Number(vars.WRITES_PER_MINUTE ?? 10), windowMs: 60_000 },
    ],
    /** sites with a save other than production's (previews, commit builds) per account */
    otherSitesMax: Number(vars.OTHER_SITES_MAX ?? 20),
    /** new accounts from one address in any 24 hours */
    accountsPerDay: Number(vars.ACCOUNTS_PER_DAY ?? 10),
    /** passkey options asked for from one address in any hour (signing in, or trying to) */
    asksPerHour: Number(vars.ASKS_PER_HOUR ?? 60),
    sessionDays: Number(vars.SESSION_DAYS ?? 180),
    commitKeepDays: Number(vars.COMMIT_KEEP_DAYS ?? 30),
    /** the repository whose closed PRs' preview saves are dropped (empty: that cleanup is off) */
    githubRepo: vars.GITHUB_REPO ?? 'VictorZakharov/last-stand',
    githubApi: vars.GITHUB_API ?? 'https://api.github.com',
    cleanEvery: Number(vars.CLEAN_EVERY_MS ?? 24 * 60 * 60_000),
  };
}
let settings = settingsFrom(env);

const PART = /^[a-z][a-z0-9.-]{0,31}$/;
/** what a part may unpack to: a gzip that unpacks without end is turned away */
const MAX_UNPACKED = 512 << 10;
/** a session's last use is written down at most this often (not on every request) */
const USED_EVERY = 24 * 60 * 60_000;
/** the first cleanup after a start: soon, as a deploy restarts the service more often than once a day */
const FIRST_CLEAN_MS = 60_000;
const PRUNE_EVERY = 10 * 60_000;

const log = (...a) => console.log(new Date().toISOString(), ...a);

/** `key` -> the times it was counted in its window (writes, accounts, asks) */
const counts = new Map();
/** a sign-in code -> { accountId, until, previewsOnly }: good once, for LINK_MS; one a preview made opens no
 *  production session */
const linkCodes = new Map();
const LINK_MS = 10 * 60_000;
/** a sign-in code's letters: Crockford's base32 (no I, L, O, U), 8 of them (40 bits) */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function newLinkCode() {
  const bytes = randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i++) code += ALPHABET[bytes[i] & 31];
  return code;
}

/** Whether `key` may happen once more in `windowMs` (and counts it if so). */
function allowed(key, most, windowMs, now = Date.now()) {
  const times = (counts.get(key) ?? []).filter((t) => now - t < windowMs);
  counts.set(key, times);
  if (times.length >= most) return false;
  times.push(now);
  return true;
}

/** Whether `key` may happen once more under every one of `limits` ({ most, windowMs }: the longest window first),
 *  and counts it if so. Nothing is counted when any refuses. */
function allowedEach(key, limits, now = Date.now()) {
  const times = (counts.get(key) ?? []).filter((t) => now - t < limits[0].windowMs);
  counts.set(key, times);
  const within = (windowMs) => times.filter((t) => now - t < windowMs).length;
  if (limits.some(({ most, windowMs }) => within(windowMs) >= most)) return false;
  times.push(now);
  return true;
}

/** Drops what nothing counts any more: the counts' empty windows (the longest is a day) and expired codes, so
 *  neither grows with every address that ever asked. */
function prune(now = Date.now()) {
  for (const [key, times] of counts) if (!times.some((t) => now - t < 86_400_000)) counts.delete(key);
  for (const [code, { until }] of linkCodes) if (until <= now) linkCodes.delete(code);
}

/** Whether `site` is production's: the one trusted site. A preview or commit build runs unmerged code, so a session
 *  of theirs may use its own site's save and nothing that reaches past it. */
const trusted = (site) => site === siteOf(settings.production);

/** `text` %-decoded, or null if it is malformed. */
function decoded(text) {
  try { return decodeURIComponent(text); } catch { return null; }
}

/** The site a page's save is filed under: its host (and port), `www.` left off, so production has one. */
export function siteOf(origin) {
  const url = new URL(origin);
  return url.host.replace(/^www\./, '').replace(':', '_');
}

/** The address a request came from, as its limits count it: the proxy's last hop says (Traefik sets it), else the
 *  socket's. An IPv6 address counts by its /64, which one machine holds whole. */
function addressOf(req) {
  const hops = String(req.headers['x-forwarded-for'] ?? '').split(',').map((h) => h.trim()).filter(Boolean);
  const address = hops[hops.length - 1] ?? req.socket.remoteAddress ?? '?';
  if (!address.includes(':') || address.startsWith('::ffff:')) return address;
  return `${address.split(':').slice(0, 4).join(':')}::/64`;
}

function cors(req) {
  const origin = req.headers.origin ?? '';
  if (!settings.origins.has(origin)) return {};
  return {
    'access-control-allow-origin': origin, vary: 'Origin',
    'access-control-expose-headers': 'x-save-version, x-save-device, x-save-updated',
  };
}

function answer(res, status, body, headers = {}) {
  const json = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    'content-type': json ? 'application/json' : Buffer.isBuffer(body) ? 'application/gzip' : 'text/plain',
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers,
  });
  res.end(json ? JSON.stringify(body) : body);
}

/** The body, up to `most` bytes (null past it: the rest is read and dropped, so the answer still reaches the page
 *  rather than a cut connection). */
function bodyOf(req, most) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size <= most) chunks.push(c);
    });
    req.on('end', () => resolve(size > most ? null : Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function jsonOf(req) {
  const body = await bodyOf(req, 64 << 10);
  try { return body ? JSON.parse(body.toString('utf8')) : null; } catch { return null; }
}

/** The account a request's session is of, if its token is one made for this page's site and still in use. */
function sessionOf(req, site, now = Date.now()) {
  const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const account = store.accountOfSession(token);
  const session = account?.sessions.find((s) => s.hash === store.digest(token));
  if (!session || session.site !== site || now - session.used > settings.sessionDays * 86_400_000) return null;
  return { account, session, token };
}

/** Whether this session may add a passkey to its account: on production; on another site only just after a
 *  sign-in code brought it there (the player adding that site's passkey), never later from a preview's code. */
const mayAddPasskey = ({ session }, site, now = Date.now()) =>
  trusted(site) || (session.via === 'code' && now - session.created < LINK_MS);

/** Notes a session's use (written at most once a day): what keeps it from expiring. */
async function touch({ account, session }, now = Date.now()) {
  if (now - session.used < USED_EVERY) return;
  await store.withAccount(account.id, async () => {
    const changed = structuredClone(store.account(account.id));
    const kept = changed?.sessions.find((s) => s.hash === session.hash);
    if (!kept) return;
    kept.used = now;
    await store.keepAccount(changed);
  });
}

/** What the page shows of an account: no keys, no session digests. */
function accountView(account) {
  return {
    id: account.id, created: account.created,
    passkeys: account.passkeys.map(({ id, rpId, created, used }) => ({ id, rpId, created, used })),
    google: false,
    sites: Object.entries(account.sites).map(([site, { updated, bytes }]) => ({ site, updated, bytes })),
  };
}

async function passkeyOptions(req, res, origin, headers) {
  const site = siteOf(origin);
  const rpId = passkeys.rpIdFor(origin, settings.rpIds);
  if (!rpId) return answer(res, 400, 'no passkeys on this site', headers);
  if (!allowed(`ask ${addressOf(req)}`, settings.asksPerHour, 60 * 60_000)) {
    return answer(res, 429, 'too many', headers);
  }
  const body = await jsonOf(req);
  if (body?.purpose === 'login') return answer(res, 200, await passkeys.loginOptions({ origin, rpId }), headers);
  if (body?.purpose !== 'register') return answer(res, 400, 'purpose: register or login', headers);
  // signed in: another passkey for this account; else a new account's first
  const signedIn = sessionOf(req, site);
  if (signedIn && !mayAddPasskey(signedIn, site)) return answer(res, 403, 'add a passkey from last-stand.cc', headers);
  const accountId = signedIn?.account.id ?? store.newId();
  const existing = signedIn?.account.passkeys ?? [];
  return answer(res, 200, await passkeys.registrationOptions({ origin, rpId, accountId, existing }), headers);
}

async function passkeyVerify(req, res, origin, headers) {
  const site = siteOf(origin);
  const body = await jsonOf(req);
  if (body?.purpose === 'register') return register(req, res, origin, site, body.response, headers);
  if (body?.purpose !== 'login') return answer(res, 400, 'purpose: register or login', headers);
  const account = store.accountOfCredential(String(body.response?.id ?? ''));
  const passkey = account?.passkeys.find((p) => p.id === body.response.id);
  if (!passkey) return answer(res, 401, 'no such passkey', headers);
  return store.withAccount(account.id, async () => {
    const changed = structuredClone(store.account(account.id));
    const kept = changed?.passkeys.find((p) => p.id === passkey.id);
    if (!kept || !(await passkeys.verifyLogin(body.response, origin, kept))) {
      return answer(res, 401, 'not signed', headers);
    }
    const token = store.addSession(changed, site);
    await store.keepAccount(changed);
    log('signed in', changed.id.slice(0, 6), site);
    return answer(res, 200, { token, account: accountView(changed) }, headers);
  });
}

/** A sign-in code typed on another site or device (`POST /saves/link { code }`): a session there for the account
 *  that made it. A production passkey can't sign in on a preview (another relying party), so this is how a passkey
 *  player gets there, and then adds a passkey of the preview's. */
async function link(req, res, origin, headers) {
  if (!allowed(`ask ${addressOf(req)}`, settings.asksPerHour, 60 * 60_000)) return answer(res, 429, 'too many', headers);
  const code = String((await jsonOf(req))?.code ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  prune();
  const entry = linkCodes.get(code);
  if (!entry) return answer(res, 401, 'no such code, or it expired', headers);
  if (entry.previewsOnly && trusted(siteOf(origin))) {
    return answer(res, 403, 'a code from a preview signs in on previews alone', headers);
  }
  linkCodes.delete(code);
  const result = await change(entry.accountId, (changed) => ({
    token: store.addSession(changed, siteOf(origin), 'code'), changed,
  }));
  if (result.gone) return answer(res, 401, 'no such code, or it expired', headers);
  log('signed in by code', entry.accountId.slice(0, 6), siteOf(origin));
  return answer(res, 200, { token: result.token, account: accountView(result.changed) }, headers);
}

/** Registrations wait their turn across every account: a credential id is checked to be new and kept as one step. */
const REGISTERING = 'registering';

async function register(req, res, origin, site, response, headers) {
  const made = await passkeys.verifyRegistration(response, origin);
  if (!made) return answer(res, 401, 'not signed', headers);
  const signedIn = sessionOf(req, site);
  const existing = store.account(made.accountId);
  // another passkey goes only to the account signed in on this page; a new account needs a new id
  if (existing && existing.id !== signedIn?.account.id) return answer(res, 403, 'not your account', headers);
  if (existing && !mayAddPasskey(signedIn, site)) return answer(res, 403, 'add a passkey from last-stand.cc', headers);
  if (!existing && !allowed(`account ${addressOf(req)}`, settings.accountsPerDay, 86_400_000)) {
    return answer(res, 429, 'too many new accounts', headers);
  }
  return store.withAccount(REGISTERING, () => store.withAccount(made.accountId, async () => {
    if (store.accountOfCredential(made.passkey.id)) return answer(res, 409, 'that passkey is kept already', headers);
    const kept = store.account(made.accountId);
    // deleted while this passkey was being made: its session is gone with it
    if (existing && !kept) return answer(res, 401, 'signed out', headers);
    const changed = structuredClone(kept) ?? store.freshAccount(made.accountId);
    changed.passkeys.push(made.passkey);
    const token = existing ? signedIn.token : store.addSession(changed, site);
    await store.keepAccount(changed);
    log(existing ? 'passkey added' : 'account made', changed.id.slice(0, 6), made.passkey.rpId);
    return answer(res, existing ? 200 : 201, { token, account: accountView(changed) }, headers);
  }));
}

/** Changes the signed-in account (`change(account)` edits a copy; `false` leaves it as it was). */
function change(id, edit) {
  return store.withAccount(id, async () => {
    const changed = structuredClone(store.account(id));
    if (!changed) return { gone: true };
    const result = await edit(changed);
    if (result !== false) await store.keepAccount(changed);
    return result;
  });
}

async function readPart(res, account, site, part, headers) {
  const save = await store.readSite(account.id, site);
  const kept = save?.parts[part];
  if (!kept) return answer(res, 404, 'no such part', headers);
  return answer(res, 200, Buffer.from(kept.data, 'base64'), {
    ...headers, 'x-save-version': String(kept.version), 'x-save-device': encodeURIComponent(kept.device),
    'x-save-updated': String(kept.updated),
  });
}

/** Whether `body` is a part: gzipped JSON of an object (its size and shape alone: saves are the player's own). */
function isPart(body) {
  try {
    const value = JSON.parse(gunzipSync(body, { maxOutputLength: MAX_UNPACKED }).toString('utf8'));
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  } catch {
    return false;
  }
}

async function writePart(req, res, account, site, part, headers) {
  const base = Number(req.headers['x-save-base']);
  if (!Number.isInteger(base) || base < 0) return answer(res, 400, 'x-save-base: the version it builds on', headers);
  const device = String(req.headers['x-save-device'] ?? '').slice(0, 60);
  if (Number(req.headers['content-length'] ?? 0) > settings.saveMax) {
    return answer(res, 413, `a save takes ${settings.saveMax} bytes at most`, { ...headers, connection: 'close' });
  }
  const body = await bodyOf(req, settings.saveMax);
  if (!body) return answer(res, 413, `a save takes ${settings.saveMax} bytes at most`, headers);
  if (!isPart(body)) return answer(res, 400, 'not a part: gzipped JSON of an object', headers);
  return store.withAccount(account.id, async () => {
    const changed = structuredClone(store.account(account.id));
    if (!changed) return answer(res, 401, 'signed out', headers);
    const isNew = !changed.sites[site];
    const others = Object.keys(changed.sites).filter((s) => s !== siteOf(settings.production)).length;
    if (isNew && site !== siteOf(settings.production) && others >= settings.otherSitesMax) {
      return answer(res, 507, `${settings.otherSitesMax} preview saves at most: delete one`, headers);
    }
    const save = (await store.readSite(changed.id, site)) ?? { site, parts: {} };
    const kept = save.parts[part];
    const version = kept?.version ?? 0;
    if (base !== version) {
      return answer(res, 409, { version, device: kept?.device ?? '', updated: kept?.updated ?? 0 }, headers);
    }
    if (!kept && Object.keys(save.parts).length >= settings.partsMax) {
      return answer(res, 413, `${settings.partsMax} parts at most`, headers);
    }
    const now = Date.now();
    save.parts[part] = { version: version + 1, device, updated: now, data: body.toString('base64') };
    if (store.bytesOf(save) > settings.saveMax) {
      return answer(res, 413, `a save takes ${settings.saveMax} bytes at most`, headers);
    }
    if (!allowedEach(`write ${changed.id} ${site}`, settings.writes)) {
      return answer(res, 429, 'too many writes', headers);
    }
    await store.keepSite(changed, site, save, now);
    await store.keepAccount(changed);
    return answer(res, 200, { version: version + 1, updated: now }, headers);
  });
}

/** Production's save copied over this site's: each part's version moves past this site's own, so a device that
 *  had this site's older copy is told it changed (409), never writes over it unseen. */
async function copyProduction(res, account, site, headers) {
  const production = siteOf(settings.production);
  if (site === production) return answer(res, 400, 'this is production', headers);
  const result = await change(account.id, async (changed) => {
    const from = await store.readSite(changed.id, production);
    if (!from) return { status: 404, body: 'no production save' };
    const here = (await store.readSite(changed.id, site)) ?? { site, parts: {} };
    const isNew = !changed.sites[site];
    const others = Object.keys(changed.sites).filter((s) => s !== production).length;
    if (isNew && others >= settings.otherSitesMax) {
      return { status: 507, body: `${settings.otherSitesMax} preview saves at most: delete one` };
    }
    const now = Date.now();
    const parts = {};
    const names = new Set([...Object.keys(from.parts), ...Object.keys(here.parts)]);
    for (const name of names) {
      const source = from.parts[name];
      if (!source) continue; // a part production hasn't: dropped, as the copy is production's whole
      parts[name] = { ...source, version: Math.max(here.parts[name]?.version ?? 0, source.version) + 1, updated: now };
    }
    await store.keepSite(changed, site, { site, parts }, now);
    return { status: 200, body: { parts: Object.keys(parts).length } };
  });
  if (result.gone) return answer(res, 401, 'signed out', headers);
  return answer(res, result.status, result.body, headers);
}

async function siteSave(req, res, signedIn, site, headers) {
  const { account } = signedIn;
  const path = new URL(req.url ?? '/', 'http://x').pathname.replace(/\/+$/, '');
  const part = path.startsWith('/saves/save/') ? decoded(path.slice('/saves/save/'.length)) ?? '' : null;
  if (part !== null && !PART.test(part)) return answer(res, 400, 'not a part name', headers);
  if (req.method === 'GET' && part) return readPart(res, account, site, part, headers);
  if (req.method === 'PUT' && part) return writePart(req, res, account, site, part, headers);
  if (req.method === 'GET') {
    const save = await store.readSite(account.id, site);
    const parts = {};
    for (const [name, kept] of Object.entries(save?.parts ?? {})) {
      parts[name] = { version: kept.version, device: kept.device, updated: kept.updated,
        bytes: Buffer.from(kept.data, 'base64').length };
    }
    return answer(res, 200, { site, updated: account.sites[site]?.updated ?? 0, parts }, headers);
  }
  if (req.method === 'DELETE' && !part) {
    await change(account.id, (changed) => store.dropSite(changed, site));
    log('save deleted', account.id.slice(0, 6), site);
    return answer(res, 204, '', headers);
  }
  return answer(res, 405, 'not that', headers);
}

async function signedInRequest(req, res, path, origin, headers) {
  const site = siteOf(origin);
  const signedIn = sessionOf(req, site);
  if (!signedIn) return answer(res, 401, 'sign in', headers);
  await touch(signedIn);
  const { account } = signedIn;
  if (path === '/saves/save' || path.startsWith('/saves/save/')) return siteSave(req, res, signedIn, site, headers);
  if (path === '/saves/copy-production' && req.method === 'POST') return copyProduction(res, account, site, headers);
  if (path === '/saves/account' && req.method === 'GET') return answer(res, 200, accountView(account), headers);
  if (path === '/saves/signout' && req.method === 'POST') {
    await change(account.id, (changed) => {
      changed.sessions = changed.sessions.filter((s) => s.hash !== signedIn.session.hash);
    });
    return answer(res, 204, '', headers);
  }
  if (path === '/saves/link-code' && req.method === 'POST') {
    // one code an account at a time: a new one replaces the last. A preview's opens previews alone: its session
    // may be a token its unmerged code sent anywhere, and it must never reach production through a code
    for (const [old, entry] of linkCodes) if (entry.accountId === account.id) linkCodes.delete(old);
    const code = newLinkCode();
    linkCodes.set(code, { accountId: account.id, until: Date.now() + LINK_MS, previewsOnly: !trusted(site) });
    return answer(res, 200, { code, until: Date.now() + LINK_MS, previewsOnly: !trusted(site) }, headers);
  }
  // past here, what reaches beyond this site's own save: production's sessions alone (a preview's code may have
  // sent its token anywhere)
  const reachesPast = path === '/saves/account' || path.startsWith('/saves/passkey/');
  if (reachesPast && !trusted(site)) return answer(res, 403, 'only from last-stand.cc', headers);
  if (path === '/saves/account' && req.method === 'DELETE') {
    await store.withAccount(account.id, () => store.dropAccount(account.id));
    log('account deleted', account.id.slice(0, 6));
    return answer(res, 204, '', headers);
  }
  if (path.startsWith('/saves/passkey/') && req.method === 'DELETE') {
    const id = decoded(path.slice('/saves/passkey/'.length));
    if (id === null) return answer(res, 400, 'not a passkey id', headers);
    const result = await change(account.id, (changed) => {
      if (!changed.passkeys.some((p) => p.id === id)) return 404;
      // never the last way in (Google, #503, will count as one)
      if (changed.passkeys.length <= 1) return 409;
      changed.passkeys = changed.passkeys.filter((p) => p.id !== id);
      return 204;
    });
    const statuses = { 404: [404, 'no such passkey'], 409: [409, 'the last way in: delete the account instead'] };
    const [status, body] = statuses[result] ?? [204, ''];
    return answer(res, status, body, headers);
  }
  return answer(res, 404, 'not here', headers);
}

async function handle(req, res) {
  const path = new URL(req.url ?? '/', 'http://x').pathname.replace(/\/+$/, '');
  const headers = cors(req);
  if (path === '/saves/health') {
    return answer(res, 200, { ok: true, passkeys: true, google: false, cleanup: Boolean(settings.githubRepo) }, headers);
  }
  if (!path.startsWith('/saves')) return answer(res, 404, 'not here');
  const origin = req.headers.origin ?? '';
  if (!settings.origins.has(origin)) return answer(res, 403, 'not from the game');
  if (req.method === 'OPTIONS') {
    return answer(res, 204, '', {
      ...headers, 'access-control-allow-methods': 'GET, PUT, POST, DELETE',
      'access-control-allow-headers': 'authorization, content-type, x-save-base, x-save-device',
      'access-control-max-age': '86400',
    });
  }
  if (path === '/saves/passkey/options' && req.method === 'POST') return passkeyOptions(req, res, origin, headers);
  if (path === '/saves/passkey/verify' && req.method === 'POST') return passkeyVerify(req, res, origin, headers);
  if (path === '/saves/link' && req.method === 'POST') return link(req, res, origin, headers);
  return signedInRequest(req, res, path, origin, headers);
}

async function runCleanUp() {
  try {
    const dropped = await cleanUp(settings);
    if (dropped.sites || dropped.sessions) log('cleaned up', dropped);
  } catch (e) {
    log('cleanup failed', e);
  }
}

/** The service on `port` (0: any; its PORT by default), `overrides` over the environment's settings (`DATA`,
 *  `ORIGINS`... as named there); resolves to its server once it listens. */
export async function start(port, overrides = {}) {
  settings = settingsFrom({ ...env, ...overrides });
  counts.clear();
  linkCodes.clear();
  passkeys.clearChallenges();
  forgetPrs();
  const kept = await store.load(settings.data);
  const http = createServer((req, res) => {
    handle(req, res).catch((e) => { log('error', e); if (!res.headersSent) answer(res, 500, 'error'); else res.end(); });
  });
  http.requestTimeout = 30_000;
  const timer = setInterval(() => void runCleanUp(), settings.cleanEvery);
  const first = setTimeout(() => void runCleanUp(), FIRST_CLEAN_MS);
  const pruner = setInterval(() => prune(), PRUNE_EVERY);
  for (const t of [timer, first, pruner]) t.unref();
  http.on('close', () => { clearInterval(timer); clearTimeout(first); clearInterval(pruner); });
  await new Promise((resolve) => http.listen(port ?? settings.port, resolve));
  log(`saves on :${http.address().port}, ${kept} accounts, closed PRs' cleanup ${settings.githubRepo ? 'on' : 'off'}`);
  return http;
}

export { cleanUp, prOf, isCommitBuild };
