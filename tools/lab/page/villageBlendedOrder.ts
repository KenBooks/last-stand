// `lab village`'s blended order: what thins by blending (the hall's walls and columns, the cottages, the roofs, the
// palisade) drawn near to far while none of it thins, as it's as solid then as what's opaque (`sortBlendedFrom` in
// `core/seeThrough.ts`). Back to front, inside the hall of heroes each wall and column behind another was lit and then
// covered: what's see-through or cut out, 21 ms of the 4080's 34 ms scene pass there (a perf report, "village needs to
// be 144 fps"). Over the shoulder in the hall, from where the report stood, and on the square, at midnight and noon,
// the frame is drawn in each order: everything must be solid there, and no more than a few pixels may change (where
// two surfaces lie at one depth, the column's base on its block, the later one drawn wins either way). `canary` thins
// the hall's walls and columns and draws near to far all the same, which must change the frame (a ghost drawn before
// the wall behind it hides the wall).
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { holdHour } from '../../../src/game/clock';
import { groundHeight } from '../../../src/world/ground';
import { faceCamera, viewMode } from '../../../src/core/renderer';
import { HALL, TERRACE } from '../../../src/data/village';
import { blendedSolid, fadeWhole, holdBlendedOrder } from '../../../src/core/seeThrough';
import { drawFrame } from './light';
import { changedShare, viewBy } from './villageHallCull';
import { VILLAGE_SPOT } from './draws';
import type { LightsChecked } from './villageLights';

/** the hours read, the frames he's given to settle, and the most of the frame's pixels the order may change */
const HOURS = [0, 12];
const SETTLE = 30;
const MOST_CHANGED = 0.0005;
/** how far in from the hall's door he stands, turned to the dais (the camera trailing him in the doorway) */
const WALKED_IN = 4.6;
/** how much of the hall's walls and columns the canary thins, and which */
const CANARY_THINS = 0.5;
const CANARY_KINDS = ['hallColumn', 'hallBack', 'hallEast', 'hallWest', 'hallFront', 'hallBeam'] as const;

/** Where the hero stands for a reading: its name, and where and which way (rad: 0 is along +z). */
interface Stand { name: string; x: number; z: number; facing: number }

const STANDS: Stand[] = [
  { name: 'in the hall, turned to the dais', x: TERRACE.x, z: HALL.door - WALKED_IN, facing: Math.PI },
  { name: 'on the square', x: VILLAGE_SPOT[0], z: VILLAGE_SPOT[1], facing: Math.PI },
];

/** The hero stood at `stand`, over the shoulder, let settle. */
async function standAt(lab: Lab, stand: Stand): Promise<void> {
  const at = new THREE.Vector3(stand.x, 0, stand.z);
  at.y = groundHeight(at.x, at.z);
  G.player.walkTo = null;
  G.player.place(at, stand.facing);
  await viewBy(lab, 'third');
  faceCamera(stand.facing);
  await lab.step(SETTLE);
}

/** The share of the pixels the near-to-far order changes against back to front, drawn now, and whether what blends was
 *  all solid as the near-to-far frame was sorted. The canary thins the hall's walls and columns and holds near to far. */
function orderChanges(lab: Lab, canary: boolean): { changed: number; solid: boolean } {
  if (canary) for (const kind of CANARY_KINDS) fadeWhole(kind, CANARY_THINS);
  try {
    holdBlendedOrder('backToFront');
    const backToFront = drawFrame(lab);
    holdBlendedOrder(canary ? 'nearFirst' : 'asIs');
    const nearFirst = drawFrame(lab);
    const solid = blendedSolid();
    return { changed: changedShare(backToFront, nearFirst), solid };
  } finally {
    holdBlendedOrder('asIs');
    if (canary) for (const kind of CANARY_KINDS) fadeWhole(kind, 0);
  }
}

/** What thins by blending drawn near to far while all solid against back to front, from each stand, at each hour. */
export async function blendedNearFirst(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const view = viewMode();
  const lines: string[] = [];
  const problems: string[] = [];
  let caught = false;
  try {
    for (const stand of STANDS) {
      await standAt(lab, stand);
      const read: string[] = [];
      for (const hour of HOURS) {
        holdHour(hour);
        await lab.step(SETTLE);
        const { changed, solid } = orderChanges(lab, canary);
        read.push(`${hour}:00 ${(changed * 100).toFixed(3)}% of pixels changed${solid ? '' : ', something thinned'}`);
        if (changed > MOST_CHANGED) caught = true;
        if (canary) continue;
        const at = `blended near to far, ${stand.name}, at ${hour}:00`;
        // (the state it measures: all solid, or the near-to-far order never ran and nothing was compared)
        if (!solid) problems.push(`${at}: something that blends was thinned, so it was drawn back to front`);
        if (changed > MOST_CHANGED) problems.push(`${at}: the frame changed`);
      }
      lines.push(`blended near to far against back to front, ${stand.name}: ${read.join('; ')}`);
    }
  } finally {
    holdHour(null);
    await viewBy(lab, view);
  }
  return { lines, problems, caught: canary ? caught : null, moments: [] };
}
