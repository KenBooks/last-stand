// `lab ui`'s `profiling` state (`../uiKit.ts` `Steps`): the profiler at work: every panel hidden, its pane at the top
// (`../uiPause.ts`).
import { closeProfiling, openProfiling, PROFILING_CANARY, profilingShown } from '../uiPause';
import { asked, caught } from '../uiKit';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 440,
  inRun: true,
  open: () => openProfiling(asked.canary),
  close: closeProfiling,
  check: profilingShown,
  canary: caught(PROFILING_CANARY),
};
export default STATE;
