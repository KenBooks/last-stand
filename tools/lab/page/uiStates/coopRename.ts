// `lab ui`'s `coopRename` state (`../uiKit.ts` `Steps`): the Play together dialog asking to rename, its tag taken
// (`../uiCoop.ts`).
import { closeCoopDialog, COOP_CANARY, coopShown, openCoopRename } from '../uiCoop';
import { caught } from '../uiKit';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 180,
  open: openCoopRename,
  close: closeCoopDialog,
  check: (canary) => coopShown('coopRename', canary),
  canary: caught(COOP_CANARY),
};
export default STATE;
