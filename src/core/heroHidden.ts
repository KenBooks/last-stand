// How far what stands between the camera and the hero hides him, which what stands free thins by (core/seeThrough.ts):
// a few lines from the camera to points of his body, read against what's built and the circles of what stands free.
// Thinned all the time it took apart whatever he stood beside; with a hole his own size alone he showed by himself
// behind a wall ("character and context around character needs to be visible even if the character is behind props").
import * as THREE from 'three';
import { G } from '../state';
import { FENCE, STANDS_FREE, wallHit } from '../world/wall';
import { clamp, damp } from '../util';

/** the shares of his height the lines run to, and how far aside of his middle (m) */
const HEIGHTS = [0.2, 0.47, 0.72, 0.95];
/** the share of his height under which what hides him is no reason to thin it: a parapet before his legs stood in dots
 *  over them (from play, "dont thin if obstacle is below waist") */
export const WAIST = 0.55;
const SIDES = [-0.25, 0, 0.25];
const POINTS = HEIGHTS.length * SIDES.length;
/** the lines read a frame: they're all read within a few frames, as he and the camera hardly move in one */
const LINES_A_FRAME = 4;
/** the share of the lines hidden at which it's fully thinned: a post before him hides a third of them */
const FULLY_OPEN = 0.3;
/** how fast it opens and closes (a rate, `damp`), slower closing: a fence walked along would pump it */
const OPENS = 7;
const CLOSES = 3;

const hidden = new Uint8Array(POINTS);
/** the same lines, read against what's built alone, a fence apart (its own hole: the palisade hiding him at the
 *  village's edge opened the houses' hole, and a cottage beside him went to its footing, from play, "at border of map,
 *  the house behind player suddenly disappeared") */
const walled = new Uint8Array(POINTS);
const fenced = new Uint8Array(POINTS);
/** the same lines, read against what stands free alone: its circles and the wall's free meshes (the notice board) */
const propped = new Uint8Array(POINTS);
const _point = new THREE.Vector3();
const _hit = wallHit();
let next = 0;
let opening = 0;
let wallOpening = 0;
let fenceOpening = 0;
/** how far what stands free hides him at his waist or above (0..1, eased), and whether any of it does (0..1, eased) */
let propOpening = 0;
let propsOver = 0;
/** for a harness: a fence read as what's built, as it was (`holdFenceAsBuilt`) */
let fenceAsBuilt = false;

/** For a harness (tools/lab): a fence hiding him read as what's built, as it was (the houses' hole opened by it). */
export function holdFenceAsBuilt(on: boolean): void {
  fenceAsBuilt = on;
}

/** How far what's built alone hides him (0..1), a fence aside, as `holeOpening` last read it: what stands free before him
 *  is no reason to open a cottage beside it, and nor is the palisade. */
export const builtOpening = (): number => wallOpening;

/** How far what stands free hides him at his waist or above (0..1, eased), as `holeOpening` last read it: what's built
 *  hiding him alone leaves it whole. */
export const propsOpening = (): number => propOpening;

/** Whether anything that stands free hides him at his waist or above (0..1, eased): until it does, nothing free thins for
 *  him, not even in the hole his own size (from play, "half drawn props": the hole took the corner of the notice board
 *  beside him, which hid nothing of him). */
export const propsHideHim = (): number => propsOver;

/** How far a fence alone hides him (0..1), as `holeOpening` last read it. */
export const fenceOpened = (): number => fenceOpening;

/** The share of `lines` set, as a hole's wanted opening (0..1). */
const wantedBy = (lines: Uint8Array): number => clamp(lines.reduce((sum, one) => sum + one, 0) / POINTS / FULLY_OPEN, 0, 1);

/** `now` damped toward `wanted`, opening faster than it closes. */
const towards = (now: number, wanted: number, dt: number): number => damp(now, wanted, wanted > now ? OPENS : CLOSES, dt);

/** Whether the line from `camera` to `point` crosses a circle of what stands free, under its top. */
function crossesObstacle(camera: THREE.Vector3, point: THREE.Vector3): boolean {
  const dx = point.x - camera.x;
  const dz = point.z - camera.z;
  const long2 = dx * dx + dz * dz;
  if (long2 < 1e-6) return false;
  for (const obstacle of G.arena.obstacles) {
    const { x, z } = obstacle;
    const { r, h } = obstacle.sight ?? obstacle;
    // (a circle he stands in isn't before him)
    if ((point.x - x) ** 2 + (point.z - z) ** 2 <= r * r) continue;
    const along = clamp(((x - camera.x) * dx + (z - camera.z) * dz) / long2, 0, 1);
    const offX = camera.x + dx * along - x;
    const offZ = camera.z + dz * along - z;
    if (offX * offX + offZ * offZ > r * r) continue;
    if (camera.y + (point.y - camera.y) * along < h) return true;
  }
  return false;
}

/** The hole's opening this frame (0: his own size, 1: wide), the camera at `camera`, him at (x, z) over `floor`. */
export function holeOpening(camera: THREE.Vector3, x: number, floor: number, z: number, height: number, props: number,
  dt: number): number {
  if (!G.arena?.wall || props <= 0) {
    wallOpening = 0;
    fenceOpening = 0;
    propOpening = 0;
    propsOver = 0;
    return (opening = 0);
  }
  const toX = x - camera.x;
  const toZ = z - camera.z;
  const long = Math.hypot(toX, toZ) || 1;
  for (let line = 0; line < LINES_A_FRAME; line++) {
    next = (next + 1) % POINTS;
    const side = SIDES[next % SIDES.length];
    const up = HEIGHTS[Math.floor(next / SIDES.length)];
    _point.set(x - (toZ / long) * side, floor + height * up, z + (toX / long) * side);
    // (a line under his waist counts for nothing: what hides his legs alone stays whole)
    const counts = up >= WAIST;
    const met = counts && G.arena.wall.cast(camera, _point, _hit);
    const free = met && _hit.name === STANDS_FREE;
    fenced[next] = met && _hit.name === FENCE && !fenceAsBuilt ? 1 : 0;
    walled[next] = met && !fenced[next] && !free ? 1 : 0;
    propped[next] = free || (counts && crossesObstacle(camera, _point)) ? 1 : 0;
    hidden[next] = met || propped[next] ? 1 : 0;
  }
  propOpening = towards(propOpening, wantedBy(propped), dt);
  propsOver = towards(propsOver, propped.includes(1) ? 1 : 0, dt);
  opening = towards(opening, wantedBy(hidden), dt);
  wallOpening = towards(wallOpening, wantedBy(walled), dt);
  fenceOpening = towards(fenceOpening, wantedBy(fenced), dt);
  return opening;
}
