// `lab ui`'s performance overlay read against the frames it counts (src/ui/perfHud.ts). `perfGraph` shows the overlay
// afresh, as the pause menu does, and runs frames on the lab's clock, reading the overlay after each: its frame rate
// and its graph's scale (the label at the graph's top, the highest half second's rate rounded up) may never read far
// over the frames' own rate. The graph rated its first half second by the time from the first frame's end, so a
// redraw just after a bucket's edge read one frame over a fraction of a millisecond: 2500 frames a second on the
// owner's 144 Hz screen, the graph flattened under it (#462's Mini, from play). On steady frames a redraw never lands
// there; a real screen's frames jitter. So each round shows it afresh with its first frame a share of a frame long,
// the shares in turn across a frame's span (a frame a hair short put the redraw 30 frames on, 0.01 ms past an edge,
// and read 100,000 fps). Its canary runs a burst of frames a millisecond apart, a real rise, which must be read.
// It imports only what the overlay had before Mini (`setPerfHud`), so `ui --ab` runs it on main too.
import type { Lab } from './lab';
import { setPerfHud } from '../../../src/ui/perfHud';

/** What the state found: lines for its report, and its problems. */
export interface PerfGraphFound {
  lines: string[];
  problems: string[];
}

/** The highest reading of a round, and where. */
interface Highest {
  scale: number;
  rate: number;
  /** the first frame's length, ms */
  first: number;
  frame: number;
}

/** the problem the canary must raise */
export const PERF_GRAPH_CANARY = { name: 'over the frames', what: 'a burst of frames 1 ms apart' };
/** the rounds: the overlay shown afresh with its first frame 1/15, 2/15... of a frame long */
const ROUNDS = 15;
/** frames read in a round after the overlay is shown: two of its 0.5 s buckets and more */
const READ_FRAMES = 70;
/** the frames the canary runs fast in its round, from which frame on */
const BURST_FRAMES = 100;
const BURST_FROM = 20;
/** a frame of the burst, ms */
const BURST_FRAME_MS = 1;
/** how far over the frames' own rate a reading may be (a bucket's rounding, a frame's edge) */
const SLACK = 1.5;
/** the graph's lowest scale, frames a second (perfHud.ts: it never scales under 60) */
const LOWEST_SCALE = 60;
/** the step the graph's scale is rounded up to, frames a second */
const SCALE_STEP = 30;

const reading = (key: string): number => Number(document.querySelector(`#perf [data-p="${key}"]`)?.textContent);

/** The overlay shown afresh: its window of frames starts again. */
function showAfresh(): void {
  setPerfHud(false, false);
  // (the last round's readings blanked: until it redraws, the overlay still shows them)
  for (const key of ['fps', 'top']) {
    const label = document.querySelector(`#perf [data-p="${key}"]`);
    if (label) label.textContent = '--';
  }
  setPerfHud(true, false);
}

/** Nothing to open: each round shows the overlay afresh itself. */
export function openPerfGraph(): void {
  setPerfHud(false, false);
}

/** The overlay put away. */
export function closePerfGraph(): void {
  setPerfHud(false, false);
}

/** the lab's clock reads on a grid of 1/1024 ms (tools/lab/node/browser.mjs) */
const onGrid = (ms: number): number => Math.round(ms * 1024) / 1024;

/** One frame run, `ms` long (the lab's own frame without). */
async function oneFrame(lab: Lab, ms?: number): Promise<void> {
  const clock = window.__labClock;
  const kept = clock.frame;
  if (ms !== undefined) clock.frame = onGrid(ms);
  await lab.step(1);
  clock.frame = kept;
}

/** The length of a frame of the round (`first` the first's, the canary's burst 1 ms apart). */
function frameLength(frame: number, first: number, burst: boolean): number | undefined {
  if (frame === 0) return first;
  if (burst && frame >= BURST_FROM && frame < BURST_FROM + BURST_FRAMES) return BURST_FRAME_MS;
  return undefined;
}

/** A round: the overlay shown afresh, its first frame `first` ms long, and read after each frame. */
async function round(lab: Lab, first: number, burst: boolean): Promise<Highest> {
  showAfresh();
  // (the frame it's shown in: the overlay counts from the next)
  await oneFrame(lab);
  const highest: Highest = { scale: 0, rate: 0, first, frame: -1 };
  const frames = burst ? READ_FRAMES + BURST_FRAMES : READ_FRAMES;
  for (let frame = 0; frame < frames; frame++) {
    await oneFrame(lab, frameLength(frame, first, burst));
    const scale = reading('top');
    if (scale > highest.scale) {
      highest.scale = scale;
      highest.frame = frame;
    }
    highest.rate = Math.max(highest.rate, reading('fps') || 0);
  }
  return highest;
}

/** The overlay's frame rate and graph scale read after every frame, against the frames' own rate (`perfGraph`). */
export async function perfGraphChecked(lab: Lab, canary: boolean): Promise<PerfGraphFound> {
  const rate = 1000 / window.__labClock.frame;
  const mostScale = Math.ceil(Math.max(LOWEST_SCALE, rate * SLACK) / SCALE_STEP) * SCALE_STEP;
  const frame = window.__labClock.frame;
  const rounds: Highest[] = [];
  for (let share = 1; share <= ROUNDS; share++) rounds.push(await round(lab, (frame * share) / ROUNDS, false));
  if (canary) rounds.push(await round(lab, frame, true));
  const problems: string[] = [];
  const lines = [`  ${ROUNDS} rounds of ${READ_FRAMES} frames at ${rate.toFixed(1)} fps, the graph's scale at most `
    + `${mostScale}${canary ? `, and one with ${BURST_FRAMES} frames 1 ms apart (the canary)` : ''}`];
  for (const each of rounds) {
    const where = `its first frame ${each.first.toFixed(2)} ms`;
    lines.push(`  ${where}: the frame rate read ${each.rate} at most, the graph's scale ${each.scale} `
      + `(frame ${each.frame})`);
    if (each.scale > mostScale) {
      problems.push(`perfGraph: ${where}, the graph's scale reached ${each.scale} fps (frame ${each.frame}), `
        + `${PERF_GRAPH_CANARY.name}' ${rate.toFixed(1)}`);
    }
    if (each.rate > rate * SLACK) {
      problems.push(`perfGraph: ${where}, the frame rate read ${each.rate} fps, ${PERF_GRAPH_CANARY.name}' `
        + `${rate.toFixed(1)}`);
    }
  }
  return { lines, problems };
}
