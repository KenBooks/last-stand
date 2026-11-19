// Walls a hero raises in the arena (the ranger's Hedgeward, combat/skills/hedgeward.ts). Each is an ordinary breakable
// prop raised in the fight (world/destructible.ts `raiseProp`): its circles stand in the arena's obstacles, kept off by
// bodies and paths, and every hit that wears a prop wears it, a big foe walking into it breaks it (from the owner:
// "its just another prop, lets not introduce new game mechanics per object"). Kept here is where each stands: a co-op
// game told its health finds it by that (enemyAI's `ward` fx), as its index in the biome's list differs from game to
// game.
import type { Obstacle } from '../types';
import type { Prop } from './destructible';

/** A wall standing in the arena: a line on the floor from (ax, az) to (bx, bz), and the prop it is. */
export interface Ward {
  readonly ax: number;
  readonly az: number;
  readonly bx: number;
  readonly bz: number;
  readonly prop: Prop;
}

/** every wall standing */
export const wards: Ward[] = [];

/** how far apart the circles along a wall stand, as a share of their radius: overlapping, a body slides along it with
 *  bumps a few centimetres deep */
const CIRCLE_STEP = 1;

/** The circles along a wall from (ax, az) to (bx, bz), `half` thick and `top` high. */
export function circlesAlong(ax: number, az: number, bx: number, bz: number, half: number, top: number): Obstacle[] {
  const length = Math.hypot(bx - ax, bz - az);
  const count = Math.max(2, Math.ceil(length / (half * CIRCLE_STEP)) + 1);
  const circles: Obstacle[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    circles.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, r: half, h: top });
  }
  return circles;
}

/** A wall raised: where it stands kept. */
export function addWard(ward: Ward): void {
  if (!wards.includes(ward)) wards.push(ward);
}

/** A wall gone (broken, taken down for a newer one, the fight cleared). */
export function removeWard(ward: Ward): void {
  const i = wards.indexOf(ward);
  if (i >= 0) wards.splice(i, 1);
}

/** The point of `ward`'s line nearest (x, z), into `out`, and how far it is. */
export function nearestOnWard(ward: Ward, x: number, z: number, out: { x: number; z: number }): number {
  const ux = ward.bx - ward.ax, uz = ward.bz - ward.az, length2 = ux * ux + uz * uz;
  const t = length2 > 1e-9 ? Math.min(1, Math.max(0, ((x - ward.ax) * ux + (z - ward.az) * uz) / length2)) : 0;
  out.x = ward.ax + ux * t;
  out.z = ward.az + uz * t;
  return Math.hypot(x - out.x, z - out.z);
}

const _near = { x: 0, z: 0 };
/** The wall whose line passes within `near` of (x, z), the nearest (its health told to a co-op game finds it by where
 *  it stands). */
export function wardAt(x: number, z: number, near = 1): Ward | undefined {
  let best: Ward | undefined, bestD = near;
  for (const ward of wards) {
    const d = nearestOnWard(ward, x, z, _near);
    if (d < bestD) { bestD = d; best = ward; }
  }
  return best;
}
