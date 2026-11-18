// `lab ui`'s `sheetTouch` state (`../uiKit.ts` `Steps`): a stash shield's sheet opened by a tap (`../uiSheet.ts`).
import { closeSheetTouch, openSheetTouch, SHEET_CANARIES, sheetTouchShown } from '../uiSheet';
import { caught } from '../uiKit';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 260,
  open: openSheetTouch,
  close: closeSheetTouch,
  check: sheetTouchShown,
  canary: caught(...SHEET_CANARIES.sheetTouch),
};
export default STATE;
