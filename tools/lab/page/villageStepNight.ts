// `lab village --only stepPlainAtNight` (#946, from play: "at night, the top step lights up too bright, not sure where
// it's from"): at midnight, in the hall of heroes over the shoulder looking out through its door, the terrace stair's
// top step showed as a bright line far past the paving before it, blown out white. Its granite was polished (the
// recipe's own roughness), and each tread caught the stair's two lamps as one highlight thrown back at the camera
// (the engine's light cache keeps their light from one direction, between them). At stands down the aisle facing the
// door, points on the top step's tread and on the paving before it, seen through the door (not behind the wall, the
// door's frame or him), are read off the frame drawn: the tread's pixels blown out (as `lightsNotBlinding` counts a
// light's: its brightest channel at 0.97 of white or more) and its brightest tenth against the paving's. `--canary`
// polishes the stair again.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { faceCamera, setZoom, viewMode } from '../../../src/core/renderer';
import { holdHour } from '../../../src/game/clock';
import { CAMERA } from '../../../src/data/balance';
import { STEP_RISE, TERRACE } from '../../../src/data/village';
import { groundHeight } from '../../../src/world/ground';
import { wallHit } from '../../../src/world/wall';
import { drawFrame, topLight, type Canvas } from './light';
import { viewBy } from './villageHallCull';
import { hisPixels } from './villageHeroInView';
import type { LightsChecked } from './villageLights';

/** the hour (the play report's) and the frames each stand is given to settle */
const HOUR = 0;
const SETTLE = 40;
/** where he stands down the aisle, facing the door (z, m) */
const STANDS_Z = [-17, -18.5, -20, -22];
/** a pixel blown out: its brightest channel's light at least this (`BLOWN` in villageLights.ts) */
const BLOWN = 0.97;
/** the most of the tread's pixels blown out, and the most its brightest tenth may be over the paving's */
const MOST_BLOWN = 0.02;
const MOST_OVER_PAVING = 1.5;
/** the fewest points of the tread and of the paving that must be seen, or nothing was read */
const LEAST_SEEN = 12;
/** the points read: across the stair every this (m), and how far in from its sides */
const ACROSS_EVERY = 0.15;
const SIDE_IN = 0.1;
/** where on the tread they lie (shares of its run from the terrace's edge), and how far before the edge on the
 *  paving (m) */
const ON_TREAD = [0.2, 0.5, 0.8];
const ON_PAVING = [0.3, 0.6, 0.9, 1.2];
/** how far short of a point the line to it may meet the wall and still see it (a share of the way) */
const SEEN_SHORT = 0.98;
/** the canary's polish: the granite's own roughness (its map's, 0.34 to 0.58) */
const POLISHED = 0.45;

/** the stair's steps, its top step's run (m), and the paving's height over the terrace (`paved` in world/village.ts) */
const STEPS = Math.round(TERRACE.high / STEP_RISE);
const RUN = (TERRACE.stairFoot - TERRACE.front) / STEPS;
const PAVING_UP = 0.005;

/** Points on the top step's tread (`tread`) or on the paving before it, across the stair. */
function pointsOn(tread: boolean): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const half = TERRACE.stairHalf - SIDE_IN;
  const along = tread ? ON_TREAD.map((share) => TERRACE.front + share * RUN) : ON_PAVING.map((d) => TERRACE.front - d);
  const y = TERRACE.high + (tread ? 0 : PAVING_UP);
  for (let x = -half; x <= half; x += ACROSS_EVERY) {
    for (const z of along) points.push(new THREE.Vector3(TERRACE.x + x, y, z));
  }
  return points;
}

/** The canvas's pixel (its first channel's index) `point` falls on, or null off it or unseen: behind the wall, the
 *  door's frame or him. */
function seenPixel(canvas: Canvas, point: THREE.Vector3, his: Set<number>): number | null {
  const hit = wallHit();
  if (G.arena.wall.cast(G.camera.position, point, hit) && hit.t < SEEN_SHORT) return null;
  const on = point.clone().project(G.camera);
  if (on.z > 1 || Math.abs(on.x) >= 1 || Math.abs(on.y) >= 1) return null;
  const x = Math.floor(((on.x + 1) / 2) * canvas.width);
  const y = Math.floor(((on.y + 1) / 2) * canvas.height);
  const at = (y * canvas.width + x) * 4;
  return his.has(at) ? null : at;
}

/** The lights of the pixels `points` fall on where seen. */
function lightsAt(canvas: Canvas, points: THREE.Vector3[], his: Set<number>): number[] {
  const lights: number[] = [];
  for (const point of points) {
    const at = seenPixel(canvas, point, his);
    if (at !== null) lights.push(topLight(canvas, at));
  }
  return lights;
}

/** The brightest tenth's least of `lights`. */
function brightestTenth(lights: number[]): number {
  const sorted = [...lights].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.9)] ?? 0;
}

/** What one stand read. */
interface StepRead { z: number; tread: number[]; paving: number[]; blown: number; over: number }

/** The hero stood `z` down the aisle facing the door, and the step and the paving read. */
async function readStand(lab: Lab, z: number): Promise<StepRead> {
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(TERRACE.x, groundHeight(TERRACE.x, z), z), 0);
  setZoom(CAMERA.lobbyZoom);
  faceCamera(0);
  await lab.step(SETTLE);
  const his = new Set(hisPixels(lab));
  const canvas = drawFrame(lab);
  const tread = lightsAt(canvas, pointsOn(true), his);
  const paving = lightsAt(canvas, pointsOn(false), his);
  const blown = tread.filter((light) => light >= BLOWN).length / Math.max(tread.length, 1);
  const over = brightestTenth(tread) / Math.max(brightestTenth(paving), 1e-4);
  return { z, tread, paving, blown, over };
}

/** A stand's read as a line. */
function said(read: StepRead): string {
  return `from ${read.z} m: ${(read.blown * 100).toFixed(0)}% of the step's ${read.tread.length} points blown out, `
    + `its brightest tenth ${read.over.toFixed(2)} times the paving's (${read.paving.length} points)`;
}

/** Why a stand fails, or null. */
function failsOf(read: StepRead): string | null {
  if (read.tread.length < LEAST_SEEN || read.paving.length < LEAST_SEEN) return `${said(read)}: too little seen`;
  if (read.blown > MOST_BLOWN) return `${said(read)}: the step is blown out`;
  if (read.over > MOST_OVER_PAVING) return `${said(read)}: the step glows past the paving`;
  return null;
}

/** The stair's granite meshes (the top step down: blocks over its footprint), each with its material. */
function stairMaterials(): THREE.MeshStandardMaterial[] {
  const found = new Set<THREE.MeshStandardMaterial>();
  G.arena.groupOf('village').traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || (mesh.material as THREE.Material).name !== 'stairGranite') return;
    found.add(mesh.material as THREE.MeshStandardMaterial);
  });
  return [...found];
}

/** The stair polished as it was (the canary), and a way to put it back. */
function polishStair(): () => void {
  const materials = stairMaterials();
  if (!materials.length) throw new Error('lab: village: no stair of its own granite to polish');
  const was = materials.map((material) => material.roughness);
  for (const material of materials) material.roughness = POLISHED;
  return () => materials.forEach((material, index) => { material.roughness = was[index]; });
}

/** The top step at night through the hall's door is no brighter than the paving before it. */
export async function stepPlainAtNight(lab: Lab, canary: boolean): Promise<LightsChecked> {
  holdHour(HOUR);
  const kept = viewMode();
  const putBack = canary ? polishStair() : null;
  try {
    await viewBy(lab, 'third');
    const reads: StepRead[] = [];
    for (const z of STANDS_Z) reads.push(await readStand(lab, z));
    const failed = reads.map(failsOf).filter((fail): fail is string => fail !== null);
    const lines = [`the top step at midnight through the hall's door (at most ${MOST_BLOWN * 100}% blown out, `
      + `${MOST_OVER_PAVING} times the paving):`, ...reads.map((read) => `  ${said(read)}`)];
    if (canary) return { lines, problems: [], caught: failed.length > 0, moments: [] };
    const moments: Pictured[] = [];
    await readStand(lab, STANDS_Z[1]);
    moments.push(await lab.screen('the top step at midnight through the door', [said(reads[1])]));
    return { lines, problems: failed, caught: null, moments };
  } finally {
    putBack?.();
    holdHour(null);
    await viewBy(lab, kept);
  }
}
