// The hall steady as the hero walks in through its door (from play, the hall's left and right columns flickering as he
// enters): walked in a step a frame along three lines through the doorway, each from the portico to a few metres into
// the room, the camera held where it stood as he set off (its lens too), from above and over the shoulder, at midnight
// and noon. A flicker is a patch of the frame whose light jumps one way and straight back: walking in, the frame
// changes, but smoothly; a column thinned and kept in turns comes and goes. Read by patches, not pixels: a pixel on an
// edge or in the grade's grain crosses any step a pixel can see, a whole column's light doesn't.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { holdHour } from '../../../src/game/clock';
import { groundHeight } from '../../../src/world/ground';
import { faceCamera, viewMode, type ViewMode } from '../../../src/core/renderer';
import { fadeWhole, thinningLetGo } from '../../../src/core/seeThrough';
import { aimSight, holdDoorsOff, holdSightOff, holdSightSharp } from '../../../src/core/sight';
import { HALL, TERRACE } from '../../../src/data/village';
import { drawFrame, type Canvas } from './light';
import { viewBy } from './villageHallCull';
import { tileOf } from './hallGlow';
import type { LightsChecked } from './villageLights';

/** the walks' lines across the doorway, off its middle (m) */
const LINES = [-0.8, 0, 0.8];
/** where each walk starts outside the door's line and ends inside it (m), and how far he steps a frame (3 m/s) */
const FROM_OUT = 2.5;
const TO_IN = 3.5;
const STEP = 0.05;
/** the frames he's given standing at a walk's start, for the view and the fades to settle */
const SETTLE = 60;
/** the patches a frame is read in, across and up */
const CELLS_ACROSS = 64;
const CELLS_UP = 36;
/** a patch's jump in light that counts (a share of white, as drawn), and the share of the frame's patches that may
 *  flicker in one frame: a portico column's flicker was 30 to 40 patches, 7 to 42 levels of 255; the torches' light
 *  wavers as it's meant to, up to 4 levels a frame, and the fog's step as the eye crosses the door's line settles back
 *  by 5 */
const JUMP = 6 / 255;
const MOST_FLICKER = 0.004;
/** the frames either side of a walk's worst whose light is said */
const AROUND = 6;
/** the views walked in, and the hours */
const VIEWS: ViewMode[] = ['top', 'third'];
const HOURS = [0, 12];

/** What a flickering walk is walked again without, to name what flickers: the hall's thinning, the fog, the doors he
 *  sees through, the fog's fades. */
type Held = 'thinning' | 'fog' | 'doors' | 'fades';
const HOLDS: Held[] = ['thinning', 'fog', 'doors', 'fades'];

/** A walk's worst frame: the share of the patches that flickered there, its step, and the frames round it. */
interface Worst {
  share: number;
  step: number;
  /** the frame before it, it and the one after, and it with what flickered marked */
  frames: Canvas[];
  marked: Canvas | null;
  /** the light of what flickered, frame by frame round it */
  round: string;
}

/** One walk: its view, hour and line, its worst frame, and the same walked again without each of `HOLDS`. */
interface Walk extends Worst {
  view: ViewMode;
  hour: number;
  line: number;
  without: string[];
}

/** `frame`'s mean light (green, as drawn) in each of its patches. */
function patchLight(frame: Canvas): Float32Array {
  const sums = new Float32Array(CELLS_ACROSS * CELLS_UP);
  const counts = new Float32Array(CELLS_ACROSS * CELLS_UP);
  for (let y = 0; y < frame.height; y++) {
    const row = Math.floor((y / frame.height) * CELLS_UP) * CELLS_ACROSS;
    for (let x = 0; x < frame.width; x++) {
      const cell = row + Math.floor((x / frame.width) * CELLS_ACROSS);
      sums[cell] += frame.pixels[(y * frame.width + x) * 4 + 1];
      counts[cell]++;
    }
  }
  return sums.map((sum, cell) => sum / Math.max(1, counts[cell]));
}

/** The patches whose light jumped by over `JUMP` one way from `a` to `b` and straight back from `b` to `c`. */
function flickered(a: Float32Array, b: Float32Array, c: Float32Array): number[] {
  const cells: number[] = [];
  for (let cell = 0; cell < b.length; cell++) {
    const first = b[cell] - a[cell];
    const second = c[cell] - b[cell];
    const jumps = Math.abs(first) > JUMP && Math.abs(second) > JUMP;
    if (jumps && Math.sign(first) !== Math.sign(second)) cells.push(cell);
  }
  return cells;
}

/** `frame` with `cells` tinted magenta. */
function marked(frame: Canvas, cells: number[]): Canvas {
  const pixels = frame.pixels.slice();
  const tinted = new Set(cells);
  for (let y = 0; y < frame.height; y++) {
    const row = Math.floor((y / frame.height) * CELLS_UP) * CELLS_ACROSS;
    for (let x = 0; x < frame.width; x++) {
      if (!tinted.has(row + Math.floor((x / frame.width) * CELLS_ACROSS))) continue;
      const at = (y * frame.width + x) * 4;
      pixels[at] = Math.max(pixels[at], 0.8);
      pixels[at + 2] = Math.max(pixels[at + 2], 0.8);
    }
  }
  return { ...frame, pixels };
}

/** The mean light of `cells`, frame by frame round `step` of `lights`, in levels of 255, the step's in brackets. */
function lightRound(lights: Float32Array[], cells: number[], step: number): string {
  const said: string[] = [];
  const last = Math.min(lights.length - 1, step + AROUND);
  for (let at = Math.max(0, step - AROUND); at <= last; at++) {
    let sum = 0;
    for (const cell of cells) sum += lights[at][cell];
    const level = ((sum / Math.max(1, cells.length)) * 255).toFixed(1);
    said.push(at === step ? `[${level}]` : level);
  }
  return said.join(' ');
}

/** He stands `along` m out from the door's line (less than none: inside), `line` m off its middle, facing in. */
function standAt(line: number, along: number): void {
  const at = new THREE.Vector3(TERRACE.x + line, 0, HALL.door + along);
  at.y = groundHeight(at.x, at.z);
  G.player.walkTo = null;
  G.player.place(at, Math.PI);
}

/** Where the camera stood and its lens (over the shoulder its near plane and its width follow how near it comes to
 *  him, `overHead` in core/renderer.ts: held where it stood alone, the lens's change read as 15% of the frame
 *  flickering). */
interface HeldCamera {
  place: THREE.Matrix4;
  fov: number;
  near: number;
}

/** The camera as it stands now. */
function cameraNow(): HeldCamera {
  const camera = G.camera as THREE.PerspectiveCamera;
  return { place: camera.matrixWorld.clone(), fov: camera.fov, near: camera.near };
}

/** The camera put back as `held`, the fog told too (it places each pixel by the camera). */
function holdCamera(held: HeldCamera): void {
  const camera = G.camera as THREE.PerspectiveCamera;
  held.place.decompose(camera.position, camera.quaternion, camera.scale);
  camera.fov = held.fov;
  camera.near = held.near;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  aimSight(camera);
}

/** The frame drawn now, `held` let go for its draw alone (the game sets the thinning again each frame). */
function drawnWithout(lab: Lab, held?: Held): Canvas {
  const putBack = held === 'thinning' ? thinningLetGo() : null;
  try {
    return drawFrame(lab);
  } finally {
    putBack?.();
  }
}

/** One walk in through the door along `line`, the camera held where it settled at its start; its worst frame.
 *  `canary` thins the front wall and the columns whole and keeps them in turns, frame by frame, which must be
 *  caught (the columns alone thin only on the way to him, and from the door most stand aside of it). */
async function walkIn(lab: Lab, line: number, canary: boolean, held?: Held): Promise<Worst> {
  standAt(line, FROM_OUT);
  faceCamera(Math.PI);
  await lab.step(SETTLE);
  const camera = cameraNow();
  G.player.obj.visible = false;
  const frames: Canvas[] = [];
  const lights: Float32Array[] = [];
  let worst: Worst = { share: 0, step: 0, frames: [], marked: null, round: '' };
  let worstCells: number[] = [];
  const steps = Math.round((FROM_OUT + TO_IN) / STEP);
  try {
    for (let step = 0; step <= steps; step++) {
      standAt(line, FROM_OUT - step * STEP);
      await lab.step(1);
      holdCamera(camera);
      if (canary) for (const kind of ['hallFront', 'hallColumn'] as const) fadeWhole(kind, step % 2 ? 0.8 : 0);
      frames.push(drawnWithout(lab, held));
      lights.push(patchLight(frames[frames.length - 1]));
      if (frames.length > 3) frames.shift();
      if (lights.length < 3) continue;
      const cells = flickered(lights[step - 2], lights[step - 1], lights[step]);
      const share = cells.length / (CELLS_ACROSS * CELLS_UP);
      if (share <= worst.share) continue;
      worst = { share, step: step - 1, frames: [...frames], marked: marked(frames[1], cells), round: '' };
      worstCells = cells;
    }
  } finally {
    G.player.obj.visible = true;
  }
  worst.round = lightRound(lights, worstCells, worst.step);
  return worst;
}

/** The walk along `line` again with each of `HOLDS` let go: its worst flicker each time. */
async function walkedWithout(lab: Lab, line: number): Promise<string[]> {
  const said: string[] = [];
  for (const held of HOLDS) {
    holdSightOff(held === 'fog');
    holdDoorsOff(held === 'doors');
    holdSightSharp(held === 'fades');
    try {
      const walk = await walkIn(lab, line, false, held);
      said.push(`without the ${held} ${(walk.share * 100).toFixed(2)}%`);
    } finally {
      holdSightOff(false);
      holdDoorsOff(false);
      holdSightSharp(false);
    }
  }
  return said;
}

/** A walk said: where, its worst frame, and walked without each hold, its light there frame by frame. */
function said(walk: Walk): string {
  const share = (walk.share * 100).toFixed(2);
  const along = (FROM_OUT - walk.step * STEP).toFixed(2);
  const without = walk.without.length ? ` (${walk.without.join(', ')}; its light frame by frame: ${walk.round})` : '';
  return `${walk.view} at ${walk.hour}:00, ${walk.line} m off the door's middle: at most ${share}% of the frame `
    + `flickered (at most ${MOST_FLICKER * 100}%), ${along} m out from its line${without}`;
}

/** A flickering walk's worst frame with the frames either side, and what flickered marked. */
function pictured(walk: Walk): Pictured {
  const tiles = walk.frames.map((frame, at) => tileOf(['before', 'drawn', 'after'][at], frame));
  if (walk.marked) tiles.push(tileOf('flickered', walk.marked));
  return { label: `hallEntry-${walk.view}-${walk.hour}h-${walk.line}m`, tiles, notes: [said(walk)] };
}

/**
 * `hallEntrySteady`: the hero walked in through the hall's door along each line, in each view and hour, the camera
 * held: no frame may have more than `MOST_FLICKER` of its patches jump and jump straight back. A walk that does is
 * walked again without each of `HOLDS`, to name what flickers, and pictured. `canary` flickers the front wall's and
 * the columns' whole thinning frame by frame, which every walk must catch.
 */
export async function hallEntrySteady(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const kept = viewMode();
  const walks: Walk[] = [];
  const moments: Pictured[] = [];
  try {
    for (const hour of HOURS) {
      holdHour(hour);
      for (const view of VIEWS) {
        await viewBy(lab, view);
        for (const line of LINES) {
          const walk: Walk = { view, hour, line, ...(await walkIn(lab, line, canary)), without: [] };
          const flickers = !canary && walk.share > MOST_FLICKER;
          if (flickers) walk.without = await walkedWithout(lab, line);
          // (pictured as it ends and its frames let go: a dozen walks' frames as floats are hundreds of MB)
          if (flickers) moments.push(pictured(walk));
          walks.push({ ...walk, frames: [], marked: null });
        }
      }
    }
  } finally {
    holdHour(null);
    await viewBy(lab, kept);
  }
  const lines = walks.map(said);
  const flickering = walks.filter((walk) => walk.share > MOST_FLICKER);
  if (canary) return { lines, problems: [], caught: flickering.length === walks.length, moments: [] };
  const problems = flickering.map((walk) => `${said(walk)}: the hall flickers as he enters`);
  return { lines, problems, caught: null, moments };
}
