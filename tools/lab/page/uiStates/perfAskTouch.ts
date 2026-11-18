// `lab ui`'s `perfAskTouch` state (`../uiKit.ts` `Steps`): the performance report's prompt on touch
// (`../uiPerfAsk.ts`).
import { ASK_CANARY, closePerfAsk, openPerfAskTouch, perfAskShown } from '../uiPerfAsk';
import { caught } from '../uiKit';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 540,
  inRun: true,
  open: openPerfAskTouch,
  close: closePerfAsk,
  check: (canary) => perfAskShown('perfAskTouch', canary),
  canary: caught(ASK_CANARY),
};
export default STATE;
