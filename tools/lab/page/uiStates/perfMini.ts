// `lab ui`'s `perfMini` state (`../uiKit.ts` `Steps`): the performance overlay's Mini pressed in the pause menu
// (`../uiPerfSize.ts`).
import { closePerfMini, openPerfMini, PERF_SIZE_CANARY, perfMiniChecked } from '../uiPerfSize';
import { asked, caught } from '../uiKit';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 350,
  inRun: true,
  open: (lab) => openPerfMini(lab, asked.canary),
  close: closePerfMini,
  check: (_canary, lab) => perfMiniChecked(lab),
  canary: caught(PERF_SIZE_CANARY),
};
export default STATE;
