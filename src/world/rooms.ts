// The rooms' kit: what every house's room is built of (world/houses/<id>.ts builds each, data/houses/<id>.ts says its
// cottage, its size and what stands in it; world/houses.ts finds them, game/rooms.ts takes the hero in and out). Each
// room is built once at boot beside the places and shown in the village's stead (`Arena.showRoom`), as the hall of
// heroes' room is: a timber-framed room under beams, plastered over a panelled wainscot, on a plank floor (`begin`,
// `finish`), lit warm by a hearth's fire and a chandelier (its two lights casting the still shadows), candles, lanterns
// and sconces: as a biome, 10 point lights, two casting, so showing one compiles nothing the village's programs don't
// have; warmed with the `rooms` need (game/warmup.ts). Its furniture is here to share (tables, benches, bookcases,
// barrels, banners, boards written on). The walls and the ceiling the camera stands outside of aren't drawn
// (`cutAway`): from above the room is seen as a dollhouse, and over the shoulder the camera's boom stops at the walls
// (`Room.wall`).
import * as THREE from 'three';
import type { Scholar } from '../entities/models/scholar';
import type { Rounds } from './scholarRounds';
import { HOUSES, ROOM_IDS, type RoomId } from '../data/houses';
import type { Odo } from '../entities/models/merchant';
import type { EnemyId } from '../data/enemies';
import { ashlar, bannerCloth, boards, ctx2d, canvasOf, flagstone, grunge, pbrMaterialMaps, textureFromCanvas, wood } from '../core/textures';
import { LAMP_SOFT } from '../core/lamps';
import { particles, col } from '../fx/particles';
import { mulberry, rand } from '../util';
import { bannerGeo, CRYPT_ENV } from './crypt';
import { buildFire, emberMat, type FireLog } from './fire';
import { boxWithUV, mergeStill, staticShadow, type BiomeLook, type Updater } from './props';
import { Wall } from './wall';
import { buildDoor, type Door } from './door';
import type { Relief } from './ground';
import type { Obstacle } from '../types';
import { lengthSeat, stoolSeat, type Seat } from './seats';

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
   *  workers have made them: as the house is first walked into (game/rooms.ts `folkComing`), a piece at a time
   *  (models/steps.ts), a frame painted between slices: built whole at the boot, each was one task of seconds on a
   *  player's laptop (#838) */
  seatFolk?(): Generator<void, void, undefined>;
  /** the library's scholar, once seated (tools/lab `houses`, `scholar`) */
  folk?(): Scholar | undefined;
  /** what a hero sits on in it (from the owner: "dont forget to add sitting in houses, where possible, some houses have
   *  armchair etc"): its benches, stools and chairs, none the folk sit on */
  seats: Seat[];
  /** the merchant's Odo, once seated (tools/lab `odo`) */
  odo?(): Odo | undefined;
  /** his rounds through the room, once he's seated (world/scholarRounds.ts; tools/lab `scholar`) */
  rounds?(): Rounds | undefined;
}

/**
 * `object` and all under it kept out of its room's merge (`mergeRoom`): what moves (the things Odo handles), what a seat
 * outlines and sits on, what the lab reads by name. `within`: it stands still but is shown and hidden as one (a cut
 * away wall, a trophy), so it's merged within itself and kept apart.
 */
export function keepApart(object: THREE.Object3D, within = false): void {
  object.traverse((part) => { part.userData.noMerge = true; });
  if (within) object.userData.mergeWithin = true;
}

/**
 * The room's still parts drawn as one a material, as the village's are (`mergeStill`), once its static shadows are
 * baked: built a mesh a part, the merchant's shop drew 853 times from above and the library 717, more than any stand
 * outside (`lab village --only sweepWithinBudgets`). Frozen first (`matrixAutoUpdate` off, which the merge takes as
 * standing still), but for what's kept apart (`keepApart`) and not merged within.
 */
export function mergeRoom(group: THREE.Group): void {
  group.updateMatrixWorld(true);
  const freeze = (object: THREE.Object3D, inWhole: boolean): void => {
    const whole = inWhole || !!object.userData.mergeWithin;
    if (object.userData.noMerge && !whole) return;
    if ((object as THREE.Mesh).isMesh) object.matrixAutoUpdate = false;
    for (const child of object.children) freeze(child, whole);
  };
  freeze(group, false);
  mergeStill(group);
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
/** how far out from its flame a lantern's light is (m, along the way it hangs off its wall) */
const LANTERN_OUT = 0.75;

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
  // (well out from its wall: 0.47 m off it, its light fell on the plaster at some 30 times the room's and blew out
  // to a flat orange disc round every lantern, from play "we need to fix the overglow"; the room's light is the same)
  l.position.set(at.x + dx * LANTERN_OUT, at.y + 0.18, at.z + dz * LANTERN_OUT);
  g.add(l);
}

/** how far under the ceiling the ridge beam's underside is (m: `shell`'s ridge, 0.24 deep from 0.5 down, under the
 *  cross beams) */
export const RIDGE_UNDER = 0.5;
/** how far under the ceiling a cross beam's underside is (m: `shell`'s beams across the room, 0.26 deep, one every
 *  1.6 m from 0.9 in off the west wall) */
export const CROSS_UNDER = 0.26;
/** how much lower than the ceiling a chandelier under the ridge beam hangs (m): its candles' flames reach about 0.21
 *  over its wheel, which hangs 0.65 under the height it's given: 0.2 lower they stop 0.14 under the beam, where at the
 *  ceiling's height they reached 0.06 into it */
export const CHANDELIER_DROP = 0.2;

/** A chandelier hung at (x, high, z): an iron wheel on chains, candles round it, its light (casting). Its four chains
 *  meet at `hook` over its middle (the ceiling's, `high`, unless it hangs from a beam's underside). */
export function chandelier(room: THREE.Object3D, M: Mats, x: number, high: number, z: number, hook = high): THREE.PointLight {
  const y = high - 0.65;
  // (its parts in a group of their own, named, for `lab houses` to hold them clear of the ceiling's beams)
  const g = new THREE.Group();
  g.name = 'chandelier';
  room.add(g);
  keepApart(g, true);
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

/** A frame of dark timber round a board hung on a wall (in the wall's frame, facing +z): its board's middle at (x, y). */
export function framed(g: THREE.Object3D, M: Mats, writing: Writing, x: number, y: number, pw: number, ph: number): void {
  box(g, pw + 0.16, ph + 0.16, 0.05, x, y - ph / 2 - 0.08, 0.025, M.timber);
  writing.mesh.position.set(x, y, 0.052);
  g.add(writing.mesh);
}

/** A wall's frame in the room: x along it from its middle, its inner face at z = 0, facing into the room. */
export function onWall(g: THREE.Group, id: RoomId, side: WallSide, along = 0): THREE.Group {
  const [hx, hz] = HOUSES[id].half, frame = new THREE.Group();
  // (what's put on it goes with its wall as the camera cuts that away, `finish`'s `cutAway`)
  againstWall(frame, side);
  if (side === 'back') { frame.position.set(along, 0, -hz); }
  if (side === 'front') { frame.position.set(-along, 0, hz); frame.rotation.y = Math.PI; }
  if (side === 'west') { frame.position.set(-hx, 0, -along); frame.rotation.y = Math.PI / 2; }
  if (side === 'east') { frame.position.set(hx, 0, along); frame.rotation.y = -Math.PI / 2; }
  g.add(frame);
  return frame;
}

/** a room's four walls, as a frame on one is named (`onWall`) */
export type WallSide = 'back' | 'front' | 'west' | 'east';

/** `object` stands against wall `side`: shown and hidden with it as the camera cuts it away (#748: from above, a
 *  wall cut away left its bookcases standing, tall dark slabs over the room). Added to the room's group, in its space. */
export function againstWall(object: THREE.Object3D, side: WallSide): void {
  object.userData.againstWall = side;
}

/** A bookcase against a wall (its frame, facing +z) at x, `w` wide: its carcass, shelves, and books of every colour
 *  and height on them, one instanced mesh, some leaning. */
export function bookcase(g: THREE.Object3D, M: Mats, x: number, w: number, high: number, rng: () => number): void {
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

/** A piece of furniture as built: all of it (outlined as a seat), and its top (what a body sits on). */
export interface Furniture { group: THREE.Group; top: THREE.Mesh }

/** A bench at (x, z), `w` long along x (turned `turn`). */
export function bench(g: THREE.Object3D, M: Mats, x: number, z: number, w: number, turn = 0): Furniture {
  const b = new THREE.Group();
  b.position.set(x, 0, z);
  b.rotation.y = turn;
  g.add(b);
  const top = box(b, w, 0.06, 0.32, 0, 0.42, 0, M.oak);
  for (const sx of [-1, 1]) box(b, 0.06, 0.42, 0.28, sx * (w / 2 - 0.15), 0, 0, M.timber);
  return { group: b, top };
}

/** how far either way of a tavern bench's middle a body sits along it (m) */
export const BENCH_SAT = 0.7;

/** A stool's top's radius (m). */
const STOOL_R = 0.17;

/** A stool at (x, z). */
export function stool(g: THREE.Object3D, M: Mats, x: number, z: number, high = 0.5): Furniture {
  const s = new THREE.Group();
  g.add(s);
  const top = drum(s, STOOL_R, STOOL_R, 0.05, x, high - 0.05, z, M.oak, 12);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, high - 0.05, 5), M.timber);
    leg.position.set(x + Math.cos(a) * 0.11, (high - 0.05) / 2, z + Math.sin(a) * 0.11);
    leg.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12);
    leg.castShadow = true;
    s.add(leg);
  }
  return { group: s, top };
}

/** A stool sat on, where it stands (`x`, `z`, as built). */
export function stoolSeatOf(f: Furniture, x: number, z: number): Seat {
  return stoolSeat(x, z, STOOL_R, [f.top], [{ root: f.group }]);
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

/** A painted sign hung on a wall (its frame) at (x, y): the house's name in gold on dark boards. */
export function sign(g: THREE.Object3D, M: Mats, x: number, y: number, words: string, sub: string): void {
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
// The rooms

/** the shell's walls and its ceiling by name, in the order it builds them */
const SIDE_NAMES = ['back', 'front', 'west', 'east', 'ceiling'] as const;

/** What both rooms share as they're built. */
export interface Build { g: THREE.Group; M: Mats; wall: Wall; obstacles: Obstacle[]; updaters: Updater[]; rng: () => number;
  sides: { group: THREE.Group; outside: (e: THREE.Vector3) => boolean }[]; door: Door; seats: Seat[] }

export function begin(id: RoomId, group: THREE.Group, seed: number): Build {
  const M = makeMats(), wall = new Wall('village');
  const { sides, door } = shell(group, M, id, wall);
  return { g: group, M, wall, obstacles: [], updaters: [], rng: mulberry(seed), sides, door, seats: [] };
}

/** A room as built, its walls sealed. */
export function finish(id: RoomId, b: Build, extra: Partial<Room> = {}): Room {
  b.wall.seal();
  // (kept out of the room's merge, `mergeRoom`: the walls cut away by the camera, and each seat, outlined and sat on)
  for (const side of b.sides) keepApart(side.group, true);
  // (what stands against each wall, cut away with it: gathered into one group a wall, merged within itself, apart
  // from the room's whole; each frame merged on its own was a draw a material a frame, 10 to 25 a room)
  b.g.updateMatrixWorld(true);
  const against = SIDE_NAMES.map((name) => {
    const objects = b.g.children.filter((child) => child.userData.againstWall === name);
    if (!objects.length) return [];
    const holder = new THREE.Group();
    holder.name = `against the ${name} wall`;
    b.g.add(holder);
    for (const object of objects) holder.attach(object);
    keepApart(holder, true);
    return [holder];
  });
  // (a lantern's light stays in the room as its wall is cut away: moved onto the room's group where it stands, its
  // frame's meshes alone hidden with the wall; a light hidden with them would leave the room darker from above)
  for (const objects of against) {
    for (const object of objects) {
      const lights: THREE.Light[] = [];
      object.traverse((part) => { if ((part as THREE.Light).isLight) lights.push(part as THREE.Light); });
      for (const light of lights) b.g.attach(light);
    }
  }
  for (const seat of b.seats) {
    for (const target of seat.outline) keepApart(target.root);
    for (const mesh of seat.meshes) keepApart(mesh);
  }
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
    id, group: b.g, look: ROOM_LOOK, wall: b.wall, obstacles: b.obstacles, seats: b.seats,
    relief: { half: 1, cell: 1, n: 2, heights: new Float32Array(4), dais: false },
    update(dt, t) { for (const u of b.updaters) u(dt, t); },
    cutAway(eye) {
      b.sides.forEach((s, i) => {
        s.group.visible = !s.outside(eye);
        for (const object of against[i]) object.visible = s.group.visible;
      });
    },
    showAll() {
      for (const s of b.sides) s.group.visible = true;
      for (const objects of against) for (const object of objects) object.visible = true;
    },
    cutNow: () => b.sides.flatMap((s, i) => (s.group.visible ? [] : [SIDE_NAMES[i]])),
    ...extra,
  };
}
