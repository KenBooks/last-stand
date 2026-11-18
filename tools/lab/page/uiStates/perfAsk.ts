// `lab ui`'s `perfAsk` state (`../uiKit.ts` `Steps`): the performance report's prompt over the lobby
// (`../uiPerfAsk.ts`).
import { closePerfAsk, openPerfAsk, perfAskShown } from '../uiPerfAsk';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 140,
  open: openPerfAsk,
  close: closePerfAsk,
  check: (canary) => perfAskShown('perfAsk', canary),
};
export default STATE;
