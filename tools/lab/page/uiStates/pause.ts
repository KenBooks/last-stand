// `lab ui`'s `pause` state (`../uiKit.ts` `Steps`): the pause menu's Controls tab (`../uiPause.ts`).
import { closePause, openPause, PAUSE_CANARY, pauseShown } from '../uiPause';
import { asked, caught } from '../uiKit';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 400,
  inRun: true,
  open: () => openPause('controls', asked.canary),
  close: closePause,
  check: () => pauseShown('controls'),
  canary: caught(PAUSE_CANARY),
};
export default STATE;
