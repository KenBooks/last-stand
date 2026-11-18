// `lab ui`'s `autoFull` state (`../uiKit.ts` `Steps`): full screen asked for by the first press, and Esc kept for pause
// (`../uiFullScreen.ts`).
import { autoFullChecked, autoFullPictures, ESC_CANARY, FULL_CANARY } from '../uiFullScreen';
import { caught } from '../uiKit';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 310,
  open: () => undefined,
  close: () => undefined,
  check: (canary, lab) => autoFullChecked(lab, canary),
  pictures: async () => autoFullPictures(),
  canary: caught(FULL_CANARY, ESC_CANARY),
};
export default STATE;
