// `lab village --only dummyLabelsFade`: the training dummies' readouts as he walks in and out of the yard (from play,
// "training dummy labels should fade in and fade out when entering/exiting the area, not instant", "re-entering dummy
// area should reset their counters"). Each frame as he steps in and out: how much of the readout is shown, none moving
// by more than `MOST_A_FRAME`, all of it shown inside and none outside; hits counted before he leaves are gone as he
// comes back. `canary` makes the fade all but instant, which must be found.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { yardToWorld } from '../../../src/data/village';
import { groundHeight } from '../../../src/world/ground';
import { anchoredLabels } from '../../../src/ui/floaters';
import { METER_FADE, type DamageMeter } from '../../../src/ui/damageMeter';
import type { LightsChecked } from './villageLights';

/** a spot well out of the yard, the frames read on each side, the most a readout may change in a frame, the hits
 *  counted */
const OUT_OF_YARD: [number, number] = [3, 3];
const FRAMES = 60;
const MOST_A_FRAME = 0.15;
const HITS = 3;
const HIT = 100;

/** How much of `meter`'s readout is on the screen now: none while it has no place there. */
function shownOf(meter: DamageMeter): number {
  const anchored = anchoredLabels().find((entry) => entry.label === meter.readout);
  if (!anchored) throw new Error('lab: village: a dummy\'s readout isn\'t anchored');
  return anchored.at ? anchored.label.alpha : 0;
}

/** He placed at (x, z) and the readout read each frame after: how far it moved in a frame, and where it ended. */
async function stepTo(lab: Lab, meter: DamageMeter, [x, z]: [number, number]): Promise<{ jump: number; end: number }> {
  let last = shownOf(meter);
  let jump = 0;
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), 0);
  await lab.step(FRAMES, undefined, () => {
    const now = shownOf(meter);
    jump = Math.max(jump, Math.abs(now - last));
    last = now;
  });
  return { jump, end: last };
}

/** A dummy's readout faded in and out across the yard's edge, its counters reset as he comes back. */
export async function dummyLabelsFade(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const meter = G.enemies.find((enemy) => enemy.meter)?.meter;
  if (!meter) throw new Error('lab: village: no training dummy');
  const heldTime = METER_FADE.time;
  if (canary) METER_FADE.time = 0.001;
  const problems: string[] = [];
  const lines: string[] = [];
  const inside = yardToWorld(0, 0);
  try {
    await stepTo(lab, meter, OUT_OF_YARD);
    const entering = await stepTo(lab, meter, inside);
    for (let hit = 0; hit < HITS; hit++) meter.record(HIT);
    const counted = meter.burst.hits;
    await lab.step(1);
    const leaving = await stepTo(lab, meter, OUT_OF_YARD);
    const back = await stepTo(lab, meter, inside);
    const { hits, total } = meter.burst;
    lines.push(`a dummy's readout: in ${entering.jump.toFixed(2)} a frame at most, ended ${entering.end.toFixed(2)}; `
      + `out ${leaving.jump.toFixed(2)}, ended ${leaving.end.toFixed(2)}; hits ${counted}, back in ${hits} (${total})`);
    if (entering.jump > MOST_A_FRAME) problems.push(`it came in by ${entering.jump.toFixed(2)} in a frame`);
    if (leaving.jump > MOST_A_FRAME) problems.push(`it went by ${leaving.jump.toFixed(2)} in a frame`);
    if (entering.end < 0.99) problems.push(`in the yard only ${entering.end.toFixed(2)} of it shows`);
    if (leaving.end > 0.01) problems.push(`out of the yard ${leaving.end.toFixed(2)} of it shows`);
    if (counted !== HITS) problems.push(`${counted} of ${HITS} hits counted`);
    if (hits !== 0 || total !== 0) problems.push(`back in the yard it still counts ${hits} hits, ${total}`);
  } finally {
    METER_FADE.time = heldTime;
  }
  if (canary) return { lines, problems: [], caught: problems.length > 0, moments: [] };
  return { lines, problems, caught: null, moments: [] };
}
