// `lab village --only heroPickedNear`: the hero the hall's dais opens on, from the top-down view, the one nearest the
// player (from play, "in top down, the hero selection is not based on proximity (initial selected hero)... we need to
// match 3rd person where it is"). Over the shoulder the camera looks where he looks, and the hero nearest that way is
// the one he walked up to; from above the camera looks one way wherever he stands, and turned aside it picked the hero
// at that side, whichever plinth he stood by. Stood before each other class's plinth with the camera turned each way,
// that plinth is picked. `canary` asks for the other one, which must be found.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { HALL, TERRACE } from '../../../src/data/village';
import { CLASS_IDS } from '../../../src/data/classes/index';
import { CAMERA } from '../../../src/data/balance';
import { heroLookedAt } from '../../../src/game/village';
import { orbitBy, viewMode } from '../../../src/core/renderer';
import { groundHeight } from '../../../src/world/ground';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** how far before a plinth he stands (m), the frames he and the camera are given to settle, and the camera's turns
 *  (radians from where it stands) */
const BEFORE_PLINTH = 1.4;
const SETTLE = 60;
const TURNS = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

/** The camera turned by `radians`, as a middle drag turns it. */
function turnCamera(radians: number): void {
  orbitBy(-radians / CAMERA.orbitSpeed);
}

/** Top-down, the hero stood before each plinth but his own's, the camera turned each way: the plinths picked. */
export async function heroPickedNear(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const kept = viewMode();
  await viewBy(lab, 'top');
  const said: string[] = [];
  const problems: string[] = [];
  const plinths = HALL.plinths.map((_, i) => i).filter((i) => CLASS_IDS[i] !== G.player.cls.id);
  if (plinths.length < 2) throw new Error('lab: village: fewer than two other heroes on the dais');
  let wrongFound = false;
  try {
    for (const turn of TURNS) {
      turnCamera(turn);
      for (const [k, plinth] of plinths.entries()) {
        const x = TERRACE.x + HALL.plinths[plinth];
        const z = HALL.plinthZ + BEFORE_PLINTH;
        G.player.walkTo = null;
        G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), 0);
        await lab.step(SETTLE);
        const picked = heroLookedAt();
        said.push(`${turn.toFixed(1)} by ${CLASS_IDS[plinth]}: ${CLASS_IDS[picked]}`);
        if (picked !== plinth) {
          const by = `by ${CLASS_IDS[plinth]}'s plinth`;
          problems.push(`top-down, turned ${turn.toFixed(1)}, ${by} ${CLASS_IDS[picked]} was picked`);
        }
        if (picked !== plinths[(k + 1) % plinths.length]) wrongFound = true;
      }
      turnCamera(-turn);
    }
  } finally {
    await viewBy(lab, kept);
  }
  const line = `the hero picked from above, camera turned: ${said.join(', ')}`;
  if (canary) return { lines: [line], problems: [], caught: wrongFound, moments: [] };
  return { lines: [line], problems, caught: null, moments: [] };
}
