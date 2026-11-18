// `lab ui`'s `buttonsRunTouch` state (`../uiKit.ts` `Steps`): every touch button shown in a run (`../uiButtons.ts`).
import { BUTTONS_CANARY, runButtonsShown, openButtonsTouch } from '../uiButtons';
import { caught } from '../uiKit';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 550,
  inRun: true,
  open: openButtonsTouch,
  close: () => undefined,
  check: runButtonsShown,
  canary: caught(BUTTONS_CANARY),
};
export default STATE;
