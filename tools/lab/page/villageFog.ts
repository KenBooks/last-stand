// `lab village`'s fog of war as he walks (from play, "fog of war should ease in/out, not jerk", "we need to stabilize
// fog of war, sometimes it's jerking left and right as I'm walking in straight line", "fire should not animate when
// in fog of war", "and tree leaves should be grey too ?"). `fogHoldsSteady`: he walks straight past a cottage's
// corner, and over a grid of the ground round him each frame reads how seen each place is: none may leap in a frame,
// or go back and forth. `canary` shows the rays as they're cast, as they were. `firesStillInFog`: a fire he can't see
// plays no frame of its flames, one he can does (`canary` holds the fog off). `leavesInFog`: stood by the hall's
// walls at noon, all but the door's cone unseen, the fog takes the frame's green (`canary` holds the fog off). The
// fog under the cottages' roofs and eaves is `villageFogRoofs.ts`.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { CAMPFIRE, COTTAGES, HALL, TERRACE } from '../../../src/data/village';
import { holdHour } from '../../../src/game/clock';
import { faceCamera, viewMode } from '../../../src/core/renderer';
import { SIGHT, holdSightOff, holdSightSharp, seenShareAt } from '../../../src/core/sight';
import type { SightWall } from '../../../src/core/sight';
import { RUST } from '../../../src/engine';
import { groundHeight } from '../../../src/world/ground';
import { greenTaken } from './fogGreen';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** the frames given to settle, walked and read; how far off the cottage's corner he walks past it (m) */
const SETTLE = 60;
const WALKED = 150;
const PAST_CORNER = 3;
/** the grid read round him: how far out each way and every how far (m) */
const GRID_OUT = 24;
const GRID_STEP = 1;
/** the most a place's share of being seen may change in a frame, and how far a change must go to count as a way back */
const MOST_IN_A_FRAME = 0.34;
const WAY_BACK = 0.15;
/** the most times a place may turn back as he walks straight (as they were, cast and shown at once: 42) */
const MOST_TURNS = 3;
/** how near a wall's line a place isn't read (m): under the eaves, and on the line of the wall he's crossing the shadow
 *  of a ray along it reaches anything */
const OFF_WALLS = 1;

/** The hero stood at (x, z) facing `facing`, the camera behind him, let settle. */
export async function standAt(lab: Lab, x: number, z: number, facing: number): Promise<void> {
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), facing);
  faceCamera(facing);
  await lab.step(SETTLE);
}

/** How far (x, z) is from the line of a wall. */
function offWall(wall: SightWall, x: number, z: number): number {
  const ex = wall.x1 - wall.x0;
  const ez = wall.z1 - wall.z0;
  const along = ((x - wall.x0) * ex + (z - wall.z0) * ez) / (ex * ex + ez * ez);
  const part = Math.max(0, Math.min(1, along));
  return Math.hypot(x - wall.x0 - ex * part, z - wall.z0 - ez * part);
}

/** Each place's way so far as he walks: its last turning value, its way (-1, 0, 1) and its turns. */
interface PlaceRead { was: number; held: number; way: number; turns: number; leap: number; shares: number[] }

/** One place's share read this frame. */
function readPlace(place: PlaceRead, share: number): void {
  place.leap = Math.max(place.leap, Math.abs(share - place.was));
  place.shares.push(share);
  place.was = share;
  const moved = share - place.held;
  if (Math.abs(moved) < WAY_BACK) return;
  const way = Math.sign(moved);
  if (place.way !== 0 && way !== place.way) place.turns++;
  place.way = way;
  place.held = share;
}

/** He walks straight past a cottage's corner: no place in the fog leaps or goes back and forth. */
export async function fogHoldsSteady(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const kept = viewMode();
  const cottage = COTTAGES[0];
  holdHour(12);
  holdSightSharp(canary);
  try {
    await viewBy(lab, 'top');
    await standAt(lab, cottage.x - 8, cottage.z + PAST_CORNER + 3, Math.PI / 2);
    const places: PlaceRead[] = [];
    const spots: [number, number][] = [];
    const middle = G.player.pos.clone();
    const walls = G.arena.village!.sight.walls;
    for (let x = -GRID_OUT; x <= GRID_OUT; x += GRID_STEP) {
      for (let z = -GRID_OUT; z <= GRID_OUT; z += GRID_STEP) {
        const spot: [number, number] = [middle.x + x, middle.z + z];
        if (walls.some((wall) => offWall(wall, spot[0], spot[1]) < OFF_WALLS)) continue;
        spots.push(spot);
        const share = seenShareAt(spot[0], spot[1]);
        places.push({ was: share, held: share, way: 0, turns: 0, leap: 0, shares: [] });
      }
    }
    const from = G.player.pos.x;
    await lab.step(WALKED, () => ({ keys: ['w'] }), () => {
      spots.forEach((spot, i) => readPlace(places[i], seenShareAt(spot[0], spot[1])));
    });
    const walked = G.player.pos.x - from;
    const leap = Math.max(...places.map((place) => place.leap));
    const turns = Math.max(...places.map((place) => place.turns));
    const worst = places.indexOf(places.reduce((most, place) => (place.turns > most.turns ? place : most)));
    const turning = places.filter((place) => place.turns > MOST_TURNS).length;
    const line = `the fog as he walks ${walked.toFixed(1)} m past a corner: a place's most in a frame `
      + `${leap.toFixed(2)} (at most ${MOST_IN_A_FRAME}), its most turns back ${turns} (at most ${MOST_TURNS}), `
      + `at (${spots[worst][0].toFixed(0)}, ${spots[worst][1].toFixed(0)}), ${turning} places of ${places.length} `
      + `turning, he went from (${middle.x.toFixed(1)}, ${middle.z.toFixed(1)})`;
    const wrong = leap > MOST_IN_A_FRAME || turns > MOST_TURNS;
    if (canary) return { lines: [line], problems: [], caught: wrong, moments: [] };
    const problems = wrong ? [line] : [];
    if (wrong) {
      const shares = places[worst].shares.map((share) => share.toFixed(2)).join(' ');
      return { lines: [line, `that place, frame by frame: ${shares}`], problems, caught: null, moments: [] };
    }
    if (Math.abs(walked) < 3) problems.push(`the fog: he walked only ${walked.toFixed(1)} m`);
    return { lines: [line], problems, caught: null, moments: [] };
  } finally {
    holdSightSharp(false);
    holdHour(null);
    await viewBy(lab, kept);
  }
}

/** A fire's flames: the loop's frame they show, and whether they're drawn. */
interface Flames { uFrame: { value: number }; drawn: () => boolean }

/** A fire's flames, by the place it burns at (`userData.flames` on its volume, world/fire.ts: the material it's
 *  drawn with shows no uniforms, and read off the material the check found no flames at all). */
function flamesNear(x: number, z: number): Flames {
  let found: Flames | null = null;
  let nearest = 3;
  G.scene.traverse((object) => {
    const uniforms = object.userData.flames as THREE.ShaderMaterial['uniforms'] | undefined;
    const centre = uniforms?.uCentre?.value as THREE.Vector3 | undefined;
    if (!uniforms?.uFrame || !centre) return;
    const away = Math.hypot(centre.x - x, centre.z - z);
    if (away < nearest) {
      nearest = away;
      found = { uFrame: uniforms.uFrame as { value: number }, drawn: () => object.visible };
    }
  });
  if (!found) throw new Error('lab: village: no flames at the campfire');
  return found as Flames;
}

/** The campfire's flames stand still from the back of the hall, and burn beside it. */
export async function firesStillInFog(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const kept = viewMode();
  const flames = flamesNear(CAMPFIRE[0], CAMPFIRE[1]);
  holdHour(12);
  holdSightOff(canary);
  try {
    await viewBy(lab, 'top');
    await standAt(lab, TERRACE.x, HALL.daisZ + 2, 0);
    const before = flames.uFrame.value;
    await lab.step(30);
    const inFog = Math.abs(flames.uFrame.value - before);
    const drawnInFog = flames.drawn();
    // (held at the frame kept for a fire that stands still, which its `uFrame` reads under 0: left at a frame of
    // the loop it burns on with the fires he sees, whose two frames on the GPU are every fire's)
    const held = flames.uFrame.value < 0;
    await standAt(lab, CAMPFIRE[0] + 2.4, CAMPFIRE[1], 0);
    const seenFrom = flames.uFrame.value;
    await lab.step(30);
    const seen = Math.abs(flames.uFrame.value - seenFrom);
    const line = `the campfire's flames in 30 frames: ${inFog.toFixed(2)} frames of its loop in the fog`
      + `${drawnInFog ? ', drawn there' : ', not drawn there'}${held ? ', at its held frame' : ', at a frame of the loop'}, `
      + `${seen.toFixed(2)} beside it`
      + `${flames.drawn() ? '' : ', not drawn'}`;
    // (from play, "why is fire still burning in fog of war")
    const moved = inFog > 0.001 || !held;
    if (canary) return { lines: [line], problems: [], caught: moved, moments: [] };
    const problems: string[] = [];
    if (moved) problems.push(`${line}: it burns on in the fog`);
    // (from play, "why campfire stopped burning, supposed to be frozen flame in fog of war")
    if (!drawnInFog) problems.push(`${line}: its flames are gone in the fog`);
    if (seen < 0.1 || !flames.drawn()) problems.push(`${line}: it stands still in sight, or isn't drawn`);
    return { lines: [line], problems, caught: null, moments: [] };
  } finally {
    holdSightOff(false);
    holdHour(null);
    await viewBy(lab, kept);
  }
}

/** the least of the frame's green the fog must take with him by the hall's walls, all but the door's cone unseen
 *  (softened by #755, the grass and leaves outside still read greener than red or blue: the engine took 59%) */
const LEAST_GREEN_TAKEN_HALL = 0.4;

/** where he stands before a cottage, for the ground past it (a review: a green band behind one, on WebGPU) */
const BESIDE_A_COTTAGE: [number, number] = [16.5, -3];

/** where he stands in the hall, each by a wall of it: the most outside is in the frame there */
function standsInTheHall(): [number, number][] {
  const inside = HALL.half - 1.5;
  return [
    [TERRACE.x + inside, HALL.daisZ + 4],
    [TERRACE.x - inside, HALL.daisZ + 4],
    [TERRACE.x + inside, HALL.wall + 2],
    [TERRACE.x - inside, HALL.wall + 2],
  ];
}

/** how far past the hall's side wall the ground beside him is said (m) */
const PAST_HALL_WALL = 3;

/** What the fog was asked for, him stood at (x, z) in the hall: how far it's on, and how much of the ground past the
 *  side wall beside him his rays see. */
function fogBesideHall(x: number, z: number): string {
  const side = Math.sign(x - TERRACE.x);
  const pastX = TERRACE.x + side * (HALL.half + PAST_HALL_WALL);
  const seen = seenShareAt(pastX, z);
  return `the fog on ${SIGHT.uSightOn.value.toFixed(2)} (the engine's ${RUST.tune.sightFog}), `
    + `the ground ${PAST_HALL_WALL} m past the wall beside him seen ${seen.toFixed(2)}`;
}

/** From by the hall's walls, the grass and the trees' crowns outside it are grey. */
export async function leavesInFog(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const kept = viewMode();
  holdHour(12);
  holdSightOff(canary);
  try {
    await viewBy(lab, 'top');
    let share = 1;
    let shot: Awaited<ReturnType<Lab['screen']>> | null = null;
    let why = '';
    for (const [x, z] of standsInTheHall()) {
      await standAt(lab, x, z, -Math.PI / 2);
      const here = greenTaken(lab, null).taken;
      if (here > share) continue;
      share = here;
      why = fogBesideHall(x, z);
      shot = canary ? null : await lab.screen(`in the hall at (${x}, ${z}), the least fogged of its stands`, []);
    }
    const [besideX, besideZ] = BESIDE_A_COTTAGE;
    await standAt(lab, besideX, besideZ, 0);
    const beside = canary ? null : await lab.screen('before a cottage, the ground past it in the fog', []);
    const line = `from in the hall the fog takes ${(share * 100).toFixed(0)}% of the frame's green at the least `
      + `(at least ${LEAST_GREEN_TAKEN_HALL * 100}%): ${why}`;
    const green = share < LEAST_GREEN_TAKEN_HALL;
    if (canary) return { lines: [line], problems: [], caught: green, moments: [] };
    const moments = [shot, beside].filter((moment) => moment !== null);
    return { lines: [line], problems: green ? [line] : [], caught: null, moments };
  } finally {
    holdSightOff(false);
    holdHour(null);
    await viewBy(lab, kept);
  }
}
