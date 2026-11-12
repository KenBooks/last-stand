// Cloud saves on this device (#504; the service is server/saves): who is signed in, whether slot 1 is the cloud
// save here, and the sync. The cloud save is slot 1 (#382): its heroes go up as parts, a hero each (`hero.<class>`:
// his entries, `slotData.ts`) and what they share (`shared`: the class last played, the co-op name tag and colour,
// the volumes, the portraits). Each part's last synced copy is kept here (`base`), so a change on either side is
// told by its content, never by a flag only this build sets (an older build, cached, writes slot 1 too):
//   changed here only -> uploaded over the version it came from;
//   changed in the cloud only -> downloaded (in the lobby: a run's hero is never swapped under the player);
//   changed on both -> a hero's is the player's choice (`conflicts`), never merged, never picked; `shared` takes
//   the cloud's (settings, not progress).
// Offline, slot 1 plays as a local save and syncs once the server answers again.
import { CLASS_IDS } from '../data/classes/index';
import { readCookie, writeCookie } from '../core/cookies';
import * as api from './cloudApi';
import { CLASS_ENTRY, readHero, writeHero, readSlot, rearrangeSlots, slotEmpty, type Entries } from './slotData';
import { SAVE_SLOTS, setSaveSlot } from './saveSlots';
import { openGoogleWindow, type GoogleReply } from './googleWindow';

const KEY = 'last-stand.cloud.v1';
const HERO = 'hero.';
const SHARED = 'shared';
/** what `shared` carries: the device's own settings worth having everywhere (not quality: a phone's isn't a PC's) */
const SHARED_ENTRIES: { name: string; cookie: boolean }[] = [
  { name: CLASS_ENTRY, cookie: true },
  { name: 'last-stand.name.v1', cookie: false },
  { name: 'last-stand.colour.v1', cookie: false },
  { name: 'last-stand-volume', cookie: true },
  ...CLASS_IDS.map((id) => ({ name: `last-stand.portrait.${id}.v1`, cookie: false })),
];
/** a sync after a save waits this long for more (a bank saves several times) */
const SETTLE_MS = 3_000;
/** a quiet check this often while the page is in view and signed in */
const CHECK_MS = 60_000;

interface Kept {
  token: string;
  accountId: string;
  /** slot 1 is the cloud save on this device (chosen at the first sign-in) */
  linked: boolean;
  /** each part as last synced: its version and content */
  base: Record<string, { version: number; value: Entries }>;
  lastSync: number;
  /** when this device signed in by a sign-in code: a preview may add its passkey only just after */
  byCodeAt?: number;
  /** Google is linked to the account, as the service last said */
  google?: boolean;
  passkey?: boolean;
  session?: api.CloudAccount['session'];
}

/** One hero changed both here and in the cloud since they last agreed: the player keeps one. */
export interface Conflict {
  classId: string;
  here: Entries;
  cloud: Entries;
  /** the copy both came from (to say how far each moved on) */
  base: Entries;
  cloudVersion: number;
  cloudDevice: string;
  cloudUpdated: number;
}

export type Status = 'signedOut' | 'unlinked' | 'syncing' | 'synced' | 'offline' | 'error';

export interface CloudHooks {
  /** slot 1 was changed under the game (a download): the hero in play is built again if it's slot 1's */
  reloaded(): void;
  /** whether a download may be applied now (the lobby, not a run) */
  canApply(): boolean;
  /** heroes changed on both sides: the player chooses (the save slots screen asks) */
  conflicted(conflicts: Conflict[]): void;
  /** anything shown changed (status, account) */
  changed(): void;
}

let kept: Kept | null = load();
let hooks: CloudHooks | null = null;
let status: Status = kept ? (kept.linked ? 'synced' : 'unlinked') : 'signedOut';
let message = '';
let timer = 0;
let running: Promise<void> | null = null;
let again = false;
let pending: Conflict[] = [];

function load(): Kept | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Kept | null;
    if (value?.token) { api.setToken(value.token); return value; }
  } catch { /* none, or corrupt: signed out */ }
  return null;
}

function keep(): void {
  try {
    if (kept) localStorage.setItem(KEY, JSON.stringify(kept));
    else localStorage.removeItem(KEY);
  } catch { /* storage full: signed in for this visit alone */ }
}

const setStatus = (s: Status, text = ''): void => { status = s; message = text; hooks?.changed(); };

export const cloudStatus = (): { status: Status; message: string; accountId: string; lastSync: number } =>
  ({ status, message, accountId: kept?.accountId ?? '', lastSync: kept?.lastSync ?? 0 });
export const signedIn = (): boolean => kept !== null;
export const linked = (): boolean => !!kept?.linked;
export const cloudIdentity = (): Pick<Kept, 'google' | 'passkey' | 'session'> =>
  ({ google: kept?.google, passkey: kept?.passkey, session: kept?.session });
export const pendingConflicts = (): Conflict[] => pending;

/** This device as the cloud names its writes: its system and browser. */
export function deviceName(): string {
  const ua = navigator.userAgent;
  const system = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'Mac'
    : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari' : 'browser';
  const app = matchMedia('(display-mode: standalone)').matches ? ' (app)' : '';
  return `${system} · ${browser}${app}`;
}

// --- parts: slot 1's content as the cloud keeps it ---------------------------------------------------------
const canon = (value: Entries): string => JSON.stringify(Object.keys(value).sort().map((k) => [k, value[k]]));

function readShared(): Entries {
  const out: Entries = {};
  for (const { name, cookie } of SHARED_ENTRIES) {
    let value: string | null = null;
    try { value = cookie ? readCookie(name) : localStorage.getItem(name); } catch { /* unavailable */ }
    if (value !== null) out[name] = value;
  }
  return out;
}

function writeShared(entries: Entries): void {
  for (const { name, cookie } of SHARED_ENTRIES) {
    const value = entries[name] ?? null;
    // a setting the cloud hasn't stays as this device has it
    if (value === null) continue;
    try {
      if (cookie) writeCookie(name, value);
      else localStorage.setItem(name, value);
    } catch { /* unavailable */ }
  }
}

const partOf = (classId: string): string => HERO + classId;
const localPart = (name: string): Entries => (name === SHARED ? readShared() : readHero(name.slice(HERO.length), 1));

function applyPart(name: string, value: Entries): void {
  if (name === SHARED) writeShared(value);
  else writeHero(name.slice(HERO.length), 1, value);
}

const partNames = (): string[] => [...CLASS_IDS.map(partOf), SHARED];

// --- signing in and out ----------------------------------------------------------------------------------
function signedInAs(result: api.SignedIn): void {
  api.setToken(result.token);
  kept = { token: result.token, accountId: result.account.id, linked: false, base: {}, lastSync: 0,
    google: result.account.google, passkey: result.account.passkeys.length > 0, session: result.account.session };
  keep();
  setStatus('unlinked');
}

export async function signUpWithPasskey(): Promise<void> { signedInAs(await api.makePasskey()); }
export async function signInWithPasskey(): Promise<void> { signedInAs(await api.usePasskey()); }
export async function signInWithCode(code: string): Promise<void> {
  signedInAs(await api.signInWithCode(code));
  if (kept) { kept.byCodeAt = Date.now(); keep(); }
}

// --- Google (#503): the page goes to Google and comes home with a code in its address's fragment ----------------
/** How a return from Google went: signed in, Google linked, or why not (the service's reason). */
export type GoogleLanding = { kind: 'signedIn' } | { kind: 'linked' }
  | { kind: 'move'; offer: api.GoogleMoveOffer } | { kind: 'error'; reason: string };

/** Whether the service signs in with Google (its health says; asked once a visit). */
export const googleOn = async (): Promise<boolean> => (await api.serviceHealth()).google;
/** Whether Google is linked to the signed-in account. */
export const hasGoogle = (): boolean => Boolean(kept?.google);

/** Keeps the game loaded while Google opens separately; a blocked window uses the existing redirect flow. */
export async function goToGoogle(purpose: 'signin' | 'link', signal: AbortSignal, redirect = false,
  opened?: (focus: () => void) => void): Promise<GoogleLanding | null> {
  const nonce = randomNonce();
  const state = kept;
  const popup = redirect ? null : openGoogleWindow(signal);
  if (popup) opened?.(popup.focus);
  try {
    const { url } = await api.googleAddress(purpose, nonce, popup?.returnPath, signal);
    if (signal.aborted || kept !== state) return null;
    if (!popup) {
      // Refuse before navigating if the nonce cannot survive the redirect.
      sessionStorage.setItem(GOOGLE_NONCE, nonce);
      location.assign(url);
      return null;
    }
    popup.navigate(url);
    const reply = await popup.result;
    if (!reply || signal.aborted || kept !== state) return null;
    return await finishGoogle(reply, nonce, () => !signal.aborted && kept === state, signal);
  } catch (error) {
    if (signal.aborted || kept !== state) return null;
    throw error;
  } finally {
    popup?.close();
  }
}

export async function unlinkGoogle(): Promise<void> {
  const state = kept;
  await api.unlinkGoogle();
  if (state && kept === state) { state.google = false; keep(); }
}
export async function moveGoogle(code: string): Promise<void> {
  const state = kept;
  const result = await api.moveGoogle(code);
  if (state && kept === state) { state.google = result.account.google; keep(); }
}

/** where this tab keeps the nonce its Google sign-in is bound to, until it comes home */
const GOOGLE_NONCE = 'last-stand.cloud.google-nonce';
const randomNonce = (): string => [...crypto.getRandomValues(new Uint8Array(24))]
  .map((byte) => byte.toString(16).padStart(2, '0')).join('');

/** This tab's nonce, taken (good once). */
function takeNonce(): string {
  try {
    const nonce = sessionStorage.getItem(GOOGLE_NONCE) ?? '';
    sessionStorage.removeItem(GOOGLE_NONCE);
    return nonce;
  } catch {
    return '';
  }
}

/** The page's return from Google, if this load is one: the fragment the service sent it home with taken off the
 *  address (a reload or a shared link never repeats it), its code traded for a session. */
async function landFromGoogle(): Promise<GoogleLanding | null> {
  const fragment = new URLSearchParams(location.hash.slice(1));
  const code = fragment.get('cloud-google');
  const error = fragment.get('cloud-google-error');
  if (!code && !error) return null;
  history.replaceState(history.state, '', `${location.pathname}${location.search}`);
  const nonce = takeNonce();
  return finishGoogle({ code: code ?? undefined, error: error ?? undefined }, nonce);
}

/** The nonce and current session stay in the initiating game, including while the other window is open. */
async function finishGoogle(reply: GoogleReply, nonce: string, current = (): boolean => true, signal?: AbortSignal): Promise<GoogleLanding | null> {
  if (reply.error) return { kind: 'error', reason: reply.error };
  try {
    // (a code this tab never asked for, a link someone sent, has no nonce here: refused, as expired; a link is
    // finished with this device's own production session, which the service checks began it)
    const finished = await api.googleFinish(reply.code!, nonce, signal);
    if (!current()) return null;
    if ('token' in finished) {
      signedInAs(finished);
      return { kind: 'signedIn' };
    }
    if ('move' in finished) return { kind: 'move', offer: finished.move };
    if (kept) { kept.google = true; keep(); }
    return { kind: 'linked' };
  } catch (e) {
    if (!current()) return null;
    return { kind: 'error', reason: landingFailure(e) };
  }
}

/** Why a finish failed, as the screen names it: the service's reason (`taken`, `other`, `signed-out`, `too-many`),
 *  offline, or expired (an unknown or used code, another tab's). */
function landingFailure(e: unknown): string {
  if (!(e instanceof api.CloudError)) return 'expired';
  if (e.status === 0) return 'offline';
  return ['taken', 'other', 'signed-out', 'too-many'].includes(e.message) ? e.message : 'expired';
}

/** This load's return from Google, if it was one (traded as the game boots, shown once the lobby is). */
let landing: Promise<GoogleLanding | null> = Promise.resolve(null);
export const googleLanding = (): Promise<GoogleLanding | null> => landing;

/** Whether the server lets this session add a passkey off production: in its first 10 minutes, made by a code. */
export const passkeyWindow = (): boolean => Boolean(kept?.byCodeAt && Date.now() - kept.byCodeAt < 10 * 60_000);

/** Signed out on this device: slot 1 stays here as a local save. */
export async function signOut(): Promise<void> {
  try { await api.signOut(); } catch { /* offline: the session expires on its own */ }
  forget();
}

function forget(): void {
  kept = null;
  pending = [];
  api.setToken('');
  keep();
  setStatus('signedOut');
}

/** The server's account (its passkeys, its sites' saves). */
export async function fetchAccount(): Promise<api.CloudAccount> {
  const state = kept;
  const account = await api.account();
  rememberAccount(state, account);
  return account;
}

function rememberAccount(state: Kept | null, account: api.CloudAccount): void {
  if (state && kept === state && account.id === state.accountId) {
    const before = JSON.stringify(cloudIdentity());
    state.google = account.google;
    state.passkey = account.passkeys.length > 0;
    state.session = account.session;
    keep();
    if (before !== JSON.stringify(cloudIdentity())) hooks?.changed();
  }
}
/** Refresh when Save Slots opens as well as at boot; offline keeps the last confirmed identity. */
export const refreshAccount = (): void => { if (kept) void fetchAccount().catch(() => { /* sync handles expiry */ }); };
export const makeLinkCode = (): Promise<{ code: string; until: number; previewsOnly?: boolean }> => api.linkCode();
export async function addPasskey(): Promise<void> {
  const state = kept;
  const result = await api.makePasskey();
  rememberAccount(state, result.account);
}

/** The account and every save of it, gone from the server: this device keeps its slots. */
export async function deleteAccount(): Promise<void> {
  await api.deleteAccount();
  forget();
}

/** This site's cloud save, gone from the server: slot 1 stays here, and the account too. */
export async function deleteCloudSave(): Promise<void> {
  await api.deleteSave();
  if (kept) { kept.linked = false; kept.base = {}; keep(); }
  setStatus('unlinked');
}

/** Production's heroes copied into this preview's cloud save, then down into slot 1. */
export const makeCopyCode = (): Promise<{ code: string; until: number }> => api.copyCode();
export async function copyProduction(code: string): Promise<void> {
  const state = kept;
  if (!state?.linked) return;
  clearTimeout(timer);
  if (running) await running;
  await api.copyProduction(code);
  // Copy is an explicit replacement, so take every part from production rather than raising sync conflicts.
  const { parts } = await api.listParts();
  const base: Kept['base'] = {};
  const values: { name: string; value: Entries }[] = [];
  for (const name of partNames()) {
    const theirs = parts[name] ? await api.readPart(name) : null;
    const value = (theirs?.value ?? {}) as Entries;
    values.push({ name, value });
    if (theirs) base[name] = { version: theirs.version, value };
  }
  if (kept !== state) throw new Error('The preview account changed during the copy. Sign in again to sync it.');
  for (const { name, value } of values) applyPart(name, value);
  state.base = base;
  state.lastSync = Date.now();
  keep();
  hooks?.reloaded();
  setStatus('synced');
}

// --- the first sign-in on this device: which slot is the cloud save -------------------------------------------
/** What the first sign-in will do: the cloud's save (if any) and the local slots' state. */
export async function linkPlan(): Promise<{ cloudHeroes: string[]; filled: number[] }> {
  const { parts } = await api.listParts();
  const cloudHeroes = CLASS_IDS.filter((id) => parts[partOf(id)]);
  return { cloudHeroes, filled: SAVE_SLOTS.filter((n) => !slotEmpty(n)) };
}

/** Where each local slot goes when the cloud's save comes down into slot 1: `order` for `rearrangeSlots` (filled
 *  slots keep their order after it; one is pushed out if all three are filled), and the one pushed out (0: none). */
export function downloadOrder(): { order: number[]; lost: number } {
  const filled = SAVE_SLOTS.filter((n) => !slotEmpty(n));
  const after = filled.slice(0, SAVE_SLOTS.length - 1);
  return { order: [0, ...after, ...Array(SAVE_SLOTS.length - 1 - after.length).fill(0)], lost: filled[SAVE_SLOTS.length - 1] ?? 0 };
}

/** Where each local slot goes when `chosen` becomes the cloud save: it to slot 1, the others after it in order. */
export const uploadOrder = (chosen: number): number[] => [chosen, ...SAVE_SLOTS.filter((n) => n !== chosen)];

/** Slot `chosen`'s heroes become the cloud save (moved to slot 1), the account having none. Slot 1 is played
 *  from then on (its hero built again by the caller, saves.ts `moveSlots`). */
export async function linkByUpload(chosen: number): Promise<void> {
  if (!kept) return;
  moveTo(uploadOrder(chosen));
  await syncNow();
}

/** The account's cloud save comes down into slot 1, the local slots shifted after it (`downloadOrder`), and slot 1
 *  is played from then on. */
export async function linkByDownload(): Promise<void> {
  if (!kept) return;
  moveTo(downloadOrder().order);
  await syncNow();
}

/** The slots rearranged and slot 1 the cloud save, played at once: the slot number changes with the slots, so a
 *  save of the hero in memory never lands on the slot his save just left. */
function moveTo(order: number[]): void {
  if (!kept) return;
  rearrangeSlots(order);
  setSaveSlot(1);
  kept.linked = true;
  kept.base = {};
  keep();
}

// --- the sync ---------------------------------------------------------------------------------------------
/** Syncs soon (a save was just written: more may follow). */
export function cloudTouched(): void {
  if (!kept?.linked) return;
  clearTimeout(timer);
  timer = window.setTimeout(() => void syncNow(), SETTLE_MS);
}

/** Syncs now (one at a time: asked again meanwhile, it runs once more after). */
export function syncNow(): Promise<void> {
  if (running) { again = true; return running; }
  running = sync().finally(() => {
    running = null;
    if (again) { again = false; void syncNow(); }
  });
  return running;
}

async function sync(): Promise<void> {
  if (!kept?.linked) return;
  setStatus('syncing');
  try {
    await syncParts(kept);
    kept.lastSync = Date.now();
    keep();
    setStatus('synced');
  } catch (e) {
    const error = e as api.CloudError;
    if (error.status === 401) {
      forget();
      setStatus('signedOut', 'Signed out: the session ended. Sign in again to sync.');
    } else if (error.status === 0) setStatus('offline', 'Offline: slot 1 plays as a local save and syncs when the server answers.');
    else setStatus('error', error.message);
  }
}

async function syncParts(state: Kept): Promise<void> {
  const { parts: remote } = await api.listParts();
  // the cloud save deleted from another device: slot 1 stays here as a local save
  if (Object.keys(state.base).length && !Object.keys(remote).length) {
    state.linked = false;
    state.base = {};
    setStatus('unlinked', 'The cloud save was deleted from another device: slot 1 stays here as a local save.');
    return;
  }
  const device = deviceName();
  const conflicts: Conflict[] = [];
  let downloaded = false;
  for (const name of partNames()) {
    const here = localPart(name);
    const base = state.base[name];
    const cloud = remote[name];
    const changedHere = canon(here) !== canon(base?.value ?? {});
    const changedThere = (cloud?.version ?? 0) !== (base?.version ?? 0);
    if (!changedHere && !changedThere) continue;
    if (changedHere && !changedThere) {
      if (!Object.keys(here).length && !cloud) continue;
      try {
        state.base[name] = { version: await api.writePart(name, here, base?.version ?? 0, device), value: here };
        continue;
      } catch (e) {
        if ((e as api.CloudError).status !== 409) throw e;
        // written meanwhile from another device: as if both changed
      }
    }
    const theirs = await api.readPart(name);
    const cloudValue = theirs.value as Entries;
    if (!changedHere || canon(here) === canon(cloudValue)) {
      if (changedHere || hooks?.canApply() !== false) {
        if (canon(here) !== canon(cloudValue)) { applyPart(name, cloudValue); downloaded = true; }
        state.base[name] = { version: theirs.version, value: cloudValue };
      }
      continue;
    }
    if (name === SHARED) {
      applyPart(name, cloudValue);
      state.base[name] = { version: theirs.version, value: cloudValue };
      downloaded = true;
      continue;
    }
    conflicts.push({ classId: name.slice(HERO.length), here, cloud: cloudValue, base: base?.value ?? {},
      cloudVersion: theirs.version, cloudDevice: theirs.device, cloudUpdated: theirs.updated });
  }
  if (downloaded) hooks?.reloaded();
  pending = conflicts;
  if (conflicts.length) hooks?.conflicted(conflicts);
}

/** A free slot (2 or 3, empty) for the copy not kept, or 0. */
export const freeSlot = (): number => SAVE_SLOTS.find((n) => n !== 1 && slotEmpty(n)) ?? 0;

/** The player's choice for one hero changed on both sides: `keep` 'here' uploads this device's over the cloud's,
 *  'cloud' takes the cloud's. The copy not kept goes to a free slot when there is one (`freeSlot`). */
export async function resolve(conflict: Conflict, keepWhich: 'here' | 'cloud'): Promise<number> {
  if (!kept) return 0;
  const name = partOf(conflict.classId);
  const other = keepWhich === 'here' ? conflict.cloud : conflict.here;
  const spare = freeSlot();
  if (spare) writeHero(conflict.classId, spare, other);
  if (keepWhich === 'here') {
    const version = await api.writePart(name, conflict.here, conflict.cloudVersion, deviceName());
    kept.base[name] = { version, value: conflict.here };
  } else {
    writeHero(conflict.classId, 1, conflict.cloud);
    kept.base[name] = { version: conflict.cloudVersion, value: conflict.cloud };
    hooks?.reloaded();
  }
  keep();
  pending = pending.filter((c) => c !== conflict);
  hooks?.changed();
  return spare;
}

/** Starts the device's side: syncs at boot, after saves, now and then while in view, and when back online. */
export function initCloud(h: CloudHooks): void {
  hooks = h;
  landing = landFromGoogle();
  // whether Google is linked, as the service says now (linked or unlinked on another device)
  refreshAccount();
  // (each returns at once while signed out or slot 1 isn't the cloud save here)
  window.setTimeout(() => void syncNow(), 2_000);
  window.setInterval(() => { if (document.visibilityState === 'visible') void syncNow(); }, CHECK_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void syncNow(); });
  window.addEventListener('online', () => void syncNow());
}

/** The classes with a hero in `slot`. */
export const slotHeroes = (slot: number): string[] =>
  CLASS_IDS.filter((id) => readSlot(slot)[`last-stand.profile.${id}.v1`] !== undefined);
