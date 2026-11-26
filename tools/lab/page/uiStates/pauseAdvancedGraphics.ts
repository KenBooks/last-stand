// The expanded Advanced graphics controls in the pause menu.
import {
  ADVANCED_CANARY, checkAdvancedGraphics, closeAdvancedGraphics, openAdvancedGraphics,
} from '../uiAdvancedGraphics';
import { closePause } from '../uiPause';
import { caught, type Steps } from '../uiKit';

const STATE: Steps = {
  order: 415,
  inRun: true,
  open: openAdvancedGraphics,
  close: () => {
    closeAdvancedGraphics();
    closePause();
  },
  check: (canary, lab) => checkAdvancedGraphics(lab, canary),
  canary: (found, state) => {
    const result = caught(ADVANCED_CANARY)(found, state);
    return {
      lines: result.lines,
      problems: [...result.problems, ...found.problems.filter((problem) => !problem.includes(ADVANCED_CANARY.name))],
    };
  },
};
export default STATE;
