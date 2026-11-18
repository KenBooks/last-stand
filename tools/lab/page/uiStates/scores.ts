// `lab ui`'s `scores` state (`../uiKit.ts` `Steps`): the scores, shown while Tab is held.
import type { Frame } from '../lab';
import type { Steps } from '../uiKit';

/** frames Tab is held for the scores */
const SCORES_FRAMES = 2;
/** the scores' input: Tab held */
const TAB: Frame = { keys: ['tab'] };

// (shown while Tab is held: pictured with it down, let go after)
const STATE: Steps = {
  order: 330,
  inRun: true,
  open: (lab) => lab.step(SCORES_FRAMES, () => TAB),
  close: (lab) => lab.step(1),
  held: TAB,
};
export default STATE;
