// `lab ui`'s `litTouch` state (`../uiKit.ts` `Steps`): a worn item pressed long: the stash items that fit its slot lit
// (`../uiSheet.ts`).
import type { Lab } from '../lab';
import {
  closeLitTouch, litTouchPictures, litTouchShown, openLitTouch, plantLitCanary, SHEET_CANARIES,
} from '../uiSheet';
import { asked, caught } from '../uiKit';
import type { Steps } from '../uiKit';

/** The worn item pressed long, the canary planted as the finger lifts when asked for. */
async function openLit(lab: Lab): Promise<void> {
  plantLitCanary(asked.canary);
  await openLitTouch(lab);
}

const STATE: Steps = {
  order: 270,
  open: openLit,
  close: closeLitTouch,
  check: litTouchShown,
  pictures: async () => litTouchPictures(),
  canary: caught(...SHEET_CANARIES.litTouch),
};
export default STATE;
