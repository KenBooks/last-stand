// tools/lab's GPU time of a change to the frame, by the engine's own clock (Bulwark's GPU timestamps, `gpuClock` in
// src/engine/levels.ts), the change on and off in turns. The machine's load drifts, and two runs apart read two loads
// (the lab's frame times moved by a millisecond from run to run, and a commit against itself read 1.2 ms apart): in
// turns within one page, both sides read the same load. `fire --cost` times its flames with it, `envcost` the
// environment's lookups, `scenecost` the scene's parts, `glowcost` the gear's glow, `perf --parts` the hero's turns.
//
// It timed three's renders by WebGL's timer queries before; the engine alone draws the game, three's renderer has no
// WebGL context, and each of those commands stopped at its first timed render. The engine's clock takes one frame at
// a time: a frame drawn while another's time is on its way is left untimed. So a side's frames are drawn one in each
// of the browser's frames and each waited for (as the game's profiler does, `engineTiming` in src/perf/profiler.ts),
// and a side drawing its frame more than once (a canary's) is timed render by render and added. Between them the
// frame is drawn untimed while the clock is busy, so the GPU never idles: left idle between frames a GPU clocks down,
// and the same frame read 36 ms and 10 ms within one profile on a phone.
import { RUST } from '../../../src/engine';
import { PIPELINES } from '../../../src/engine/pipelinesAside';
import { render } from '../../../src/core/renderer';
import { quantile } from './timing';

/** The frame's median time on the GPU (ms) with the change on and off, and what the change takes. */
export interface TurnsCost {
  on: number;
  off: number;
  /** what the change takes (ms): the median over the rounds of each round's own difference, its two turns drawn
   *  back to back, so the GPU's clock drifting from round to round falls out of it */
  takes: number;
  /** how far `takes` may be off (ms): the standard error of that median, from the rounds' spread */
  error: number;
  /** the frames each side was timed over */
  renders: number;
}

/** Whether a cost is told from nothing: over twice its own error. Under it, the run can't say the change costs or
 *  saves anything (a part read -1.3 ms and +1.6 ms in two runs of six rounds, each printed as if it meant it). */
export const sure = (cost: TurnsCost): boolean => Math.abs(cost.takes) > 2 * cost.error;

/** How the turns run: their rounds, and the frames timed a side in each. */
export interface Turns {
  rounds: number;
  renders: number;
}

/** fire's turns: 8 rounds of 6 frames a side */
export const TURNS: Turns = { rounds: 8, renders: 6 };

/** the frames drawn untimed before the turns, the GPU's clocks brought up */
const WARM_FRAMES = 30;
/** the most of the browser's frames a time is waited for */
const MOST_WAITED = 60;

/** The engine's GPU clock asked: how many frames' times have come back, whether one is on its way, the last (ms). */
interface ClockRead {
  reads: number;
  busy: boolean;
  ms: number;
}

/** The engine's clock, or null where the engine isn't drawing or the browser gives it no timestamps. */
function clockOf(): (() => ClockRead) | null {
  const levels = RUST.bridge?.levels;
  if (!levels || levels.gpuClock().reads === 0) return null;
  return () => levels.gpuClock();
}

/** The browser's next frame, by its own clock (the lab's page clock stands still within a frame). */
const browserFrame = (): Promise<void> => window.__labClock.realFrame();

/** the most of the browser's frames a side's pipelines are waited for, compiling aside, before its turns */
const MOST_COMPILING = 600;

/**
 * The frame drawn in each of the browser's frames until it draws whole: no pipeline it asks for still compiling
 * aside (`PIPELINES.unready`: a draw whose pipeline isn't ready is left out, and a side timed meanwhile read less
 * than it draws). A change that asks for pipelines of its own (the MSAA's samples, a part drawn by a shader of its
 * own) makes them at its first frame. Throws if they never come.
 */
export async function drawnWhole(draw: () => void): Promise<void> {
  for (let waited = 0; waited < MOST_COMPILING; waited++) {
    PIPELINES.unready = 0;
    draw();
    if (PIPELINES.unready === 0 && PIPELINES.compiling === 0) return;
    await browserFrame();
  }
  throw new Error(`lab: gpuTurns: the frame's pipelines still compiling after ${MOST_COMPILING} frames`);
}

/** The median of `values`, or 0 with none. */
export function medianOf(values: number[]): number {
  return values.length ? quantile([...values].sort((a, b) => a - b), 0.5) : 0;
}

/** a median's standard error over a normal spread's, and a normal spread's over its median deviation */
const MEDIAN_ERROR = 1.2533;
const DEVIATION = 1.4826;

/** How far the median of `values` may be off: its standard error, from their median deviation (a round a stray
 *  load fell on counts for little). */
function medianError(values: number[]): number {
  if (values.length < 2) return Infinity;
  const middle = medianOf(values);
  const deviation = medianOf(values.map((value) => Math.abs(value - middle)));
  return (MEDIAN_ERROR * DEVIATION * deviation) / Math.sqrt(values.length);
}

/** A frame timed by the engine's clock: drawn by `draw` once the clock is free, and its time waited for (ms); null
 *  where it never came back. The frame is drawn untimed while the clock is busy, so the GPU keeps working. */
async function timedFrame(clock: () => ClockRead, draw: () => void): Promise<number | null> {
  for (let waited = 0; waited < MOST_WAITED && clock().busy; waited++) {
    await browserFrame();
    if (clock().busy) draw();
  }
  const before = clock().reads;
  draw();
  for (let waited = 0; waited < MOST_WAITED && clock().reads === before; waited++) await browserFrame();
  return clock().reads === before ? null : clock().ms;
}

/** `count` frames drawn by `draw`, each timed by the engine's clock (ms): those that came back. Empty where the
 *  engine times nothing. */
export async function timedRenders(draw: () => void, count: number): Promise<number[]> {
  const clock = clockOf();
  if (!clock) return [];
  const times: number[] = [];
  for (let frame = 0; frame < count; frame++) {
    const took = await timedFrame(clock, draw);
    if (took !== null) times.push(took);
  }
  return times;
}

/** One side's frames in a turn, each the frame drawn `times` times, each render timed and added (ms). */
async function sideTimes(clock: () => ClockRead, draw: () => void, frames: number, times: number): Promise<number[]> {
  const sides: number[] = [];
  for (let frame = 0; frame < frames; frame++) {
    let took = 0;
    for (let drawn = 0; drawn < times; drawn++) {
      const one = await timedFrame(clock, draw);
      if (one === null) return sides;
      took += one;
    }
    sides.push(took);
  }
  return sides;
}

/**
 * The frame's time on the GPU as `draw` renders it once with `change(true)` and `change(false)` in turns, left on;
 * null where the engine times nothing. `times` is how many times a side draws its frame as it's timed (a canary's
 * frame drawn twice), each render timed and added. The frame is drawn whole each way first (`drawnWhole`), so no
 * turn is timed with a pipeline compiling aside, and the GPU is warmed before the turns. A round's turns come in the
 * other order each round, so a drift along the run falls on both sides alike. A turn's median leaves out what a
 * change costs once as it's made (a mesh merged again, a buffer sent).
 */
export async function costInTurns(
  change: (on: boolean) => void,
  draw: () => void = render,
  turns: Turns = TURNS,
  times: (on: boolean) => number = () => 1,
): Promise<TurnsCost | null> {
  const clock = clockOf();
  if (!clock) return null;
  const on: number[] = [];
  const off: number[] = [];
  const differences: number[] = [];
  try {
    change(false);
    await drawnWhole(draw);
    change(true);
    await drawnWhole(draw);
    for (let frame = 0; frame < WARM_FRAMES; frame++) {
      await browserFrame();
      draw();
    }
    for (let round = 0; round < turns.rounds; round++) {
      const read = { on: [] as number[], off: [] as number[] };
      for (const side of round % 2 ? [false, true] : [true, false]) {
        change(side);
        const took = await sideTimes(clock, draw, turns.renders, times(side));
        (side ? read.on : read.off).push(...took);
      }
      on.push(...read.on);
      off.push(...read.off);
      if (read.on.length && read.off.length) differences.push(medianOf(read.on) - medianOf(read.off));
    }
  } finally {
    change(true);
  }
  if (!differences.length) return null;
  return {
    on: medianOf(on),
    off: medianOf(off),
    takes: medianOf(differences),
    error: medianError(differences),
    renders: Math.min(on.length, off.length),
  };
}
