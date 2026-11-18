// `lab ui`'s `pauseLobby` state (`../uiKit.ts` `Steps`): the pause menu in the village: its time of day
// (`../uiHour.ts`).
import { closePauseLobby, HOUR_CANARY, hourShown, openPauseLobby } from '../uiHour';
import { caught } from '../uiKit';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 150,
  open: openPauseLobby,
  close: closePauseLobby,
  check: hourShown,
  canary: caught(HOUR_CANARY),
};
export default STATE;
