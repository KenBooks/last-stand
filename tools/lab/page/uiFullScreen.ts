// `lab ui`'s automatic full screen (src/ui/autoFullScreen.ts, `autoFull`): the page asks for full screen at a player's
// first gesture, and a prompt then offers to go back to the window for 10 s. The lab's browser refuses full screen
// (`noCapture` in `node/browser.mjs`: it would take the window), so the page's request is stood in for by a spy of the
// check's own, which counts each ask and takes or refuses it as a browser would. Checked: a finger's press asks
// nothing and its lift asks, a mouse's press asks; refused, the next gesture asks again; taken, the prompt shows, within
// the window, and is gone after its time; Back to window clicked keeps the choice in its cookie, and the page doesn't
// ask on the next visit; the prompt stands over the loading screen (its first click asks too). Its canary loses the
// cookie before that visit, which must be caught asking again.
// Esc in full screen (`escKept`): the browser's full screen stood in for too (`FullStateSpy`). Where Esc can be locked
// it's asked for, and leaving on Esc held opens nothing; where it can't, leaving unasked opens the pause menu, as the
// Esc that left it; the page leaving on its own opens nothing. Its canary drops that Esc, which must be caught.
import type { Lab, Pictured } from './lab';
import { middleOf } from './lab';
import {
  AUTO_FULL_COOKIE, PROMPT_MS, armAutoFullScreen, autoFullArmed, hidePrompt, leaveFullScreen, keyboardLockState,
} from '../../../src/ui/autoFullScreen';
import { readCookie, removeCookie } from '../../../src/core/cookies';
import { input } from '../../../src/core/input';
import { G } from '../../../src/state';

/** What the check found: lines for its report, and its problems. */
export interface FullFound {
  lines: string[];
  problems: string[];
}

/** the problem the canary must raise */
export const FULL_CANARY = { name: 'asked again', what: 'the choice to stay in the window lost before the next visit' };
/** the problem the canary must raise in the Esc part: the Esc the browser took dropped */
export const ESC_CANARY = { name: 'Esc lost', what: 'the Esc that left full screen dropped' };

/** the prompt as it showed, pictured by the last check (`autoFullPictures`) */
let promptPictures: Pictured[] = [];

/** The prompt pictured as it showed in the last check, handed over once. */
export function autoFullPictures(): Pictured[] {
  const pictures = promptPictures;
  promptPictures = [];
  return pictures;
}

/** how much past the prompt's time it's looked for again (ms of the browser's clock) */
const PROMPT_SLACK_MS = 500;

/** The page's requests for full screen, stood in for: counted, and taken or refused as `taking` says. */
class FullScreenSpy {
  asks = 0;
  taking = true;

  constructor() {
    const ask = (): Promise<void> => {
      this.asks += 1;
      return this.taking ? Promise.resolve() : Promise.reject(new TypeError('refused'));
    };
    Object.defineProperty(document.documentElement, 'requestFullscreen', { value: ask, configurable: true });
  }

  /** The page's own request given back. */
  remove(): void {
    Reflect.deleteProperty(document.documentElement, 'requestFullscreen');
  }
}

/** The prompt, shown or not. */
function promptShown(): boolean {
  return document.getElementById('full-prompt')?.checkVisibility() ?? false;
}

/** A wait of `ms` on the browser's clock (the page's own timers run on it). */
function waitReal(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** The promise callbacks a request's answer runs, run. */
const settle = (): Promise<void> => waitReal(0);

/** The loading screen's z-index, from its rule (`#loading` leaves the page once the game is shown). */
function loadingZ(): number {
  const own = [...document.styleSheets].filter((sheet) => !sheet.href || sheet.href.startsWith(location.origin));
  for (const sheet of own) {
    for (const rule of sheet.cssRules) {
      if (rule instanceof CSSStyleRule && rule.selectorText === '#loading') return Number(rule.style.zIndex);
    }
  }
  return Number.NaN;
}

/** Whether the prompt lies inside the window, with its button at least `least` css px tall. */
function promptFits(least: number): string[] {
  const box = document.getElementById('full-prompt')!.getBoundingClientRect();
  const back = document.querySelector('#full-prompt .fp-back')!.getBoundingClientRect();
  const problems: string[] = [];
  if (box.left < 0 || box.top < 0 || box.right > innerWidth || box.bottom > innerHeight) {
    problems.push(`autoFull: the prompt lies outside the window, ${box.left},${box.top} to ${box.right},${box.bottom}`);
  }
  if (back.height < least) problems.push(`autoFull: Back to window is ${back.height.toFixed(1)} px tall`);
  const over = Number(getComputedStyle(document.getElementById('full-prompt')!).zIndex);
  const loading = loadingZ();
  if (!(over > loading)) problems.push(`autoFull: the prompt (${over}) lies under the loading screen (${loading})`);
  return problems;
}

/** The page's spot clicked or tapped (middle of the window, the lobby's hero). */
const spot = (): { x: number; y: number } => ({ x: innerWidth / 2, y: innerHeight / 2 });

/** A finger's press and lift: the press must ask nothing, the lift once. */
async function fingerAsks(lab: Lab, spy: FullScreenSpy, lines: string[], problems: string[]): Promise<void> {
  spy.taking = false;
  armAutoFullScreen(true);
  await lab.touchDown(spot());
  await settle();
  const onPress = spy.asks;
  await lab.touchUp();
  await settle();
  const onLift = spy.asks - onPress;
  lines.push(`  a finger: asked ${onPress} as it went down, ${onLift} as it lifted; refused, armed again ${autoFullArmed()}`);
  if (onPress !== 0) problems.push(`autoFull: a finger's press asked for full screen ${onPress} times`);
  if (onLift !== 1) problems.push(`autoFull: a finger's lift asked for full screen ${onLift} times`);
  if (!autoFullArmed()) problems.push('autoFull: refused, the next gesture would not ask again');
}

/** A mouse's click taken: asked once, the prompt shown in the window, gone after its time. */
async function mouseShowsPrompt(lab: Lab, spy: FullScreenSpy, lines: string[], problems: string[]): Promise<void> {
  spy.taking = true;
  const before = spy.asks;
  await lab.click(spot());
  await settle();
  const shown = promptShown();
  lines.push(`  the mouse: asked ${spy.asks - before}, taken, the prompt shown ${shown}, armed ${autoFullArmed()}`);
  if (spy.asks - before !== 1) problems.push(`autoFull: a click asked for full screen ${spy.asks - before} times`);
  if (!shown) problems.push('autoFull: taken, the prompt never showed');
  if (autoFullArmed()) problems.push('autoFull: taken, the page still waits to ask');
  problems.push(...promptFits(document.body.classList.contains('touch') ? 40 : 20));
  if (shown) promptPictures.push(await lab.screen('autoFull: the prompt', []));
  await waitReal(PROMPT_MS + PROMPT_SLACK_MS);
  const after = promptShown();
  lines.push(`  ${(PROMPT_MS + PROMPT_SLACK_MS) / 1000} s later the prompt shown ${after}`);
  if (after) problems.push(`autoFull: the prompt still shows ${(PROMPT_MS + PROMPT_SLACK_MS) / 1000} s later`);
}

/** Back to window clicked: kept in the cookie, and the next visit doesn't ask. */
async function backKept(lab: Lab, spy: FullScreenSpy, canary: boolean, lines: string[], problems: string[]) {
  armAutoFullScreen(true);
  await lab.click(spot());
  await settle();
  const back = document.querySelector<HTMLElement>('#full-prompt .fp-back');
  if (!back?.checkVisibility()) {
    problems.push('autoFull: no Back to window shown');
    return;
  }
  await lab.click(middleOf(back));
  const kept = readCookie(AUTO_FULL_COOKIE);
  lines.push(`  Back to window clicked: the prompt shown ${promptShown()}, kept ${kept}`);
  if (promptShown()) problems.push('autoFull: Back to window clicked, the prompt still shows');
  if (kept !== 'off') problems.push(`autoFull: Back to window clicked, the cookie kept ${kept}`);
  if (canary) removeCookie(AUTO_FULL_COOKIE);
  armAutoFullScreen(true);
  const before = spy.asks;
  await lab.click(spot());
  await settle();
  const asked = spy.asks - before;
  lines.push(`  the next visit's first click: ${FULL_CANARY.name} ${asked}`);
  if (asked !== 0) problems.push(`autoFull: after Back to window, the next visit ${FULL_CANARY.name} ${asked} times`);
}

/** The page's full screen stood in for: what's full screen, how it's left, and the Keyboard Lock API, which a browser
 *  has (`lockable`) or not. Each change is announced as a browser announces it, after the call. */
class FullStateSpy {
  full: Element | null = null;
  lockable = true;
  locks: string[][] = [];
  unlocks = 0;
  private readonly keyboard = {
    lock: (codes: string[] = []): Promise<void> => {
      this.locks.push(codes);
      return Promise.resolve();
    },
    unlock: (): void => {
      this.unlocks += 1;
    },
  };

  constructor() {
    Object.defineProperty(document, 'fullscreenElement', { get: () => this.full, configurable: true });
    const exit = (): Promise<void> => {
      this.change(null);
      return Promise.resolve();
    };
    Object.defineProperty(document, 'exitFullscreen', { value: exit, configurable: true });
    const keyboard = (): unknown => (this.lockable ? this.keyboard : undefined);
    Object.defineProperty(navigator, 'keyboard', { get: keyboard, configurable: true });
  }

  /** Full screen entered or left (`to` null), announced after a turn. */
  change(to: Element | null): void {
    window.setTimeout(() => {
      this.full = to;
      document.dispatchEvent(new Event('fullscreenchange'));
    }, 0);
  }

  /** The browser's own given back. */
  remove(): void {
    Reflect.deleteProperty(document, 'fullscreenElement');
    Reflect.deleteProperty(document, 'exitFullscreen');
    Reflect.deleteProperty(navigator, 'keyboard');
  }
}

/** One way of leaving full screen: in, out as `leave` does, a frame run; whether the pause menu opened. */
async function leftOpens(lab: Lab, spy: FullStateSpy, leave: () => void, canary: boolean): Promise<boolean> {
  spy.change(document.documentElement);
  await waitReal(10);
  leave();
  await waitReal(10);
  if (canary) input.pressed.delete('escape');
  await lab.step(1);
  const opened = G.menuOpen;
  if (opened) {
    await lab.press('Escape');
    await lab.step(1);
  }
  return opened;
}

/** Esc in the page's full screen: the game's, whether the browser can lock it or not. */
async function escKept(lab: Lab, canary: boolean, lines: string[], problems: string[]): Promise<void> {
  const spy = new FullStateSpy();
  try {
    if (G.menuOpen) problems.push('autoFull: the pause menu was open before Esc was tried');
    const heldOpens = await leftOpens(lab, spy, () => spy.change(null), false);
    const locked = spy.locks.some((codes) => codes.includes('Escape'));
    lines.push(`  Esc locked in full screen ${locked}, unlocked as it left ${spy.unlocks > 0}`);
    lines.push(`  left on Esc held (locked): the pause menu opened ${heldOpens}`);
    if (!locked) problems.push('autoFull: in full screen, Esc was never locked for the game');
    if (spy.unlocks === 0) problems.push('autoFull: out of full screen, Esc was never let go');
    if (heldOpens) problems.push('autoFull: left on Esc held, the pause menu opened as well');
    spy.lockable = false;
    const tookOpens = await leftOpens(lab, spy, () => spy.change(null), canary);
    lines.push(`  left on the browser's Esc (no lock): the pause menu opened ${tookOpens}`);
    if (!tookOpens) problems.push(`autoFull: ${ESC_CANARY.name}, the browser's Esc left full screen and opened nothing`);
    const pageOpens = await leftOpens(lab, spy, leaveFullScreen, false);
    lines.push(`  left by the page (Fullscreen, Back to window): the pause menu opened ${pageOpens}`);
    if (pageOpens) problems.push('autoFull: left by the page, the pause menu opened');
    const original = location.href;
    try {
      const comparison = new URL(original);
      comparison.searchParams.set('keyboardLock', '0');
      history.replaceState(null, '', comparison);
      spy.lockable = true;
      const before = spy.locks.length;
      const opens = await leftOpens(lab, spy, () => spy.change(null), false);
      const disabled = keyboardLockState() === 'disabled' && spy.locks.length === before;
      lines.push(`  native-hook comparison: lock disabled ${disabled}, browser Escape opens pause ${opens}`);
      if (!disabled || !opens) problems.push('autoFull: native-hook comparison either locked keys or lost Escape');
    } finally {
      history.replaceState(null, '', original);
    }
  } finally {
    spy.remove();
  }
}

/**
 * The automatic full screen (`autoFull`): a finger's tap, then the mouse's click, then Back to window, as
 * `FullScreenSpy` stands in for the browser. The cookie is taken away and the prompt hidden after, as a first visit
 * has neither.
 */
export async function autoFullChecked(lab: Lab, canary: boolean): Promise<FullFound> {
  const lines: string[] = [];
  const problems: string[] = [];
  const spy = new FullScreenSpy();
  try {
    removeCookie(AUTO_FULL_COOKIE);
    await fingerAsks(lab, spy, lines, problems);
    await mouseShowsPrompt(lab, spy, lines, problems);
    await backKept(lab, spy, canary, lines, problems);
    await escKept(lab, canary, lines, problems);
  } finally {
    spy.remove();
    hidePrompt();
    removeCookie(AUTO_FULL_COOKIE);
  }
  return { lines, problems };
}
