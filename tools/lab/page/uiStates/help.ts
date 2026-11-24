// `lab ui`'s `help` state (`../uiKit.ts` `Steps`): How to play.
import { showHelp } from '../../../../src/ui/menus';
import { asked, caught } from '../uiKit';
import type { Steps } from '../uiKit';
import { KEYBOARD_CANARY, keyboardWhole, plantKeyboardFitted } from '../uiKeyboard';

/** How to play, opened as the village's notice board opens it (with `--canary`, its keyboard fitted to its rows). */
function openHelp(): void {
  showHelp(true);
  if (asked.canary) plantKeyboardFitted();
}

function closeHelp(): void {
  document.getElementById('help')!.classList.add('hidden');
}

const STATE: Steps = {
  order: 40,
  open: openHelp,
  close: closeHelp,
  check: keyboardWhole,
  canary: caught(KEYBOARD_CANARY),
};
export default STATE;
