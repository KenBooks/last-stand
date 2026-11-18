// `lab ui`'s `pauseTabKept` state (`../uiKit.ts` `Steps`): the pause menu's tab kept from one opening to the next
// (`../uiPause.ts`).
import { pauseTabKept, TAB_CANARY } from '../uiPause';
import { caught } from '../uiKit';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 460,
  inRun: true,
  open: () => undefined,
  close: () => undefined,
  check: (canary, lab) => pauseTabKept(lab, canary),
  canary: caught(TAB_CANARY),
};
export default STATE;
