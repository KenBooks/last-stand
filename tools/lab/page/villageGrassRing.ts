// `lab village`'s grass as its rings follow the hero: over the shoulder at noon, turned to open meadow, the meadow's
// blades drawn alone on black, then drawn again with nothing changed but the rings' middle moved 2 m ahead, as a few
// steps move it (`moveMeadowFocus`). Each pixel is read by how far from the rings' middle the ground it shows lies, in
// bands a metre wide: the grass's grain there (the light's step from a blade's pixel to the next blade's pixel beside
// it, against their light) and how it changed. A ring's cells are twice as wide as the one inside it, its blades a
// quarter as many and four times as wide, and where one handed over to the next the grass turned to a lighter, coarser
// carpet in a circle that followed the view (from play, "the circle of changing grass is still there, its about this
// far out, see where the far curb is, and it keeps moving as I'm moving"); the far rings' blades are cut into strands
// of the first ring's width now (`meadow.ts`). `canary` draws them whole, as they were.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { holdHour } from '../../../src/game/clock';
import { faceCamera, viewMode } from '../../../src/core/renderer';
import {
  focusOf, holdEyeFollowsAbove, holdMeadowFromAbove, meadowCombed, meadowHandOver, moveMeadowFocus,
} from '../../../src/world/meadow';
import { drawFrame, type Canvas } from './light';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** the hour, where the hero stands and the way he faces: open meadow ahead, the cottages' sides off to the left */
const HOUR = 12;
const STAND = new THREE.Vector3(10, 0, 4);
const FACING = Math.PI / 2;
const SETTLE = 60;
/** how far ahead the rings' middle is moved between the two frames (m) */
const MOVED = 2;
/** every this many pixels each way a pixel is read */
const STEP = 2;
/** the bands' width (m) and the farthest read (m) */
const BAND = 1;
const FARTHEST = 40;
/** a band read: at least this many of its pixels showing blades */
const FEWEST = 400;
/** a pixel lit by a blade: its light past this (black is no blade) */
const LIT = 0.004;
/** the most a band's grain may change as the rings move (a share of it) */
const MOST_GRAIN = 0.15;
/** how far the rings' middle goes in a stride (m), and the most of a band's light that may change in one */
const STRIDE = 0.5;
/** a band read only if blades cover this much of it: thin, over a road or a house's side, a few blades are all it has,
 *  and it read the highest of all at every hand-over tried */
const LEAST_COVER = 0.7;
// (0.1 while every blade was a blade wide: High's tufts are thin blades that hide little of each other, so as many
// coming and going in a stride change more of a band's pixels, 10.0 to 11.7% from run to run; Medium's whole blades
// read 8.7%. Wider or slower hand-overs moved the worst band and changed as much: it's as many blades a stride)
const MOST_CHANGED = 0.12;

/** One band's grass in a frame: its pixels showing blades, and the sums of their light and of the light's steps to the
 *  next blade pixel beside each (over `pairs` of them). */
interface BandSum { blades: number; light: number; pairs: number; steps: number }

/** One band's change: its pixels showing blades, its grain before and after (the mean step between blade pixels
 *  side by side, against their mean light), and the share of its grain that changed. */
interface BandChange { blades: number; grain: number; after: number; change: number }

/** Every object up from `object` to the scene, and each one's siblings: what must hide for it alone to be drawn. */
function hiddenAround(object: THREE.Object3D): THREE.Object3D[] {
  const hidden: THREE.Object3D[] = [];
  for (let at: THREE.Object3D = object; at.parent; at = at.parent) {
    for (const sibling of at.parent.children) {
      if (sibling !== at && sibling.visible && !(sibling as THREE.Light).isLight) hidden.push(sibling);
    }
  }
  return hidden;
}

/** The frames drawn with the meadow's blades alone, on black: with the rings' middle as the view puts it, then moved
 *  `ahead` (x, z). */
function bladesAlone(lab: Lab, ahead: THREE.Vector2): [Canvas, Canvas] {
  const meadow = G.scene.getObjectByName('meadow');
  if (!meadow) throw new Error('lab: village: no meadow in the scene');
  const hidden = hiddenAround(meadow);
  const background = G.scene.background;
  for (const o of hidden) o.visible = false;
  G.scene.background = null;
  try {
    const before = drawFrame(lab);
    moveMeadowFocus(ahead.x, ahead.y);
    return [before, drawFrame(lab)];
  } finally {
    moveMeadowFocus(0, 0);
    for (const o of hidden) o.visible = true;
    G.scene.background = background;
  }
}

/** The ground (y = 0) under the canvas's pixel (x, y from its bottom row), or null past the horizon. */
function groundUnder(canvas: Canvas, x: number, y: number, ray: THREE.Ray, out: THREE.Vector3): THREE.Vector3 | null {
  const ndc = new THREE.Vector3((x + 0.5) / canvas.width * 2 - 1, (y + 0.5) / canvas.height * 2 - 1, 0.5);
  ray.origin.setFromMatrixPosition(G.camera.matrixWorld);
  ray.direction.copy(ndc.unproject(G.camera)).sub(ray.origin).normalize();
  if (ray.direction.y > -1e-3) return null;
  return ray.at(-ray.origin.y / ray.direction.y, out);
}

/** The light of `canvas`'s pixel `i` (its first channel's index). */
function lightAt(canvas: Canvas, i: number): number {
  return (canvas.pixels[i] + canvas.pixels[i + 1] + canvas.pixels[i + 2]) / 3;
}

/** Each pixel read's band: its ground's distance from `focus` in bands, or -1 past the horizon or the farthest. */
function bandsUnder(canvas: Canvas, focus: THREE.Vector2): Int16Array {
  const columns = Math.ceil(canvas.width / STEP);
  const bands = new Int16Array(columns * Math.ceil(canvas.height / STEP)).fill(-1);
  const ray = new THREE.Ray();
  const ground = new THREE.Vector3();
  for (let y = 0; y < canvas.height; y += STEP) {
    for (let x = 0; x < canvas.width; x += STEP) {
      if (!groundUnder(canvas, x, y, ray, ground)) continue;
      const band = Math.floor(Math.hypot(ground.x - focus.x, ground.z - focus.y) / BAND);
      if (band < FARTHEST / BAND) bands[(y / STEP) * columns + x / STEP] = band;
    }
  }
  return bands;
}

/** A frame's grass summed in its bands (`bands`, a pixel read's each). */
function bandSums(canvas: Canvas, bands: Int16Array): BandSum[] {
  const sums = Array.from({ length: FARTHEST / BAND }, () => ({ blades: 0, light: 0, pairs: 0, steps: 0 }));
  const columns = Math.ceil(canvas.width / STEP);
  for (let y = 0; y < canvas.height; y += STEP) {
    for (let x = 0; x + STEP < canvas.width; x += STEP) {
      const band = bands[(y / STEP) * columns + x / STEP];
      if (band < 0) continue;
      const i = (y * canvas.width + x) * 4;
      const light = lightAt(canvas, i);
      if (light <= LIT) continue;
      const sum = sums[band];
      sum.blades++;
      sum.light += light;
      const beside = lightAt(canvas, i + STEP * 4);
      if (beside <= LIT) continue;
      sum.pairs++;
      sum.steps += Math.abs(beside - light);
    }
  }
  return sums;
}

/** A band's grain: the mean step between its blade pixels side by side, against their mean light. */
function grainOf(sum: BandSum): number {
  return (sum.steps / Math.max(1, sum.pairs)) / Math.max(1e-6, sum.light / Math.max(1, sum.blades));
}

/** The bands read, each `[from m, its change]`: the grass's grain before the rings moved and after, those showing
 *  too few blades left out. */
function bandChanges(before: Canvas, after: Canvas, focus: THREE.Vector2): [number, BandChange][] {
  const bands = bandsUnder(before, focus);
  const was = bandSums(before, bands);
  const is = bandSums(after, bands);
  return was.flatMap((sum, k): [number, BandChange][] => {
    if (Math.min(sum.pairs, is[k].pairs) < FEWEST) return [];
    const grain = grainOf(sum);
    const after = grainOf(is[k]);
    return [[k * BAND, { blades: sum.blades, grain, after, change: (after - grain) / grain }]];
  });
}

/** The grass's change band by band as the rings' middle moves ahead (stepped as the rings were, with `canary`). */
async function grassAsRingsMove(lab: Lab, canary: boolean): Promise<[number, BandChange][]> {
  const kept = viewMode();
  holdHour(HOUR);
  if (canary) meadowCombed(false);
  try {
    await viewBy(lab, 'third');
    G.player.walkTo = null;
    G.player.place(STAND, FACING);
    faceCamera(FACING);
    await lab.step(SETTLE);
    G.player.obj.visible = false;
    try {
      const focus = focusOf(G.camera, new THREE.Vector2());
      const sight = G.camera.getWorldDirection(new THREE.Vector3());
      const ahead = new THREE.Vector2(sight.x, sight.z).normalize().multiplyScalar(MOVED);
      return bandChanges(...bladesAlone(lab, ahead), focus);
    } finally {
      G.player.obj.visible = true;
    }
  } finally {
    if (canary) meadowCombed(true);
    holdHour(null);
    await viewBy(lab, kept);
  }
}

/** How much of each band's light changes between two frames, pixel by pixel, each `[from m, its share]`. */
function pixelsChanged(before: Canvas, after: Canvas, focus: THREE.Vector2, fewest = FEWEST, cover = LEAST_COVER,
): [number, number][] {
  const bands = bandsUnder(before, focus);
  const columns = Math.ceil(before.width / STEP);
  const blades = new Array<number>(FARTHEST / BAND).fill(0);
  const read = new Array<number>(FARTHEST / BAND).fill(0);
  const lit = new Array<number>(FARTHEST / BAND).fill(0);
  const changed = new Array<number>(FARTHEST / BAND).fill(0);
  for (let y = 0; y < before.height; y += STEP) {
    for (let x = 0; x < before.width; x += STEP) {
      const band = bands[(y / STEP) * columns + x / STEP];
      if (band < 0) continue;
      read[band]++;
      const i = (y * before.width + x) * 4;
      const was = lightAt(before, i);
      const is = lightAt(after, i);
      if (Math.max(was, is) <= LIT) continue;
      blades[band]++;
      lit[band] += Math.max(was, is);
      changed[band] += Math.abs(is - was);
    }
  }
  return blades.flatMap((count, k): [number, number][] => {
    return count < fewest || count < cover * read[k] ? [] : [[k * BAND, changed[k] / lit[k]]];
  });
}

/** What of the grass changes in a stride or so of the rings' middle, band by band (as they did, with `canary`). */
async function changedInAStride(lab: Lab, canary: boolean): Promise<[number, number][]> {
  const kept = viewMode();
  holdHour(HOUR);
  if (canary) meadowHandOver(false);
  try {
    await viewBy(lab, 'third');
    G.player.walkTo = null;
    G.player.place(STAND, FACING);
    faceCamera(FACING);
    await lab.step(SETTLE);
    G.player.obj.visible = false;
    try {
      const focus = focusOf(G.camera, new THREE.Vector2());
      const sight = G.camera.getWorldDirection(new THREE.Vector3());
      const ahead = new THREE.Vector2(sight.x, sight.z).normalize().multiplyScalar(STRIDE);
      const [before, after] = bladesAlone(lab, ahead);
      return pixelsChanged(before, after, focus);
    } finally {
      G.player.obj.visible = true;
    }
  } finally {
    if (canary) meadowHandOver(true);
    holdHour(null);
    await viewBy(lab, kept);
  }
}

/** No circle of blades coming and going round the hero: in a stride of the rings' middle, no band's light changing
 *  past `MOST_CHANGED` (from play, "the circle of grass that keeps expanding/redrawing as I move"). `canary` hands
 *  over as the rings did, across a fifth, each sheet grown whole. */
export async function grassRingsGentle(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const bands = await changedInAStride(lab, canary);
  if (bands.length < 10) throw new Error(`lab: village: only ${bands.length} bands of grass in view`);
  const [worstAt, worst] = bands.reduce((a, b) => (b[1] > a[1] ? b : a));
  const percent = (v: number): string => `${(v * 100).toFixed(1)}%`;
  const line = `grass in a ${STRIDE} m stride of the rings' middle: the most of a band's light changed `
    + `${percent(worst)} (${worstAt}-${worstAt + BAND} m out; at most ${percent(MOST_CHANGED)}); by band: `
    + bands.map(([at, share]) => `${at}:${percent(share)}`).join(' ');
  const seen = worst > MOST_CHANGED;
  if (canary) return { lines: [line], problems: [], caught: seen, moments: [] };
  const problems = seen ? [`${line}: a circle of blades comes and goes`] : [];
  return { lines: [line], problems, caught: null, moments: [] };
}

/** the most of a band's light that may change in a stride from above (the frame's a share of a blade's pixel) */
const MOST_ABOVE = 0.03;
/** a band read from above: its blades' pixels (a band there is small on the screen), and the share of it they cover
 *  (roads and roofs lie across every band) */
const ABOVE_FEWEST = 100;
const ABOVE_COVER = 0.2;

/** From above, no band's light changes as he walks a stride (from play, "in top down, grass is visibly redrawing as I'm
 *  moving around": the rings' hand-overs lay in the frame). `canary` draws the rings as they were. */
export async function grassStillFromAbove(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const kept = viewMode();
  holdHour(HOUR);
  holdEyeFollowsAbove(canary);
  let bands: [number, number][];
  try {
    await viewBy(lab, 'top');
    G.player.walkTo = null;
    G.player.place(STAND, FACING);
    await lab.step(SETTLE);
    G.player.obj.visible = false;
    try {
      const focus = focusOf(G.camera, new THREE.Vector2());
      const sight = G.camera.getWorldDirection(new THREE.Vector3());
      const ahead = new THREE.Vector2(sight.x, sight.z).normalize().multiplyScalar(STRIDE);
      bands = pixelsChanged(...bladesAlone(lab, ahead), focus, ABOVE_FEWEST, ABOVE_COVER);
    } finally {
      G.player.obj.visible = true;
    }
  } finally {
    holdEyeFollowsAbove(false);
    holdHour(null);
    await viewBy(lab, kept);
  }
  if (bands.length < 5) throw new Error(`lab: village: only ${bands.length} bands of grass from above`);
  const [worstAt, worst] = bands.reduce((a, b) => (b[1] > a[1] ? b : a));
  const percent = (v: number): string => `${(v * 100).toFixed(1)}%`;
  const line = `grass from above in a ${STRIDE} m stride: the most of a band's light changed ${percent(worst)} `
    + `(${worstAt} m out; at most ${percent(MOST_ABOVE)}); by band: `
    + bands.map(([at, share]) => `${at}:${percent(share)}`).join(' ');
  const seen = worst > MOST_ABOVE;
  if (canary) return { lines: [line], problems: [], caught: seen, moments: [] };
  return { lines: [line], problems: seen ? [`${line}: the grass redraws`] : [], caught: null, moments: [] };
}

/** The grass as its rings follow the hero: no band's grain changing past `MOST_GRAIN`. */
export async function grassRingsUnseen(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const bands = await grassAsRingsMove(lab, canary);
  if (bands.length < 10) throw new Error(`lab: village: only ${bands.length} bands of grass in view`);
  const [worstAt, worst] = bands.reduce((a, b) => (Math.abs(b[1].change) > Math.abs(a[1].change) ? b : a));
  const percent = (v: number): string => `${(v * 100).toFixed(0)}%`;
  const line = `grass as its rings' middle moves ${MOVED} m: the most a band's grain changed ${percent(worst.change)}`
    + ` (${worstAt}-${worstAt + BAND} m out, ${worst.grain.toFixed(2)} to ${worst.after.toFixed(2)}; at most `
    + `${percent(MOST_GRAIN)}); grain by band: ${bands.map(([at, c]) => `${at}:${c.grain.toFixed(2)}`).join(' ')}`;
  const seen = Math.abs(worst.change) > MOST_GRAIN;
  if (canary) return { lines: [line], problems: [], caught: seen, moments: [] };
  const problems = seen ? [`${line}: the rings' edge shows as they follow the hero`] : [];
  return { lines: [line], problems, caught: null, moments: [] };
}
