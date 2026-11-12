// `lab village`'s steady lamps: the hero standing still on the square at midnight, the village's held lights (the
// street lamps' and torches' pooled lights) frame by frame. A lamp burns steady: lit from the pool, which flickered
// every light by a random tenth each frame for the spells' flashes, the lamps shimmered at the frame rate (from play:
// "lamps have high frequency flicker, I dont want that"). `canary` shakes a lamp's light by a tenth a frame, which
// must be found.
import type * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { holdHour } from '../../../src/game/clock';
import type { LightsChecked } from './villageLights';
import { pooledLights } from '../../../src/fx/lights';

/** the frames the lamps are given to fade in, and the frames read */
const SETTLE = 120;
const READ = 60;
/** the most a lit lamp's light may change in a frame, as a share of it */
const MOST_CHANGE = 0.01;
/** the least a light must give to count as lit */
const LIT = 0.5;

/** The pool's lights lit now, each by its light (the lamps' and torches': a fire's own light swells with its
 *  flames). */
function litLights(): Map<THREE.PointLight, number> {
  const lit = new Map<THREE.PointLight, number>();
  for (const light of pooledLights()) if (light.intensity > LIT) lit.set(light, light.intensity);
  return lit;
}

/** The village's lamps at midnight, the hero still: no lit light changing by over a hundredth a frame. */
export async function lampsSteady(lab: Lab, canary: boolean): Promise<LightsChecked> {
  holdHour(0);
  try {
    // (stood still where the checks before left him: walking, the nearest lamps hand their lights over, fading)
    G.player.walkTo = null;
    G.player.place(G.player.pos.clone(), G.player.facing);
    await lab.step(SETTLE);
    const at = G.player.pos.clone();
    const first = litLights();
    if (!first.size) throw new Error('lab: village: no lamp lit at midnight');
    const shaken = [...first.keys()][0];
    let most = 0;
    let mostLight = shaken;
    let before = first;
    for (let frame = 0; frame < READ; frame++) {
      const shake = canary ? () => { shaken.intensity *= 1.1; } : undefined;
      await lab.step(1, undefined, shake);
      const now = litLights();
      for (const [light, was] of before) {
        const is = now.get(light);
        const change = is === undefined ? 0 : Math.abs(is - was) / was;
        if (change > most) {
          most = change;
          mostLight = light;
        }
      }
      before = now;
    }
    const where = mostLight.getWorldPosition(mostLight.position.clone()).toArray().map((v) => v.toFixed(1)).join(', ');
    const moved = G.player.pos.distanceTo(at);
    if (moved > 0.05) throw new Error(`lab: village: the hero moved ${moved.toFixed(2)} m while the lamps were read`);
    const line = `lamps: ${first.size} of the pool's lights lit at midnight, the most one changed in a frame `
      + `${(most * 100).toFixed(1)}% (at ${where})`;
    const shimmers = most > MOST_CHANGE;
    const problems = shimmers && !canary ? [`${line}: a lamp flickers`] : [];
    return { lines: [line], problems, caught: canary ? shimmers : null, moments: [] };
  } finally {
    holdHour(null);
  }
}
