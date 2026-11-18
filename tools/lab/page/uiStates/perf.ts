// `lab ui`'s `perf` state (`../uiKit.ts` `Steps`): the performance overlay.
import { setPerfHud } from '../../../../src/ui/perfHud';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 340,
  inRun: true,
  open: () => setPerfHud(true, false),
  close: () => setPerfHud(false, false),
};
export default STATE;
