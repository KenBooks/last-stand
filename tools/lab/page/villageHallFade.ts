// `lab village`'s hall's front wall as the hero walks under it, seen from above (from play, "why here geometry
// disappears (walls and doors)? it should fade to semi transparent"): a ghost of it must stay in the frame, by the
// frame with it hidden against with it whole, and it must thin over a moment rather than at a stroke; over the shoulder
// it stays whole (from play, "still seeing through walls from inside"). `canary` hides it at once, as it was.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { holdHour } from '../../../src/game/clock';
import { faceCamera, viewMode } from '../../../src/core/renderer';
import { fadeWhole, wholeShare } from '../../../src/core/seeThrough';
import { HALL, TERRACE } from '../../../src/data/village';
import { groundHeight } from '../../../src/world/ground';
import { drawFrame } from './light';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** where he stands, in from the door (m), and out on the square (m), and the frames given to settle */
const IN_FROM = 1.8;
const OUTSIDE = 12;
const SETTLE = 90;
/** the frames read as he's stepped in; the hour it's read at */
const FRAMES = 40;
const HOUR = 12;
/** the most the wall may thin in one frame, and the least (and most) of it to stay as a ghost */
const MOST_A_FRAME = 0.15;
const GHOST_LEAST = 0.05;
const GHOST_MOST = 0.9;

/** How much light the front wall changes in the frame now, against the frame with it hidden: a sum over its pixels,
 *  as a blended ghost changes every pixel it covers a little, where a pattern changed a share of them. */
function wallsShare(lab: Lab, front: THREE.Object3D): number {
  const drawn = drawFrame(lab).pixels.slice();
  front.visible = false;
  const without = drawFrame(lab).pixels;
  front.visible = true;
  let changed = 0;
  for (let pixel = 0; pixel < drawn.length; pixel += 4) {
    changed += Math.abs(drawn[pixel] - without[pixel]);
    changed += Math.abs(drawn[pixel + 1] - without[pixel + 1]);
    changed += Math.abs(drawn[pixel + 2] - without[pixel + 2]);
  }
  return changed / (drawn.length / 4);
}

/** The hero put at (x, z), turned into the hall (\`facing\` π is along -z, in through the door). */
function standAt(z: number): void {
  const x = TERRACE.x;
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), Math.PI);
  faceCamera(Math.PI);
}

/** The most the wall thins in a frame as he's stepped in. */
async function sharpestStep(lab: Lab): Promise<number> {
  let last = wholeShare('hallFront');
  let sharpest = 0;
  await lab.step(FRAMES, undefined, () => {
    const now = wholeShare('hallFront');
    sharpest = Math.max(sharpest, Math.abs(now - last));
    last = now;
  });
  return sharpest;
}

/** The wall thins over a moment as he steps in, and stays a ghost; over the shoulder it's whole. */
export async function hallFrontFades(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const view = viewMode();
  const front = G.arena.village?.hallCutaway[1];
  if (!front) throw new Error('lab: village: no front wall to read');
  holdHour(HOUR);
  try {
    await viewBy(lab, 'third');
    standAt(HALL.door - IN_FROM);
    await lab.step(SETTLE);
    const overShoulder = wholeShare('hallFront');
    await viewBy(lab, 'top');
    standAt(HALL.door + OUTSIDE);
    await lab.step(SETTLE);
    standAt(HALL.door - IN_FROM);
    const sharpest = await sharpestStep(lab);
    await lab.step(SETTLE);
    const ghost = canary ? 0 : wallsShare(lab, front);
    const thinned = wholeShare('hallFront');
    fadeWhole('hallFront', 0);
    const whole = wallsShare(lab, front);
    fadeWhole('hallFront', thinned);
    if (whole <= 0) throw new Error('lab: village: the front wall isn\'t in the frame from above');
    const left = ghost / whole;
    const gone = !(left >= GHOST_LEAST && left <= GHOST_MOST);
    const line = `the hall's front wall from above: ${(left * 100).toFixed(0)}% of its light left as a ghost, `
      + `thinned by at most ${(sharpest * 100).toFixed(0)}% `
      + `in a frame; over the shoulder thinned ${(overShoulder * 100).toFixed(0)}%`;
    if (canary) return { lines: [line], problems: [], caught: gone, moments: [] };
    const problems = gone || sharpest > MOST_A_FRAME || overShoulder > 0 ? [line] : [];
    const shot = await lab.screen('stepped in, from above', [`${(left * 100).toFixed(0)}% of the wall left`]);
    return { lines: [line], problems, caught: null, moments: [shot] };
  } finally {
    front.visible = true;
    holdHour(null);
    await viewBy(lab, view);
  }
}
