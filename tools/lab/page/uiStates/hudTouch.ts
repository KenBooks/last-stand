// `lab ui`'s `hudTouch` state (`../uiKit.ts` `Steps`): the touch HUD's top corners at the screen's edges
// (`../uiTouch.ts`).
import { hudTouchShown, openHudTouch, TOUCH_CANARIES } from '../uiTouch';
import { caught } from '../uiKit';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 520,
  inRun: true,
  open: openHudTouch,
  close: () => undefined,
  check: hudTouchShown,
  canary: caught(TOUCH_CANARIES.hudTouch),
};
export default STATE;
