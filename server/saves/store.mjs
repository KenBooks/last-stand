// What the saves service keeps (server/saves/AGENTS.md), as files on its volume: an account a file of its own
// (`accounts/<id>.json`: its passkeys, Google's ids by site, its sessions' digests, which sites have a save),
// and each site's save a file (`saves/<id>/<site>.json`: its parts, each gzipped JSON with a version). Every file is written whole to a temporary
// name and renamed over the old, so a crash never leaves half a save. The accounts are read into memory at a start
// (they're small: a passkey is a public key); the saves are read when asked for.
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { join } from 'node:path';

/** id -> account */
const accounts = new Map();
/** a passkey's credential id -> its account's id */
const byCredential = new Map();
/** a site's Google id -> its account's id */
const byGoogle = new Map();
/** a session token's digest -> its account's id */
const bySession = new Map();
/** id -> the promise its last change resolves to (each account's changes wait their turn) */
const queues = new Map();
let root = '/data';

const accountFile = (id) => join(root, 'accounts', `${id}.json`);
const savesDir = (id) => join(root, 'saves', id);
const siteFile = (id, site) => join(savesDir(id), `${site}.json`);

export const newId = () => randomBytes(16).toString('base64url');
export const digest = (token) => createHash('sha256').update(token).digest('base64url');

/** Writes `value` as JSON to `file` whole: a temporary file renamed over it. */
async function writeWhole(file, value) {
  const temporary = `${file}.${randomBytes(4).toString('hex')}.tmp`;
  await writeFile(temporary, JSON.stringify(value));
  await rename(temporary, file);
}

function indexAccount(account) {
  for (const passkey of account.passkeys) byCredential.set(passkey.id, account.id);
  for (const session of account.sessions) bySession.set(session.hash, account.id);
  for (const [site, { sub }] of Object.entries(account.googles ?? {})) byGoogle.set(googleKey(site, sub), account.id);
}

function unindexAccount(account) {
  for (const passkey of account.passkeys) byCredential.delete(passkey.id);
  for (const session of account.sessions) bySession.delete(session.hash);
  for (const [site, { sub }] of Object.entries(account.googles ?? {})) byGoogle.delete(googleKey(site, sub));
}

const googleKey = (site, sub) => `${site}\0${sub}`;
/** Old accounts had a site-free Google binding. Its first Google session identifies where it was made. */
const legacyGoogleSite = (account) => account.google?.site
  ?? account.sessions.find((session) => session.via === 'google')?.site
  ?? 'last-stand.cc';

/** Reads every account kept under `data` (a start). */
export async function load(data) {
  root = data;
  accounts.clear();
  byCredential.clear();
  bySession.clear();
  byGoogle.clear();
  queues.clear();
  await mkdir(join(root, 'accounts'), { recursive: true });
  await mkdir(join(root, 'saves'), { recursive: true });
  for (const name of await readdir(join(root, 'accounts'))) {
    if (!name.endsWith('.json')) continue;
    let account;
    try { account = JSON.parse(await readFile(join(root, 'accounts', name), 'utf8')); }
    catch { continue; /* a temporary file left by a crash: ignored */ }
    if (account.google) {
      const site = legacyGoogleSite(account);
      account.googles ??= {};
      account.googles[site] = account.google;
      delete account.google;
      await writeWhole(accountFile(account.id), account);
    }
    accounts.set(account.id, account);
    indexAccount(account);
  }
  return accounts.size;
}

/** Runs `change` once every change to the account `id` before it is done: a check and the write it allows are
 *  never split by another request's. */
export function withAccount(id, change) {
  const before = queues.get(id) ?? Promise.resolve();
  const after = before.then(change, change);
  queues.set(id, after.catch(() => {}));
  return after;
}

export const account = (id) => accounts.get(id) ?? null;
export const accountOfCredential = (credentialId) => account(byCredential.get(credentialId));
export const accountOfGoogle = (site, sub) => account(byGoogle.get(googleKey(site, sub)));
export const accountOfSession = (token) => account(bySession.get(digest(token)));
export const allAccounts = () => [...accounts.values()];
/** Where the accounts and saves are kept (a backup's snapshot reads it). */
export const dataRoot = () => root;

/** A new account, with nothing in it yet (kept by `keepAccount`). */
export function freshAccount(id = newId(), now = Date.now()) {
  return { id, created: now, passkeys: [], sessions: [], sites: {}, googles: {} };
}

/** Writes the account and indexes it again (its passkeys and sessions may have changed). */
export async function keepAccount(changed) {
  const old = accounts.get(changed.id);
  if (old) unindexAccount(old);
  accounts.set(changed.id, changed);
  indexAccount(changed);
  await writeWhole(accountFile(changed.id), changed);
}

/** Drops the account, its sessions, its passkeys and every save it has. */
export async function dropAccount(id) {
  const old = accounts.get(id);
  if (!old) return;
  unindexAccount(old);
  accounts.delete(id);
  await rm(accountFile(id), { force: true });
  await rm(savesDir(id), { recursive: true, force: true });
}

/** A new session for the account, made from `site` by `via` (a passkey, a sign-in code, Google): its token (given once;
 *  only its digest is kept). */
export function addSession(changed, site, via = 'passkey', now = Date.now()) {
  const token = randomBytes(32).toString('base64url');
  changed.sessions.push({ hash: digest(token), site, via, created: now, used: now });
  return token;
}

/** The site's save as kept (`{ parts: { name: { version, device, updated, data } } }`), or null. */
export async function readSite(id, site) {
  try {
    return JSON.parse(await readFile(siteFile(id, site), 'utf8'));
  } catch {
    return null;
  }
}

/** Keeps the site's save and notes its size and time on the account (written by the caller). */
export async function keepSite(changed, site, save, now = Date.now()) {
  await mkdir(savesDir(changed.id), { recursive: true });
  await writeWhole(siteFile(changed.id, site), save);
  changed.sites[site] = { updated: now, bytes: bytesOf(save) };
}

/** Drops the site's save (the account is written by the caller). */
export async function dropSite(changed, site) {
  delete changed.sites[site];
  await rm(siteFile(changed.id, site), { force: true });
}

/** A save's size as it counts against its cap: its parts' gzipped bytes. */
export function bytesOf(save) {
  let bytes = 0;
  for (const part of Object.values(save.parts)) bytes += Buffer.from(part.data, 'base64').length;
  return bytes;
}
