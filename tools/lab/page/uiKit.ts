// What `lab ui`'s states share (`ui.ts` runs them, each a module of `uiStates/`): how a state is written (`Steps`),
// what it found (`Found`), what this run asked for (`asked`) and whether its run is set up (`runSetUp`), a box as
// shares of the window, an element named for a report, the page's animations brought to rest, and the hero stood
// elsewhere in the village and put back.
import * as THREE from 'three';
import { onTheClock } from './lab';
import type { Frame, Lab, Pictured } from './lab';
import { groundHeight } from '../../../src/world/ground';
import type { Spot } from '../../../src/data/village';

/** What a state found besides its boxes: lines for its report, and its problems. */
export interface Found {
  lines: string[];
  problems: string[];
}

/** A problem a canary plants: the words its check's problem names it by, and what it plants, for the report. */
export interface Planted {
  name: string;
  what: string;
}

/**
 * A state of `lab ui`, the default export of its module in `uiStates/` (the module's name is the state's): where it
 * runs among them, how it's opened over the lobby or the run and closed again after its picture, what's held
 * meanwhile, what it checks once pictured (`canary`: with a problem planted, which it must find), the pictures it
 * takes besides, and how its canary's plants are looked for.
 */
export interface Steps {
  /**
   * where it runs among the states, the lowest first (`node/commands/ui.mjs` reads it from the module's text, one
   * `order: n` line, and lists `--states` in that order): the lobby's states before the run's, in steps of 10 so a
   * new state slots in between two without renumbering
   */
  order: number;
  /** pictured in a run, which is set up before the first such state (the rest are the lobby's) */
  inRun?: boolean;
  open(lab: Lab): unknown;
  close(lab: Lab): unknown;
  held?: Frame;
  check?(canary: boolean, lab: Lab): Found | Promise<Found>;
  pictures?(lab: Lab): Promise<Pictured[]>;
  /** what it checks once closed */
  closed?(): Found;
  /** with `--canary`, its own plants looked for in what its check found: a line for each, and those missed */
  canary?(found: Found, state: string): Found;
}

/** What this run of a state asked for, set by `ui.ts` before the state opens. */
export const asked: {
  /** whether this command plants its canaries (`--canary`) */
  canary: boolean;
  /** the bug report states' reports service, the lab's own (node/tracesService.mjs): Send sends there alone */
  reports?: string;
} = { canary: false };

/** Whether this page's run is set up for the run's states (each command's page is booted for it: false at first). */
export const runSetUp = { ready: false };

/** Each of `planted` looked for in `found`'s problems: a line for each, and a problem for each that went unseen. */
export function plantsCaught(found: Found, state: string, planted: Planted[]): Found {
  const lines: string[] = [];
  const problems: string[] = [];
  for (const { name, what } of planted) {
    const caught = found.problems.some((problem) => problem.includes(name));
    lines.push(`  canary: ${what} ${caught ? 'caught' : 'went unseen'}`);
    if (!caught) problems.push(`${state}: the canary's ${what} went unseen`);
  }
  return { lines, problems };
}

/** A state's `canary` looking for each of `planted` (`plantsCaught`). */
export function caught(...planted: Planted[]): (found: Found, state: string) => Found {
  return (found, state) => plantsCaught(found, state, planted);
}

/** `value` (css px) as a share of `whole`, in % to a tenth. */
export function share(value: number, whole: number): string {
  return (value / whole * 100).toFixed(1);
}

/** A box (css px) as shares of the window: its left, top, width and height. */
export function boxText(box: { x: number; y: number; w: number; h: number }): string {
  const position = `${share(box.x, innerWidth)},${share(box.y, innerHeight)}`;
  return `${position} ${share(box.w, innerWidth)}x${share(box.h, innerHeight)}`;
}

/** `element` named for a report: its tag, its id or its data attributes, and the id of what it's in. */
export function describe(element: Element): string {
  const data = Object.entries((element as HTMLElement).dataset ?? {}).map(([key, value]) => `[data-${key}=${value}]`);
  const own = element.id ? `#${element.id}` : data.join('');
  const within = element.parentElement?.closest('[id]');
  return `${element.tagName.toLowerCase()}${own}${within ? ` in #${within.id}` : ''}`;
}

/**
 * Every animation of the page brought to its end (an endless one to its start), so a picture shows the UI at rest:
 * CSS animations run on the browser's own clock, not the lab's. One driven by a scroll is at rest already.
 */
export function settleAnimations(): void {
  for (const animation of document.getAnimations().filter(onTheClock)) {
    const iterations = animation.effect?.getComputedTiming().iterations ?? 1;
    if (iterations === Infinity) {
      animation.pause();
      animation.currentTime = 0;
    } else {
      animation.finish();
    }
  }
}

/** frames run after a finger's tap, for the touch controls to show */
export const TOUCH_FRAMES = 2;
/** the frames run for the hero to settle where he's put, and for a village card to open */
export const CARD_FRAMES = 2;
/** the most frames the dummies' readouts may take to fade in as he comes into the yard (`METER_FADE`, 0.35 s) */
export const READOUTS_IN_FRAMES = 120;

/** where the hero stood before a state took him elsewhere in the village, put back as it closes */
let stoodAt: { at: THREE.Vector3; facing: number } | null = null;

/** The hero stood at `spot` facing `facing`, where he stood kept for `standBack`, and let settle. */
export async function standAt(lab: Lab, spot: Spot, facing: number): Promise<void> {
  stoodAt ??= { at: lab.player.pos.clone(), facing: lab.player.facing };
  const [x, z] = spot;
  lab.player.walkTo = null;
  lab.player.place(new THREE.Vector3(x, groundHeight(x, z), z), facing);
  await lab.step(CARD_FRAMES);
}

/** The hero put back where he stood before `standAt`, so the states after it picture the lobby as it was. */
export async function standBack(lab: Lab): Promise<void> {
  if (!stoodAt) return;
  lab.player.walkTo = null;
  lab.player.place(stoodAt.at, stoodAt.facing);
  stoodAt = null;
  await lab.step(CARD_FRAMES);
}
