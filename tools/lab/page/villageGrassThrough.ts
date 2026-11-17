// `lab village --only grassNotThroughProps`: no blade of the meadow's grass through what stands on it (from play,
// "grass grows through logs", and the lamp posts' feet; then from the owner, "let grass be closer to props, like real
// life. Just not going through them"). The grass is held under the lowest solid over where each part of a blade is,
// from a map made at build (`solidsOver` in src/world/meadowSolids.ts); this reads that map against the props as three
// meets them. Over every footprint the village keeps bodies off (its obstacles: the seat logs, the lamps, the rack,
// the trees...) and the posts that stand in the grass without one (the notice board's, the yard's corners and gate),
// rays come straight down every 5 cm at what's built, as a raycast meets it (`rayChunks`): wherever a ray meets a
// solid under `SOLID_RANGE` over ground the grass grows on (the meadow's mask, as the blades read it), the map must
// hold a solid there no higher than the ray met. Pictured close to at noon by a seat log, a street lamp and the notice
// board, the grass growing up to each, and the campfire's ring of stones close to by day and by night. `canary` takes one prop out of the map,
// which must be found.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { CAMPFIRE, NOTICE, YARD, yardToWorld } from '../../../src/data/village';
import { holdHour } from '../../../src/game/clock';
import { LAMPS } from '../../../src/world/village';
import { rayChunks } from './rayChunks';
import { CROWD_LAYER, HERO_SHADOW_LAYER } from '../../../src/core/layers';
import type { LightsChecked } from './villageLights';

/** The game's modules this measures, loaded as it runs: an `--ab` against a commit from before the grass's map (main
 *  before #679) has neither, and takes its pictures alone. */
type Solids = typeof import('../../../src/world/meadowSolids');
type Culling = typeof import('../../../src/world/culling');
interface Game { solids: Solids; culling: Culling }

/** The modules, or null on a commit without the grass's map (by address, so Vite doesn't refuse one it can't find). */
async function gameModules(): Promise<Game | null> {
  const at = (path: string): Promise<unknown> => import(/* @vite-ignore */ path);
  try {
    const solids = await at('/src/world/meadowSolids.ts') as Solids;
    const culling = await at('/src/world/culling.ts') as Culling;
    return 'instancesAsBuilt' in culling ? { solids, culling } : null;
  } catch {
    return null;
  }
}

/** the mask's reading under which no blade roots (meadow.ts: `smoothstep(0.3, 0.7, grows)`) */
const ROOTS_FROM = 0.3;
/** how far apart the rays come down over a footprint (m), and from how high */
const RAY_APART = 0.05;
const RAY_FROM = 3;
/** a solid this near the ground is the ground (m: the paving's top, the sward's) */
const GROUND_UP = 0.03;
/** how much higher than a ray met it the map may hold a solid (m: a byte's step and the cell's slope) */
const MAP_SLACK = 0.03;
/** how the ghost's group is named (game/ghost.ts) */
const GHOST_NAMED = 'ghost: ';
/** the half width of a post standing in the grass without an obstacle (m) */
const POST_HALF = 0.1;
/** the fewest points under a prop the rays must meet, or nothing was measured */
const LEAST_UNDER = 500;
/** the hour pictured, and how far off each spot its pictures stand (m) */
const NOON = 12;
const PICTURE_FROM = [2.6, 1.6];
/** the hero's facing the pictures are turned by (rad): the `above` close-up then looks north, from the square's side,
 *  whatever way the boot faced him */
const PICTURE_FACING = -0.35;
/** the hours the campfire's stones are pictured at, and how far off (m) */
const STONES_AT = [12, 0];
const STONES_FROM = 3;

/** the game's modules, as this run loaded them */
let game: Game;
const SOLID_CELL = (): number => game.solids.SOLID_CELL;
const SOLID_RANGE = (): number => game.solids.SOLID_RANGE;

/** A footprint on the ground: its middle, its radius (m) and what it is. */
interface Foot { x: number; z: number; r: number; what: string }

/** The grass's mask as its blades read it (the red of its softened texture), and the map of solids over it. */
interface Maps {
  mask: Float32Array;
  maskSide: number;
  solids: Uint8Array;
  solidsSide: number;
  half: number;
}

/** The meadow's two maps, read once. */
function readMaps(): Maps {
  const meadow = G.arena.village!.meadow;
  const half = (meadow.userData.mask as { half: number }).half;
  const canvas = (meadow.userData.maskTexture as THREE.CanvasTexture).image as HTMLCanvasElement;
  const maskSide = canvas.width;
  const pixels = canvas.getContext('2d')!.getImageData(0, 0, maskSide, maskSide).data;
  const mask = new Float32Array(maskSide * maskSide);
  for (let i = 0; i < mask.length; i++) mask[i] = pixels[i * 4] / 255;
  const solidsTexture = meadow.userData.solids as THREE.DataTexture;
  const solids = (solidsTexture.image.data as Uint8Array).slice();
  return { mask, maskSide, solids, solidsSide: solidsTexture.image.width, half };
}

/** The mask at (x, z) as a linear filter reads it between texels (rows run with z). */
function maskAt(maps: Maps, x: number, z: number): number {
  const side = maps.maskSide;
  const u = ((x + maps.half) / (maps.half * 2)) * side - 0.5;
  const v = ((z + maps.half) / (maps.half * 2)) * side - 0.5;
  const u0 = Math.floor(u);
  const v0 = Math.floor(v);
  const texel = (col: number, row: number): number =>
    maps.mask[Math.max(0, Math.min(side - 1, row)) * side + Math.max(0, Math.min(side - 1, col))];
  const top = texel(u0, v0) * (1 - (u - u0)) + texel(u0 + 1, v0) * (u - u0);
  const bottom = texel(u0, v0 + 1) * (1 - (u - u0)) + texel(u0 + 1, v0 + 1) * (u - u0);
  return top * (1 - (v - v0)) + bottom * (v - v0);
}

/** The cell of the solids' map over (x, z), or -1 off it. */
function solidCell(maps: Maps, x: number, z: number): number {
  const col = Math.floor((x + maps.half) / SOLID_CELL());
  const row = Math.floor((z + maps.half) / SOLID_CELL());
  if (col < 0 || row < 0 || col >= maps.solidsSide || row >= maps.solidsSide) return -1;
  return row * maps.solidsSide + col;
}

/** The lowest solid the map holds over (x, z) (m; `SOLID_RANGE` where it holds none). */
function solidAt(maps: Maps, x: number, z: number): number {
  const cell = solidCell(maps, x, z);
  return cell < 0 ? SOLID_RANGE() : (maps.solids[cell] / 255) * SOLID_RANGE();
}

/** The posts standing in the grass that keep no bodies off: the notice board's two, the yard's corners and gate. */
function posts(): Foot[] {
  const feet: Foot[] = [];
  const cos = Math.cos(NOTICE.facing);
  const sin = Math.sin(NOTICE.facing);
  for (const side of [-1, 1]) {
    const x = side * 0.9;
    feet.push({ x: NOTICE.x + x * cos, z: NOTICE.z - x * sin, r: POST_HALF, what: 'a notice board post' });
  }
  const { halfX, halfZ, gate, gateAt } = YARD;
  const corners: [number, number][] = [[-halfX, -halfZ], [halfX, -halfZ], [halfX, halfZ], [-halfX, halfZ]];
  for (const [x, z] of corners) {
    const [wx, wz] = yardToWorld(x, z);
    feet.push({ x: wx, z: wz, r: POST_HALF, what: "a yard's corner post" });
  }
  for (const side of [-1, 1]) {
    const [wx, wz] = yardToWorld(gateAt + side * gate, -halfZ);
    feet.push({ x: wx, z: wz, r: POST_HALF + 0.03, what: "the yard's gate post" });
  }
  return feet;
}

/** Every footprint read: the village's obstacles and the posts. */
function footprints(): Foot[] {
  const obstacles = G.arena.village!.obstacles.map((o) => ({
    x: o.x, z: o.z, r: o.r, what: `an obstacle ${o.r.toFixed(2)} m round`,
  }));
  return [...obstacles, ...posts()];
}

/** Whether `mesh` is drawn as something solid, as the player sees it: its colour and depth written, nothing cut out
 *  of it. The lab's own rule, not the game's (`solid` in meadowSolids.ts): read by the game's, the check passed by the
 *  seat logs the game's rule left out of the map, which drew blades up through their tops ("Not fixed", #679). */
function drawnSolid(mesh: THREE.Mesh): boolean {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.every((m) => m.visible && m.colorWrite && m.depthWrite && m.alphaTest === 0);
}

/** What's built in the village as the grass's map is made of it, low enough to meet: shown, opaque meshes standing
 *  still but the meadow's own, each instance of an instanced one a mesh of its own, the merged ones cut into chunks for rays. */
function builtMeshes(): THREE.Mesh[] {
  const village = G.arena.village!;
  const plain: THREE.Mesh[] = [];
  const instances: THREE.Mesh[] = [];
  const matrix = new THREE.Matrix4();
  village.meadow.parent!.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry?.attributes.position || !drawnSolid(mesh)) return;
    // (what moves stands nowhere for good: the heroes, the yard's dummies and its ghost, the chest's lid)
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh || mesh.layers.isEnabled(CROWD_LAYER) || mesh.layers.isEnabled(HERO_SHADOW_LAYER)) return;
    // (nor the meadow, nor the ghost by the yard's gate, a projection the grass stands through: game/ghost.ts)
    for (let up: THREE.Object3D | null = mesh; up; up = up.parent) {
      if (up === village.meadow || up.name.startsWith(GHOST_NAMED)) return;
    }
    const instanced = mesh as THREE.InstancedMesh;
    if (!instanced.isInstancedMesh) {
      plain.push(mesh);
      return;
    }
    // (as built: culled in cells, its instances are packed by what the last render showed)
    const built = game.culling.instancesAsBuilt(instanced);
    for (let at = 0; at < built.length; at += 16) {
      const one = new THREE.Mesh(mesh.geometry, mesh.material);
      one.matrixAutoUpdate = false;
      one.name = `${meshName(instanced)} instanced`;
      one.matrixWorld.copy(mesh.matrixWorld).multiply(matrix.fromArray(built, at));
      instances.push(one);
    }
  });
  return [...rayChunks(plain), ...instances].filter((mesh) => boxOf(mesh).min.y < SOLID_RANGE());
}

/** `mesh`'s box in the world, made once. */
const boxes = new WeakMap<THREE.Mesh, THREE.Box3>();
function boxOf(mesh: THREE.Mesh): THREE.Box3 {
  let box = boxes.get(mesh);
  if (!box) {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    box = mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld);
    boxes.set(mesh, box);
  }
  return box;
}

/** The meshes whose box reaches over `foot`. */
function meshesOver(meshes: THREE.Mesh[], foot: Foot): THREE.Mesh[] {
  return meshes.filter((mesh) => {
    const box = boxOf(mesh);
    return box.min.x <= foot.x + foot.r && box.max.x >= foot.x - foot.r && box.min.z <= foot.z + foot.r
      && box.max.z >= foot.z - foot.r;
  });
}

/** A point under a prop: where a ray came down, the lowest solid it met there under `SOLID_RANGE`, which foot. */
interface Under { x: number; z: number; met: number; foot: Foot; by: string }

/** The points of each footprint where a ray down meets a solid under `SOLID_RANGE`, over ground grass grows on. */
function pointsUnder(maps: Maps, feet: Foot[], meshes: THREE.Mesh[]): Under[] {
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const from = new THREE.Vector3();
  const under: Under[] = [];
  for (const foot of feet) {
    const near = meshesOver(meshes, foot);
    const steps = Math.ceil(foot.r / RAY_APART);
    for (let i = -steps; i <= steps; i++) {
      for (let k = -steps; k <= steps; k++) {
        const x = foot.x + i * RAY_APART;
        const z = foot.z + k * RAY_APART;
        if (Math.hypot(x - foot.x, z - foot.z) > foot.r) continue;
        if (maskAt(maps, x, z) <= ROOTS_FROM) continue;
        ray.set(from.set(x, RAY_FROM, z), down);
        const hits = ray.intersectObjects(near, false).filter((hit) => hit.point.y > GROUND_UP && hit.point.y < SOLID_RANGE());
        if (!hits.length) continue;
        const lowest = hits.reduce((a, b) => (a.point.y < b.point.y ? a : b));
        under.push({ x, z, met: lowest.point.y, foot, by: meshName(lowest.object as THREE.Mesh) });
      }
    }
  }
  return under;
}

/** How many of `under` each mesh met. */
function countBy(under: Under[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const point of under) counts.set(point.by, (counts.get(point.by) ?? 0) + 1);
  return counts;
}

/** A mesh's name for a line: its own or its nearest parent's, and its material's. */
function meshName(mesh: THREE.Mesh): string {
  const path: string[] = [];
  for (let up: THREE.Object3D | null = mesh; up && path.length < 4; up = up.parent) path.push(up.name || up.type);
  return path.join(' < ');
}

/** The points where the map holds no solid as low as the ray met: a blade could stand up through it there. */
function through(maps: Maps, under: Under[]): Under[] {
  return under.filter((point) => solidAt(maps, point.x, point.z) > point.met + MAP_SLACK);
}

/** Each footprint with grass through it, on a line: how many of its points, the worst. */
function throughLines(maps: Maps, missed: Under[]): string[] {
  const byFoot = new Map<Foot, Under[]>();
  for (const point of missed) byFoot.set(point.foot, [...(byFoot.get(point.foot) ?? []), point]);
  return [...byFoot].map(([foot, points]) => {
    const worst = points.reduce((a, b) => (solidAt(maps, a.x, a.z) - a.met > solidAt(maps, b.x, b.z) - b.met ? a : b));
    return `${foot.what} at (${foot.x.toFixed(1)}, ${foot.z.toFixed(1)}): ${points.length} points, the worst a solid `
      + `met at ${worst.met.toFixed(2)} m (${worst.by}) with the map at ${solidAt(maps, worst.x, worst.z).toFixed(2)} m`;
  });
}

/** `maps` with the solids under `foot` taken out (the canary). */
function withoutFoot(maps: Maps, foot: Foot): Maps {
  const solids = maps.solids.slice();
  const reach = foot.r + SOLID_CELL();
  for (let x = foot.x - reach; x <= foot.x + reach; x += SOLID_CELL() / 2) {
    for (let z = foot.z - reach; z <= foot.z + reach; z += SOLID_CELL() / 2) {
      const cell = solidCell(maps, x, z);
      if (cell >= 0) solids[cell] = 255;
    }
  }
  return { ...maps, solids };
}

/** The spots pictured close to: a seat log, the street lamp nearest the campfire and the notice board. */
function picturedSpots(): { label: string; at: THREE.Vector3 }[] {
  const lamps = G.arena.village!.obstacles.filter((o) => Math.abs(o.h - LAMPS.high) < 1e-6 && Math.abs(o.r - 0.35) < 1e-6);
  const fire = new THREE.Vector2(CAMPFIRE[0], CAMPFIRE[1]);
  const away = (o: { x: number; z: number }): number => fire.distanceTo(new THREE.Vector2(o.x, o.z));
  const nearest = lamps.sort((a, b) => away(a) - away(b))[0];
  const log = 0.4;
  const spots = [
    { label: 'a seat log by the campfire', at: new THREE.Vector3(CAMPFIRE[0] + Math.cos(log) * 2.2, 0.2, CAMPFIRE[1] + Math.sin(log) * 2.2) },
    { label: 'the notice board', at: new THREE.Vector3(NOTICE.x, 0.3, NOTICE.z) },
  ];
  if (nearest) spots.push({ label: 'a street lamp', at: new THREE.Vector3(nearest.x, 0.3, nearest.z) });
  return spots;
}

/** The pictures: the grass by each prop close to at noon, and the campfire's stones by day and by night. */
async function pictures(lab: Lab): Promise<Pictured[]> {
  const facing = lab.player.facing;
  lab.player.facing = PICTURE_FACING;
  holdHour(NOON);
  await lab.step(2);
  // (from above alone: the low close-ups stood in the grass, a wall of blades before the camera)
  const moments: Pictured[] = picturedSpots().flatMap((spot) => PICTURE_FROM.map((distance) =>
    lab.picture(`${spot.label}, ${distance} m off`, ['above'], [], { at: spot.at, distance })));
  const stones = new THREE.Vector3(CAMPFIRE[0], 0.1, CAMPFIRE[1]);
  for (const hour of STONES_AT) {
    holdHour(hour);
    await lab.step(2);
    moments.push(lab.picture(`the campfire's stones at ${hour}h`, ['above', 'plan'], [], { at: stones, distance: STONES_FROM }));
  }
  lab.player.facing = facing;
  holdHour(null);
  return moments;
}

/** No blade through anything standing on the meadow, the grass up to it; pictures close to. */
export async function grassNotThroughProps(lab: Lab, canary: boolean): Promise<LightsChecked> {
  if (G.arena.place !== 'village') throw new Error('lab: village: not in the village');
  const loaded = await gameModules();
  if (!loaded) return { lines: ['no map of what stands on the grass on this commit: pictures alone'], problems: [], caught: null, moments: await pictures(lab) };
  game = loaded;
  const maps = readMaps();
  const feet = footprints();
  const under = pointsUnder(maps, feet, builtMeshes());
  const propsMet = new Set(under.map((point) => point.foot)).size;
  if (under.length < LEAST_UNDER) throw new Error(`lab: village: rays met only ${under.length} points under props`);
  const missed = through(maps, under);
  const lines = [
    `${feet.length} footprints, ${propsMet} with a prop met over grass: ${under.length} points under them, `
      + `${missed.length} where a blade could stand up through it`,
    ...throughLines(maps, missed).map((line) => `  ${line}`),
    'what the rays met: ' + [...countBy(under)].map(([by, n]) => `${by} ${n}`).join('; '),
  ];
  if (canary) {
    const foot = under[0].foot;
    const caught = through(withoutFoot(maps, foot), under.filter((point) => point.foot === foot)).length > 0;
    return { lines, problems: [], caught, moments: [] };
  }
  const moments = await pictures(lab);
  const problems = throughLines(maps, missed).map((line) => `grass through ${line}`);
  return { lines, problems, caught: null, moments };
}
