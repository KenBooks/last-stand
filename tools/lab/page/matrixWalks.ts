// The objects a frame makes the world matrices of, counted as three visits each (`updateMatrixWorld`, which three's
// render calls down the whole scene, hidden parts too). In the village most of the scene stands hidden (the houses'
// rooms, the other biomes, the hall's room), and a walk of all of it was about 1 ms of each frame's render on the CPU
// (`lab perf --village --profile`): a count says how much of the scene a frame walks, exactly, where the ms move with
// the machine's load.
import * as THREE from 'three';

/** the visits counted since the count began */
let visits = 0;
/** whether three's walk is wrapped yet */
let wrapped = false;

/** Starts counting three's visits of every object (once). */
function wrap(): void {
  if (wrapped) return;
  const walk = THREE.Object3D.prototype.updateMatrixWorld;
  THREE.Object3D.prototype.updateMatrixWorld = function counted(this: THREE.Object3D, force?: boolean): void {
    visits++;
    walk.call(this, force);
  };
  wrapped = true;
}

/** The visits counted so far, a running count to take differences of. */
export function matrixWalks(): number {
  wrap();
  return visits;
}
