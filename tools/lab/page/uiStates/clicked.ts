// `lab ui`'s `clicked` state (`../uiKit.ts` `Steps`): the crypt's portal card left by its Leave clicked and a key
// pressed after it: where the focus went.
import { goUse, villageObject } from '../../../../src/game/village';
import type { Lab } from '../lab';
import { CARD_FRAMES, describe, standAt, standBack } from '../uiKit';
import type { Found, Steps } from '../uiKit';

/** the key pressed after the portal card's Leave is clicked: one the game takes in the lobby (a step forward) */
const KEY_AFTER_CLICK = 'KeyW';

/**
 * The crypt's portal used where the hero stands for it, and its card's Leave clicked with the mouse and a game key
 * pressed after it, as a player looks at a portal, leaves it and plays on, each as the browser gets it from a mouse
 * and a keyboard (the class buttons that stood in the lobby kept the focus so). Throws if the card never opened or
 * the click never reached its button.
 */
async function clickClass(lab: Lab): Promise<void> {
  const portal = villageObject('crypt');
  if (!portal) throw new Error('lab: ui: the village has no crypt\'s portal');
  await standAt(lab, portal.stand, lab.player.facing);
  goUse(portal);
  await lab.step(CARD_FRAMES);
  const button = document.querySelector<HTMLElement>('#vcard:not(.hidden) .vc-close');
  if (!button) throw new Error('lab: ui: the crypt\'s portal opened no card to leave');
  let clicked = false;
  const heard = (event: MouseEvent) => {
    clicked = event.detail > 0;
  };
  button.addEventListener('click', heard, { once: true });
  const box = button.getBoundingClientRect();
  await lab.click({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
  button.removeEventListener('click', heard);
  if (!clicked) throw new Error('lab: ui: the mouse\'s click never reached the card\'s Leave');
  await lab.press(KEY_AFTER_CLICK);
}

/**
 * Where the focus is after the click and the key, and whether the browser shows its focus ring. A button keeping it
 * is a problem: the game's next key shows the ring round it (clipped by its group's frame, a second border down its
 * side), and Space or Enter presses it again.
 */
function focusAfterClick(): Found {
  const focused = document.activeElement;
  const holder = focused && focused !== document.body ? describe(focused) : 'nothing';
  const ring = document.querySelector(':focus-visible');
  const lines = [`  focus: ${holder}`, `  focus ring: ${ring ? describe(ring) : 'none'}`];
  const kept = focused?.closest('button');
  const problems = kept ? [`the button clicked kept the focus (${describe(kept)})`] : [];
  return { lines, problems };
}

const STATE: Steps = {
  order: 90,
  open: clickClass,
  close: standBack,
  check: focusAfterClick,
};
export default STATE;
