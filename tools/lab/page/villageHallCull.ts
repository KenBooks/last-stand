// `lab village`'s hall culled by its doorway: the hero in the hall of heroes turned to its door, the square beyond it,
// and the frame drawn with what stands outside culled by the doorway (`world/hallPortal.ts`) and without, at midnight
// and at noon: the scene's draws must fall and no pixel may change (from play, a perf report "looking at plaza from
// hall": 555 draws, the village drawn behind the hall's walls). `canary` culls all outside, the doorway or not,
// which must change the frame.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { holdHour } from '../../../src/game/clock';
import { groundHeight } from '../../../src/world/ground';
import { faceCamera, viewMode, type ViewMode } from '../../../src/core/renderer';
import { HALL, TERRACE } from '../../../src/data/village';
import { setHallCull } from '../../../src/world/hallPortal';
import { drawFrame, type Canvas } from './light';
import type { LightsChecked } from './villageLights';

/** how far in from the door the hero stands (m), the hours read, and the frames he's given to settle */
const IN_FROM = 7;
const HOURS = [0, 12];
const SETTLE = 30;
/** the most presses of V to come round to a view (top, over the shoulder, through the eyes) */
const VIEWS = 3;
/** how far a channel may move and still be the same (a byte's step: the frames are drawn alike) */
const SAME = 1.5 / 255;
/** the most of the frame's pixels the cull may change */
const MOST_CHANGED = 0.0005;

/** A frame drawn by the game's camera: its pixels, and the scene's draws in it (those by the game's camera). */
interface Counted { canvas: Canvas; draws: number }

/** The frame drawn now, its scene's draws counted. */
function countedFrame(lab: Lab): Counted {
  const renderer = G.renderer;
  const own = renderer.renderBufferDirect.bind(renderer);
  let draws = 0;
  renderer.renderBufferDirect = (camera, scene, geometry, material, object, group) => {
    if (camera === G.camera) draws++;
    own(camera, scene, geometry, material, object, group);
  };
  try {
    return { canvas: drawFrame(lab), draws };
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

/** One hour's frames culled (or, the canary, culled whole) and not: their draws, and the share of pixels changed. */
async function readHour(lab: Lab, hour: number, canary: boolean): Promise<{ culled: number; whole: number;
  changed: number }> {
  holdHour(hour);
  await lab.step(SETTLE);
  setHallCull(canary ? 'all' : 'door');
  const culled = countedFrame(lab);
  setHallCull('off');
  const whole = countedFrame(lab);
  setHallCull('door');
  return { culled: culled.draws, whole: whole.draws, changed: changedShare(culled.canvas, whole.canvas) };
}

/** The frame out of the hall's door culled by the doorway against drawn whole, at midnight and noon. */
export async function hallCulledByDoor(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const view = viewMode();
  await inHallLookingOut(lab);
  const read: string[] = [];
  const problems: string[] = [];
  let changedAny = false;
  try {
    for (const hour of HOURS) {
      const { culled, whole, changed } = await readHour(lab, hour, canary);
      read.push(`${hour}:00 ${whole} -> ${culled} draws, ${(changed * 100).toFixed(3)}% of pixels changed`);
      if (changed > MOST_CHANGED) changedAny = true;
      if (canary) continue;
      if (culled >= whole) problems.push(`hall culled by its door: at ${hour}:00 no draw was culled`);
      if (changed > MOST_CHANGED) problems.push(`hall culled by its door: at ${hour}:00 the frame changed`);
    }
  } finally {
    setHallCull('door');
    holdHour(null);
    await viewBy(lab, view);
  }
  const line = `hall culled by its door (looking out of it, the scene's draws whole -> culled): ${read.join('; ')}`;
  return { lines: [line], problems, caught: canary ? changedAny : null, moments: [] };
}
