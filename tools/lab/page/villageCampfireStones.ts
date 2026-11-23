// `lab village --only campfireStonesApart`: each of the campfire's ring of stones its own stone (from review, "merged
// stones", "fused stones": laid each at a set angle whatever its size, neighbours ran into each other, one lumpy band).
// The ring is one merged mesh (`world/fireRing.ts`), so its stones are found again as the pieces its triangles join
// into (a stone's points shared by its faces, by place); then each stone's points are tried inside each neighbour's
// solid, by the count of its faces a ray out of the point crosses, each point first drawn a touch in toward its own
// stone's middle, so stones that only touch pass. Said: the stones, their triangles, and the pairs that run into each
// other, with the deepest point; pictured as the player sees it (the page's own screenshot, which the engine's
// canvas gives), from above, standing by the fire and from a seat log, at noon and midnight. `canary` tries a stone
// against itself moved 4 cm, which must be found.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { CAMPFIRE } from '../../../src/data/village';
import { holdHour } from '../../../src/game/clock';
import * as renderer from '../../../src/core/renderer';
import { faceCamera, viewMode } from '../../../src/core/renderer';
import { groundHeight } from '../../../src/world/ground';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** the ring's mesh, as `fireRing` names it */
const RING_NAMED = 'campfire stones';
/** how far a point is drawn in toward its own stone's middle before it's tried in another (m): touching passes */
const TOUCH = 0.004;
/** a point's place, to the tenth of a millimetre, for the faces that share it */
const PLACE = 1e4;
/** how far the canary's copy is moved (m) */
const CANARY_SHIFT = 0.04;
/** where the hero stands to picture the ring (m out from the fire's middle, rad round it): by the fire, between two
 *  seat logs on its open side (on the square's, a cottage's corner stood in the view), and at the first seat log,
 *  which lies 2.2 m out at 0.4 (village.ts `buildBenches`) */
const STANDS = [
  { what: 'standing by the fire', out: 1.9, round: 1.35 },
  { what: 'from a seat log', out: 2.2, round: 0.4 },
];
/** how far past the fire from the camera the hero stands for the view from above (m), and the way it looks (rad, the
 *  top-down view's yaw: 0 looks toward -z) */
const ABOVE_PAST = 1.9;
const ABOVE_YAW = 0;
/** the hours pictured, and the frames he settles in at a stand */
const HOURS = [12, 0];
const SETTLE = 15;

/** One stone of the ring: its triangles' corners (x, y, z each), its points once each, and its middle and box. */
interface Stone { corners: Float32Array; points: THREE.Vector3[]; middle: THREE.Vector3; box: THREE.Box3 }

/** The ring's mesh in the village, as built. */
function ringMesh(): THREE.Mesh {
  let found: THREE.Mesh | null = null;
  G.arena.village!.meadow.parent!.traverse((object) => {
    if (object.name === RING_NAMED && (object as THREE.Mesh).isMesh) found = object as THREE.Mesh;
  });
  if (!found) throw new Error(`lab: village: no mesh called ${RING_NAMED}`);
  return found;
}

/** A place's key, its point to the tenth of a millimetre. */
const placeKey = (x: number, y: number, z: number): string =>
  `${Math.round(x * PLACE)},${Math.round(y * PLACE)},${Math.round(z * PLACE)}`;

/** The pieces `mesh`'s triangles join into by the places they share, each a stone, in the world's frame. */
function stonesOf(mesh: THREE.Mesh): Stone[] {
  mesh.updateMatrixWorld(true);
  const position = mesh.geometry.attributes.position;
  const triangles = position.count / 3;
  const world = new Float32Array(position.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
    world.set([v.x, v.y, v.z], i * 3);
  }
  // (a union-find over the places: a triangle joins its three corners' places)
  const placeOf = new Map<string, number>();
  const parent: number[] = [];
  const find = (a: number): number => {
    while (parent[a] !== a) a = parent[a] = parent[parent[a]];
    return a;
  };
  const cornerPlace = new Int32Array(position.count);
  for (let i = 0; i < position.count; i++) {
    const key = placeKey(world[i * 3], world[i * 3 + 1], world[i * 3 + 2]);
    let id = placeOf.get(key);
    if (id === undefined) {
      id = parent.length;
      parent.push(id);
      placeOf.set(key, id);
    }
    cornerPlace[i] = id;
  }
  for (let t = 0; t < triangles; t++) {
    const a = find(cornerPlace[t * 3]);
    for (let k = 1; k < 3; k++) parent[find(cornerPlace[t * 3 + k])] = a;
  }
  const byRoot = new Map<number, number[]>();
  for (let t = 0; t < triangles; t++) {
    const root = find(cornerPlace[t * 3]);
    if (!byRoot.has(root)) byRoot.set(root, []);
    byRoot.get(root)!.push(t);
  }
  return [...byRoot.values()].map((list) => {
    const corners = new Float32Array(list.length * 9);
    list.forEach((t, k) => corners.set(world.subarray(t * 9, t * 9 + 9), k * 9));
    const seen = new Set<string>();
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < corners.length; i += 3) {
      const key = placeKey(corners[i], corners[i + 1], corners[i + 2]);
      if (seen.has(key)) continue;
      seen.add(key);
      points.push(new THREE.Vector3(corners[i], corners[i + 1], corners[i + 2]));
    }
    const box = new THREE.Box3().setFromPoints(points);
    const middle = points.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(points.length);
    return { corners, points, middle, box };
  });
}

/** A mesh of `stone`'s faces for rays, both sides met. */
function solidOf(stone: Stone): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(stone.corners, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.updateMatrixWorld(true);
  return mesh;
}

/** How many of `stone`'s points lie inside `other`'s solid, each drawn `TOUCH` in toward its own middle first, and how
 *  deep the deepest goes (m, its distance from the other's nearest point outside it, roughly: from its own box). */
function pointsInside(stone: Stone, other: Stone, solid: THREE.Mesh): { inside: number; deepest: number } {
  const ray = new THREE.Raycaster();
  const out = new THREE.Vector3(1, 0.137, 0.071).normalize();
  const tried = new THREE.Vector3();
  let inside = 0;
  let deepest = 0;
  for (const point of stone.points) {
    tried.copy(point).add(stone.middle.clone().sub(point).setLength(TOUCH));
    if (!other.box.containsPoint(tried)) continue;
    ray.set(tried, out);
    const crossed = ray.intersectObject(solid, false).length;
    if (crossed % 2 === 1) {
      inside++;
      deepest = Math.max(deepest, other.box.distanceToPoint(tried) === 0 ? depthIn(tried, other) : 0);
    }
  }
  return { inside, deepest };
}

/** How far `point` lies in from `stone`'s nearest point (m): its depth inside, near enough for a line. */
function depthIn(point: THREE.Vector3, stone: Stone): number {
  let nearest = Infinity;
  for (const p of stone.points) nearest = Math.min(nearest, p.distanceToSquared(point));
  return Math.sqrt(nearest);
}

/** The pairs of stones whose solids run into each other beyond a touch. */
function runTogether(stones: Stone[]): { a: number; b: number; inside: number; deepest: number }[] {
  const solids = stones.map(solidOf);
  const found: { a: number; b: number; inside: number; deepest: number }[] = [];
  for (let a = 0; a < stones.length; a++) {
    for (let b = 0; b < stones.length; b++) {
      if (a === b || !stones[a].box.intersectsBox(stones[b].box)) continue;
      const { inside, deepest } = pointsInside(stones[a], stones[b], solids[b]);
      if (inside > 0) found.push({ a, b, inside, deepest });
    }
  }
  return found;
}

/** `stone` moved by `by` (the canary's copy). */
function moved(stone: Stone, by: THREE.Vector3): Stone {
  const corners = stone.corners.slice();
  for (let i = 0; i < corners.length; i += 3) {
    corners[i] += by.x;
    corners[i + 1] += by.y;
    corners[i + 2] += by.z;
  }
  const points = stone.points.map((p) => p.clone().add(by));
  return { corners, points, middle: stone.middle.clone().add(by), box: stone.box.clone().translate(by) };
}

/** The ring from above, in the lobby's own view, the hero stood past the fire from the camera so he hides none of
 *  it (a review's own view: "why perfectly cut stones in half ?"), at each hour. */
async function ringFromAbove(lab: Lab): Promise<Pictured[]> {
  const moments: Pictured[] = [];
  const was = viewMode();
  await viewBy(lab, 'top');
  const fire = new THREE.Vector3(CAMPFIRE[0], 0, CAMPFIRE[1]);
  G.player.walkTo = null;
  G.player.place(fire.clone().setY(groundHeight(fire.x, fire.z)), 0);
  await lab.step(SETTLE);
  // (turned to one way, so both sides of an A/B see it alike: the village opens at a spot of its own at random, the
  // camera's turn with it)
  renderer.settleCamera?.(fire);
  renderer.turnBy(Math.atan2(Math.sin(ABOVE_YAW - renderer.cameraYaw()), Math.cos(ABOVE_YAW - renderer.cameraYaw())));
  renderer.settleCamera?.(fire);
  await lab.step(1);
  // (the camera's way from him along the ground, then him moved that far past the fire on its other side)
  const away = new THREE.Vector3(G.camera.position.x - fire.x, 0, G.camera.position.z - fire.z).setLength(ABOVE_PAST);
  const x = fire.x - away.x;
  const z = fire.z - away.z;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), 0);
  await lab.step(SETTLE);
  for (const hour of HOURS) {
    holdHour(hour);
    await lab.step(2);
    moments.push(await lab.screen(`the campfire's stones from above, at ${hour}h`, []));
  }
  holdHour(null);
  await viewBy(lab, was);
  return moments;
}

/** The ring as the player sees it from each stand, over the shoulder facing the fire, at each hour. */
async function ringSeen(lab: Lab): Promise<Pictured[]> {
  const moments: Pictured[] = [...await ringFromAbove(lab)];
  const was = viewMode();
  await viewBy(lab, 'third');
  for (const stand of STANDS) {
    const x = CAMPFIRE[0] + Math.cos(stand.round) * stand.out;
    const z = CAMPFIRE[1] + Math.sin(stand.round) * stand.out;
    G.player.walkTo = null;
    G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), 0);
    faceCamera(Math.atan2(CAMPFIRE[0] - x, CAMPFIRE[1] - z));
    await lab.step(SETTLE);
    for (const hour of HOURS) {
      holdHour(hour);
      await lab.step(2);
      moments.push(await lab.screen(`the campfire's stones ${stand.what}, at ${hour}h`, []));
    }
  }
  holdHour(null);
  await viewBy(lab, was);
  return moments;
}

/** No two of the campfire's stones run into each other; the ring's stones and triangles said. */
export async function campfireStonesApart(lab: Lab, canary: boolean): Promise<LightsChecked> {
  if (G.arena.place !== 'village') throw new Error('lab: village: not in the village');
  const mesh = ringMesh();
  const stones = stonesOf(mesh);
  if (stones.length < 8) throw new Error(`lab: village: the campfire's ring came apart into ${stones.length} pieces`);
  const triangles = mesh.geometry.attributes.position.count / 3;
  const lines = [`the campfire's ring: ${stones.length} stones, ${triangles} triangles`];
  if (canary) {
    const copy = moved(stones[0], new THREE.Vector3(CANARY_SHIFT, 0, 0));
    const caught = runTogether([stones[0], copy]).length > 0;
    lines.push(`canary: a stone against itself moved ${CANARY_SHIFT * 100} cm ${caught ? 'caught' : 'missed'}`);
    return { lines, problems: [], caught, moments: [] };
  }
  const pairs = runTogether(stones);
  lines.push(`${pairs.length} pairs run into each other beyond ${TOUCH * 1000} mm`);
  for (const { a, b, inside, deepest } of pairs) {
    lines.push(`  stone ${a} into stone ${b}: ${inside} points, the deepest ${(deepest * 100).toFixed(1)} cm in`);
  }
  const problems = pairs.map(({ a, b, inside }) => `the campfire's stone ${a} runs into stone ${b} (${inside} points)`);
  return { lines, problems, caught: null, moments: await ringSeen(lab) };
}
