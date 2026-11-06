// tools/lab's whole frame timed by the browser's clock, a change on and off in turns: the frame drawn (the scene, the
// post chain, the HDR canvas's copy), then waited for on the GPU (WebGL's `finish`, and the HDR output's WebGPU queue
// done). The GPU's timer queries see WebGL's draws alone: HDR's copy of the frame onto its canvas is WebGPU's, and
// on a 4K laptop's integrated GPU it was 26 ms of a 38 ms frame (trace BN6P-FN12), which `scenecost` couldn't see.
// The CPU's part of a frame is in both sides' times alike. `scenecost --frame` times HDR and MSAA with it.
import { quantile } from './timing';

/** The frame's median time (ms, by the browser's clock) with the change on and off. */
export interface FrameCost {
  on: number;
  off: number;
  /** the frames each side was timed over */
  frames: number;
}

/** How the turns run: their rounds, and a side's frames in each. */
export interface FrameTurns {
  rounds: number;
  frames: number;
}

/** the frames drawn untimed after a change, before its turn's are timed (a target made again, a program linked) */
const SETTLE_FRAMES = 3;

/** The median of `values`. */
function medianOf(values: number[]): number {
  return quantile([...values].sort((a, b) => a - b), 0.5);
}

/** One frame drawn by `draw` and waited out on the GPU by `finished`; its time by the browser's clock (ms). */
async function timedFrame(draw: () => void, finished: () => Promise<void>): Promise<number> {
  const now = window.__labClock.realNow;
  const start = now();
  draw();
  await finished();
  return now() - start;
}

/**
 * The whole frame's time as `draw` draws it with `change(true)` and `change(false)` in turns, left on. Each change is
 * settled by a few frames drawn untimed (awaited: HDR's start is a promise), and `finished` waits for the GPU.
 */
export async function frameCostInTurns(
  change: (on: boolean) => Promise<void> | void,
  draw: () => void,
  finished: () => Promise<void>,
  turns: FrameTurns,
): Promise<FrameCost> {
  const on: number[] = [];
  const off: number[] = [];
  const settle = async (state: boolean) => {
    await change(state);
    for (let frame = 0; frame < SETTLE_FRAMES; frame++) await timedFrame(draw, finished);
  };
  try {
    for (let round = 0; round < turns.rounds; round++) {
      for (const state of [true, false]) {
        await settle(state);
        const times = state ? on : off;
        for (let frame = 0; frame < turns.frames; frame++) times.push(await timedFrame(draw, finished));
      }
    }
  } finally {
    await change(true);
  }
  return { on: medianOf(on), off: medianOf(off), frames: Math.min(on.length, off.length) };
}
