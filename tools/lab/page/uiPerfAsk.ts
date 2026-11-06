// `lab ui`'s states of the prompt asking to send a performance report (src/perf/consent.ts): over the lobby, over the
// choice after a wave, and over it on touch. The prompt must lie inside the window, each button's label on one line
// and a finger's height on touch, and over none of what the screen shows round it (the choice, the touch HUD's
// corners, the bars). Its canary moves it down onto the choice, which must be found.
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { showDecision } from '../../../src/ui/hud';
import { askNow, putAway } from '../../../src/perf/consent';
import { closeDecision, linesOf } from './uiDecision';

/** What a state found besides its boxes: lines for its report, and its problems. */
export interface AskFound {
  lines: string[];
  problems: string[];
}

/** what the prompt may not lie over */
const AROUND = ['#decision', '#wavebadge', '#bottombar', '#btn-pause', '#btn-full', '#btn-scores', '#minimap-wrap',
  '#touch-skills', '#party', '#lobby-rail'];
/** the least height of its buttons on touch (css px): a finger's */
const BUTTON_PX = 28;
/** where a finger taps the world to put the page in touch mode, as shares of the window (clear of every control) */
const TAP_AT = { x: 0.5, y: 0.4 };
const TOUCH_FRAMES = 2;
/** the canary's prompt, moved down to the middle of the window */
const CANARY_TOP = '45%';
/** the problem the canary must raise */
export const ASK_CANARY = { name: 'lies over', what: 'the prompt moved down onto the choice' };

function boxOf(selector: string): DOMRect | null {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element?.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return null;
  const box = element.getBoundingClientRect();
  return box.width >= 1 && box.height >= 1 ? box : null;
}

const overlap = (a: DOMRect, b: DOMRect): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** The prompt shown over the lobby. */
export async function openPerfAsk(lab: Lab): Promise<void> {
  await askNow();
  await lab.step(1);
}

/** The prompt shown over the choice after a wave (the run's state). */
export async function openPerfAskBreak(lab: Lab): Promise<void> {
  showDecision();
  for (const animation of document.getElementById('decision')!.getAnimations({ subtree: true })) animation.finish();
  await openPerfAsk(lab);
}

/** The same in touch mode, put there by a finger's tap on the world. */
export async function openPerfAskTouch(lab: Lab): Promise<void> {
  if (!document.body.classList.contains('touch')) {
    await lab.tap({ x: innerWidth * TAP_AT.x, y: innerHeight * TAP_AT.y });
    await lab.step(TOUCH_FRAMES);
  }
  await openPerfAskBreak(lab);
}

export function closePerfAsk(): void {
  putAway();
  if (G.run) closeDecision();
}

/** The prompt's box, buttons and what's round it: lines and problems, as `state`'s. */
function askFound(state: string): AskFound {
  const box = boxOf('#perf-ask');
  if (!box) return { lines: [], problems: [`${state}: the prompt isn't shown`] };
  const lines = [`  the prompt: ${box.width.toFixed(0)}x${box.height.toFixed(0)} px, from ${box.top.toFixed(0)} px down`];
  const problems: string[] = [];
  if (box.left < 0 || box.top < 0 || box.right > innerWidth || box.bottom > innerHeight) {
    problems.push(`${state}: the prompt reaches past the window`);
  }
  const touch = document.body.classList.contains('touch');
  for (const button of document.querySelectorAll<HTMLElement>('#perf-ask .pa-buttons .btn')) {
    const label = button.textContent?.trim() ?? '';
    const height = button.getBoundingClientRect().height;
    const count = linesOf(button);
    lines.push(`  ${label}: ${count} line${count === 1 ? '' : 's'}, ${height.toFixed(1)} px tall`);
    if (count > 1) problems.push(`${state}: the button "${label}" runs onto ${count} lines`);
    if (touch && height < BUTTON_PX) problems.push(`${state}: "${label}" is ${height.toFixed(1)} px tall (${BUTTON_PX} at least)`);
  }
  if (!document.querySelector('#perf-ask .pa-size')?.textContent?.endsWith('KB')) problems.push(`${state}: no size said`);
  for (const selector of AROUND) {
    const other = boxOf(selector);
    if (other && overlap(box, other)) problems.push(`${state}: the prompt lies over ${selector}`);
  }
  return { lines, problems };
}

/** The prompt checked; with the canary, again moved down onto the choice (the run's states: the lobby has none). */
export function perfAskShown(state: string, canary: boolean): AskFound {
  const found = askFound(state);
  if (!canary || !G.run) return found;
  const box = document.getElementById('perf-ask')!;
  box.style.top = CANARY_TOP;
  const planted = askFound(state);
  box.style.top = '';
  return { lines: found.lines, problems: [...found.problems, ...planted.problems] };
}
