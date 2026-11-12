// tools/lab perf --parts: what a part of the frame takes of the render's CPU (three's work and the GL calls it sends),
// drawn and hidden in turns, as `gpuTurns.ts` times the GPU's side. From the owner's report in the hall of heroes:
// 60 to 67 frames a second, the CPU at 14.9 ms of the frame and 515 draws, where the square's took 206. A render's JS
// is timed by the browser's clock alone (the page's stands still within a lab frame), and the GPU's work it sends is
// left to run on: a turn's renders are sent back to back after a warm-up, each side's quickest kept per round.
import { quantile } from './timing';

/** A part of the frame switched on and off, and what it is. */
export interface CpuPart {
  name: string;
  /** shown (true) or hidden (false); left shown after */
  show(on: boolean): void;
}

/** The render's CPU time with a part and without it (ms, the medians of each round's quickest render a side). */
export interface CpuCost {
  shown: number;
  hidden: number;
}

/** how the turns run: the rounds, a side's renders in each, the renders sent first untimed */
const ROUNDS = 8;
const RENDERS = 6;
const WARM = 10;

/** One render's CPU time (ms, the browser's clock). */
function renderTime(draw: () => void): number {
  const now = window.__labClock.realNow;
  const start = now();
  draw();
  return now() - start;
}

/** The quickest of `RENDERS` renders (ms). */
function quickest(draw: () => void): number {
  let least = Infinity;
  for (let render = 0; render < RENDERS; render++) least = Math.min(least, renderTime(draw));
  return least;
}

/** The median of `values`. */
function medianOf(values: number[]): number {
  return quantile([...values].sort((a, b) => a - b), 0.5);
}

/** `part`'s cost to the render's CPU: shown and hidden in turns, each round's quickest render a side. */
export function cpuCost(part: CpuPart, draw: () => void): CpuCost {
  for (let render = 0; render < WARM; render++) draw();
  const shown: number[] = [];
  const hidden: number[] = [];
  for (let round = 0; round < ROUNDS; round++) {
    part.show(false);
    hidden.push(quickest(draw));
    part.show(true);
    shown.push(quickest(draw));
  }
  return { shown: medianOf(shown), hidden: medianOf(hidden) };
}

/** Each part's cost to the render's CPU, a line each. */
export function cpuLines(parts: CpuPart[], draw: () => void): string[] {
  const lines = ['what parts take of the render\'s CPU (the render with each, and without; ms):'];
  for (const part of parts) {
    const { shown, hidden } = cpuCost(part, draw);
    const apart = (shown - hidden).toFixed(2);
    lines.push(`  ${apart}: ${part.name}, the render ${shown.toFixed(2)} with it, ${hidden.toFixed(2)} without`);
  }
  return lines;
}
