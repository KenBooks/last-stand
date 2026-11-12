// `lab village`'s start and the view from above on a higher floor. `startSpots`: each place a game may open at (from
// play, "lets also choose a more scenic startup location, current one is boring, maybe several (3-5), and pick at
// random"), he stood there clear of what stands round it, pictured as the game opens on it. `canary` plants a spot in
// a cottage. `topKeepsHim`: zoomed right in from above, he stands where he stood on the screen as he climbs to the
// terrace (from play, "this is a good camera angle, but this one is not (head cut off), and I didn't do anything,
// just climbed up": the view looked at the village's ground whatever floor he stood on, and he rose up the frame).
// `canary` holds the view on the ground as it was.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { START_SPOTS, TERRACE, COTTAGES, type StartSpot } from '../../../src/data/village';
import { CAMERA } from '../../../src/data/balance';
import { faceCamera, holdTopOnGround, setZoom, viewMode } from '../../../src/core/renderer';
import { groundHeight } from '../../../src/world/ground';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

const SETTLE = 90;
/** how clear of an obstacle's edge a start stands (m), and the least of them there are */
const CLEAR = 0.5;
const FEWEST_SPOTS = 3;
/** how far he stands from the wall a body's kept off at least (m) */
const OFF_THE_WALL = 0.05;
/** how high his head is, and how much of the frame's height it may move between the floors */
const HEAD_UP = 1.75;
const MOST_MOVED = 0.03;

/** What's wrong with a start where it stands. */
function wrongWith(spot: StartSpot): string | null {
  const [x, z] = spot.at;
  for (const obstacle of G.arena.obstacles) {
    if (Math.hypot(obstacle.x - x, obstacle.z - z) < obstacle.r + CLEAR) return `${spot.name}: in an obstacle`;
  }
  for (const cottage of COTTAGES) {
    if (Math.hypot(cottage.x - x, cottage.z - z) < 3 * cottage.size) return `${spot.name}: in a cottage`;
  }
  const kept = new THREE.Vector3(x, 0, z);
  G.arena.wall?.keepIn(kept, 0.3);
  if (Math.hypot(kept.x - x, kept.z - z) > OFF_THE_WALL) return `${spot.name}: past the wall`;
  return null;
}

/** Every start stood at and pictured. */
export async function startSpots(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const kept = viewMode();
  const spots: StartSpot[] = canary
    ? [{ name: 'in a cottage', at: [COTTAGES[0].x, COTTAGES[0].z], facing: 0 }] : [...START_SPOTS];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  setZoom(CAMERA.lobbyZoom);
  await viewBy(lab, 'top');
  for (const spot of spots) {
    const wrong = wrongWith(spot);
    if (wrong) problems.push(wrong);
    if (canary) continue;
    G.player.walkTo = null;
    G.player.place(new THREE.Vector3(spot.at[0], groundHeight(spot.at[0], spot.at[1]), spot.at[1]), spot.facing);
    faceCamera(spot.facing);
    await lab.step(SETTLE);
    moments.push(await lab.screen(`starts ${spot.name}`, []));
  }
  await viewBy(lab, kept);
  const line = `${spots.length} places to open at: ${problems.length ? problems.join('; ') : 'each clear'}`;
  if (canary) return { lines: [line], problems: [], caught: problems.length > 0, moments: [] };
  if (spots.length < FEWEST_SPOTS) problems.push(`only ${spots.length} places to open at`);
  return { lines: [line], problems, caught: null, moments };
}

/** His head's height on the screen (a share of the frame, 0 its top) stood at (x, z). */
async function headOnScreen(lab: Lab, x: number, z: number): Promise<number> {
  const y = groundHeight(x, z);
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, y, z), 0);
  faceCamera(Math.PI);
  await lab.step(SETTLE);
  const head = new THREE.Vector3(x, G.player.obj.position.y + HEAD_UP, z).project(G.camera);
  return (1 - head.y) / 2;
}

/** Zoomed right in from above, his head as high on the screen on the terrace as on the square. */
export async function topKeepsHim(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const kept = viewMode();
  holdTopOnGround(canary);
  try {
    await viewBy(lab, 'top');
    setZoom(CAMERA.minZoom);
    const below = await headOnScreen(lab, TERRACE.x + 4, TERRACE.stairFoot + 3);
    const above = await headOnScreen(lab, TERRACE.x + 4, TERRACE.front - 1.5);
    const shot = canary ? null : await lab.screen('zoomed in from above on the terrace', []);
    const moved = Math.abs(above - below);
    const line = `from above, zoomed in: his head ${(below * 100).toFixed(1)}% down the frame on the square, `
      + `${(above * 100).toFixed(1)}% on the terrace (at most ${MOST_MOVED * 100}% apart)`;
    const wrong = moved > MOST_MOVED || above < 0;
    if (canary) return { lines: [line], problems: [], caught: wrong, moments: [] };
    return { lines: [line], problems: wrong ? [line] : [], caught: null, moments: shot ? [shot] : [] };
  } finally {
    holdTopOnGround(false);
    setZoom(CAMERA.lobbyZoom);
    await viewBy(lab, kept);
  }
}
