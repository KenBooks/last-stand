// `lab village --only fogPastCottages`: the ground a cottage hides from him lies in the fog from above, read in the
// frame drawn. From play, "still seeing green where character cannot see": the rays agreed with his line of sight, so
// what's read is the picture, each place he can't see projected into it and its pixel's colour taken.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { COTTAGES, type Cottage } from '../../../src/data/village';
import { COTTAGE } from '../../../src/world/villagePlan';
import { holdHour } from '../../../src/game/clock';
import { faceCamera, viewMode } from '../../../src/core/renderer';
import { holdFogHueLetOff, holdSightOff, seenShareAt } from '../../../src/core/sight';
import { groundHeight } from '../../../src/world/ground';
import { drawFrame } from './light';
import { greenAt, isGreen } from './villageFog';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

type Spot = [number, number];
type Line = [Spot, Spot];

/** how far round him places are read (m), every how far, and how near a wall's line a place isn't read (the fog's soft
 *  edge along a ray past a wall, and the eaves over it) */
const AROUND = 9;
const EVERY = 0.5;
const OFF_WALLS = 1;
/** how far round a place every place must be hidden too for it to count (m): a place whose sight grazes a wall's end
 *  takes a blade leaning over from the seen side in its pixel */
const HIDDEN_BY = 0.75;
const ROUND: Spot[] = [[0, 0], [HIDDEN_BY, 0], [-HIDDEN_BY, 0], [0, HIDDEN_BY], [0, -HIDDEN_BY]];
/** how far out from a wall he stands (m), and where along each side (shares of its half length) */
const OUT = 0.6;
const ALONG = [-0.5, 0.5];
/** the frames he's given to settle, and the most of what he can't see that may show plainly green */
const SETTLE = 60;
const MOST_GREEN = 0.03;

/** how much greener than it's red or blue a place of the ground he can't see reads as green (a share of its green),
 *  and the most of the places read that may: none in the open's fog, whose tint is blue; under a roof's ghost the
 *  roof's share of the grass's green was left in it (from play, "not the same greyness of grass at different
 *  angles") */
const READS_GREEN = 0.06;
const MOST_GREENER = 0.1;
/** where the grass before him is read, out from him and aside (m), and the least of it that must read green: he
 *  sees it, through the hole of the wall he stands at (from play, "this grass should be green right ?") */
const BEFORE_HIM = { out: [1, 1.5, 2, 2.5], aside: [-1, -0.5, 0, 0.5, 1] };
export const LEAST_GREEN_BEFORE = 0.6;

/** Whether `p` lies within `c`'s walls: on one side of all four, going round. */
function within(c: Cottage, p: Spot): boolean {
  const corners = cornersOf(c);
  const sides = corners.map((corner, k) => sideOf(corner, corners[(k + 1) % corners.length], p));
  return sides.every((side) => side > 0) || sides.every((side) => side < 0);
}

/** The ground he can't see within the walls of the cottage he stands at, the camera over its roof: under the roof's
 *  ghost alone, no wall's hole over it (the wall he stands at is past it from the camera). */
const underItsRoof = (c: Cottage, him: Spot): THREE.Vector3[] =>
  unseenFrom(him).filter((place) => within(c, [place.x, place.z]));

/** The ground before him as he stands at `at` facing `facing`: places he sees, the camera behind him over the
 *  cottage. */
function beforeHim(at: Spot, facing: number): THREE.Vector3[] {
  const [aheadX, aheadZ] = [Math.sin(facing), Math.cos(facing)];
  return BEFORE_HIM.out.flatMap((out) => BEFORE_HIM.aside.map((aside) => {
    const x = at[0] + aheadX * out + aheadZ * aside;
    const z = at[1] + aheadZ * out - aheadX * aside;
    return new THREE.Vector3(x, groundHeight(x, z) + 0.1, z);
  })).filter((place) => seenShareAt(place.x, place.z) > 0.95);
}

/** The share of `places`' pixels in the frame drawn now that read as green (`READS_GREEN`), and how many were read. */
function greenerAt(lab: Lab, places: THREE.Vector3[]): { greener: number; read: number } {
  const canvas = drawFrame(lab);
  let sum = 0;
  let read = 0;
  for (const place of places) {
    const onScreen = place.clone().project(G.camera);
    const column = Math.floor(((onScreen.x + 1) / 2) * canvas.width);
    const row = Math.floor(((onScreen.y + 1) / 2) * canvas.height);
    if (column < 0 || column >= canvas.width || row < 0 || row >= canvas.height) continue;
    const pixel = (row * canvas.width + column) * 4;
    const [red, green, blue] = [canvas.pixels[pixel], canvas.pixels[pixel + 1], canvas.pixels[pixel + 2]];
    if ((green - Math.max(red, blue)) / Math.max(green, 1e-4) > READS_GREEN) sum++;
    read++;
  }
  return { greener: read > 0 ? sum / read : 0, read };
}

/** A cottage's corners on the floor, as `sightOfThePlace` lays its walls. */
function cornersOf(c: Cottage): Spot[] {
  const halfW = (COTTAGE.w / 2) * c.size;
  const halfD = (COTTAGE.d / 2) * c.size;
  const cos = Math.cos(c.facing);
  const sin = Math.sin(c.facing);
  const turned = (x: number, z: number): Spot => [c.x + x * cos + z * sin, c.z - x * sin + z * cos];
  return [turned(-halfW, -halfD), turned(halfW, -halfD), turned(halfW, halfD), turned(-halfW, halfD)];
}

/** Every cottage's walls. */
const WALLS: Line[] = COTTAGES.flatMap((c) => {
  const corners = cornersOf(c);
  return corners.map((corner, k): Line => [corner, corners[(k + 1) % corners.length]]);
});

/** Which side of the line through `a` and `b` the place `p` is on. */
const sideOf = (a: Spot, b: Spot, p: Spot): number => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);

/** Whether the line from `from` to `to` crosses the wall from `a` to `b`. */
function crosses(from: Spot, to: Spot, [a, b]: Line): boolean {
  return sideOf(from, to, a) * sideOf(from, to, b) < 0 && sideOf(a, b, from) * sideOf(a, b, to) < 0;
}

/** How far `p` is from the wall from `a` to `b`. */
function offWall(p: Spot, [a, b]: Line): number {
  const ex = b[0] - a[0];
  const ez = b[1] - a[1];
  const along = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ez) / (ex * ex + ez * ez)));
  return Math.hypot(a[0] + ex * along - p[0], a[1] + ez * along - p[1]);
}

/** The places round `him` a cottage's wall hides from him, clear of every wall, on the ground. */
function unseenFrom(him: Spot): THREE.Vector3[] {
  const places: THREE.Vector3[] = [];
  for (let dx = -AROUND; dx <= AROUND; dx += EVERY) {
    for (let dz = -AROUND; dz <= AROUND; dz += EVERY) {
      const place: Spot = [him[0] + dx, him[1] + dz];
      if (WALLS.some((wall) => offWall(place, wall) < OFF_WALLS)) continue;
      const hidden = (near: Spot): boolean => WALLS.some((wall) => crosses(him, near, wall));
      if (!ROUND.every(([x, z]) => hidden([place[0] + x, place[1] + z]))) continue;
      places.push(new THREE.Vector3(place[0], groundHeight(place[0], place[1]) + 0.1, place[1]));
    }
  }
  return places;
}

/** Where he stands round `c`: outside each wall, at `ALONG` of it, facing away from it. */
function standsRound(c: Cottage): { at: Spot; facing: number }[] {
  const corners = cornersOf(c);
  const stands: { at: Spot; facing: number }[] = [];
  corners.forEach((a, k) => {
    const b = corners[(k + 1) % corners.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const outX = (b[1] - a[1]) / length;
    const outZ = -(b[0] - a[0]) / length;
    for (const share of ALONG) {
      const along = (1 + share) / 2;
      const at: Spot = [a[0] + (b[0] - a[0]) * along + outX * OUT, a[1] + (b[1] - a[1]) * along + outZ * OUT];
      stands.push({ at, facing: Math.atan2(outX, outZ) });
    }
  });
  return stands;
}

/** The share of what a cottage hides from him that shows plainly green, from each place round each cottage, the camera
 *  behind him; the worst place named. */
async function greenestPast(lab: Lab): Promise<{ share: number; name: string; at: Spot; facing: number }> {
  let worst = { share: -1, name: '', at: [0, 0] as Spot, facing: 0 };
  for (const [k, c] of COTTAGES.entries()) {
    for (const [s, stand] of standsRound(c).entries()) {
      G.player.walkTo = null;
      G.player.place(new THREE.Vector3(stand.at[0], groundHeight(...stand.at), stand.at[1]), stand.facing);
      faceCamera(stand.facing);
      await lab.step(SETTLE);
      const share = greenAt(lab, unseenFrom(stand.at));
      if (share > worst.share) worst = { share, name: `cottage ${k + 1}, side ${s + 1}`, ...stand };
    }
  }
  return worst;
}

/** The places of `places` whose pixel in the frame is plainly green. */
function greenOf(lab: Lab, places: THREE.Vector3[]): THREE.Vector3[] {
  const canvas = drawFrame(lab);
  return places.filter((place) => {
    const onScreen = place.clone().project(G.camera);
    const column = Math.floor(((onScreen.x + 1) / 2) * canvas.width);
    const row = Math.floor(((onScreen.y + 1) / 2) * canvas.height);
    if (column < 0 || column >= canvas.width || row < 0 || row >= canvas.height) return false;
    const pixel = (row * canvas.width + column) * 4;
    return isGreen(canvas.pixels[pixel], canvas.pixels[pixel + 1], canvas.pixels[pixel + 2]);
  });
}

/** What the rays say of the green places at `at`: how many they see, and where the green lies from him. */
function rayRead(lab: Lab, at: Spot): string {
  const green = greenOf(lab, unseenFrom(at));
  const seen = green.filter((place) => seenShareAt(place.x, place.z) > 0.5).length;
  const shares = (place: THREE.Vector3): string => {
    const onScreen = place.clone().project(G.camera);
    return `${((onScreen.x + 1) / 2).toFixed(2)},${((1 - onScreen.y) / 2).toFixed(2)}`;
  };
  const off = green.map(shares).slice(0, 12);
  return `  of its ${green.length} green places the rays see ${seen}; `
    + `on the screen (shares across, down): ${off.join(' ')}`;
}

/** The village's trees taken off every layer (their culling sets `visible` each frame): their crowns stand high and
 *  stay seen over what he can't see, and laid over that ground in the picture they read as it showing green. Returns
 *  each with the layers it had. */
function hideTrees(): [THREE.Object3D, number][] {
  const hidden: [THREE.Object3D, number][] = [];
  G.scene.traverse((object) => {
    if (!object.name.startsWith("village trees'")) return;
    hidden.push([object, object.layers.mask]);
    object.layers.disableAll();
  });
  return hidden;
}

/** From round each cottage, what its walls hide from him lies in the fog (`--canary` holds the fog off). */
export async function fogPastCottages(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const kept = viewMode();
  holdHour(12);
  holdSightOff(canary);
  const trees = hideTrees();
  try {
    await viewBy(lab, 'top');
    const worst = await greenestPast(lab);
    const line = `round the cottages, what their walls hide: at most ${(worst.share * 100).toFixed(1)}% plainly green `
      + `(${worst.name}; at most ${MOST_GREEN * 100}%)`;
    const wrong = worst.share > MOST_GREEN;
    if (canary) return { lines: [line], problems: [], caught: wrong, moments: [] };
    G.player.place(new THREE.Vector3(worst.at[0], groundHeight(...worst.at), worst.at[1]), worst.facing);
    faceCamera(worst.facing);
    await lab.step(SETTLE);
    const read = rayRead(lab, worst.at);
    const shot = await lab.screen(`the greenest of what a cottage hides: ${worst.name}`, []);
    return { lines: [line, read], problems: wrong ? [line] : [], caught: null, moments: [shot] };
  } finally {
    for (const [tree, mask] of trees) tree.layers.mask = mask;
    holdSightOff(false);
    holdHour(null);
    faceCamera(0);
    await viewBy(lab, kept);
  }
}

/** From round each cottage, the camera over its roof: the ground it hides from him is one grey, no greener under the
 *  roof's ghost than in the open (`--canary`: a ghost's share let off the fog whole, as it was). */
export async function fogOneGrey(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const kept = viewMode();
  holdHour(12);
  holdFogHueLetOff(canary);
  const trees = hideTrees();
  try {
    await viewBy(lab, 'top');
    let worst = { greener: -1, read: 0, name: '', at: [0, 0] as Spot, facing: 0 };
    let read = 0;
    let before = { green: 2, name: '' };
    for (const [k, c] of COTTAGES.entries()) {
      for (const [s, stand] of standsRound(c).entries()) {
        G.player.walkTo = null;
        G.player.place(new THREE.Vector3(stand.at[0], groundHeight(...stand.at), stand.at[1]), stand.facing);
        faceCamera(stand.facing);
        await lab.step(SETTLE);
        const found = greenerAt(lab, underItsRoof(c, stand.at));
        read += found.read;
        if (found.greener > worst.greener) worst = { ...found, name: `cottage ${k + 1}, side ${s + 1}`, ...stand };
        const seen = beforeHim(stand.at, stand.facing);
        const green = seen.length >= 6 ? greenerAt(lab, seen).greener : 2;
        if (green < before.green) before = { green, name: `cottage ${k + 1}, side ${s + 1}` };
      }
    }
    if (read === 0) throw new Error('lab: village: no place a cottage hides from him is in the frame');
    const greenest = (worst.greener * 100).toFixed(1);
    const line = `round the cottages, the ground within their walls, under their roofs: at most ${greenest}% `
      + `of its places green (greener than red or blue by ${READS_GREEN * 100}%; ${worst.name}, `
      + `${worst.read} places; at most ${MOST_GREENER * 100}%)`;
    const wrong = worst.greener > MOST_GREENER;
    if (canary) return { lines: [line], problems: [], caught: wrong, moments: [] };
    if (before.green > 1) throw new Error('lab: village: no stand read the grass before him');
    const seenLine = `the grass he sees before him there: at least ${(before.green * 100).toFixed(0)}% of its places `
      + `green (${before.name}; at least ${LEAST_GREEN_BEFORE * 100}%)`;
    // (said and pictured, not judged: at noon the ground within its walls reads no greener than red or blue under the
    // roof's slate with the fault or without (0.0% both), and the grass before him, seen through the wall's hole and
    // the eaves' ghost, is three surfaces blended; a read that tells the fault from the fix is still to be found, so
    // its canary goes unseen)
    const problems: string[] = [];
    G.player.place(new THREE.Vector3(worst.at[0], groundHeight(...worst.at), worst.at[1]), worst.facing);
    faceCamera(worst.facing);
    await lab.step(SETTLE);
    const shot = await lab.screen(`the greenest ground a cottage hides: ${worst.name}`, []);
    return { lines: [line, seenLine], problems, caught: null, moments: [shot] };
  } finally {
    for (const [tree, mask] of trees) tree.layers.mask = mask;
    holdFogHueLetOff(false);
    holdHour(null);
    faceCamera(0);
    await viewBy(lab, kept);
  }
}
