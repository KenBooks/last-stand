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

/** a phone's: 3 rounds of 5 frames a side, 2 settling; about 15 s at 30 frames a second */
export const PROFILE_TURNS: ProfileTurns = { rounds: 3, frames: 5, settle: 2 };

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
  parts: PartCost[];
}

/** What a profile is asked: its turns, a canary (the frame drawn twice, as a part), and where it says how far it is. */
export interface ProfileOptions {
  turns?: ProfileTurns;
  /** a part that draws the frame twice: it must read about twice the frame */
  canary?: boolean;
  /** told each part as its turns start: its place (from 1), the parts' count and its name */
  onPart?: (at: number, of: number, name: string) => void;
  /** the clock the frames are timed by (ms): the page's, or a harness's own (the lab's page clock stands still) */
  clock?: () => number;
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

/** The browser's next task: the page answers touches and paints the progress between frames. */
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** The median of `values`. */
function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
}

/** A frame drawn, waited out on the GPU and timed (ms). */
type TimedDraw = () => Promise<number>;

/** `draw` as a frame drawn, waited out on the GPU, and timed by `clock` (ms). */
function timing(draw: () => void, clock: () => number): TimedDraw {
  return async () => {
    await nextTask();
    const start = clock();
    draw();
    waitForGpu();
    return clock() - start;
  };
}

/** `part`'s cost in turns: settled after each change, then timed, left on. */
async function costOf(part: ScenePart, timedFrame: TimedDraw, turns: ProfileTurns): Promise<PartCost> {
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
  return { name: part.name, on: medianOf(on), off: medianOf(off) };
}

/** Whether the profiler can time this game's frames: WebGL's (WebGPU's frame isn't waited for by a read). */
export const canProfile = (): boolean => !WEBGPU;

/** Profiles the frame as it stands, the game's frames held meanwhile. */
export async function profile(options: ProfileOptions = {}): Promise<Profile> {
  const turns = options.turns ?? PROFILE_TURNS;
  let twice = false;
  const draw = () => {
    render();
    if (twice) render();
  };
  const timedFrame = timing(draw, options.clock ?? (() => performance.now()));
  const parts = frameParts();
  if (options.canary) parts.push({ name: CANARY_PART, change: (on) => { twice = on; } });
  holdFrames(true);
  try {
    const costs: PartCost[] = [];
    for (const [index, part] of parts.entries()) {
      options.onPart?.(index + 1, parts.length, part.name);
      costs.push(await costOf(part, timedFrame, turns));
    }
    const frames: number[] = [];
    for (let frame = 0; frame < turns.frames * 2; frame++) frames.push(await timedFrame());
    costs.sort((a, b) => (b.on - b.off) - (a.on - a.off));
    return { frame: medianOf(frames), parts: costs };
  } finally {
    holdFrames(false);
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
  const frame = `the frame ${found.frame.toFixed(1)} ms (${fps} fps), each frame drawn and waited for`;
  return [frame, ...found.parts.map((part) => partLine(part, found.frame))];
}
