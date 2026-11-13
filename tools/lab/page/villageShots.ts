// `lab live`'s spots in the village to look at by hand, for a review's pictures: `standAt(lab, x, z, facing, hour)`
// stands the hero over the shoulder, at the hour asked, and the next `live picture --views screen` is what the player
// sees.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { faceCamera } from '../../../src/core/renderer';
import { holdHour } from '../../../src/game/clock';
import { groundHeight } from '../../../src/world/ground';
import { toLobby } from './hallMoves';
import { viewBy } from './villageHallCull';

/** the frames given for him and the camera to settle */
const SETTLE = 60;

/** The hero stood at (x, z) facing `facing` over the shoulder, at `hour` (null: the clock's). */
export async function standAt(lab: Lab, x: number, z: number, facing: number, hour: number | null): Promise<void> {
  if (G.mode !== 'menu') await toLobby(lab);
  holdHour(hour);
  await viewBy(lab, 'third');
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), facing);
  faceCamera(facing);
  await lab.step(SETTLE);
}
