// What the village's checks wait for that comes by the browser's own time, not the lab's frames: the hall of heroes'
// screen, which opens once its heroes are prepared (worker replies and tasks of the page's, `prepareHeroSelection`):
// asked for by E at the dais or a click, it opened some real moments later, after a check counting frames alone had
// gone on, and stood open under the checks after it (V and E did nothing there: `lab check --commands village`).
import { realWait, type Lab } from './lab';

/** how long the page is given between frames while something of its own time is waited for (ms) */
const REAL_STEP_MS = 5;

/**
 * Frames run, the page given real time between them, until `done` or `frames` of them have run; whether it came.
 * `each` is called after every frame (a measure read as it waits).
 */
export async function untilInRealTime(lab: Lab, done: () => boolean, frames: number, each?: () => void): Promise<boolean> {
  for (let frame = 0; frame < frames && !done(); frame++) {
    await lab.step(1);
    each?.();
    if (!done()) await realWait(REAL_STEP_MS);
  }
  return done();
}
