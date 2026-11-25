// The fires heard now (#745, `core/ambience.ts`): of every fire built (`FIRES` in `fire.ts`), those shown (all that
// they were built into shown: a battleground's in its runs, the village's campfire in the village, a house's hearth
// inside it, the hall's torches in the hall), the nearest first, each its distance from the listener and its way
// from where the camera looks.
import * as THREE from 'three';
import { FIRES, type FireBuilt } from './fire';
import type { FireHeard } from '../core/ambience';

/** a fire further than this is never heard (m: past the ambience's own reach for a fire) */
const HEARD_WITHIN = 16;

const _at = new THREE.Vector3();
const _seen = new THREE.Vector3();

/** Whether `object` and all it's under are shown. */
function shown(object: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = object; o; o = o.parent) if (!o.visible) return false;
  return true;
}

/** Where fire `fire` is in the world (into `out`). */
function placeOf(fire: FireBuilt, out: THREE.Vector3): THREE.Vector3 {
  return out.copy(fire.at).applyMatrix4(fire.of.matrixWorld);
}

/** The `most` nearest fires shown within `HEARD_WITHIN` of `listener` (on the ground's plane), nearest first: each
 *  its distance and its way from where `camera` looks (rad, 0 ahead, right positive). */
export function firesHeard(listener: THREE.Vector3, camera: THREE.Camera, most: number): FireHeard[] {
  const near: { at: number; fire: FireBuilt }[] = [];
  for (const fire of FIRES) {
    placeOf(fire, _at);
    const at = Math.hypot(_at.x - listener.x, _at.z - listener.z);
    if (at > HEARD_WITHIN || !shown(fire.of)) continue;
    near.push({ at, fire });
  }
  near.sort((a, b) => a.at - b.at);
  return near.slice(0, most).map(({ at, fire }) => {
    placeOf(fire, _seen).setY(listener.y).applyMatrix4(camera.matrixWorldInverse);
    return { at, way: Math.atan2(_seen.x, -_seen.z) };
  });
}
