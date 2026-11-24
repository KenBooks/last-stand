// `lab village`'s houses' doors from afar (#912, from play: "door visual glitch like white lines" on Odo's Wares).
// `doorsPlainFromAfar`: each house's door looked at from the square's side of it, 8 m off and from above, to
// either side of square on, at morning, noon and mid-afternoon, and its leaf's patch of the frame read: how bright its
// brightest few pixels are. A leaf of dark planks in shade has none much over the rest; one with slivers
// under a pixel wide lit where the planks round them are in shade has lines of them, in dots: its iron's straps,
// rivets and edges, polished as they were. (The 6 mm gaps between its planks were tried too: closed up they changed
// no reading here, with the iron as it was or dulled, and stay.) Pictured at the worst of each door. `canary` hangs
// four white slivers 6 mm wide down the first door, which must be found.
import * as THREE from 'three';
import { screenArea, type Lab, type Pictured } from './lab';
import { G } from '../../../src/state';
import { holdHour } from '../../../src/game/clock';
import { HOUSES, ROOM_IDS, houseDoor, type RoomId } from '../../../src/data/houses';
import { groundHeight } from '../../../src/world/ground';
import { drawFrame, pixelLight, type Canvas } from './light';
import { drawnWhole } from './gpuTurns';
import { endFlight, flewFrom, flyTo, takeFlight, type Flown } from './perfFly';
import { standsOut, type StandsOut } from './thinBright';
import type { LightsChecked } from './villageLights';

/** the hours read: the sun east, overhead and west of the doors */
const HOURS = [9, 12, 15.75];
/** where a door is looked at from: how far out from it and how high (m), and how far to either side of square on
 *  (rad): the top view's distance and height, as the complaint's picture was taken */
const FROM = { out: 8, up: 5.5, aside: [-0.45, 0.45] };
/** the leaf's patch read, in the door's frame (m): its foot's height over the ground, its height and half width,
 *  each well in from the frame round it, which stands 0.2 m out before the leaf: from aside and above its near jamb
 *  and its head hide a hand's width of the leaf, and their own faces were read as the leaf's */
const LEAF = { foot: 0.8, high: 1.35, half: 0.3 };
/** a pixel stands out at this many times the leaf's median brightness, and at least this much over it (of white) */
const TIMES = 3;
const LEAST = 0.012;
/** the most the mean of a leaf's brightest pixels may be (of white; `TOP_SHARE` of them, thinBright.ts). With its
 *  iron polished (0.75 metal, 0.55 rough), three of the four doors read 0.16 to 0.33 at their worst hour (the fourth,
 *  sunlit most of the day, 0.04); wrought (0.4, 0.9), 0.01 to 0.05; rough alone (0.75, 0.9), up to 0.07. The share of pixels standing
 *  out says little: a sliver under a pixel wide lights few, 0.4 to 0.7% of the leaf either way. */
const TOP_MOST = 0.07;
const SETTLE = 3;
/** the canary's slivers: how many, how wide and how far off the leaf (m) */
const SLIVERS = { count: 4, wide: 0.006, off: 0.12 };

/** A door looked at: which, when and from which side, and what stands out of its leaf. */
interface Read { id: RoomId; hour: number; aside: number; flown: Flown; found: StandsOut }

/** The corners of house `id`'s leaf in the world, and the way out of its door. */
function leafOf(id: RoomId): { corners: THREE.Vector3[]; middle: THREE.Vector3; out: THREE.Vector3 } {
  const door = houseDoor(id);
  const out = new THREE.Vector3(Math.sin(door.facing), 0, Math.cos(door.facing));
  const along = new THREE.Vector3(out.z, 0, -out.x);
  const ground = groundHeight(door.x, door.z);
  const corner = (side: number, up: number): THREE.Vector3 =>
    new THREE.Vector3(door.x, ground + up, door.z).addScaledVector(along, side * LEAF.half);
  const corners = [corner(-1, LEAF.foot), corner(1, LEAF.foot), corner(1, LEAF.foot + LEAF.high), corner(-1, LEAF.foot + LEAF.high)];
  const middle = new THREE.Vector3(door.x, ground + LEAF.foot + LEAF.high / 2, door.z);
  return { corners, middle, out };
}

/** Where house `id`'s door is looked at from, `aside` of square on. */
function viewOf(id: RoomId, aside: number): Flown {
  const { middle, out } = leafOf(id);
  const way = out.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), aside);
  const pos = middle.clone().addScaledVector(way, FROM.out);
  pos.y = middle.y + FROM.up;
  const look = middle.clone().sub(pos).normalize();
  // (a yaw's forward is (-sin, -cos))
  return { pos, yaw: Math.atan2(-look.x, -look.z), pitch: Math.asin(look.y) };
}

/** Whether (x, y) lies within the four-sided patch `quad` (its corners in order round it). */
function within(quad: [number, number][], x: number, y: number): boolean {
  let side = 0;
  for (let i = 0; i < quad.length; i++) {
    const [ax, ay] = quad[i];
    const [bx, by] = quad[(i + 1) % quad.length];
    const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    if (cross !== 0) {
      if (side && Math.sign(cross) !== side) return false;
      side = Math.sign(cross);
    }
  }
  return true;
}

/** Each pixel's light within the patch of `frame` that `corners` (round it in order) take on the screen: the patch
 *  itself, not the box round it, which from aside takes in the jamb beside the leaf (the frame reads from its bottom
 *  row up). */
function patchLights(frame: Canvas, corners: THREE.Vector3[]): Float32Array {
  const quad = corners.map((corner): [number, number] => {
    const ndc = corner.clone().project(G.camera);
    return [(ndc.x + 1) / 2 * frame.width, (ndc.y + 1) / 2 * frame.height];
  });
  const xs = quad.map(([x]) => x);
  const ys = quad.map(([, y]) => y);
  const left = Math.max(0, Math.ceil(Math.min(...xs)));
  const right = Math.min(frame.width - 1, Math.floor(Math.max(...xs)));
  const bottom = Math.max(0, Math.ceil(Math.min(...ys)));
  const top = Math.min(frame.height - 1, Math.floor(Math.max(...ys)));
  const lights: number[] = [];
  for (let y = bottom; y <= top; y++) {
    for (let x = left; x <= right; x++) {
      if (within(quad, x, y)) lights.push(pixelLight(frame, (y * frame.width + x) * 4));
    }
  }
  return Float32Array.from(lights);
}

/** House `id`'s door read from `aside` at the hour held. */
async function readDoor(lab: Lab, id: RoomId, hour: number, aside: number): Promise<Read> {
  const flown = viewOf(id, aside);
  flyTo(flown);
  await lab.step(SETTLE);
  if (!flewFrom(flown)) throw new Error('lab: village: doors: the free camera never flew where it was put');
  let frame: Canvas | null = null;
  await drawnWhole(() => {
    frame = drawFrame(lab);
  });
  const lights = patchLights(frame!, leafOf(id).corners);
  if (lights.length < 300) throw new Error(`lab: village: doors: the ${id}'s leaf is ${lights.length} pixels of the frame`);
  return { id, hour, aside, flown, found: standsOut(lights, TIMES, LEAST) };
}

/** White slivers hung down house `id`'s leaf, before it; returns what takes them away. */
function hangSlivers(id: RoomId): () => void {
  const { middle, out } = leafOf(id);
  const along = new THREE.Vector3(out.z, 0, -out.x);
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const geometry = new THREE.BoxGeometry(SLIVERS.wide, LEAF.high, SLIVERS.wide);
  const slivers = Array.from({ length: SLIVERS.count }, (_, at) => {
    const sliver = new THREE.Mesh(geometry, material);
    sliver.name = 'canary sliver';
    const side = ((at + 0.5) / SLIVERS.count - 0.5) * 2 * LEAF.half;
    sliver.position.copy(middle).addScaledVector(along, side).addScaledVector(out, SLIVERS.off);
    sliver.rotation.y = Math.atan2(out.x, out.z);
    G.scene.add(sliver);
    return sliver;
  });
  return () => {
    for (const sliver of slivers) G.scene.remove(sliver);
    geometry.dispose();
    material.dispose();
  };
}

const percent = (share: number): string => `${(share * 100).toFixed(2)}%`;
const sideOf = (aside: number): string => (aside < 0 ? 'from its left' : 'from its right');
const readText = (read: Read): string =>
  `${read.hour} h ${read.aside < 0 ? 'left' : 'right'} ${read.found.top.toFixed(3)} (${percent(read.found.share)} out)`;

/** Each house's door read from afar at each hour and side; its worst pictured. */
export async function doorsPlainFromAfar(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const lines: string[] = [];
  const problems: string[] = [];
  const moments: Pictured[] = [];
  const ids = canary ? ROOM_IDS.slice(0, 1) : ROOM_IDS;
  const takeDown = canary ? hangSlivers(ids[0]) : () => {};
  takeFlight();
  try {
    for (const id of ids) {
      const reads: Read[] = [];
      for (const hour of HOURS) {
        holdHour(hour);
        for (const aside of FROM.aside) reads.push(await readDoor(lab, id, hour, aside));
      }
      const worst = reads.reduce((a, b) => (b.found.top > a.found.top ? b : a));
      const line = `${HOUSES[id].name}'s door from ${FROM.out} m: its brightest pixels ${worst.found.top.toFixed(3)} of `
        + `white at most (at ${worst.hour} h ${sideOf(worst.aside)}, its median ${worst.found.median.toFixed(3)}; at `
        + `most ${TOP_MOST})`;
      lines.push(line);
      lines.push(`  each read: ${reads.map(readText).join(', ')}`);
      if (worst.found.top > TOP_MOST) problems.push(`${line}: bright lines on the door`);
      holdHour(worst.hour);
      flyTo(worst.flown);
      await lab.step(SETTLE);
      const { corners } = leafOf(id);
      moments.push(await lab.screen(`${id} door, ${worst.hour} h ${sideOf(worst.aside)}`, [`its brightest pixels ${worst.found.top.toFixed(3)} of white`],
        screenArea(corners, 120)));
    }
  } finally {
    takeDown();
    endFlight();
    holdHour(null);
  }
  if (canary) return { lines, problems: [], caught: problems.length > 0, moments };
  return { lines, problems, caught: null, moments };
}
