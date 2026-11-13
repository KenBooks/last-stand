// `lab village`'s sun's shadow kept (`world/moonShadow.ts`): the frame drawn with the map kept and redrawn whole must
// be the same, with the hero standing at one place and then at another (a shadow left where he stood would show), by
// day and with the chest's lid moved. `canary` draws the kept map with the hero left out of what moves: it must show.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { holdHour } from '../../../src/game/clock';
import { faceCamera } from '../../../src/core/renderer';
import { groundHeight } from '../../../src/world/ground';
import { keepMoonShadow } from '../../../src/world/moonShadow';
import { moversSeen } from '../../../src/world/lampShadows';
import { HERO_SHADOW_LAYER } from '../../../src/core/layers';
import { villageObject } from '../../../src/game/village';
import type { Spot } from '../../../src/data/village';
import { drawFrame } from './light';
import { changedShare } from './villageHallCull';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** the frames given after a move or a switch, for the map and what's eased to settle */
const SETTLE = 30;
/** the hour the sun's shadow is read at */
const NOON = 12;
/** the most of the frame that may differ between the map kept and redrawn whole */
const MOST_CHANGED = 0.002;
/** the least the canary's left-out hero must change */
const CANARY_LEAST = 0.0005;
/** where he stands: the square, then a walk off it */
const SPOTS: Spot[] = [[2, 3], [-4, 4]];
/** a layer nothing is on, for the canary's draw of what moves */
const NOTHING_LAYER = 30;

/** The frame at `spot` with the map kept and then redrawn whole, at one moment (the grass and the water move between
 *  frames: two frames apart, 58% of the frame differed with nothing changed): the share of it that changed. */
async function keptAgainstWhole(lab: Lab, [x, z]: Spot): Promise<number> {
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), Math.PI);
  faceCamera(Math.PI);
  await lab.step(SETTLE);
  const kept = drawFrame(lab);
  keepMoonShadow(false);
  const whole = drawFrame(lab);
  keepMoonShadow(true);
  return changedShare(kept, whole);
}

/** The map kept and redrawn whole read alike wherever he stands, and with the chest's lid opened. */
export async function sunShadowKept(lab: Lab, canary: boolean): Promise<LightsChecked> {
  holdHour(NOON);
  await viewBy(lab, 'third');
  const read = (share: number): string => `${(share * 100).toFixed(2)}%`;
  const lines: string[] = [];
  const problems: string[] = [];
  try {
    if (canary) moversSeen.layers.set(NOTHING_LAYER);
    const shares: number[] = [];
    for (const spot of SPOTS) shares.push(await keptAgainstWhole(lab, spot));
    const stand = villageObject('chest')?.stand;
    if (!stand) throw new Error('lab: village: no chest to stand by');
    shares.push(await keptAgainstWhole(lab, stand));
    lines.push(`the sun's shadow kept against redrawn whole, the frame changed: ${shares.map(read).join(', ')}`);
    const most = Math.max(...shares);
    if (canary) return { lines, problems: [], caught: most > CANARY_LEAST, moments: [] };
    if (most > MOST_CHANGED) problems.push(`${lines[0]}: over ${read(MOST_CHANGED)}`);
    return { lines, problems, caught: null, moments: [] };
  } finally {
    moversSeen.layers.set(HERO_SHADOW_LAYER);
    keepMoonShadow(true);
    holdHour(null);
    await viewBy(lab, 'top');
  }
}
