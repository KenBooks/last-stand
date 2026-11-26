// The Advanced graphics controls opened and operated with a finger.
import advanced from './pauseAdvancedGraphics';
import { touchMode } from '../uiTouch';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  ...advanced,
  order: 416,
  inRun: true,
  async open(lab) {
    await touchMode(lab);
    await advanced.open(lab);
  },
};
export default STATE;
