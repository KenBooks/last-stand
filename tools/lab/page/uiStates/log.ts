// `lab ui`'s `log` state (`../uiKit.ts` `Steps`): the battle log with hits dealt and taken (`../uiLog.ts`).
import { closeLog, logShown, openLog } from '../uiLog';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 500,
  inRun: true,
  open: openLog,
  close: closeLog,
  check: logShown,
};
export default STATE;
