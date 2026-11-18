// `lab ui`'s `pausePerformance` state (`../uiKit.ts` `Steps`): the pause menu's Performance tab as a profile leaves it
// (`../uiPause.ts`).
import { closePauseProfiled, openPauseProfiled, PAUSE_CANARY, pauseShown } from '../uiPause';
import { asked, caught } from '../uiKit';
import type { Steps } from '../uiKit';
// (as a profile leaves it, its costliest parts and Send shown: the tab at its fullest)

const STATE: Steps = {
  order: 420,
  inRun: true,
  open: () => openPauseProfiled(asked.canary),
  close: closePauseProfiled,
  check: () => pauseShown('performance'),
  canary: caught(PAUSE_CANARY),
};
export default STATE;
