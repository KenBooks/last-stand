// `lab village --only columnsNotCut` (#948, from play: "thin columns"): in the hall of heroes over the shoulder the
// camera stands a hand from a column of the row behind him, and the near plane at 0.5 m cut away all of the column
// facing it but its two edges, a thin pale sliver from top to bottom of the screen, its ghost cut away with it. At
// stands down the hall's aisle and on its portico, turned across them and along them, the frame as the game draws it
// is read against the same frame with its near plane brought in to a few centimetres: what differs is what the near
// plane cut away of what's drawn, which must be next to nothing (a column whole, a ghost or gone, never its edges
// alone). `--canary` leaves the near plane at 0.5 m by what stands free, as it was (`farNearAtWalls`).
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { faceCamera, farNearAtWalls, setZoom, viewMode } from '../../../src/core/renderer';
import { holdHour } from '../../../src/game/clock';
import { CAMERA } from '../../../src/data/balance';
import { HALL, TERRACE } from '../../../src/data/village';
import { groundHeight } from '../../../src/world/ground';
import { drawFrame } from './light';
import { changedShare, viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** A stand: where he stands, the way he faces (rad, as `place` takes it), and its name. */
interface Stand { name: string; x: number; z: number; facing: number }

/** the hour (the play report's, midnight) and the frames each stand is given to settle (the boom springs out) */
const HOUR = 0;
const SETTLE = 40;
/** the near plane the frame is read against (m): nearer than anything the camera may stand from */
const NEAR_NOTHING = 0.03;
/** the most of the frame the near plane may cut away of what's drawn: none, but for the edges of what it rounds off */
const MOST_CUT = 0.002;
/** how many of the stands cut the most are pictured */
const PICTURES = 3;
/** the ways he faces at each stand down the aisle: across it either way, and on the diagonals toward the door */
const TURNS = [Math.PI / 2, -Math.PI / 2, Math.PI / 4, -Math.PI / 4];
/** how far either side of the aisle's middle he stands (m) */
const ASIDE = [-0.6, 0, 0.6];

/** The play report's stand (`lab rust --village --view third --at=-1.6,-24 --hour 0 --turned 90`), and stands down
 *  the aisle by each pair of the room's columns, and along the portico. */
function stands(): Stand[] {
  const found: Stand[] = [{ name: 'the play report\'s', x: -1.6, z: -24, facing: -Math.PI / 2 }];
  for (const z of HALL.columnZ) {
    for (const aside of ASIDE) {
      for (const facing of TURNS) {
        const x = TERRACE.x + aside;
        found.push({ name: `aisle ${x.toFixed(1)}, ${z}, facing ${facing.toFixed(2)}`, x, z, facing });
      }
    }
  }
  const porticoZ = (HALL.door + TERRACE.front) / 2;
  for (const facing of [Math.PI / 2, -Math.PI / 2]) {
    for (const x of [TERRACE.x - 3, TERRACE.x + 3]) {
      found.push({ name: `portico ${x.toFixed(1)}, facing ${facing.toFixed(2)}`, x, z: porticoZ, facing });
    }
  }
  return found;
}

/** The hero put at `stand`, the camera behind him at the lobby's zoom, let settle. */
async function standAt(lab: Lab, stand: Stand): Promise<void> {
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(stand.x, groundHeight(stand.x, stand.z), stand.z), stand.facing);
  setZoom(CAMERA.lobbyZoom);
  faceCamera(stand.facing);
  await lab.step(SETTLE);
}

/** The share of the frame the near plane cuts away of what's drawn: the frame against it with the plane brought in. */
function cutShare(lab: Lab): number {
  const camera = G.camera;
  const near = camera.near;
  const drawn = drawFrame(lab);
  camera.near = NEAR_NOTHING;
  camera.updateProjectionMatrix();
  const whole = drawFrame(lab);
  camera.near = near;
  camera.updateProjectionMatrix();
  return changedShare(drawn, whole);
}

/** What one stand read: what was cut away, the near plane and where the camera stood. */
interface StandRead { stand: Stand; cut: number; near: number; eye: THREE.Vector3 }

/** Every stand read in turn. */
async function readStands(lab: Lab): Promise<StandRead[]> {
  const reads: StandRead[] = [];
  for (const stand of stands()) {
    await standAt(lab, stand);
    reads.push({ stand, cut: cutShare(lab), near: G.camera.near, eye: G.camera.position.clone() });
  }
  return reads;
}

/** A stand's read as a line. */
function said(read: StandRead): string {
  const eye = `${read.eye.x.toFixed(2)}, ${read.eye.z.toFixed(2)}`;
  return `${read.stand.name}: ${(read.cut * 100).toFixed(2)}% cut away, the camera at ${eye}, `
    + `the near plane at ${read.near.toFixed(2)} m`;
}

/** The stands that cut the most, pictured as the player sees them. */
async function pictureWorst(lab: Lab, worst: StandRead[]): Promise<Pictured[]> {
  const moments: Pictured[] = [];
  for (const read of worst.slice(0, PICTURES)) {
    await standAt(lab, read.stand);
    moments.push(await lab.screen(`near plane at ${read.stand.name}`, [said(read)]));
  }
  return moments;
}

/** No column is cut by the near plane over the shoulder in the hall or on its portico. */
export async function columnsNotCut(lab: Lab, canary: boolean): Promise<LightsChecked> {
  holdHour(HOUR);
  const kept = viewMode();
  try {
    await viewBy(lab, 'third');
    farNearAtWalls(canary);
    const reads = await readStands(lab);
    const worst = [...reads].sort((a, b) => b.cut - a.cut);
    const failed = reads.filter((read) => read.cut > MOST_CUT);
    const line = `the near plane over the shoulder at ${reads.length} stands in the hall and on its portico: at most `
      + `${(worst[0].cut * 100).toFixed(2)}% of the frame cut away (${worst[0].stand.name}; at most `
      + `${(MOST_CUT * 100).toFixed(1)}%), ${failed.length} cut more`;
    const lines = [line, ...worst.slice(0, PICTURES).map((read) => `  ${said(read)}`)];
    if (canary) return { lines, problems: [], caught: failed.length > 0, moments: [] };
    const moments = await pictureWorst(lab, worst);
    return { lines, problems: failed.length ? [line] : [], caught: null, moments };
  } finally {
    farNearAtWalls(false);
    holdHour(null);
    await viewBy(lab, kept);
  }
}
