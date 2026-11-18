// The skill tooltips' states of `lab ui` (`uiStates/skillTips.ts` by the mouse over the hotbar, `skillTipsTouch.ts` by
// a finger's tap in the lobby): each skill a player can reach opened, its box kept, and every one within the window.
import { middleOf } from './lab';
import { asked, boxText, share } from './uiKit';
import type { Found } from './uiKit';

/** A skill's tooltip as it was opened over its slot: the skill's name and the tooltip's box (css px). */
interface SkillTip {
  name: string;
  box: DOMRect;
  /** pinned where it opened, as a tap pins it */
  pinned: boolean;
}

/** the skill tooltips the `skillTips` states opened, and the slot whose tooltip is the tallest */
let skillTips: SkillTip[] = [];
let tallestSlot: HTMLElement | null = null;
/** the slots holding a skill a player could reach when they were opened, and what opened them */
let skillSlots = 0;
let openedBy = 'the mouse';

/** A block as tall as the window, the canary's. */
function windowTall(): HTMLElement {
  const block = document.createElement('div');
  block.style.height = `${innerHeight}px`;
  return block;
}

/** The tooltip's box if it shows, null if not. */
function tooltipBox(): DOMRect | null {
  const tip = document.getElementById('tooltip')!;
  if (!tip.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return null;
  return tip.getBoundingClientRect();
}

/** Whether a player can reach `slot`: what lies at its middle is in it (not scrolled out of view, none over it). */
export function reachable(slot: HTMLElement): boolean {
  const middle = middleOf(slot);
  const under = document.elementFromPoint(middle.x, middle.y);
  return !!under && slot.contains(under);
}

/**
 * Each skill's tooltip of `slots` a player can reach opened by `open` as a player opens it (`by`: what opens it, for
 * the report), its box kept (`closeEach` closing it after); then the tallest opened again for the picture. With the
 * canary, each tooltip is made as tall as the window: the check must find it past the window.
 */
export async function openEach(
  slots: HTMLElement[], by: string, open: (slot: HTMLElement) => Promise<void>, closeEach: () => unknown,
): Promise<void> {
  skillTips = [];
  tallestSlot = null;
  openedBy = by;
  const reached = slots.filter(reachable);
  skillSlots = reached.length;
  for (const slot of reached) {
    await open(slot);
    if (asked.canary) document.querySelector('#tooltip .tt-card')?.append(windowTall());
    const box = tooltipBox();
    const name = document.querySelector('#tooltip .tt-name')?.textContent ?? '?';
    const pinned = !!document.querySelector('#tooltip.pinned');
    await closeEach();
    if (!box) continue;
    skillTips.push({ name, box, pinned });
    if (box.height >= Math.max(...skillTips.map((tip) => tip.box.height))) tallestSlot = slot;
  }
  if (tallestSlot) await open(tallestSlot);
}

/** Every skill a player can reach showing its tooltip, each within the window. */
export function skillTipsShown(): Found {
  const tallest = skillTips.reduce((most, tip) => Math.max(most, tip.box.height), 0);
  const height = `the tallest ${share(tallest, innerHeight)}% of the window`;
  const lines = [`  skill tooltips by ${openedBy}: ${skillTips.length} of ${skillSlots} skills, ${height}`];
  const problems: string[] = [];
  if (!skillSlots) problems.push('skills: no skill a player can reach');
  if (skillTips.length < skillSlots) {
    problems.push(`skills: ${skillSlots - skillTips.length} skills showed no tooltip by ${openedBy}`);
  }
  const loose = skillTips.filter((tip) => !tip.pinned).length;
  if (openedBy === 'a tap' && loose) problems.push(`skills: ${loose} skills' tooltips by a tap weren't pinned`);
  for (const { name, box } of skillTips) {
    const inside = box.left >= -0.5 && box.top >= -0.5 && box.right <= innerWidth + 0.5;
    if (inside && box.bottom <= innerHeight + 0.5) continue;
    const where = boxText({ x: box.x, y: box.y, w: box.width, h: box.height });
    problems.push(`skills: ${name}'s tooltip by ${openedBy} reaches past the window (${where})`);
  }
  return { lines, problems };
}

/** The tooltips as tall as the window, the canary's plant, looked for in what `skillTipsShown` found. */
export function tallTipsCaught(found: Found, state: string): Found {
  const past = found.problems.some((problem) => problem.includes('reaches past the window'));
  const lines = [`  canary: ${past ? 'the tooltips as tall as the window caught' : 'the tall tooltips went unseen'}`];
  if (past) return { lines, problems: [] };
  return { lines, problems: [`${state}: the canary's tooltips as tall as the window went unseen`] };
}
