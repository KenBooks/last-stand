// tools/lab ui `buttonsTouch` and `buttonsRunTouch`: every touch button tapped by a finger in every place it shows,
// and what it does seen done. In the lobby's practice on a short screen the stowed lobby's rail, gone from sight
// but for its Practice button, lay over the pause and full screen buttons and took their taps: on the owner's phone
// they did nothing ("menu, pause and full screen not clickable").
// - buttonsTouch: the lobby with its panels shown, then its practice (stowed, as its Practice button stows it).
// - buttonsRunTouch: the run's touch HUD.
// Each button shown is checked as a finger finds it: its box clear of every other button's (on main the lobby's
// practice's Back lay half over the pause button on the owner's phone, 751x298 at 3.75, while each middle was
// still its own), its middle the button's (else what lies over it is named),
// and a tap there does what the button is for (the pause menu opened, full screen asked, the scores shown, the
// lobby stowed or shown). Each place is checked again with the overlays down the left shown (the performance
// overlay and the battle log, from the pause menu): the owner had the performance overlay open. The canary lays
// a clear sheet over the pause button, which must be found.
import { G } from '../../../src/state';
import { setBattleLog } from '../../../src/ui/battleLog';
import { menuStowed, toggleMenuStowed } from '../../../src/ui/menus';
import { setPerfHud } from '../../../src/ui/perfHud';
import type { Lab } from './lab';
import { boxOf, touchMode, type TouchFound } from './uiTouch';

/** A button of the touch HUD's or the lobby's, what its tap does and how that's undone. */
interface TouchButton {
  selector: string;
  /** what a tap does, as the report says it */
  does: string;
  /** read before the tap: a function telling, after it, whether the tap did it */
  watch(): () => boolean;
  /** what the tap did put back (by the page's own controls, as a player would) */
  undo(lab: Lab): Promise<void>;
}

/** frames run after a tap, for the game's loop to act on it (a key the button presses is read the next frame) */
const TAP_FRAMES = 2;
/** how far two buttons' boxes may meet, css px each way (a hair of rounding where two stand side by side) */
const OVERLAP_SLACK = 1;
/** what the canary plants, and the problem it must raise */
export const BUTTONS_CANARY = { name: 'lies over #btn-pause', what: 'a clear sheet over the pause button' };
/** the canary's sheet's id */
const SHEET_ID = 'lab-buttons-sheet';

/** how many times the page asked for full screen since `spyFullScreen` */
let fullAsked = 0;

/** The page's asks for full screen counted (the lab's browser refuses each, `node/browser.mjs`). */
function spyFullScreen(): void {
  const root = document.documentElement;
  if (Object.hasOwn(root, 'requestFullscreen')) return;
  const refuse = root.requestFullscreen.bind(root);
  // (one the full screen's own check can stand its spy in for, later in the same run: fixed in place, `ui` whole
  // stopped at `autoFull` with "Cannot redefine property")
  Object.defineProperty(root, 'requestFullscreen', {
    configurable: true,
    value: (options?: FullscreenOptions) => {
      fullAsked++;
      return refuse(options);
    },
  });
}

/** Whether the element `selector` names is shown (not hidden by a class of its own or its parents'). */
function showing(selector: string): boolean {
  const element = document.querySelector(selector);
  return !!element && !element.closest('.hidden');
}

/** A tap on the element `selector` names at its middle. */
async function tapOn(lab: Lab, selector: string): Promise<void> {
  const box = boxOf(selector);
  if (!box) throw new Error(`lab: buttons: ${selector} isn't shown`);
  await lab.tap({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
  await lab.step(TAP_FRAMES);
}

const BUTTONS: TouchButton[] = [
  {
    selector: '#btn-pause',
    does: 'opened the pause menu',
    watch: () => () => G.menuOpen && showing('#pause'),
    undo: async (lab) => {
      document.getElementById('btn-resume')!.click();
      await lab.step(TAP_FRAMES);
    },
  },
  {
    selector: '#btn-full',
    does: 'asked for full screen',
    watch: () => {
      const before = fullAsked;
      return () => fullAsked > before;
    },
    undo: async () => undefined,
  },
  {
    selector: '#btn-scores',
    does: 'showed the scores',
    watch: () => () => showing('#scoreboard'),
    undo: (lab) => tapOn(lab, '#btn-scores'),
  },
  {
    selector: '#rail-practice',
    does: 'stowed the lobby or showed it',
    watch: () => {
      const stowed = menuStowed();
      return () => menuStowed() !== stowed;
    },
    undo: (lab) => tapOn(lab, '#rail-practice'),
  },
];

/** What lies at the middle of `box`, or null when it's `element` (or within it). */
function overIt(element: Element, box: DOMRect): Element | null {
  const at = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
  return at && (at === element || element.contains(at)) ? null : at;
}

/** `element` as the report names it. */
function named(element: Element | null): string {
  if (!element) return 'nothing';
  if (element.id) return `#${element.id}`;
  const classes = [...element.classList].map((name) => `.${name}`).join('');
  const parent = element.parentElement?.closest('[id]');
  return `${element.tagName.toLowerCase()}${classes}${parent ? ` in #${parent.id}` : ''}`;
}

/** The overlays down the left (the performance overlay, the battle log) shown or put away, as the pause menu does. */
async function showOverlays(lab: Lab, shown: boolean): Promise<void> {
  setPerfHud(shown, false);
  setBattleLog(shown, false);
  await lab.step(TAP_FRAMES);
}

/** Each button shown in `place` found and tapped, without the overlays down the left and with them: lines and
 *  problems. */
async function buttonsIn(lab: Lab, state: string, place: string): Promise<TouchFound> {
  const lines: string[] = [];
  const problems: string[] = [];
  for (const overlays of [false, true]) {
    await showOverlays(lab, overlays);
    const found = await buttonsTapped(lab, state, overlays ? `${place}, the overlays shown` : place);
    lines.push(...found.lines);
    problems.push(...found.problems);
  }
  await showOverlays(lab, false);
  return { lines, problems };
}

/** How far boxes `a` and `b` meet, css px across and down (0 or less where they don't). */
function overlapOf(a: DOMRect, b: DOMRect): { across: number; down: number } {
  const across = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const down = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return { across, down };
}

/** The buttons shown in `place` (and the canary's sheet, laid as one) whose boxes meet: lines and problems. */
function overlapsIn(state: string, place: string): TouchFound {
  const lines: string[] = [];
  const problems: string[] = [];
  const selectors = [...BUTTONS.map((button) => button.selector), `#${SHEET_ID}`];
  const shown = selectors.flatMap((selector) => {
    const box = boxOf(selector);
    return box ? [{ selector, box }] : [];
  });
  for (let i = 0; i < shown.length; i++) {
    for (let j = i + 1; j < shown.length; j++) {
      const { across, down } = overlapOf(shown[i].box, shown[j].box);
      if (across <= OVERLAP_SLACK || down <= OVERLAP_SLACK) continue;
      const pair = `${shown[i].selector} and ${shown[j].selector}`;
      lines.push(`    ${pair}: overlap ${across.toFixed(0)}x${down.toFixed(0)} px`);
      problems.push(`${state}: in ${place}, ${pair} overlap by ${across.toFixed(0)}x${down.toFixed(0)} px`);
    }
  }
  return { lines, problems };
}

/** Each button shown in `place` found and tapped: lines and problems. */
async function buttonsTapped(lab: Lab, state: string, place: string): Promise<TouchFound> {
  const overlaps = overlapsIn(state, place);
  const lines = [`  ${place}:`, ...overlaps.lines];
  const problems = [...overlaps.problems];
  for (const button of BUTTONS) {
    const box = boxOf(button.selector);
    if (!box) continue;
    const element = document.querySelector(button.selector)!;
    const over = overIt(element, box);
    if (over) {
      lines.push(`    ${button.selector}: under ${named(over)}`);
      problems.push(`${state}: in ${place}, ${named(over)} lies over ${button.selector}`);
      continue;
    }
    const did = button.watch();
    await tapOn(lab, button.selector);
    const done = did();
    lines.push(`    ${button.selector}: tapped, ${done ? button.does : 'did nothing'}`);
    if (!done) problems.push(`${state}: in ${place}, a tap on ${button.selector} did nothing`);
    else await button.undo(lab);
  }
  return { lines, problems };
}

/** The canary's clear sheet laid over the pause button, or taken away. */
function plantSheet(planted: boolean): void {
  document.getElementById(SHEET_ID)?.remove();
  const box = boxOf('#btn-pause');
  if (!planted || !box) return;
  const sheet = document.createElement('div');
  sheet.id = SHEET_ID;
  sheet.style.cssText = `position: fixed; left: ${box.left}px; top: ${box.top}px; width: ${box.width}px; `
    + `height: ${box.height}px; z-index: 1000`;
  document.body.append(sheet);
}

/** The page in touch mode, its full screen asks counted. */
export async function openButtonsTouch(lab: Lab): Promise<void> {
  await touchMode(lab);
  spyFullScreen();
}

/** The lobby's buttons, its panels shown and then in its practice, checked; with the canary, the sheet planted. */
export async function lobbyButtonsShown(canary: boolean, lab: Lab): Promise<TouchFound> {
  const lines: string[] = [];
  const problems: string[] = [];
  const wasStowed = menuStowed();
  for (const stowed of [false, true]) {
    toggleMenuStowed(stowed);
    await lab.step(TAP_FRAMES);
    plantSheet(canary);
    const found = await buttonsIn(lab, 'buttonsTouch', stowed ? 'the lobby\'s practice' : 'the lobby');
    lines.push(...found.lines);
    problems.push(...found.problems);
  }
  plantSheet(false);
  toggleMenuStowed(wasStowed);
  await lab.step(TAP_FRAMES);
  return { lines, problems };
}

/** The run's buttons checked; with the canary, the sheet planted. */
export async function runButtonsShown(canary: boolean, lab: Lab): Promise<TouchFound> {
  plantSheet(canary);
  const found = await buttonsIn(lab, 'buttonsRunTouch', 'the run');
  plantSheet(false);
  return found;
}
