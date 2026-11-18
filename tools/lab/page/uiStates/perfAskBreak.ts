// `lab ui`'s `perfAskBreak` state (`../uiKit.ts` `Steps`): the performance report's prompt under the choice after a
// wave (`../uiPerfAsk.ts`).
import { ASK_CANARY, closePerfAsk, openPerfAskBreak, perfAskShown } from '../uiPerfAsk';
import { caught } from '../uiKit';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 390,
  inRun: true,
  open: openPerfAskBreak,
  close: closePerfAsk,
  check: (canary) => perfAskShown('perfAskBreak', canary),
  canary: caught(ASK_CANARY),
};
export default STATE;
