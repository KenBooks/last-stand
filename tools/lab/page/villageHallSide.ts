// `lab village`'s hall of heroes walked up to on its terrace: the hero walks straight at its side walls and its front
// wall beside the door until they stop him, and a ray at a knee's height from where he set off reads the first surface
// drawn ahead of him: his middle must stand off it (from play, "can pass through textures here": the plinth course
// along the hall's foot, 35 cm out from its walls, was drawn and not in the wall, and he walked into it). He walks
// straight, the walk's routing off: found, his way to a spot past a wall went round by the door, and the gaps read
// where he ended inside, the front wall cut away over him, and never a wall he was stopped by. `canary` reads each gap
// as if he'd gone half a metre further.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { groundHeight } from '../../../src/world/ground';
import { drawnInShadowsOnly } from '../../../src/world/culling';
import { routing } from '../../../src/world/walkPath';
import { COTTAGES, type Cottage } from '../../../src/data/village';
import { COTTAGE } from '../../../src/world/villagePlan';
import { HALL, TERRACE, type Spot } from '../../../src/data/village';
import type { LightsChecked } from './villageLights';

/** frames he settles where he's put, and walks at most */
const SETTLE = 15;
const WALK = 240;
/** how high over the terrace the ray runs (m: a knee's), the least his middle may stand off what's drawn (m), and how
 *  much further the canary counts him (m) */
const KNEE = 0.25;
const LEAST_OFF = 0.15;
const CANARY_ON = 0.5;
/** how far the walk's target lies past the wall (m), so he never stops short of it on his own */
const PAST = 6;

/** A walk at the hall: its name, where he sets off, and which way he walks (a unit along x or z). */
interface HallWalk { name: string; from: Spot; way: Spot; offOutline?: (x: number, z: number) => number }

const X = TERRACE.x;
/** the walks: at each side wall from the terrace beside it, at the front wall between the portico's columns */
const WALKS: readonly HallWalk[] = [
  { name: 'east side', from: [X + HALL.half + 2.2, -18], way: [-1, 0] },
  { name: 'west side', from: [X - HALL.half - 2.2, -18], way: [1, 0] },
  { name: 'front, east of the door', from: [X + 4.45, HALL.door + 2.6], way: [0, -1] },
  { name: 'front, west of the door', from: [X - 4.45, HALL.door + 2.6], way: [0, -1] },
  // (its wings past the terrace's back, from the grass below them: from play, "I can also walk from down here up to
  // the hall, through the wall, and back")
  { name: 'east wing, from the grass', from: [X + HALL.half + 2.2, -27], way: [-1, 0] },
  { name: 'west wing, from the grass', from: [X - HALL.half - 2.2, -27], way: [1, 0] },
];

/** how far off a cottage's wall each walk at it sets off (m), and off its corners along the wall (m) */
const OFF_COTTAGE = 2.6;

/** A walk at each of `c`'s four walls, from its middle's line (from play, "and can walk through buildings too"). */
function walksAtCottage(c: Cottage, index: number): HallWalk[] {
  const halfW = (COTTAGE.w / 2) * c.size;
  const halfD = (COTTAGE.d / 2) * c.size;
  const cos = Math.cos(c.facing);
  const sin = Math.sin(c.facing);
  // (as the group's turn about y turns them)
  const turned = (x: number, z: number): Spot => [c.x + x * cos + z * sin, c.z - x * sin + z * cos];
  const ways: [string, number, number, number][] = [
    ['front', 0, 1, halfD],
    ['back', 0, -1, halfD],
    ['side', 1, 0, halfW],
    ['other side', -1, 0, halfW],
  ];
  return ways.map(([side, x, z, half]) => {
    const from = turned(x * (half + OFF_COTTAGE), z * (half + OFF_COTTAGE));
    const toward = turned(-x, -z);
    // (off its walls' rectangle, not the first thing drawn ahead: he goes round a lamp post or a fence on the way)
    const offOutline = (px: number, pz: number): number => {
      const acrossW = (px - c.x) * cos - (pz - c.z) * sin;
      const acrossD = (px - c.x) * sin + (pz - c.z) * cos;
      return Math.max(Math.abs(acrossW) - halfW, Math.abs(acrossD) - halfD);
    };
    return { name: `cottage ${index} ${side}`, from, way: [toward[0] - c.x, toward[1] - c.z] as Spot, offOutline };
  });
}

/** Whether `object` and everything over it is drawn in the frame (not hidden, not the shadows' alone). */
function drawn(object: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = object; o; o = o.parent) {
    if (!o.visible || drawnInShadowsOnly(o as THREE.Mesh)) return false;
  }
  return true;
}

/** Whether `object` is part of a hero. */
function ofHero(object: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = object; o; o = o.parent) if (o === G.player.obj) return true;
  return false;
}

/** How far along `way` from `from` (at the knee's height) the first surface drawn lies (m), or Infinity. */
function surfaceAhead(from: THREE.Vector3, way: THREE.Vector3): number {
  const ray = new THREE.Raycaster(from, way, 0, 30);
  const hits = ray.intersectObject(G.arena.groupOf('village'), true);
  const hit = hits.find((h) => (h.object as THREE.Mesh).isMesh && drawn(h.object) && !ofHero(h.object));
  return hit ? hit.distance : Infinity;
}

/** He walks the walk until stopped: how far his middle stands off the surface ahead (m). */
async function walkUp(lab: Lab, walk: HallWalk): Promise<number> {
  const [x, z] = walk.from;
  const [wx, wz] = walk.way;
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), Math.atan2(wx, wz));
  await lab.step(SETTLE);
  G.player.walkTo = new THREE.Vector3(x + wx * (PAST + 3), 0, z + wz * (PAST + 3));
  await lab.step(WALK);
  G.player.walkTo = null;
  if (walk.offOutline) return walk.offOutline(G.player.pos.x, G.player.pos.z);
  const start = new THREE.Vector3(x, groundHeight(x, z) + KNEE, z);
  const way = new THREE.Vector3(wx, 0, wz);
  const walked = (G.player.pos.x - x) * wx + (G.player.pos.z - z) * wz;
  return surfaceAhead(start, way) - walked;
}

/** Each walk at the hall's walls: his middle off what's drawn ahead where he stopped. */
export async function hallWallsHold(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const gaps: string[] = [];
  const failed: string[] = [];
  routing.on = false;
  try {
    for (const walk of [...WALKS, ...COTTAGES.flatMap(walksAtCottage)]) {
      const gap = (await walkUp(lab, walk)) - (canary ? CANARY_ON : 0);
      gaps.push(`${walk.name} ${gap.toFixed(2)}`);
      if (!(gap >= LEAST_OFF)) failed.push(`${walk.name}: his middle ${gap.toFixed(2)} m off the surface ahead`);
    }
  } finally {
    routing.on = true;
  }
  const line = `hall's walls walked up to: his middle off them (m, at least ${LEAST_OFF}): ${gaps.join(', ')}`;
  if (canary) return { lines: [line], problems: [], caught: failed.length > 0, moments: [] };
  return { lines: [line], problems: failed.map((f) => `hall's walls: ${f}`), caught: null, moments: [] };
}
