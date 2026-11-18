// `lab ui`'s `help` state (`../uiKit.ts` `Steps`): How to play.
import { showHelp } from '../../../../src/ui/menus';
import type { Steps } from '../uiKit';

/** How to play, opened from the panels' link, or as the village's notice board opens it. */
function openHelp(): void {
  const link = document.getElementById('btn-help');
  if (link) link.click();
  else showHelp(true);
}

function closeHelp(): void {
  document.getElementById('help')!.classList.add('hidden');
}

const STATE: Steps = {
  order: 40,
  open: openHelp,
  close: closeHelp,
};
export default STATE;
