// `lab village`'s hero's shadow from a lamp: patches of paving behind him, away from the street lamp he stands by at
// midnight, each read from straight over it with the lamps' shadows at their strength and held off, while he casts
// and while he doesn't: what more they take while he casts is his. The lamps' shadows are drawn once of what stands
// still, and drawn with him hidden he cast none from them (from play: "no shadows from lights"). He stands by every
// lamp in turn, on paving where there is some round it ("it was missing for half of them"). `canary` stops him
// casting by the last lamp, which must be found.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { holdHour } from '../../../src/game/clock';
import { groundHeight } from '../../../src/world/ground';
import { drawFrame, topLight, type Canvas } from './light';
import { castingAsOne } from '../../../src/entities/models/castAsOne';
import { roadLines, SQUARE_R, toPolyline } from '../../../src/world/villagePlan';
import type { LightsChecked } from './villageLights';

/** how far from the lamp he stands (m): near it, and further off (from play, by a lamp at the stair: "no shadows
 *  FROM LIGHT, only from moon") */
const BYS = [1.5, 3];
/** the patches of ground read behind him: their turns off the line from the lamp through him (radians), how far
 *  behind him each lies and how far across it is (m), and the camera's height over them */
const SECTOR = [-0.3, -0.15, 0, 0.15, 0.3];
const OFFS = [0.6, 1.2, 1.8, 2.6];
const ACROSS = 0.4;
const OVER = 8;
/** the least his shadow must take of a patch's light, the spots round the lamp tried for paving behind him, and the
 *  frames he's given at each (the casting lights to settle) */
const LEAST_DARKER = 0.15;
/** the least share of a patch's light his moon shadow must take, the lamps' shadows held off (the moon's shadow
 *  always there: "moon shadow always there plus 1 or more shadows from lights"): 1.5 m from a lamp its light is most
 *  of the ground's, and his moon shadow took 9% of it on the grass; none takes nothing */
const LEAST_MOON = 0.05;
const SPOTS = 32;
/** how far inside a road's edge the ground read must lie (m): the meadow's blades over the grass take no lamp's
 *  shadow */
const ON_ROAD = 0.5;
const SETTLE = 150;

/** The mean light of the ground `ACROSS` m square round `at`, in the frame drawn from over it. */
function lightRound(canvas: Canvas, at: THREE.Vector3): number {
  const middle = at.clone().project(G.camera);
  const side = at.clone().add(new THREE.Vector3(ACROSS / 2, 0, 0)).project(G.camera);
  const x = ((middle.x + 1) / 2) * canvas.width;
  const y = ((middle.y + 1) / 2) * canvas.height;
  const half = Math.max(2, Math.abs(((side.x - middle.x) / 2) * canvas.width));
  let sum = 0;
  let count = 0;
  for (let py = Math.floor(y - half); py <= y + half; py++) {
    for (let px = Math.floor(x - half); px <= x + half; px++) {
      if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue;
      sum += topLight(canvas, (py * canvas.width + px) * 4);
      count++;
    }
  }
  return count ? sum / count : 0;
}

/** The point lights casting now (the lamps' at midnight). */
function castingLights(): THREE.PointLight[] {
  const lights: THREE.PointLight[] = [];
  G.scene.traverse((o) => {
    const light = o as THREE.PointLight;
    if (light.isPointLight && light.castShadow && light.intensity > 0) lights.push(light);
  });
  return lights;
}

/** The ground's light round `at` drawn from straight over it, the point lights' shadows at `strength` (or as they
 *  are), the game's camera given back after. */
function readOver(lab: Lab, at: THREE.Vector3, strength: number | null): number {
  const camera = G.camera;
  const kept = { at: camera.position.clone(), turn: camera.quaternion.clone() };
  const lights = castingLights();
  const strengths = lights.map((light) => light.shadow.intensity);
  if (strength !== null) for (const light of lights) light.shadow.intensity = strength;
  camera.position.set(at.x + 0.01, at.y + OVER, at.z);
  camera.lookAt(at);
  camera.updateMatrixWorld();
  try {
    return lightRound(drawFrame(lab), at);
  } finally {
    lights.forEach((light, i) => {
      light.shadow.intensity = strengths[i];
    });
    camera.position.copy(kept.at);
    camera.quaternion.copy(kept.turn);
    camera.updateMatrixWorld();
  }
}

/** The hero casting no shadow (the canary's fault, and the reading without his): every part of him, and the shadow
 *  his pieces are cast as one by (`castAsOne`, which casts whatever they say), or casting again as he did. */
function heroCasts(on: boolean, kept: Map<THREE.Object3D, boolean>): void {
  castingAsOne.on = on;
  G.player.obj.traverse((part) => {
    if (!on) {
      if (!kept.has(part)) kept.set(part, part.castShadow);
      part.castShadow = false;
    } else if (kept.has(part)) {
      part.castShadow = kept.get(part)!;
    }
  });
  if (on) kept.clear();
}

/** The share of the ground's light round `at` the lamps' shadows take, read with them at their strength and held
 *  off. */
function lampsTake(lab: Lab, at: THREE.Vector3): number {
  const shadowed = readOver(lab, at, null);
  const unshadowed = readOver(lab, at, 0);
  return 1 - shadowed / Math.max(unshadowed, 1e-3);
}

/** Whether (x, z) is paved: on the square or a road, `ON_ROAD` inside its edge. */
function paved(x: number, z: number): boolean {
  if (Math.hypot(x, z) < SQUARE_R - ON_ROAD) return true;
  return roadLines.some((road) => toPolyline(x, z, road.line) < road.width / 2 - ON_ROAD);
}

/** The patches of ground behind a hero at `spot`, away from `lamp`: across a sector of it, near and far. */
function behind(spot: THREE.Vector3, lamp: THREE.Vector3): THREE.Vector3[] {
  const away = Math.atan2(spot.x - lamp.x, spot.z - lamp.z);
  const patches: THREE.Vector3[] = [];
  for (const turn of SECTOR) {
    for (const off of OFFS) {
      const at = new THREE.Vector3(spot.x + Math.sin(away + turn) * off, 0, spot.z + Math.cos(away + turn) * off);
      at.y = groundHeight(at.x, at.z);
      patches.push(at);
    }
  }
  return patches;
}

/** Where round `lamp`, `by` m off it, the hero stands to be read: the first spot with paving behind him, else the
 *  first of all (on the grass), and whether it's paved. */
function spotBy(lamp: THREE.Vector3, by: number): { spot: THREE.Vector3; paved: boolean } {
  const spots = Array.from({ length: SPOTS }, (_, k) => {
    const a = (k / SPOTS) * Math.PI * 2;
    const spot = new THREE.Vector3(lamp.x + Math.sin(a) * by, 0, lamp.z + Math.cos(a) * by);
    spot.y = groundHeight(spot.x, spot.z);
    return spot;
  });
  const onPaving = spots.find((spot) => behind(spot, lamp).every((at) => paved(at.x, at.z)));
  return { spot: onPaving ?? spots[0], paved: Boolean(onPaving) };
}

/** The hero stood at `spot` facing `lamp`, let settle (the casting lights to take it); the patches behind him, or
 *  null where he couldn't stand there. */
async function standBy(lab: Lab, spot: THREE.Vector3, lamp: THREE.Vector3): Promise<THREE.Vector3[] | null> {
  G.player.walkTo = null;
  G.player.place(spot, Math.atan2(lamp.x - spot.x, lamp.z - spot.z));
  await lab.step(SETTLE);
  if (Math.hypot(G.player.pos.x - spot.x, G.player.pos.z - spot.z) > 0.2) return null;
  return behind(G.player.pos.clone(), lamp);
}

/** The most of a patch's light his shadow takes: what the lamps' shadows take there while he casts, less what they
 *  take while he doesn't (what stands still there). */
function mostHeTakes(lab: Lab, patches: THREE.Vector3[], casts: Map<THREE.Object3D, boolean>, canary: boolean): number {
  if (canary) heroCasts(false, casts);
  const casting = patches.map((at) => lampsTake(lab, at));
  heroCasts(false, casts);
  const bare = patches.map((at) => lampsTake(lab, at));
  heroCasts(true, casts);
  return Math.max(...casting.map((take, i) => take - bare[i]));
}

/** The moon, the village's light that casts as the sun does. */
function theMoon(): THREE.DirectionalLight {
  let moon: THREE.DirectionalLight | null = null;
  G.scene.traverse((o) => {
    const light = o as THREE.DirectionalLight;
    if (light.isDirectionalLight && light.castShadow) moon = light;
  });
  if (!moon) throw new Error('lab: village: no moon casting');
  return moon;
}

/** The patches behind a hero at `spot` away from the moon: where its shadow of him falls. */
function behindFromMoon(spot: THREE.Vector3): THREE.Vector3[] {
  const moon = theMoon();
  const toMoon = moon.position.clone().sub(moon.target.position).setY(0).normalize();
  return behind(spot, spot.clone().add(toMoon));
}

/** The most of a patch's light his moon shadow takes: what it darkens there while he casts, over the patch's light
 *  while he doesn't, the lamps' shadows held off throughout (with `canary`, read while he casts nothing). As a share
 *  of the moon's own light it read over 100%: the moon's shadow dims the sky's light there too (`AMBIENT_IN_SHADOW`
 *  in `core/renderer.ts`), and with the lamps' shadows his lamp shadows were in it. */
function mostOfTheMoon(lab: Lab, patches: THREE.Vector3[], casts: Map<THREE.Object3D, boolean>,
  canary: boolean): number {
  if (canary) heroCasts(false, casts);
  const casting = patches.map((at) => readOver(lab, at, 0));
  heroCasts(false, casts);
  const bare = patches.map((at) => readOver(lab, at, 0));
  heroCasts(true, casts);
  return Math.max(...patches.map((_, i) => 1 - casting[i] / Math.max(bare[i], 1e-3)));
}

/** One lamp's reading: the most his shadow takes behind him by it at each of `BYS`, the most his moon shadow takes
 *  of a patch's light there, and whether he stood on paving. */
interface ByLamp { lamp: number; his: (number | null)[]; moon: (number | null)[]; paved: boolean }

/** The hero by each street lamp in turn at midnight: the lamps' shadows taking more of the ground behind him while he
 *  casts (from play, "your light test for each light need to test SHADOW, it was missing for half of them"). */
export async function heroShadowByLamp(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const lanterns = G.arena.village.lanterns;
  holdHour(0);
  const casts = new Map<THREE.Object3D, boolean>();
  const read: ByLamp[] = [];
  try {
    await lab.step(SETTLE);
    if (!castingLights().length) throw new Error('lab: village: no lamp casting at midnight');
    for (let lamp = 0; lamp < lanterns.length; lamp++) {
      const planted = canary && lamp === lanterns.length - 1;
      const reading: ByLamp = { lamp, his: [], moon: [], paved: true };
      for (const by of BYS) {
        const { spot, paved: onPaving } = spotBy(lanterns[lamp], by);
        reading.paved &&= onPaving;
        const patches = await standBy(lab, spot, lanterns[lamp]);
        reading.his.push(patches && mostHeTakes(lab, patches, casts, planted));
        const fromMoon = patches && behindFromMoon(G.player.pos.clone());
        reading.moon.push(fromMoon && mostOfTheMoon(lab, fromMoon, casts, planted));
      }
      read.push(reading);
    }
  } finally {
    heroCasts(true, casts);
    holdHour(null);
  }
  return shadowsChecked(read, canary);
}

/** the most two lamps may stand apart for him to be read between them (m: each casting light's reach is 15), where
 *  along the way from one to the other he's tried (the shares of it, halfway first), and the least patches behind him
 *  away from each that must be paved (of 20) */
const BETWEEN_MOST = 24;
const ALONG = [0.5, 0.4, 0.6, 0.3, 0.7];
const LEAST_PAVED = 8;

/** Two lamps and the spots between them where those two are the nearest lamps (the two casting there). */
interface Pair { lamps: [number, number]; spots: THREE.Vector3[] }

/** The patches behind a hero at `spot` away from `lamp` that lie on paving. */
function pavedBehind(spot: THREE.Vector3, lamp: THREE.Vector3): THREE.Vector3[] {
  return behind(spot, lamp).filter((at) => paved(at.x, at.z));
}

/** The spots between lamps `a` and `b` with paving enough behind them away from each, and those two nearest. */
function spotsBetween(a: number, b: number): THREE.Vector3[] {
  const lanterns = G.arena.village.lanterns;
  const off = (lamp: THREE.Vector3, spot: THREE.Vector3): number => Math.hypot(lamp.x - spot.x, lamp.z - spot.z);
  const spots: THREE.Vector3[] = [];
  for (const share of ALONG) {
    const spot = new THREE.Vector3().lerpVectors(lanterns[a], lanterns[b], share);
    spot.y = groundHeight(spot.x, spot.z);
    const farthest = Math.max(off(lanterns[a], spot), off(lanterns[b], spot));
    const nearer = lanterns.some((lamp, i) => i !== a && i !== b && off(lamp, spot) < farthest);
    const paving = [a, b].every((i) => pavedBehind(spot, lanterns[i]).length >= LEAST_PAVED);
    if (!nearer && paving) spots.push(spot);
  }
  return spots;
}

/** Every two lamps near each other with spots between them to read him at. */
function pairsToStandBetween(): Pair[] {
  const lanterns = G.arena.village.lanterns;
  const pairs: Pair[] = [];
  for (let a = 0; a < lanterns.length; a++) {
    for (let b = a + 1; b < lanterns.length; b++) {
      if (Math.hypot(lanterns[a].x - lanterns[b].x, lanterns[a].z - lanterns[b].z) > BETWEEN_MOST) continue;
      const spots = spotsBetween(a, b);
      if (spots.length) pairs.push({ lamps: [a, b], spots });
    }
  }
  return pairs;
}

/** Two lamps' readings, the most his shadow takes behind him away from each, as he stands between them, and the
 *  most his moon shadow takes of a patch's light there. */
interface BetweenRead { lamps: [number, number]; his: [number, number] | null; moon: number | null }

/** The hero halfway between every two lamps near each other at midnight: his shadow from each (from play, "supposed
 *  to be 2 shadows here, right ? from both lights"). `canary` stops him casting for the last pair's second lamp's
 *  reading, which must be found. */
export async function heroShadowBetweenLamps(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const lanterns = G.arena.village.lanterns;
  holdHour(0);
  const casts = new Map<THREE.Object3D, boolean>();
  const read: BetweenRead[] = [];
  try {
    await lab.step(SETTLE);
    const pairs = pairsToStandBetween();
    if (!pairs.length) throw new Error('lab: village: no two lamps with paving between them');
    for (const [k, { lamps: [a, b], spots }] of pairs.entries()) {
      let stood = null;
      // (the first spot he can stand on: halfway may be in the fountain)
      for (const spot of spots) {
        stood = await standBy(lab, spot, lanterns[b]);
        if (stood) break;
      }
      if (!stood) {
        read.push({ lamps: [a, b], his: null, moon: null });
        continue;
      }
      const fromB = pavedBehind(G.player.pos.clone(), lanterns[b]);
      const planted = canary && k === pairs.length - 1;
      const hisA = mostHeTakes(lab, pavedBehind(G.player.pos.clone(), lanterns[a]), casts, false);
      const hisB = mostHeTakes(lab, fromB, casts, planted);
      const moon = mostOfTheMoon(lab, behindFromMoon(G.player.pos.clone()), casts, false);
      read.push({ lamps: [a, b], his: [hisA, hisB], moon });
    }
  } finally {
    heroCasts(true, casts);
    holdHour(null);
  }
  return betweenChecked(read, canary);
}

/** The readings between lamps as lines and problems; with `canary`, whether the last pair's second was missing. */
function betweenChecked(read: BetweenRead[], canary: boolean): LightsChecked {
  const each = read.map(({ lamps: [a, b], his, moon }) => his === null ? `${a}|${b} no stand`
    : `${a}|${b} ${his.map(percent).join('/')} moon ${percent(moon)}`);
  const line = `hero's two lamp shadows: between two lamps, the most each one's shadows take of a patch behind him `
    + `away from it while he casts, over while he doesn't, and the most his moon shadow takes of a patch's light: `
    + `${each.join(', ')}`;
  // (a pair he can stand nowhere between, the fountain between them, is no fault of the shadows)
  const missing = read.filter(({ his, moon }) => his !== null
    && (his.some((take) => take < LEAST_DARKER) || moon === null || moon < LEAST_MOON));
  if (canary) {
    const last = read[read.length - 1];
    const caught = last.his !== null && last.his[1] < LEAST_DARKER && last.his[0] >= LEAST_DARKER;
    return { lines: [line], problems: [], caught, moments: [] };
  }
  const problems = missing.map(({ lamps: [a, b] }) => `${line}: between lamps ${a} and ${b} one shadow is missing`);
  return { lines: [line], problems, caught: null, moments: [] };
}

/** A share as a whole percentage, or why there is none. */
const percent = (share: number | null): string => share === null ? 'no stand' : `${(share * 100).toFixed(0)}%`;

/** Whether a lamp's readings show his shadow missing, from the lamp or from the moon. */
const shadowMissing = ({ his, moon }: ByLamp): boolean => his.some((take) => take === null || take < LEAST_DARKER)
  || moon.some((take) => take === null || take < LEAST_MOON);

/** The readings by every lamp as lines and problems; with `canary`, whether the last lamp's was found missing. */
function shadowsChecked(read: ByLamp[], canary: boolean): LightsChecked {
  const each = read.map(({ lamp, his, moon, paved: onPaving }) => `${lamp} ${his.map(percent).join('/')} `
    + `moon ${moon.map(percent).join('/')}${onPaving ? '' : ' (grass)'}`);
  const line = `hero's lamp and moon shadows: by each lamp, ${BYS.join(' and ')} m off it, the most the lamps' `
    + `shadows take of a patch behind him while he casts, over what they take there while he doesn't; and the most his `
    + `moon shadow takes of a patch's light away from the moon: ${each.join(', ')}`;
  const missing = read.filter(shadowMissing);
  if (canary) {
    const last = read[read.length - 1].lamp;
    return { lines: [line], problems: [], caught: missing.some(({ lamp }) => lamp === last), moments: [] };
  }
  const problems = missing.map(({ lamp }) => `${line}: by lamp ${lamp} a shadow of his is missing`);
  return { lines: [line], problems, caught: null, moments: [] };
}
