// `lab village`'s fog of what he can't see under the cottages' roofs and eaves, from above (split from
// `villageFog.ts`). `fogUnderRoofs`: past a cottage's back wall, seen through its roof's ghost, the ground lies in the fog
// (`canary` holds the fog off). `roofShowsWhatHeSees`: the ground he does see, seen through a roof, isn't fogged
// (`canary` reads his sight off where he stands). `fogUnderEaves`: the ground under a side eave past the wall lies in the
// fog as all round it does (`canary` holds the fog off).
import * as THREE from 'three';
import { rayChunks } from './rayChunks';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { COTTAGES, type Cottage } from '../../../src/data/village';
import { COTTAGE } from '../../../src/world/villagePlan';
import { holdHour } from '../../../src/game/clock';
import { faceCamera, viewMode } from '../../../src/core/renderer';
import { SIGHT, holdSightOff, seenShareAt } from '../../../src/core/sight';
import { holdRoofGhost } from '../../../src/core/seeThrough';
import { RUST } from '../../../src/engine';
import { groundHeight } from '../../../src/world/ground';
import { drawFrame } from './light';
import { greenTaken } from './fogGreen';
import { standAt } from './villageFog';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** how far past a cottage's back wall the ground is read (m: seen through the eaves from above it lies metres past
 *  the wall, nearer than that the wall itself is what's drawn there), every how far along it, the frames the fog is
 *  given to ease off, and the least of their light the fog must take from those pixels, across the cottages' middle */
const PAST_BACK = [1.4, 1.8, 2.2, 2.6, 3];
const ALONG_BACK = 0.4;
const FOG_EASES = 40;
const LEAST_TAKEN = 0.05;

/** The light of `points` on the ground in the frame, the sum of their pixels'. */
function lightAt(lab: Lab, points: THREE.Vector3[]): number {
  const canvas = drawFrame(lab);
  let light = 0;
  let read = 0;
  for (const point of points) {
    const place = point.clone().project(G.camera);
    const column = Math.floor((place.x + 1) / 2 * canvas.width);
    const row = Math.floor((place.y + 1) / 2 * canvas.height);
    if (column < 0 || column >= canvas.width || row < 0 || row >= canvas.height) continue;
    const pixel = (row * canvas.width + column) * 4;
    light += canvas.pixels[pixel] + canvas.pixels[pixel + 1] + canvas.pixels[pixel + 2];
    read++;
  }
  if (read === 0) throw new Error('lab: village: no ground past the cottage in the frame');
  return light;
}

/** The share of their light the fog takes from the ground past `c`'s back wall, him stood before its front. */
async function takenPastBack(lab: Lab, c: Cottage): Promise<number> {
  const halfW = (COTTAGE.w / 2) * c.size;
  const halfD = (COTTAGE.d / 2) * c.size;
  const cos = Math.cos(c.facing);
  const sin = Math.sin(c.facing);
  const turned = (x: number, z: number): [number, number] => [c.x + x * cos + z * sin, c.z - x * sin + z * cos];
  const [x, z] = turned(0, halfD + 3);
  await standAt(lab, x, z, c.facing + Math.PI);
  const points: THREE.Vector3[] = [];
  for (let along = -halfW; along <= halfW; along += ALONG_BACK) {
    for (const past of PAST_BACK) {
      const [px, pz] = turned(along, -halfD - past);
      points.push(new THREE.Vector3(px, groundHeight(px, pz) + 0.1, pz));
    }
  }
  const fogged = lightAt(lab, points);
  const wasOff = SIGHT.uSightOn.value <= 0;
  holdSightOff(true);
  await lab.step(FOG_EASES);
  const clear = lightAt(lab, points);
  holdSightOff(wasOff);
  await lab.step(FOG_EASES);
  return 1 - fogged / clear;
}

/** From before each cottage, what's past its back wall lies in the fog seen through its ghost of a roof too. */
export async function fogUnderRoofs(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const kept = viewMode();
  holdHour(12);
  // (the canary holds the fog off: the roofs' depth held, as it was, moved nothing the engine draws there, #926)
  holdSightOff(canary);
  try {
    await viewBy(lab, 'top');
    let least = 1;
    const all: number[] = [];
    let shot: Awaited<ReturnType<Lab['screen']>> | null = null;
    for (const cottage of COTTAGES) {
      all.push(await takenPastBack(lab, cottage));
      shot ??= canary ? null : await lab.screen('before a cottage, what shows through its roof in the fog', []);
    }
    least = [...all].sort((a, b) => a - b)[all.length >> 1];
    const line = `past a cottage's back wall, seen through its roof: across the cottages the fog takes `
      + `${(least * 100).toFixed(0)}% of its light (at least ${LEAST_TAKEN * 100}%): `
      + all.map((share) => (share * 100).toFixed(0)).join(' ');
    const wrong = least < LEAST_TAKEN;
    if (canary) return { lines: [line], problems: [], caught: wrong, moments: [] };
    return { lines: [line], problems: wrong ? [line] : [], caught: null, moments: shot ? [shot] : [] };
  } finally {
    holdSightOff(false);
    holdHour(null);
    // (the view turned back, for the checks after this one to read a side of the hall as they set out to)
    faceCamera(0);
    await viewBy(lab, kept);
  }
}

/** the least of the green of the ground under an eave he can't see past the fog must take: softened by #755, it still
 *  reads greener than red or blue, so the share taken is read (the engine took 32% at the least, a cottage's eave over
 *  ground the camera sees past the wall; `sightBlacksOut` asks an unseen place for a third of its warmth) */
const LEAST_GREEN_TAKEN_EAVES = 0.25;

/** how far round him the ground seen through a roof stays by the rays (m), past which it's read */
const ROOF_READ_OFF = 2;
/** the most of its light the fog may take from the ground he sees round a cottage, seen through its roof:
 *  that roof's own grey ghost tints it, so it's read against the same frame with the fog off */
const MOST_TAKEN_THROUGH_ROOF = 0.05;
/** how much of a point the rays must see for it to count as seen by him */
const SEEN_BY_HIM = 0.95;
/** how far short of a point on the ground its ray stops, so the ground and the grass there aren't met (m) */
const GROUND_ITSELF = 0.4;
/** how far round a cottage the ground is read, every how far (m), and the fewest places through its roofs to read */
const ROUND_COTTAGE = 4;
const ROUND_STEP = 0.5;
const LEAST_READ_THROUGH_ROOF = 20;

/** how far the roofs are thinned for what's under them to be read: at the game's, too little shows to tell the rule on
 *  from the rule off */
const READ_THROUGH_GHOST = 0.62;

/** Half `c`'s width and depth (m). */
function cottageHalves(c: Cottage): { halfW: number; halfD: number } {
  return { halfW: (COTTAGE.w / 2) * c.size, halfD: (COTTAGE.d / 2) * c.size };
}

/** A place in `c`'s own frame (x across it, z along it) turned into the world's. */
function cottageTurn(c: Cottage): (x: number, z: number) => [number, number] {
  const cos = Math.cos(c.facing);
  const sin = Math.sin(c.facing);
  return (x, z) => [c.x + x * cos + z * sin, c.z - x * sin + z * cos];
}

/** What of the ground he sees round `c`, him stood at its back corner, the camera sees through its roof alone, and the
 *  share of its light the fog takes there: none, or null where the camera sees none of it so. */
async function fogThroughRoof(
  lab: Lab,
  c: Cottage,
  canary: boolean,
): Promise<{ taken: number; read: number } | null> {
  const turned = cottageTurn(c);
  const { halfW, halfD } = cottageHalves(c);
  const [x, z] = turned(halfW + 0.35, -halfD - 0.35);
  await standAt(lab, x, z, c.facing + Math.PI);
  const points: THREE.Vector3[] = [];
  for (let across = -halfW - ROUND_COTTAGE; across <= halfW + ROUND_COTTAGE; across += ROUND_STEP) {
    for (let along = -halfD - ROUND_COTTAGE; along <= halfD + ROUND_COTTAGE; along += ROUND_STEP) {
      const [px, pz] = turned(across, along);
      const seen = seenShareAt(px, pz) >= SEEN_BY_HIM;
      if (seen && Math.hypot(px - x, pz - z) > ROOF_READ_OFF) {
        points.push(new THREE.Vector3(px, groundHeight(px, pz) + 0.1, pz));
      }
    }
  }
  const meshes = shownMeshes();
  const under = points.filter((point) => overRoofAlone(point, meshes));
  if (under.length === 0) return null;
  return { taken: fogTakesAt(lab, under, canary ? CANARY_SIGHT_OFF : 0), read: under.length };
}

/** the engine's fog mixed in by next to nothing: none of its darkening, his sight still on */
const FOG_NONE = 1e-4;
/** how far off where he stands the canary reads his sight in the fogged frame (m): ground he sees read as from there
 *  (its plant was three's fog shader taking the ground seen through a roof as unseen, which the engine never runs) */
const CANARY_SIGHT_OFF = 20;

/** The share of their light the fog takes from `points`: the frame drawn again at once with none of the fog mixed in,
 *  as between two frames the camera glides and the grass moves. His sight stays on (`rust.sightFog` next to nothing,
 *  not `uSightOn` 0): a house from above is opened by what he sees, so with his sight off its roofs were drawn
 *  another way, by their kinds' own shares, and the two frames differed by the roofs' ghosts (22% of the light
 *  through a roof read as the fog's, where the fog took none). */
function fogTakesAt(lab: Lab, points: THREE.Vector3[], sightOff: number): number {
  const from = SIGHT.uSightFrom.value;
  const stood = from.clone();
  from.x += sightOff;
  let fogged: number;
  try {
    fogged = lightAt(lab, points);
  } finally {
    from.copy(stood);
  }
  const fog = RUST.tune.sightFog;
  RUST.tune.sightFog = FOG_NONE;
  try {
    return 1 - fogged / lightAt(lab, points);
  } finally {
    RUST.tune.sightFog = fog;
  }
}

/** Every mesh shown (it and everything over it), as chunks for rays (`rayChunks.ts`): sent at the scene whole, the
 *  hidden places' meshes and all, the rays under the roofs took 73 s of this check's 78. */
function shownMeshes(): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  G.scene.traverseVisible((object) => {
    if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh);
  });
  return rayChunks(meshes);
}

/** Whether a ray from the eye to `point` meets a roof and nothing else short of it: through a wall's ghost too, the fog
 *  reads that wall, which keeps its depth. */
function overRoofAlone(point: THREE.Vector3, meshes: THREE.Mesh[]): boolean {
  const from = G.camera.position;
  const way = point.clone().sub(from).normalize();
  const short = point.distanceTo(from) - GROUND_ITSELF;
  const drawn = new THREE.Raycaster(from, way, 0, short).intersectObjects(meshes, false);
  const isRoof = (hit: THREE.Intersection): boolean => {
    const { material } = hit.object as THREE.Mesh;
    return !Array.isArray(material) && material?.blending === THREE.CustomBlending;
  };
  return drawn.some(isRoof) && drawn.every(isRoof);
}

/** The ground he sees, seen through a roof, shows green as he sees it (the owner's choice: "grass that cannot be seen
 *  by me, but can be seen by player should be green"). `canary` reads his sight off where he stands. */
export async function roofShowsWhatHeSees(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const kept = viewMode();
  holdHour(12);
  holdRoofGhost(READ_THROUGH_GHOST);
  try {
    await viewBy(lab, 'top');
    const all: string[] = [];
    let worst = 0;
    let read = 0;
    let shot: Awaited<ReturnType<Lab['screen']>> | null = null;
    for (const cottage of COTTAGES) {
      const fog = await fogThroughRoof(lab, cottage, canary);
      all.push(fog ? `${(fog.taken * 100).toFixed(0)}% of ${fog.read}` : 'none');
      worst = Math.max(worst, fog?.taken ?? 0);
      read += fog?.read ?? 0;
      shot ??= canary ? null : await lab.screen("at a cottage's corner, its roof from the far end", []);
    }
    if (read < LEAST_READ_THROUGH_ROOF) {
      throw new Error(`lab: village: only ${read} places he sees were seen through a roof`);
    }
    const line = `round a cottage, him at its back corner, what he sees through its roof: the fog takes `
      + `${(worst * 100).toFixed(0)}% of its light at most (at most ${MOST_TAKEN_THROUGH_ROOF * 100}%): `
      + all.join(', ');
    const wrong = worst > MOST_TAKEN_THROUGH_ROOF;
    if (canary) return { lines: [line], problems: [], caught: wrong, moments: [] };
    return { lines: [line], problems: wrong ? [line] : [], caught: null, moments: shot ? [shot] : [] };
  } finally {
    holdRoofGhost(null);
    holdHour(null);
    faceCamera(0);
    await viewBy(lab, kept);
  }
}

/** The share of its green the fog takes from the ground under `c`'s eave at its side, him stood before its front
 *  towards that side: the camera past the wall there, as from before its middle the wall stands over that ground. */
async function greenUnderEaves(lab: Lab, c: Cottage): Promise<number> {
  const halfW = (COTTAGE.w / 2) * c.size;
  const halfD = (COTTAGE.d / 2) * c.size;
  const cos = Math.cos(c.facing);
  const sin = Math.sin(c.facing);
  const turned = (x: number, z: number): [number, number] => [c.x + x * cos + z * sin, c.z - x * sin + z * cos];
  const [x, z] = turned(halfW * 0.7, halfD + 0.8);
  await standAt(lab, x, z, c.facing + Math.PI);
  const points: THREE.Vector3[] = [];
  for (let across = -halfD * 0.8; across <= -halfD * 0.2; across += ALONG_BACK) {
    for (const out of [0.5, 0.75, 1]) {
      const [px, pz] = turned(halfW + out, across);
      points.push(new THREE.Vector3(px, groundHeight(px, pz) + 0.1, pz));
    }
  }
  return greenTaken(lab, points).taken;
}

/** From before each cottage, the ground under its eaves past its walls lies in the fog as all round it does. */
export async function fogUnderEaves(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const kept = viewMode();
  holdHour(12);
  // (the canary holds the fog off: the eaves taken as within the walls, as they were, changed nothing the engine
  // draws, and went unseen)
  holdSightOff(canary);
  try {
    await viewBy(lab, 'top');
    const all: number[] = [];
    for (const cottage of COTTAGES) all.push(await greenUnderEaves(lab, cottage));
    const worst = Math.min(...all);
    const shares = all.map((share) => (share * 100).toFixed(0)).join(' ');
    const line = `under a cottage's side eave, past its wall: the fog takes ${(worst * 100).toFixed(0)}% of its green `
      + `at the least (at least ${LEAST_GREEN_TAKEN_EAVES * 100}%): ${shares}`;
    const wrong = worst < LEAST_GREEN_TAKEN_EAVES;
    if (canary) return { lines: [line], problems: [], caught: wrong, moments: [] };
    // (the greenest cottage pictured, stood before again: the last one's picture showed none of what failed)
    const at = all.indexOf(worst);
    await greenUnderEaves(lab, COTTAGES[at]);
    const shot = await lab.screen(`before cottage ${at + 1}, the ground under its far eaves`, []);
    return { lines: [line], problems: wrong ? [line] : [], caught: null, moments: [shot] };
  } finally {
    holdSightOff(false);
    holdHour(null);
    faceCamera(0);
    await viewBy(lab, kept);
  }
}
