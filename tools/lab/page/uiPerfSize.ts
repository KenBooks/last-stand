// `lab ui`'s performance overlay sizes (src/ui/perfHud.ts; the pause menu's Performance stats: Off | Mini | Full).
// `perfMini` shows the overlay whole, then presses Mini in the pause menu with the mouse, as a player does, and
// pictures it: only the frame rate and its graph may show, drawn, within the window and in a third of Full's room at
// the most, the press kept in the overlay's cookie and its button lit. Then Full and Off are pressed and held to the
// same, and the cookie of the builds before Mini ('1': shown) must read as Full. Its canary loses the cookie before
// it's read back, which must be caught unsaved.
import type { Lab } from './lab';
import { pauseTab, showPause } from '../../../src/ui/menus';
import {
  PERF_HUD_COOKIE, keptPerfHudSize, perfHudSize, setPerfHudSize, type PerfHudSize,
} from '../../../src/ui/perfHud';
import { readCookie, removeCookie, writeCookie } from '../../../src/core/cookies';

/** What the state found besides its boxes: lines for its report, and its problems. */
export interface PerfSizeFound {
  lines: string[];
  problems: string[];
}

/** the problem the canary must raise */
export const PERF_SIZE_CANARY = { name: 'unsaved', what: 'the overlay\'s size set but never saved' };
/** frames run after a size is set, for the overlay to draw (it draws every 250 ms) */
const DRAW_FRAMES = 40;
/** the most of Full's area Mini may take */
const MINI_SHARE = 1 / 3;
/** what Mini shows, and what it must hide */
const MINI_SHOWN = ['.pf-head [data-p="fps"]', '.pf-graph'];
const MINI_HIDDEN = ['.pf-ms', '.pf-sub', 'dl', '.pf-gpu', '.pf-copy'];
/** the cookie of the builds before Mini, for an overlay that was shown */
const OLD_SHOWN = '1';

let fullArea = 0;
let loseCookie = false;

const overlay = (): HTMLElement => document.querySelector<HTMLElement>('#perf')!;
const areaOf = (box: DOMRect): number => box.width * box.height;

/** `size`'s button pressed in the pause menu's Settings with the mouse, the menu closed again and the overlay
 *  drawn: whether the button was lit. */
async function press(lab: Lab, size: PerfHudSize): Promise<boolean> {
  showPause(true);
  pauseTab('settings');
  const button = document.querySelector<HTMLElement>(`#opt-perf [data-perf="${size}"]`);
  if (!button?.checkVisibility()) {
    showPause(false);
    return false;
  }
  await lab.clickOn(button);
  const lit = button.classList.contains('active');
  showPause(false);
  await lab.step(DRAW_FRAMES);
  return lit;
}

/** The overlay shown whole and measured, then Mini pressed in the pause menu. With the canary, its cookie is lost. */
export async function openPerfMini(lab: Lab, canary: boolean): Promise<void> {
  loseCookie = canary;
  setPerfHudSize('full', false);
  await lab.step(DRAW_FRAMES);
  fullArea = areaOf(overlay().getBoundingClientRect());
  await press(lab, 'mini');
  if (loseCookie) removeCookie(PERF_HUD_COOKIE);
}

/** The overlay put away, its cookie taken away as a first visit has none. */
export function closePerfMini(): void {
  setPerfHudSize('off', false);
  removeCookie(PERF_HUD_COOKIE);
}

/** Mini as it shows: its parts, its room against Full's and the window, and its cookie. */
function miniShown(): PerfSizeFound {
  const problems: string[] = [];
  const panel = overlay();
  if (!panel.checkVisibility() || perfHudSize() !== 'mini') {
    return { lines: [], problems: [`perfMini: Mini pressed, the overlay is ${perfHudSize()}`] };
  }
  for (const selector of MINI_SHOWN) {
    if (!panel.querySelector(selector)?.checkVisibility()) problems.push(`perfMini: Mini shows no ${selector}`);
  }
  for (const selector of MINI_HIDDEN) {
    if (panel.querySelector(selector)?.checkVisibility()) problems.push(`perfMini: Mini shows ${selector}`);
  }
  const rate = panel.querySelector('[data-p="fps"]')?.textContent ?? '';
  const drawn = (panel.querySelector('.pf-line')?.getAttribute('d') ?? '').length > 0;
  if (!/^\d/.test(rate)) problems.push(`perfMini: Mini's frame rate reads "${rate}"`);
  if (!drawn) problems.push('perfMini: Mini\'s graph has no line');
  const box = panel.getBoundingClientRect();
  const outside = box.left < 0 || box.top < 0 || box.right > innerWidth || box.bottom > innerHeight;
  if (outside) problems.push('perfMini: Mini reaches past the window');
  const share = areaOf(box) / fullArea;
  if (!(share <= MINI_SHARE)) problems.push(`perfMini: Mini takes ${(share * 100).toFixed(0)}% of Full's room`);
  const kept = readCookie(PERF_HUD_COOKIE);
  if (kept !== 'mini') problems.push(`perfMini: Mini ${PERF_SIZE_CANARY.name} (the cookie: ${kept})`);
  const lines = [
    `  Mini pressed: ${Math.round(box.width)}x${Math.round(box.height)} css px, ${(share * 100).toFixed(0)}% of `
      + `Full's room, the frame rate ${rate}, the graph ${drawn ? 'drawn' : 'empty'}, kept ${kept}`,
  ];
  return { lines, problems };
}

/** `size` pressed after Mini: the overlay must take it, its button lit and its cookie saying so. */
async function pressed(lab: Lab, size: PerfHudSize): Promise<PerfSizeFound> {
  const problems: string[] = [];
  const lit = await press(lab, size);
  const shown = overlay().checkVisibility();
  const kept = readCookie(PERF_HUD_COOKIE);
  if (perfHudSize() !== size) problems.push(`perfMini: ${size} pressed, the overlay is ${perfHudSize()}`);
  const seen = shown ? 'shown' : 'hidden';
  if (shown !== (size !== 'off')) problems.push(`perfMini: ${size} pressed, the overlay is ${seen}`);
  if (overlay().classList.contains('mini')) problems.push(`perfMini: ${size} pressed, the overlay is still Mini's`);
  if (!lit) problems.push(`perfMini: ${size} pressed, its button isn't lit`);
  if (kept !== size) problems.push(`perfMini: ${size} pressed, the cookie kept ${kept}`);
  const line = `  ${size} pressed: the overlay ${seen}, its button ${lit ? 'lit' : 'unlit'}, kept ${kept}`;
  return { lines: [line], problems };
}

/** The cookie of the builds before Mini read as the size it meant. */
function oldCookieRead(): PerfSizeFound {
  writeCookie(PERF_HUD_COOKIE, OLD_SHOWN);
  const read = keptPerfHudSize();
  const problems = read === 'full' ? [] : [`perfMini: the old cookie "${OLD_SHOWN}" reads as ${read}`];
  return { lines: [`  the old cookie "${OLD_SHOWN}" (shown): read as ${read}`], problems };
}

/** Mini as pictured, then Full and Off pressed, and the old cookie read (`perfMini`). */
export async function perfMiniChecked(lab: Lab): Promise<PerfSizeFound> {
  const found = [miniShown(), await pressed(lab, 'full'), await pressed(lab, 'off'), oldCookieRead()];
  return { lines: found.flatMap((each) => each.lines), problems: found.flatMap((each) => each.problems) };
}
