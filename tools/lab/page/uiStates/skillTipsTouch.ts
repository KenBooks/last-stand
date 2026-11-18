// `lab ui`'s `skillTipsTouch` state (`../uiKit.ts` `Steps`): the lobby's skill tooltips, each opened by a finger's tap
// (`../uiSkillTips.ts`).
import { openBook } from '../../../../src/ui/loadoutEditor';
import { hideTooltip } from '../../../../src/ui/tooltip';
import { middleOf } from '../lab';
import type { Lab } from '../lab';
import { panelsBack, showPanels } from '../lobbyPanels';
import { openEach, reachable, skillTipsShown, tallTipsCaught } from '../uiSkillTips';
import { settleAnimations, TOUCH_FRAMES } from '../uiKit';
import type { Steps } from '../uiKit';

/**
 * A finger's tap at `at`, its click and all, and the frames after it for the touch controls to show; what it set
 * sliding (a panel the rail turned to) brought to rest.
 */
async function tap(lab: Lab, at: { x: number; y: number }): Promise<void> {
  await lab.tap(at);
  await lab.step(TOUCH_FRAMES);
  settleAnimations();
}

/** `element` tapped by a finger if a player can reach it; whether it was. */
async function tapIfReached(lab: Lab, element: HTMLElement | null): Promise<boolean> {
  if (!element || !reachable(element)) return false;
  await tap(lab, middleOf(element));
  return true;
}

/**
 * Each skill's tooltip in the lobby (the class card's, the skill book's) opened by a finger's tap on its slot, as a
 * touch screen opens it (pinned beside the slot; closed after each, as the next tap elsewhere closes it). The book is
 * opened first by taps, as a player opens it: a short screen's rail turned to the skills, and the book's toggle.
 */
async function openSkillTipsTouch(lab: Lab): Promise<void> {
  showPanels('inventory');
  // (the first tap puts the page in touch mode, as a phone starts in it: what a finger reaches is judged in it)
  await tapIfReached(lab, document.querySelector<HTMLElement>('#lobby-rail [data-lt="skills"]'));
  // (a short screen shows it whole, with no toggle)
  const book = document.getElementById('lo-book')!;
  if (!book.checkVisibility()) await tapIfReached(lab, document.getElementById('lo-toggle'));
  if (!book.checkVisibility()) {
    const tab = document.getElementById('menu')!.dataset.tab;
    throw new Error(`lab: ui: the taps never opened the skill book (the lobby's tab: ${tab})`);
  }
  const slots = [...document.querySelectorAll<HTMLElement>('.cc-skills .slot:not(.empty), #lo-book .slot')];
  await openEach(slots, 'a tap', (slot) => tap(lab, middleOf(slot)), hideTooltip);
}

/**
 * The tooltip and the book closed, the rail turned back to the hero, and the mouse moved, which puts the page back in
 * mouse mode for the states after.
 */
async function closeSkillTipsTouch(lab: Lab): Promise<void> {
  hideTooltip();
  openBook(false);
  document.querySelector<HTMLElement>('#lobby-rail [data-lt="hero"]')?.click();
  panelsBack();
  await lab.mouseTo({ x: innerWidth / 2, y: innerHeight / 2 });
  await lab.mouseTo({ x: innerWidth / 2 + 1, y: innerHeight / 2 });
  if (document.body.classList.contains('touch')) throw new Error('lab: ui: the mouse left the page in touch mode');
}

const STATE: Steps = {
  order: 250,
  open: openSkillTipsTouch,
  close: closeSkillTipsTouch,
  check: skillTipsShown,
  canary: tallTipsCaught,
};
export default STATE;
