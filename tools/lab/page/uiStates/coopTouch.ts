// `lab ui`'s `coopTouch` state (`../uiKit.ts` `Steps`): the Play together dialog on touch, its name tag tapped
// (`../uiCoop.ts`).
import { closeCoopDialog, COOP_CANARY, coopShown, openCoopTouch } from '../uiCoop';
import { caught } from '../uiKit';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 290,
  open: openCoopTouch,
  close: closeCoopDialog,
  check: (canary) => coopShown('coopTouch', canary),
  canary: caught(COOP_CANARY),
};
export default STATE;
