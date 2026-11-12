// `lab village`'s fence (`fence` in core/seeThrough.ts): the hero stood by the palisade, facing back in, from above,
// the camera out past it, so the palisade alone hides him (the line from the camera to his chest meets it first). It
// opens a hole of its own, and the houses' hole stays shut: a house beside him, on the camera's side of him, stays
// whole (from play, "at border of map, the house behind player suddenly disappeared", "yea this is messed up": a
// cottage's walls, frame and roof went, its footing left). The house is planted beside him by the check, a plain box
// of what's built, so the layout is the same at every stand whatever stands there. Each frame is drawn as the game
// draws it, then with the houses' hole shut, then the fence's too. `canary` reads the palisade as what's built, as it
// was, which must take the planted house apart.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { faceCamera, viewMode } from '../../../src/core/renderer';
import { holdRingsByMiddle, seeThrough, shutHole } from '../../../src/core/seeThrough';
import { holdFenceAsBuilt } from '../../../src/core/heroHidden';
import { holdHour } from '../../../src/game/clock';
import { COTTAGES } from '../../../src/data/village';
import { insidePalisade } from '../../../src/world/villagePlan';
import { groundHeight } from '../../../src/world/ground';
import { FENCE, wallHit } from '../../../src/world/wall';
import { drawFrame } from './light';
import { viewBy } from './villageHallCull';
import { changedShare, standAt, type PixelBox } from './villageSeeThrough';
import type { LightsChecked } from './villageLights';

/** where he may stand off a cottage's middle, away from the village's (m), the first with the palisade hiding him
 *  taken: between the cottages and the palisade, where it stands nearest */
const PASTS = [6, 5, 7, 4.5];
/** how far up him the line from the camera is drawn to (m: his chest) */
const CHEST = 1.1;
/** the planted house: its size (m), how far toward the camera from him and aside of the way to it its middle stands
 *  (past his own hole's reach, inside the wide one's) */
const HOUSE: Placed = { wide: 1.6, high: 3, toCamera: 0.8, aside: 3.2 };
/** the house planted past him, on the far side from the camera (its middle 3 m past him, as a cottage stands) */
const HOUSE_PAST: Placed = { wide: 1.6, high: 3, toCamera: -3, aside: 0 };
/** the least of the frame the house past him must change, drawn against left out */
const LEAST_PAST = 0.01;
/** the most of the frame the houses' hole may change, and the least the fence's must */
const MOST_HOUSES = 0.0005;
const LEAST_FENCE = 0.01;
/** the stands read (the fewest that must be found) */
const STANDS = 3;
/** no box: every pixel of the frame counted (as outside it) */
const NOWHERE: PixelBox = { left: 1, bottom: 1, right: 0, top: 0 };

/** A planted house's size (m) and where its middle stands from him: toward the camera and aside of the way to it. */
interface Placed { wide: number; high: number; toCamera: number; aside: number }

/** One stand's reading: what the houses' hole changed of the frame and what the fence's did. */
interface Stand { cottage: number; houses: number; fence: number; picture: Pictured }

const _hit = wallHit();

/** Whether the palisade is what hides him: the line from the camera to his chest meets it first. */
function fenceHidesHim(): boolean {
  const chest = G.player.pos.clone();
  chest.y += CHEST;
  return G.arena.wall.cast(G.camera.position, chest, _hit) && _hit.name === FENCE;
}

/** Whether he stands `past` m out from cottage `index`'s middle facing back in, the palisade alone hiding him. */
async function standByFence(lab: Lab, index: number, past: number): Promise<boolean> {
  const cottage = COTTAGES[index];
  const out = new THREE.Vector3(cottage.x, 0, cottage.z).normalize();
  const at = new THREE.Vector3(cottage.x, 0, cottage.z).addScaledVector(out, past);
  const facing = Math.atan2(-out.x, -out.z);
  if (!(await standAt(lab, at, facing))) return false;
  faceCamera(facing);
  await lab.step(1);
  return !insidePalisade(G.camera.position.x, G.camera.position.z) && fenceHidesHim();
}

/** A plain house of what's built planted where `placed` says from him, in `material`. */
function plantHouse(material: THREE.Material, placed: Placed): THREE.Mesh {
  const hero = G.player.pos;
  const toCamera = new THREE.Vector3(G.camera.position.x - hero.x, 0, G.camera.position.z - hero.z).normalize();
  const aside = new THREE.Vector3(-toCamera.z, 0, toCamera.x);
  const at = hero.clone().addScaledVector(toCamera, placed.toCamera).addScaledVector(aside, placed.aside);
  const geometry = new THREE.BoxGeometry(placed.wide, placed.high, placed.wide).translate(0, placed.high / 2, 0);
  const house = new THREE.Mesh(geometry, material);
  house.position.set(at.x, groundHeight(at.x, at.z), at.z);
  house.updateMatrixWorld(true);
  G.scene.add(house);
  return house;
}

/** The frame drawn as the game draws it, with the houses' hole shut, and with the fence's shut too. */
function threeFrames(lab: Lab): { houses: number; fence: number } {
  const game = drawFrame(lab);
  shutHole('built');
  const housesShut = drawFrame(lab);
  shutHole('fence');
  const bothShut = drawFrame(lab);
  return {
    houses: changedShare(game, housesShut, NOWHERE, false),
    fence: changedShare(housesShut, bothShut, NOWHERE, false),
  };
}

/** The share as a percentage. */
const percent = (share: number): string => `${(share * 100).toFixed(2)}%`;

/** The stand by the palisade past cottage `index` with a house planted beside him, or null where none hides him. */
async function readStand(lab: Lab, index: number, material: THREE.Material): Promise<Stand | null> {
  let stood = false;
  for (const past of PASTS) stood = stood || await standByFence(lab, index, past);
  if (!stood) return null;
  const house = plantHouse(material, HOUSE);
  try {
    const { houses, fence } = threeFrames(lab);
    const picture = await lab.screen(`by the palisade past cottage ${index}`, [
      `the houses' hole ${percent(houses)} of the frame, the fence's ${percent(fence)}`,
    ]);
    return { cottage: index, houses, fence, picture };
  } finally {
    house.removeFromParent();
    house.geometry.dispose();
  }
}

/** Stands by the palisade, `STANDS` of them at most. */
async function readStands(lab: Lab, material: THREE.Material): Promise<Stand[]> {
  const stands: Stand[] = [];
  for (let index = 0; index < COTTAGES.length && stands.length < STANDS; index++) {
    const stand = await readStand(lab, index, material);
    if (stand) stands.push(stand);
  }
  return stands;
}

/** A house beside him stays whole while the palisade alone hides him, from above. */
export async function housesBesideFence(lab: Lab, canary: boolean): Promise<LightsChecked> {
  holdHour(12);
  const kept = viewMode();
  const material = seeThrough(new THREE.MeshStandardMaterial({ color: 0xd8c8a8 }), 'built');
  holdFenceAsBuilt(canary);
  try {
    await viewBy(lab, 'top');
    const stands = await readStands(lab, material);
    const lines = stands.map((s) => `fence past cottage ${s.cottage}: the houses' hole changes ${percent(s.houses)} `
      + `of the frame (at most ${percent(MOST_HOUSES)}), the fence's ${percent(s.fence)} `
      + `(at least ${percent(LEAST_FENCE)})`);
    const moments = stands.map((s) => s.picture);
    const apart = stands.filter((s) => s.houses > MOST_HOUSES);
    if (canary) return { lines, problems: [], caught: apart.length > 0, moments };
    const problems: string[] = [];
    if (stands.length < STANDS) {
      problems.push(`fence: ${stands.length} stands with the palisade hiding him (${STANDS} wanted)`);
    }
    for (const s of apart) problems.push(`fence past cottage ${s.cottage}: the house beside him came apart`);
    for (const s of stands.filter((one) => one.fence < LEAST_FENCE)) {
      problems.push(`fence past cottage ${s.cottage}: the palisade hiding him never opened`);
    }
    return { lines, problems, caught: null, moments };
  } finally {
    material.dispose();
    holdFenceAsBuilt(false);
    holdHour(null);
    await viewBy(lab, kept);
  }
}

/** One stand's reading of a house past him: what of the frame it changes, drawn against left out. */
interface PastStand { cottage: number; shown: number; picture: Pictured }

/** The stand by the palisade past cottage `index` with a house planted past him, or null where none hides him. */
async function readPastStand(lab: Lab, index: number, material: THREE.Material): Promise<PastStand | null> {
  let stood = false;
  for (const past of PASTS) stood = stood || await standByFence(lab, index, past);
  if (!stood) return null;
  const house = plantHouse(material, HOUSE_PAST);
  try {
    const drawn = drawFrame(lab);
    house.visible = false;
    const left = drawFrame(lab);
    house.visible = true;
    const shown = changedShare(drawn, left, NOWHERE, false);
    const picture = await lab.screen(`a house past him, by the palisade past cottage ${index}`, [
      `the house past him ${percent(shown)} of the frame`,
    ]);
    return { cottage: index, shown, picture };
  } finally {
    house.removeFromParent();
    house.geometry.dispose();
  }
}

/**
 * A house past him stays drawn while the palisade hides him, from above with the camera out past it (from play, "where
 * did the house go?": the palisade, ordered among what blends by its middle, the village's, drew first, and its ghost
 * in its hole wrote depth the cottages past it failed, their walls and roofs gone to their footings). `canary` orders
 * the palisade by its middle, as it was, which must hide the planted house.
 */
export async function housesPastFence(lab: Lab, canary: boolean): Promise<LightsChecked> {
  holdHour(0);
  const kept = viewMode();
  const material = seeThrough(new THREE.MeshStandardMaterial({ color: 0xd8c8a8 }), 'built');
  holdRingsByMiddle(canary);
  try {
    await viewBy(lab, 'top');
    const stands: PastStand[] = [];
    for (let index = 0; index < COTTAGES.length && stands.length < STANDS; index++) {
      const stand = await readPastStand(lab, index, material);
      if (stand) stands.push(stand);
    }
    const lines = stands.map((s) => `fence past cottage ${s.cottage}: the house past him changes `
      + `${percent(s.shown)} of the frame (at least ${percent(LEAST_PAST)})`);
    const moments = stands.map((s) => s.picture);
    const hidden = stands.filter((s) => s.shown < LEAST_PAST);
    if (canary) return { lines, problems: [], caught: hidden.length > 0, moments };
    const problems: string[] = [];
    if (stands.length < STANDS) {
      problems.push(`fence: ${stands.length} stands with the palisade hiding him (${STANDS} wanted)`);
    }
    for (const s of hidden) problems.push(`fence past cottage ${s.cottage}: the house past him wasn't drawn`);
    return { lines, problems, caught: null, moments };
  } finally {
    material.dispose();
    holdRingsByMiddle(false);
    holdHour(null);
    await viewBy(lab, kept);
  }
}
