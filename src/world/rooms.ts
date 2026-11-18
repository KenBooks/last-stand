// The houses walked into from the village (data/houses.ts says which and what stands in each; game/rooms.ts takes the
// hero in and out): the house of records and the tavern, each a small room built once at boot beside the places and
// shown in the village's stead (`Arena.showRoom`), as the hall of heroes' room is. Each is a timber-framed room under
// beams, plastered over a panelled wainscot, on a plank floor, lit warm by a hearth's fire and a chandelier (its two
// lights casting the still shadows), candles, lanterns and sconces: as a biome, 10 point lights, two casting, so
// showing one compiles nothing the village's programs don't have; warmed with the `rooms` need (game/warmup.ts).
// The walls and the ceiling the camera stands outside of aren't drawn (`cutAway`): from above the room is seen as a
// dollhouse, and over the shoulder the camera's boom stops at the walls (`Room.wall`).
import * as THREE from 'three';
import type { Scholar } from '../entities/models/scholar';
import { HOUSES, ROOM_IDS, TROPHIES, type RoomId, type TrophyDef } from '../data/houses';
import type { EnemyId } from '../data/enemies';
import { ashlar, bannerCloth, boards, ctx2d, canvasOf, flagstone, granite, grunge, pbrMaterialMaps, textureFromCanvas, wood } from '../core/textures';
import { LAMP_SOFT } from '../core/lamps';
import { particles, col } from '../fx/particles';
import { mulberry, rand } from '../util';
import { bannerGeo, CRYPT_ENV } from './crypt';
import { buildFire, emberMat, type FireLog } from './fire';
import { boxWithUV, staticShadow, type BiomeLook, type Updater } from './props';
import { Wall } from './wall';
import { buildLibrary } from './library';
import { buildDoor, type Door } from './door';
import { buildShop } from './shop';
import { tavernKeeper, keeperTalk, type TavernKeeper } from './tavern';
import type { Keeper } from '../entities/models/keeper';
import type { Player } from '../entities/player';
import type { Relief } from './ground';
import type { Obstacle } from '../types';

/** A board of rows the house of records writes on a surface (a ledger's page, a board, a plaque): its title and each
 *  row's words and figure. */
export interface Board { title: string; rows: readonly (readonly [string, string])[] }

/** What the house of records shows: its boards (the bests by map and hero, the feats, the ledger's two pages) and how
 *  often each boss was slain. */
export interface RecordsShown {
  bests: Board; feats: Board; left: Board; right: Board;
  slain: Partial<Record<EnemyId, number>>;
}

/** A room as built: its look, its wall (the shell a body is kept in and the camera's boom stops at), what stands in it
 *  (circles), its floor, and its frame's step. */
export interface Room {
  id: RoomId;
  group: THREE.Group;
  look: BiomeLook;
  wall: Wall;
  obstacles: Obstacle[];
  relief: Relief;
  update(dt: number, t: number): void;
  /** the walls and the ceiling the camera at `eye` stands outside of left out of the frame */
  cutAway(eye: THREE.Vector3): void;
  /** which are cut away now: of 'back', 'front', 'west', 'east' and 'ceiling' (tools/lab `houses`) */
  cutNow(): string[];
  /** every part shown, the cut away walls and the trophies not yet won among them (a warm-up's draw: a hidden mesh
   *  compiles nothing) */
  showAll(): void;
  /** the house of records' boards written and its trophies hung (none in the tavern) */
  showRecords?(shown: RecordsShown): void;
  /** which bosses' trophies hang shown now (the house of records'; tools/lab `houses` reads it) */
  trophiesShown?(): Partial<Record<EnemyId, boolean>>;
  /** the folk who live in it seated (the library's scholar, the merchant's Odo): built on the heroes' heads and hands, so once their
   *  workers have made them (main.ts, before the rooms are warmed) */
  seatFolk?(): void;
  /** the library's scholar, once seated (tools/lab `houses`, `scholar`) */
  folk?(): Scholar | undefined;
  /** the tavern's keeper, once seated (tools/lab `tavern`) */
  keeper?(): Keeper | undefined;
  /** ale asked of the tavern's keeper by `hero` (world/tavern.ts): false if he's busy or not seated */
  serveAle?(hero: Player): boolean;
  /** the tavern's keeper and his mugs, whole (tools/lab `tavern`) */
  tavern?(): TavernKeeper;
  /** what goes on in it whether it's shown or not (the tavern's keeper at work), every frame */
  always?(dt: number): void;
}

/** A room's light: warm, from the fires, the windows' night faint. */
export const ROOM_LOOK: BiomeLook = {
  background: 0x0a0604,
  fog: { color: 0x0a0604, near: 18, far: 40 },
  hemi: { sky: 0x8a6a50, ground: 0x3a2618, intensity: 0.55 },
  moon: { color: 0xffd0a0, intensity: 0, pos: [-6, 30, 12] },
  env: CRYPT_ENV,
  envIntensity: 0.12,
};

/** how far past a wall's inner face the camera stands before that wall is cut away (m): the boom stops a little short
 *  of it over the shoulder, which must see it whole */
const OUTSIDE = 0.05;
/** how thick the walls are (m), the wainscot's height, the door's half width and height, the windows' */
const WALL_THICK = 0.3, WAINSCOT = 1.05, DOOR = { half: 0.6, high: 2.2 }, WINDOW = { half: 0.45, low: 1.2, high: 2.1 };

/** the fires' light: the hearth's (soft close to, as the village's bonfire), a chandelier's, a candle's, a lantern's */
const HEARTH = { color: 0xff9448, intensity: 40, reach: 12, soft: 6 };
const CHANDELIER = { color: 0xffc27a, intensity: 30, reach: 11 };
export const CANDLE = { color: 0xffb060, intensity: 2.4, reach: 3.6 };
export const LANTERN = { color: 0xffa860, intensity: 6.5, reach: 6.5 };

/** what a room's materials are */
export interface Mats {
  floor: THREE.MeshStandardMaterial; plaster: THREE.MeshStandardMaterial; timber: THREE.MeshStandardMaterial;
  panel: THREE.MeshStandardMaterial; oak: THREE.MeshStandardMaterial; stone: THREE.MeshStandardMaterial;
  hearthStone: THREE.MeshStandardMaterial; iron: THREE.MeshStandardMaterial; brass: THREE.MeshStandardMaterial;
  wax: THREE.MeshStandardMaterial; flame: THREE.MeshStandardMaterial; glow: THREE.MeshBasicMaterial;
  glass: THREE.MeshStandardMaterial; paper: THREE.MeshStandardMaterial; leather: THREE.MeshStandardMaterial;
  rug: THREE.MeshStandardMaterial; dark: THREE.MeshStandardMaterial;
}

function makeMats(): Mats {
  return {
    floor: new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(boards(), 1, 0.8), color: 0x9a7452 }),
    plaster: new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(grunge(), 1, 0.5), color: 0xe0c8a4 }),
    timber: new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(wood(), 1, 1), color: 0x4a3222 }),
    panel: new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(wood(), 1, 1), color: 0x6e4a2e }),
    oak: new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(wood(), 1, 1), color: 0x8a6440 }),
    stone: new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(ashlar(21, 6, 3), 1, 1.1), color: 0xb0a090 }),
    hearthStone: new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(flagstone(47, 5), 1, 1), color: 0x807468 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x222024, metalness: 0.85, roughness: 0.6 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc89a4a, metalness: 0.9, roughness: 0.38 }),
    wax: new THREE.MeshStandardMaterial({ color: 0xf2e6c8, roughness: 0.7 }),
    // (a flame is its fire, not a lit egg: the village's torches' look)
    flame: new THREE.MeshStandardMaterial({ color: 0x2a2014, roughness: 0.3, emissive: 0xffc070, emissiveIntensity: 1.1 }),
    glow: new THREE.MeshBasicMaterial({ color: 0xff8a30, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false }),
    // (night outside: a deep blue pane, a little lit)
    glass: new THREE.MeshStandardMaterial({ color: 0x0c1424, roughness: 0.2, metalness: 0.1, emissive: 0x1a2c50, emissiveIntensity: 0.35 }),
    paper: new THREE.MeshStandardMaterial({ color: 0xe8d8b0, roughness: 0.9 }),
    leather: new THREE.MeshStandardMaterial({ color: 0x5a2a1a, roughness: 0.65 }),
    rug: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x120c08, roughness: 0.9 }),
  };
}

/** A box `w` x `h` x `d` standing on (x, y, z) (its foot's middle), casting and taking shadows, added to `g`. */
export function box(g: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material,
  grained = true): THREE.Mesh {
  const mesh = new THREE.Mesh(boxWithUV(w, h, d, 0.5, grained), m);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

/** A cylinder standing on (x, y, z), added to `g`. */
export function drum(g: THREE.Object3D, rTop: number, rFoot: number, h: number, x: number, y: number, z: number, m: THREE.Material,
  sides = 14): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rFoot, h, sides), m);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

/** A pointed tongue of flame, `r` round and `h` tall (the village's torches' shape). */
function flameGeometry(r: number, h: number): THREE.BufferGeometry {
  const outline: THREE.Vector2[] = [];
  for (let k = 0; k <= 10; k++) {
    const t = k / 10;
    const wide = t < 0.2 ? Math.sin((t / 0.2) * Math.PI / 2) : Math.pow(1 - (t - 0.2) / 0.8, 1.6);
    outline.push(new THREE.Vector2(Math.max(r * wide, 0.0005), h * t));
  }
  return new THREE.LatheGeometry(outline, 8);
}
const FLAME = flameGeometry(0.014, 0.06), HALO = flameGeometry(0.03, 0.11);

/** A candle on (x, y, z): wax, a flame and its glow; and its light, if it has one (one of the room's ten). */
export function candle(g: THREE.Object3D, M: Mats, x: number, y: number, z: number, high = 0.16, light?: typeof CANDLE): void {
  drum(g, 0.022, 0.025, high, x, y, z, M.wax, 8).castShadow = false;
  const flame = new THREE.Mesh(FLAME, M.flame);
  flame.position.set(x, y + high + 0.004, z);
  const halo = new THREE.Mesh(HALO, M.glow);
  halo.position.set(x, y + high - 0.01, z);
  g.add(flame, halo);
  if (!light) return;
  const l = new THREE.PointLight(light.color, light.intensity, light.reach, 2 + LAMP_SOFT * 0.25);
  l.position.set(x, y + high + 0.12, z);
  g.add(l);
}

/** A wall lantern on the wall at (x, y, z), its arm out along (dx, dz): an iron frame round a glowing pane, its light. */
export function lantern(g: THREE.Object3D, M: Mats, x: number, y: number, z: number, dx: number, dz: number, lit = LANTERN): void {
  box(g, Math.abs(dz) > 0 ? 0.08 : 0.04, 0.3, Math.abs(dx) > 0 ? 0.08 : 0.04, x, y - 0.15, z, M.iron).castShadow = false;
  box(g, Math.abs(dx) * 0.32 + 0.04, 0.04, Math.abs(dz) * 0.32 + 0.04, x + dx * 0.16, y + 0.05, z + dz * 0.16, M.iron).castShadow = false;
  const at = new THREE.Vector3(x + dx * 0.32, y - 0.2, z + dz * 0.32);
  box(g, 0.2, 0.03, 0.2, at.x, at.y - 0.02, at.z, M.iron).castShadow = false;
  box(g, 0.22, 0.05, 0.22, at.x, at.y + 0.28, at.z, M.iron).castShadow = false;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    box(g, 0.02, 0.28, 0.02, at.x + sx * 0.09, at.y, at.z + sz * 0.09, M.iron).castShadow = false;
  }
  candle(g, M, at.x, at.y + 0.01, at.z, 0.1);
  const l = new THREE.PointLight(lit.color, lit.intensity, lit.reach, 2 + LAMP_SOFT * 0.5);
  l.position.set(at.x + dx * 0.15, at.y + 0.18, at.z + dz * 0.15);
  g.add(l);
}

/** how far under the ceiling the ridge beam's underside is (m: `shell`'s ridge, 0.24 deep from 0.5 down, under the
 *  cross beams) */
const RIDGE_UNDER = 0.5;
/** how far under the ceiling a cross beam's underside is (m: `shell`'s beams across the room, 0.26 deep, one every
 *  1.6 m from 0.9 in off the west wall) */
export const CROSS_UNDER = 0.26;
/** how much lower than the ceiling a chandelier under the ridge beam hangs (m): its candles' flames reach about 0.21
 *  over its wheel, which hangs 0.65 under the height it's given: 0.2 lower they stop 0.14 under the beam, where at the
 *  ceiling's height they reached 0.06 into it */
const CHANDELIER_DROP = 0.2;

/** A chandelier hung at (x, high, z): an iron wheel on chains, candles round it, its light (casting). Its four chains
 *  meet at `hook` over its middle (the ceiling's, `high`, unless it hangs from a beam's underside). */
export function chandelier(room: THREE.Object3D, M: Mats, x: number, high: number, z: number, hook = high): THREE.PointLight {
  const y = high - 0.65;
  // (its parts in a group of their own, named, for `lab houses` to hold them clear of the ceiling's beams)
  const g = new THREE.Group();
  g.name = 'chandelier';
  room.add(g);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.03, 6, 28).rotateX(Math.PI / 2), M.iron);
  ring.position.set(x, y, z);
  g.add(ring);
  const top = new THREE.Vector3(x, hook, z);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const foot = new THREE.Vector3(x + Math.cos(a) * 0.55, y, z + Math.sin(a) * 0.55);
    // (each chain from its point on the wheel to the hook, as long as that is)
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, foot.distanceTo(top), 4), M.iron);
    chain.position.copy(foot).add(top).multiplyScalar(0.5);
    chain.lookAt(top);
    chain.rotateX(Math.PI / 2);
    g.add(chain);
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    candle(g, M, x + Math.cos(a) * 0.55, y + 0.02, z + Math.sin(a) * 0.55, 0.13);
  }
  const l = new THREE.PointLight(CHANDELIER.color, CHANDELIER.intensity, CHANDELIER.reach, 2 + LAMP_SOFT * 0.5);
  l.position.set(x, y + 0.25, z);
  staticShadow(l);
  // (the light on the room itself, as it was: only the meshes are the group's)
  room.add(l);
  return l;
}

/** The room's shell: the floor, the walls (plaster over a panelled wainscot between timber posts, a door in the front,
 *  windows either side of it), the ceiling's planks on beams. Each wall and the ceiling in a group of its own (the
 *  cut away's), each added to the room's wall. */
function shell(g: THREE.Group, M: Mats, id: RoomId, wall: Wall): { sides: { group: THREE.Group; outside: (e: THREE.Vector3) => boolean }[]; door: Door } {
  const [hx, hz] = HOUSES[id].half, high = HOUSES[id].high;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(hx * 2 + 0.2, hz * 2 + 0.2).rotateX(-Math.PI / 2), M.floor);
  const uv = floor.geometry.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (hx * 2) * 0.5, uv.getY(k) * (hz * 2) * 0.5);
  floor.receiveShadow = true;
  g.add(floor);
  const sides: { group: THREE.Group; outside: (e: THREE.Vector3) => boolean }[] = [];
  // each wall in its own frame: x along it, its inner face at z = 0, facing +z (into the room)
  let door: Door | null = null;
  const walls: { length: number; at: THREE.Vector3; turn: number; door: boolean; windows: number[]; outside: (e: THREE.Vector3) => boolean }[] = [
    { length: hx * 2, at: new THREE.Vector3(0, 0, -hz), turn: 0, door: false, windows: [], outside: (e) => e.z < -hz - OUTSIDE },
    { length: hx * 2, at: new THREE.Vector3(0, 0, hz), turn: Math.PI, door: true, windows: [-hx * 0.55, hx * 0.55], outside: (e) => e.z > hz + OUTSIDE },
    { length: hz * 2, at: new THREE.Vector3(-hx, 0, 0), turn: Math.PI / 2, door: false, windows: [], outside: (e) => e.x < -hx - OUTSIDE },
    { length: hz * 2, at: new THREE.Vector3(hx, 0, 0), turn: -Math.PI / 2, door: false, windows: [], outside: (e) => e.x > hx + OUTSIDE },
  ];
  for (const [i, w] of walls.entries()) {
    const side = new THREE.Group();
    side.position.copy(w.at);
    side.rotation.y = w.turn;
    g.add(side);
    // (the back and front walls run past the corners; the side walls stop at their faces, and what runs along a side
    // wall stops short of the front's and the back's by its own depth: run into the corner, the two walls' tops, rails,
    // skirtings and plates lay in one plane there and flickered from above)
    const across = i >= 2, t = WALL_THICK, L = across ? w.length : w.length + t * 2;
    const short = (depth: number): number => (across ? depth : 0);
    // the plaster's body behind, in pieces round the door and windows
    const holes = [...(w.door ? [{ x: 0, half: DOOR.half, low: 0, high: DOOR.high }] : []),
      ...w.windows.map((x) => ({ x, half: WINDOW.half, low: WINDOW.low, high: WINDOW.high }))].sort((a, b) => a.x - b.x);
    let from = -L / 2;
    for (const hole of holes) {
      box(side, hole.x - hole.half - from, high, t, (from + hole.x - hole.half) / 2, 0, -t / 2, M.plaster, false);
      if (hole.low > 0) box(side, hole.half * 2, hole.low, t, hole.x, 0, -t / 2, M.plaster, false);
      box(side, hole.half * 2, high - hole.high, t, hole.x, hole.high, -t / 2, M.plaster, false);
      from = hole.x + hole.half;
    }
    box(side, L / 2 - from, high, t, (from + L / 2) / 2, 0, -t / 2, M.plaster, false);
    // the wainscot's panels and its rail, broken by the door
    // (stopped under the door's frame, which stands out past them all: ended in it a hand in, the skirting's face lay
    // in one plane with the frame's and flickered)
    const runs = w.door ? [[-w.length / 2, -DOOR.half - 0.1], [DOOR.half + 0.1, w.length / 2]] : [[-w.length / 2, w.length / 2]];
    const run = (a: number, b: number, depth: number, h: number, y: number, z: number, m: THREE.Material): void => {
      const from = a + (a <= -w.length / 2 ? short(depth) : 0), to = b - (b >= w.length / 2 ? short(depth) : 0);
      box(side, to - from, h, depth, (from + to) / 2, y, z, m);
    };
    for (const [a, b] of runs) {
      run(a, b, 0.04, WAINSCOT, 0, 0.02, M.panel);
      run(a, b, 0.07, 0.07, WAINSCOT, 0.035, M.timber);
      run(a, b, 0.09, 0.12, 0, 0.065 - 0.02, M.timber);
      // (its panels' stiles every 0.7 m)
      for (let x = a + 0.35; x < b - 0.2; x += 0.7) box(side, 0.06, WAINSCOT - 0.12, 0.03, x, 0.12, 0.055, M.timber);
    }
    // posts and a plate under the ceiling
    for (const x of [-w.length / 2 + 0.1, w.length / 2 - 0.1, ...(w.length > 8 ? [-w.length / 4, w.length / 4] : [])]) {
      if (holes.some((h) => Math.abs(h.x - x) < h.half + 0.2)) continue;
      // (up to the plate, not through it: their tops lay in one plane with the plate's, seen from above)
      box(side, 0.2, high - 0.2, 0.12, x, 0, 0.06, M.timber);
    }
    box(side, w.length - short(0.14) * 2, 0.2, 0.14, 0, high - 0.2, 0.07, M.timber);
    // the door in its frame, its reveal lined, shut (the night beyond: world/door.ts), and each window's casing, panes
    // and sill. (Its jambs stood half into the wall's thickness, their faces in one plane with the plaster's beside the
    // hole and under its head, which flickered against them seen from inside, from play)
    if (w.door) {
      door = buildDoor({ frame: M.timber, leaf: M.oak, iron: M.iron }, {
        wide: DOOR.half * 2, high: DOOR.high, leafZ: -0.12, hinge: 1, faces: 1, frame: true, lining: 0.03, deep: t,
      }, 3 + ROOM_IDS.indexOf(id));
      side.add(door.group);
    }
    for (const x of w.windows) {
      box(side, WINDOW.half * 2, WINDOW.high - WINDOW.low, 0.03, x, WINDOW.low, -t / 2, M.glass, false).castShadow = false;
      box(side, 0.05, WINDOW.high - WINDOW.low, 0.05, x, WINDOW.low, -t / 2 + 0.02, M.timber);
      box(side, WINDOW.half * 2, 0.05, 0.05, x, (WINDOW.low + WINDOW.high) / 2, -t / 2 + 0.02, M.timber);
      // (its casing on the wall's face, a hair off it: half into the wall, its faces lay in the hole's, as the door's did)
      for (const sx of [-1, 1]) box(side, 0.1, WINDOW.high - WINDOW.low + 0.1, 0.08, x + sx * (WINDOW.half + 0.05), WINDOW.low - 0.05, 0.042, M.timber);
      box(side, WINDOW.half * 2 + 0.3, 0.1, 0.1, x, WINDOW.high, 0.052, M.timber);
      box(side, WINDOW.half * 2 + 0.36, 0.06, 0.2, x, WINDOW.low - 0.07, 0.08, M.timber);
    }
    wall.add(side, false);
    sides.push({ group: side, outside: w.outside });
  }
  if (!door) throw new Error(`room ${id} has no door`);
  // the ceiling: planks over beams across the room, a ridge beam along it
  const ceiling = new THREE.Group();
  ceiling.name = 'ceiling';
  g.add(ceiling);
  box(ceiling, hx * 2 + 0.6, 0.08, hz * 2 + 0.6, 0, high, 0, M.panel);
  for (let x = -hx + 0.9; x < hx - 0.5; x += 1.6) box(ceiling, 0.22, 0.26, hz * 2, x, high - 0.26, 0, M.timber);
  box(ceiling, hx * 2, 0.24, 0.26, 0, high - 0.5, 0, M.timber);
  wall.add(ceiling, false);
  sides.push({ group: ceiling, outside: (e) => e.y > high - 0.05 });
  return { sides, door };
}

/** A hearth in the middle of a wall (the wall's frame: `side`, 0 its middle, facing +z): a stone chimney breast, its
 *  opening, logs on firedogs, its fire, a mantel; the fire's light (casting). Its circle into `obstacles`. */
export function hearth(g: THREE.Group, M: Mats, at: THREE.Vector3, turn: number, high: number, updaters: Updater[],
  obstacles: Obstacle[]): void {
  const h = new THREE.Group();
  h.position.copy(at);
  h.rotation.y = turn;
  g.add(h);
  const W = 2.0, D = 0.75, open = { half: 0.6, high: 1.0 };
  // the breast either side of and over the opening, to the ceiling
  for (const sx of [-1, 1]) box(h, W / 2 - open.half, open.high, D, sx * (open.half + (W / 2 - open.half) / 2), 0, D / 2, M.stone, false);
  box(h, W, high - open.high, D * 0.85, 0, open.high, D * 0.42, M.stone, false);
  // its back, the hearthstone before it, the mantel shelf
  box(h, open.half * 2, open.high, 0.1, 0, 0, 0.05, M.dark, false);
  box(h, W + 0.4, 0.06, 0.7, 0, 0, D + 0.3, M.hearthStone, false);
  box(h, W + 0.3, 0.1, 0.32, 0, open.high + 0.35, D + 0.06, M.timber);
  for (const sx of [-1, 1]) box(h, 0.12, 0.3, 0.2, sx * (W / 2 + 0.05), open.high + 0.05, D + 0.02, M.timber);
  // firedogs and logs
  const world = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), turn).add(at);
  for (const sx of [-1, 1]) box(h, 0.04, 0.22, 0.4, sx * 0.32, 0, 0.4, M.iron);
  const logs: FireLog[] = [];
  const char = emberMat(world(0, 0.15, 0.4), 0.5);
  for (const [x0, y0, z0, x1, y1, z1, r] of [[-0.42, 0.14, 0.32, 0.42, 0.14, 0.36, 0.07], [-0.4, 0.15, 0.5, 0.38, 0.16, 0.46, 0.065],
    [-0.2, 0.26, 0.42, 0.25, 0.27, 0.4, 0.055]] as const) {
    const from = world(x0, y0, z0), to = world(x1, y1, z1);
    logs.push({ from, to, radius: r * 0.9 });
    const len = from.distanceTo(to);
    const log = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), char);
    log.position.copy(from).add(to).multiplyScalar(0.5).sub(at).applyAxisAngle(new THREE.Vector3(0, 1, 0), -turn);
    log.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize()
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), -turn));
    log.castShadow = true;
    h.add(log);
  }
  const light = new THREE.PointLight(HEARTH.color, HEARTH.intensity, HEARTH.reach, 2 + HEARTH.soft);
  light.position.copy(world(0, 0.75, 1.1));
  staticShadow(light);
  g.add(light);
  buildFire(g, {
    at: world(0, 0.06, 0.42), radius: 0.42, height: 0.85, dish: 0, light, intensity: HEARTH.intensity,
    smoke: 0, smokeColour: 0x2a2826, embers: 4, logs, glow: 0.7,
  }, updaters);
  const o = world(0, 0, D / 2);
  obstacles.push({ x: o.x, z: o.z, r: 0.75, h: high });
}

/** A rug laid on the floor at (x, z), `w` by `d`, in a woven pattern of `colours`. */
export function rug(g: THREE.Object3D, M: Mats, x: number, z: number, w: number, d: number, colours: readonly string[], seed: number): void {
  const c = canvasOf(256, 256 * (d / w) | 0), cx = ctx2d(c), rng = mulberry(seed);
  const W = c.width, H = c.height;
  cx.fillStyle = colours[0]; cx.fillRect(0, 0, W, H);
  cx.strokeStyle = colours[1]; cx.lineWidth = 10; cx.strokeRect(14, 14, W - 28, H - 28);
  cx.strokeStyle = colours[2]; cx.lineWidth = 4; cx.strokeRect(30, 30, W - 60, H - 60);
  // (a lozenge in the middle, rows of small ones round it)
  cx.fillStyle = colours[1];
  const lozenge = (px: number, py: number, s: number) => { cx.beginPath(); cx.moveTo(px, py - s); cx.lineTo(px + s * 0.7, py); cx.lineTo(px, py + s); cx.lineTo(px - s * 0.7, py); cx.fill(); };
  lozenge(W / 2, H / 2, Math.min(W, H) * 0.25);
  cx.fillStyle = colours[2];
  lozenge(W / 2, H / 2, Math.min(W, H) * 0.12);
  for (let px = 50; px < W - 40; px += 26) { lozenge(px, 46, 6); lozenge(px, H - 46, 6); }
  // (worn: speckled lighter and darker)
  for (let k = 0; k < 1800; k++) {
    cx.fillStyle = rng() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,240,210,0.06)';
    cx.fillRect(rng() * W, rng() * H, 2, 2);
  }
  const m = M.rug.clone();
  m.map = textureFromCanvas(c);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), m);
  mesh.position.set(x, 0.006, z);
  mesh.receiveShadow = true;
  g.add(mesh);
}

/** A surface written on: a canvas `w` by `h` px on a plane `pw` by `ph` m, its material and how to write it. */
export interface Writing { mesh: THREE.Mesh; write(draw: (cx: CanvasRenderingContext2D, w: number, h: number) => void): void }
export function writing(M: Mats, w: number, h: number, pw: number, ph: number): Writing {
  const c = canvasOf(w, h), texture = textureFromCanvas(c);
  texture.anisotropy = 4;
  const m = M.paper.clone();
  m.map = texture;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), m);
  mesh.receiveShadow = true;
  return {
    mesh,
    write(draw) {
      const cx = ctx2d(c);
      cx.clearRect(0, 0, w, h);
      draw(cx, w, h);
      texture.needsUpdate = true;
    },
  };
}

export const DISPLAY = "'Cinzel', Georgia, serif", BODY = "'Alegreya Sans', 'Segoe UI', sans-serif";

/** A parchment's ground: warm paper, darker at its edges, speckled. */
export function parchment(cx: CanvasRenderingContext2D, w: number, h: number, seed: number): void {
  const g = cx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.7);
  g.addColorStop(0, '#f1e2bc'); g.addColorStop(1, '#b89462');
  cx.fillStyle = g; cx.fillRect(0, 0, w, h);
  const rng = mulberry(seed);
  for (let k = 0; k < 900; k++) {
    cx.fillStyle = `rgba(90,60,30,${0.03 + rng() * 0.05})`;
    cx.fillRect(rng() * w, rng() * h, 1 + rng() * 3, 1 + rng() * 2);
  }
}

/** A board's rows written on parchment: its title, a rule, each row's words left and figure right over a dotted
 *  leader, shrunk to fit. */
function writeBoard(cx: CanvasRenderingContext2D, w: number, h: number, b: Board, seed: number, edge = true): void {
  parchment(cx, w, h, seed);
  if (edge) { cx.strokeStyle = '#5a3a1a'; cx.lineWidth = 6; cx.strokeRect(10, 10, w - 20, h - 20); }
  const pad = w * 0.08;
  cx.fillStyle = '#3a200c';
  cx.textAlign = 'center';
  cx.textBaseline = 'top';
  cx.font = `700 ${Math.round(w * 0.075)}px ${DISPLAY}`;
  cx.fillText(b.title, w / 2, h * 0.05, w - pad * 2);
  const top = h * 0.05 + w * 0.1;
  cx.fillStyle = '#7a4a1a';
  cx.fillRect(pad, top, w - pad * 2, 3);
  const rows = Math.max(1, b.rows.length);
  const step = Math.min((h - top - h * 0.05) / rows, w * 0.085);
  const size = Math.round(step * 0.62);
  b.rows.forEach(([words, figure], i) => {
    const y = top + step * (i + 0.6);
    cx.textBaseline = 'middle';
    cx.font = `500 ${size}px ${BODY}`;
    cx.fillStyle = '#2e1a0a';
    cx.textAlign = 'left';
    cx.fillText(words, pad, y, w * 0.62);
    cx.font = `700 ${size}px ${DISPLAY}`;
    cx.textAlign = 'right';
    cx.fillStyle = '#5a1a0a';
    cx.fillText(figure, w - pad, y, w * 0.3);
    const left = pad + Math.min(cx.measureText(words).width, w * 0.62) + 8;
    const right = w - pad - Math.min(cx.measureText(figure).width, w * 0.3) - 8;
    cx.fillStyle = 'rgba(90,50,20,0.45)';
    for (let x = left; x < right; x += 9) cx.fillRect(x, y + size * 0.25, 2, 2);
  });
}

/** A frame of dark timber round a board hung on a wall (in the wall's frame, facing +z): its board's middle at (x, y). */
export function framed(g: THREE.Object3D, M: Mats, writing: Writing, x: number, y: number, pw: number, ph: number): void {
  box(g, pw + 0.16, ph + 0.16, 0.05, x, y - ph / 2 - 0.08, 0.025, M.timber);
  writing.mesh.position.set(x, y, 0.052);
  g.add(writing.mesh);
}

/** A wall's frame in the room: x along it from its middle, its inner face at z = 0, facing into the room. */
export function onWall(g: THREE.Group, id: RoomId, side: 'back' | 'front' | 'west' | 'east', along = 0): THREE.Group {
  const [hx, hz] = HOUSES[id].half, frame = new THREE.Group();
  if (side === 'back') { frame.position.set(along, 0, -hz); }
  if (side === 'front') { frame.position.set(-along, 0, hz); frame.rotation.y = Math.PI; }
  if (side === 'west') { frame.position.set(-hx, 0, -along); frame.rotation.y = Math.PI / 2; }
  if (side === 'east') { frame.position.set(hx, 0, along); frame.rotation.y = -Math.PI / 2; }
  g.add(frame);
  return frame;
}

/** A bookcase against a wall (its frame, facing +z) at x, `w` wide: its carcass, shelves, and books of every colour
 *  and height on them, one instanced mesh, some leaning. */
function bookcase(g: THREE.Object3D, M: Mats, x: number, w: number, high: number, rng: () => number): void {
  const D = 0.38, shelves = 5;
  for (const sx of [-1, 1]) box(g, 0.06, high, D, x + sx * (w / 2 - 0.03), 0, D / 2, M.panel);
  box(g, w, 0.06, D, x, high - 0.06, D / 2, M.panel);
  box(g, w, 0.02, 0.02, x, 0, 0.01, M.panel);
  box(g, w - 0.1, high, 0.02, x, 0, 0.012, M.timber);
  const rows: number[] = [];
  for (let k = 0; k < shelves; k++) {
    const y = 0.08 + k * (high - 0.2) / shelves;
    box(g, w - 0.1, 0.035, D - 0.02, x, y, D / 2, M.panel);
    rows.push(y + 0.035);
  }
  const books: THREE.Matrix4[] = [], colours: THREE.Color[] = [];
  const palette = [0x6a1a14, 0x1e3a24, 0x23304e, 0x5a3a14, 0x3a1830, 0x7a5a20, 0x2a2a2a, 0x4a1a0a, 0x284a4a];
  const shelfH = (high - 0.2) / shelves;
  for (const y of rows) {
    let at = x - w / 2 + 0.1;
    while (at < x + w / 2 - 0.12) {
      const thick = 0.03 + rng() * 0.04, tall = Math.min(shelfH - 0.06, 0.18 + rng() * 0.14), deep = 0.18 + rng() * 0.08;
      if (rng() < 0.06) { at += 0.06; continue; }
      const lean = rng() < 0.08 ? 0.25 : 0;
      books.push(new THREE.Matrix4().compose(new THREE.Vector3(at + thick / 2 + lean * 0.05, y + tall / 2, deep / 2 + 0.04),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -lean)), new THREE.Vector3(thick, tall, deep)));
      colours.push(new THREE.Color(palette[(rng() * palette.length) | 0]).multiplyScalar(0.7 + rng() * 0.5));
      at += thick + 0.004;
    }
  }
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M.leather, books.length);
  books.forEach((m, i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, colours[i]); });
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);
}

/** A table on its legs at (x, z), `w` by `d` and `high`, its top oak. Its circles into `obstacles`. */
export function table(g: THREE.Object3D, M: Mats, x: number, z: number, w: number, d: number, obstacles: Obstacle[], high = 0.76,
  round = false): void {
  if (round) {
    drum(g, w / 2, w / 2, 0.06, x, high - 0.06, z, M.oak, 24);
    drum(g, 0.07, 0.09, high - 0.06, x, 0, z, M.timber, 10);
    drum(g, w * 0.25, w * 0.3, 0.06, x, 0, z, M.timber, 14);
    obstacles.push({ x, z, r: w / 2 + 0.05, h: high });
    return;
  }
  box(g, w, 0.06, d, x, high - 0.06, z, M.oak);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.07, high - 0.06, 0.07, x + sx * (w / 2 - 0.1), 0, z + sz * (d / 2 - 0.1), M.timber);
  for (const sz of [-1, 1]) box(g, w - 0.24, 0.06, 0.04, x, 0.2, z + sz * (d / 2 - 0.1), M.timber);
  const along = w > d, n = Math.max(1, Math.round(Math.max(w, d) / Math.min(w, d)));
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n - 0.5;
    obstacles.push({ x: x + (along ? t * w : 0), z: z + (along ? 0 : t * d), r: Math.min(w, d) / 2 + 0.12, h: high });
  }
}

/** A bench at (x, z), `w` long along x (turned `turn`). */
export function bench(g: THREE.Object3D, M: Mats, x: number, z: number, w: number, turn = 0): void {
  const b = new THREE.Group();
  b.position.set(x, 0, z);
  b.rotation.y = turn;
  g.add(b);
  box(b, w, 0.06, 0.32, 0, 0.42, 0, M.oak);
  for (const sx of [-1, 1]) box(b, 0.06, 0.42, 0.28, sx * (w / 2 - 0.15), 0, 0, M.timber);
}

/** A stool at (x, z). */
export function stool(g: THREE.Object3D, M: Mats, x: number, z: number, high = 0.5): void {
  drum(g, 0.17, 0.17, 0.05, x, high - 0.05, z, M.oak, 12);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, high - 0.05, 5), M.timber);
    leg.position.set(x + Math.cos(a) * 0.11, (high - 0.05) / 2, z + Math.sin(a) * 0.11);
    leg.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12);
    leg.castShadow = true;
    g.add(leg);
  }
}

/** A barrel on its side or standing at (x, y, z): staves and iron hoops. */
export function barrel(g: THREE.Object3D, M: Mats, x: number, y: number, z: number, lying = false, turn = 0): void {
  const b = new THREE.Group();
  b.position.set(x, y, z);
  b.rotation.set(lying ? Math.PI / 2 : 0, turn, 0);
  if (lying) b.position.y += 0.3;
  g.add(b);
  const outline = [[0.24, -0.4], [0.29, -0.2], [0.31, 0], [0.29, 0.2], [0.24, 0.4]].map(([r, yy]) => new THREE.Vector2(r, yy));
  const staves = new THREE.Mesh(new THREE.LatheGeometry(outline, 16), M.oak);
  staves.castShadow = staves.receiveShadow = true;
  b.add(staves);
  for (const yy of [-0.39, 0.39]) {
    const head = new THREE.Mesh(new THREE.CircleGeometry(0.24, 16).rotateX(yy > 0 ? -Math.PI / 2 : Math.PI / 2), M.panel);
    head.position.y = yy;
    b.add(head);
  }
  for (const yy of [-0.3, -0.12, 0.12, 0.3]) {
    const r = 0.24 + (0.31 - 0.24) * (1 - Math.abs(yy) / 0.4) + 0.005;
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 4, 20).rotateX(Math.PI / 2), M.iron);
    hoop.position.y = yy;
    b.add(hoop);
  }
  if (!lying) b.position.y += 0.4;
}

/** A tankard at (x, y, z). */
export function tankard(g: THREE.Object3D, M: Mats, x: number, y: number, z: number, metal = false): void {
  drum(g, 0.045, 0.05, 0.13, x, y, z, metal ? M.brass : M.oak, 10).castShadow = false;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.009, 4, 10, Math.PI), metal ? M.brass : M.iron);
  handle.position.set(x + 0.05, y + 0.07, z);
  handle.rotation.z = -Math.PI / 2;
  g.add(handle);
}

/** A banner hung from an iron rod at (x, top) on a wall (its frame), in `base` velvet. */
export function banner(g: THREE.Object3D, M: Mats, x: number, top: number, base: readonly number[], rng: () => number, scale = 0.8): void {
  const cloth = bannerCloth(256, 512, base);
  const velvet = new THREE.MeshPhysicalMaterial({
    map: cloth, roughness: 0.9, sheen: 1, sheenColorMap: cloth, sheenColor: new THREE.Color(1.6, 1.6, 1.6),
    sheenRoughness: 0.4, side: THREE.DoubleSide,
  });
  const hung = new THREE.Mesh(bannerGeo(rng).rotateY(Math.PI).scale(scale, scale, scale), velvet);
  hung.position.set(x, top, 0.12);
  hung.castShadow = hung.receiveShadow = true;
  g.add(hung);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9 * scale + 0.2, 8).rotateZ(Math.PI / 2), M.iron);
  rod.position.set(x, top + 0.03, 0.12);
  g.add(rod);
}

/** The Chronicle's lectern, in its frame (its reader at +z): a stepped octagonal base, a turned column with a brass
 *  name plate, carved brackets under a slanted desk with a lip and cheeks, a thick book open on it (its pages inked, a
 *  red initial, a ribbon, brass corners), an inkwell and a quill on a ledge, and a candle on a brass arm (its light one
 *  of the room's ten). */
function chronicleStand(g: THREE.Object3D, M: Mats): void {
  // (the base: two octagonal steps, a brass band between)
  drum(g, 0.3, 0.33, 0.07, 0, 0, 0, M.timber, 8);
  drum(g, 0.23, 0.26, 0.06, 0, 0.07, 0, M.panel, 8);
  drum(g, 0.235, 0.235, 0.012, 0, 0.13, 0, M.brass, 8).castShadow = false;
  // (the column, turned: a foot, a long belly, rings, a neck under the capital)
  const profile = [[0.0, 0.0], [0.12, 0.0], [0.12, 0.03], [0.085, 0.06], [0.07, 0.12], [0.08, 0.2], [0.09, 0.3], [0.075, 0.42],
    [0.055, 0.5], [0.07, 0.53], [0.07, 0.56], [0.05, 0.6], [0.05, 0.7], [0.075, 0.73], [0.075, 0.76], [0.05, 0.79], [0.0, 0.79]];
  const column = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 16), M.panel);
  column.position.y = 0.142;
  column.castShadow = column.receiveShadow = true;
  g.add(column);
  for (const y of [0.142 + 0.545, 0.142 + 0.745]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.008, 6, 20).rotateX(Math.PI / 2), M.brass);
    ring.position.y = y;
    g.add(ring);
  }
  // (a brass plate on its front, the Chronicle's name)
  const plate = writing(M, 256, 96, 0.13, 0.05);
  const brass = plate.mesh.material as THREE.MeshStandardMaterial;
  brass.metalness = 0.6;
  brass.roughness = 0.4;
  plate.write((cx, w, h) => {
    cx.fillStyle = '#c89a4a'; cx.fillRect(0, 0, w, h);
    cx.strokeStyle = '#6a4a14'; cx.lineWidth = 6; cx.strokeRect(5, 5, w - 10, h - 10);
    cx.fillStyle = '#3a2408'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.font = `700 40px ${DISPLAY}`;
    cx.fillText('CHRONICLE', w / 2, h / 2 + 2, w - 24);
  });
  plate.mesh.position.set(0, 0.48, 0.093);
  g.add(plate.mesh);
  // (the capital and two carved brackets under the desk)
  box(g, 0.34, 0.05, 0.26, 0, 0.93, 0, M.timber);
  for (const sx of [-1, 1]) {
    const bracket = box(g, 0.04, 0.16, 0.18, sx * 0.13, 0.86, 0, M.timber);
    bracket.rotation.z = sx * 0.35;
  }
  // (the desk, slanted to its reader: a board, a lip along its foot, cheeks either side)
  const desk = new THREE.Group();
  desk.position.y = 1.03;
  desk.rotation.x = 0.33;
  g.add(desk);
  box(desk, 0.66, 0.035, 0.48, 0, -0.035, 0, M.panel);
  box(desk, 0.66, 0.06, 0.035, 0, -0.035, 0.24, M.timber);
  for (const sx of [-1, 1]) box(desk, 0.03, 0.05, 0.48, sx * 0.345, -0.035, 0, M.timber);
  // (the book: its cover, two thick stacks of pages bowed to the spine, its pages inked)
  const cover = new THREE.MeshStandardMaterial({ color: 0x5a1814, roughness: 0.6 });
  box(desk, 0.6, 0.014, 0.4, 0, 0, 0, cover);
  for (const [sx, cx] of [[-1, -0.3], [1, 0.3]] as const) {
    for (const cz of [-0.2, 0.2]) box(desk, 0.035, 0.016, 0.035, cx - sx * 0.015, 0.004, cz - Math.sign(cz) * 0.015, M.brass).castShadow = false;
  }
  const pageTint = new THREE.MeshStandardMaterial({ color: 0xe6d6b0, roughness: 0.9 });
  for (const sx of [-1, 1]) {
    const stack = box(desk, 0.27, 0.04, 0.36, sx * 0.142, 0.012, 0, pageTint);
    stack.rotation.z = -sx * 0.07;
    const page = writing(M, 256, 340, 0.265, 0.355);
    page.mesh.rotation.set(-Math.PI / 2, 0, 0);
    page.mesh.rotation.y = -sx * 0.07;
    page.mesh.position.set(sx * 0.142, 0.054 + 0.004, 0);
    page.write((cx, w, h) => inkedPage(cx, w, h, sx < 0, sx < 0 ? 41 : 43));
    desk.add(page.mesh);
  }
  // (the spine's hollow, and a red ribbon from it down over the lip)
  box(desk, 0.02, 0.03, 0.36, 0, 0.012, 0, cover);
  const ribbon = new THREE.MeshStandardMaterial({ color: 0x9a1a1a, roughness: 0.7, side: THREE.DoubleSide });
  const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.018, 0.2), ribbon);
  tail.position.set(0.02, 0.02, 0.24);
  tail.rotation.set(-0.5, 0, 0.05);
  desk.add(tail);
  // (a ledge on its left with an inkwell and a quill)
  box(g, 0.14, 0.025, 0.14, -0.48, 0.98, -0.02, M.timber);
  box(g, 0.03, 0.08, 0.03, -0.44, 0.9, -0.02, M.timber).rotation.z = 0.6;
  drum(g, 0.03, 0.035, 0.05, -0.48, 1.005, -0.02, M.dark, 10);
  drum(g, 0.012, 0.012, 0.012, -0.48, 1.055, -0.02, M.brass, 8);
  const quill = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.24, 6), new THREE.MeshStandardMaterial({ color: 0xf0ece0, roughness: 0.8 }));
  quill.position.set(-0.51, 1.16, -0.04);
  quill.rotation.set(0.25, 0, 0.35);
  quill.castShadow = true;
  g.add(quill);
  // (the candle on a brass arm out of the column's right, out past the desk's cheek so its flame stands clear of the
  // book (under the desk's edge it stood through the pages), wax run down it)
  const ARM = { x: 0.5, y: 0.8, up: 0.2 };
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, ARM.x - 0.05, 8).rotateZ(Math.PI / 2), M.brass);
  bar.position.set((ARM.x + 0.05) / 2, ARM.y, 0);
  g.add(bar);
  drum(g, 0.012, 0.012, ARM.up, ARM.x, ARM.y, 0, M.brass, 8);
  const scroll = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 12, Math.PI), M.brass);
  scroll.position.set(ARM.x - 0.05, ARM.y, 0);
  scroll.rotation.z = Math.PI;
  g.add(scroll);
  const dish = ARM.y + ARM.up;
  drum(g, 0.055, 0.03, 0.025, ARM.x, dish, 0, M.brass, 12);
  candle(g, M, ARM.x, dish + 0.025, 0, 0.17, CANDLE);
  for (const [dx, dz, len] of [[0.02, 0.01, 0.06], [-0.018, 0.012, 0.04], [0.004, -0.022, 0.08]]) {
    drum(g, 0.006, 0.008, len, ARM.x + dx, dish + 0.025 + 0.17 - len - 0.01, dz, M.wax, 6).castShadow = false;
  }
}

/** A page of the Chronicle in a scribe's hand: a red initial on the left page, rows of ink as words, a rule or two. */
export function inkedPage(cx: CanvasRenderingContext2D, w: number, h: number, initial: boolean, seed: number): void {
  const rng = mulberry(seed);
  const ground = cx.createLinearGradient(initial ? w : 0, 0, initial ? 0 : w, 0);
  ground.addColorStop(0, '#d8c498'); ground.addColorStop(0.15, '#efe2c0'); ground.addColorStop(1, '#e8d8b0');
  cx.fillStyle = ground; cx.fillRect(0, 0, w, h);
  const margin = 26;
  let top = margin + 10;
  if (initial) {
    cx.fillStyle = '#8a1a14';
    cx.fillRect(margin, top - 6, 46, 50);
    cx.fillStyle = '#e8c070';
    cx.font = `700 44px ${DISPLAY}`;
    cx.textBaseline = 'top';
    cx.fillText('C', margin + 8, top - 2);
  }
  cx.fillStyle = 'rgba(40,24,10,0.82)';
  for (let row = 0; top < h - margin; row++, top += 14) {
    const from = initial && row < 4 ? margin + 56 : margin;
    let x = from;
    while (x < w - margin - 10) {
      const word = 8 + rng() * 26;
      cx.fillRect(x, top + 4 + rng(), Math.min(word, w - margin - x), 2.2);
      if (rng() < 0.4) cx.fillRect(x + 2, top + 1, 1.5, 4);
      x += word + 5;
    }
    if (rng() < 0.08) top += 8;
  }
}

/** Two axes crossed behind a round shield on a wall (its frame, facing +z), centred at (x, y). */
function crossedAxes(g: THREE.Object3D, M: Mats, x: number, y: number): void {
  for (const d of [-1, 1]) {
    const axe = new THREE.Group();
    axe.position.set(x, y, 0.08);
    axe.rotation.z = d * 0.75;
    g.add(axe);
    const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 1.1, 8), M.oak);
    haft.castShadow = true;
    axe.add(haft);
    const head = new THREE.Shape();
    head.moveTo(0, -0.06); head.lineTo(0.12, -0.12); head.quadraticCurveTo(0.2, 0, 0.12, 0.12); head.lineTo(0, 0.06);
    const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(head, { depth: 0.02, bevelEnabled: false }), M.iron);
    blade.position.set(d * 0.02, 0.45, -0.01);
    blade.scale.x = d;
    blade.castShadow = true;
    axe.add(blade);
  }
  const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.05, 24).rotateX(Math.PI / 2), M.panel);
  shield.position.set(x, y, 0.13);
  shield.castShadow = true;
  g.add(shield);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.02, 6, 24), M.iron);
  rim.position.set(x, y, 0.16);
  g.add(rim);
  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), M.brass);
  boss.position.set(x, y, 0.16);
  g.add(boss);
}

/** A shelf on a wall (its frame) at (x, y), `w` long: plates stood on edge against the wall, jugs and cups between. */
function plateShelf(g: THREE.Object3D, M: Mats, x: number, y: number, w: number, rng: () => number): void {
  box(g, w, 0.04, 0.24, x, y, 0.12, M.oak);
  for (const sx of [-1, 1]) box(g, 0.04, 0.16, 0.2, x + sx * (w / 2 - 0.1), y - 0.16, 0.1, M.timber);
  const clay = new THREE.MeshStandardMaterial({ color: 0xb87a4a, roughness: 0.7 });
  const pewter = new THREE.MeshStandardMaterial({ color: 0x9a9890, metalness: 0.7, roughness: 0.45 });
  for (let at = x - w / 2 + 0.16; at < x + w / 2 - 0.12;) {
    if (rng() < 0.55) {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.02, 20).rotateX(Math.PI / 2 - 0.15), rng() < 0.5 ? pewter : clay);
      plate.position.set(at + 0.07, y + 0.17, 0.05);
      plate.castShadow = true;
      g.add(plate);
      at += 0.3;
    } else {
      const outline = [[0.0, 0], [0.06, 0], [0.075, 0.06], [0.065, 0.14], [0.035, 0.19], [0.04, 0.22], [0, 0.22]].map(([r, h]) => new THREE.Vector2(r, h));
      const jug = new THREE.Mesh(new THREE.LatheGeometry(outline, 12), clay);
      jug.position.set(at + 0.06, y + 0.04, 0.12);
      jug.castShadow = true;
      g.add(jug);
      at += 0.2;
    }
  }
}

/** Bunches of dried herbs hung from a beam at (x, y, z), `n` of them along x. */
function herbs(g: THREE.Object3D, x: number, y: number, z: number, n: number, rng: () => number): void {
  const greens = [0x5a6a30, 0x7a7a3a, 0x6a5a30, 0x8a6a4a];
  for (let k = 0; k < n; k++) {
    const m = new THREE.MeshStandardMaterial({ color: greens[k % greens.length], roughness: 0.95 });
    const bunch = new THREE.Mesh(new THREE.ConeGeometry(0.07 + rng() * 0.03, 0.32 + rng() * 0.12, 7).rotateX(Math.PI), m);
    bunch.position.set(x + k * 0.32 + (rng() - 0.5) * 0.06, y - 0.32, z + (rng() - 0.5) * 0.1);
    bunch.rotation.z = (rng() - 0.5) * 0.2;
    bunch.castShadow = true;
    g.add(bunch);
    const tie = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.14, 4), m);
    tie.position.set(bunch.position.x, y - 0.08, bunch.position.z);
    g.add(tie);
  }
}

/** A painted sign hung on a wall (its frame) at (x, y): the house's name in gold on dark boards. */
function sign(g: THREE.Object3D, M: Mats, x: number, y: number, words: string, sub: string): void {
  const board = writing(M, 768, 192, 2.2, 0.55);
  board.write((cx, w, h) => {
    const wood = cx.createLinearGradient(0, 0, 0, h);
    wood.addColorStop(0, '#3a2414'); wood.addColorStop(1, '#24160c');
    cx.fillStyle = wood; cx.fillRect(0, 0, w, h);
    for (let yy = 0; yy < h; yy += 48) { cx.fillStyle = 'rgba(0,0,0,0.35)'; cx.fillRect(0, yy, w, 3); }
    cx.strokeStyle = '#c99a48'; cx.lineWidth = 6; cx.strokeRect(10, 10, w - 20, h - 20);
    cx.fillStyle = '#e8c070'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.font = `700 ${Math.round(h * 0.42)}px ${DISPLAY}`;
    cx.fillText(words, w / 2, h * 0.42, w - 60);
    cx.font = `italic 500 ${Math.round(h * 0.16)}px ${BODY}`;
    cx.fillStyle = '#c8a060';
    cx.fillText(sub, w / 2, h * 0.78, w - 60);
  });
  framed(g, M, board, x, y, 2.2, 0.55);
}

// ---------------------------------------------------------------------------------------------------------------------
// The trophies

/** A trophy's look built on its mount, in its frame (facing +z, its middle at the origin, about 0.9 m across). */
const TROPHY_LOOKS: Record<TrophyDef['look'], (g: THREE.Group, def: TrophyDef, M: Mats) => void> = {
  // a stone face, cracked, its eye sockets deep and a faint glow left in them
  mask(g, def) {
    const stone = new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(granite(7), 1, 1.2), color: def.colour, roughness: 0.8 });
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.34, 28, 20, 0, Math.PI), stone);
    face.scale.set(1, 1.3, 0.55);
    face.castShadow = face.receiveShadow = true;
    g.add(face);
    const darkness = new THREE.MeshStandardMaterial({ color: 0x08060a, roughness: 1 });
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.09, 0.12), stone);
    brow.position.set(0, 0.12, 0.17);
    brow.castShadow = true;
    g.add(brow);
    const eye = new THREE.MeshStandardMaterial({ color: 0x100818, emissive: def.trim, emissiveIntensity: 0.9 });
    for (const sx of [-1, 1]) {
      const socket = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), darkness);
      socket.scale.set(1.3, 0.8, 0.5);
      socket.position.set(sx * 0.12, 0.04, 0.17);
      g.add(socket);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), eye);
      glint.position.set(sx * 0.12, 0.04, 0.19);
      g.add(glint);
    }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4), stone);
    nose.position.set(0, -0.06, 0.2);
    nose.rotation.x = 0.35;
    g.add(nose);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.025, 0.05), darkness);
    mouth.position.set(0, -0.22, 0.16);
    g.add(mouth);
    // (a crack down from the brow, across the cheek)
    for (const [x, y, a, l] of [[0.05, 0.22, 0.2, 0.18], [0.09, 0.07, -0.5, 0.14], [0.17, -0.06, 0.3, 0.16], [-0.2, -0.1, -0.15, 0.12]]) {
      const crack = new THREE.Mesh(new THREE.BoxGeometry(0.012, l, 0.02), darkness);
      crack.position.set(x, y, 0.185 - Math.abs(x) * 0.25);
      crack.rotation.z = a;
      g.add(crack);
    }
    // (two stubs of horn at its temples)
    for (const sx of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 8), stone);
      horn.position.set(sx * 0.3, 0.28, 0.05);
      horn.rotation.z = -sx * 0.7;
      horn.castShadow = true;
      g.add(horn);
    }
  },
  // a heartwood knot and two great thorned antlers branching from it, a green glow in the knot
  antlers(g, def) {
    const bark = new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(wood(), 1, 1.2), color: def.colour, roughness: 0.8 });
    const knot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 1), bark);
    knot.scale.set(1.2, 1, 0.7);
    knot.castShadow = true;
    g.add(knot);
    const heart = new THREE.MeshStandardMaterial({ color: 0x0a1a06, emissive: def.trim, emissiveIntensity: 0.8, roughness: 0.4 });
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), heart);
    gem.position.set(0, 0, 0.11);
    g.add(gem);
    const limb = (from: THREE.Vector3, to: THREE.Vector3, r: number) => {
      const len = from.distanceTo(to);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r, len, 7), bark);
      m.position.copy(from).add(to).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
      m.castShadow = true;
      g.add(m);
    };
    const thorn = (at: THREE.Vector3, way: THREE.Vector3) => {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.08, 5), bark);
      m.position.copy(at).addScaledVector(way, 0.035);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), way);
      g.add(m);
    };
    for (const sx of [-1, 1]) {
      const pts = [new THREE.Vector3(sx * 0.12, 0.06, 0), new THREE.Vector3(sx * 0.3, 0.2, 0.03), new THREE.Vector3(sx * 0.42, 0.42, 0.02),
        new THREE.Vector3(sx * 0.46, 0.66, -0.02)];
      for (let k = 0; k < pts.length - 1; k++) limb(pts[k], pts[k + 1], 0.06 - k * 0.012);
      // (tines off it, up and out)
      for (const [k, dx, dy] of [[1, 0.02, 0.2], [2, 0.12, 0.14], [2, -0.1, 0.18]] as const) {
        const at = pts[k], end = at.clone().add(new THREE.Vector3(sx * dx, dy, 0.02));
        limb(at, end, 0.03);
        thorn(end.clone().lerp(at, 0.4), new THREE.Vector3(sx * 0.6, 0.2, 0.3).normalize());
      }
      for (let k = 0; k < 3; k++) thorn(pts[k].clone().lerp(pts[k + 1], 0.5), new THREE.Vector3(-sx * 0.3, 0.5, 0.6).normalize());
    }
  },
  // a heater shield in the boss's colours: needs nothing else of a new boss
  crest(g, def, M) {
    const s = new THREE.Shape();
    s.moveTo(-0.3, 0.32); s.lineTo(0.3, 0.32); s.lineTo(0.3, 0.02); s.quadraticCurveTo(0.28, -0.26, 0, -0.42);
    s.quadraticCurveTo(-0.28, -0.26, -0.3, 0.02); s.lineTo(-0.3, 0.32);
    const field = new THREE.MeshStandardMaterial({ color: def.colour, roughness: 0.6, metalness: 0.2 });
    const shield = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 }), field);
    shield.castShadow = true;
    g.add(shield);
    const charge = new THREE.MeshStandardMaterial({ color: 0x1a1410, emissive: def.trim, emissiveIntensity: 0.6, metalness: 0.5, roughness: 0.4 });
    for (const a of [0.7, -0.7]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.6, 0.03), charge);
      bar.position.set(0, -0.02, 0.08);
      bar.rotation.z = a;
      g.add(bar);
    }
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), M.brass);
    boss.position.set(0, -0.02, 0.1);
    g.add(boss);
  },
};

/** A trophy's place on the back wall: its mount, the trophy (shown once its boss is slain), its plaque. */
interface Hung { boss: EnemyId; def: TrophyDef; trophy: THREE.Group; plaque: Writing; slain: number }

/** Every trophy in `TROPHIES` hung along the back wall (its frame) between `from` and `to`, each on a shield of dark
 *  timber, a brass plaque under it, a light over the row. */
function trophies(g: THREE.Group, M: Mats, from: number, to: number, y: number): Hung[] {
  const entries = Object.entries(TROPHIES) as [EnemyId, TrophyDef][];
  const s = new THREE.Shape();
  s.moveTo(-0.5, 0.5); s.lineTo(0.5, 0.5); s.lineTo(0.5, 0); s.quadraticCurveTo(0.45, -0.45, 0, -0.62);
  s.quadraticCurveTo(-0.45, -0.45, -0.5, 0); s.lineTo(-0.5, 0.5);
  const mountGeo = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.02, bevelSegments: 2 });
  return entries.map(([boss, def], i) => {
    const x = entries.length === 1 ? (from + to) / 2 : from + ((to - from) * i) / (entries.length - 1);
    const mount = new THREE.Mesh(mountGeo, M.timber);
    mount.position.set(x, y, 0.02);
    mount.castShadow = mount.receiveShadow = true;
    g.add(mount);
    // (a brass edge round it, a shield a little larger behind)
    const rim = new THREE.Mesh(mountGeo, M.brass);
    rim.scale.set(1.07, 1.06, 0.5);
    rim.position.set(x, y + 0.004, 0.005);
    g.add(rim);
    const trophy = new THREE.Group();
    trophy.position.set(x, y + 0.02, 0.16);
    TROPHY_LOOKS[def.look](trophy, def, M);
    g.add(trophy);
    const plaque = writing(M, 384, 128, 0.62, 0.21);
    (plaque.mesh.material as THREE.MeshStandardMaterial).metalness = 0.6;
    (plaque.mesh.material as THREE.MeshStandardMaterial).roughness = 0.45;
    box(g, 0.68, 0.27, 0.03, x, y - 0.98, 0.015, M.timber);
    plaque.mesh.position.set(x, y - 0.845, 0.035);
    g.add(plaque.mesh);
    return { boss, def, trophy, plaque, slain: -1 };
  });
}

/** A plaque's words: the trophy's name and how often its boss fell, or the mount still waiting. */
function writePlaque(h: Hung): void {
  h.plaque.write((cx, w, hh) => {
    const g = cx.createLinearGradient(0, 0, 0, hh);
    g.addColorStop(0, '#e6c070'); g.addColorStop(0.5, '#b88a3a'); g.addColorStop(1, '#8a6224');
    cx.fillStyle = g; cx.fillRect(0, 0, w, hh);
    cx.strokeStyle = '#5a3a10'; cx.lineWidth = 5; cx.strokeRect(6, 6, w - 12, hh - 12);
    cx.fillStyle = '#2a1806';
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.font = `700 30px ${DISPLAY}`;
    cx.fillText(h.slain > 0 ? h.def.name : 'Awaiting a Trophy', w / 2, hh * 0.38, w - 30);
    cx.font = `600 26px ${BODY}`;
    cx.fillText(h.slain > 0 ? `Slain ${h.slain} ${h.slain === 1 ? 'time' : 'times'}` : 'This foe still stands', w / 2, hh * 0.72, w - 30);
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// The rooms

/** the shell's walls and its ceiling by name, in the order it builds them */
const SIDE_NAMES = ['back', 'front', 'west', 'east', 'ceiling'] as const;

/** What both rooms share as they're built. */
export interface Build { g: THREE.Group; M: Mats; wall: Wall; obstacles: Obstacle[]; updaters: Updater[]; rng: () => number;
  sides: { group: THREE.Group; outside: (e: THREE.Vector3) => boolean }[]; door: Door }

export function begin(id: RoomId, group: THREE.Group, seed: number): Build {
  const M = makeMats(), wall = new Wall('village');
  const { sides, door } = shell(group, M, id, wall);
  return { g: group, M, wall, obstacles: [], updaters: [], rng: mulberry(seed), sides, door };
}

/** A room as built, its walls sealed. */
export function finish(id: RoomId, b: Build, extra: Partial<Room> = {}): Room {
  b.wall.seal();
  const [hx, hz] = HOUSES[id].half;
  // (motes of dust drifting in the firelight)
  let due = 0;
  b.updaters.push((dt) => {
    due += dt * 4;
    for (; due >= 1; due--) {
      particles.glow.spawn({
        x: rand(-hx + 0.5, hx - 0.5), y: rand(0.6, 2.6), z: rand(-hz + 0.5, hz - 0.5),
        vx: rand(-0.03, 0.03), vy: rand(-0.01, 0.04), vz: rand(-0.03, 0.03),
        life: rand(4, 7), size: rand(0.008, 0.014), sizeEnd: 0.005,
        color: col(0xffd8a8, 0.45), colorEnd: col(0xffb070, 0.08), gravity: 0, drag: 0.2,
      });
    }
  });
  return {
    id, group: b.g, look: ROOM_LOOK, wall: b.wall, obstacles: b.obstacles,
    relief: { half: 1, cell: 1, n: 2, heights: new Float32Array(4), dais: false },
    update(dt, t) { for (const u of b.updaters) u(dt, t); },
    cutAway(eye) { for (const s of b.sides) s.group.visible = !s.outside(eye); },
    showAll() { for (const s of b.sides) s.group.visible = true; },
    cutNow: () => b.sides.flatMap((s, i) => (s.group.visible ? [] : [SIDE_NAMES[i]])),
    ...extra,
  };
}

/** The house of records: a records hall. Its trophies along the back wall over a dado of carved panels, banners between;
 *  the great ledger open on its lectern before them on a rug; tall bookcases down the west wall round the board of bests,
 *  the Chronicle's lectern by the door; the hearth on the east wall, the board of feats beside it, a reading desk. */
function buildRecords(group: THREE.Group): Room {
  const id: RoomId = 'records', b = begin(id, group, 917), { g, M, obstacles, rng } = b;
  const [hx, hz] = HOUSES[id].half, high = HOUSES[id].high;
  // --- the back wall: trophies, banners, a light over each end of the row ---
  const back = onWall(g, id, 'back');
  const hung = trophies(back, M, -hx + 1.7, hx - 1.7, 1.95);
  for (const sx of [-1, 1]) banner(back, M, sx * (hx - 0.55), high - 0.4, sx < 0 ? [0.42, 0.08, 0.06] : [0.08, 0.16, 0.36], rng, 0.72);
  for (const sx of [-1, 1]) lantern(back, M, sx * (hx - 1.7), 3.0, 0, 0, 1, { ...LANTERN, intensity: 7, reach: 5 });
  // (between them, a tapestry of the village's crest)
  const tapestry = writing(M, 384, 448, 1.3, 1.52);
  (tapestry.mesh.material as THREE.MeshStandardMaterial).color.setHex(0xffffff);
  tapestry.mesh.position.set(0, 1.95, 0.04);
  back.add(tapestry.mesh);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.55, 8).rotateZ(Math.PI / 2), M.iron);
  rod.position.set(0, 2.74, 0.06);
  back.add(rod);
  tapestry.write((cx, w, h) => drawCrest(cx, w, h));
  // --- the great ledger on its lectern, on a rug ---
  rug(g, M, 0, -0.6, 3.2, 2.2, ['#5a1a16', '#c09a50', '#1e2a40'], 31);
  const lectern = new THREE.Group();
  lectern.position.set(0, 0, -0.9);
  g.add(lectern);
  box(lectern, 0.5, 0.06, 0.4, 0, 0, 0, M.timber);
  drum(lectern, 0.06, 0.08, 1.0, 0, 0.06, 0, M.panel, 8);
  const desk = new THREE.Group();
  desk.position.set(0, 1.1, 0);
  desk.rotation.x = 0.35;
  lectern.add(desk);
  box(desk, 0.8, 0.05, 0.55, 0, -0.03, 0, M.panel);
  box(desk, 0.8, 0.05, 0.03, 0, 0.02, 0.28, M.timber);
  box(desk, 0.76, 0.03, 0.5, 0, 0.01, 0, M.leather);
  const left = writing(M, 384, 512, 0.36, 0.46), right = writing(M, 384, 512, 0.36, 0.46);
  for (const [page, x, tilt] of [[left, -0.185, 0.06], [right, 0.185, -0.06]] as const) {
    page.mesh.rotation.set(-Math.PI / 2, tilt, 0);
    page.mesh.position.set(x, 0.035, 0);
    desk.add(page.mesh);
  }
  // (a brass candlestand beside it, its candle at the book's height)
  drum(g, 0.12, 0.15, 0.04, 0.6, 0, -0.75, M.brass, 12);
  drum(g, 0.018, 0.022, 1.12, 0.6, 0.04, -0.75, M.brass, 8);
  drum(g, 0.06, 0.03, 0.04, 0.6, 1.16, -0.75, M.brass, 10);
  candle(g, M, 0.6, 1.2, -0.75, 0.16, CANDLE);
  obstacles.push({ x: 0.6, z: -0.75, r: 0.16, h: 1.3 });
  obstacles.push({ x: 0, z: -0.9, r: 0.42, h: 1.2 });
  // --- the west wall: bookcases round the board of bests; the Chronicle's lectern by the door ---
  const west = onWall(g, id, 'west');
  bookcase(west, M, -1.9, 1.5, 2.6, rng);
  bookcase(west, M, 1.7, 1.2, 2.6, rng);
  const bests = writing(M, 512, 640, 1.1, 1.38);
  framed(west, M, bests, -0.1, 1.75, 1.1, 1.38);
  lantern(west, M, -0.1, 2.75, 0, 0, 1, { ...LANTERN, intensity: 3.2 });
  for (const z of [-1.9, 1.7]) obstacles.push({ x: -hx + 0.25, z: -z, r: 0.45, h: 2.6 });
  obstacles.push({ x: -hx + 0.3, z: 1.2, r: 0.35, h: 2.6 });
  const chron = new THREE.Group();
  chron.position.set(-hx + 0.9, 0, hz - 1.6);
  chron.rotation.y = Math.PI / 2;
  g.add(chron);
  chronicleStand(chron, M);
  obstacles.push({ x: -hx + 0.9, z: hz - 1.6, r: 0.32, h: 1.2 });
  // --- the east wall: the hearth, the board of feats, a reading desk with scrolls ---
  hearth(g, M, new THREE.Vector3(hx, 0, -1.2), -Math.PI / 2, high, b.updaters, obstacles);
  const east = onWall(g, id, 'east');
  const feats = writing(M, 512, 640, 1.0, 1.25);
  framed(east, M, feats, 1.95, 1.8, 1.0, 1.25);
  table(g, M, hx - 0.65, 1.95, 0.7, 1.1, obstacles, 0.76);
  stool(g, M, hx - 1.35, 1.95, 0.5);
  for (const [dz, r] of [[-0.3, 0.035], [0.1, 0.03], [0.32, 0.04]]) {
    const scroll = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.42, 10).rotateX(Math.PI / 2), M.paper);
    scroll.position.set(hx - 0.6 + dz * 0.3, 0.76 + r, 1.95 + dz);
    scroll.rotation.y = dz;
    scroll.castShadow = true;
    g.add(scroll);
  }
  drum(g, 0.03, 0.04, 0.06, hx - 0.85, 0.76, 2.3, M.dark, 8);
  candle(g, M, hx - 0.5, 0.76, 2.35, 0.14, CANDLE);
  // (the lights by the front: on the side walls by it, as the front wall is cut away from above and a lantern on it
  // would hang in the air)
  lantern(west, M, -(hz - 0.7), 2.3, 0, 0, 1);
  lantern(east, M, hz - 0.7, 2.3, 0, 0, 1);
  // (off the middle: over the door's way it hung in the camera's from over the shoulder, over the ledger it hid it from above;
  // under the ridge beam, hung from it, its candles' tops clear of it: at the ceiling's height, the beam ran through its
  // wheel and candles, from play "light fixture, it goes through a beam")
  chandelier(g, M, 1.6, high - CHANDELIER_DROP, 0.1, high - RIDGE_UNDER);
  // (a chest of old records by the hearth, and stacks of ledgers on the floor by the bookcases)
  box(g, 0.9, 0.5, 0.5, hx - 0.4, 0, -2.85, M.panel).rotation.y = -0.1;
  box(g, 0.94, 0.06, 0.54, hx - 0.4, 0.5, -2.85, M.timber).rotation.y = -0.1;
  obstacles.push({ x: hx - 0.4, z: -2.85, r: 0.42, h: 0.56 });
  for (const [x, z, n] of [[-hx + 0.55, 0.6, 5], [-hx + 0.6, -2.9, 3]] as const) {
    for (let k = 0; k < n; k++) {
      const book = box(g, 0.3, 0.06, 0.22, x + (rng() - 0.5) * 0.05, k * 0.06, z + (rng() - 0.5) * 0.05, M.leather);
      book.rotation.y = (rng() - 0.5) * 0.6;
    }
  }
  const shown = (s: RecordsShown): void => {
    bests.write((cx, w, h) => writeBoard(cx, w, h, s.bests, 3));
    feats.write((cx, w, h) => writeBoard(cx, w, h, s.feats, 5));
    left.write((cx, w, h) => writeBoard(cx, w, h, s.left, 7, false));
    right.write((cx, w, h) => writeBoard(cx, w, h, s.right, 9, false));
    for (const t of hung) {
      const slain = s.slain[t.boss] ?? 0;
      t.trophy.visible = slain > 0;
      if (slain !== t.slain) { t.slain = slain; writePlaque(t); }
    }
  };
  const trophiesShown = (): Partial<Record<EnemyId, boolean>> =>
    Object.fromEntries(hung.map((t) => [t.boss, t.trophy.visible]));
  const room = finish(id, b, { showRecords: shown, trophiesShown });
  const showAll = room.showAll;
  room.showAll = () => { showAll(); for (const t of hung) t.trophy.visible = true; };
  return room;
}

/** the height of the tavern's table tops, where its cups and candles stand (m), and how thick their worn top is */
const TOP = 0.76, WORN = 0.012;

/** The tavern: the hearth in the back wall, the bar down the east wall with its shelves of bottles and kegs, the party's
 *  round table by the hearth with its map, a long table and benches, barrels by the door, the party board beside it. */
function buildTavern(group: THREE.Group): Room {
  const id: RoomId = 'tavern', b = begin(id, group, 4711), { g, M, obstacles, rng } = b;
  const [hx, hz] = HOUSES[id].half, high = HOUSES[id].high;
  // (its tables and seats in a wood of their own: in the floor's dark oak they read as one with it, from play, "tables
  // should stand out from the floor"; a ruddy rim and legs nearly black, a pale top worn by the tankards, its grain
  // finer: the oak's and the floor's maps and programs, other colours and repeats)
  const legs = new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(wood(), 1, 1), color: 0x1c100a });
  const rim = new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(wood(), 1, 1), color: 0xa8461a });
  const worn = new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(boards(), [1, 2], 0.5), color: 0xfff0d8, roughness: 0.6 });
  const T: Mats = { ...M, oak: rim, timber: legs };
  /** a table in the tavern's wood: its top a hair over the rim, at the height the cups stand */
  const inn = (x: number, z: number, w: number, d: number, round = false): void => {
    table(g, T, x, z, w, d, obstacles, TOP - WORN, round);
    if (round) drum(g, w / 2 - 0.05, w / 2 - 0.05, WORN, x, TOP - WORN, z, worn, 24).castShadow = false;
    else box(g, w - 0.08, WORN, d - 0.08, x, TOP - WORN, z, worn).castShadow = false;
  };
  hearth(g, M, new THREE.Vector3(0.6, 0, -hz), 0, high, b.updaters, obstacles);
  // (tankards and a pot on the mantel)
  for (const x of [-0.3, 0.1, 0.55, 1.2, 1.5]) tankard(g, M, x, 1.46, -hz + 0.78, x > 1);
  // --- the bar: a counter down the east wall, a shelf of bottles behind it, kegs on a rack ---
  const barX = hx - 1.3, barFrom = -hz + 0.9, barTo = 1.0, barLong = barTo - barFrom;
  box(g, 0.55, 1.0, barLong, barX, 0, (barFrom + barTo) / 2, M.panel);
  box(g, 0.7, 0.07, barLong + 0.1, barX, 1.0, (barFrom + barTo) / 2, M.oak);
  box(g, 0.6, 0.08, 0.06, barX, 0.08, barTo + 0.05, M.timber);
  for (let z = barFrom + 0.4; z < barTo; z += 0.75) box(g, 0.04, 0.85, 0.08, barX - 0.29, 0.08, z, M.timber);
  for (let z = barFrom + 0.3; z < barTo - 0.2; z += 0.8) obstacles.push({ x: barX, z, r: 0.42, h: 1.07 });
  obstacles.push({ x: barX, z: barTo - 0.2, r: 0.42, h: 1.07 });
  // (the keeper's place clear: his cask stands at his left, his mug slides across before him)
  for (const [z, metal] of [[-1.9, false], [-1.4, true], [0.25, false], [0.6, false]] as const) tankard(g, M, barX - 0.1, 1.07, z, metal);
  for (const z of [-2.2, -1.2, -0.2, 0.7]) stool(g, T, barX - 0.75, z, 0.72);
  const east = onWall(g, id, 'east');
  const bottles: THREE.Matrix4[] = [], tints: THREE.Color[] = [];
  const glassTints = [0x2a5a2a, 0x6a2a14, 0x1a3a5a, 0x8a6a2a, 0x3a1a3a];
  for (const y of [1.35, 1.85]) {
    box(east, 2.6, 0.05, 0.3, -1.0, y - 0.05, 0.15, M.oak);
    for (const sx of [-1, 1]) box(east, 0.04, 0.12, 0.24, -1.0 + sx * 1.2, y - 0.17, 0.12, M.iron);
    for (let x = -2.2; x < 0.2; x += 0.11 + rng() * 0.05) {
      const tall = 0.2 + rng() * 0.12;
      bottles.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y + tall / 2, 0.15), new THREE.Quaternion(), new THREE.Vector3(1, tall / 0.3, 1)));
      tints.push(new THREE.Color(glassTints[(rng() * glassTints.length) | 0]));
    }
  }
  const bottleGeo = new THREE.LatheGeometry([[0, -0.15], [0.04, -0.15], [0.045, -0.13], [0.045, 0.05], [0.016, 0.1], [0.014, 0.15], [0, 0.15]]
    .map(([r, y]) => new THREE.Vector2(r, y)), 10);
  const bottleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15, metalness: 0.2 });
  const bottleMesh = new THREE.InstancedMesh(bottleGeo, bottleMat, bottles.length);
  bottles.forEach((m, i) => { bottleMesh.setMatrixAt(i, m); bottleMesh.setColorAt(i, tints[i]); });
  bottleMesh.castShadow = true;
  east.add(bottleMesh);
  // (kegs on a rack behind the bar, at its far end)
  box(g, 0.7, 0.4, 1.5, hx - 0.4, 0, -hz + 1.1, M.timber);
  for (const z of [-hz + 0.7, -hz + 1.45]) barrel(g, M, hx - 0.4, 0.4, z, true, Math.PI / 2);
  obstacles.push({ x: hx - 0.4, z: -hz + 1.1, r: 0.6, h: 1.0 });
  // (lanterns over the bar)
  lantern(east, M, -2.6, 2.6, 0, 0, 1);
  lantern(east, M, 0.6, 2.6, 0, 0, 1);
  // --- the party's round table by the hearth, a map spread on it, stools round ---
  const [px, pz] = [-hx + 2.2, -hz + 2.4];
  inn(px, pz, 1.5, 1.5, true);
  const map = writing(M, 512, 384, 0.9, 0.66);
  map.mesh.rotation.set(-Math.PI / 2, 0, 0.2);
  map.mesh.position.set(px, 0.765, pz);
  g.add(map.mesh);
  map.write((cx, w, h) => drawMap(cx, w, h));
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.4;
    stool(g, T, px + Math.cos(a) * 1.05, pz + Math.sin(a) * 1.05);
  }
  candle(g, M, px + 0.45, 0.76, pz - 0.3, 0.18, CANDLE);
  tankard(g, M, px - 0.5, 0.76, pz + 0.2);
  tankard(g, M, px - 0.2, 0.76, pz - 0.5, true);
  // --- a long table with benches, west by the front ---
  const [lx, lz] = [-hx + 1.6, 1.4];
  inn(lx, lz, 0.9, 2.2);
  for (const sx of [-1, 1]) bench(g, T, lx + sx * 0.75, lz, 2.0, Math.PI / 2);
  for (const sx of [-1, 1]) obstacles.push({ x: lx + sx * 0.75, z: lz, r: 0.2, h: 0.45 });
  candle(g, M, lx, 0.76, lz - 0.2, 0.2, CANDLE);
  for (const [dx, dz] of [[-0.25, 0.6], [0.2, -0.7], [0.25, 0.3]]) tankard(g, M, lx + dx, 0.76, lz + dz, dz < 0);
  // --- a small table in the middle ---
  inn(0.3, -0.2, 0.9, 0.9, true);
  for (const a of [0.6, 2.2, 3.9]) stool(g, T, 0.3 + Math.cos(a) * 0.75, -0.2 + Math.sin(a) * 0.75);
  candle(g, M, 0.3, 0.76, -0.2, 0.16, CANDLE);
  // --- barrels by the door, the party board beside it ---
  barrel(g, M, -hx + 0.5, 0, hz - 0.5);
  barrel(g, M, -hx + 1.15, 0, hz - 0.45);
  barrel(g, M, -hx + 0.75, 0.8, hz - 0.5, false, 0.4);
  obstacles.push({ x: -hx + 0.8, z: hz - 0.5, r: 0.7, h: 1.6 });
  barrel(g, M, hx - 0.45, 0, hz - 0.5);
  obstacles.push({ x: hx - 0.45, z: hz - 0.5, r: 0.35, h: 0.8 });
  const board = writing(M, 512, 640, 0.9, 1.12);
  framed(east, M, board, hz - 1.7, 1.6, 0.9, 1.12);
  board.write((cx, w, h) => drawPartyBoard(cx, w, h));
  const west = onWall(g, id, 'west');
  lantern(west, M, -0.6, 2.4, 0, 0, 1);
  banner(west, M, 2.9, high - 0.35, [0.36, 0.18, 0.04], rng, 0.7);
  sign(west, M, 1.0, 2.55, 'THE EMBER & OAK', 'Hearth, ale and good company');
  // (the back wall: crossed axes and a shield beside the hearth, a shelf of plates and jugs the other side)
  const back = onWall(g, id, 'back');
  crossedAxes(back, M, -2.6, 2.0);
  plateShelf(back, M, -4.3, 1.75, 1.4, rng);
  plateShelf(back, M, -4.3, 2.35, 1.4, rng);
  plateShelf(back, M, 3.0, 1.95, 1.6, rng);
  // (dried herbs from the beams)
  // (over the bar alone: over the long table they hung before the sign)
  herbs(g, barX - 0.5, high - 0.26, -2.2, 6, rng);
  // (a pair of antlers over the west wall, and sacks of grain)
  lantern(west, M, -(hz - 0.6), 2.3, 0, 0, 1);
  lantern(east, M, hz - 0.4, 2.4, 0, 0, 1);
  // (under the ridge beam and hung from it, as the house of records' is: at 0.4 off it, the beam ran through its wheel)
  chandelier(g, M, -0.4, high - CHANDELIER_DROP, 0.05, high - RIDGE_UNDER);
  rug(g, M, 0.2, 2.2, 2.0, 1.4, ['#3a2414', '#a07030', '#5a1a14'], 77);
  // (its keeper behind the bar, his cask and his ale: world/tavern.ts)
  const keep = tavernKeeper(b, () => keeperTalk.talking);
  return finish(id, b, { seatFolk: keep.seat, keeper: keep.keeper, serveAle: keep.serve, always: keep.always, tavern: () => keep });
}

/** The house of records' tapestry: the village's crest woven on deep red, a tree over two crossed blades in a shield,
 *  a border of gold, a tasselled foot. */
function drawCrest(cx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = cx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#5a1414'); g.addColorStop(1, '#3a0c0c');
  cx.fillStyle = g; cx.fillRect(0, 0, w, h);
  // (its weave: fine rows lighter and darker)
  for (let y = 0; y < h; y += 3) { cx.fillStyle = y % 6 ? 'rgba(0,0,0,0.08)' : 'rgba(255,200,160,0.05)'; cx.fillRect(0, y, w, 1); }
  cx.strokeStyle = '#c99a48'; cx.lineWidth = 10; cx.strokeRect(14, 14, w - 28, h - 60);
  cx.lineWidth = 3; cx.strokeRect(30, 30, w - 60, h - 92);
  const sx = w / 2, sy = h * 0.46, sw = w * 0.3;
  cx.beginPath();
  cx.moveTo(sx - sw, sy - sw); cx.lineTo(sx + sw, sy - sw); cx.lineTo(sx + sw, sy);
  cx.quadraticCurveTo(sx + sw, sy + sw * 0.9, sx, sy + sw * 1.3); cx.quadraticCurveTo(sx - sw, sy + sw * 0.9, sx - sw, sy);
  cx.closePath();
  cx.fillStyle = '#1e2a40'; cx.fill();
  cx.strokeStyle = '#c99a48'; cx.lineWidth = 6; cx.stroke();
  // (two blades crossed)
  cx.strokeStyle = '#d8d0c0'; cx.lineWidth = 9; cx.lineCap = 'round';
  for (const d of [-1, 1]) { cx.beginPath(); cx.moveTo(sx - d * sw * 0.7, sy + sw * 0.75); cx.lineTo(sx + d * sw * 0.7, sy - sw * 0.7); cx.stroke(); }
  // (a tree over them: a trunk and a round crown)
  cx.fillStyle = '#c99a48';
  cx.fillRect(sx - 7, sy - sw * 0.1, 14, sw * 0.6);
  cx.beginPath(); cx.arc(sx, sy - sw * 0.25, sw * 0.42, 0, Math.PI * 2); cx.fill();
  cx.fillStyle = '#e8c870';
  cx.font = `700 ${Math.round(w * 0.08)}px ${DISPLAY}`;
  cx.textAlign = 'center'; cx.textBaseline = 'middle';
  cx.fillText('WARDENHOLLOW', sx, h * 0.12, w - 80);
  // (the tassels along its foot)
  for (let x = 24; x < w - 20; x += 18) { cx.fillStyle = '#c99a48'; cx.fillRect(x, h - 46, 6, 40); }
}

/** The map spread on the party's table: the village, its two ways out, the roads, inked on parchment. */
function drawMap(cx: CanvasRenderingContext2D, w: number, h: number): void {
  parchment(cx, w, h, 13);
  cx.strokeStyle = '#4a2a10'; cx.lineWidth = 4; cx.strokeRect(12, 12, w - 24, h - 24);
  cx.strokeStyle = '#6a3a14'; cx.lineWidth = 3;
  cx.beginPath(); cx.ellipse(w / 2, h / 2, w * 0.3, h * 0.32, 0.2, 0, Math.PI * 2); cx.stroke();
  cx.setLineDash([10, 8]);
  cx.beginPath(); cx.moveTo(w / 2, h / 2); cx.quadraticCurveTo(w * 0.7, h * 0.35, w * 0.86, h * 0.2); cx.stroke();
  cx.beginPath(); cx.moveTo(w / 2, h / 2); cx.quadraticCurveTo(w * 0.3, h * 0.62, w * 0.14, h * 0.8); cx.stroke();
  cx.setLineDash([]);
  cx.fillStyle = '#5a1a0a';
  cx.font = `700 26px ${DISPLAY}`;
  cx.textAlign = 'center';
  cx.fillText('Crypt', w * 0.84, h * 0.14);
  cx.fillText('Thornwood', w * 0.2, h * 0.9);
  // (the party's marks: a cross on each way out, a ring round the village)
  cx.lineWidth = 5;
  for (const [x, y] of [[w * 0.86, h * 0.2], [w * 0.14, h * 0.8]]) {
    cx.beginPath(); cx.moveTo(x - 12, y - 12); cx.lineTo(x + 12, y + 12); cx.moveTo(x + 12, y - 12); cx.lineTo(x - 12, y + 12); cx.stroke();
  }
  cx.fillStyle = '#3a200c';
  cx.beginPath(); cx.arc(w / 2, h / 2, 9, 0, Math.PI * 2); cx.fill();
}

/** The party board's notices: a call to arms, and how to raise or join a party. */
function drawPartyBoard(cx: CanvasRenderingContext2D, w: number, h: number): void {
  cx.fillStyle = '#4a3020'; cx.fillRect(0, 0, w, h);
  const notice = (x: number, y: number, nw: number, nh: number, turn: number, title: string, lines: string[], seed: number) => {
    cx.save();
    cx.translate(x, y); cx.rotate(turn);
    cx.save(); cx.translate(-nw / 2, -nh / 2);
    parchment(cx, nw, nh, seed);
    cx.restore();
    cx.fillStyle = '#3a200c'; cx.textAlign = 'center'; cx.textBaseline = 'top';
    cx.font = `700 ${Math.round(nw * 0.11)}px ${DISPLAY}`;
    cx.fillText(title, 0, -nh / 2 + nh * 0.08, nw * 0.9);
    cx.font = `500 ${Math.round(nw * 0.085)}px ${BODY}`;
    lines.forEach((l, i) => cx.fillText(l, 0, -nh / 2 + nh * 0.3 + i * nw * 0.11, nw * 0.88));
    cx.fillStyle = '#7a1a10';
    cx.beginPath(); cx.arc(0, -nh / 2 + 10, 8, 0, Math.PI * 2); cx.fill();
    cx.restore();
  };
  notice(w * 0.5, h * 0.3, w * 0.8, h * 0.42, -0.03, 'Companions Wanted', ['Raise a party here', 'and share its code,', 'or join a friend\'s.'], 21);
  notice(w * 0.3, h * 0.74, w * 0.46, h * 0.36, 0.06, 'Up to Four', ['Fall together,', 'rise together.'], 22);
  notice(w * 0.74, h * 0.76, w * 0.42, h * 0.32, -0.08, 'Spoils', ['Each keeps', 'their own.'], 23);
}

/** Both rooms built, each into a group of its own (hidden till shown). */
export function buildRooms(): Record<RoomId, Room> {
  const builders: Record<RoomId, (g: THREE.Group) => Room> = {
    records: buildRecords, tavern: buildTavern, library: buildLibrary, merchant: buildShop,
  };
  const rooms = {} as Record<RoomId, Room>;
  for (const id of ROOM_IDS) {
    const group = new THREE.Group();
    group.name = `room ${id}`;
    rooms[id] = builders[id](group);
  }
  return rooms;
}
