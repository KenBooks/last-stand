// `lab village`'s arrows on its ground (from play, "ranger arrows should stick in ground in training area"): an arrow
// coming down in the training yard and on the meadow stands in the ground, with either biome chosen for the next
// run, and one on the square's cobbles glances off. The village's biome was whichever run was last chosen, and in the
// crypt's every arrow skittered off the grass. `canary` reads the square's cobbles as ground, which must be found.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { BIOME_IDS, type BiomeId } from '../../../src/data/biomes';
import { YARD } from '../../../src/data/village';
import { clearSpent, spentStats } from '../../../src/fx/stuckArrows';
import { intoGround } from '../../../src/combat/skills/ranger';
import type { LightsChecked } from './villageLights';

/** an arrow's way down (m/s), and the frames between one landing and the reading */
const COMING_DOWN = new THREE.Vector3(8, -12, 0);
/** the meadow's spot read, and the square's */
const MEADOW = { x: -13, z: 6 };
const SQUARE = { x: 3, z: 3 };

/** Whether an arrow coming down at (x, z) stands in the ground there. */
function standsAt(x: number, z: number): boolean {
  clearSpent();
  intoGround(new THREE.Vector3(x, 0, z), COMING_DOWN.clone());
  return spentStats().fixed === 1;
}

/** An arrow stands in the village's ground, whichever biome is chosen, and glances off its paving. */
export async function arrowsStickInGround(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const was: BiomeId = G.arena.biome;
  const problems: string[] = [];
  const lines: string[] = [];
  if (G.arena.place !== 'village') throw new Error('lab: village: not in the village');
  for (const biome of BIOME_IDS) {
    G.arena.setBiome(biome);
    const yard = standsAt(YARD.x, YARD.z);
    const meadow = standsAt(MEADOW.x, MEADOW.z);
    const square = canary ? true : standsAt(SQUARE.x, SQUARE.z);
    lines.push(`the ${biome} chosen: an arrow stands in the yard ${yard}, the meadow ${meadow}, the square ${square}`);
    if (!yard) problems.push(`the ${biome} chosen: an arrow glanced off the yard's ground`);
    if (!meadow) problems.push(`the ${biome} chosen: an arrow glanced off the meadow`);
    if (square) problems.push(`the ${biome} chosen: an arrow stood in the square's cobbles`);
  }
  G.arena.setBiome(was);
  clearSpent();
  await lab.step(1);
  if (canary) return { lines, problems: [], caught: problems.length > 0, moments: [] };
  return { lines, problems, caught: null, moments: [] };
}
