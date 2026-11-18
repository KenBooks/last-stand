// `lab ui`'s `buttonsTouch` state (`../uiKit.ts` `Steps`): every touch button shown in the lobby and its practice
// (`../uiButtons.ts`).
import { BUTTONS_CANARY, lobbyButtonsShown, openButtonsTouch } from '../uiButtons';
import { caught } from '../uiKit';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 280,
  open: openButtonsTouch,
  close: () => undefined,
  check: lobbyButtonsShown,
  canary: caught(BUTTONS_CANARY),
};
export default STATE;
