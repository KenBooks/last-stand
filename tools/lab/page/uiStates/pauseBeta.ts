// `lab ui`'s `pauseBeta` state (`../uiKit.ts` `Steps`): the pause menu's Beta tab (`../uiPause.ts`).
import { closePause, openPause, PAUSE_CANARY, pauseShown } from '../uiPause';
import { asked, caught } from '../uiKit';
import type { Steps } from '../uiKit';
// (the features to try: the village's switch, its note and, once switched, Reload)

const STATE: Steps = {
  order: 430,
  inRun: true,
  open: () => openPause('beta', asked.canary),
  close: closePause,
  check: () => pauseShown('beta'),
  canary: caught(PAUSE_CANARY),
};
export default STATE;
