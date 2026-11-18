// `lab ui`'s `pauseVolume` state (`../uiKit.ts` `Steps`): the pause menu's volume sliders (`../uiPause.ts`).
import { closePauseVolume, openPauseVolume, pauseVolumeChecked, VOLUME_CANARY } from '../uiPause';
import { asked, caught } from '../uiKit';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 450,
  inRun: true,
  open: () => openPauseVolume(asked.canary),
  close: closePauseVolume,
  check: (_canary, lab) => pauseVolumeChecked(lab),
  canary: caught(VOLUME_CANARY),
};
export default STATE;
