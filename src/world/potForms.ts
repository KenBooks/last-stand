// The forms the tavern's shelf pottery is thrown in (#733), with the kit of `pottery.ts`: pitchers with a soft pulled
// lip and a strap handle opposite it, tall jugs, bowls, beakers, slipware plates trailed in cream slip, and pewter
// chargers. Each pot's proportions and glaze are its own, so no two on a shelf are copies.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CLAYS, GLAZES, handle, throwPot, varied, type Profile } from './pottery';
import { DESIGNS, slipUv } from './slipware';

/** one of `choices`, by `rng` */
const pick = <T>(rng: () => number, choices: readonly T[]): T => choices[Math.floor(rng() * choices.length)];

/** the inside of an open pot under its lip: its outside drawn in by a wall's thickness, from the lip down `deep` (m),
 *  closed there: as far as the eye reaches in from the room (a jug's whole inside was a third of its triangles) */
function insideOf(outside: Profile, wall: number, deep: number): Profile {
  const lipAt = outside[outside.length - 1][1];
  const floor = lipAt - deep;
  const inner: [number, number][] = [];
  for (let k = outside.length - 1; k >= 0; k--) {
    const [r, y] = outside[k];
    if (y < floor) break;
    inner.push([Math.max(0.004, r - wall), y]);
  }
  inner[0] = [inner[0][0], lipAt];
  inner.push([0, floor]);
  return inner;
}

/** Turn a pot's mouth out into a soft pouring lip on its -x side, opposite its handle: pulled by a finger, a little
 *  proud of the rim (a beak of 2 cm read as a modern pitcher's). */
function pouringLip(geometry: THREE.BufferGeometry, from: number, over: number): void {
  const position = geometry.attributes.position;
  for (let k = 0; k < position.count; k++) {
    const y = position.getY(k);
    if (y < from) continue;
    const x = position.getX(k), z = position.getZ(k), r = Math.hypot(x, z);
    const toward = r > 1e-6 ? Math.max(0, -x / r) ** 6 : 0;
    const rise = Math.min(1, (y - from) / over);
    position.setXYZ(k, x - 0.01 * toward * rise, y + 0.002 * toward * rise, z);
  }
}

const PITCHER: Profile = [[0, 0], [0.044, 0], [0.05, 0.006], [0.056, 0.02], [0.067, 0.045], [0.074, 0.075],
  [0.073, 0.1], [0.066, 0.125], [0.053, 0.15], [0.04, 0.17], [0.036, 0.185], [0.039, 0.202], [0.045, 0.215],
  [0.046, 0.222]];

/** A pitcher: foot, round belly, shoulder, neck and a flared lip with a pouring lip, and a strap handle. */
export function pitcher(rng: () => number): THREE.BufferGeometry {
  const glaze = pick(rng, [GLAZES.honey, GLAZES.honey, GLAZES.green, GLAZES.iron]);
  const { profile, wide, tall } = varied(PITCHER, rng);
  const height = 0.222 * tall;
  const body = throwPot({
    outside: profile, inside: insideOf(profile, 0.007, 0.05), sides: 18, glaze, clay: CLAYS.red,
    glazedTo: height * (0.3 + rng() * 0.3),
  }, rng, (lathe) => pouringLip(lathe, height - 0.025, 0.025));
  // (its ends sunk into the neck and the belly, close along the body: stood off it, it read as an ear)
  const loop = handle([[0.034, 0.195], [0.066, 0.19], [0.086, 0.15], [0.08, 0.098], [0.064, 0.066]]
    .map(([x, y]) => new THREE.Vector3(x * wide, y * tall, 0)), glaze);
  return mergeGeometries([body, loop])!;
}

const TALL_JUG: Profile = [[0, 0], [0.038, 0], [0.043, 0.006], [0.05, 0.03], [0.057, 0.08], [0.058, 0.13],
  [0.05, 0.175], [0.034, 0.2], [0.022, 0.215], [0.02, 0.24], [0.024, 0.252], [0.025, 0.258]];

/** A tall jug for ale or oil: a narrow neck over a long belly, a small handle at its shoulder. */
export function tallJug(rng: () => number): THREE.BufferGeometry {
  const glaze = pick(rng, [GLAZES.iron, GLAZES.green, GLAZES.honey]);
  const { profile, wide, tall } = varied(TALL_JUG, rng);
  const body = throwPot({
    outside: profile, inside: insideOf(profile, 0.006, 0.04), sides: 16, glaze, clay: CLAYS.buff,
    glazedTo: 0.258 * tall * (0.3 + rng() * 0.3),
  }, rng);
  const loop = handle([[0.02, 0.236], [0.046, 0.232], [0.062, 0.2], [0.054, 0.168]]
    .map(([x, y]) => new THREE.Vector3(x * wide, y * tall, 0)), glaze);
  return mergeGeometries([body, loop])!;
}

const BOWL: Profile = [[0, 0.004], [0.026, 0.004], [0.028, 0], [0.034, 0], [0.036, 0.006], [0.058, 0.02],
  [0.077, 0.042], [0.086, 0.06], [0.088, 0.066]];

/** A bowl: a foot ring, a rounded wall and a rolled rim, glazed inside and over its top half outside; `under`, one
 *  with another in it, its inside only a rim's width (hidden by the bowl in it). */
export function bowl(rng: () => number, under = false): THREE.BufferGeometry {
  const { profile, tall } = varied(BOWL, rng, 0.3);
  return throwPot({
    // (its glaze's line runs round a wall 7 cm high: its own points and a few more draw it)
    outside: profile, inside: insideOf(profile, 0.006, under ? 0.012 : 0.054 * tall), sides: 16, wobble: 0.7,
    step: 0.02,
    glaze: pick(rng, [GLAZES.honey, GLAZES.iron, GLAZES.green]), clay: CLAYS.red, glazedTo: 0.066 * tall * 0.5,
  }, rng);
}

const BEAKER: Profile = [[0, 0], [0.026, 0], [0.031, 0.008], [0.034, 0.03], [0.035, 0.06], [0.037, 0.085],
  [0.038, 0.09]];

/** A beaker: a straight-walled drinking cup with a rounded foot. */
export function beaker(rng: () => number): THREE.BufferGeometry {
  const { profile, tall } = varied(BEAKER, rng, 0.6);
  return throwPot({
    outside: profile, inside: insideOf(profile, 0.005, 0.03), sides: 12, step: 0.02,
    glaze: pick(rng, [GLAZES.green, GLAZES.iron, GLAZES.honey]), clay: CLAYS.buff,
    glazedTo: 0.09 * tall * (0.35 + rng() * 0.3),
  }, rng);
}

/** the glaze under a plate's map: white, the map's own colours shown, darkened only where the vertices say (its
 *  rim's broken glaze, its well's shadow) */
const WHITE = new THREE.Color(0xffffff);

/** A slipware plate, its face up (+y): a foot ring, a well and a broad rim, its face trailed in slip, the design one of the atlas's
 *  (`slipware.ts`). */
export function slipPlate(rng: () => number): THREE.BufferGeometry {
  const design = Math.floor(rng() * DESIGNS);
  return throwPot({
    // (the underside, leant against the wall and never seen: its foot ring's edge and the rim, no more)
    outside: [[0, 0.004], [0.056, 0], [0.136, 0.044], [0.14, 0.052]],
    // (its face from the rim in: a rolled edge, the rim, the well's wall and its floor; its slip is the map's)
    inside: [[0.138, 0.058], [0.13, 0.06], [0.117, 0.055], [0.1, 0.042], [0.085, 0.029], [0.06, 0.025],
      [0.03, 0.024], [0, 0.024]],
    sides: 24, glaze: WHITE, clay: CLAYS.red, glazedTo: 0.05, step: 1, wobble: 0.35,
    uvAt: (radius, angle) => slipUv(design, radius, angle),
  }, rng);
}

/** A pewter charger, its face up (+y): a broad flat rim with a bead at its edge, a shallow well. */
export function charger(): THREE.BufferGeometry {
  // (its back, against the wall, its foot's edge and the rim alone)
  const points: Profile = [[0, 0], [0.056, 0.004], [0.142, 0.02], [0.146, 0.026], [0.143, 0.031], [0.137, 0.029],
    [0.1, 0.025], [0.09, 0.016], [0, 0.011]];
  // (32 sides: its round edge, seen face on, showed 28 as facets)
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), 32);
}

/** a pot's turn on the shelf: its handle seen side on, a little towards the room */
export function facing(rng: () => number): number {
  return (rng() < 0.5 ? 0 : Math.PI) + (rng() - 0.5) * 0.6;
}

