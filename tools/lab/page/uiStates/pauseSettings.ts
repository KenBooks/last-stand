// `lab ui`'s `pauseSettings` state (`../uiKit.ts` `Steps`): the pause menu's Settings tab: its colours picked, no hour
// in a run (`../uiPause.ts`).
import type { Lab } from '../lab';
import { hourHiddenInRun } from '../uiHour';
import { closePause, openPause, PAUSE_CANARY, pauseColourChecked, pauseShown } from '../uiPause';
import { asked, caught } from '../uiKit';
import type { Found, Steps } from '../uiKit';

/** Two checks' lines and problems as one. */
const joinFound = (a: Found, b: Found): Found => ({
  lines: [...a.lines, ...b.lines],
  problems: [...a.problems, ...b.problems],
});

/** The tab within the window (with the canary, the tab alone); else its colours picked and no hour in a run. */
async function settingsChecked(canary: boolean, lab: Lab): Promise<Found> {
  if (canary) return pauseShown('settings');
  return joinFound(await pauseColourChecked(lab), hourHiddenInRun());
}

const STATE: Steps = {
  order: 410,
  inRun: true,
  open: () => openPause('settings', asked.canary),
  close: closePause,
  check: settingsChecked,
  canary: caught(PAUSE_CANARY),
};
export default STATE;
