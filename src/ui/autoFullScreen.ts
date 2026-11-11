// Full screen on its own (from play: "automatic full screen... with prompt to go back if user wants to, dismisses after
// 10sec", "needs to work on mobile too"). A browser goes full screen only from a player's gesture, so it's asked at
// the first one (the mouse's press, a finger's lift or a key: what a browser takes as a gesture, `ACTIVATING`; a
// finger's press isn't, and a tap's click never comes where the touch controls cancel its touch), on a desktop and a
// phone alike; and a prompt then offers "Back to window" for `PROMPT_MS`. Going back is remembered (`COOKIE`) and the page doesn't ask again on later
// visits, until the player goes full screen by hand (the pause menu's Fullscreen, the touch HUD's button:
// `fullScreenChosen`). Not where the page can't go full screen (an iPhone's Safari), not as the installed app (its own
// window has no browser bars to hide), and not in a harness's browser (`navigator.webdriver`: a lab or stalls run
// would change its window's size at its first click); `?fullscreen=0` leaves it off for a visit.
// In the page's full screen (this one, and the Fullscreen buttons') Esc is the game's, as in the browser's own (F11):
// from play, "first escape removes full screen and second opens the menu" (`keepEsc`).
import { readCookie, removeCookie, writeCookie } from '../core/cookies';
import { sfx } from '../core/audio';
import { input } from '../core/input';

/** the choice kept: 'off' once the player went back to the window from the prompt */
export const AUTO_FULL_COOKIE = 'last-stand-auto-full-screen';
/** how long the prompt stays (ms) */
export const PROMPT_MS = 10000;
/** the events a browser lets a page go full screen from (a mouse's press, a finger's lift, a key) */
const ACTIVATING = ['pointerdown', 'pointerup', 'keydown'] as const;

let armed = false;
let forced = false;
let hideTimer = 0;

/** Running as the installed app, in its own window. */
const installed = (): boolean =>
  matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches
  || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Whether this visit goes full screen on its own (`force`: a harness's check, past `navigator.webdriver`). */
function wanted(force: boolean): boolean {
  if (!document.fullscreenEnabled || installed()) return false;
  if (readCookie(AUTO_FULL_COOKIE) === 'off') return false;
  if (force) return true;
  return !navigator.webdriver && new URLSearchParams(location.search).get('fullscreen') !== '0';
}

const prompt = (): HTMLElement => document.getElementById('full-prompt')!;

/** The prompt shown for `PROMPT_MS`, then gone (or at once if the page leaves full screen meanwhile). */
function showPrompt(): void {
  prompt().classList.remove('hidden');
  clearTimeout(hideTimer);
  hideTimer = window.setTimeout(hidePrompt, PROMPT_MS);
}

/** The prompt gone. */
export function hidePrompt(): void {
  clearTimeout(hideTimer);
  prompt().classList.add('hidden');
}

/** Whether `event` is one a browser lets a page go full screen from. */
function activates(event: Event): boolean {
  // (Esc leaves full screen, and a browser won't take it as the gesture to enter it)
  if (event instanceof KeyboardEvent) return event.key !== 'Escape';
  if (!(event instanceof PointerEvent)) return false;
  const mouse = event.pointerType === 'mouse';
  return event.type === 'pointerdown' ? mouse : !mouse;
}

/** The first gesture: full screen asked for, the prompt shown once it's taken; refused, the next gesture asks again. */
function onGesture(event: Event): void {
  if (!activates(event)) return;
  disarm();
  if (document.fullscreenElement) return;
  document.documentElement.requestFullscreen({ navigationUI: 'hide' }).then(showPrompt, () => armAutoFullScreen(forced));
}

function disarm(): void {
  armed = false;
  for (const type of ACTIVATING) window.removeEventListener(type, onGesture, true);
}

/** Back to the window from the prompt, the choice kept for the next visits. */
function backToWindow(): void {
  sfx.click();
  writeCookie(AUTO_FULL_COOKIE, 'off');
  hidePrompt();
  leaveFullScreen();
}

/** Full screen left by the page itself (Back to window, the Fullscreen buttons), not by the player's Esc. */
export function leaveFullScreen(): void {
  if (!document.fullscreenElement) return;
  leaving = true;
  document.exitFullscreen().catch(() => { leaving = false; });
}

/** the page asked to leave full screen (`leaveFullScreen`): the change that follows is no Esc */
let leaving = false;
/** Esc held for the game while in full screen (`keepEsc`) */
let escKept = false;
let lockState = 'idle';
/** A diagnostic comparison keeps HTML fullscreen but skips its native keyboard hook for this visit. */
const lockDisabled = (): boolean => new URLSearchParams(location.search).get('keyboardLock') === '0';
export const keyboardLockState = (): string => lockDisabled() ? 'disabled' : lockState;

/** The Keyboard Lock API (Chromium on a desktop): a key locked in the page's full screen is the page's. */
interface KeyboardLock {
  lock(codes?: string[]): Promise<void>;
  unlock(): void;
}
const keyboard = (): KeyboardLock | undefined => (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard;

/**
 * Esc kept for the game in the page's full screen. A browser leaves its own full screen (F11) on a key of its own and
 * gives Esc to the page, but leaves the page's on Esc, the key never reaching it: the pause menu took a second Esc.
 * Where Esc can be locked (Chromium on a desktop) it is, and the browser then leaves on Esc held (it says so);
 * elsewhere (Firefox, a phone's back gesture) leaving full screen unasked is taken as the Esc that left it.
 */
function keepEsc(): void {
  if (document.fullscreenElement) {
    const keys = keyboard();
    if (lockDisabled() || !keys) { lockState = 'unavailable'; return; }
    lockState = 'pending';
    keys.lock(['Escape']).then(() => {
      escKept = !!document.fullscreenElement;
      lockState = escKept ? 'held' : 'idle';
    }, () => { lockState = 'refused'; });
    return;
  }
  const asked = leaving;
  const held = escKept;
  leaving = escKept = false;
  lockState = 'idle';
  keyboard()?.unlock();
  // (the Esc held to leave was the game's already; one the browser took must still do what Esc does)
  if (!asked && !held) input.pressed.add('escape');
}

/** The player went full screen by hand: the page may go on its own again on the next visits. */
export function fullScreenChosen(): void {
  removeCookie(AUTO_FULL_COOKIE);
}

/** Waits for the first gesture to go full screen, where this visit should (`force`: a harness's check). */
export function armAutoFullScreen(force = false): void {
  prompt().querySelector<HTMLElement>('.fp-back')!.onclick = backToWindow;
  if (armed || !wanted(force)) return;
  armed = true;
  forced = force;
  for (const type of ACTIVATING) window.addEventListener(type, onGesture, true);
}

/** Set up once at boot: the prompt goes with full screen. */
export function initAutoFullScreen(): void {
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) hidePrompt();
    keepEsc();
  });
  armAutoFullScreen();
  const boot = window.__bootFullScreen;
  boot?.stop();
  if (boot?.pending) {
    disarm();
    void boot.pending.then(() => { keepEsc(); showPrompt(); }, () => armAutoFullScreen());
  } else if (boot?.entered) {
    disarm();
    if (document.fullscreenElement) { keepEsc(); showPrompt(); }
  }
}

/** Whether it waits for a gesture now (a harness's check). */
export const autoFullArmed = (): boolean => armed;
