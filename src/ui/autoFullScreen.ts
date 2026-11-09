// Full screen on its own (from play: "automatic full screen... with prompt to go back if user wants to, dismisses after
// 10sec", "needs to work on mobile too"). A browser goes full screen only from a player's gesture, so it's asked at
// the first one (the mouse's press, a finger's lift or a key: what a browser takes as a gesture, `ACTIVATING`; a
// finger's press isn't, and a tap's click never comes where the touch controls cancel its touch), on a desktop and a
// phone alike; and a prompt then offers "Back to window" for `PROMPT_MS`. Going back is remembered (`COOKIE`) and the page doesn't ask again on later
// visits, until the player goes full screen by hand (the pause menu's Fullscreen, the touch HUD's button:
// `fullScreenChosen`). Not where the page can't go full screen (an iPhone's Safari), not as the installed app (its own
// window has no browser bars to hide), and not in a harness's browser (`navigator.webdriver`: a lab or stalls run
// would change its window's size at its first click); `?fullscreen=0` leaves it off for a visit.
import { readCookie, removeCookie, writeCookie } from '../core/cookies';
import { sfx } from '../core/audio';

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
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
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
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) hidePrompt(); });
  armAutoFullScreen();
}

/** Whether it waits for a gesture now (a harness's check). */
export const autoFullArmed = (): boolean => armed;
