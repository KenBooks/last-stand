// `lab ui`'s `coop` state (`../uiKit.ts` `Steps`): the Play together dialog opened by its button (`../uiCoop.ts`).
import { closeCoopDialog, COOP_CANARY, coopShown, openCoopPicked } from '../uiCoop';
import { caught } from '../uiKit';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 170,
  open: openCoopPicked,
  close: closeCoopDialog,
  check: (canary) => coopShown('coop', canary),
  canary: caught(COOP_CANARY),
};
export default STATE;
