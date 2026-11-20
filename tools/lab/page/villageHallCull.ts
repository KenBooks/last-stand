// `lab village`'s hall culled by its doorway: the hero in the hall of heroes turned to its door, the square beyond it,
// and the frame drawn with what stands outside culled by the doorway (`world/hallPortal.ts`) and without, at midnight
// and at noon: the scene's draws must fall and no pixel may change (from play, a perf report "looking at plaza from
// hall": 555 draws, the village drawn behind the hall's walls). Then walked in, turned to the dais, the camera
// trailing him in the doorway's opening: the same (a perf report "village needs to be 144 fps": from there nothing
// was culled, the grass behind the walls 35 ms of the 4080's scene pass at 20.7 Mpx). `canary` culls all outside,
// the doorway or not, which must change the frame.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { holdHour } from '../../../src/game/clock';
import { groundHeight } from '../../../src/world/ground';
import { faceCamera, viewMode, type ViewMode } from '../../../src/core/renderer';
import { HALL, TERRACE } from '../../../src/data/village';
import { setHallCull } from '../../../src/world/hallPortal';
import * as meadow from '../../../src/world/meadow';
import { drawFrame, type Canvas } from './light';
import { grassVertices } from './grassCount';
import type { LightsChecked } from './villageLights';

/** how far in from the door the hero stands (m), looking out of it and walked in, turned to the dais (the camera
 *  trailing him in the doorway), the hours read, and the frames he's given to settle */
const IN_FROM = 7;
const WALKED_IN = 4.6;
/** the fewest triangles the doorway must cull walked in, the grass's aside: the trees behind the walls are 61k */
const TREES_CULLED = 20_000;
const HOURS = [0, 12];
const SETTLE = 30;
/** the most presses of V to come round to a view (top, over the shoulder, through the eyes) */
const VIEWS = 3;
/** how far a channel may move and still be the same (a byte's step: the frames are drawn alike) */
const SAME = 1.5 / 255;
/** the most of the frame's pixels the cull may change */
const MOST_CHANGED = 0.0005;

/** A frame drawn by the game's camera: its pixels, and the scene's draws in it (those by the game's camera) and the
 *  triangles they drew. */
interface Counted { canvas: Canvas; draws: number; triangles: number }

/** The triangles a draw of `geometry` by `object` draws: its range's, times an instanced mesh's instances (the
 *  grass's, an instanced geometry, is counted by its vertices apart: `grassVertices`). */
function trianglesOf(geometry: THREE.BufferGeometry, object: THREE.Object3D): number {
  const indices = geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0;
  const ranged = Math.min(indices, geometry.drawRange.count);
  const instanced = object as THREE.InstancedMesh;
  const instances = instanced.isInstancedMesh ? instanced.count : 1;
  return Math.floor(ranged / 3) * instances;
}

/** The frame drawn now, its scene's draws and their triangles counted. */
function countedFrame(lab: Lab): Counted {
  const renderer = G.renderer;
  const own = renderer.renderBufferDirect.bind(renderer);
  let draws = 0;
  let triangles = 0;
  renderer.renderBufferDirect = (camera, scene, geometry, material, object, group) => {
    if (camera === G.camera) {
      draws++;
      triangles += trianglesOf(geometry, object);
    }
    own(camera, scene, geometry, material, object, group);
  };
  try {
    return { canvas: drawFrame(lab), draws, triangles };
  } finally {
    renderer.renderBufferDirect = own;
  }
}

/** The share of the pixels whose light moved between `a` and `b`. */
export function changedShare(a: Canvas, b: Canvas): number {
  let changed = 0;
  for (let at = 0; at < a.pixels.length; at += 4) {
    const red = Math.abs(a.pixels[at] - b.pixels[at]);
    const green = Math.abs(a.pixels[at + 1] - b.pixels[at + 1]);
    const blue = Math.abs(a.pixels[at + 2] - b.pixels[at + 2]);
    if (Math.max(red, green, blue) > SAME) changed++;
  }
  return changed / (a.pixels.length / 4);
}

/** V pressed (a frame held: held every frame, each would be a press) until the view is `view`, let settle. */
export async function viewBy(lab: Lab, view: ViewMode): Promise<void> {
  for (let press = 0; press < VIEWS && viewMode() !== view; press++) {
    await lab.step(1, () => ({ keys: ['v'] }));
    await lab.step(1);
  }
  if (viewMode() !== view) {
    const open = [...document.querySelectorAll('.show, .open')].map((element) => element.id).filter(Boolean).join();
    const stuck = `at ${viewMode()}, open: ${open || 'nothing'}`;
    throw new Error(`lab: village: V never came round to the ${view} view, ${stuck}`);
  }
  await lab.step(SETTLE);
}

/** The hero in the hall, turned to its door with the camera over his shoulder behind him, let settle (from above,
 *  its roof is cut away and nothing is culled; the village's top view is its panels', so it's V that leaves it). */
async function inHallLookingOut(lab: Lab): Promise<void> {
  const at = new THREE.Vector3(TERRACE.x, 0, HALL.door - IN_FROM);
  at.y = groundHeight(at.x, at.z);
  G.player.walkTo = null;
  // (facing 0 is along +z, out of the door)
  G.player.place(at, 0);
  await viewBy(lab, 'third');
  faceCamera(0);
  await lab.step(SETTLE);
}

/** The hero walked in, turned to the dais, the camera over his shoulder behind him in the doorway's opening, let
 *  settle (where a perf report stood him: -1.7,-19.3 facing 181 degrees). */
async function inHallFromDoorway(lab: Lab): Promise<void> {
  const at = new THREE.Vector3(TERRACE.x, 0, HALL.door - WALKED_IN);
  at.y = groundHeight(at.x, at.z);
  G.player.walkTo = null;
  G.player.place(at, Math.PI);
  await viewBy(lab, 'third');
  faceCamera(Math.PI);
  await lab.step(SETTLE);
}

/** Whether the game's camera stands in the doorway's opening, through the front wall's thickness. */
function cameraInDoorway(): boolean {
  const eye = G.camera.position;
  const across = Math.abs(eye.x - TERRACE.x) < HALL.doorHalf;
  return across && eye.z > HALL.inFront && eye.z < HALL.door;
}

/** Where the hero stands for a reading: its name, how he's stood there, and whether the doorway shows grass (where
 *  it doesn't, what's culled is the grass behind the walls: the parts out there are past the camera's view already,
 *  and the grass is culled by its tiles, its draws as many). */
interface Stand { name: string; place: (lab: Lab) => Promise<void>; seesGrass: boolean }

const STANDS: Stand[] = [
  { name: 'looking out of it', place: inHallLookingOut, seesGrass: true },
  { name: 'walked in, the camera in the doorway', place: inHallFromDoorway, seesGrass: false },
];

/** The grass hidden from an eye within an occluder, as it was (a commit from before it has no such hold: an A/B's
 *  other side loads this module too, and a name it lacks would stop every command loading there). */
function holdEyeWithinOccluders(held: boolean): void {
  const hold = (meadow as { holdEyeWithinOccluders?: (held: boolean) => void }).holdEyeWithinOccluders;
  hold?.(held);
}

/** One hour's frames culled (or, the canary, culled whole) and not: their draws, the share of pixels changed, and
 *  the grass's vertices drawn in each. */
async function readHour(lab: Lab, hour: number, canary: boolean): Promise<{ culled: number; whole: number;
  changed: number; grass: number; grassWhole: number; triangles: number; trianglesWhole: number }> {
  holdHour(hour);
  await lab.step(SETTLE);
  setHallCull(canary ? 'all' : 'door');
  const culled = countedFrame(lab);
  const grass = grassVertices();
  setHallCull('off');
  const whole = countedFrame(lab);
  const grassWhole = grassVertices();
  setHallCull('door');
  const changed = changedShare(culled.canvas, whole.canvas);
  return {
    culled: culled.draws, whole: whole.draws, changed, grass, grassWhole,
    triangles: culled.triangles, trianglesWhole: whole.triangles,
  };
}

/** `count` in thousands, as a reading says it. */
const thousands = (count: number): string => `${Math.round(count / 1000)}k`;

/** What one stand's readings found: its line, its problems, and whether the canary's plant showed. */
interface StandRead { line: string; problems: string[]; changedAny: boolean; grassGone: boolean }

/** One stand's frames culled by the doorway against drawn whole, at midnight and noon. */
async function readStand(lab: Lab, stand: Stand, canary: boolean): Promise<StandRead> {
  await stand.place(lab);
  const read: string[] = [];
  const problems: string[] = [];
  let changedAny = false;
  let grassGone = false;
  const at = `hall culled by its door, ${stand.name}`;
  // (walked in, the camera must be where the report had it, or this reads a frame the cull always took)
  if (!stand.seesGrass && !cameraInDoorway()) problems.push(`${at}: the camera isn't in the doorway`);
  for (const hour of HOURS) {
    const { culled, whole, changed, grass, grassWhole, triangles, trianglesWhole } = await readHour(lab, hour, canary);
    read.push(`${hour}:00 ${whole} -> ${culled} draws, ${(changed * 100).toFixed(3)}% of pixels changed, `
      + `${grassWhole} -> ${grass} of the grass's vertices, ${thousands(trianglesWhole)} -> ${thousands(triangles)}`
      + ' triangles');
    if (grass === 0) grassGone = true;
    if (changed > MOST_CHANGED) changedAny = true;
    if (canary) continue;
    if (stand.seesGrass && culled >= whole) problems.push(`${at}: at ${hour}:00 no draw was culled`);
    // (half of it at least: the tiles meeting the hall's box are kept, as what's merged spans the village)
    // (and the trees round the village, instanced, culled by their cells: `hideCellsWhere` in `culling.ts`)
    if (!stand.seesGrass && trianglesWhole - triangles < TREES_CULLED) {
      problems.push(`${at}: at ${hour}:00 the trees behind the hall's walls were drawn (${thousands(triangles)} of `
        + `${thousands(trianglesWhole)} triangles)`);
    }
    if (!stand.seesGrass && grass > grassWhole / 2) {
      problems.push(`${at}: at ${hour}:00 the grass behind the hall's walls was drawn (${grass} of ${grassWhole})`);
    }
    if (changed > MOST_CHANGED) problems.push(`${at}: at ${hour}:00 the frame changed`);
    // (from play, "grass is gone, from here, or anywhere in hall of heroes": the camera within the hall's own
    // occluder, every tile of the meadow was hidden behind it)
    if (stand.seesGrass && grass === 0) problems.push(`${at}: at ${hour}:00 no grass is drawn out of the door`);
  }
  const line = `${at} (the scene's draws whole -> culled): ${read.join('; ')}`;
  return { line, problems, changedAny, grassGone };
}

/** The frame in the hall culled by the doorway against drawn whole, from each stand, at midnight and noon. */
export async function hallCulledByDoor(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const view = viewMode();
  const reads: StandRead[] = [];
  holdEyeWithinOccluders(canary);
  try {
    for (const stand of STANDS) reads.push(await readStand(lab, stand, canary));
  } finally {
    holdEyeWithinOccluders(false);
    setHallCull('door');
    holdHour(null);
    await viewBy(lab, view);
  }
  const lines = reads.map((read) => read.line);
  const problems = reads.flatMap((read) => read.problems);
  const caught = canary ? reads[0].changedAny && reads[0].grassGone : null;
  return { lines, problems, caught, moments: [] };
}
