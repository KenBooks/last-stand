// `lab village --only roofsFromAbove`: what's built as the top-down view shows it. From play: the hall's cut away with
// him inside "is good", "but this is not good, it needs to match the previous screenshot, logically" (stood behind the
// hall, a hole his own size in its roof), and "we should make roof semi-transparent in this case too, even if hero is
// not directly under it". Stood beside the hall with the camera turned each way: wherever the roof meets the line to
// him it's gone and its walls thinned; wherever it doesn't, every roof is a ghost alike. Stood behind a cottage: the
// frame opens wider than his own size. `canary` puts the hall's roof back whole as it's read, which must be found.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { HALL, TERRACE } from '../../../src/data/village';
import { CAMERA } from '../../../src/data/balance';
import { COTTAGES } from '../../../src/data/village';
import { orbitBy, viewMode } from '../../../src/core/renderer';
import {
  HALL_WALL_KINDS, fadeWhole, holdBuiltWhole, holdHoleOpening, ROOF_GHOST_ABOVE, wholeShare,
} from '../../../src/core/seeThrough';
import { groundHeight } from '../../../src/world/ground';
import { changedShare, viewBy } from './villageHallCull';
import { drawFrame } from './light';
import type { LightsChecked } from './villageLights';

/** how far outside the hall's wall he stands (m), the frames all is given to settle, and the camera's turns
 *  (radians) */
const OUT_OF_WALL = 1.2;
const SETTLE = 90;
const TURNS = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
/** the heights on him a line runs to: his feet, chest and head (m) */
const HEIGHTS_ON_HIM = [0.1, 0.3, 1.1, 1.8];
/** how far from the shares asked a fade may be read (they ease) */
const FADE_NEAR = 0.05;
/** the fewest walls' share thinned with the hall before him */
const WALLS_THINNED = 0.5;
/** how far past a cottage's middle he stands from the camera (m), and how many times his own hole's frame the cottage's
 *  must open */
const PAST_COTTAGE = 5.5;
const OPENS_AT_LEAST = 1;

/** Whether a line from the camera to the hero, at any of the heights on him, meets the hall's roof as drawn (m). */
function roofBeforeHim(): boolean {
  const from = G.camera.position;
  const roof = G.arena.village.hallCutaway[0];
  return HEIGHTS_ON_HIM.some((up) => {
    const point = new THREE.Vector3(G.player.pos.x, G.player.obj.position.y + up, G.player.pos.z);
    const way = point.sub(from);
    const ray = new THREE.Raycaster(from, way.clone().normalize(), 0, way.length());
    return ray.intersectObject(roof, true).length > 0;
  });
}

/** He stands at (x, z), let settle. */
async function standAt(lab: Lab, x: number, z: number): Promise<void> {
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), 0);
  await lab.step(SETTLE);
}

/** One spot beside the hall read from one way of the camera: its line, and any problem. */
function readHall(turn: number, canary: boolean): { line: string; hidden: boolean; problems: string[] } {
  const hidden = roofBeforeHim();
  if (canary && hidden) fadeWhole('hallRoof', 0);
  const roof = wholeShare('hallRoof');
  // (the walls thin one by one, as each hides him)
  const front = Math.max(...HALL_WALL_KINDS.map((kind) => wholeShare(kind)));
  const problems: string[] = [];
  const at = turn.toFixed(1);
  if (hidden && roof < 1 - FADE_NEAR) problems.push(`turned ${at}, the roof before him only ${roof.toFixed(2)} gone`);
  if (hidden && front < WALLS_THINNED) {
    problems.push(`turned ${at}, the walls before him only ${front.toFixed(2)} thin`);
  }
  if (!hidden && Math.abs(roof - ROOF_GHOST_ABOVE) > FADE_NEAR) {
    problems.push(`turned ${at}, hiding nothing, the roof at ${roof.toFixed(2)}, not its ghost`);
  }
  const line = `${at}: ${hidden ? 'before him' : 'clear'}, roof ${roof.toFixed(2)}, walls ${front.toFixed(2)}`;
  return { line, hidden, problems };
}

/** The share of the frame that what's built's hole opens, as it stands now. */
function frameOpened(lab: Lab): number {
  const open = drawFrame(lab).pixels.slice();
  const built = holdBuiltWhole(true, 0);
  const whole = drawFrame(lab).pixels;
  holdBuiltWhole(false, built);
  return lightChanged(open, whole);
}

/** How much light differs between two frames, a pixel's mean: a blended roof changes every pixel it covers a little, so
 *  a count of the pixels that changed says nothing of how far it opened. */
function lightChanged(one: ArrayLike<number>, other: ArrayLike<number>): number {
  let changed = 0;
  for (let pixel = 0; pixel < one.length; pixel += 4) {
    changed += Math.abs(one[pixel] - other[pixel]);
    changed += Math.abs(one[pixel + 1] - other[pixel + 1]);
    changed += Math.abs(one[pixel + 2] - other[pixel + 2]);
  }
  return changed / (one.length / 4);
}

/** Behind a cottage from the camera: what its hole opens of the frame wide, and at his own size. */
async function behindCottage(lab: Lab): Promise<{ wide: number; small: number; shot: Pictured }> {
  const cottage = COTTAGES[0];
  const sight = G.camera.getWorldDirection(new THREE.Vector3());
  const level = Math.hypot(sight.x, sight.z) || 1;
  const x = cottage.x + (sight.x / level) * PAST_COTTAGE;
  const z = cottage.z + (sight.z / level) * PAST_COTTAGE;
  await standAt(lab, x, z);
  const wide = frameOpened(lab);
  const shot = await lab.screen('behind a cottage, its roof and gables thinned', []);
  holdHoleOpening(0);
  await lab.step(1);
  const small = frameOpened(lab);
  holdHoleOpening(null);
  return { wide, small, shot };
}

/** The hall's roof and walls from every side of him, and a cottage's. */
export async function roofsFromAbove(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const kept = viewMode();
  await viewBy(lab, 'top');
  const said: string[] = [];
  const problems: string[] = [];
  let sawHidden = false;
  let sawClear = false;
  const x = TERRACE.x + HALL.half + OUT_OF_WALL;
  const z = (HALL.door + TERRACE.back) / 2;
  await standAt(lab, x, z);
  for (const turn of TURNS) {
    orbitBy(-turn / CAMERA.orbitSpeed);
    await lab.step(SETTLE);
    const read = readHall(turn, canary);
    said.push(read.line);
    problems.push(...read.problems);
    sawHidden ||= read.hidden;
    sawClear ||= !read.hidden;
    orbitBy(turn / CAMERA.orbitSpeed);
  }
  if (!sawHidden || !sawClear) problems.push(`beside the hall: hidden ${sawHidden}, clear ${sawClear}: not both seen`);
  await lab.step(SETTLE);
  const { wide, small, shot } = await behindCottage(lab);
  const planted = canary && problems.length > 0;
  if (!canary && wide < small * OPENS_AT_LEAST) {
    const opened = `${(wide * 100).toFixed(1)}% of the frame, at his own size ${(small * 100).toFixed(1)}%`;
    problems.push(`behind a cottage it opened ${opened}`);
  }
  await viewBy(lab, kept);
  const lines = [
    `the hall from above, he beside it: ${said.join('; ')}`,
    `behind a cottage, the frame opened: ${(wide * 100).toFixed(1)}% (his own size: ${(small * 100).toFixed(1)}%)`,
  ];
  return { lines, problems: canary ? [] : problems, caught: canary ? planted : null, moments: canary ? [] : [shot] };
}
