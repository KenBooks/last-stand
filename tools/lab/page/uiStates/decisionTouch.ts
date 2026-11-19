// `lab ui`'s `decisionTouch` state (`../uiKit.ts` `Steps`): the choice after a wave in touch mode (`../uiTouch.ts`).
import { closeDecisionTouch, decisionTouchShown, openDecisionTouch, SHORT_SCREEN, TOUCH_CANARIES } from '../uiTouch';
import { caught } from '../uiKit';
import type { Found, Steps } from '../uiKit';

/** The canary looked for where it's planted: on a short screen alone, where the choice must keep to the top quarter
 *  (on a taller one it's planted nowhere, and every run of `ui --canary` on its own screen called it unseen). */
function canary(found: Found, state: string): Found {
  if (innerHeight > SHORT_SCREEN) return { lines: ['  canary: none on a screen this tall'], problems: [] };
  return caught(TOUCH_CANARIES.decisionTouch)(found, state);
}

const STATE: Steps = {
  order: 530,
  inRun: true,
  open: openDecisionTouch,
  close: closeDecisionTouch,
  check: decisionTouchShown,
  canary,
};
export default STATE;
