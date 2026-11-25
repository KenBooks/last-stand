// A boss's cost to the frame, for the picture parts of `lab boss` (`rootPictures`, `stagPictures`): frames drawn and
// timed by the browser's own clock (the page's `performance.now` is the lab's, which stands still within a frame),
// first on the battleground with no boss, then with the boss fighting, so a picture run also says what its fight does
// to the frame rate. On this PC's GPU the frame is a small share of a player's: read the two side by side, never the
// numbers alone (a player's device is played with `lab perf --device`).
import type { Lab } from './lab';
import { fixed } from './boss';

/** how many frames each side is timed over */
const TIMED_FRAMES = 120;

/** The frames' times (ms): their median and 90th percentile. */
export interface FrameTimes { median: number; p90: number }

/** The browser's own clock. */
function realNow(): number {
  return (window as unknown as { __labClock: { realNow: () => number } }).__labClock.realNow();
}

/** `TIMED_FRAMES` frames drawn as the game draws them, each timed; `each` run before every frame (to keep a boss at
 *  its fight). */
export async function timeFrames(lab: Lab, each: () => void = () => {}): Promise<FrameTimes> {
  const drawing = lab.drawing;
  lab.drawing = true;
  const times: number[] = [];
  try {
    for (let i = 0; i < TIMED_FRAMES; i++) {
      each();
      const start = realNow();
      await lab.step(1);
      times.push(realNow() - start);
    }
  } finally {
    lab.drawing = drawing;
  }
  times.sort((a, b) => a - b);
  return { median: times[Math.floor(times.length / 2)], p90: times[Math.floor(times.length * 0.9)] };
}

/** A line saying what a boss's fight does to the frame against the battleground without it. */
export function frameLine(part: string, boss: string, without: FrameTimes, within: FrameTimes): string {
  const ratio = within.median / Math.max(0.01, without.median);
  return `${part}: frames on this PC: ${fixed(without.median)} ms median (${fixed(without.p90)} at the 90th) with no `
    + `boss, ${fixed(within.median)} ms (${fixed(within.p90)}) with ${boss} fighting: ${fixed(ratio, 2)}x`;
}
