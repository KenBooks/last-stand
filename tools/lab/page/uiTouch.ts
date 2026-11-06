// tools/lab ui `hudTouch` and `decisionTouch`: the run's HUD on a touch screen, as a phone held sideways shows it.
// - hudTouch: the touch HUD's corners against the screen's edges. The top corners sit at the edge, clear of a camera
//   cutout's safe area (a cutout sits in the middle of a phone's short side held sideways, and the minimap's corner
//   never took it): on the owner's phone the pause button, the menu button and the bars stood a cutout's inset and a
//   margin in from the left edge, the minimap a margin from the right. And none of the corners' controls over another.
// - decisionTouch: the choice after a wave on a short screen (height 520 or less): within the window's top share, its
//   buttons a finger's height. It covered the top 40% of the owner's phone, over the hero.
// A canary each: the pause button moved a cutout's inset in, the choice's padding doubled.
import { G } from '../../../src/state';
import { showDecision } from '../../../src/ui/hud';
import { makeItem } from '../../../src/loot/items';
import type { RarityId } from '../../../src/types';
import type { Lab } from './lab';
import { closeDecision, labelsOnOneLine } from './uiDecision';

/** What a state found besides its boxes: lines for its report, and its problems. */
export interface TouchFound {
  lines: string[];
  problems: string[];
}

/** the most a top corner's control may stand in from its edge of the window (css px) */
const EDGE_PX = 24;
/** the touch HUD's controls round the screen's corners, which none may lie over another */
const CORNERS = ['#btn-pause', '#btn-full', '#btn-scores', '#bottombar', '#minimap-wrap', '#touch-skills'];
/** a short screen's height (css px; the short-screen layout, src/ui/AGENTS.md) */
const SHORT_SCREEN = 520;
/** the most of a short screen's height the choice after a wave may reach down */
const DECISION_SHARE = 0.3;
/** the least height of the choice's buttons (css px): a finger's */
const BUTTON_PX = 28;
/** where a finger taps the world to put the page in touch mode, as shares of the window (clear of every control) */
const TAP_AT = { x: 0.5, y: 0.4 };
/** frames run after the tap, for the touch controls to show */
const TOUCH_FRAMES = 2;
/** the run's bag as the choice shows it: a rare and a common, as on the owner's phone (their chips beside the risk) */
const BAG: RarityId[] = ['rare', 'common'];
/** what the canaries plant: the pause button a cutout's inset further in, the choice's padding doubled */
const CANARY_INSET_PX = 40;
const CANARY_PADDING = '40px 22px';
/** the problems each canary must raise */
export const TOUCH_CANARIES = {
  hudTouch: { name: 'stands in from', what: 'the pause button moved in from the edge' },
  decisionTouch: { name: 'reaches down', what: 'the choice padded twice over' },
};

/** The page put in touch mode by a finger's tap on the world, as a player's first touch puts it (if it isn't). */
async function touchMode(lab: Lab): Promise<void> {
  if (document.body.classList.contains('touch')) return;
  await lab.tap({ x: innerWidth * TAP_AT.x, y: innerHeight * TAP_AT.y });
  await lab.step(TOUCH_FRAMES);
}

/** `selector`'s element's box, or null when it shows nothing. */
function boxOf(selector: string): DOMRect | null {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element?.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return null;
  const box = element.getBoundingClientRect();
  return box.width >= 1 && box.height >= 1 ? box : null;
}

/** The screen's safe-area insets as the page reads them (`env(safe-area-inset-*)`, css px). */
function safeArea(): { left: number; right: number } {
  const probe = document.createElement('div');
  probe.style.cssText = 'position: fixed; visibility: hidden; '
    + 'padding-left: env(safe-area-inset-left, 0px); padding-right: env(safe-area-inset-right, 0px)';
  document.body.append(probe);
  const style = getComputedStyle(probe);
  const insets = { left: parseFloat(style.paddingLeft), right: parseFloat(style.paddingRight) };
  probe.remove();
  return insets;
}

/** Whether boxes `a` and `b` overlap. */
function overlap(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** Each pair of the corners' controls shown where one lies over the other. */
function overlapping(): string[] {
  const shown = CORNERS.map((selector) => ({ selector, box: boxOf(selector) })).filter((part) => part.box);
  const pairs: string[] = [];
  for (let i = 0; i < shown.length; i++) {
    for (let j = i + 1; j < shown.length; j++) {
      if (overlap(shown[i].box!, shown[j].box!)) pairs.push(`${shown[i].selector} over ${shown[j].selector}`);
    }
  }
  return pairs;
}

/** The touch HUD's top corners against the window's edges: lines and problems. */
function cornersFound(): TouchFound {
  const insets = safeArea();
  const lines = [`  the safe area's insets: ${insets.left} px left, ${insets.right} px right`];
  const problems: string[] = [];
  if (!document.body.classList.contains('touch')) problems.push('hudTouch: the tap left the page out of touch mode');
  for (const selector of ['#btn-pause', '#btn-full', '#btn-scores', '#bottombar']) {
    const box = boxOf(selector);
    if (!box) continue;
    lines.push(`  ${selector} from the left edge: ${box.left.toFixed(1)} px`);
  }
  const pause = boxOf('#btn-pause');
  if (!pause) problems.push('hudTouch: no pause button shown');
  else if (pause.left > EDGE_PX) {
    const inFrom = pause.left.toFixed(1);
    problems.push(`hudTouch: the pause button stands in from the left edge ${inFrom} px (${EDGE_PX} at most)`);
  }
  const map = boxOf('#minimap');
  if (map) {
    const gap = innerWidth - map.right;
    lines.push(`  #minimap from the right edge: ${gap.toFixed(1)} px`);
    if (gap > EDGE_PX) problems.push(`hudTouch: the minimap stands in from the right edge ${gap.toFixed(1)} px`);
  }
  for (const pair of overlapping()) problems.push(`hudTouch: ${pair}`);
  return { lines, problems };
}

/** The run's HUD in touch mode. */
export async function openHudTouch(lab: Lab): Promise<void> {
  await touchMode(lab);
}

/** The touch HUD's corners checked; with the canary, again with the pause button moved in, which must be found. */
export function hudTouchShown(canary: boolean): TouchFound {
  const found = cornersFound();
  if (!canary) return found;
  const pause = document.getElementById('btn-pause')!;
  pause.style.marginLeft = `${CANARY_INSET_PX}px`;
  const planted = cornersFound();
  pause.style.marginLeft = '';
  return { lines: found.lines, problems: [...found.problems, ...planted.problems] };
}

/** The choice after a wave in touch mode, the run's bag holding `BAG`, its details unfolded and its opening over. */
export async function openDecisionTouch(lab: Lab): Promise<void> {
  await touchMode(lab);
  if (G.run) G.run.bag = BAG.map((rarity) => makeItem({ slot: 'weapon', rarity }));
  showDecision();
  for (const animation of document.getElementById('decision')!.getAnimations({ subtree: true })) animation.finish();
}

/** The choice put away again. */
export function closeDecisionTouch(): void {
  closeDecision();
  if (G.run) G.run.bag = [];
}

/** The choice's box against a short screen's top share, and its buttons' height: lines and problems. */
function choiceFound(): TouchFound {
  const box = boxOf('#decision');
  if (!box) return { lines: [], problems: ['decisionTouch: the choice after a wave isn\'t shown'] };
  const share = box.bottom / innerHeight;
  const size = `${box.width.toFixed(0)}x${box.height.toFixed(0)} px`;
  const lines = [`  the choice: ${size}, down to ${(share * 100).toFixed(1)}% of the window's height`];
  const problems: string[] = [];
  if (innerHeight <= SHORT_SCREEN && share > DECISION_SHARE) {
    problems.push(`decisionTouch: the choice reaches down ${(share * 100).toFixed(1)}% of a short screen `
      + `(${DECISION_SHARE * 100}% at most)`);
  }
  for (const button of document.querySelectorAll<HTMLElement>('#decision .dc-buttons .btn')) {
    const height = button.getBoundingClientRect().height;
    lines.push(`  ${button.textContent?.trim()}: ${height.toFixed(1)} px tall`);
    if (height < BUTTON_PX) {
      problems.push(`decisionTouch: a button ${height.toFixed(1)} px tall (${BUTTON_PX} at least)`);
    }
  }
  const labels = labelsOnOneLine('decisionTouch');
  lines.push(...labels.lines);
  problems.push(...labels.problems);
  if (box.right > innerWidth || box.left < 0) problems.push('decisionTouch: the choice reaches past the window');
  for (const selector of CORNERS) {
    const other = boxOf(selector);
    if (other && overlap(box, other)) problems.push(`decisionTouch: the choice lies over ${selector}`);
  }
  return { lines, problems };
}

/** The choice checked; with the canary, again padded twice over, which must be found. */
export function decisionTouchShown(canary: boolean): TouchFound {
  const found = choiceFound();
  if (!canary || innerHeight > SHORT_SCREEN || !G.run) return found;
  const box = document.getElementById('decision')!;
  box.style.padding = CANARY_PADDING;
  const planted = choiceFound();
  box.style.padding = '';
  return { lines: found.lines, problems: [...found.problems, ...planted.problems] };
}
