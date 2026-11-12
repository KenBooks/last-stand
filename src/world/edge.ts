// The arena's wall as a shape (the crypt's octagon, the Thornwood's ring of thicket) with its four gates, for what flies
// into it.
import * as THREE from 'three';
import { WALL_R, GATE_W } from './props';
import { wallShape, type PlaceId } from '../data/biomes';

const TAU = Math.PI * 2;
/** how far out a `free` wall's line may be read (m): past anything the village builds */
const FREE_REACH = 48;

/**
 * How far (x, z) is past the wall's inner face (m; below 0 inside), the face's normal into the arena there (`normal`),
 * and whether the point is in a gate's opening (the way out, where nothing meets the wall).
 */
export function pastWall(biome: PlaceId, x: number, z: number, normal: THREE.Vector3): { by: number; gate: boolean } {
  let by: number, a: number;
  if (wallShape(biome) === 'free') {
    // (no face but what's built: never past it, and no gates)
    a = Math.atan2(z, x);
    normal.set(-Math.cos(a), 0, -Math.sin(a));
    return { by: Math.hypot(x, z) - FREE_REACH, gate: false };
  }
  if (wallShape(biome) === 'octagon') {
    // (the face nearest the point: an octagon's sides face k/8 of a turn)
    a = Math.round(Math.atan2(z, x) / (TAU / 8)) * (TAU / 8);
    by = x * Math.cos(a) + z * Math.sin(a) - WALL_R;
  } else {
    a = Math.atan2(z, x);
    by = Math.hypot(x, z) - WALL_R;
  }
  normal.set(-Math.cos(a), 0, -Math.sin(a));
  // (the gates face a quarter turn apart from +x, GATE_W wide)
  const g = Math.round(Math.atan2(z, x) / (TAU / 4)) * (TAU / 4);
  const across = Math.abs(-x * Math.sin(g) + z * Math.cos(g));
  return { by, gate: across < GATE_W / 2 };
}

/** How far out from the middle the wall's inner face is along `angle` (m): an octagon's further toward its corners. */
export function faceAt(biome: PlaceId, angle: number): number {
  if (wallShape(biome) === 'free') return FREE_REACH;
  if (wallShape(biome) !== 'octagon') return WALL_R;
  const side = Math.round(angle / (TAU / 8)) * (TAU / 8);
  return WALL_R / Math.cos(angle - side);
}
