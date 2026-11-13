// `lab village`'s face by a light at midnight (from play, "when standing near portal, blinding light on face",
// "blinding light from street light"): the hero stood before each portal, at its stand and half way to its sheet, and
// under the street lamps, the frame over the shoulder drawn and the blown-out share of the pixels round his head read. A gate's
// light stood at head height, a hand's breadth from a face, and a lamp's over his head fell by the square of a short
// way. `canary` puts the nearest light by his head, unsoftened, which must be found.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { holdHour } from '../../../src/game/clock';
import { faceCamera } from '../../../src/core/renderer';
import { groundHeight } from '../../../src/world/ground';
import { VILLAGE_OBJECTS } from '../../../src/data/village';
import { pooledLights } from '../../../src/fx/lights';
import { drawFrame, type Canvas } from './light';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** the frames given for him to settle, half the box read round his head (px), a pixel blown out past this light in any
 *  channel, the most of the box that may be, and how many lamps are stood under */
const SETTLE = 30;
const HALF_BOX = 16;
const BLOWN = 0.92;
const MOST_BLOWN = 0.05;
const LAMPS_READ = 3;
/** his head's height (m), how far off a lamp's foot he stands (m), and the canary's light: how far off his head,
 *  how bright */
const HEAD = 1.7;
const UNDER_OFF = 0.5;
const CANARY_OFF = 0.3;
const CANARY_BRIGHT = 30;

/** One place he stands to be read. */
interface Stand {
  name: string;
  x: number;
  z: number;
  facing: number;
}

/** The share of the pixels round the screen's point (x, y from the canvas's bottom row) blown out. */
function blownRound(canvas: Canvas, x: number, y: number): number {
  let blown = 0;
  let counted = 0;
  for (let row = Math.floor(y - HALF_BOX); row <= y + HALF_BOX; row++) {
    for (let column = Math.floor(x - HALF_BOX); column <= x + HALF_BOX; column++) {
      if (row < 0 || column < 0 || row >= canvas.height || column >= canvas.width) continue;
      const i = (row * canvas.width + column) * 4;
      counted++;
      if (Math.max(canvas.pixels[i], canvas.pixels[i + 1], canvas.pixels[i + 2]) > BLOWN) blown++;
    }
  }
  return blown / Math.max(1, counted);
}

/** The blown-out share round his head, stood at `stand` with the camera looking along his way. */
async function blownAt(lab: Lab, stand: Stand, canary: boolean): Promise<number> {
  const ground = groundHeight(stand.x, stand.z);
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(stand.x, ground, stand.z), stand.facing);
  faceCamera(stand.facing);
  await lab.step(SETTLE);
  const planted = canary ? pooledLights()[0] : null;
  if (planted) {
    planted.position.set(stand.x + CANARY_OFF, ground + HEAD, stand.z);
    planted.intensity = CANARY_BRIGHT;
    planted.distance = 10;
    planted.decay = 2;
  }
  const canvas = drawFrame(lab);
  if (planted) planted.intensity = 0;
  const head = new THREE.Vector3(stand.x, ground + HEAD, stand.z).project(G.camera);
  return blownRound(canvas, (head.x + 1) / 2 * canvas.width, (head.y + 1) / 2 * canvas.height);
}

/** Where he's read: before each portal, and beside the first street lamps. */
function standsRead(): Stand[] {
  const stands: Stand[] = [];
  for (const portal of VILLAGE_OBJECTS.filter((object) => object.use === 'portal')) {
    const [fromX, fromZ] = portal.stand;
    const [atX, atZ] = portal.at;
    const facing = Math.atan2(atX - fromX, atZ - fromZ);
    stands.push({ name: `the ${portal.id} portal's stand`, x: fromX, z: fromZ, facing });
    stands.push({ name: `half way to the ${portal.id} portal`, x: (fromX + atX) / 2, z: (fromZ + atZ) / 2, facing });
  }
  for (const [i, lamp] of G.arena.village.lanterns.slice(0, LAMPS_READ).entries()) {
    stands.push({ name: `street lamp ${i + 1}`, x: lamp.x + UNDER_OFF, z: lamp.z, facing: Math.PI / 2 });
  }
  return stands;
}

/** No light blows his face out as he stands by it. */
export async function heroFaceNotBlinding(lab: Lab, canary: boolean): Promise<LightsChecked> {
  holdHour(0);
  await viewBy(lab, 'third');
  const lines: string[] = [];
  let worst = 0;
  try {
    for (const stand of standsRead()) {
      const share = await blownAt(lab, stand, canary);
      worst = Math.max(worst, share);
      lines.push(`round his head at ${stand.name}: ${(share * 100).toFixed(1)}% blown out`);
    }
  } finally {
    holdHour(null);
    await viewBy(lab, 'top');
  }
  const seen = worst > MOST_BLOWN;
  if (canary) return { lines, problems: [], caught: seen, moments: [] };
  return { lines, problems: seen ? [`a face blown out: ${lines.join('; ')}`] : [], caught: null, moments: [] };
}
