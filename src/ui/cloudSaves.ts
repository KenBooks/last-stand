// Cloud saves on the save slots screen (#504; the sync is loot/cloud.ts): the bar under the title (signed out: sign
// in with a passkey, make an account, or type a sign-in code; signed in: the cloud save's state and the account's
// actions), and its dialogs: which slot becomes the cloud save at the first sign-in (the slots then move into place
// before the player's eyes, saves.ts `moveSlots`), the cloud's save coming down, a hero changed on two devices (the
// player keeps one; the other goes to a free slot, or the dialog says it will be lost), a sign-in code, deleting.
import { CLASSES } from '../data/classes/index';
import { RUN } from '../data/balance';
import { itemPower } from '../loot/items';
import * as cloud from '../loot/cloud';
import { passkeysHere, CloudError } from '../loot/cloudApi';
import { SAVE_SLOTS } from '../loot/saveSlots';
import { slotHeroes } from '../loot/cloud';
import { readHero, type Entries } from '../loot/slotData';
import { sfx } from '../core/audio';
import { isTouch } from './touch';
import type { Profile } from '../types';

const $ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document): T => root.querySelector<T>(s)!;

export interface CloudUiHooks {
  /** the screen drawn again (the slots changed, or what the bar says) */
  render(): void;
  /** slots rearranged before the player's eyes: `order[i]` the slot whose save is now slot i + 1, `lost` the one
   *  pushed out (0: none) */
  moveSlots(rearrange: () => void | Promise<void>, order: number[], lost: number): Promise<void>;
}

let hooks: CloudUiHooks;
let busy = false;

/** Production's page (the one trusted site: codes and deleting the account are its alone). */
const onProduction = (): boolean => /^(www\.)?last-stand\.cc$/.test(location.hostname);

export function initCloudSaves(h: CloudUiHooks): void {
  hooks = h;
  const box = $('#cloud-dialog');
  // the backdrop closes the dialog only when pressed and let go there: a tap on the code's field moves the dialog as
  // it takes the focus (`aboveKeyboard`), and its click then landed on the backdrop and closed it
  let pressedBackdrop = false;
  box.onpointerdown = (e) => { pressedBackdrop = e.target === box; };
  box.onclick = (e) => { if (pressedBackdrop && e.target === box && !busy) closeDialog(); };
  // the Account menu closes on a press anywhere outside it, as a dropdown does (Esc: `closeAccountMenu`)
  document.addEventListener('pointerdown', (e) => {
    const open = openMenu();
    if (open && !open.contains(e.target as Node)) open.open = false;
  });
}

const openMenu = (): HTMLDetailsElement | null => document.querySelector<HTMLDetailsElement>('#saves .sc-more[open]');

/** Closes the Account menu if it is open (the screen's Esc): whether it was. */
export function closeAccountMenu(): boolean {
  const open = openMenu();
  if (open) open.open = false;
  return Boolean(open);
}

export const cloudDialogOpen = (): boolean => !$('#cloud-dialog').classList.contains('hidden');
let cancelGoogle: (() => void) | null = null;
export function closeDialog(): void {
  cancelGoogle?.();
  cancelGoogle = null;
  $('#cloud-dialog').classList.add('hidden');
  $('#cloud-dialog').classList.remove('typing');
}

/** Authentication is the session's, never inferred from a linked method. Email is escaped like any server text. */
export function cloudIdentityHTML(identity = cloud.cloudIdentity()): string {
  const { google, passkey, session } = identity;
  const current = session?.via === 'google'
    ? `${GOOGLE}<span>Signed in with Google${session.email ? ` · <b>${escape(session.email)}</b>` : ' · sign in again to show email'}</span>`
    : `<span>${session?.via === 'passkey' ? 'Signed in with a passkey' : session?.via === 'code'
      ? 'Signed in with a code' : 'Signed in · login details unavailable'}</span>`;
  const methods = [google ? `${GOOGLE}<span>Google</span>` : '', passkey ? '<span>Passkey</span>' : ''].filter(Boolean).join(' + ');
  return `<div class="sc-identity">${current}</div>${methods ? `<div class="sc-methods">Linked: ${methods}</div>` : ''}`;
}

const GOOGLE = '<svg class="sc-google-logo" viewBox="0 0 24 24" aria-hidden="true">'
  + '<path fill="#4285f4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.89-1.74 2.98-4.3 2.98-7.36Z"/>'
  + '<path fill="#34a853" d="M12 22c2.7 0 4.96-.9 6.62-2.42l-3.24-2.51c-.9.6-2.05.97-3.38.97-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22Z"/>'
  + '<path fill="#fbbc05" d="M6.41 13.92a6 6 0 0 1 0-3.84V7.49H3.07a10 10 0 0 0 0 9.02l3.34-2.59Z"/>'
  + '<path fill="#ea4335" d="M12 5.96c1.47 0 2.79.51 3.83 1.51l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.49l3.34 2.59C7.2 7.72 9.4 5.96 12 5.96Z"/></svg>';

// --- the bar ----------------------------------------------------------------------------------------------
/** The bar under the screen's title, drawn afresh with the screen. */
export function renderCloudBar(): void {
  const bar = $('#saves .sv-cloud');
  const { status, message, accountId, lastSync } = cloud.cloudStatus();
  const privacy = '<a class="link sc-privacy" href="./privacy.html" target="_blank" rel="noopener">Privacy</a>';
  const note = message ? `<p class="sc-note">${escape(message)}</p>` : '';
  if (status === 'signedOut') {
    const passkeys = passkeysHere()
      ? '<button class="btn primary sc-in">Sign in with a passkey</button><button class="btn sc-new">New account</button>'
      : '<span class="sc-state">This browser can\'t use passkeys.</span>';
    bar.innerHTML = `<div class="sc-row"><span class="sc-icon" aria-hidden="true">${CLOUD}</span>`
      + `<span class="sc-state">Keep slot 1 on every device: sign in.</span><div class="sc-actions">${passkeys}`
      + `<button class="btn sc-google" hidden>${GOOGLE}<span>Sign in with Google</span></button>`
      + `<span class="sc-tail"><button class="btn sc-code">Use a sign-in code</button>${privacy}</span></div></div>${note}`;
  } else if (status === 'unlinked') {
    bar.innerHTML = `<div class="sc-row"><span class="sc-icon" aria-hidden="true">${CLOUD}</span>`
      + `<span class="sc-state">Signed in (account ${accountId.slice(0, 6)}). Choose which save is your cloud save.</span>`
      + `<div class="sc-actions"><button class="btn primary sc-link">Choose the cloud save</button><span class="sc-tail"><button class="btn sc-out">Sign out</button>${privacy}</span></div></div>${note}`;
    bar.insertAdjacentHTML('beforeend', `<div class="sc-account">${cloudIdentityHTML()}</div>`);
  } else {
    const state = status === 'syncing' ? 'Syncing...' : status === 'offline' ? 'Offline' : status === 'error' ? 'Not synced'
      : lastSync ? `Synced ${ago(lastSync)}` : 'Synced';
    const more = [
      '<button class="btn sc-give">Sign in elsewhere</button>',
      onProduction() ? '<button class="btn sc-copy-code">Copy heroes to a preview</button>' : '',
      onProduction() ? '' : '<button class="btn sc-copy">Copy my production heroes here</button>',
      // off production the server takes a passkey only just after a code signed this device in
      onProduction() || cloud.passkeyWindow() ? '<button class="btn sc-key">Add a passkey</button>' : '',
      // (Google is linked and unlinked from production alone: a preview's session may be anyone's token)
      onProduction() && !cloud.hasGoogle() ? `<button class="btn sc-glink" hidden>${GOOGLE}<span>Link Google</span></button>` : '',
      onProduction() && cloud.hasGoogle() ? `<button class="btn sc-gunlink">${GOOGLE}<span>Unlink Google</span></button>` : '',
      '<button class="btn sc-out">Sign out</button>',
      '<button class="btn danger sc-del">Delete cloud save</button>',
      onProduction() ? '<button class="btn danger sc-gone">Delete account</button>' : '',
    ].join('');
    bar.innerHTML = `<div class="sc-row"><span class="sc-icon on" aria-hidden="true">${CLOUD}</span>`
      + `<span class="sc-state">Slot 1 is your cloud save · account ${accountId.slice(0, 6)} · <b>${state}</b></span>`
      + `<div class="sc-actions"><button class="btn sc-sync">Sync now</button><span class="sc-tail"><details class="sc-more"><summary class="btn">Account<span class="sc-chevron" aria-hidden="true"></span></summary>`
      + `<div class="sc-menu">${more}</div></details>${privacy}</span></div></div>${note}`;
  }
  bind(bar, '.sc-in', () => act(() => cloud.signInWithPasskey(), afterSignIn));
  bind(bar, '.sc-new', () => act(() => cloud.signUpWithPasskey(), afterSignIn));
  bind(bar, '.sc-code', askCode);
  bind(bar, '.sc-link', () => void chooseCloudSave());
  bind(bar, '.sc-out', () => act(() => cloud.signOut()));
  bind(bar, '.sc-sync', () => act(() => cloud.syncNow()));
  bind(bar, '.sc-give', () => void showCode());
  bind(bar, '.sc-copy-code', () => void showCopyCode());
  bind(bar, '.sc-copy', confirmCopy);
  bind(bar, '.sc-key', () => act(() => cloud.addPasskey(), () => say('Passkey added: this device can sign in with it.')));
  bind(bar, '.sc-del', confirmDeleteSave);
  bind(bar, '.sc-gone', confirmDeleteAccount);
  bind(bar, '.sc-google', () => startGoogle('signin'));
  bind(bar, '.sc-glink', confirmLinkGoogle);
  bind(bar, '.sc-gunlink', () => act(() => cloud.unlinkGoogle(), () => say('Google is unlinked: sign in with a passkey or a code.')));
  showIfGoogle(bar);
}

/** Google's buttons shown once the service says its sign-in is on (its health, asked once a visit). */
function showIfGoogle(bar: Element): void {
  const hidden = [...bar.querySelectorAll<HTMLElement>('.sc-google, .sc-glink')];
  if (!hidden.length) return;
  void cloud.googleOn().then((on) => { for (const button of hidden) button.hidden = !on; });
}

function bind(root: ParentNode, selector: string, run: () => void): void {
  const el = root.querySelector<HTMLElement>(selector);
  if (el) el.onclick = () => { sfx.click(); run(); };
}

/** Runs a call, saying what went wrong if it fails; the screen drawn again after. */
async function act(call: () => Promise<void>, then?: () => void): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    await call();
    then?.();
  } catch (e) {
    say(failure(e));
  } finally {
    busy = false;
    hooks.render();
  }
}

function failure(e: unknown): string {
  if (e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'AbortError')) return 'Cancelled: no passkey was used.';
  if (e instanceof CloudError) {
    if (e.status === 0) return 'The cloud saves server could not be reached. Try again in a while.';
    if (e.message.startsWith('no such copy code')) return 'That copy code expired or was already used. Make a new one on last-stand.cc.';
    if (e.message.startsWith('no such move offer')) return 'That Google move offer expired or was already used. Choose Link Google and try again.';
    if (e.status === 401) return 'Not signed in: that passkey or code isn\'t one this server knows, or it expired.';
    if (e.status === 429) return 'Too many tries: wait a while and try again.';
    if (e.message.startsWith('no production save')) return 'No production cloud save was found. Sync slot 1 on last-stand.cc, then make a new copy code.';
    if (e.message.startsWith('Google sign-in is off')) return 'Signing in with Google is off on this server for now.';
    if (e.message.startsWith('the last way in')) {
      return 'Google is the only way into this account: add a passkey first, then unlink Google.';
    }
    if (e.message.startsWith('add a passkey')) {
      return 'On a preview, a passkey can be added only in the 10 minutes after signing in with a code. Sign in elsewhere on a device already signed in, type its code here, then add the passkey.';
    }
    if (e.message.startsWith('a code from a preview')) {
      return 'That code was made on a preview, so it signs in on previews only. Make one on last-stand.cc to sign in here.';
    }
    return e.message;
  }
  return String((e as Error)?.message ?? e);
}

/** Signed in: on to choosing the cloud save. */
function afterSignIn(): void { void chooseCloudSave(); }

// --- the dialog ------------------------------------------------------------------------------------------
interface Button { label: string; kind?: 'primary' | 'danger'; run?: () => void | Promise<void>; whileBusy?: boolean }

/** The dialog with a title, its text (HTML) and buttons; a button without `run` closes it. */
function dialog(title: string, html: string, buttons: Button[]): void {
  const box = $('#cloud-dialog');
  $('.sm-title', box).textContent = title;
  $('.cd-body', box).innerHTML = html;
  const row = $('.dc-buttons', box);
  row.replaceChildren(...buttons.map((b) => {
    const el = document.createElement('button');
    el.className = `btn${b.kind ? ' ' + b.kind : ''}`;
    el.textContent = b.label;
    el.onclick = async () => {
      if (busy && !b.whileBusy) return;
      sfx.click();
      if (!b.run) { closeDialog(); return; }
      await b.run();
    };
    return el;
  }));
  box.classList.remove('hidden', 'typing');
  (row.firstElementChild as HTMLElement | null)?.focus();
}

const say = (text: string): void => dialog('Cloud save', `<p>${escape(text)}</p>`, [{ label: 'OK', kind: 'primary' }]);

/** What each reason a return from Google failed says (the service's, `cloud-google-error`). */
const GOOGLE_ERRORS: Record<string, string> = {
  cancelled: 'The Google sign-in was cancelled.',
  refused: 'Google didn\'t confirm the sign-in. Try again.',
  'too-many': 'Too many new accounts from this network today: try again tomorrow, or use a passkey.',
  taken: 'That Google account belongs to another Last Stand account with a production save. Sign in with Google there and add a passkey before moving its Google login here.',
  other: 'Another Google account is linked to this account already: unlink it first.',
  'signed-out': 'This device was signed out before Google answered. Sign in and try again.',
  expired: 'The Google sign-in took too long, or was used already. Try again.',
  offline: 'The cloud saves server could not be reached. Try again in a while.',
};

/** The game's return from Google, shown on the save slots screen: on to choosing the cloud save, or what went on. */
export function showGoogleLanding(landing: cloud.GoogleLanding): void {
  if (landing.kind === 'signedIn') { afterSignIn(); return; }
  if (landing.kind === 'linked') {
    say('Google is linked: sign in with it on any device on last-stand.cc, as well as with your passkeys.');
    return;
  }
  if (landing.kind === 'move') {
    const { code, previewSaves, hasProductionSave, hasPasskey } = landing.offer;
    const previews = previewSaves
      ? ` It has ${previewSaves} preview save${previewSaves === 1 ? '' : 's'} that stay there${hasPasskey ? '.' : ' but may no longer be accessible without another sign-in method.'}`
      : '';
    const saves = hasProductionSave
      ? `The other account has a production save. It stays there and can still be opened with its passkey.${previews}`
      : previewSaves ? `The other account has no production save.${previews}` : 'The other account has no cloud saves.';
    dialog('Move Google here?', `<p>${saves}</p><p>Google will sign in to this account on last-stand.cc after the move. No saves are merged or deleted.${hasPasskey ? ' The other account keeps its passkey.' : ''}</p>`, [
      { label: 'Move Google here', kind: 'primary', run: () => {
        closeDialog();
        return act(() => cloud.moveGoogle(code), () => say('Google now signs in to this account on last-stand.cc.'));
      } },
      { label: 'Cancel' },
    ]);
    return;
  }
  // (the reason comes from the page's address: only the screen's own are said)
  const known = Object.hasOwn(GOOGLE_ERRORS, landing.reason);
  say(known ? GOOGLE_ERRORS[landing.reason] : 'The Google sign-in failed. Try again.');
}

function confirmLinkGoogle(): void {
  dialog('Link Google', '<p>Google becomes a second way into this account on last-stand.cc. Google tells the '
    + 'server its account id and verified email. Your email is shown only when you sign in with Google; no name or picture is kept.</p>', [
    { label: 'Go to Google', kind: 'primary', run: () => { closeDialog(); startGoogle('link'); } },
    { label: 'Cancel' },
  ]);
}

/** Starts inside the click so browsers can open the sign-in window before the first network request. */
function startGoogle(purpose: 'signin' | 'link', redirect = false): void {
  if (busy) return;
  const controller = new AbortController();
  let useThisTab = false;
  let focusGoogle = (): void => {};
  cancelGoogle = () => controller.abort();
  dialog('Google sign-in', '<p>Finish signing in in the Google window, then return here. Your game stays loaded.</p>',
    [{ label: 'Show Google window', whileBusy: true, run: () => focusGoogle() },
      { label: 'Cancel', whileBusy: true, run: () => closeDialog() },
      { label: 'Continue in this tab', whileBusy: true, run: () => { useThisTab = true; closeDialog(); } }]);
  let result: cloud.GoogleLanding | null = null;
  void act(async () => {
    try { result = await cloud.goToGoogle(purpose, controller.signal, redirect, (focus) => { focusGoogle = focus; }); }
    finally { closeDialog(); }
  }, () => {
    if (useThisTab) queueMicrotask(() => startGoogle(purpose, true));
    else if (result) showGoogleLanding(result);
  });
}

function askCode(): void {
  // the field first: a phone's keyboard covers the screen's lower half, and the dialog moves above it as one opens
  dialog('Sign in with a code', '<input class="cd-code" maxlength="9" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" enterkeyhint="go" placeholder="ABCD-EFGH">'
    + '<p>On a device already signed in, open Save slots, then Account, then <b>Sign in elsewhere</b>, and type its 8 letters above.</p>', [
    { label: 'Sign in', kind: 'primary', run: () => {
      const code = $<HTMLInputElement>('#cloud-dialog .cd-code').value;
      closeDialog();
      return act(() => cloud.signInWithCode(code), afterSignIn);
    } },
    { label: 'Cancel' },
  ]);
  const field = $<HTMLInputElement>('#cloud-dialog .cd-code');
  aboveKeyboard(field);
  field.focus();
  field.onkeydown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeDialog(); }
    if (e.key === 'Enter') { e.preventDefault(); ($('#cloud-dialog .dc-buttons .primary') as HTMLElement).click(); }
  };
}

/** Once `field` has the focus on a touch screen, the dialog keeps to the part of the screen a keyboard leaves until it
 *  closes: at its top (in full screen a phone's keyboard lies over the page and may shrink nothing), and no taller
 *  than the visual viewport, which the keyboard shrinks otherwise. It stays there when the field loses the focus: a
 *  tap on Sign in takes the focus first, and the dialog moving back under the finger made the tap miss. A mouse's
 *  dialog stays centred. */
function aboveKeyboard(field: HTMLInputElement): void {
  const box = $('#cloud-dialog');
  const seen = window.visualViewport;
  const fit = (): void => {
    if (box.classList.contains('hidden') || !box.contains(field)) { stop(); return; }
    box.style.setProperty('--seen-top', `${seen?.offsetTop ?? 0}px`);
    box.style.setProperty('--seen', `${seen?.height ?? innerHeight}px`);
    if (document.activeElement === field) field.scrollIntoView({ block: 'nearest' });
  };
  const start = (): void => {
    if (!isTouch()) return;
    box.classList.add('typing');
    seen?.addEventListener('resize', fit);
    seen?.addEventListener('scroll', fit);
    fit();
  };
  const stop = (): void => {
    box.classList.remove('typing');
    seen?.removeEventListener('resize', fit);
    seen?.removeEventListener('scroll', fit);
  };
  field.addEventListener('focus', start);
}

async function showCode(): Promise<void> {
  try {
    const { code, until, previewsOnly } = await cloud.makeLinkCode();
    const minutes = Math.round((until - Date.now()) / 60_000);
    const where = previewsOnly ? 'on another device\'s preview (never on last-stand.cc)' : 'on the other device or on a preview';
    dialog('Sign in elsewhere', `<p class="cd-shown">${code.slice(0, 4)}-${code.slice(4)}</p><p>Type it ${where}, under Save slots, <b>Use a sign-in code</b>. It works once, for ${minutes} minutes. Never give it to anyone else: it opens your account.</p>`,
      [{ label: 'Done', kind: 'primary' }]);
  } catch (e) { say(failure(e)); }
}

async function showCopyCode(): Promise<void> {
  try {
    const { code, until } = await cloud.makeCopyCode();
    const minutes = Math.round((until - Date.now()) / 60_000);
    dialog('Copy heroes to a preview', `<p class="cd-shown">${code.slice(0, 4)}-${code.slice(4)}</p><p>Open the preview\'s Save slots, choose <b>Copy my production heroes here</b>, and type this code. It copies your production save once, for ${minutes} minutes, without signing the preview into your production account. Keep the code private.</p>`,
      [{ label: 'Done', kind: 'primary' }]);
  } catch (e) { say(failure(e)); }
}

// --- the first sign-in: which slot is the cloud save -------------------------------------------------------
async function chooseCloudSave(): Promise<void> {
  let plan;
  try { plan = await cloud.linkPlan(); } catch (e) { say(failure(e)); return; }
  if (plan.cloudHeroes.length) { askDownload(plan.cloudHeroes); return; }
  const options = SAVE_SLOTS.map((n) => {
    const heroes = slotHeroes(n);
    return `<button class="btn cd-slot" data-slot="${n}"><b>Slot ${n}</b><span>${heroes.length ? heroes.map((id) => CLASSES[id].name).join(', ') : 'Empty'}</span></button>`;
  }).join('');
  dialog('Which save goes to the cloud?', `<p>The save you choose becomes your cloud save in slot 1, kept for every device you sign in on. The other saves stay on this device and move down to make room.</p><div class="cd-slots">${options}</div>`,
    [{ label: 'Cancel' }]);
  document.querySelectorAll<HTMLElement>('#cloud-dialog .cd-slot').forEach((el) => {
    el.onclick = () => {
      sfx.click();
      const chosen = Number(el.dataset.slot);
      closeDialog();
      void act(() => hooks.moveSlots(() => cloud.linkByUpload(chosen), cloud.uploadOrder(chosen), 0));
    };
  });
}

function askDownload(cloudHeroes: string[]): void {
  const { order, lost } = cloud.downloadOrder();
  const moves = order.flatMap((from, i) => (from && from !== i + 1 ? [`slot ${from} to slot ${i + 1}`] : []));
  const heroes = cloudHeroes.map((id) => CLASSES[id].name).join(', ');
  const lostText = lost ? `<p class="cd-warn">All three slots are full: <b>slot ${lost}</b> (${describeSlot(lost)}) will be overwritten and lost.</p>` : '';
  dialog('Your cloud save comes to this device', `<p>Your account's cloud save (${heroes}) comes down into slot 1.${moves.length ? ` Your saves here move along: ${moves.join(', ')}.` : ''}</p>${lostText}`, [
    { label: lost ? `Overwrite slot ${lost}` : 'Bring it down', kind: lost ? 'danger' : 'primary', run: () => {
      closeDialog();
      return act(() => hooks.moveSlots(() => cloud.linkByDownload(), order, lost));
    } },
    { label: 'Cancel' },
  ]);
}

/** A slot's heroes with their item power, for a warning. */
function describeSlot(slot: number): string {
  return slotHeroes(slot).map((id) => {
    const p = profileIn(readHero(id, slot), id);
    return `the ${CLASSES[id].name}${p ? `, power ${power(p).toLocaleString()}` : ''}`;
  }).join('; ') || 'nothing';
}

// --- a hero changed on two devices ---------------------------------------------------------------------------
/** Asks about the conflicts one at a time (the sync found them; the screen opens for them). */
export function askConflicts(): void {
  const [conflict] = cloud.pendingConflicts();
  if (!conflict) return;
  const name = CLASSES[conflict.classId]?.name ?? conflict.classId;
  const here = profileIn(conflict.here, conflict.classId);
  const there = profileIn(conflict.cloud, conflict.classId);
  const base = profileIn(conflict.base, conflict.classId);
  const spare = cloud.freeSlot();
  const fate = spare ? `<p>The copy you don't keep isn't lost: it goes to <b>slot ${spare}</b>.</p>`
    : '<p class="cd-warn">No slot is free: the copy you don\'t keep will be <b>lost</b>.</p>';
  const { lastSync } = cloud.cloudStatus();
  dialog(`The ${name} changed in two places`, `<p>The ${name} was played on this device and on another since they last synced. Choose which to keep: they are never merged.</p>`
    + `<div class="cd-sides">${side('This device', cloud.deviceName(), lastSync ? `last synced ${ago(lastSync)}` : 'never synced', here, base)}`
    + `${side('The cloud', conflict.cloudDevice || 'another device', `saved ${ago(conflict.cloudUpdated)}`, there, base)}</div>${fate}`, [
    { label: 'Keep this device\'s', kind: 'primary', run: () => settle(conflict, 'here') },
    { label: 'Keep the cloud\'s', kind: 'primary', run: () => settle(conflict, 'cloud') },
  ]);
}

async function settle(conflict: cloud.Conflict, keep: 'here' | 'cloud'): Promise<void> {
  closeDialog();
  await act(async () => { await cloud.resolve(conflict, keep); });
  if (cloud.pendingConflicts().length) askConflicts();
}

function side(title: string, device: string, when: string, p: Profile | null, base: Profile | null): string {
  if (!p) return `<div class="cd-side"><h3>${title}</h3><p>${escape(device)}</p><p>No hero</p></div>`;
  const changed = changesSince(p, base);
  // when the hero was last played on that side: what tells two copies apart when the devices look alike
  const played = p.saved ? `<dt>Last played</dt><dd title="${new Date(p.saved).toLocaleString()}">${ago(p.saved)}</dd>` : '';
  return `<div class="cd-side"><h3>${title}</h3><p class="cd-dev">${escape(device)}<br>${when}</p><dl>${played}`
    + `<dt>Best wave</dt><dd>${p.records.bestWave}</dd><dt>Item power</dt><dd>${power(p).toLocaleString()}</dd>`
    + `<dt>Stash</dt><dd>${p.stash.length} / ${RUN.bagLimit}</dd><dt>Runs</dt><dd>${p.records.runs}</dd>`
    + `<dt>Since the last sync</dt><dd>${changed}</dd></dl></div>`;
}

/** How far a copy moved on from the one both came from: runs played, items come and gone. */
function changesSince(p: Profile, base: Profile | null): string {
  if (!base) return 'all new';
  const ids = (q: Profile) => new Set([...q.stash, ...Object.values(q.equipped)].flatMap((it) => (it ? [it.id] : [])));
  const now = ids(p), before = ids(base);
  const gained = [...now].filter((id) => !before.has(id)).length;
  const gone = [...before].filter((id) => !now.has(id)).length;
  const runs = p.records.runs - base.records.runs;
  return [`${runs} run${runs === 1 ? '' : 's'}`, `${gained} item${gained === 1 ? '' : 's'} gained`, gone ? `${gone} gone` : ''].filter(Boolean).join(', ');
}

function profileIn(entries: Entries, classId: string): Profile | null {
  try {
    const p = JSON.parse(entries[`last-stand.profile.${classId}.v1`] ?? 'null') as Profile | null;
    return p?.records ? p : null;
  } catch { return null; }
}

const power = (p: Profile): number => Object.values(p.equipped).reduce((s, it) => s + (it ? itemPower(it) : 0), 0);

// --- copying and deleting ------------------------------------------------------------------------------------
function confirmCopy(): void {
  dialog('Copy your production heroes here?', '<input class="cd-code" maxlength="9" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" enterkeyhint="go" placeholder="ABCD-EFGH">'
    + '<p>Sign in separately at last-stand.cc. Under Save slots, choose Account, then <b>Copy heroes to a preview</b>, and type its code above. This preview\'s cloud save is replaced; production stays as it is.</p>', [
    { label: 'Copy them here', kind: 'primary', run: () => {
      const code = $<HTMLInputElement>('#cloud-dialog .cd-code').value;
      closeDialog();
      return act(() => cloud.copyProduction(code), () => say('Your production heroes are in slot 1 here.'));
    } },
    { label: 'Cancel' },
  ]);
  const field = $<HTMLInputElement>('#cloud-dialog .cd-code');
  aboveKeyboard(field);
  field.focus();
  field.onkeydown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeDialog(); }
    if (e.key === 'Enter') { e.preventDefault(); ($('#cloud-dialog .dc-buttons .primary') as HTMLElement).click(); }
  };
}

function confirmDeleteSave(): void {
  dialog('Delete the cloud save?', `<p>Your cloud save for this site is deleted from the server. Slot 1 stays on this device as a local save, and your account stays.${onProduction() ? '' : ' (This is this preview\'s cloud save, not production\'s.)'}</p>`, [
    { label: 'Delete cloud save', kind: 'danger', run: () => { closeDialog(); return act(() => cloud.deleteCloudSave()); } },
    { label: 'Cancel' },
  ]);
}

function confirmDeleteAccount(): void {
  dialog('Delete your account?', '<p>Your account, every cloud save of it (previews\' too) and its passkeys are deleted from the server for good. Your saves on this device stay as local saves. Backups age out within 14 days.</p>', [
    { label: 'Delete account', kind: 'danger', run: () => { closeDialog(); return act(() => cloud.deleteAccount()); } },
    { label: 'Cancel' },
  ]);
}

// --- wording ---------------------------------------------------------------------------------------------
const escape = (text: string): string => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
function ago(t: number): string {
  const s = (t - Date.now()) / 1000;
  for (const [unit, n] of UNITS) if (-s >= n) return rtf.format(Math.round(s / n), unit);
  return 'just now';
}

/** A cloud, for the bar and slot 1's mark. */
export const CLOUD = '<svg viewBox="0 0 24 24"><path d="M7 18.5h10.5a4 4 0 0 0 .4-8 6 6 0 0 0-11.6 1.6A3.2 3.2 0 0 0 7 18.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
