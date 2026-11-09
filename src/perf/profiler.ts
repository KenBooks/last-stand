// The profiler (the pause menu's Performance tab: Profile): what each part of the frame costs on the player's own
// device, where they stand. No harness can play a phone's GPU: the lab's phone (`perf --device`) drew the forest by a
// bonfire at 79 fps where the owner's phone drew 35 (a phone's GPU throws away its fast path on cut-out leaves and
// blending, a desktop's doesn't). So the game times itself: its frames are held (`holdFrames`), and the frame as it
// stands is drawn again and again with each part taken out and put back in turns (`sceneParts.ts`), each frame waited
// out on the GPU (a pixel read back) and timed by the page's clock. In turns, the device's heat and clocks fall on
// both sides alike. The result is shown, and sent with the player's consent as a performance report (`consent.ts`
// `sendProfile`), where `lab trace` reads it.
import * as THREE from 'three';
import { G } from '../state';
import { holdFrames } from '../core/frameLoop';
import { render } from '../core/renderer';
import { WEBGPU } from '../core/webgpu';
import { frameParts, type ScenePart } from './sceneParts';

/** How the turns run: their rounds, a side's frames in each, and the frames drawn untimed after each change. */
export interface ProfileTurns {
  rounds: number;
  frames: number;
  settle: number;
}

/** a phone's: 6 rounds of 3 frames a side, 1 settling (432 frames, some 14 s at 30 a second): short turns, swapped
 *  often, so the GPU's clocks drifting fall on both sides alike (5 frames a side read the whole frame 3.5 to 7.8 ms
 *  from part to part) */
export const PROFILE_TURNS: ProfileTurns = { rounds: 6, frames: 3, settle: 1 };

/** A part's cost: the frame's median time with it and without (ms). */
export interface PartCost {
  name: string;
  on: number;
  off: number;
}

/** What the profiler found: the frame as it stands, and each part's cost, the costliest first. */
export interface Profile {
  /** the frame's median time with everything in it (ms) */
  frame: number;
  /** how long the profile took, start to end (s) */
  seconds: number;
  /** the programs compiled while it ran (its parts must keep the scene's: each compiled is a wait) */
  compiled: number;
  parts: PartCost[];
  /** the frame as the browser shows it, from one of its frames to the next (ms), with the page's parts in it shown
   *  and hidden (`ProfileOptions.pageParts`): what putting the page together costs, which a draw waited for leaves
   *  out */
  shown?: { frame: number; parts: PartCost[] };
}

/** the turns of a page's part: its frames' intervals step by the display's refresh, so more of them, and averaged */
export const PAGE_TURNS: ProfileTurns = { rounds: 3, frames: 8, settle: 2 };

/** How far a profile is: the frames drawn, of all it draws, and the part being timed. */
export interface ProfileProgress {
  done: number;
  total: number;
  part: string;
}

/** What a profile is asked: its turns, a canary (the frame drawn twice, as a part), and where it says how far it is. */
export interface ProfileOptions {
  turns?: ProfileTurns;
  /** a part that draws the frame twice: it must read about twice the frame */
  canary?: boolean;
  /** told after each frame how far the profile is */
  onProgress?: (progress: ProfileProgress) => void;
  /** asked before each frame: true stops the profile (it throws `ProfileCancelled`), every part put back */
  cancelled?: () => boolean;
  /** the clock the frames are timed by (ms): the page's, or a harness's own (the lab's page clock stands still) */
  clock?: () => number;
  /** the browser's next frame, each timed frame drawn in one (the lab's own: its page queues the game's) */
  nextFrame?: () => Promise<void>;
  /** what the page puts over the scene (its panels, the pause menu's blur), each timed by the frame's interval as the
   *  browser shows it, with it shown and hidden: the browser's own work putting the page together, which the scene's
   *  parts (a draw waited for) don't see */
  pageParts?: ScenePart[];
  /** run in each frame a page's part is timed in (the lab's canary: work the interval must see) */
  eachPageFrame?: () => void;
}

/** Thrown by `profile` when it was cancelled. */
export class ProfileCancelled extends Error {
  constructor() {
    super('the profile was cancelled');
  }
}

/** the name of the canary's part */
export const CANARY_PART = 'canary: the frame drawn twice';

/** a pixel's target, read back after each frame: the read waits for every command sent before it */
let readTarget: THREE.WebGLRenderTarget | null = null;
const readBack = new Uint8Array(4);

/** Waits for the GPU to finish the frame: a pixel of a target of its own read back (the canvas may be float16). */
function waitForGpu(): void {
  readTarget ??= new THREE.WebGLRenderTarget(1, 1);
  G.renderer.readRenderTargetPixels(readTarget, 0, 0, 1, 1, readBack);
}

/** The browser's next frame: one timed frame each, so the page paints, answers touches and shows the progress
 * between them (drawn back to back, a phone's GPU had no time to show the page, and Chrome offered to kill it). */
const browserFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** The median of `values`. */
function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
}

/** The mean of `values` (a frame's interval steps by the display's refresh: its median would be one step or the
 *  next). */
function meanOf(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

/** A frame drawn, waited out on the GPU and timed (ms). */
type TimedDraw = () => Promise<number>;

/** `draw` as a frame drawn in the browser's next frame, waited out on the GPU, and timed by `clock` (ms); stopped
 * when `cancelled`, and `counted` after each. */
function timing(draw: () => void, options: ProfileOptions, counted: () => void): TimedDraw {
  const clock = options.clock ?? (() => performance.now());
  const nextFrame = options.nextFrame ?? browserFrame;
  return async () => {
    await nextFrame();
    if (options.cancelled?.()) throw new ProfileCancelled();
    const start = clock();
    draw();
    waitForGpu();
    const took = clock() - start;
    counted();
    return took;
  };
}

/** `draw` as a frame drawn in the browser's next frame, timed by its interval from the frame before, as the browser
 *  shows it (nothing waited for: the browser puts the page together meanwhile); stopped when `cancelled`. */
function shownTiming(draw: () => void, options: ProfileOptions, counted: () => void): TimedDraw {
  const clock = options.clock ?? (() => performance.now());
  const nextFrame = options.nextFrame ?? browserFrame;
  let last = clock();
  return async () => {
    await nextFrame();
    if (options.cancelled?.()) throw new ProfileCancelled();
    const now = clock();
    const interval = now - last;
    last = now;
    draw();
    options.eachPageFrame?.();
    counted();
    return interval;
  };
}

/** The frames a profile draws: each part's turns, then the frame alone. */
function framesOf(parts: number, turns: ProfileTurns): number {
  return parts * turns.rounds * 2 * (turns.settle + turns.frames) + turns.frames * 2;
}

/** `part`'s cost in turns: settled after each change, then timed (`average`: the median of a draw waited for, the
 *  mean of intervals), left on. */
async function costOf(part: ScenePart, timedFrame: TimedDraw, turns: ProfileTurns,
  average: (values: number[]) => number = medianOf): Promise<PartCost> {
  const on: number[] = [];
  const off: number[] = [];
  try {
    for (let round = 0; round < turns.rounds; round++) {
      for (const state of [true, false]) {
        part.change(state);
        for (let frame = 0; frame < turns.settle; frame++) await timedFrame();
        const times = state ? on : off;
        for (let frame = 0; frame < turns.frames; frame++) times.push(await timedFrame());
      }
    }
  } finally {
    part.change(true);
  }
  return { name: part.name, on: average(on), off: average(off) };
}

/** Whether the profiler can time this game's frames: WebGL's (WebGPU's frame isn't waited for by a read). */
export const canProfile = (): boolean => !WEBGPU;

/** Profiles the frame as it stands, the game's frames held meanwhile; throws `ProfileCancelled` if cancelled. */
export async function profile(options: ProfileOptions = {}): Promise<Profile> {
  const turns = options.turns ?? PROFILE_TURNS;
  let twice = false;
  const draw = () => {
    render();
    if (twice) render();
  };
  const parts = frameParts();
  if (options.canary) parts.push({ name: CANARY_PART, change: (on) => { twice = on; } });
  const pageParts = options.pageParts ?? [];
  const pageFrames = pageParts.length ? framesOf(pageParts.length, PAGE_TURNS) : 0;
  const progress: ProfileProgress = { done: 0, total: framesOf(parts.length, turns) + pageFrames, part: '' };
  const counted = () => {
    progress.done += 1;
    options.onProgress?.(progress);
  };
  const timedFrame = timing(draw, options, counted);
  const now = options.clock ?? (() => performance.now());
  const started = now();
  const programs = G.renderer.info.programs?.length ?? 0;
  holdFrames(true);
  try {
    const costs: PartCost[] = [];
    for (const part of parts) {
      progress.part = part.name;
      costs.push(await costOf(part, timedFrame, turns));
    }
    progress.part = 'the whole frame';
    const frames: number[] = [];
    for (let frame = 0; frame < turns.frames * 2; frame++) frames.push(await timedFrame());
    costs.sort((a, b) => (b.on - b.off) - (a.on - a.off));
    const shownFrame = shownTiming(draw, options, counted);
    const shown = pageParts.length ? await shownCosts(pageParts, shownFrame, progress) : undefined;
    const compiled = (G.renderer.info.programs?.length ?? 0) - programs;
    return { frame: medianOf(frames), seconds: (now() - started) / 1000, compiled, parts: costs, shown };
  } finally {
    holdFrames(false);
  }
}

/** The page's parts timed by the frame's interval as the browser shows it, each hidden but the one timed, then the
 *  frame with all of them hidden. */
async function shownCosts(parts: ScenePart[], shownFrame: TimedDraw,
  progress: ProfileProgress): Promise<Profile['shown']> {
  const costs: PartCost[] = [];
  for (const part of parts) part.change(false);
  try {
    for (const part of parts) {
      progress.part = part.name;
      costs.push(await costOf(part, shownFrame, PAGE_TURNS, meanOf));
      part.change(false);
    }
    progress.part = 'the frame as shown';
    const frames: number[] = [];
    for (let frame = 0; frame < PAGE_TURNS.settle; frame++) await shownFrame();
    for (let frame = 0; frame < PAGE_TURNS.frames * 2; frame++) frames.push(await shownFrame());
    costs.sort((a, b) => (b.on - b.off) - (a.on - a.off));
    return { frame: meanOf(frames), parts: costs };
  } finally {
    for (const part of parts) part.change(true);
  }
}

/** A part's cost as a line: what it takes, its share of the frame, the frame with it and without. */
function partLine(part: PartCost, frame: number): string {
  const takes = part.on - part.off;
  const share = frame > 0 ? (100 * takes) / frame : 0;
  return `${part.name}: ${takes.toFixed(1)} ms, ${share.toFixed(0)}% (${part.on.toFixed(1)} with it, `
    + `${part.off.toFixed(1)} without)`;
}

/** A profile as lines: the frame, then each part's cost, the costliest first. */
export function profileLines(found: Profile): string[] {
  const fps = found.frame > 0 ? Math.round(1000 / found.frame) : 0;
  const frame = `the frame ${found.frame.toFixed(1)} ms (${fps} fps), each frame drawn and waited for; `
    + `profiled in ${found.seconds.toFixed(1)} s, ${found.compiled} programs compiled`;
  const lines = [frame, ...found.parts.map((part) => partLine(part, found.frame))];
  if (!found.shown) return lines;
  const shownFps = found.shown.frame > 0 ? Math.round(1000 / found.shown.frame) : 0;
  lines.push(`the frame as the browser shows it, frame to frame: ${found.shown.frame.toFixed(1)} ms (${shownFps} fps), `
    + 'the page\'s parts hidden');
  lines.push(...found.shown.parts.map((part) => partLine(part, found.shown!.frame)));
  return lines;
}
