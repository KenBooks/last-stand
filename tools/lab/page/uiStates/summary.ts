// `lab ui`'s `summary` state (`../uiKit.ts` `Steps`): the run's summary (`../uiSummary.ts`).
import { closeSummary, openSummary, SUMMARY_CANARY, summaryPictures, summaryShown } from '../uiSummary';
import { caught } from '../uiKit';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 480,
  inRun: true,
  open: openSummary,
  close: closeSummary,
  check: summaryShown,
  pictures: summaryPictures,
  canary: caught(SUMMARY_CANARY),
};
export default STATE;
