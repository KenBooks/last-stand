// `lab ui`'s `decisionTouch` state (`../uiKit.ts` `Steps`): the choice after a wave in touch mode (`../uiTouch.ts`).
import { closeDecisionTouch, decisionTouchShown, openDecisionTouch, TOUCH_CANARIES } from '../uiTouch';
import { caught } from '../uiKit';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 530,
  inRun: true,
  open: openDecisionTouch,
  close: closeDecisionTouch,
  check: decisionTouchShown,
  canary: caught(TOUCH_CANARIES.decisionTouch),
};
export default STATE;
