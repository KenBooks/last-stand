// `lab ui`'s `run` state (`../uiKit.ts` `Steps`): the run's HUD with a hurt foe's bar and damage numbers (set up by
// `../ui.ts`).
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 320,
  inRun: true,
  open: () => undefined,
  close: () => undefined,
};
export default STATE;
