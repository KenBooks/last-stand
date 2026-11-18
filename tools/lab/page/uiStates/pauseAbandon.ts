// `lab ui`'s `pauseAbandon` state (`../uiKit.ts` `Steps`): the pause menu's Abandon run, held through
// (`../uiPause.ts`).
import { ABANDON_CANARY, closePauseAbandon, openPauseAbandon, pauseAbandonChecked } from '../uiPause';
import { asked, caught, runSetUp } from '../uiKit';
import type { Steps } from '../uiKit';

/** The menu closed, the run abandoned: the next run state sets one up again. */
function closeAbandoned(): void {
  closePauseAbandon();
  runSetUp.ready = false;
}

const STATE: Steps = {
  order: 470,
  inRun: true,
  open: (lab) => openPauseAbandon(lab, asked.canary),
  close: closeAbandoned,
  check: (_canary, lab) => pauseAbandonChecked(lab),
  canary: caught(ABANDON_CANARY),
};
export default STATE;
