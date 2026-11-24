// `lab village --only dummiesSquare` (#754: "fix training dummy orientation to face forward instead of diagonally"):
// each of the training yard's dummies, as drawn, faces the yard's gate side square to its fence: the way its model's
// root is turned in the world (its +z), within `MOST_OFF` of the yard's own -z. Turned to the village's middle, as a
// foe faces the arena's, they stood 15 to 40 degrees across the yard. Said: each dummy's angle off square. `canary`
// turns the first to the village's middle again, which must be found.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { YARD, yardToWorld } from '../../../src/data/village';

/** the most a dummy may stand off square to the yard (rad: 3 degrees) */
const MOST_OFF = (3 * Math.PI) / 180;
/** the frames given for the dummies to stand and the canary's turn to be drawn */
const SETTLE = 5;

/** What the check found, as the village's checks report it. */
interface Checked { lines: string[]; problems: string[]; caught: boolean | null }

const _ahead = new THREE.Vector3();

/** The yard's gate side, the way the dummies should face (a unit vector on the ground). */
function gateWay(): THREE.Vector3 {
  const [ox, oz] = yardToWorld(0, 0);
  const [gx, gz] = yardToWorld(0, -YARD.halfZ);
  return new THREE.Vector3(gx - ox, 0, gz - oz).normalize();
}

/** The angle between where a model's root faces in the world (its +z) and `way` (rad). */
function offWay(root: THREE.Object3D, way: THREE.Vector3): number {
  root.updateWorldMatrix(true, false);
  _ahead.set(0, 0, 1).transformDirection(root.matrixWorld).setY(0).normalize();
  return _ahead.angleTo(way);
}

/** Every yard dummy faces its gate side square to the fence (the first turned to the middle, with `canary`). */
export async function dummiesSquare(lab: Lab, canary: boolean): Promise<Checked> {
  const dummies = G.enemies.filter((enemy) => enemy.type === 'dummy');
  if (!dummies.length) throw new Error('lab: village: no training dummies in the yard');
  if (canary) dummies[0].facing = dummies[0].targetFacing = Math.atan2(-dummies[0].pos.x, -dummies[0].pos.z);
  await lab.step(SETTLE);
  const way = gateWay();
  const offs = dummies.map((dummy) => offWay(dummy.model.root, way));
  const degrees = offs.map((off) => ((off * 180) / Math.PI).toFixed(1));
  const askew = offs.filter((off) => off > MOST_OFF).length;
  const lines = [`dummies: ${dummies.length - askew} of ${dummies.length} square to the yard (off by ${degrees.join(', ')} deg)`];
  const problems = askew ? [`dummies: ${askew} stand more than 3 deg across the yard (${degrees.join(', ')} deg)`] : [];
  return { lines, problems: canary ? [] : problems, caught: canary ? askew > 0 : null };
}
