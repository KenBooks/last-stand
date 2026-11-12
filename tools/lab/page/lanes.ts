// A lane clear of props for a measure that casts along it: where the hero stands and the way he faces, so nothing of
// the arena stands between him and the foes he casts at. The crypt's columns are rolled afresh with each run, and a
// fixed spot met one in some runs: the log's bolts struck nothing there, a column between (`lab log --class mage`).

import * as THREE from 'three';
import { G } from '../../../src/state';

/** A lane: where the hero stands and the way he faces (rad). */
export interface Lane {
  at: [number, number];
  facing: number;
}

/** How a lane is measured: how long and how wide either side it's kept clear (m), where the search starts, and the
 *  way it tries first (rad). */
export interface LaneSize {
  long: number;
  wide: number;
}

/** the steps the ways round are tried in (deg), the grid of spots tried (m), and the dais's square and a little round
 *  it (m from the middle, each way): no spot on it, no lane over it */
const FACING_STEP = 15;
const GRID = 2;
const OFF_DAIS = 7;

/** The ways ahead of and to the left of a body facing `facing` (rad, 0 along +z). */
export function waysOf(facing: number): { forward: THREE.Vector3; left: THREE.Vector3 } {
  const forward = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
  const left = new THREE.Vector3(Math.cos(facing), 0, -Math.sin(facing));
  return { forward, left };
}

/** Whether the lane from `at` along `facing` (rad) is clear of every prop, off the dais and inside the arena's wall. */
export function laneClear(at: [number, number], facing: number, size: LaneSize): boolean {
  const { forward, left } = waysOf(facing);
  const from = new THREE.Vector3(at[0], 0, at[1]);
  const end = from.clone().addScaledVector(forward, size.long);
  if (Math.hypot(end.x, end.z) > G.arena.radius - size.wide) return false;
  for (let along = 0; along <= size.long; along++) {
    const point = from.clone().addScaledVector(forward, along);
    if (Math.max(Math.abs(point.x), Math.abs(point.z)) < OFF_DAIS) return false;
  }
  return G.arena.obstacles.every((prop) => {
    const off = new THREE.Vector3(prop.x - from.x, 0, prop.z - from.z);
    const along = off.dot(forward);
    const across = Math.abs(off.dot(left));
    return along < -prop.r || along > size.long + prop.r || across > size.wide + prop.r;
  });
}

/** The first way from `facing` round (rad) whose lane from `at` is clear; null if none is. */
export function clearFacing(at: [number, number], facing: number, size: LaneSize): Lane | null {
  for (let turn = 0; turn < 360; turn += FACING_STEP) {
    const way = facing + (turn * Math.PI) / 180;
    if (laneClear(at, way, size)) return { at, facing: way };
  }
  return null;
}

/** The clear lane from the grid's spot nearest `near` that has one, tried from `facing` round; `near` at `facing` if
 *  none has. */
export function clearLane(near: [number, number], facing: number, size: LaneSize): Lane {
  const most = Math.floor(G.arena.radius / GRID) * GRID;
  const spots: [number, number][] = [];
  for (let x = -most; x <= most; x += GRID) {
    for (let z = -most; z <= most; z += GRID) {
      if (Math.max(Math.abs(x), Math.abs(z)) >= OFF_DAIS) spots.push([x, z]);
    }
  }
  const away = (spot: [number, number]): number => Math.hypot(spot[0] - near[0], spot[1] - near[1]);
  spots.sort((a, b) => away(a) - away(b));
  for (const spot of spots) {
    const lane = clearFacing(spot, facing, size);
    if (lane) return lane;
  }
  return { at: near, facing };
}
