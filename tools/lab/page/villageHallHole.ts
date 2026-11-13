// `lab village`'s view round the hero in the hall of heroes, from above, a column between him and the camera (from
// play, "need to show around him more, to give scene context, not just hero by itself", "you keep ignoring this
// request": he showed through a hole his own size, with nothing of the room round him). The frame as the game thins
// what stands before him is drawn against everything held whole: it must open far more than his own size, and leave
// the floor before him whole, which came apart as what dissolves was held at the village's ground, under the terrace.
// `canary` leaves only a hole his own size.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { faceCamera, viewMode } from '../../../src/core/renderer';
import { fadeWhole, holdPropHole, wholeShare, type FadesWhole } from '../../../src/core/seeThrough';
import { holdHour } from '../../../src/game/clock';
import { HALL, TERRACE } from '../../../src/data/village';
import { groundHeight } from '../../../src/world/ground';
import { drawFrame, type Canvas } from './light';
import { changedShare, viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** how far behind the column he stands (m), the column he's behind, the frames he's given to settle, and the hour */
const BEHIND = 1.2;
const COLUMN = 1;
const SETTLE = 90;
const HOUR = 12;
/** how far before the dais he stands turned to the door (m) */
const FROM_DAIS = 1;
/** the least of the frame opened, and the most of the floor before him it may change */
const LEAST_OPEN = 0.1;
const MOST_FLOOR = 0.01;
/** how far before his feet and how far aside of them, down the hall's aisle, the floor's patch lies (m: off the
 *  column, which stands before him), and its half size on screen (px) */
const FLOOR_AHEAD = 0.5;
const FLOOR_ASIDE = 1.6;
const PATCH = 12;
/** how far a channel may move and still be the same */
const SAME = 1.5 / 255;
/** what thins whole */
const KINDS: FadesWhole[] = ['hallFront', 'hallRoof', 'hallColumn'];

/** The share of a patch of the frame round the floor before him, aside of the column, whose light moved between `open`
 *  and `shut`. */
function floorChanged(open: Canvas, shut: Canvas): number {
  const { pos } = G.player;
  const toCamera = new THREE.Vector3().subVectors(G.camera.position, pos).setY(0).normalize();
  const floor = pos.clone().addScaledVector(toCamera, FLOOR_AHEAD);
  floor.x -= FLOOR_ASIDE;
  floor.setY(G.player.obj.position.y).project(G.camera);
  const middleX = Math.round(((floor.x + 1) / 2) * open.width);
  const middleY = Math.round(((floor.y + 1) / 2) * open.height);
  let changed = 0;
  let counted = 0;
  for (let y = middleY - PATCH; y <= middleY + PATCH; y++) {
    for (let x = middleX - PATCH; x <= middleX + PATCH; x++) {
      const at = (y * open.width + x) * 4;
      const moved = Math.max(
        Math.abs(open.pixels[at] - shut.pixels[at]),
        Math.abs(open.pixels[at + 1] - shut.pixels[at + 1]),
        Math.abs(open.pixels[at + 2] - shut.pixels[at + 2]),
      );
      counted++;
      if (moved > SAME) changed++;
    }
  }
  return changed / counted;
}

/** The frame drawn with all that thins whole held whole, its props' hole `shut` or not. */
function drawnWhole(lab: Lab, shut: boolean): Canvas {
  const thinned = KINDS.map((kind) => wholeShare(kind));
  for (const kind of KINDS) fadeWhole(kind, 0);
  holdPropHole(shut);
  const canvas = drawFrame(lab);
  holdPropHole(false);
  KINDS.forEach((kind, k) => fadeWhole(kind, thinned[k]));
  return canvas;
}

/** The hero stood in the hall at (x, z), the camera behind him from above, let settle. */
async function standIn(lab: Lab, x: number, z: number, facing: number): Promise<void> {
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), facing);
  faceCamera(facing);
  await lab.step(SETTLE);
}

/** The room shows round him from above, a column before him, and the floor before him stays whole. */
export async function hallHoleOpens(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const view = viewMode();
  holdHour(HOUR);
  try {
    await viewBy(lab, 'top');
    const x = TERRACE.x + HALL.columnX;
    const z = HALL.columnZ[COLUMN] - BEHIND;
    await standIn(lab, TERRACE.x, HALL.daisZ + FROM_DAIS, 0);
    const toTheDoor = await lab.screen('turned to the door, from above', ['the back wall before him']);
    await standIn(lab, x, z, Math.PI);
    const open = canary ? drawnWhole(lab, false) : drawFrame(lab);
    const shot = await lab.screen('behind a column, from above', ['as the game thins it']);
    const shut = drawnWhole(lab, true);
    const opened = changedShare(open, shut);
    // (the hole alone: over it the roof, thinned as it should be, changes it too)
    const floor = floorChanged(drawnWhole(lab, false), shut);
    const line = `behind a hall column from above: ${(opened * 100).toFixed(1)}% of the frame opened (at least `
      + `${LEAST_OPEN * 100}%), ${(floor * 100).toFixed(1)}% of the floor before him `
      + `(at most ${MOST_FLOOR * 100}%)`;
    const small = opened < LEAST_OPEN;
    if (canary) return { lines: [line], problems: [], caught: small, moments: [] };
    const problems = small || floor > MOST_FLOOR ? [line] : [];
    return { lines: [line], problems, caught: null, moments: [shot, toTheDoor] };
  } finally {
    holdHour(null);
    await viewBy(lab, view);
  }
}
