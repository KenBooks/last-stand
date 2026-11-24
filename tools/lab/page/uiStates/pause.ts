// `lab ui`'s `pause` state (`../uiKit.ts` `Steps`): the pause menu's Controls tab (`../uiPause.ts`).
import { closePause, openPause, PAUSE_CANARY, pauseShown } from '../uiPause';
import { asked, caught } from '../uiKit';
import { KEYBOARD_CANARY, keyboardWhole, plantKeyboardFitted } from '../uiKeyboard';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 400,
  inRun: true,
  open: () => {
    openPause('controls', asked.canary);
    if (asked.canary) plantKeyboardFitted();
  },
  close: closePause,
  check: () => {
    const shown = pauseShown('controls');
    const keyboard = keyboardWhole();
    return { lines: [...shown.lines, ...keyboard.lines], problems: [...shown.problems, ...keyboard.problems] };
  },
  canary: caught(PAUSE_CANARY, KEYBOARD_CANARY),
};
export default STATE;
