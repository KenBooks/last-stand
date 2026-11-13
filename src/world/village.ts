// The village the lobby stands in (data/village.ts lays it out, world/villagePlan.ts makes its plan geometry, and
// game/village.ts makes its objects work): a green hamlet in a meadow, built once at boot beside the biomes and shown in
// their place between runs (`Arena`'s place). It's laid out as a hamlet grows: a palisade wandering round it, its roads
// winding from a cobbled square round a fountain, cottages each turned its own way with a footpath worn from its door,
// sheds, groves of trees inside and a wood round it, lamps along its roads. North, up a broad stair, a terrace where the
// hall of heroes stands, a building its door opens on the heroes' room (the stash's chest right of its door); the yard
// south-east, fenced, its dummies the only place skills are cast; a campfire, the chronicle's lectern across the door
// from the chest, a notice board. Its two ways out are places of their own beyond gaps in the palisade (world/villageWays.ts): the crypt's
// walled court and sunken door north-east, the Thornwood's grove south-west, each with its portal. Grass grows wherever
// nothing's built or trodden (world/meadow.ts, its mask painted from the plan). Its floor has levels (the terrace and
// the hall's dais: world/ground.ts's relief, and no arena's dais), reached by stairs alone: each ledge is faced by a wall a body is kept
// off (world/wall.ts outlines), so feet climb the steps one by one; its wall is what's built (`wallShape` 'free'). Its
// light follows the hour (`daylight`, a uniform's change: nothing compiles), and as a biome it has 10 point lights, two
// casting the still shadows (the hall's braziers).
import { unrepeatedNodes } from './villageNodes';
import { WEBGPU } from '../core/webgpu';
import { villageSkyMaterial } from './skyNodes';
import * as THREE from 'three';
import type { SightDoor, SightRoof, SightWall } from '../core/sight';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  CAMPFIRE, CHEST, CHRONICLE, COTTAGES, DAY, ENTRANCES, GAP_HALF, HALL, NOTICE, STEP_RISE, TERRACE, YARD, exitPlace, portalPlace,
  type Cottage, type Spot,
} from '../data/village';
import { BIOME_IDS, type BiomeId } from '../data/biomes';
import {
  ashlar, bannerCloth, bark, canvasOf, ctx2d, flagstone, granite, limestone, pbrMaterialMaps, slate, soil, textureFromCanvas,
  boards, hammered, wood, cobblestone, grunge,
} from '../core/textures';
import { OVER_SHAFT, hallRoomIs, seeThrough, sortByNearest } from '../core/seeThrough';
import type { FadesWhole } from '../core/seeThrough';
import { particles, col } from '../fx/particles';
import { mulberry, rand, TAU } from '../util';
import { bannerGeo, buildBrazier } from './crypt';
import { CLASSES, CLASS_IDS } from '../data/classes/index';
import { BONFIRE_LIGHT, buildBonfire } from './forest';
import { movesInShadows, asGrass, asTree, boxWithUV, contactShadows, setInstance, standStill, type Biome, type BiomeLook, type EnvColours, type Portal, type RGB, type Updater } from './props';
import { buildMeadow, meadowGround, MeadowMask, type MaskUniforms } from './meadow';
import {
  barGeometry, chased, CoinBed, coinFaces, coinGeometry, coinsPile, crownGeometry, crownPointAngle, crownPoints, gemGeometry,
  gobletGeometry, keyholeGeometry, lockPlate, plateGeometry, quiltedLining, type LaidCoin,
} from './hoardPieces';
import { growTree, type TreeKind, thinnedLeaves } from './ezTrees';
import { TREE_KINDS } from './forest';
import { leafClusterTexture } from './foliage';
import { cullInCells, eachInstance, gridCell } from './culling';
import { buildFountain, type FountainLight } from './fountain';
import {
  COTTAGE, PODIUM, SQUARE_R, TOMB, builtAt, footpathOf, fromGap, inWay, insidePalisade, palisadeCurve, palisadePolygon, roadLines, solidAt,
  withinVillage,
} from './villagePlan';
import { buildCryptWay, buildForestWay, groveTrees } from './villageWays';
import { FENCE, STANDS_FREE, Wall } from './wall';
import type { Relief } from './ground';
import type { Obstacle } from '../types';

/** the village's environment: a clear sky's, blue overhead and the meadow's green low */
export const VILLAGE_ENV: EnvColours = { sky: [0.5, 0.62, 0.78], panel: [1.25, 1.2, 1.05] };

/** the relief's grid: a 10 cm cell over the whole village, so a step's edge is sharp under a foot */
const RELIEF = { cell: 0.1, half: 40 };
/** a step's run (m): with `STEP_RISE`, a stair a man climbs a step a stride */
const STEP_RUN = 0.32;
/** the walls facing a ledge: how thick, and how far over the floor above them they stand (a parapet) */
const PARAPET = { thick: 0.36, over: 0.75 };
/** the hall's portico: its columns (x either side, their row's z), their shaft's radius and height, the lintel's */
const COLONNADE = { x: [3.3, 5.6], z: -13.4, radius: 0.36, high: 5.2, lintel: 0.55 };
/** the columns inside the hall: their shaft's radius (HALL says where they stand) */
const COLUMN_IN = { radius: 0.32 };
/** the windows down the hall's long walls: their sill over its floor, how tall and wide (m) */
const WINDOWS = { sill: 2.6, high: 2.4, wide: 1.1 };
/** how far a window's sill stands over the wall's course it lies on (m) */
const SILL_PROUD = 0.015;
/** the lights on the heroes on the dais: how high over it, how far before their plinths (m) */
const DAIS_LIGHT = { up: 3.0, ahead: 2.2 };
/** the hall's door: its stone frame's width, how far its leaves are set back in the wall, its iron straps' heights */
/** the banners behind the hall's plinths: their tops over the floor, how far off the back wall, their scale (`bannerGeo`
 *  is 0.9 m across) */
const HALL_BANNER = { top: 4.6, off: 0.25, scale: 1.15 };
const DOOR = { frame: 0.32, set: 0.22, straps: [0.5, 1.7, 2.9], open: 1.45 };
/** the plinth block at the foot of each side of the door's frame: how high (over the plinth course's 0.45), how deep
 *  out from the wall (past the course's 0.35) and how much wider than the frame each way (m) */
const DOOR_FOOT = { high: 0.52, deep: 0.4, wider: 0.03 };
/** the hall's roof: its ridge over the eaves, its slabs' thickness and overhang, its gables' depth, the ceiling's
 *  planks' thickness and the beams' spacing under it (m) */
const ROOF = { rise: 2.8, thick: 0.24, over: 0.6, gable: 0.5, ceiling: 0.14, ceilingShort: 0.04, ceilingDown: 0.03, beamGap: 1.6 };
/** the braziers on the dais behind the heroes, between their plinths (x, z: the still shadows' lights), their light, and their
 *  slabs against the crypt's (as the selection screen's room has them, world/heroHall.ts: in the portico either side
 *  of the door they stood in the way, "move these inside the hall, behind heroes, like it was before village feature,
 *  and replace with wall torches, so we get some space to walk") */
const BRAZIERS = { x: 1.65, z: -31.9, glow: 5, flames: 0.5, slabs: 0.6 };
/** the torches on the hall's front wall either side of the door: how far out from its middle, how high (m) */
/** the porch's torches: off the door, up the wall, and how far out from it their light is (at 1.1 m, by the portico's
 *  columns, it burned their edges white) */
const PORCH_TORCH = { x: 2.1, up: 2.5, out: 0.6 };
/** the palisade: its logs' radius, how tall they stand (from, to), and the gates' gap (m either side of a portal) */
const PALISADE = { radius: 0.17, low: 4.2, high: 5.4 };
/** the groves in the village: each one's middle and how many trees (scattered round it where nothing's built) */
const GROVES: readonly [number, number, number][] = [
  [-21.5, -13, 3], [-9.5, -8, 1], [-11, 21, 3], [3.5, 22.5, 2], [24, -3.5, 2], [23.5, 16.5, 2], [-7, -24.5, 2], [6, -24.5, 2],
  [-25.5, 3, 2], [12.5, -23, 1], [16, 20.5, 1],
];
/** the wood round the palisade: how many trees, from how far past it to how far, and how tall (m) */
const WOOD = { n: 130, near: 2.4, far: 30, low: 9, high: 20 };
/** the lamp posts flanking the stair's foot (x either side, z: on the grass behind the curbs, as at -7 the square's
 *  own edge left one standing on the paving), their lantern's height and light */
export const LAMPS = { x: 3.5, z: -8.7, high: 3.1, color: 0xffb46a };
/** the street lamps (`buildStreetLamps`): how far apart along a road and the first from its start, how far out past
 *  its side (`builtAt` keeps 0.8 m by a road), how clear of any obstacle and of another lamp, and how many round the
 *  square (m) */
const STREET = { every: 6, first: 3, off: 1.1, clear: 0.9, apart: 4.5, square: 8 };
/** the motes drawn into a portal (`portalMotes`): how many a second, the vortex's middle's height, the rim they
 *  start round (m out from the middle) and how far before the gate's face at most */
const MOTES = { rate: 70, high: 2.2, rim: 1.0, ahead: 2.8 };
/** each portal's motes' colours, its gate's (`portalMembrane`'s colours in crypt.ts and forest.ts) */
const MOTE_COLORS: Record<BiomeId, { rim: THREE.Color; core: THREE.Color }> = {
  crypt: { rim: new THREE.Color(1.0, 0.25, 0.55), core: new THREE.Color(1.0, 0.6, 1.0) },
  forest: { rim: new THREE.Color(0.45, 0.9, 0.15), core: new THREE.Color(0.7, 1.0, 0.55) },
};
/** the yard's gate posts' height, and the light at each, of no strength: two of the village's 10 (a count every lit
 *  program is made for) */
const YARD_GATE = { up: 2.25, color: 0xff8a3c, distance: 1 };
/** the candle on the chronicle's lectern: its light */
const CANDLE = { color: 0xffc070, intensity: 0.1, distance: 6, over: 0.12, flame: 0xff7a20, flameShows: 0.85, core: 0xffe6a0, coreLit: 2.4 };
/** how little the chest's lid moves in a frame to count as still */
const LID_STILL = 0.002;
/** the chest's floor, inside it (m), and the highest what's in it may stand under the shut lid (m) */
const CHEST_FLOOR = 0.06;
const UNDER_LID = 0.69;
/** the top of the goblet in a full chest (m over the box's foot) */
const HOARD_TOP = 1.02;
/** how little of a coin's size counts as nothing (a hidden mesh compiles nothing: all of it stays drawn) */
const NOTHING = 1e-4;
/** the coins' metals (each by a shade of its own), and where stacks of them stand and how tall (x, z, coins) */
const GOLDEN = [0.6, 0.4, 0.13], TARNISHED = [0.42, 0.29, 0.13], SILVER = [0.5, 0.52, 0.54];
/** the coins in a full chest, how thick each is (m), the spots each is tried at (the lowest taken, to fill the gaps) */
const COINS = 850, COIN_THICK = 0.007, COIN_TRIES = 6;
/** the gems' colours */
const GEM_TINTS = [0xc8142c, 0x10a060, 0x2048c8];
/** the lining's picture a metre (four diamonds a side a tile: 9 cm a diamond) */
const QUILT = 2.8;
const COIN_STACKS = [[-0.12, 0.2, 7], [-0.05, 0.22, 4], [0.24, 0.17, 6], [0.08, -0.2, 5], [-0.37, -0.03, 6], [0.42, -0.14, 4]] as const;
/** how fast the hoard follows the stash as it's seen open, and the difference it stops at */
const HOARD_EASE = 6;
const HOARD_NEAR = 0.002;
/** the coins shown: the stash's share to this power, and at least so many */
const COINS_BY = 1.7;
const COINS_LEAST = 3;

/** the village's light at each height of the sun (its sine): the night's, the twilight's and the day's */
// (a bright moonlit night, a golden evening, a clear spring day)
const NIGHT = { fog: 0x1c2640, sky: [0.02, 0.03, 0.08] as RGB, hemi: 0x6a7cb8, ground: 0x18201a, hemiI: 1.0, light: 0xbcccff, lightI: 1.4, env: 0.32, adapt: 1 };
const TWILIGHT = { fog: 0xc89a80, sky: [0.16, 0.2, 0.42] as RGB, hemi: 0xd8b49a, ground: 0x3a3418, hemiI: 1.0, light: 0xffaa60, lightI: 2.8, env: 0.5, adapt: 1.5 };
const NOON = { fog: 0xb4cce0, sky: [0.16, 0.38, 0.78] as RGB, hemi: 0xd8e8ff, ground: 0x4a5a28, hemiI: 1.45, light: 0xfff4e2, lightI: 4.0, env: 0.75, adapt: 2.3 };
/** how far the key light (the sun, or by night the moon) stands from the middle, along its way (m) */
const SKY_LIGHT_FAR = 42;
/** the sun's highest (rad over the horizon, at noon), and the moon's */
const SUN_HIGH = 1.05, MOON_HIGH = 0.85;

/** The village as built: a biome's parts (`Biome`), its relief, its light at an hour, and its chest's lid. */
export interface Village extends Biome {
  relief: Relief;
  /** its light at `hour` (0-24 of the clock), into `look`: called every frame while it's shown */
  daylight(hour: number, look: BiomeLook): void;
  /** the stash's chest open or shut as its panel shows (its lid swings) */
  setChest(open: boolean): void;
  /** the hero by the chest or not: it stands open for him */
  setChestNear(near: boolean): void;
  /** the hero by the chronicle or not: its candle's lit for him */
  setCandleNear(near: boolean): void;
  /** how full the stash is (of 1): the chest's hoard shows it */
  setChestFull(full: number): void;
  /** its trees as they stand (the map draws them) */
  trees: readonly { x: number; z: number; height: number }[];
  /** what stops his sight from above (core/sight.ts), the walls and the hall, which may be shut to him */
  sight: { walls: SightWall[]; hall: THREE.Vector4; roofs: SightRoof[]; doors: SightDoor[] };
  /** the street lamps' lanterns, each lit by the lit shaders' lamps (`core/lamps.ts`; game/village.ts `lightLamps`) */
  lanterns: readonly THREE.Vector3[];
  /** the hall of heroes' roof, ceiling and front wall (cut away over the hero inside, but through his eyes, as from
   *  above and over his shoulder they hid the room: game/village.ts) */
  hallCutaway: readonly THREE.Object3D[];
  /** the meadow's grass (left undrawn from inside the hall, its doorway out of sight: game/village.ts) */
  meadow: THREE.Object3D;
  /** the lights on the hall's dais (its first two, lit whenever the hero is inside) and its torches' flames (the
   *  nearest lit), by the pooled lights */
  hallTorches: readonly THREE.Vector3[];
  /** the torches on the hall's front wall either side of its door, by the pooled lights outside it */
  porchTorches: readonly THREE.Vector3[];
  /** its two lights casting the still shadows (the hall's braziers), which hand their shadows to the lamps lit by
   *  night (game/village.ts `castFromLamps`) */
  stillLights: readonly THREE.PointLight[];
  /** how far into the night its hour is: 0 by day, 1 by night */
  readonly night: number;
  /** each portal's way out into the village, by its battleground: where a hero coming back stands, and his facing */
  exits: Record<BiomeId, { at: THREE.Vector3; facing: number }>;
}

/** What `build` adds to `scene`, built to stand still, frozen as it stands (`standStill`), but for a part holding a
 *  light (a brazier's sways with its fire, and three places a light by its matrix); returns what it returns. */
function stillBuilt<T>(scene: THREE.Object3D, build: () => T): T {
  const from = scene.children.length;
  const built = build();
  for (const part of scene.children.slice(from)) {
    let lit = false;
    part.traverse((object) => { if ((object as THREE.Light).isLight) lit = true; });
    if (!lit) standStill(part);
  }
  return built;
}

/** A mesh casting and taking shadows, added to `group`. */
function solid(group: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

/** A box of size (w, h, d) standing on y0, its middle at (x, z), turned `turn` about y, added to `group`. */
function block(group: THREE.Object3D, w: number, h: number, d: number, x: number, y0: number, z: number,
  material: THREE.Material, texel = 0.5, turn = 0): THREE.Mesh {
  // (wood's grain along its length: across a beam's top, its stripes read as teeth along the edge, "house topology errors")
  const mesh = solid(group, boxWithUV(w, h, d, texel, material.userData.grained === true), material);
  mesh.position.set(x, y0 + h / 2, z);
  mesh.rotation.y = turn;
  return mesh;
}

/** A block of walling at (x, y0, z) as `block` lays it, unturned, its courses laid by the world's place, not the block's
 *  corner (a tile `1 / texel` m): each block's own ran from its corner, and the one over the hall's door met the wings
 *  beside it a part course off, its joints across theirs ("misaligned texture"). */
function walling(group: THREE.Object3D, w: number, h: number, d: number, x: number, y0: number, z: number,
  material: THREE.Material, texel = 0.5): THREE.Mesh {
  const mesh = block(group, w, h, d, x, y0, z, material, texel);
  const g = mesh.geometry, at = g.attributes.position, uv = g.attributes.uv, n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const px = at.getX(i) + x, py = at.getY(i) + y0 + h / 2, pz = at.getZ(i) + z;
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    // (across a face its side's way, up it the height; a top across x and z)
    const u = ax > 0.5 ? pz : px, v = ay > 0.5 ? pz : py;
    uv.setXY(i, u * texel, v * texel);
  }
  return mesh;
}

// --- the floor's levels ---------------------------------------------------------------------------------------------

/** The relief the village's levels make, painted into its grid by `paint` (each cell's height its highest). */
class Levels {
  readonly n = Math.ceil((2 * RELIEF.half) / RELIEF.cell) + 1;
  readonly heights = new Float32Array(this.n * this.n);

  /** `height(x, z)` over the rectangle from (x0, z0) to (x1, z1), where it's higher than what's there */
  paint(x0: number, z0: number, x1: number, z1: number, height: (x: number, z: number) => number): void {
    const { cell, half } = RELIEF, n = this.n;
    const i0 = Math.max(0, Math.floor((x0 + half) / cell)), i1 = Math.min(n - 1, Math.ceil((x1 + half) / cell));
    const j0 = Math.max(0, Math.floor((z0 + half) / cell)), j1 = Math.min(n - 1, Math.ceil((z1 + half) / cell));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = i * cell - half, z = j * cell - half;
        if (x < x0 || x > x1 || z < z0 || z > z1) continue;
        const h = height(x, z);
        if (h > this.heights[j * n + i]) this.heights[j * n + i] = h;
      }
    }
  }

  get relief(): Relief { return { half: RELIEF.half, cell: RELIEF.cell, n: this.n, heights: this.heights, dais: false }; }
}

/** The height of a stair's step `along` m from its foot: a whole number of rises, up to `top`. */
const stepAt = (along: number, top: number): number => Math.min(top, Math.max(0, Math.ceil(along / STEP_RUN - 1e-6)) * STEP_RISE);

/** The village's materials, made once: its stones, its woods, its plaster, its iron. */
interface Mats {
  yardFloor: THREE.Material; cobbles: THREE.Material; flags: THREE.Material;
  ashlar: THREE.Material; coping: THREE.Material; granite: THREE.Material; column: THREE.Material;
  /** the ledges' and the fountain's stones: what stands free in the ashlar's and the coping's looks */
  freeAshlar: THREE.Material; freeCoping: THREE.Material;
  /** the notice board's and the lectern's wood and brass: what stands free, as the lamps (`prop`) */
  freeTimber: THREE.Material; freePlanks: THREE.Material; freeBrass: THREE.Material;
  /** a lamp's plinth, thinned from the ground up */
  footAshlar: THREE.Material;
  plaster: THREE.Material; gable: THREE.Material; chimney: THREE.Material; timber: THREE.Material; planks: THREE.Material; logs: THREE.Material; roof: THREE.Material; boardRoof: THREE.Material;
  /** the palisade's logs and tips: a fence's hole, opened by it alone (`fence` in core/seeThrough.ts) */
  palisadeLogs: THREE.Material; palisadeTips: THREE.Material;
  iron: THREE.Material; window: THREE.MeshStandardMaterial; skyPane: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial; paper: THREE.Material; pagesLeft: THREE.Material; pagesRight: THREE.Material; pagesEdge: THREE.Material; ribbon: THREE.Material;
  binding: THREE.Material; brass: THREE.Material; lining: THREE.Material; liningInside: THREE.Material; wax: THREE.Material;
  gold: THREE.Material; coin: THREE.MeshStandardMaterial; gilt: THREE.MeshStandardMaterial; pearl: THREE.Material; gem: THREE.Material;
  lockBrass: THREE.MeshStandardMaterial;
  chestWood: THREE.Material; chestIron: THREE.Material;
  lantern: THREE.MeshBasicMaterial; lanternIron: THREE.MeshBasicMaterial;
}

/** how bright a cottage's window burns at night: its candlelit panes as a room's glow, short of a lamp's flame (at 2.4
 *  as one lit box, the bloom spread each into a blob) */
const WINDOW_GLOW = 1.3;
/** the hall's windows' panes seen from inside: the sky's light through them by day and by night (their glow, the
 *  sky's colour) */
const SKY_PANE = { day: 1.3, night: 0.15, color: 0xdce6ff };

/** the maps' chunks whose one read of their map `unrepeated` reads shifted instead, each its map and its uv */
const UNREPEATED_READS = [
  ['map_fragment', 'map', 'vMapUv'],
  ['roughnessmap_fragment', 'roughnessMap', 'vRoughnessMapUv'],
  ['metalnessmap_fragment', 'metalnessMap', 'vMetalnessMapUv'],
  ['normal_fragment_maps', 'normalMap', 'vNormalMapUv'],
  ['aomap_fragment', 'aoMap', 'vAoMapUv'],
] as const;

/** `chunk` of three's with each read of `map` at `uv` read shifted (`unrep`). */
function shiftedReads(chunk: keyof typeof THREE.ShaderChunk, map: string, uv: string): string {
  return THREE.ShaderChunk[chunk].split(`texture2D( ${map}, ${uv} )`).join(`unrep( ${map}, ${uv} )`);
}

/**
 * `m`, a paving's, shaded in broad patches over the world, some stones darker and some paler, worn and stained, so its
 * tile's own patches don't line up across the square: a tile a metre and a half, repeated, read as a grid of the same
 * blotches (from play, "texture tiling on the ground too obvious"). Its stones don't line up either: every map is
 * read twice, shifted by one of six offsets and the next as a slow noise over the world picks them (a patch a few
 * metres across each: changed every half metre, the stones were mush), and blended between (its tile's own stones came round every 1.5 m in rows, "ground texture tiling is still a little too
 * obvious"). Its own program, made at the village's warm-up.
 */
function unrepeated<M extends THREE.MeshStandardMaterial>(m: M): M {
  if (WEBGPU) {
    unrepeatedNodes(m);
    return m;
  }
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPaveXZ;')
      .replace('#include <project_vertex>',
        '#include <project_vertex>\nvPaveXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vPaveXZ;
        float paveH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float paveN(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(paveH(i), paveH(i + vec2(1, 0)), f.x), mix(paveH(i + vec2(0, 1)), paveH(i + vec2(1, 1)), f.x), f.y);
        }
        vec4 unrep(sampler2D s, vec2 uv) {
          float pick = paveN(vPaveXZ * 0.12) * 6.0;
          float k = floor(pick);
          vec2 a = sin(vec2(3.0, 7.0) * k), b = sin(vec2(3.0, 7.0) * (k + 1.0));
          vec2 dx = dFdx(uv), dy = dFdy(uv);
          // (blended over a narrow band: the stones lie over each other only there. Led by which of the two stones
          // stood taller, the two were picked pixel by pixel, and the paving was mush)
          return mix(textureGrad(s, uv + a, dx, dy), textureGrad(s, uv + b, dx, dy), smoothstep(0.35, 0.65, fract(pick)));
        }`);
    for (const [chunk, map, uv] of UNREPEATED_READS) {
      shader.fragmentShader = shader.fragmentShader.replace(`#include <${chunk}>`, shiftedReads(chunk, map, uv));
    }
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        float broad = paveN(vPaveXZ * 0.11) * 0.55 + paveN(vPaveXZ * 0.37 + 4.0) * 0.3 + paveN(vPaveXZ * 1.3 + 9.0) * 0.15;
        float stained = smoothstep(0.55, 0.85, paveN(vPaveXZ * 0.21 + 17.0));
        diffuseColor.rgb *= mix(0.72, 1.18, broad);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.74, 0.66), stained * 0.6);`);
  };
  m.customProgramCacheKey = () => 'paving-unrepeated';
  return m;
}

function makeMats(): Mats {
  // (the biomes' own recipes, at the same arguments: their maps and their programs are theirs, nothing made afresh)
  const stoneMaps = ashlar(21, 6, 3), flagMaps = flagstone(47, 5), panes = windowPanes();
  // (the lid's lining is a half cylinder, a tile round it whole: its picture repeated to the box's diamonds)
  const lining = quiltedLining(), liningLid = quiltedLining();
  for (const t of [liningLid.map, liningLid.bumpMap]) t.repeat.set(3, 2);
  const ashlarStone = new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(stoneMaps, 1, 1.2), color: 0xd0c4b0 });
  const copingStone = new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(limestone(11), 2, 1.2), color: 0x9c968c });
  const mats: Mats = {
    yardFloor: new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(soil(), 8, 0.8), color: 0xc8b090 }),
    cobbles: unrepeated(new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(cobblestone(), 1, 1.1), color: 0xfff4e4 })),
    flags: new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(flagMaps, 1, 1.2), color: 0xd0c8bc }),
    ashlar: ashlarStone,
    coping: copingStone,
    granite: new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(granite(7), 2, 0.8), color: 0xc8c4c0 }),
    // (stuccoed, the plaster's stained wash: limestone's pits read as pocks on a shaft, a review said, and marble's
    // maps are slabs; a shaft's own uvs run once round it and once up it, so a tile round and two up are near square)
    column: new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(grunge(), [1, 2], 0.5), color: 0xccc2b0 }),
    // (lime plaster, washed warm and stained: the grunge map's patches under a cream)
    plaster: new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(grunge(), 1, 0.6), color: 0xd8c8a8 }),
    timber: new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(wood(), 1, 1), color: 0x5a4030, userData: { grained: true } }),
    planks: new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(wood(), 1, 1), color: 0x8a6a4a, userData: { grained: true } }),
    logs: new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(bark(), [1, 2], 1.4), color: 0x8a7a6a }),
    roof: new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(slate(33, 2, 2), 1, 1.3), color: 0x6a6870 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x2a2a2e, metalness: 0.9, roughness: 0.7 }),
    // (lit from within by night: its glow is a uniform the hour sets, `daylight`)
    // (its panes' glass and leads, lit from within by their own picture: `windowPanes`)
    window: new THREE.MeshStandardMaterial({
      map: panes.glass, roughness: 0.25, metalness: 0.2, emissive: 0xffd0a0, emissiveMap: panes.lit, emissiveIntensity: 0,
    }),
    // (the same panes from inside the hall, lit by the sky through them: its glow the hour sets, `daylight`; the same
    // program as the window's; matte, as glossy as the window's one sash a pane caught the sun's panel in the sky's map
    // and burned white over its leads; its picture the sky's too, darkened: the day's glass's pale corner, lit by the
    // room over the sky's glow, burned each window's upper sash white)
    skyPane: new THREE.MeshStandardMaterial({
      map: panes.sky, color: 0x303030, roughness: 1, metalness: 0, emissive: SKY_PANE.color, emissiveMap: panes.sky, emissiveIntensity: 0,
    }),
    glass: new THREE.MeshStandardMaterial({ color: 0x2a2014, roughness: 0.3, emissive: 0xffc070, emissiveIntensity: 2.2 }),
    paper: new THREE.MeshStandardMaterial({ map: noticePaper(), roughness: 0.9 }),
    // (old pages: as pale as the notices, the book burned white under the porch's torch and its own candle)
    pagesLeft: new THREE.MeshStandardMaterial({ map: bookPage(78, false), color: 0x7a7264, roughness: 1 }),
    pagesRight: new THREE.MeshStandardMaterial({ map: bookPage(79, true), color: 0x7a7264, roughness: 1 }),
    pagesEdge: new THREE.MeshStandardMaterial({ map: pageEdges(), roughness: 1 }),
    ribbon: new THREE.MeshStandardMaterial({ color: 0x5a1416, roughness: 0.7 }),
    // (darker than it looks: pale, the porch's torch beside it lit it evenly bright from rim to foot, its bloom round it)
    wax: new THREE.MeshStandardMaterial({ color: 0x7a7262, roughness: 0.6 }),
    pearl: new THREE.MeshStandardMaterial({ color: 0x8e8878, roughness: 0.2, metalness: 0.1 }),
    chestWood: new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(boards(), 1, 0.6), color: 0xb09070 }),
    chestIron: new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(hammered(), 1, 1), color: 0xe6e6ea, metalness: 0.4 }),
    binding: new THREE.MeshStandardMaterial({ color: 0x4a1c16, roughness: 0.8 }),
    lining: new THREE.MeshStandardMaterial({ ...lining, bumpScale: 3, roughness: 0.95 }),
    liningInside: new THREE.MeshStandardMaterial({ ...liningLid, bumpScale: 3, roughness: 0.95, side: THREE.BackSide }),
    // (a little warmth of their own: lit by the moon alone, gold went olive; at 0x5a3808 they glowed a flat yellow, every
    // coin one colour whatever lit it, "this needs more detail"; metal, and dark in their colours (`GOLDEN`): what a coin
    // takes of the noon sky the porch's shade doesn't reach, and pale gold bloomed white, less metal paler still)
    gold: new THREE.MeshStandardMaterial({ ...coinsPile(), color: 0x6a5430, bumpScale: 2, roughness: 0.85, metalness: 0.1, emissive: 0x140c02 }),
    coin: new THREE.MeshStandardMaterial({ ...coinFaces(), vertexColors: true, bumpScale: 1.6, roughness: 0.56, metalness: 0.8, emissive: 0x1e1304 }),
    gilt: new THREE.MeshStandardMaterial({ ...chased(), color: 0xa07c34, bumpScale: 1.5, roughness: 0.42, metalness: 0.8, emissive: 0x1e1304 }),
    // (white: each stone's colour and its facets' are in its vertices, some near white, as a stone flashes)
    gem: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.1, emissive: 0x0c0c0c }),
    lockBrass: new THREE.MeshStandardMaterial({ ...lockPlate(), color: 0x989088, bumpScale: 1.5, roughness: 0.55, metalness: 0.7, emissive: 0x100a02 }),
    brass: new THREE.MeshStandardMaterial({ color: 0x6e5a2e, roughness: 0.5, metalness: 0.3 }),
    // (the street lamps' panes: their own picture, lit by nothing, as bright as the hour sets, `daylight`)
    lantern: new THREE.MeshBasicMaterial({ map: lanternPane(), color: LANTERN_PANE.day }),
    // (the lantern's frame, crown and cup, dark against its glass: lit, the lamp's light 15 cm off them burned the
    // crown's rim white)
    lanternIron: new THREE.MeshBasicMaterial({ color: 0x141214 }),
    freeAshlar: ashlarStone.clone(),
    freeCoping: copingStone.clone(),
    footAshlar: ashlarStone.clone(),
    gable: undefined as unknown as THREE.Material,
    chimney: undefined as unknown as THREE.Material,
    boardRoof: undefined as unknown as THREE.Material,
    freeTimber: undefined as unknown as THREE.Material,
    freePlanks: undefined as unknown as THREE.Material,
    freeBrass: undefined as unknown as THREE.Material,
    palisadeLogs: undefined as unknown as THREE.Material,
    palisadeTips: undefined as unknown as THREE.Material,
  };
  // (the palisade thins as a fence: as what's built, its hole opened by it alone, from play, "at border of map, the house
  // behind player suddenly disappeared": the houses' hole opened by it took the cottage beside him to its footing)
  mats.palisadeLogs = seeThrough(mats.logs.clone(), 'fence');
  mats.palisadeTips = seeThrough(mats.timber.clone(), 'fence');
  // (a house's gables thin as its roof does: left whole under the slate's ghost, each one's top edge stood as a pale stripe
  // along the roof's end, from play, "roof geometry little weird here")
  mats.gable = mats.plaster.clone();
  seeThrough(mats.gable, 'gable');
  // (a chimney stands out of the roof, and thins with it: whole on a ghost of a roof it stood as a heavy black post, a
  // review; from play, "chimney/gable needs work")
  mats.chimney = mats.ashlar.clone();
  seeThrough(mats.chimney, 'roof');
  // (the notice board and the lectern stand free, all of each in one kind: in the houses' wood they opened only in the hole
  // round him, a post cut across at its edge and the rest standing, and their papers and pages never thinned at all;
  // from play, "half drawn props", "if prop is drawn, its drawn fully... if its thinned, its thinned enough")
  mats.freeTimber = mats.timber.clone();
  mats.freePlanks = mats.planks.clone();
  mats.freeBrass = mats.brass.clone();
  mats.boardRoof = mats.roof.clone();
  // (a house's walls and roof, which never open over the shoulder; the rest stands free, opening wide as it hides him)
  for (const m of [mats.ashlar, mats.coping, mats.plaster, mats.timber, mats.planks, mats.logs, mats.window, mats.skyPane]) {
    seeThrough(m, 'built');
  }
  // (the notice board's roof isn't a house's: no room under it, and a ghost over the lit grass it took the fog of what's
  // seen through a roof, a hard blue plate over the board, a review)
  seeThrough(mats.roof, 'roof');
  const board = [mats.freeTimber, mats.freePlanks, mats.boardRoof, mats.paper];
  const lectern = [mats.binding, mats.pagesLeft, mats.pagesRight, mats.pagesEdge, mats.ribbon, mats.wax, mats.freeBrass];
  for (const m of [mats.column, mats.iron, mats.lantern, mats.lanternIron, mats.freeAshlar, mats.freeCoping, ...board,
    ...lectern]) {
    seeThrough(m, 'prop');
  }
  seeThrough(mats.footAshlar, 'propFoot');
  return mats;
}

/** A page of the chronicle (read from the desk's low edge, its lines running along the canvas's y): a hand's lines of
 *  ink on old paper, a red capital to begin them, and on `drawn` pages a sketch among them. */
function bookPage(seed: number, drawn: boolean): THREE.CanvasTexture {
  const c = canvasOf(256, 256), g = ctx2d(c), rng = mulberry(seed);
  g.fillStyle = '#d8c8a0';
  g.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 400; k++) {
    g.fillStyle = `rgba(90,60,30,${0.02 + rng() * 0.05})`;
    g.fillRect(rng() * 256, rng() * 256, 2 + rng() * 6, 1 + rng() * 3);
  }
  // (the page's own way up: x along a line, y down the page)
  g.translate(256, 0);
  g.rotate(Math.PI / 2);
  g.strokeStyle = 'rgba(38,24,14,.85)';
  g.lineWidth = 1.5;
  g.lineCap = 'round';
  const left = 24, right = 232;
  const scrawl = (x0: number, x1: number, y: number): void => {
    let x = x0;
    g.beginPath();
    while (x < x1) {
      const end = Math.min(x1, x + 14 + rng() * 26);
      g.moveTo(x, y);
      const tall = 1.2 + rng() * 2.2, wave = 1.2 + rng() * 1.4;
      for (let at = x; at < end; at += 2.4) {
        // (now and then a stroke up or down out of the line, as a hand's l and g are)
        const reach = rng() < 0.1 ? (rng() < 0.5 ? -6 : 5) : 0;
        g.lineTo(at, y + reach + Math.sin(at * wave + rng()) * tall);
      }
      x = end + 4 + rng() * 5;
    }
    g.stroke();
  };
  const sketchFrom = drawn ? 100 : 999, sketchTo = sketchFrom + 78;
  for (let y = 26, row = 0; y < 236; y += 13, row++) {
    if (y > sketchFrom && y < sketchTo) continue;
    scrawl(row < 3 ? left + 36 : left, right - rng() * (row % 5 === 4 ? 90 : 12), y);
  }
  g.fillStyle = '#7e1f18';
  g.fillRect(left, 16, 28, 36);
  g.strokeStyle = '#d8c8a0';
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(left + 7, 46);
  g.lineTo(left + 14, 22);
  g.lineTo(left + 21, 46);
  g.moveTo(left + 9, 37);
  g.lineTo(left + 19, 37);
  g.stroke();
  if (drawn) {
    // (a sketch: a ring of runes round a star, a line off it)
    g.strokeStyle = 'rgba(38,24,14,.85)';
    g.lineWidth = 1.6;
    g.beginPath();
    g.arc(128, 139, 30, 0, Math.PI * 2);
    g.moveTo(158, 139);
    g.arc(128, 139, 22, 0, Math.PI * 2);
    for (let k = 0; k <= 5; k++) {
      const a = -Math.PI / 2 + (k * 4 * Math.PI) / 5;
      if (k) g.lineTo(128 + Math.cos(a) * 22, 139 + Math.sin(a) * 22);
      else g.moveTo(128 + Math.cos(a) * 22, 139 + Math.sin(a) * 22);
    }
    g.stroke();
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return map;
}

/** A page block's edge: the leaves' lines, side by side. */
function pageEdges(): THREE.CanvasTexture {
  const c = canvasOf(8, 32), g = ctx2d(c), rng = mulberry(80);
  for (let y = 0; y < 32; y++) {
    const shade = 104 + rng() * 60;
    g.fillStyle = `rgb(${shade},${shade * 0.88},${shade * 0.68})`;
    g.fillRect(0, y, 8, 1);
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

/** The notices pinned to the board: a sheet of rough paper, its lines of ink as a hand writes them, a seal or two. */
function noticePaper(): THREE.CanvasTexture {
  const c = canvasOf(256, 256), g = ctx2d(c), rng = mulberry(77);
  g.fillStyle = '#d8c8a0';
  g.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 900; k++) {
    g.fillStyle = `rgba(90,60,30,${0.03 + rng() * 0.05})`;
    g.fillRect(rng() * 256, rng() * 256, 2 + rng() * 6, 1 + rng() * 3);
  }
  g.strokeStyle = 'rgba(40,24,12,.75)';
  g.lineWidth = 2;
  for (let y = 28; y < 230; y += 18 + rng() * 6) {
    g.beginPath();
    let x = 18 + rng() * 10;
    g.moveTo(x, y);
    const end = 200 + rng() * 36;
    while (x < end) { x += 4 + rng() * 9; g.lineTo(x, y + (rng() - 0.5) * 3); }
    g.stroke();
  }
  g.fillStyle = '#8a1e14';
  g.beginPath(); g.arc(196, 214, 14, 0, TAU); g.fill();
  return textureFromCanvas(c);
}

/** A cottage window's two pictures: its glass as the day shows it (dark panes, a grey sheen, the lead between) and its
 *  light by night (each pane lit warm from a room's candle low in the middle, the mullions' cross and the leads dark).
 *  As one glowing box the windows bloomed into blobs on a dark band: from play, "this is not how windows supposed to
 *  look". */
/** how bright a street lamp's panes are drawn by day and by night (their picture's colours times these): drawn in
 *  a lit glowing material with the lamp's light 0.25 m off them, they burned white and the bloom hid the whole
 *  lantern ("lights too bright, can't see geometry even"; `lab village`'s lamps check) */
const LANTERN_PANE = { day: new THREE.Color(0.22, 0.2, 0.18), night: new THREE.Color(0.5, 0.47, 0.44) };

/** A street lamp's pane as lit from within (one of six round the lantern, `repeat` 6 across): warm and brightest
 *  low in its middle, where the flame burns, amber to its edges, its frame's dark edge round it. */
function lanternPane(): THREE.CanvasTexture {
  const W = 32, H = 64;
  const c = canvasOf(W, H), g = ctx2d(c);
  const glow = g.createRadialGradient(W / 2, H * 0.62, 2, W / 2, H * 0.55, H * 0.6);
  glow.addColorStop(0, '#ffe7b0');
  glow.addColorStop(0.35, '#f0a850');
  glow.addColorStop(1, '#6a3412');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#1a120c';
  g.lineWidth = 3;
  g.strokeRect(0, 0, W, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(6, 1);
  return t;
}

function windowPanes(): { glass: THREE.CanvasTexture; lit: THREE.CanvasTexture; sky: THREE.CanvasTexture } {
  const W = 128, H = 112, bar = 8, lead = 1.5;
  const draw = (lit: boolean, sky = false): THREE.CanvasTexture => {
    const c = canvasOf(W, H), g = ctx2d(c), rng = mulberry(lit ? 31 : 37);
    if (sky) {
      // (the sky's light through the glass, seen from inside: even and pale, a little brighter up it; the day's
      // glass's dark sheen lit by the sky read as a dusk in the noon's windows)
      const day = g.createLinearGradient(0, 0, 0, H);
      day.addColorStop(0, '#d8dde2');
      day.addColorStop(1, '#b8bcc0');
      g.fillStyle = day;
    } else if (lit) {
      const glow = g.createRadialGradient(W / 2, H * 0.8, 4, W / 2, H * 0.7, W * 0.75);
      glow.addColorStop(0, '#fff2d0');
      glow.addColorStop(0.45, '#e09040');
      glow.addColorStop(1, '#5a2a10');
      g.fillStyle = glow;
    } else {
      const sheen = g.createLinearGradient(0, 0, W, H);
      sheen.addColorStop(0, '#5a6066');
      sheen.addColorStop(0.5, '#262a2e');
      sheen.addColorStop(1, '#3a3e42');
      g.fillStyle = sheen;
    }
    g.fillRect(0, 0, W, H);
    // (each pane a shade of its own: old glass is never even; but the sky's, its lightest sash bloomed white)
    for (let px = 0; px < 2 && !sky; px++) for (let py = 0; py < 2; py++) {
      g.fillStyle = `rgba(0,0,0,${rng() * 0.25})`;
      g.fillRect(px * W / 2, py * H / 2, W / 2, H / 2);
    }
    // the leads: small panes in a grid, and the frame's cross and edge over them
    g.fillStyle = lit ? '#1a0e06' : '#141210';
    for (let x = W / 6; x < W; x += W / 6) g.fillRect(x - lead / 2, 0, lead, H);
    for (let y = H / 5; y < H; y += H / 5) g.fillRect(0, y - lead / 2, W, lead);
    g.fillStyle = '#2a1c12';
    g.fillRect(W / 2 - bar / 2, 0, bar, H);
    g.fillRect(0, H / 2 - bar / 2, W, bar);
    g.lineWidth = bar;
    g.strokeStyle = '#2a1c12';
    g.strokeRect(bar / 2, bar / 2, W - bar, H - bar);
    return textureFromCanvas(c);
  };
  return { glass: draw(false), lit: draw(true), sky: draw(false, true) };
}

// --- the builder ----------------------------------------------------------------------------------------------------

export function buildVillage(scene: THREE.Group): Village {
  const rng = mulberry(9001);
  const obstacles: Obstacle[] = [];
  const updaters: Updater[] = [];
  const wall = new Wall('village');
  const levels = new Levels();
  const M = makeMats();
  const lights: THREE.PointLight[] = [];

  const sky = buildDaySky();
  scene.add(sky.mesh);
  // (where the trees stand first: the meadow's mask leaves their feet bare)
  const trees = treeSpots(rng);
  const mask = meadowMask(trees);
  const maskTexture = mask.texture();
  const maskUniforms: MaskUniforms = { uMeadow: { value: maskTexture }, uMeadowHalf: { value: mask.half } };
  // (what never moves frozen as it's built, `stillBuilt`: nothing of it is used, struck or animated)
  stillBuilt(scene, () => buildGround(scene, M, maskUniforms));
  const meadow = buildMeadow(mask, maskTexture, updaters);
  scene.add(...asGrass(meadow));
  const fountainLight = buildSquare(scene, M, obstacles, updaters);
  stillBuilt(scene, () => buildTerrace(scene, wall, levels, M));
  // (the hall stands still too: its 300 parts' matrices were made again every frame; its roof and front wall,
  // hidden over the hero inside, are kept out of the merge)
  const hall = stillBuilt(scene, () => buildHall(scene, wall, levels, M, obstacles, updaters));
  for (const part of hall.cutaway) part.traverse((object) => { object.userData.noMerge = true; });
  const lid = buildChest(scene, M, obstacles);
  // (drawn over the sun's kept map each frame: each frame of its swing, redrawn whole, was 8 million triangles and 8 to 12
  // ms of the page, and the first turn of the view by the chest fell to 70 a second)
  movesInShadows(lid);
  const pile = lid.parent!.getObjectByName('chest-hoard')!;
  stillBuilt(scene, () => buildLectern(scene, M, obstacles));
  const candle = candleFlame(scene, torchLook(), lights);
  stillBuilt(scene, () => buildPalisade(scene, wall, M, rng));
  const portals: Portal[] = stillBuilt(scene, () => [buildCryptWay(scene, wall, M, updaters), buildForestWay(scene, wall, updaters)]);
  const exits = {} as Village['exits'];
  for (const id of BIOME_IDS) {
    const p = exitPlace(id);
    exits[id] = { at: new THREE.Vector3(p.x, 0, p.z), facing: p.facing };
  }
  stillBuilt(scene, () => { for (const c of COTTAGES) buildCottage(scene, wall, M, c, rng); });
  stillBuilt(scene, () => buildTrees(scene, wall, obstacles, trees));
  buildYard(scene, wall, M);
  const campfire = buildBonfire(scene, CAMPFIRE[0], CAMPFIRE[1], M.ashlar, M.logs, updaters, false);
  campfire.light.decay = 2 + CAMPFIRE_LIGHT.soft;
  obstacles.push({ x: CAMPFIRE[0], z: CAMPFIRE[1], r: 1.0, h: 0.5 });
  stillBuilt(scene, () => buildBenches(scene, M, obstacles));
  stillBuilt(scene, () => buildNoticeBoard(scene, wall, M));
  const stair = [-1, 1].map((s) => buildLamp(scene, TERRACE.x + s * LAMPS.x, LAMPS.z, M, obstacles));
  for (const { light } of stair) lights.push(light);
  // (the stair's lamps lit as the street lamps are, and casting as they do: lit by a point light of their own, dim
  // and never casting, the hero by one cast "no shadows FROM LIGHT, only from moon")
  const lanterns = [...stair.map(({ lantern }) => lantern), ...stillBuilt(scene, () => buildStreetLamps(scene, M, obstacles))];
  let night = 0;
  updaters.push(contactShadows(scene, obstacles));
  updaters.push(sky.update);
  updaters.push(chimneySmoke());
  updaters.push(portalMotes());

  let lidOpen = 0, chestShown = false, chestNear = false, candleLit = 0, candleNear = false;
  let hoardWanted = 1, hoardFull = 1, hoardDrawn = { full: -1, open: -1 };
  updaters.push((dt) => {
    lidOpen += ((chestShown || chestNear ? 1 : 0) - lidOpen) * Math.min(1, dt * 8);
    lid.rotation.x = -lidOpen * 1.4;
    // (as full as the stash is: at once with the lid shut, and rising or sinking where it's seen)
    hoardFull += (hoardWanted - hoardFull) * Math.min(1, dt * HOARD_EASE);
    if (lidOpen < LID_STILL || Math.abs(hoardWanted - hoardFull) < HOARD_NEAR) hoardFull = hoardWanted;
    if (hoardFull !== hoardDrawn.full || lidOpen !== hoardDrawn.open) {
      (pile.userData.show as (full: number, open: number) => void)(hoardFull, lidOpen);
      hoardDrawn = { full: hoardFull, open: lidOpen };
    }
    candleLit += ((candleNear ? 1 : 0) - candleLit) * Math.min(1, dt * 5);
    // (never quite out: a light at no strength stays a light, or every shader compiles again)
    candle.scale.setScalar(Math.max(0.001, candleLit));
    (candle.children[1] as THREE.PointLight).intensity = CANDLE.intensity * candleLit;
  });

  return {
    look: { ...lookAt(18), env: VILLAGE_ENV },
    obstacles,
    wall,
    props: [],
    portals,
    relief: levels.relief,
    exits,
    trees,
    lanterns,
    sight: sightOfThePlace(),
    hallCutaway: hall.cutaway,
    meadow,
    hallTorches: [...hall.dais, ...hall.torches],
    porchTorches: hall.porch,
    stillLights: castingLights(scene),
    get night() { return night; },
    setCalm() {},
    update(dt, t) { for (const u of updaters) u(dt, t); },
    setChest(open) { chestShown = open; },
    setChestNear(near) { chestNear = near; },
    setCandleNear(near) { candleNear = near; },
    setChestFull(full) { hoardWanted = full; },
    daylight(hour, look) {
      Object.assign(look, lookAt(hour));
      sky.set(hour);
      // (the windows lit as the light goes; the lanterns' glass burns the same at any hour)
      M.window.emissiveIntensity = WINDOW_GLOW * (1 - dayness(hour));
      // (a fire adds little to what the sun lights: at its night's strength, the sun on him too, a hand beside it burned
      // white, from play, "fire blinding skin issue again")
      campfire.intensity = BONFIRE_LIGHT * CAMPFIRE_LIGHT.by
        * (CAMPFIRE_BY_DAY + (1 - CAMPFIRE_BY_DAY) * (1 - dayness(hour)));
      M.skyPane.emissiveIntensity = SKY_PANE.night + (SKY_PANE.day - SKY_PANE.night) * dayness(hour);
      M.lantern.color.copy(LANTERN_PANE.day).lerp(LANTERN_PANE.night, 1 - dayness(hour));
      night = 1 - dayness(hour);
      fountainLight(dayness(hour));
      hoardLight(M, dayness(hour));
    },
  };
}

// --- the light by the hour ------------------------------------------------------------------------------------------

/** The hoard's metal by the hour (uniforms, nothing compiles): the sky a face reflects isn't shaded by the porch, and gold
 *  light enough for the lamps' light alone bloomed white by day, whole coins' designs lost; dark enough for the day, it
 *  was mud at midnight (a review of each). */
function hoardLight(M: Mats, day: number): void {
  for (const [metal, base] of [[M.coin, 0xffffff], [M.gilt, GILT], [M.lockBrass, LOCK_BRASS]] as const) {
    metal.color.setHex(base).multiplyScalar(1 + (METAL_BY_NIGHT.bright - 1) * (1 - day));
    // (warmer by night: only brighter, the heap drained to a pale khaki)
    metal.color.g *= 1 - 0.14 * (1 - day);
    metal.color.b *= 1 - 0.45 * (1 - day);
    metal.metalness = METAL_BY_NIGHT.metal + (METAL_BY_DAY.metal - METAL_BY_NIGHT.metal) * day;
    metal.roughness = METAL_BY_NIGHT.rough + (METAL_BY_DAY.rough - METAL_BY_NIGHT.rough) * day;
    // (warmth of its own by night: by the moon and the lamps alone, the heap read grey-olive, a review)
    metal.emissive.setHex(METAL_WARMTH.day).lerp(warmthByNight, 1 - day);
  }
  // (a piece's few curved faces sheen where a coin's many flat ones bloomed)
  M.gilt.roughness *= GILT_SHEEN;
  // (less a mirror than the coins: a crown's walls facing the dark of the porch went near black at noon, a review)
  M.gilt.metalness *= GILT_METAL;
  M.lockBrass.roughness *= GILT_SHEEN;
}
/** the hoard's metal, by day and by night, and the gilt's and the lock's colours by day */
const METAL_BY_DAY = { metal: 0.85, rough: 0.62 }, METAL_BY_NIGHT = { metal: 0.6, rough: 0.56, bright: 1.35 };
const GILT = 0xa8863c, LOCK_BRASS = 0x6e6048, GILT_SHEEN = 0.65, GILT_METAL = 0.7;
const METAL_WARMTH = { day: 0x140c02, night: 0x3c2206 }, warmthByNight = new THREE.Color(METAL_WARMTH.night);

/** How high the sun is at `hour` (the sine of its height over the horizon: below 0 it's night). */
function sunHeight(hour: number): number {
  const share = (hour - DAY.dawn) / (DAY.dusk - DAY.dawn);
  return Math.sin(share * Math.PI) * Math.sin(SUN_HIGH);
}

/** 0 by night, 1 by full day, between through the twilights. */
/** the campfire's light at noon, as a share of its light by night */
const CAMPFIRE_BY_DAY = 0.3;
/** the campfire's light softer close to than a bonfire's (`soft`, m squared in its decay) and stronger by as much
 *  further out (`by`): at a bonfire's, the warrior's skin beside it at midnight burned 0.91% of his figure (at most
 *  0.9%, `lab village --only heroBesideFire`), and dimmed to pass it, its red on the ground fell under
 *  `campfireBurns`'s floor */
const CAMPFIRE_LIGHT = { soft: 40, by: 1.5 };
const dayness = (hour: number): number => THREE.MathUtils.smoothstep(sunHeight(hour), -0.12, 0.35);

/** The way to the key light at `hour`: the sun along its arc from east through south to west, by night the moon. */
function skyLightDir(hour: number, out = new THREE.Vector3()): THREE.Vector3 {
  const day = DAY.dusk - DAY.dawn;
  const sun = (hour - DAY.dawn) / day;
  const up = sun >= 0 && sun <= 1;
  // (the moon crosses the night the sun's way, from the dusk to the dawn)
  const night = 24 - day;
  const moon = (((hour - DAY.dusk) % 24) + 24) % 24 / night;
  const share = up ? sun : moon, high = up ? SUN_HIGH : MOON_HIGH;
  const height = Math.max(0.12, Math.sin(share * Math.PI) * high);
  const round = share * Math.PI;
  return out.set(Math.cos(round) * Math.cos(height), Math.sin(height), Math.sin(round) * Math.cos(height) * 0.75 + 0.25).normalize();
}

const _a = new THREE.Color(), _b = new THREE.Color();
/** `a` to `b` by `k`, as a hex colour. */
const mixHex = (a: number, b: number, k: number): number => _a.set(a).lerp(_b.set(b), k).getHex();

/** The village's look at `hour`: night to twilight as the sun nears the horizon, twilight to day as it climbs. */
function lookAt(hour: number): Omit<BiomeLook, 'env'> {
  const s = sunHeight(hour);
  const toTwilight = THREE.MathUtils.smoothstep(s, -0.35, -0.02);
  const toDay = THREE.MathUtils.smoothstep(s, 0.02, 0.5);
  const low = s < 0.02;
  const [from, to, k] = low ? [NIGHT, TWILIGHT, toTwilight] as const : [TWILIGHT, NOON, toDay] as const;
  const fog = mixHex(from.fog, to.fog, k);
  const dir = skyLightDir(hour).multiplyScalar(SKY_LIGHT_FAR);
  return {
    background: fog,
    fog: { color: fog, near: 55, far: 150 },
    hemi: { sky: mixHex(from.hemi, to.hemi, k), ground: mixHex(from.ground, to.ground, k), intensity: THREE.MathUtils.lerp(from.hemiI, to.hemiI, k) },
    moon: { color: mixHex(from.light, to.light, k), intensity: THREE.MathUtils.lerp(from.lightI, to.lightI, k), pos: [dir.x, dir.y, dir.z] },
    envIntensity: THREE.MathUtils.lerp(from.env, to.env, k),
    adapt: THREE.MathUtils.lerp(from.adapt, to.adapt, k),
  };
}

/** The sky over the village: the fog's colour at the horizon rising into its zenith, the sun's disc and glow by day, by
 *  night the moon and stars; clouds drifting. Set by the hour (`set`: uniforms alone). Unfogged, behind everything. */
function buildDaySky(): { mesh: THREE.Mesh; update: Updater; set(hour: number): void } {
  const uniforms = {
    uHorizon: { value: new THREE.Color() }, uZenith: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3(0, 1, 0) },
    uDay: { value: 0 }, uTime: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    // on the far plane, drawn after everything opaque: the depth test skips every covered pixel
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `
      varying vec3 vDir; uniform vec3 uHorizon; uniform vec3 uZenith; uniform vec3 uSun; uniform float uDay; uniform float uTime;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      // no sin(): its precision loss on big cell coordinates lines the stars up in rings round the zenith
      float h3(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec3 d = normalize(vDir);
        float y = max(d.y, 0.0);
        vec3 c = mix(uHorizon, uZenith, smoothstep(0.0, 0.55, y));
        float m = max(dot(d, uSun), 0.0);
        // the sun's glow and disc by day, warmer low; the moon's by night, small and pale
        vec3 glow = mix(vec3(0.05, 0.06, 0.1), vec3(0.55, 0.38, 0.2), uDay);
        c += glow * pow(m, 10.0) * 0.4;
        float disc = smoothstep(mix(0.99988, 0.9993, uDay), mix(0.99993, 0.9996, uDay), m);
        c += mix(vec3(0.5, 0.54, 0.64), vec3(1.0, 0.9, 0.72) * 2.4, uDay) * disc;
        // stars, fading in as the day goes (cubic cells cut the sphere unevenly: scaled to even the density out)
        vec3 ad = abs(d);
        vec3 g = floor(d * 700.0);
        float dens = 0.004 * 1.732 / (ad.x + ad.y + ad.z);
        float b = h3(g + 1.0);
        c += vec3(0.8, 0.82, 1.0) * 0.5 * step(1.0 - dens, h3(g)) * smoothstep(0.12, 0.4, y) * (0.25 + b * b * b) * (1.0 - uDay);
        // clouds on a plane overhead, thinning towards the horizon, lit by the day and grey by night
        vec2 p = d.xz / max(d.y, 0.08) * 1.6 + vec2(uTime * 0.01, uTime * 0.004);
        float cl = n(p) * 0.55 + n(p * 2.3 + 5.0) * 0.3 + n(p * 5.1 + 9.0) * 0.15;
        cl = smoothstep(0.52, 0.82, cl) * smoothstep(0.04, 0.3, y);
        c = mix(c, uHorizon * mix(0.7, 1.25, uDay) + vec3(0.1, 0.06, 0.03) * pow(m, 4.0), cl * 0.6);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 16), WEBGPU ? villageSkyMaterial(uniforms) : mat);
  mesh.renderOrder = 100;
  mesh.frustumCulled = false;
  return {
    mesh,
    update: (_dt, t) => { uniforms.uTime.value = t; },
    set(hour) {
      const look = lookAt(hour), day = dayness(hour);
      uniforms.uHorizon.value.set(look.fog.color);
      const k = THREE.MathUtils.smoothstep(sunHeight(hour), -0.3, 0.4);
      uniforms.uZenith.value.setRGB(...(k < 0.5 ? lerpRGB(NIGHT.sky, TWILIGHT.sky, k * 2) : lerpRGB(TWILIGHT.sky, NOON.sky, k * 2 - 1)));
      skyLightDir(hour, uniforms.uSun.value);
      uniforms.uDay.value = day;
    },
  };
}

const lerpRGB = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

// --- the ground, the square and its fountain ------------------------------------------------------------------------

/** The ground: a meadow's sward out past the fog (bare earth where the mask has no grass), the cobbled square round the
 *  fountain, its edge wandering, and the cobbled roads winding from it. */
function buildGround(scene: THREE.Object3D, M: Mats, mask: MaskUniforms): void {
  const earth = meadowGround(new THREE.MeshStandardMaterial({ ...pbrMaterialMaps(soil(), 90, 1.1), color: 0xe0c8a4 }), mask);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(220, 96).rotateX(-Math.PI / 2), earth);
  ground.receiveShadow = true;
  scene.add(ground);
  // (the square and the roads cobbled alike, a tile a metre and a half in the world's frame: where they overlap, they
  // draw the same)
  scene.add(flatPatch(squareOutline(), M.cobbles, 0.012));
  roadLines.forEach((road, k) => scene.add(roadStrip(road.line, road.width, M.cobbles, k)));
  scene.add(curbs(M.coping));
}

/** the curbs along the roads' and the square's edges: how wide and how high (m); the grass grows up to them (from play,
 *  "no grass on paved road pls, if you want, lets have curb, grass will be up to curb") */
const CURB = { w: 0.2, h: 0.07 };

/** A road's two edges, each point of `line` its width's half out either side: the left (-1) and the right (1). They
 *  run with its line's curve (a spline, `windingLine`): wandering in and out every 2 m, its curbs were wavy, as
 *  "nobody makes a curb". */
function roadEdges(line: readonly Spot[], width: number): [Spot[], Spot[]] {
  const edges: [Spot[], Spot[]] = [[], []];
  line.forEach(([x, z], i) => {
    const [ax, az] = line[Math.max(0, i - 1)], [bx, bz] = line[Math.min(line.length - 1, i + 1)];
    const len = Math.hypot(bx - ax, bz - az) || 1, nx = -(bz - az) / len, nz = (bx - ax) / len;
    for (const [k, s] of [[0, -1], [1, 1]] as const) edges[k].push([x + (nx * width * s) / 2, z + (nz * width * s) / 2]);
  });
  return edges;
}

/** Whether (x, z) is inside the polygon through `points`. */
function insidePolygon(points: readonly Spot[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, zi] = points[i], [xj, zj] = points[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** A curb's run: its line along the paving's edge, the way out from the paving (1: to its left as it goes, -1: to its
 *  right), whether it closes on itself, and how much higher than a curb it stands (m). */
interface CurbRun { line: Spot[]; out: 1 | -1; closed: boolean; lift: number }

/** the square's curb stands this much over the roads' (m): where a road's meets it their tops overlap, and at one
 *  height they flickered through each other */
const SQUARE_CURB_LIFT = 0.006;

/** The parts of `line` (closed: a loop) outside every polygon of `pavings`, each cut where it crosses one's edge. */
function uncovered(line: readonly Spot[], closed: boolean, pavings: readonly Spot[][]): Spot[][] {
  // (a curb stops where paving or anything built stands: it ran on into the terrace's front wall)
  const covered = ([x, z]: Spot): boolean => solidAt(x, z) || pavings.some((p) => insidePolygon(p, x, z));
  const crossing = (a: Spot, b: Spot): Spot => {
    // (halved till it's within a millimetre: a's side and b's differ)
    let lo = 0, hi = 1;
    const inA = covered(a);
    for (let k = 0; k < 12; k++) {
      const t = (lo + hi) / 2;
      if (covered([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]) === inA) lo = t;
      else hi = t;
    }
    const t = (lo + hi) / 2;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  const runs: Spot[][] = [];
  let run: Spot[] | null = covered(line[0]) ? null : [line[0]];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], inB = covered(b);
    if (run && inB) {
      run.push(crossing(a, b));
      runs.push(run);
      run = null;
    } else if (!run && !inB) run = [crossing(a, b), b];
    else if (run) run.push(b);
  }
  if (run) runs.push(run);
  // (a loop cut open: its last run goes on into its first)
  if (closed && runs.length > 1 && !covered(line[0])) runs[0] = [...runs.pop()!, ...runs[0].slice(1)];
  return runs.filter((r) => r.length > 1);
}

/** Every edge of the paving as a curb's runs: the square's round it and each road's along its sides, each cut off
 *  where it runs onto other paving (a road's mouth on the square, where two roads meet). */
function curbLines(): CurbRun[] {
  const square = squareOutline();
  const roads = roadLines.map((road) => roadEdges(road.line, road.width));
  const pavings = [square, ...roads.map(([left, right]) => [...left, ...[...right].reverse()])];
  const edges: (Omit<CurbRun, 'closed'> & { own: number; closed: boolean })[] = [
    { line: [...square, square[0]], out: -1, own: 0, closed: true, lift: SQUARE_CURB_LIFT },
  ];
  roads.forEach(([left, right], k) => {
    edges.push({ line: left, out: -1, own: k + 1, closed: false, lift: 0 });
    edges.push({ line: right, out: 1, own: k + 1, closed: false, lift: 0 });
  });
  return edges.flatMap(({ line, out, own, closed, lift }) => {
    const runs = uncovered(line, closed, pavings.filter((_, i) => i !== own));
    const whole = runs.length === 1 && runs[0].length === line.length;
    return runs.map((run): CurbRun => ({ line: run, out, closed: closed && whole, lift }));
  });
}

/** Each point's way out of a run, its segments' outward normals met in a mitre (so the curb's outer side is one line
 *  round a bend: square ends on each segment left a notch at every corner of the square), `w` long across. */
function mitred({ line, out, closed }: CurbRun, w: number): Spot[] {
  const n = line.length;
  const normal = (i: number): Spot => {
    const [ax, az] = line[i], [bx, bz] = line[i + 1];
    const len = Math.hypot(bx - ax, bz - az) || 1;
    return [(-(bz - az) / len) * out, ((bx - ax) / len) * out];
  };
  return line.map((_, i): Spot => {
    const ends = closed && (i === 0 || i === n - 1);
    const before = i > 0 ? normal(i - 1) : ends ? normal(n - 2) : normal(0);
    const after = i < n - 1 ? normal(i) : ends ? normal(0) : normal(n - 2);
    const mx = before[0] + after[0], mz = before[1] + after[1], len = Math.hypot(mx, mz) || 1;
    const cos = Math.max(0.5, (mx / len) * after[0] + (mz / len) * after[1]);
    return [(mx / len / cos) * w, (mz / len / cos) * w];
  });
}

/** The curbs' faces, each run's wound by the way it goes out from its paving: wound alike, a run going out to its
 *  right showed its underside, its top culled, and of a curb along one side of each road only a sliver was drawn. */
export function curbGeometry(): THREE.BufferGeometry {
  const positions: number[] = [], uvs: number[] = [];
  for (const run of curbLines()) {
    const { line } = run;
    const quad = (a: number[], b: number[], c: number[], d: number[], along0: number, along1: number): void => {
      if (run.out === 1) {
        positions.push(...a, ...c, ...b, ...a, ...d, ...c);
        uvs.push(along0, 0, along1, 1, along1, 0, along0, 0, along0, 1, along1, 1);
        return;
      }
      positions.push(...a, ...b, ...c, ...a, ...c, ...d);
      uvs.push(along0, 0, along1, 0, along1, 1, along0, 0, along1, 1, along0, 1);
    };
    const off = mitred(run, CURB.w);
    const h = CURB.h + run.lift;
    // (each point's inner foot and top, outer top and foot)
    const ring = (i: number): number[][] => {
      const [x, z] = line[i], [ox, oz] = off[i];
      return [[x, 0, z], [x, h, z], [x + ox, h, z + oz], [x + ox, 0, z + oz]];
    };
    let along = 0;
    for (let i = 1; i < line.length; i++) {
      const next = along + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
      const [a0, a1, a2, a3] = ring(i - 1), [b0, b1, b2, b3] = ring(i);
      // its face to the paving, its top, its face to the grass
      quad(a0, b0, b1, a1, along, next);
      quad(a1, b1, b2, a2, along, next);
      quad(a2, b2, b3, a3, along, next);
      along = next;
    }
    if (run.closed) continue;
    const [s0, s1, s2, s3] = ring(0), [e0, e1, e2, e3] = ring(line.length - 1);
    quad(s3, s2, s1, s0, 0, CURB.w);
    quad(e0, e1, e2, e3, 0, CURB.w);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs.map((v, k) => (k % 2 ? v * 0.3 : v)), 2));
  g.computeVertexNormals();
  return g;
}

/** The curbs: a low stone strip out from each edge of the paving (`curbLines`), mitred round its bends and capped at
 *  its ends. One mesh, standing still. */
function curbs(m: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(curbGeometry(), m);
  mesh.name = 'curbs';
  mesh.receiveShadow = true;
  mesh.userData.noBake = true;
  return mesh;
}

/** how far north the square's edge goes (m), short of the stair's foot, so each curb of the stair's road comes straight
 *  up to its cheek: reaching the foot, the square's own curb lay along one cheek's foot, its end at the bottom step */
const SQUARE_NORTH = TERRACE.stairFoot * -1 - 1.5;
/** how softly it's held to it (m) */
const SQUARE_NORTH_EASE = 0.7;

/** `v` held under `most`, easing over to it. */
function softLeast(v: number, most: number): number {
  const over = (v - most) / SQUARE_NORTH_EASE;
  return most - SQUARE_NORTH_EASE * Math.log1p(Math.exp(-over));
}

/** The square's edge: round the fountain, wandering in and out, held short of the stair's foot. */
function squareOutline(): Spot[] {
  return Array.from({ length: 64 }, (_, k): Spot => {
    const a = (k / 64) * TAU;
    const r = SQUARE_R * (1 + 0.09 * Math.sin(3 * a + 1.1) + 0.05 * Math.sin(5 * a + 2.3) + 0.03 * Math.sin(9 * a));
    return [Math.cos(a) * r, -softLeast(-Math.sin(a) * r, SQUARE_NORTH)];
  });
}

/** UVs a tile `tile` m in the world's frame (x, z), for a flat geometry lying on the ground. */
function worldUVs(g: THREE.BufferGeometry, tile: number): void {
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let k = 0; k < p.count; k++) {
    uv[k * 2] = p.getX(k) / tile;
    uv[k * 2 + 1] = p.getZ(k) / tile;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** A flat patch of `m` over the polygon `points` (x, z), `y` over the ground. */
function flatPatch(points: readonly Spot[], m: THREE.Material, y: number): THREE.Mesh {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
  worldUVs(g, 1.5);
  const mesh = new THREE.Mesh(g, m);
  mesh.position.y = y;
  mesh.receiveShadow = true;
  return mesh;
}

/** A road along `line` (points every 0.4 m), `width` m wide, its edges wandering a little either side (each road its
 *  own, `seed`). */
function roadStrip(line: readonly Spot[], width: number, m: THREE.Material, seed: number): THREE.Mesh {
  const positions: number[] = [], index: number[] = [];
  const [left, right] = roadEdges(line, width);
  line.forEach((_, i) => {
    positions.push(left[i][0], 0, left[i][1], right[i][0], 0, right[i][1]);
    if (i > 0) {
      const a = (i - 1) * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  worldUVs(g, 1.5);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, m);
  mesh.position.y = 0.016;
  mesh.receiveShadow = true;
  return mesh;
}

/** Where grass grows: everywhere but the roads, the square, what's built and where feet wear it (the footpaths, the
 *  yard, round the campfire, the trees' feet). */
function meadowMask(trees: readonly TreeSpot[]): MeadowMask {
  const mask = new MeadowMask(48);
  // the paving and its curbs, the grass up to them; the footpaths, earth trodden bare down their middles
  mask.clearPolygon(squareOutline());
  roadLines.forEach((road, k) => {
    const [left, right] = roadEdges(road.line, road.width);
    mask.clearPolygon([...left, ...right.reverse()]);
  });
  for (const { line } of curbLines()) mask.clearPath(line, CURB.w * 2 + 0.1);
  for (const c of COTTAGES) {
    const path = footpathOf(c);
    if (!path) continue;
    mask.clearPath(path, 1.5, 0.45);
    mask.clearPath(path, 0.75, 0.1);
  }
  const X = TERRACE.x;
  mask.clearRect(X - TERRACE.half - 0.6, TERRACE.back - 0.6, X + TERRACE.half + 0.6, TERRACE.front + 0.5);
  // (the hall of heroes' footing past the terrace's back: blades grew under its stone)
  mask.clearRect(X - HALL.half - 0.6, HALL.wall - HALL.half + HALL.inHalf - 0.6, X + HALL.half + 0.6, TERRACE.back);
  mask.clearRect(X - TERRACE.stairHalf - 0.3, TERRACE.front, X + TERRACE.stairHalf + 0.3, TERRACE.stairFoot + 0.4);
  mask.clearRect(YARD.x - YARD.halfX, YARD.z - YARD.halfZ, YARD.x + YARD.halfX, YARD.z + YARD.halfZ, 0.4, YARD.turn);
  for (const c of COTTAGES) {
    const w = (COTTAGE.w / 2 + 0.5) * c.size, d = (COTTAGE.d / 2 + 0.5) * c.size;
    mask.clearRect(c.x - w, c.z - d, c.x + w, c.z + d, 0, c.facing);
  }
  mask.clearCircle(CAMPFIRE[0], CAMPFIRE[1], 1.6);
  mask.clearCircle(CAMPFIRE[0], CAMPFIRE[1], 3.4, 0.45);
  mask.clearCircle(NOTICE.x, NOTICE.z, 1.3, 0.4);
  for (const s of [-1, 1]) mask.clearCircle(TERRACE.x + s * LAMPS.x, LAMPS.z, 0.5);
  for (const t of trees) mask.clearCircle(t.x, t.z, 0.9, 0.4);
  // the palisade's foot; the crypt's court, paved; the trodden path into the grove to its portal
  const line = palisadePolygon();
  mask.clearPath([...line, line[0]], 0.9);
  const court = (across: number, out: number): Spot => wayPoint('crypt', across, out);
  mask.clearPolygon([court(-GAP_HALF, -1), court(GAP_HALF, -1), court(GAP_HALF + 0.4, PODIUM.front + 0.3),
    court(TOMB.w / 2 + 1.2, PODIUM.front), court(TOMB.w / 2 + 1.2, TOMB.back + 1.2), court(-TOMB.w / 2 - 1.2, TOMB.back + 1.2),
    court(-TOMB.w / 2 - 1.2, PODIUM.front), court(-GAP_HALF - 0.4, PODIUM.front + 0.3)]);
  const forest = portalPlace('forest');
  const pathIn: Spot[] = [roadLines[1].line[roadLines[1].line.length - 1], wayPoint('forest', 0.4, 2.5), [forest.x, forest.z]];
  mask.clearPath(pathIn, 1.8, 0.35);
  mask.clearPath(pathIn, 0.9, 0.1);
  return mask;
}

/** A point of way `id`'s frame in the village's: `across` its way (m, to its right going out) and `out` from its gap. */
function wayPoint(id: BiomeId, across: number, out: number): Spot {
  const { gap, out: dir } = ENTRANCES[id];
  return [gap[0] + dir[0] * out - dir[1] * across, gap[1] + dir[1] * out + dir[0] * across];
}

/** The fountain in the middle of the square (world/fountain.ts). */
function buildSquare(scene: THREE.Object3D, M: Mats, obstacles: Obstacle[], updaters: Updater[]): FountainLight {
  return buildFountain(scene, { stone: M.freeAshlar, coping: M.freeCoping }, obstacles, updaters);
}

// --- the terrace, its stair, the hall of heroes ---------------------------------------------------------------------

/**
 * A wall facing a ledge, from the ground to `top` (m) along x0..x1 at z (or along z0..z1 at x: `alongZ`), its coping on
 * top: drawn, flown into, and kept off by bodies (its outline), so the only way onto what it faces is a stair.
 */
function ledgeWall(scene: THREE.Object3D, wall: Wall, M: Mats, a0: number, a1: number, at: number, top: number, alongZ = false): void {
  const len = a1 - a0, mid = (a0 + a1) / 2, t = PARAPET.thick;
  const body = alongZ ? block(scene, t, top, len, at, 0, mid, M.freeAshlar, 0.5) : block(scene, len, top, t, mid, 0, at, M.freeAshlar, 0.5);
  const cap = alongZ ? block(scene, t + 0.12, 0.12, len + 0.12, at, top, mid, M.freeCoping) : block(scene, len + 0.12, 0.12, t + 0.12, mid, top, at, M.freeCoping);
  cap.castShadow = true;
  wall.add(body, true, 'wall', true);
}

/** a tile of the terrace's flags and the hall's floor (m) */
const FLAGS_TILE = 2.25;

/** (x, z) of the world as the flags' uv: the terrace's and the hall's floor's alike, so stones run on from one to the
 *  other. Laid by the floor block's own top, its v ran the other way along z, and the stones mirrored in a seam across
 *  the door (from play, "we also need to connect textures better, to avoid connection lines on the ground"). */
const flagsAt = (x: number, z: number): [number, number] => [x / FLAGS_TILE, -z / FLAGS_TILE];

/** `mesh`'s top laid in the flags by the world's place (a mesh unturned). */
function pavedAsTheTerrace(mesh: THREE.Mesh): void {
  const { uv, position, normal } = mesh.geometry.attributes;
  for (let k = 0; k < uv.count; k++) {
    if (normal.getY(k) < 0.5) continue;
    uv.setXY(k, ...flagsAt(position.getX(k) + mesh.position.x, position.getZ(k) + mesh.position.z));
  }
}

/** The terrace: a stone platform the hall stands on, faced on every side by its walls, a broad stair up its middle. */
function buildTerrace(scene: THREE.Object3D, wall: Wall, levels: Levels, M: Mats): void {
  const { x: X, front, back, half, high, stairHalf, stairFoot } = TERRACE;
  const deep = front - back;
  block(scene, half * 2, high, deep, X, 0, (front + back) / 2, M.ashlar, 0.5).receiveShadow = true;
  // its paving but under the hall, whose floor lies in its plane: both there, with stones of their own, they flickered
  // (from play, "this floor is now flickering"; `lab village --only hallFloorSteady`)
  const inside = HALL.inHalf + 0.05;
  const paved = (x0: number, x1: number, z0: number, z1: number): void => {
    const top = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), M.flags);
    const { uv, position } = top.geometry.attributes;
    top.position.set((x0 + x1) / 2, high + 0.005, (z0 + z1) / 2);
    // (by the world's place, so its pieces' stones run on across their edges)
    for (let k = 0; k < uv.count; k++) {
      uv.setXY(k, ...flagsAt(position.getX(k) + top.position.x, position.getZ(k) + top.position.z));
    }
    top.receiveShadow = true;
    scene.add(top);
  };
  paved(X - half, X - inside, back, front);
  paved(X + inside, X + half, back, front);
  paved(X - inside, X + inside, HALL.door, front);
  levels.paint(X - half, back, X + half, front, () => high);
  // its walls: the front either side of the stair, the sides, the back (each stands a parapet over the terrace)
  const wallTop = high + PARAPET.over, t = PARAPET.thick / 2;
  ledgeWall(scene, wall, M, X - half, X - stairHalf - t, front + t, wallTop);
  ledgeWall(scene, wall, M, X + stairHalf + t, X + half, front + t, wallTop);
  for (const s of [-1, 1]) ledgeWall(scene, wall, M, back, front + PARAPET.thick, X + s * (half + t), wallTop, true);
  // (the back's either side of the hall, which runs on past it)
  ledgeWall(scene, wall, M, X - half - PARAPET.thick, X - HALL.half, back - t, wallTop);
  ledgeWall(scene, wall, M, X + HALL.half, X + half + PARAPET.thick, back - t, wallTop);
  // the stair: a step a rise, each a block of granite from its front back under the terrace's edge (paved as the
  // terrace is, "nobody would do interlock here")
  const steps = Math.round(high / STEP_RISE);
  for (let k = 1; k <= steps; k++) {
    const z0 = stairFoot - (k - 1) * STEP_RUN, d = z0 - front;
    block(scene, stairHalf * 2, k * STEP_RISE, d, X, 0, front + d / 2, M.granite);
  }
  levels.paint(X - stairHalf, front, X + stairHalf, stairFoot, (_x, z) => stepAt(stairFoot - z, high));
  // its cheeks: sloping walls either side, from the foot's knee to the parapet's top (convex: a body kept off them)
  for (const s of [-1, 1]) cheek(scene, wall, M, X + s * (stairHalf + t), stairFoot, front, 0.55, wallTop);
}

/** A stair's cheek wall at x, from its foot (z0, `low` m tall) to the ledge (z1, `high`): a sloping slab of stone. */
function cheek(scene: THREE.Object3D, wall: Wall, M: Mats, x: number, z0: number, z1: number, low: number, high: number): void {
  const s = new THREE.Shape();
  // (drawn in (z, y), then turned so its depth runs across x)
  s.moveTo(z0, 0); s.lineTo(z1, 0); s.lineTo(z1, high); s.lineTo(z0, low); s.lineTo(z0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: PARAPET.thick, bevelEnabled: false }).rotateY(-Math.PI / 2);
  g.translate(x + PARAPET.thick / 2, 0, 0);
  // (its uvs as a box's would be: the extrusion's are in shape units already, a metre a tile)
  const mesh = solid(scene, g, M.freeAshlar);
  wall.add(mesh, true, 'wall', true);
}

/** The hall of heroes on the terrace, a long hall its heroes are chosen in (the selection screen's room, world/heroHall.ts,
 *  shown in the village's place as its dais is used): a footing past the terrace's back, walls on every side with tall
 *  windows down the long ones, a stone-framed double door standing open in the front one under a portico of four
 *  columns with a torch either side of the door, two rows of columns down the inside to a dais at the far end where
 *  the other heroes stand, the two braziers behind them (the still shadows' lights), and a roof. */
function buildHall(scene: THREE.Object3D, wall: Wall, levels: Levels, M: Mats, obstacles: Obstacle[],
  updaters: Updater[]): { cutaway: THREE.Object3D[]; torches: THREE.Vector3[]; dais: THREE.Vector3[]; porch: THREE.Vector3[] } {
  const y0 = TERRACE.high, X = TERRACE.x, half = HALL.half, thick = HALL.half - HALL.inHalf;
  const eaves = HALL.wallHigh;
  const back = HALL.wall - thick, face = HALL.door, front = COLONNADE.z + 0.5;
  // its footing past the terrace's back, as high as the terrace, and its floor on it
  const past = TERRACE.back - back;
  block(scene, half * 2 + 0.6, y0, past + 0.3, X, 0, back - 0.3 + (past + 0.3) / 2, M.ashlar, 0.5).receiveShadow = true;
  // (its edges in the walls: on their inner faces, its sides fought them in a sawtooth along their feet)
  // (down its whole length to the door: stopped at the terrace's back, the terrace's paving met it across the room in a
  // straight seam, another stone in another light, a review)
  const floor = block(scene, HALL.inHalf * 2 + 0.1, 0.05, face - HALL.wall, X, y0 - 0.045, (face + HALL.wall) / 2, M.flags,
    1 / 2.25);
  floor.receiveShadow = true;
  pavedAsTheTerrace(floor);
  levels.paint(X - HALL.inHalf, HALL.wall, X + HALL.inHalf, TERRACE.back, () => y0);
  // the back and side walls, a plinth course along their feet outside, tall windows down the long ones (a group of their
  // own, thinned from above as the front wall is where they stand before him: the camera can turn to see over any)
  // (each wall a group of its own: it thins by itself, as it stands between the camera and him, `hallInside`)
  const walls = new THREE.Group();
  scene.add(walls);
  const sideWalls = [new THREE.Group(), new THREE.Group()];
  for (const side of sideWalls) scene.add(side);
  // (between the side walls, as the front wall's wings are: run to their outer faces, each shared a plane with them at the
  // corners, from play, "still flickering")
  wall.add(walling(walls, half * 2 - thick * 2, eaves, thick, X, y0, HALL.wall - thick / 2, M.ashlar), true, 'wall', true);
  for (const s of [-1, 1]) {
    const sideX = X + s * (half - thick / 2), sideLen = face - back;
    const sideWall = sideWalls[s < 0 ? 0 : 1];
    hallSideWall(sideWall, wall, M, sideX, s, thick, eaves, back, face);
    // (its plinth course in the wall too: drawn alone, the hero walked along the terrace into it, "can pass through
    // textures here")
    // (and whole, as the front's: too low to hide him, thinned with its wall it stood graded by the floor it hid and
    // greyed as the wall came back, from play, "this border should have no shading at all... its not hiding anything")
    wall.add(block(scene, 0.35, 0.45, sideLen, sideX + s * 0.47, y0, back + sideLen / 2, M.coping), true, 'wall', true);
    // (its top a little over the wall's course under it: at one height, the two flickered from above, "probably z fighting")
    for (const z of windowsAlong()) {
      block(sideWall, thick + 0.3, 0.1, WINDOWS.wide + 0.3, sideX, y0 + WINDOWS.sill - 0.1 + SILL_PROUD, z, M.coping);
    }
  }
  // the front wall either side of the door and over it, its plinth course, the door in its stone frame (a group of
  // their own: cut away with the roof over the hero inside, as from above they hid the room)
  const { doorHalf: dh, doorHigh: high } = HALL, wing = half - dh;
  const frontWall = new THREE.Group();
  scene.add(frontWall);
  for (const s of [-1, 1]) {
    const cx = X + s * (dh + wing / 2);
    const wingX = X + s * (dh + (wing - thick) / 2);
    wall.add(walling(frontWall, wing - thick, eaves, thick, wingX, y0, face - thick / 2, M.ashlar), true, 'wall', true);
    // (its plinth course whole: too low to hide him, and thinned it parted along its top in a dark line, a review)
    wall.add(block(scene, wing - DOOR.frame, 0.45, 0.35, cx + s * DOOR.frame / 2, y0, face + 0.17, M.coping), true, 'wall', true);
    // (a plinth block at the foot of the door's frame, prouder than the course, which ends against it: the course stood
    // 17 cm prouder than the frame and stopped 2 cm short of it, its end a grey wedge beside the chest, from play "also
    // broken near chest (grey triangle)"; a hair wider than the frame each way, so no face of it lies in one of the
    // frame's; whole as the course is: in the front wall's group the door's cone cut a wedge out of its top)
    const footX = X + s * (dh + DOOR.frame / 2 - 0.02);
    wall.add(block(scene, DOOR.frame + DOOR_FOOT.wider * 2, DOOR_FOOT.high, DOOR_FOOT.deep, footX, y0,
      face + DOOR_FOOT.deep / 2 - 0.02, M.coping), true, 'wall', true);
  }
  // (the lintel, the frame and the leaves are in the wall: stood in a leaf, he and the camera went through it)
  const inWall = frontWall.children.length;
  walling(frontWall, dh * 2, eaves - high, thick, X, y0 + high, face - thick / 2, M.ashlar);
  hallDoor(frontWall, M, X, y0, face);
  for (const part of frontWall.children.slice(inWall)) wall.add(part, false, 'wall', true);
  const ceiling = y0 + eaves - ROOF.ceiling - 0.32;
  const look = torchLook();
  // (what stands free in it, thinned further: a group of its own)
  const free = new THREE.Group();
  scene.add(free);
  // (their capitals with them: left whole, from over the roof one stood over him as a tall dark slab, from play, "why this
  // not becoming transparent ?")
  const capital = capitalStone(M.granite);
  const torches = hallColumns(free, capital, M, look, obstacles, ceiling);
  const dais = hallDais(scene, walls, levels, M, obstacles);
  const daisTop = y0 + HALL.daisHigh;
  for (const s of [-1, 1]) {
    const x = X + s * BRAZIERS.x;
    buildBrazier(scene, x, BRAZIERS.z, Math.PI / 2, M.iron, M.granite, updaters, daisTop, BRAZIERS.glow, BRAZIERS.flames,
      BRAZIERS.slabs);
    obstacles.push({ x, z: BRAZIERS.z, r: 0.75, h: daisTop + 1.8 });
  }
  // the torches either side of the door, on the front wall's face (cut away with it over the hero inside)
  const porch = [-1, 1].map((s) => wallTorch(frontWall, M, look, X + s * PORCH_TORCH.x, y0 + PORCH_TORCH.up, face, 0, 1, true,
    PORCH_TORCH.out));
  // the portico: a pair of columns either side, one entablature across the whole front
  for (const s of [-1, 1]) {
    for (const x of COLONNADE.x) {
      const cx = X + s * x, cz = COLONNADE.z;
      wall.add(block(free, 1.0, 0.4, 1.0, cx, y0, cz, M.granite), true, 'wall', true);
      const shaft = new THREE.CylinderGeometry(COLONNADE.radius * 0.88, COLONNADE.radius, COLONNADE.high, 18);
      solid(free, shaft, M.column).position.set(cx, y0 + 0.4 + COLONNADE.high / 2, cz);
      // (thinned with it: left whole, it stood solid over him from the square, the shaft under it a ghost, from play "why
      // this not becoming transparent ?")
      block(free, 0.95, 0.32, 0.95, cx, y0 + 0.4 + COLONNADE.high, cz, capital);
    }
  }
  const beam = new THREE.Group();
  scene.add(beam);
  block(beam, half * 2, COLONNADE.lintel, HALL.beamDeep, X, y0 + HALL.beamFoot, HALL.beamZ, M.coping);
  const roof = hallRoof(scene, M, y0 + eaves, back, front);
  fadesWhole(roof, 'hallRoof');
  fadesWhole(frontWall, 'hallFront');
  fadesWhole(walls, 'hallBack');
  fadesWhole(beam, 'hallBeam');
  fadesWhole(sideWalls[0], 'hallWest');
  fadesWhole(sideWalls[1], 'hallEast');
  fadesWhole(free, 'hallColumn');
  return { cutaway: [roof, frontWall], torches, dais, porch };
}

/** Whether a point of the world lies inside the hall of heroes as it stands: within its walls' feet and under its roof
 *  (from the ground up, its footing and the terrace under it too: the camera's line to him meets those no sooner). */
export function inHallsBulk(x: number, y: number, z: number): boolean {
  const out = Math.abs(x - TERRACE.x);
  const thick = HALL.half - HALL.inHalf;
  if (out > HALL.half + ROOF.over || z < HALL.wall - thick - ROOF.over || z > COLONNADE.z + 0.5 + ROOF.over) return false;
  const eaves = TERRACE.high + 0.72 + COLONNADE.high + COLONNADE.lintel;
  return y >= 0 && y <= eaves + ROOF.rise * Math.max(0, 1 - out / HALL.half);
}

/** The portico's columns as they stand, each a box from its plinth's foot to its capital's top: what of the hall
 *  stands free outside it, between the camera and him as he walks round the terrace (`porticoHidesHim` in
 *  game/village.ts). */
export const PORTICO_COLUMNS: readonly THREE.Box3[] = [-1, 1].flatMap((s) => COLONNADE.x.map((x) => {
  const cx = TERRACE.x + s * x, top = TERRACE.high + 0.4 + COLONNADE.high + 0.32;
  return new THREE.Box3(
    new THREE.Vector3(cx - 0.5, TERRACE.high, COLONNADE.z - 0.5), new THREE.Vector3(cx + 0.5, top, COLONNADE.z + 0.5),
  );
}));

/** The hall's windows' sills: each side's middle (x), their height's plane, how deep across the wall, and where along it. */
export function hallSills(): { x: number; y: number; deep: number; wide: number; z: number }[] {
  const thick = HALL.half - HALL.inHalf;
  const sides = [-1, 1].map((s) => TERRACE.x + s * (HALL.half - thick / 2));
  return sides.flatMap((x) => windowsAlong().map((z) => ({ x, y: TERRACE.high + WINDOWS.sill, deep: thick, wide: WINDOWS.wide, z })));
}

/** Where the windows stand down each long wall (z, from the back): between each pair of columns. */
function windowsAlong(): number[] {
  return HALL.columnZ.slice(1).map((z, k) => (HALL.columnZ[k] + z) / 2).sort((a, b) => a - b);
}

/** A long wall of the hall at `sideX` (`s` the side: -1 west, 1 east), from `back` to `face` (z), its windows open
 *  through it: a course under them, one over them and piers between, the panes in each opening casting nothing, so
 *  the sun and the moon light the hall through them (from play, "windows need to be real, and let sun/moonlight
 *  through": a pane's picture on a whole wall, they let none in). Each pane is leaded glass, lit from within by night
 *  outside and by the sky inside: clear, the hall would show the village through them, where it draws outside only
 *  what its doorway shows (`hallPortal.ts`). */
function hallSideWall(scene: THREE.Object3D, wall: Wall, M: Mats, sideX: number, s: number, thick: number, eaves: number,
  back: number, face: number): void {
  const y0 = TERRACE.high, { sill, high, wide } = WINDOWS, top = sill + high;
  const add = (len: number, h: number, y: number, z: number): void => {
    wall.add(walling(scene, thick, h, len, sideX, y, z, M.ashlar), true, 'wall', true);
  };
  add(face - back, sill, y0, (back + face) / 2);
  add(face - back, eaves - top, y0 + top, (back + face) / 2);
  const edges = [back, ...windowsAlong().flatMap((z) => [z - wide / 2, z + wide / 2]), face];
  for (let k = 0; k < edges.length; k += 2) add(edges[k + 1] - edges[k], high, y0 + sill, (edges[k] + edges[k + 1]) / 2);
  // (set back to the wall's middle, each side's reveal its own: at 8 cm in from each face, the panes read as pictures
  // on the wall, "the windows are still pictures painted on the wall")
  const pane = new THREE.BoxGeometry(0.04, high, wide);
  for (const z of windowsAlong()) {
    // (a limestone lining round the opening, the wall's depth shown by it: in the brick's own colour the reveals read
    // as none, "no reveal, jamb, depth or wall thickness")
    for (const side of [-1, 1]) block(scene, thick + 0.02, high, 0.08, sideX, y0 + sill, z + side * (wide / 2 - 0.04), M.coping);
    block(scene, thick + 0.02, 0.1, wide, sideX, y0 + top - 0.1, z, M.coping);
    for (const [material, off] of [[M.window, 1], [M.skyPane, -1]] as const) {
      const mesh = solid(scene, pane, material);
      mesh.position.set(sideX + s * off * 0.03, y0 + sill + high / 2, z);
      mesh.castShadow = false;
    }
  }
}

/** The hall's two rows of columns down its length, from the door to the dais (each a granite base, a stucco shaft up
 *  to the ceiling's beams, a granite capital), kept off by a circle each; and a torch on each, on its side to the
 *  aisle (an iron bracket, a flame in a cup: lit by the pool's lights as the hero walks past, game/village.ts
 *  `lightLamps`, the hall's own ten being spent outside). Returns where each torch's light is. */
function hallColumns(scene: THREE.Object3D, capital: THREE.Material, M: Mats, look: TorchLook, obstacles: Obstacle[],
  ceiling: number): THREE.Vector3[] {
  const y0 = TERRACE.high, torches: THREE.Vector3[] = [];
  const shaftHigh = ceiling - y0 - 0.35 - 0.3;
  const shaft = new THREE.CylinderGeometry(COLUMN_IN.radius * 0.9, COLUMN_IN.radius, shaftHigh, 18);
  for (const z of HALL.columnZ) {
    for (const s of [-1, 1]) {
      const x = TERRACE.x + s * HALL.columnX;
      block(scene, 0.82, 0.35, 0.82, x, y0, z, M.granite);
      solid(scene, shaft, M.column).position.set(x, y0 + 0.35 + shaftHigh / 2, z);
      block(scene, 0.78, 0.3, 0.78, x, ceiling - 0.3, z, capital);
      obstacles.push({ x, z, r: 0.5, h: ceiling });
      // the torch on its aisle side, at a man's reach and a half
      torches.push(wallTorch(scene, M, look, x - s * (COLUMN_IN.radius + 0.02), y0 + 2.7, z, -s, 0, false));
      // (held by an iron band round the shaft: a flat plate on it stood off its curve at one edge and cut into it at
      // the other)
      // (proud of the tapering shaft all round: level with it there, it showed as a dash from some sides, a review)
      const band = solid(scene, new THREE.CylinderGeometry(COLUMN_IN.radius * 1.01, COLUMN_IN.radius * 1.01, 0.1, 18),
        M.iron);
      band.position.set(x, y0 + 2.4, z);
      band.castShadow = false;
    }
  }
  return torches;
}

/** A torch's flame and what it's drawn in, shared by every torch. */
interface TorchLook {
  fire: THREE.Material; flame: THREE.BufferGeometry; glow: THREE.Material; halo: THREE.BufferGeometry;
  cup: THREE.BufferGeometry;
}

/** A flame's outline turned round its axis, `r` its widest and `h` its height: round at its foot, drawn in to a tip
 *  (`lean` puts its tip off its axis along x, as a draught bends it). */
function flameGeometry(r: number, h: number, lean: number): THREE.BufferGeometry {
  const outline: THREE.Vector2[] = [];
  for (let k = 0; k <= 12; k++) {
    const t = k / 12;
    // (a round foot to its widest a fifth up, then in to the tip by a curve)
    const wide = t < 0.2 ? Math.sin((t / 0.2) * Math.PI / 2) : Math.pow(1 - (t - 0.2) / 0.8, 1.6);
    outline.push(new THREE.Vector2(Math.max(r * wide, 0.0005), h * t));
  }
  const g = new THREE.LatheGeometry(outline, 10);
  const at = g.attributes.position;
  for (let i = 0; i < at.count; i++) at.setX(i, at.getX(i) + lean * (at.getY(i) / h) ** 2);
  g.computeVertexNormals();
  return g;
}

/** The torches' look: a flame of its own, a pointed tongue a hot core and a soft glow round it, smaller and dimmer than
 *  a lantern's glass (passed close, the glass's bloomed into a blob that hid the heroes behind it; the same kind of
 *  material, so the same program). Drawn as a lit egg, a review read each as "a solid light bulb". */
function torchLook(): TorchLook {
  return {
    fire: new THREE.MeshStandardMaterial({ color: 0x2a2014, roughness: 0.3, emissive: 0xffc070, emissiveIntensity: 1.1 }),
    flame: flameGeometry(0.035, 0.17, 0.012),
    glow: new THREE.MeshBasicMaterial({
      // (faint: at 0.35, over a torch's own lit wall the ring round it was 2.3% blown out, `lab village`'s lights)
      color: 0xff8a30, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false,
    }),
    halo: flameGeometry(0.06, 0.27, 0.025),
    cup: new THREE.CylinderGeometry(0.11, 0.06, 0.16, 10),
  };
}

/** What's under `group` drawn in materials of its own that thin as `kind` says (`fadeWhole`): the hall's cut away parts,
 *  as a material a hole round the hero alone has is the rest of the village's too. */
function fadesWhole(group: THREE.Object3D, kind: FadesWhole): void {
  const fading = new Map<THREE.Material, THREE.Material>();
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const was = mesh.material as THREE.Material;
    if (!fading.has(was)) fading.set(was, seeThrough(was.clone(), kind));
    mesh.material = fading.get(was)!;
  });
}

/** `granite` for a column's capital: drawn after its shaft and thinned as pale as it (`OVER_SHAFT` in
 *  core/seeThrough.ts), a material of its own, so merged apart from the bases. */
function capitalStone(granite: THREE.Material): THREE.Material {
  const stone = granite.clone();
  stone.userData[OVER_SHAFT] = true;
  return stone;
}

/** A torch on a wall's face at (x, z), `y` its bracket's top, standing out along (dx, dz) (a unit along x or z): an
 *  iron bracket, an arm out, a cup, its flame. Returns where its light is: out from it, as at its flame the wall
 *  beside it burned white. */
function wallTorch(scene: THREE.Object3D, M: Mats, look: TorchLook, x: number, y: number, z: number, dx: number,
  dz: number, plated = true, out = 1.1): THREE.Vector3 {
  const alongX = dx !== 0;
  const plate = plated ? block(scene, alongX ? 0.08 : 0.12, 0.5, alongX ? 0.12 : 0.08, x, y - 0.55, z, M.iron) : null;
  const arm = block(scene, alongX ? 0.3 : 0.06, 0.06, alongX ? 0.06 : 0.3, x + dx * 0.15, y - 0.3, z + dz * 0.15, M.iron);
  const cup = new THREE.Mesh(look.cup, M.iron);
  cup.position.set(x + dx * 0.32, y - 0.2, z + dz * 0.32);
  scene.add(cup);
  const flame = new THREE.Mesh(look.flame, look.fire);
  flame.position.set(x + dx * 0.32, y - 0.14, z + dz * 0.32);
  scene.add(flame);
  const halo = new THREE.Mesh(look.halo, look.glow);
  halo.position.set(x + dx * 0.32, y - 0.17, z + dz * 0.32);
  scene.add(halo);
  // (its own light is out from it: cast into the lamps' shadows, the bracket and cup threw a hole of shadow round the
  // torch on its own wall)
  for (const part of [plate, arm]) if (part) part.castShadow = false;
  return new THREE.Vector3(x + dx * out, y + 0.3, z + dz * out);
}

/** The dais across the hall's far end, a step up onto it, and on it a plinth for each hero (granite, a coping on its
 *  top), stood on (its top a level) and kept off (a circle round it: the hero walks between them, the others stand on
 *  them); behind each its class's banner on the back wall. Returns where the lights on the heroes hang. */
function hallDais(scene: THREE.Object3D, backWall: THREE.Object3D, levels: Levels, M: Mats, obstacles: Obstacle[]): THREE.Vector3[] {
  const y0 = TERRACE.high, X = TERRACE.x, inHalf = HALL.inHalf, top = y0 + HALL.daisHigh;
  const deep = HALL.daisZ - HALL.wall, step = STEP_RUN, rise = HALL.daisHigh / 2;
  block(scene, inHalf * 2, rise, step, X, y0, HALL.daisZ - step / 2, M.granite);
  block(scene, inHalf * 2, HALL.daisHigh, deep - step, X, y0, HALL.wall + (deep - step) / 2, M.granite);
  block(scene, inHalf * 2, 0.06, 0.12, X, top - 0.06, HALL.daisZ - step + 0.06, M.coping);
  levels.paint(X - inHalf, HALL.daisZ - step, X + inHalf, HALL.daisZ, () => y0 + rise);
  levels.paint(X - inHalf, HALL.wall, X + inHalf, HALL.daisZ - step, () => top);
  const { plinthHalf: half, plinthHigh: high, plinthZ: z } = HALL;
  for (const dx of HALL.plinths) {
    const x = X + dx;
    block(scene, half * 2, high - 0.06, half * 2, x, top, z, M.granite);
    block(scene, half * 2 + 0.08, 0.06, half * 2 + 0.08, x, top + high - 0.06, z, M.coping);
    levels.paint(x - half, z - half, x + half, z + half, () => top + high);
    obstacles.push({ x, z, r: half * 1.2, h: top + high });
  }
  // behind each plinth its class's banner on the back wall, on an iron rod, as the selection screen's room hangs them
  // (a standard material: the room's velvet is a physical one, a program the village would compile for three banners)
  const rng = mulberry(404);
  for (const [i, dx] of HALL.plinths.entries()) {
    const x = X + dx, bannerTop = top + HALL_BANNER.top, bz = HALL.wall + HALL_BANNER.off;
    const cloth = bannerCloth(256, 512, CLASSES[CLASS_IDS[i]].hall.banner);
    const velvet = seeThrough(new THREE.MeshStandardMaterial({ map: cloth, roughness: 0.85, side: THREE.DoubleSide }), 'prop');
    const s = HALL_BANNER.scale;
    // (on the back wall's kind: left whole as the wall thinned, they hung in the air, a review)
    solid(backWall, bannerGeo(rng).rotateY(Math.PI).scale(s, s, s), velvet).position.set(x, bannerTop, bz);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9 * s + 0.3, 8).rotateZ(Math.PI / 2), M.iron);
    rod.position.set(x, bannerTop + 0.03, bz);
    backWall.add(rod);
  }
  // (the heroes lit from before and above, between them: seen from the door, lit by the torches alone they stood dark)
  return [-1, 1].map((s) => new THREE.Vector3(X + s * HALL.plinths[2] / 2, top + DAIS_LIGHT.up, z + DAIS_LIGHT.ahead));
}

/** The hall's door in the front wall's face at `face` (z): a frame of dressed stone round it, a lintel stone over it,
 *  and its two leaves of planks set back in it, iron-strapped, an iron ring on each. */
function hallDoor(scene: THREE.Object3D, M: Mats, X: number, y0: number, face: number): void {
  const { doorHalf: dh, doorHigh: high } = HALL, f = DOOR.frame;
  for (const s of [-1, 1]) block(scene, f, high, 0.2, X + s * (dh + f / 2 - 0.02), y0, face + 0.08, M.coping);
  block(scene, dh * 2 + f * 2 + 0.2, f, 0.24, X, y0 + high, face + 0.1, M.coping);
  // (each leaf hung on its side of the frame and swung in, open: the hall is walked into)
  for (const s of [-1, 1]) {
    const leaf = new THREE.Group();
    leaf.position.set(X + s * dh, y0, face - DOOR.set);
    leaf.rotation.y = -s * DOOR.open;
    scene.add(leaf);
    const lx = -s * dh / 2;
    block(leaf, dh - 0.03, high - 0.02, 0.12, lx, 0, 0, M.planks, 0.5);
    for (const y of DOOR.straps) block(leaf, dh - 0.12, 0.09, 0.03, lx, y, 0.07, M.iron);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 6, 16), M.iron);
    ring.position.set(-s * (dh - 0.22), 1.3, 0.1);
    leaf.add(ring);
  }
}

/** The hall's ceiling and roof over its walls, from `back` to `front` (z), its eaves at `eaves` (m): a planked
 *  ceiling on beams across, a gabled slate roof whose ridge runs from front to back, a gable over each end. */
function hallRoof(scene: THREE.Object3D, M: Mats, eaves: number, back: number, front: number): THREE.Object3D {
  const X = TERRACE.x, half = HALL.half, deep = front - back, mid = (front + back) / 2;
  const roof = new THREE.Group();
  scene.add(roof);
  // (short of the portico's beam's and the gables' faces, which it shared a plane with: as the view moved, a stripe of it
  // showed through them, from play, "still flickering")
  // (and under their tops: at the beam's own height, the two tops fought from above as the view moved, seen through the
  // roof's ghost, from play, "this surface still flickers")
  block(roof, half * 2, ROOF.ceiling, deep - ROOF.ceilingShort * 2, X, eaves - ROOF.ceiling - ROOF.ceilingDown, mid, M.planks);
  for (let z = back + ROOF.beamGap; z < front - 0.5; z += ROOF.beamGap) {
    block(roof, half * 2 - 0.2, 0.32, 0.36, X, eaves - ROOF.ceiling - 0.32, z, M.timber);
  }
  // the two slopes, each a slab from the ridge out past the wall's top by the overhang
  const slope = Math.atan2(ROOF.rise, half), run = Math.hypot(half, ROOF.rise) + ROOF.over;
  const length = deep + ROOF.over * 2;
  for (const s of [-1, 1]) {
    const slab = block(roof, run, ROOF.thick, length, 0, 0, mid, M.roof, 1 / 2.4);
    // (its top's middle half a run down from the ridge, along the slope; lifted by half its thickness off it)
    const down = run / 2;
    slab.position.x = X + s * (Math.cos(slope) * down + Math.sin(slope) * ROOF.thick / 2);
    slab.position.y = eaves + ROOF.rise - Math.sin(slope) * down + Math.cos(slope) * ROOF.thick / 2;
    slab.rotation.z = -s * slope;
  }
  block(roof, 0.4, 0.3, length, X, eaves + ROOF.rise + 0.02, mid, M.coping);
  // the gables: a triangle of stone over each end's top, from eave to eave and up to the ridge
  const gable = new THREE.Shape();
  gable.moveTo(-half, 0);
  gable.lineTo(half, 0);
  gable.lineTo(0, ROOF.rise);
  gable.lineTo(-half, 0);
  const geometry = new THREE.ExtrudeGeometry(gable, { depth: ROOF.gable, bevelEnabled: false });
  for (const z of [front - ROOF.gable, back]) solid(roof, geometry, M.ashlar).position.set(X, eaves, z);
  return roof;
}

/** What the open chest shows, as full as the stash is: coins strewn over its floor, a heap of gold under them once
 *  there are enough, gems, then pearls, then a goblet; none of it in an empty stash. All of it stands under the lid's
 *  drum as it shuts. Spread over `w` by `d`, the box's rim at `h`; its `userData.show` sets how full it is and how far
 *  the lid stands open. */
function chestHoard(chest: THREE.Object3D, M: Mats, w: number, d: number, h: number): void {
  const g = new THREE.Group();
  g.name = 'chest-hoard';
  chest.add(g);
  // (the heap and all that lies on it, raised from the floor as it fills)
  const heaped = new THREE.Group();
  g.add(heaped);
  const add = (geo: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number,
    into: THREE.Object3D = heaped): THREE.Mesh => {
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    into.add(mesh);
    return mesh;
  };
  // the heap: corner to corner at the rim's height, rising lumpily over it (the same lumps for what lies on it)
  const across = w / 2, deep = d / 2, base = h - 0.09, rise = 0.3, rng = mulberry(79);
  const lump = (u: number, v: number): number => 1 + 0.3 * Math.sin(11 * u + 1) * Math.cos(9 * v) + 0.18 * Math.sin(21 * v + 7 * u);
  const heapAt = (x: number, z: number): number => {
    const u = x / across, v = z / deep;
    // (down to its foot inside the box at every side: flat to the rim, its edge stood over the wood as a slab's, seen from
    // aside: "stash from side looks a little lame"; rising at once from it, at 0.6, coins dropped from above lay thin on its
    // steep front, bare between them seen from before it)
    return base + rise * lump(u, v) * (Math.max(0, 1 - u * u) * Math.max(0, 1 - v * v)) ** 0.9;
  };
  const heap = new THREE.PlaneGeometry(w - 0.02, d - 0.02, 36, 22).rotateX(-Math.PI / 2);
  const at = heap.attributes.position;
  for (let k = 0; k < at.count; k++) at.setY(k, heapAt(at.getX(k), at.getZ(k)));
  heap.computeVertexNormals();
  const heapMesh = add(heap, M.gold, 0, 0, 0);
  // the coins lying every way over it, thick enough that the heap reads as coins, of four designs and sizes, most gold
  // of its own shade, some tarnished, a few silver
  const coins: THREE.BufferGeometry[] = [];
  const bed = new CoinBed(w, d, heapAt);
  const coinOf = ({ x, y, z, turn }: LaidCoin, radius: number): void => {
    const metal = rng();
    const tint = metal < 0.08 ? SILVER : metal < 0.26 ? TARNISHED : GOLDEN;
    const shade = 0.82 + rng() * 0.3;
    const colour = new THREE.Color(tint[0] * shade, tint[1] * shade, tint[2] * shade);
    coins.push(coinGeometry(Math.floor(rng() * 4), radius, COIN_THICK, colour)
      .applyQuaternion(turn).translate(x, y, z));
  };
  for (let k = 0; k < COINS; k++) {
    // (each dropped on what's under it: the lowest of a few spots, out to the lining, its edge lost in the box's thick walls;
    // placed anyhow they cut through each other and hung in the air, the heap's skin bare between them, a review)
    let x = 0, z = 0, least = Infinity;
    for (let tries = 0; tries < COIN_TRIES; tries++) {
      const tryX = (rng() * 2 - 1) * across * 0.97, tryZ = (rng() * 2 - 1) * deep * 0.95;
      const over = bed.topAt(tryX, tryZ) - heapAt(tryX, tryZ);
      if (over < least) [x, z, least] = [tryX, tryZ, over];
    }
    const radius = 0.03 + rng() * 0.012;
    coinOf(bed.lay(x, z, radius, COIN_THICK, rng() * TAU, false), radius);
  }
  // little stacks of them, as they were counted out, a little askew (a full chest's: last in the draw range)
  for (const [x, z, tall] of COIN_STACKS) {
    for (let k = 0; k < tall; k++) {
      const askew = 0.006 * (rng() - 0.5);
      coinOf(bed.lay(x + askew, z + askew, 0.032, COIN_THICK, rng() * TAU, true), 0.032);
    }
  }
  const coinCount = coins.length;
  const coinsMesh = add(mergeGeometries(coins)!, M.coin, 0, 0, 0);
  const perCoin = coinsMesh.geometry.index!.count / coinCount;
  for (const c of coins) c.dispose();
  // the gems half sunk in it, each cut as a gem is (`gemGeometry`), round and long, large and small
  const stones = GEM_TINTS.map((tint, k) => gemGeometry(85 + k, tint));
  const gemsAt: [number, number, number][] = [[-0.3, 0.1, 0.85], [-0.01, -0.17, 0.7], [0.1, 0.17, 0.8], [0.34, -0.05, 0.75],
    [-0.03, 0.08, 0.85], [-0.17, 0.17, 0.7], [0.27, -0.13, 0.95], [-0.38, -0.13, 0.7], [0.42, 0.14, 0.8], [-0.02, 0.2, 0.6]];
  const gems = gemsAt.map(([x, z, size], k) => {
    const gem = add(gemGeometry(90 + k, GEM_TINTS[k % GEM_TINTS.length], k % 3 === 1 ? 1.35 : 1), M.gem, x, 0, z, g);
    // (tables up, or near: turned anyhow most showed their pavilions, a fan of long facets)
    gem.rotation.set(0.45 * Math.sin(k * 2.1), k * 1.3, 0.45 * Math.cos(k * 1.7));
    return { gem, skin: heapAt(x, z), y: bed.topOver(x, z, 0.025) - 0.006, from: (k + 1) / (gemsAt.length + 1), size };
  });
  // a string of pearls over the heap
  const pearls: THREE.BufferGeometry[] = [];
  let pearlsOverSkin = 0;
  for (let k = 0; k < 34; k++) {
    // (before the crown, not over it: on the coins' top under it, it hung in an arc across the crown)
    const t = k / 33, x = -0.14 + 0.36 * t, z = 0.13 + 0.05 * Math.sin(t * Math.PI * 2.4);
    const pearlY = bed.topOver(x, z, 0.012) + 0.009;
    pearlsOverSkin += (pearlY - heapAt(x, z)) / 34;
    pearls.push(new THREE.SphereGeometry(0.012, 10, 8).translate(x, pearlY, z));
  }
  const pearlsMesh = add(mergeGeometries(pearls)!, M.pearl, 0, 0, 0);
  for (const p of pearls) p.dispose();
  // the goblet stood in the heap at one end, leaning, a ring of stones round its cup
  const gobletAt: [number, number] = [-0.16, -0.05];
  const gobletSkin = heapAt(gobletAt[0], gobletAt[1]), gobletY = bed.topOver(gobletAt[0], gobletAt[1], 0.03) - 0.006;
  const goblet = add(gobletGeometry(), M.gilt, gobletAt[0], gobletY, gobletAt[1], g);
  // (leaning toward the chest's front: stood up, from above it was a plain bowl, its chasing out of sight)
  goblet.rotation.set(0.32, 0, 0.26);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU;
    const stone = new THREE.Mesh(stones[k % stones.length], M.gem);
    // (set low: at their full depth, they stood out from the cup like pegs)
    stone.position.set(Math.sin(a) * 0.049, 0.125, Math.cos(a) * 0.049);
    stone.rotation.set(Math.PI / 2, a, 0, 'YXZ');
    stone.scale.set(0.26, 0.12, 0.26);
    goblet.add(stone);
  }
  // a crown lying tipped on the heap, a stone in its band over each point
  const crown = crownGeometry();
  const crownAt: [number, number] = [0.13, -0.03];
  const crownMesh = add(crown.band, M.gilt, crownAt[0], 0, crownAt[1], g);
  // (tipped to the chest's front: level, from above it was a hoop, its points and stones edge on)
  crownMesh.rotation.set(0.42, 0.35, -0.16);
  for (let k = 0; k < crownPoints(); k++) {
    const a = crownPointAngle(k);
    const stone = new THREE.Mesh(stones[k % stones.length], M.gem);
    stone.position.set(Math.sin(a) * (crown.size.r + 0.003), crown.size.band * 0.55, Math.cos(a) * (crown.size.r + 0.003));
    stone.rotation.set(Math.PI / 2, a, 0, 'YXZ');
    stone.scale.set(0.34, 0.16, 0.34);
    crownMesh.add(stone);
  }
  const crownSkin = heapAt(crownAt[0], crownAt[1]), crownY = bed.topOver(crownAt[0], crownAt[1], crown.size.r) - 0.002;
  // gold bars, two with one across them, sunk a little at the other end
  const bar = barGeometry(), barsSkin = heapAt(0.305, 0.155), barsY = bed.topOver(0.305, 0.155, 0.07) + 0.008;
  const bars = [[0.3, 0.19, 0, 0.3], [0.31, 0.12, 0, 0.42], [0.305, 0.155, 0.03, 1.8]].map(([x, z, up, turn]) => {
    const mesh = add(bar, M.gilt, x, 0, z, g);
    mesh.rotation.y = turn;
    return { mesh, up };
  });
  const raised = (y: number, full: number): number => CHEST_FLOOR + (y - CHEST_FLOOR) * full;
  g.userData.show = (full: number, open: number): void => {
    g.scale.setScalar(full > 0 ? 1 : NOTHING);
    // (settled under the shut lid only as far as it would stand through the wood: its goblet and top coins stood out)
    const top = raised(HOARD_TOP, full);
    const shut = Math.min(1, (UNDER_LID - CHEST_FLOOR) / (top - CHEST_FLOOR));
    const settled = shut + (1 - shut) * open;
    if (full > 0) g.scale.y = settled;
    g.position.y = full > 0 ? CHEST_FLOOR * (1 - settled) : 0;
    const level = Math.max(NOTHING, full);
    heaped.scale.y = level;
    heaped.position.y = CHEST_FLOOR * (1 - level);
    // (a few coins lie on the bare floor: the heap's skin comes up from under it as they cover it)
    const risen = THREE.MathUtils.smoothstep(full, 0.25, 0.5);
    // (well under the floor until then: its lumps came through the coins in torn islands at 10 items of 60, a review)
    heapMesh.position.y = -(1 - risen) * 0.3 / level;
    // (fewer than the share: flat on the floor they cover far more of it than heaped, and by the share 10 items of 60
    // carpeted it as 30 did, a review)
    // (none under the shut lid, where they can't be seen: their triangles were drawn from across the village)
    const coinsShown = open > 0 ? Math.max(COINS_LEAST, Math.ceil(coinCount * full ** COINS_BY)) : 0;
    coinsMesh.geometry.setDrawRange(0, coinsShown * perCoin);
    // (each thing on the coins as far up as the coins yet shown come: at the height of a full chest's top, with fewer shown
    // the gems hung in the air over the heap)
    const coinsUp = coinsShown / coinCount;
    const onCoins = (skin: number, top: number): number => raised(skin + (top - skin) * coinsUp, full);
    pearlsMesh.scale.setScalar(full >= 0.5 ? 1 : NOTHING);
    pearlsMesh.position.y = -pearlsOverSkin * (1 - coinsUp);
    for (const { gem, skin, y, from, size } of gems) {
      gem.position.y = onCoins(skin, y);
      gem.scale.setScalar(full >= from ? size : NOTHING);
    }
    goblet.position.y = onCoins(gobletSkin, gobletY);
    goblet.scale.setScalar(full >= 0.7 ? 1.5 : NOTHING);
    crownMesh.position.y = onCoins(crownSkin, crownY);
    crownMesh.scale.setScalar(full >= 0.85 ? 1.3 : NOTHING);
    for (const { mesh, up } of bars) {
      mesh.position.y = onCoins(barsSkin, barsY) + up;
      mesh.scale.setScalar(full >= 0.6 ? 1 : NOTHING);
    }
  };
}

/** The stash's chest right of the hall's door: an iron-bound box, its lid hinged at the back (returned, to swing). */
function buildChest(scene: THREE.Object3D, M: Mats, obstacles: Obstacle[]): THREE.Object3D {
  const g = new THREE.Group();
  g.position.set(CHEST.x, TERRACE.high, CHEST.z);
  g.rotation.y = CHEST.facing;
  const w = 1.15, d = 0.7, h = 0.55, side = 0.05, strap = 0.42, tile = 0.84;
  // (a board's grain along the box's faces: the tile's v along its length)
  const laid = (mesh: THREE.Mesh): THREE.Mesh => {
    const uv = mesh.geometry.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getY(k), uv.getX(k));
    return mesh;
  };
  // the box: four walls of boards round a floor, lined up to the rim, a skirt round its foot and a rail round its top
  laid(block(g, w, h, side, 0, 0, d / 2 - side / 2, M.chestWood, tile));
  laid(block(g, w, h, side, 0, 0, -d / 2 + side / 2, M.chestWood, tile));
  for (const s of [-1, 1]) laid(block(g, side, h, d - side * 2, s * (w - side) / 2, 0, 0, M.chestWood, tile));
  block(g, w - side * 2, 0.04, d - side * 2, 0, 0.02, 0, M.lining, QUILT);
  for (const s of [-1, 1]) {
    block(g, w - side * 2, h - 0.04, 0.01, 0, 0.04, s * (d / 2 - side - 0.005), M.lining, QUILT).castShadow = false;
    block(g, 0.01, h - 0.04, d - side * 2, s * (w / 2 - side - 0.005), 0.04, 0, M.lining, QUILT).castShadow = false;
    block(g, w + 0.03, 0.05, 0.016, 0, 0, s * (d / 2 + 0.008), M.timber).castShadow = false;
    block(g, 0.016, 0.05, d + 0.03, s * (w / 2 + 0.008), 0, 0, M.timber).castShadow = false;
    block(g, w + 0.02, 0.025, 0.012, 0, h - 0.025, s * (d / 2 + 0.006), M.timber).castShadow = false;
    block(g, 0.012, 0.025, d + 0.02, s * (w / 2 + 0.006), h - 0.025, 0, M.timber).castShadow = false;
  }
  // its iron: straps up the faces, a plate on each corner, a ring handle at each end, each riveted
  const rivets: THREE.BufferGeometry[] = [];
  const rivet = (x: number, y: number, z: number): void => {
    rivets.push(new THREE.SphereGeometry(0.015, 8, 5).translate(x, y, z));
  };
  for (const x of [-strap, strap]) {
    for (const s of [-1, 1]) {
      block(g, 0.075, h + 0.01, 0.012, x, 0, s * (d / 2 + 0.018), M.chestIron);
      for (const y of [0.1, 0.27, 0.44]) rivet(x, y, s * (d / 2 + 0.024));
    }
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const cx = sx * (w / 2 + 0.018), cz = sz * (d / 2 + 0.018);
      block(g, 0.008, 0.16, 0.09, cx, 0.05, sz * (d / 2 - 0.02), M.chestIron).castShadow = false;
      block(g, 0.09, 0.16, 0.008, sx * (w / 2 - 0.02), 0.05, cz, M.chestIron).castShadow = false;
      rivet(cx + sx * 0.006, 0.17, sz * (d / 2 - 0.03));
      rivet(sx * (w / 2 - 0.03), 0.17, cz + sz * 0.006);
    }
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.009, 6, 14).rotateY(Math.PI / 2), M.chestIron);
    handle.position.set(sx * (w / 2 + 0.032), 0.31, 0);
    g.add(handle);
    block(g, 0.01, 0.07, 0.07, sx * (w / 2 + 0.02), 0.335, 0, M.chestIron).castShadow = false;
    rivet(sx * (w / 2 + 0.027), 0.385, 0);
  }
  // its lock: a brass plate on the front, riveted, the keyhole in it
  const plate = new THREE.Mesh(plateGeometry(0.16, 0.2, 0.03), M.lockBrass);
  // (under the box's rim: up to it, the rim's edge showed through the plate's top)
  plate.position.set(0, h - 0.115, d / 2 + 0.012);
  g.add(plate);
  const keyhole = new THREE.Mesh(keyholeGeometry(), M.iron);
  keyhole.position.set(0, h - 0.105, d / 2 + 0.0275);
  g.add(keyhole);
  for (const x of [-0.06, 0.06]) for (const y of [h - 0.17, h - 0.03]) rivets.push(new THREE.SphereGeometry(0.009, 6, 4).translate(x, y, d / 2 + 0.03));
  chestHoard(g, M, w - side * 2, d - side * 2, h);
  const hinge = new THREE.Group();
  hinge.name = 'chest-lid';
  hinge.position.set(0, h, -d / 2);
  g.add(hinge);
  // the lid: its half drum of staves, its back edge on the hinge, lined inside (seen from within), a rim round its face
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(d / 2, d / 2, w, 24, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), M.chestWood);
  lid.position.set(0, 0, d / 2);
  lid.castShadow = true;
  hinge.add(lid);
  const lining = new THREE.Mesh(
    new THREE.CylinderGeometry(d / 2 - side, d / 2 - side, w - side * 2, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2),
    M.liningInside);
  lining.position.set(0, 0, d / 2);
  hinge.add(lining);
  for (const z of [side / 2, d - side / 2]) block(hinge, w, 0.012, side, 0, 0, z, M.timber).castShadow = false;
  for (const s of [-1, 1]) block(hinge, side, 0.012, d, s * (w - side) / 2, 0, d / 2, M.timber).castShadow = false;
  const lidRivets: THREE.BufferGeometry[] = [];
  for (const x of [-strap, strap]) {
    // (open ended: its end caps stood across the lid's hollow, black wedges in the lining)
    const band = new THREE.Mesh(new THREE.CylinderGeometry(d / 2 + 0.014, d / 2 + 0.014, 0.075, 24, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), M.chestIron);
    band.position.set(x, 0, d / 2);
    hinge.add(band);
    for (const a of [0.45, 1.05, Math.PI / 2 + 0.52, Math.PI - 0.45]) {
      lidRivets.push(new THREE.SphereGeometry(0.015, 8, 5).translate(x, Math.sin(a) * (d / 2 + 0.016), d / 2 + Math.cos(a) * (d / 2 + 0.016)));
    }
    // (the hinge's iron, over the box's back)
    block(g, 0.09, 0.09, 0.02, x, h - 0.06, -d / 2 - 0.03, M.chestIron).castShadow = false;
  }
  // the hasp on the lid's front edge, down over the lock as it shuts
  const hasp = new THREE.Mesh(plateGeometry(0.05, 0.075, 0.012), M.lockBrass);
  hasp.position.set(0, -0.03, d + 0.03);
  hinge.add(hasp);
  // the lining's brass studs, rows across the inside of the lid (flat cloth alone read as a box's flap)
  const studs: THREE.BufferGeometry[] = [];
  for (const a of [0.5, 1.05, 1.6, 2.15, 2.65]) {
    for (let k = -4; k <= 4; k++) {
      const r = d / 2 - side - 0.004;
      studs.push(new THREE.SphereGeometry(0.006, 6, 4).translate(k * 0.115, Math.sin(a) * r, d / 2 + Math.cos(a) * r));
    }
  }
  hinge.add(new THREE.Mesh(mergeGeometries(studs)!, M.brass));
  for (const s of studs) s.dispose();
  g.add(new THREE.Mesh(mergeGeometries(rivets)!, M.chestIron));
  hinge.add(new THREE.Mesh(mergeGeometries(lidRivets)!, M.chestIron));
  for (const r of [...rivets, ...lidRivets]) r.dispose();
  g.traverse((o) => { o.userData.noBake = true; });
  scene.add(g);
  obstacles.push({ x: CHEST.x, z: CHEST.z, r: 0.7, h: h + 0.35 });
  return hinge;
}

/** The candle's flame and its light, over the lectern's candle (the part of it that moves: lit as the hero comes). */
function candleFlame(scene: THREE.Object3D, look: TorchLook, lights: THREE.PointLight[]): THREE.Group {
  const { x, z, facing } = CHRONICLE, turn = facing + Math.PI / 2;
  const group = new THREE.Group();
  // (as the lectern's group turns its holder: at its 0.068, 0.394 off the post)
  group.position.set(x + 0.068 * Math.cos(turn) + 0.394 * Math.sin(turn), TERRACE.high + 1.283, z - 0.068 * Math.sin(turn) + 0.394 * Math.cos(turn));
  // (a see-through orange tongue round a pale core, on a wick: one colour, darker than the wax it wasn't what's lit,
  // brighter it was "a glowing cone", a review; the same programs as a torch's flame and its glow)
  const fireOf = (colour: number, lit: number): THREE.MeshStandardMaterial => {
    const fire = look.fire.clone() as THREE.MeshStandardMaterial;
    fire.emissive.setHex(colour);
    fire.emissiveIntensity = lit;
    return fire;
  };
  const tongue = look.glow.clone() as THREE.MeshBasicMaterial;
  tongue.color.setHex(CANDLE.flame);
  tongue.opacity = CANDLE.flameShows;
  const flame = new THREE.Mesh(flameGeometry(0.015, 0.07, 0.004), tongue);
  flame.name = 'candle-flame';
  group.add(flame);
  // (what lights up is its fire: a light of 2.2 a hand's breadth over the wax burned the whole candle white, from play
  // "candle should light up, meaning the fire on it, not whole candle"; just over it, the wax falls off from the top)
  const light = new THREE.PointLight(CANDLE.color, CANDLE.intensity, CANDLE.distance, 2);
  light.position.y = CANDLE.over;
  group.add(light);
  const core = new THREE.Mesh(flameGeometry(0.008, 0.038, 0.002), fireOf(CANDLE.core, CANDLE.coreLit));
  core.position.y = 0.006;
  group.add(core);
  const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.014, 5), fireOf(0, 0));
  wick.position.y = 0.002;
  group.add(wick);
  scene.add(group);
  lights.push(light);
  return group;
}

/** The chronicle's lectern left of the hall's door, across it from the chest: a post on a foot, its slanted desk,
 *  the book open on it, a candle (its light, one of the village's). */
function buildLectern(scene: THREE.Object3D, M: Mats, obstacles: Obstacle[]): void {
  const { x, z, facing } = CHRONICLE, high = TERRACE.high;
  // (laid out facing -x, turned to its facing)
  const lectern = new THREE.Group();
  lectern.position.set(x, high, z);
  lectern.rotation.y = facing + Math.PI / 2;
  block(lectern, 0.5, 0.08, 0.5, 0, 0, 0, M.freeTimber);
  block(lectern, 0.12, 1.0, 0.12, 0, 0.08, 0, M.freeTimber);
  // the desk sloping down to the reader, a lip along its low edge, the book open on it: its binding, two blocks of pages
  // falling away from the gutter
  const desk = new THREE.Group();
  desk.position.y = 1.08;
  desk.rotation.z = 0.35;
  lectern.add(desk);
  block(desk, 0.46, 0.04, 0.62, 0, 0, 0, M.freePlanks);
  block(desk, 0.03, 0.05, 0.62, -0.23, 0.04, 0, M.freeTimber);
  block(desk, 0.3, 0.012, 0.46, 0.01, 0.04, 0, M.binding);
  block(desk, 0.012, 0.004, 0.015, -0.158, 0.05, 0.03, M.binding);
  for (const s of [-1, 1]) {
    // (under the sheet everywhere: its top over the sheet's low edges stood out of them as pale strips down the gutter)
    block(desk, 0.28, 0.014, 0.2, 0.01, 0.05, s * 0.104, M.pagesEdge).castShadow = false;
    // (the page itself: a sheet rising out of the gutter and falling away to its edge)
    const sheet = new THREE.PlaneGeometry(0.28, 0.215, 1, 10).rotateX(-Math.PI / 2);
    const at = sheet.attributes.position;
    for (let k = 0; k < at.count; k++) {
      const t = Math.abs(at.getZ(k) + 0.1075) / 0.215, out = s > 0 ? t : 1 - t;
      // (held at 0: an edge's `1 - t` a hair under it took a NaN from the power, and bloom smears a NaN across the frame)
      at.setY(k, 0.066 + 0.018 * Math.max(0, Math.sin(Math.min(1, Math.max(0, out) * 1.15) * Math.PI)) ** 0.7);
    }
    sheet.computeVertexNormals();
    const page = new THREE.Mesh(sheet, s > 0 ? M.pagesRight : M.pagesLeft);
    page.position.set(0.01, 0, s * 0.1075);
    desk.add(page);
  }
  // a ribbon marking the place, hanging out over the lip
  block(desk, 0.12, 0.002, 0.004, -0.07, 0.067, 0.001, M.ribbon).castShadow = false;
  // the candle's holder, on an iron arm off the desk's side, clear of the book: a round dish, its lip, the wax run down
  const armAt = { x: 0.06, y: 1.165, z: 0.4 };
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.08, 6).rotateX(Math.PI / 2), M.iron);
  arm.position.set(armAt.x, armAt.y - 0.012, armAt.z - 0.05);
  lectern.add(arm);
  // (bolted to the desk's side by a plate, its finger's ring on the far side of the dish)
  block(lectern, 0.05, 0.04, 0.008, armAt.x, armAt.y - 0.03, 0.31, M.iron).castShadow = false;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.017, 0.0035, 6, 14).rotateY(Math.PI / 2), M.freeBrass);
  ring.position.set(armAt.x, armAt.y + 0.002, armAt.z + 0.078);
  lectern.add(ring);
  const dish = new THREE.Mesh(new THREE.LatheGeometry([[0.001, 0], [0.05, 0], [0.066, 0.016], [0.06, 0.018], [0.046, 0.006], [0.001, 0.006]]
    .map(([r, y]) => new THREE.Vector2(r, y)), 28), M.freeBrass);
  dish.position.set(armAt.x, armAt.y - 0.012, armAt.z);
  lectern.add(dish);
  const stick = new THREE.Group();
  stick.position.set(armAt.x + 0.008, armAt.y - 0.006, armAt.z - 0.006);
  stick.rotation.set(0.05, 0, -0.04);
  lectern.add(stick);
  // the wax: pooled in the dish, a taper melted hollow at its top, runs down it each ending in a bead
  const wax = new THREE.Mesh(new THREE.LatheGeometry([[0.048, 0.001], [0.03, 0.006], [0.022, 0.016], [0.02, 0.05], [0.0195, 0.104],
    [0.021, 0.116], [0.017, 0.122], [0.012, 0.117], [0.001, 0.114]].map(([r, y]) => new THREE.Vector2(r, y)), 16), M.wax);
  stick.add(wax);
  for (const [a, top, long] of [[0.6, 0.118, 0.05], [1.9, 0.118, 0.085], [3.1, 0.116, 0.03], [4.3, 0.118, 0.066], [5.4, 0.116, 0.1]] as const) {
    const run = new THREE.Mesh(new THREE.CapsuleGeometry(0.0028, long, 3, 6), M.wax);
    run.position.set(Math.cos(a) * 0.0205, top - long / 2, Math.sin(a) * 0.0205);
    stick.add(run);
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.0048, 6, 5), M.wax);
    bead.position.set(Math.cos(a) * 0.0215, top - long, Math.sin(a) * 0.0215);
    stick.add(bead);
  }
  const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0016, 0.016, 4), M.iron);
  wick.position.set(0.001, 0.122, 0);
  wick.rotation.z = -0.28;
  stick.add(wick);
  scene.add(lectern);
  obstacles.push({ x, z, r: 0.45, h: high + 1.1 });
}

// --- the palisade, the cottages ------------------------------------------------------------------------

/** the squares the palisade's logs are culled by (m) */
const PALISADE_CELL = 8;

/** The palisade along its winding line: sharpened logs side by side, open at each way out's gap (the wall: walked up
 *  to and flown into). */
function buildPalisade(scene: THREE.Object3D, wall: Wall, M: Mats, rng: () => number): void {
  const n = Math.ceil(palisadeCurve.getLength() / (PALISADE.radius * 2.05));
  const spots: [THREE.Vector3, number, number][] = [];
  for (const p of palisadeCurve.getSpacedPoints(n).slice(0, n)) {
    if (fromGap(p.x, p.z) < GAP_HALF) continue;
    spots.push([p, PALISADE.low + rng() * (PALISADE.high - PALISADE.low), rng()]);
  }
  const shaft = new THREE.CylinderGeometry(PALISADE.radius, PALISADE.radius * 1.08, 1, 7).translate(0, 0.5, 0);
  const tip = new THREE.ConeGeometry(PALISADE.radius, 0.55, 7).translate(0, 0.275, 0);
  const logs = new THREE.InstancedMesh(shaft, M.palisadeLogs, spots.length);
  const tips = new THREE.InstancedMesh(tip, M.palisadeTips, spots.length);
  logs.name = tips.name = FENCE;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), at = new THREE.Vector3();
  for (const [i, [p, h, k]] of spots.entries()) {
    e.set((k - 0.5) * 0.04, k * TAU, (k - 0.5) * 0.05);
    q.setFromEuler(e);
    m.compose(at.set(p.x, 0, p.z), q, s.set(1, h, 1));
    logs.setMatrixAt(i, m);
    m.compose(at.set(p.x, h, p.z), q, s.set(1, 1, 1));
    tips.setMatrixAt(i, m);
  }
  wall.add(logs, false);
  for (const mesh of [logs, tips]) {
    mesh.castShadow = mesh.receiveShadow = true;
    // (a ring round the village: by its middle, the village's, it drew before the cottages past it)
    sortByNearest(mesh);
    // (and three culls an instanced mesh whole, by the sphere round the ring: from above on the square all 44k of its
    // triangles were drawn outside the view, a quarter of Very low's frame; the wall has its own copy by now)
    scene.add(...cullInCells(mesh, gridCell(PALISADE_CELL)));
  }
}

/** A cottage where `c` says, its door the way it faces, `size` its scale: a stone footing, lime walls
 *  framed in dark timber, a door and shuttered windows (lit by night), a slate roof and its chimney. Its walls are a
 *  part of the wall a body is kept off; its roof is flown into. */
function buildCottage(scene: THREE.Object3D, wall: Wall, M: Mats, c: Cottage, rng: () => number): void {
  const g = new THREE.Group();
  g.position.set(c.x, 0, c.z);
  g.rotation.y = c.facing;
  g.scale.setScalar(c.size);
  const { w, d, h, rise, eave } = COTTAGE;
  block(g, w + 0.2, 0.5, d + 0.2, 0, 0, 0, M.ashlar);
  const body = block(g, w, h - 0.5, d, 0, 0.5, 0, M.plaster, 1);
  // the frame: posts at the corners and between, a sill and a plate along each face
  for (const sx of [-1, -0.33, 0.33, 1]) for (const sz of [-1, 1]) block(g, 0.18, h - 0.51, 0.06, sx * (w / 2 - 0.09), 0.5, sz * (d / 2 + 0.02), M.timber);
  // (a sill and a plate stand a hair proud of the posts they cross: in one plane, the two fought where they crossed)
  for (const sz of [-1, 1]) for (const y of [0.5, h - 0.18]) block(g, w + 0.04, 0.16, 0.08, 0, y, sz * (d / 2 + 0.02), M.timber);
  // (each end framed as the faces are, plaster between: one sheet of timber, its whole wall stood black, from play)
  for (const sx of [-1, 1]) {
    const endX = sx * (w / 2 + 0.02);
    for (const z of [-(d / 2 - 0.09), 0, d / 2 - 0.09]) block(g, 0.06, h - 0.51, 0.18, endX, 0.5, z, M.timber);
    for (const y of [0.5, h - 0.18]) block(g, 0.08, 0.16, d, endX, y, 0, M.timber);
  }
  // the door and two windows on its face (+z, as it's turned), lit within by night: each its panes set in a timber
  // casing, a sill under it
  block(g, 1.0, 1.9, 0.08, 0, 0.5, d / 2 + 0.04, M.planks);
  for (const sx of [-1, 1]) {
    const wx = sx * (w / 2 - 1.2), face = d / 2 + 0.05;
    // (its own uvs: the panes' picture once across its face)
    solid(g, new THREE.BoxGeometry(0.8, 0.7, 0.04), M.window).position.set(wx, 1.7, face);
    for (const ex of [-1, 1]) block(g, 0.08, 0.85, 0.1, wx + ex * 0.44, 1.27, face + 0.02, M.timber);
    // (its head proud of the sides it sits over, for the same reason)
    block(g, 0.96, 0.08, 0.12, wx, 2.05, face + 0.02, M.timber);
    // (under the panes: a hand lower, the plaster showed between them and the sill)
    block(g, 1.04, 0.07, 0.2, wx, 1.29, face + 0.06, M.timber);
    for (const k of [-1, 1]) {
      // (hung by its edge on the casing and swung out from the wall: turned about its middle, one edge of each stood
      // through the plaster and the other off it, "house topology errors")
      const hinge = new THREE.Group();
      hinge.position.set(wx + k * 0.48, 1.37, d / 2 + 0.09);
      hinge.rotation.y = -k * (0.3 + rng() * 0.6);
      g.add(hinge);
      block(hinge, 0.42, 0.74, 0.05, k * 0.21, 0, 0.025, M.planks);
    }
  }
  // the roof: two slopes of slate over the gables, and the gables' triangles of plaster
  const slope = Math.hypot(d / 2 + eave, rise), pitch = Math.atan2(rise, d / 2 + eave);
  const roofParts: THREE.Mesh[] = [];
  for (const sz of [-1, 1]) {
    // (one a hair wider: their ends, in one plane, fought where the slopes overlap at the ridge)
    const slab = block(g, w + eave * 2 + (sz > 0 ? 0.02 : 0), 0.14, slope, 0, 0, 0, M.roof);
    slab.position.set(0, h + rise / 2, sz * (d / 2 + eave) / 2);
    slab.rotation.x = sz * pitch;
    roofParts.push(slab);
  }
  const gable = new THREE.Shape();
  gable.moveTo(-d / 2, 0); gable.lineTo(d / 2, 0); gable.lineTo(0, rise); gable.lineTo(-d / 2, 0);
  for (const sx of [-1, 1]) {
    const tri = new THREE.ExtrudeGeometry(gable, { depth: 0.1, bevelEnabled: false }).rotateY(Math.PI / 2);
    solid(g, tri, M.gable).position.set(sx * (w / 2) - 0.05, h, 0);
  }
  const chimney = block(g, 0.6, rise + 1.2, 0.6, w / 2 - 0.9, h - 0.2, -d / 4, M.chimney);
  g.userData.chimney = chimney;
  scene.add(g);
  g.updateMatrixWorld(true);
  chimneys.push(new THREE.Vector3(w / 2 - 0.9, h + rise + 1.1, -d / 4).applyMatrix4(g.matrixWorld));
  wall.add(body, true, 'wall', true);
  for (const part of [...roofParts, chimney]) wall.add(part, true, 'beyond');
}

/** where each cottage's chimney smokes (`chimneySmoke`) */
const chimneys: THREE.Vector3[] = [];
/** A thin smoke from every chimney, drifting off with the wind. */
/**
 * Motes drawn into each portal's vortex from round its rim and the air before it, in its colours: the gate's sheet
 * alone read as a flat picture in a frame (a review: "the portal reads as a flat rectangle"). The glow pool's own
 * program: nothing compiles.
 */
function portalMotes(): Updater {
  const ways = BIOME_IDS.map((id) => {
    const p = portalPlace(id);
    // (toward the village from the gate's face, and across it)
    const out = new THREE.Vector3(Math.sin(p.facing), 0, Math.cos(p.facing));
    const across = new THREE.Vector3(out.z, 0, -out.x);
    const middle = new THREE.Vector3(p.x, MOTES.high, p.z);
    return { middle, out, across, colors: MOTE_COLORS[id] };
  });
  const from = new THREE.Vector3();
  let due = 0;
  return (dt) => {
    due += dt * MOTES.rate * ways.length;
    for (; due >= 1; due--) {
      const way = ways[Math.floor(Math.random() * ways.length)];
      const a = rand(0, TAU), r = rand(MOTES.rim, MOTES.rim + 0.9), ahead = rand(0.2, MOTES.ahead);
      from.copy(way.middle).addScaledVector(way.across, Math.cos(a) * r * 0.75)
        .addScaledVector(way.out, ahead);
      from.y += Math.sin(a) * r;
      const life = rand(1.4, 2.2);
      // (to the vortex's heart over its life, slowing as it nears: drag)
      const vx = (way.middle.x - from.x) / life * 1.6, vy = (way.middle.y - from.y) / life * 1.6;
      const vz = (way.middle.z - from.z) / life * 1.6;
      particles.glow.spawn({
        x: from.x, y: from.y, z: from.z, vx, vy, vz, life, drag: 1.1,
        size: rand(0.14, 0.26), sizeEnd: 0.03, color: way.colors.rim, colorEnd: way.colors.core, alpha: 0.9,
      });
    }
  };
}

function chimneySmoke(): Updater {
  let due = 0;
  return (dt) => {
    due += dt * chimneys.length * 1.6;
    for (; due >= 1; due--) {
      const at = chimneys[Math.floor(Math.random() * chimneys.length)];
      particles.smoke.spawn({
        x: at.x, y: at.y, z: at.z, vx: rand(0.1, 0.35), vy: rand(0.5, 0.8), vz: rand(-0.1, 0.1),
        life: rand(3, 5), size: rand(0.5, 0.8), sizeEnd: 2.4, color: col(0x6a6460), alpha: 0.16,
      });
    }
  };
}

// --- the yard, the campfire's benches, the notice board, the lamps -------------------------------------------------

/** The training yard: a fence of posts and rails round a field of trodden grass, a gate on its north side between two
 *  taller posts (from play, a fire on each read as "floating campfires"; their lights stay, of no strength). */
function buildYard(parent: THREE.Object3D, wall: Wall, M: Mats): void {
  // (laid out in its own frame: its gate side at -z, turned as the plan has it)
  const scene = new THREE.Group();
  scene.position.set(YARD.x, 0, YARD.z);
  scene.rotation.y = YARD.turn;
  parent.add(scene);
  scene.updateMatrixWorld(true);
  const { halfX, halfZ, gate } = YARD, x = 0, z = 0;
  // (its floor the meadow trodden thin: `meadowMask`)
  // each side of the fence: posts along it and two rails, the rails the part a body is kept off
  // (a corner's post once: each side stood its own there, the two in one place, flickering)
  const posted = new Set<string>();
  const side = (x0: number, z0: number, x1: number, z1: number): void => {
    const len = Math.hypot(x1 - x0, z1 - z0), turn = Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2;
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    const n = Math.max(2, Math.round(len / 1.6));
    for (let k = 0; k <= n; k++) {
      const t = k / n, px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t, place = `${px.toFixed(2)},${pz.toFixed(2)}`;
      if (posted.has(place)) continue;
      posted.add(place);
      block(scene, 0.16, 1.25, 0.16, px, 0, pz, M.timber, 0.4);
    }
    for (const y of [0.45, 0.95]) block(scene, len, 0.1, 0.08, mx, y, mz, M.planks, 0.4, turn);
    // (one slab the rails' height for bodies to be kept off: the rails as drawn have a man's gap under them)
    const keep = block(scene, len, 1.1, 0.12, mx, 0, mz, M.planks, 0.4, turn);
    keep.visible = false;
    wall.add(keep, false, 'wall', true);
  };
  const n0 = z - halfZ, n1 = z + halfZ, w0 = x - halfX, w1 = x + halfX;
  const { gateAt } = YARD;
  side(w0, n0, gateAt - gate, n0);
  side(gateAt + gate, n0, w1, n0);
  side(w1, n0, w1, n1);
  side(w1, n1, w0, n1);
  side(w0, n1, w0, n0);
  for (const s of [-1, 1]) {
    const px = gateAt + s * gate;
    block(scene, 0.26, YARD_GATE.up, 0.26, px, 0, n0, M.timber);
    const light = new THREE.PointLight(YARD_GATE.color, 0, YARD_GATE.distance, 2);
    light.position.set(px, YARD_GATE.up, n0);
    scene.add(light);
  }
  // a rack of practice weapons against the fence's south side, and straw bales
  for (let k = 0; k < 3; k++) {
    const bale = block(scene, 1.1, 0.55, 0.6, x + halfX - 1.0, 0, n1 - 0.6 - k * 0.7, M.yardFloor, 0.5, 0.1 * k);
    bale.castShadow = true;
  }
}

/** The walls that stop his sight: each cottage's four, and the hall's, open at its door (its windows are too high to see
 *  a floor through, from outside or in). */
/** how far inside the hall's outer faces what's shut to him starts (m): past the walls' thickness */
const SEALED_INSIDE = 0.7;
/** how far out from the hall's door he looks in through it (m): as far as the dais's heroes stand for him */
const HALL_DOOR_SEEN = 12;

function sightOfThePlace(): { walls: SightWall[]; hall: THREE.Vector4; roofs: SightRoof[]; doors: SightDoor[] } {
  const walls: SightWall[] = [];
  const roofs: SightRoof[] = [];
  const around = (corners: [number, number][]): void => {
    corners.forEach(([x0, z0], i) => {
      const [x1, z1] = corners[(i + 1) % corners.length];
      walls.push({ x0, z0, x1, z1 });
    });
  };
  for (const c of COTTAGES) {
    const halfW = (COTTAGE.w / 2) * c.size;
    const halfD = (COTTAGE.d / 2) * c.size;
    const cos = Math.cos(c.facing);
    const sin = Math.sin(c.facing);
    // (as the group's turn about y turns them)
    const turned = (x: number, z: number): [number, number] => [c.x + x * cos + z * sin, c.z - x * sin + z * cos];
    around([turned(-halfW, -halfD), turned(halfW, -halfD), turned(halfW, halfD), turned(-halfW, halfD)]);
    roofs.push({ x: c.x, z: c.z, halfW, halfD, cos, sin });
  }
  const west = TERRACE.x - HALL.half;
  const east = TERRACE.x + HALL.half;
  const doorW = TERRACE.x - HALL.doorHalf;
  const doorE = TERRACE.x + HALL.doorHalf;
  walls.push({ x0: west, z0: HALL.wall, x1: east, z1: HALL.wall });
  walls.push({ x0: west, z0: HALL.wall, x1: west, z1: HALL.door });
  walls.push({ x0: east, z0: HALL.wall, x1: east, z1: HALL.door });
  walls.push({ x0: west, z0: HALL.door, x1: doorW, z1: HALL.door });
  walls.push({ x0: doorE, z0: HALL.door, x1: east, z1: HALL.door });
  // (what's shut to him starts inside the walls: at their faces, a face read itself in or out of it by its depth's last
  // bits, wedges of black over the front wall he stood before, moving as he moved, from play, "here we dont need to see
  // through the wall, because I'm in front of the wall", "this is still flickering")
  const inside = new THREE.Vector4(west + SEALED_INSIDE, HALL.wall + SEALED_INSIDE, east - SEALED_INSIDE, HALL.door - SEALED_INSIDE);
  // (the room the hall's walls thin for: its floor, out to under the portico's beam)
  hallRoomIs(new THREE.Vector4(inside.x, inside.y, inside.z, COLONNADE.z + 1), new THREE.Vector4(
    TERRACE.x - HALL.doorHalf, HALL.inFront, TERRACE.x + HALL.doorHalf, HALL.inFront,
  ));
  // (its door, the room seen through it as from the doorway: core/sight.ts's `seeThroughDoor`)
  const doors: SightDoor[] = [{ x: TERRACE.x, z: HALL.door, nx: 0, nz: -1, half: HALL.doorHalf, reach: HALL_DOOR_SEEN }];
  return { walls, hall: inside, roofs, doors };
}

/** Logs to sit on round the campfire. */
function buildBenches(scene: THREE.Object3D, M: Mats, obstacles: Obstacle[]): void {
  const [cx, cz] = CAMPFIRE;
  for (const a of [0.4, 2.3, 4.2]) {
    const x = cx + Math.cos(a) * 2.2, z = cz + Math.sin(a) * 2.2;
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 1.7, 10).rotateZ(Math.PI / 2), M.logs);
    log.position.set(x, 0.22, z);
    log.rotation.y = -a + Math.PI / 2;
    log.castShadow = log.receiveShadow = true;
    scene.add(log);
    for (const k of [-0.5, 0, 0.5]) obstacles.push({ x: x + Math.cos(a + Math.PI / 2) * k, z: z + Math.sin(a + Math.PI / 2) * k, r: 0.3, h: 0.44 });
  }
}

/** The notice board: two posts, a board under a little roof, notices pinned to it. */
function buildNoticeBoard(scene: THREE.Object3D, wall: Wall, M: Mats): void {
  const g = new THREE.Group();
  g.position.set(NOTICE.x, 0, NOTICE.z);
  g.rotation.y = NOTICE.facing;
  for (const s of [-1, 1]) block(g, 0.16, 2.6, 0.16, s * 0.9, 0, 0, M.freeTimber);
  const board = block(g, 1.9, 1.1, 0.08, 0, 1.0, 0, M.freePlanks, 0.4);
  const roof = block(g, 2.3, 0.08, 0.7, 0, 2.55, 0.05, M.boardRoof);
  roof.rotation.x = 0.35;
  for (const [x, y, w, h, tilt] of [[-0.5, 1.6, 0.5, 0.6, 0.05], [0.15, 1.5, 0.45, 0.55, -0.08], [0.6, 1.75, 0.4, 0.4, 0.1], [-0.1, 1.15, 0.5, 0.35, 0]]) {
    const note = new THREE.Mesh(new THREE.PlaneGeometry(w, h), M.paper);
    note.position.set(x, y, 0.05);
    note.rotation.z = tilt;
    g.add(note);
  }
  scene.add(g);
  board.name = STANDS_FREE;
  wall.add(board, false, 'wall', true);
}

/** A lamp post at (x, z) by the stair: where its lantern is lit (lit by the lit shaders' lamps, as a street lamp),
 *  and a point light there of no strength, one of the village's 10 (a count every lit program is made for). */
function buildLamp(scene: THREE.Object3D, x: number, z: number, M: Mats,
  obstacles: Obstacle[]): { light: THREE.PointLight; lantern: THREE.Vector3 } {
  const lantern = lampPost(scene, x, z, x < 0 ? 0 : Math.PI, M, obstacles);
  const light = new THREE.PointLight(LAMPS.color, 0, 1, 2);
  light.position.copy(lantern);
  scene.add(light);
  return { light, lantern };
}

/** The point lights under `scene` that cast shadows. */
function castingLights(scene: THREE.Object3D): THREE.PointLight[] {
  const found: THREE.PointLight[] = [];
  scene.traverse((o) => { if ((o as THREE.PointLight).isPointLight && o.castShadow) found.push(o as THREE.PointLight); });
  return found;
}

/** A lamp post at (x, z), its lantern hung on an arm toward `turn` (rad about y: 0 toward +x); returns where its
 *  light is lit: out past the lantern's middle, away from the post (lit from the lantern's middle, 0.4 m off it, the
 *  post's shaft shone as a neon tube once the light was bright enough to light the ground, a review). */
/** A street lamp's parts, made once and shared by every lamp: its cast-iron column turned on a lathe (a flared foot,
 *  collars, a knob on top), its bracket scrolled out from the post, and its lantern, six panes of lit glass in an
 *  iron frame under a crown and its finial, a cup under it (from play: "can we have fancier streetlights ?"; a
 *  timber post, a bar and a cone over a glowing tube before). The lantern hangs from the bracket's end at `LANTERN`. */
const LANTERN = { out: 0.52, y: -0.16, top: 0.15, bottom: 0.11, high: 0.3 };
let lampParts: { column: THREE.BufferGeometry; bracket: THREE.BufferGeometry; frame: THREE.BufferGeometry;
  cup: THREE.BufferGeometry; panes: THREE.BufferGeometry } | null = null;

function lampGeometries(): NonNullable<typeof lampParts> {
  if (lampParts) return lampParts;
  const H = LAMPS.high;
  // (radius at each height, from the plinth's top up)
  const profile: [number, number][] = [
    [0.001, 0.3], [0.12, 0.3], [0.12, 0.36], [0.095, 0.4], [0.07, 0.52], [0.058, 0.68], [0.075, 0.71], [0.075, 0.76],
    [0.05, 0.8], [0.046, H - 0.3], [0.062, H - 0.27], [0.062, H - 0.22], [0.044, H - 0.19], [0.04, H + 0.02],
    [0.06, H + 0.06], [0.05, H + 0.13], [0.001, H + 0.16],
  ];
  const column = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 10);
  const arm = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.03, H - 0.02, 0), new THREE.Vector3(0.22, H + 0.06, 0), new THREE.Vector3(0.42, H + 0.08, 0),
    new THREE.Vector3(LANTERN.out, H + 0.02, 0), new THREE.Vector3(LANTERN.out, H - 0.04, 0),
  ]);
  // (the scroll under the arm: out from the post, up and curled into itself under the arm's middle)
  const scroll = new THREE.CatmullRomCurve3(Array.from({ length: 14 }, (_, k) => {
    const t = k / 13;
    const a = Math.PI * 1.1 + t * Math.PI * 2.2, r = 0.13 * (1 - t * 0.7);
    return new THREE.Vector3(0.2 + Math.cos(a) * r * (1 - t) + t * 0.06, H - 0.12 + Math.sin(a) * r, 0);
  }));
  const brace = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.03, H - 0.42, 0), new THREE.Vector3(0.12, H - 0.3, 0), new THREE.Vector3(0.2, H - 0.25, 0),
  ]);
  const bracket = mergeGeometries([
    new THREE.TubeGeometry(arm, 20, 0.022, 6), new THREE.TubeGeometry(scroll, 28, 0.014, 5),
    new THREE.TubeGeometry(brace, 8, 0.016, 5),
  ].map((g) => g.toNonIndexed()));
  const { out, y, top, bottom, high } = LANTERN;
  const at = (g: THREE.BufferGeometry, gx: number, gy: number, gz: number): THREE.BufferGeometry => g.translate(gx, gy, gz);
  const ly = H + y;
  const pieces: THREE.BufferGeometry[] = [
    // (the crown, its finial and the ring it hangs by; the rims round the glass's top and foot; the cup under it)
    at(new THREE.ConeGeometry(top + 0.06, 0.13, 6), out, ly + high / 2 + 0.065, 0),
    at(new THREE.CylinderGeometry(top + 0.065, top + 0.065, 0.03, 6), out, ly + high / 2, 0),
    at(new THREE.SphereGeometry(0.03, 6, 4), out, ly + high / 2 + 0.16, 0),
    at(new THREE.TorusGeometry(0.025, 0.007, 4, 8), out, ly + high / 2 + 0.2, 0),
    at(new THREE.CylinderGeometry(bottom + 0.02, bottom + 0.02, 0.025, 6), out, ly - high / 2, 0),
  ];
  // (casting nothing: the lamp's light burns inside the glass, and the cup under it threw a dark disc 3 m across)
  const cup = stripUVs(at(new THREE.ConeGeometry(bottom, 0.1, 6).rotateX(Math.PI), out, ly - high / 2 - 0.06, 0));
  // (an iron bar up each corner of the glass, leaning out with it)
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU;
    const lean = Math.atan2(top - bottom, high);
    const r = (top + bottom) / 2 + 0.004;
    const bar = new THREE.BoxGeometry(0.014, high, 0.014).rotateZ(-lean).rotateY(-a);
    pieces.push(at(bar, out + Math.cos(a) * r, ly, Math.sin(a) * r));
  }
  const frame = mergeGeometries(pieces.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => {
    g.deleteAttribute('uv');
    return g;
  }));
  const panes = at(new THREE.CylinderGeometry(top, bottom, high, 6, 1, true), out, ly, 0);
  lampParts = { column, bracket: stripUVs(bracket), frame, cup, panes };
  return lampParts;
}

/** `g` with its uvs left out (merged with parts that have none). */
function stripUVs(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.deleteAttribute('uv');
  return g;
}

function lampPost(scene: THREE.Object3D, x: number, z: number, turn: number, M: Mats, obstacles: Obstacle[]): THREE.Vector3 {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = -turn;
  scene.add(g);
  // (a stepped stone plinth)
  block(g, 0.42, 0.16, 0.42, 0, 0, 0, M.footAshlar);
  block(g, 0.32, 0.14, 0.32, 0, 0.16, 0, M.footAshlar);
  const parts = lampGeometries();
  // (unlit as the frame is: a hand's breadth from its own light, the post's and the bracket's edges burned in a white
  // streak seen from under it, "this light is blinding")
  const pieces = [[parts.column, M.lanternIron], [parts.bracket, M.lanternIron], [parts.frame, M.lanternIron], [parts.cup, M.lanternIron],
    [parts.panes, M.lantern]] as const;
  for (const [geo, m] of pieces) {
    const mesh = new THREE.Mesh(geo, m);
    mesh.castShadow = geo !== parts.panes && geo !== parts.cup;
    mesh.receiveShadow = true;
    g.add(mesh);
  }
  obstacles.push({ x, z, r: 0.35, h: LAMPS.high });
  g.updateMatrixWorld(true);
  // (its light at the middle of its glass: 0.25 m out from it, it lit the iron and the glass from a hand's breadth)
  return g.localToWorld(new THREE.Vector3(LANTERN.out, LAMPS.high + LANTERN.y, 0));
}


/** a pool of lamplight shown whole */
const WHITE = new THREE.Color(1, 1, 1);

/**
 * The street lamps along the roads, a post every `STREET.every` m on alternate sides, each its lantern over the road
 * (from play: "its dark so we need lights in the village"), and their lanterns, where the lit shaders' lamps light
 * (`core/lamps.ts`, game/village.ts `lightLamps`).
 */
function buildStreetLamps(scene: THREE.Object3D, M: Mats, obstacles: Obstacle[]): THREE.Vector3[] {
  const spots: { x: number; z: number; turn: number }[] = [];
  // (the stair's lamps, hung by `buildLamp` with their lights, are lamps too)
  const lamps: Spot[] = [-1, 1].map((s) => [TERRACE.x + s * LAMPS.x, LAMPS.z]);
  const clear = (x: number, z: number): boolean => !builtAt(x, z) && insidePalisade(x, z, 1)
    && obstacles.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + STREET.clear)
    && lamps.every(([lx, lz]) => Math.hypot(lx - x, lz - z) > STREET.apart);
  const place = (x: number, z: number, turn: number): void => {
    if (!clear(x, z)) return;
    spots.push({ x, z, turn });
    lamps.push([x, z]);
  };
  for (const { line, width } of roadLines) {
    if (line.length < 2) continue;
    let along = STREET.first, side = 1, walked = 0;
    for (let k = 1; k < line.length; k++) {
      const [x0, z0] = line[k - 1], [x1, z1] = line[k];
      const len = Math.hypot(x1 - x0, z1 - z0);
      while (along <= walked + len) {
        const t = (along - walked) / len, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
        // (out to the road's side, across its way: the arm turned back over it)
        const nx = -(z1 - z0) / len * side, nz = (x1 - x0) / len * side, off = width / 2 + STREET.off;
        const px = x + nx * off, pz = z + nz * off;
        place(px, pz, Math.atan2(-nz, -nx));
        along += STREET.every;
        side = -side;
      }
      walked += len;
    }
  }
  // (round the square, its lanterns hung over its cobbles, where no road leaves it)
  for (let k = 0; k < STREET.square; k++) {
    const a = (k + 0.5) / STREET.square * TAU, r = SQUARE_R + 1.3;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    place(x, z, a + Math.PI);
  }
  return spots.map((spot) => lampPost(scene, spot.x, spot.z, spot.turn, M, obstacles));
}

// --- the trees ------------------------------------------------------------------------------------------------------

/** A tree's place: where, its kind (`TREE_KINDS`), its height (m), how it's turned and its crown's colour. */
interface TreeSpot { x: number; z: number; kind: number; height: number; turn: number; colour: THREE.Color }

/** the kinds the village grows (the forest's first three: grown once for both, `growTree`) */
const VILLAGE_KINDS = [0, 1, 2];
/** The leaf cards kept and how much wider each (the owner's choice, of the grass or the leaves, for a steady 144 frames
 *  a second): layer on layer of them shaded a pixel over and over, about 3.4 ms of the GPU's frame. Thinned most in the
 *  wood, seen over the palisade from afar. */
const LEAVES_NEAR = { keep: 0.7, grow: 1.15 };
const LEAVES_FAR = { keep: 0.5, grow: 1.35 };

/** Where the trees stand: groves in the village wherever nothing's built (`GROVES`), the Thornwood's grove round its way
 *  out, and the wood round the palisade, clear of the ways out. */
function treeSpots(rng: () => number): TreeSpot[] {
  const r = (a: number, b: number): number => a + rng() * (b - a);
  // spring greens, a little apart tree to tree
  const crown = (): THREE.Color => new THREE.Color().setRGB(r(0.13, 0.22), r(0.3, 0.42), r(0.06, 0.12)).multiplyScalar(2.1);
  const spots: TreeSpot[] = [];
  const clear = (x: number, z: number, apart: number): boolean => spots.every((s) => Math.hypot(s.x - x, s.z - z) >= apart);
  const add = (x: number, z: number, height: number): void => {
    spots.push({ x, z, kind: Math.floor(r(0, VILLAGE_KINDS.length)), height, turn: r(0, TAU), colour: crown() });
  };
  for (const [cx, cz, n] of GROVES) {
    for (let placed = 0, tries = 0; placed < n && tries < 40; tries++) {
      const a = r(0, TAU), d = placed === 0 ? r(0, 1) : r(1.5, 3.4);
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (builtAt(x, z, 1.2) || !insidePalisade(x, z, 1.4) || !clear(x, z, 3.2)) continue;
      add(x, z, r(6.5, 9.5));
      placed++;
    }
  }
  for (const [x, z] of groveTrees()) add(x, z, r(9, 13));
  const line = palisadeCurve.getSpacedPoints(400);
  for (let tries = 0, n = 0; n < WOOD.n && tries < WOOD.n * 40; tries++) {
    const p = line[Math.floor(r(0, line.length))], len = Math.hypot(p.x, p.z);
    const past = WOOD.near + Math.pow(r(0, 1), 1.3) * (WOOD.far - WOOD.near);
    const x = p.x * (1 + past / len), z = p.z * (1 + past / len);
    // (a way out's own ground and its sight out kept open, and no two trunks within 3.5 m)
    if (insidePalisade(x, z) || inWay(x, z, 2.5) || fromGap(x, z) < 8 || !clear(x, z, 3.5)) continue;
    add(x, z, Math.min(WOOD.high, WOOD.low + past * 0.5) * r(0.85, 1.15));
    n++;
  }
  return spots;
}

/** The trees, a pair of instanced meshes a kind (bark, leaves), each culled tree by tree; each in the village is an
 *  obstacle round its trunk's foot, and every trunk is met by what flies. */
function buildTrees(scene: THREE.Object3D, wall: Wall, obstacles: Obstacle[], spots: readonly TreeSpot[]): void {
  const kinds: TreeKind[] = VILLAGE_KINDS.map((k) => growTree(TREE_KINDS[k]));
  const leafMat = seeThrough(new THREE.MeshStandardMaterial({
    map: leafClusterTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8,
  }), 'foliage');
  const mx = new THREE.Matrix4();
  kinds.forEach((kind, k) => {
    const mine = spots.filter((s) => s.kind === k);
    const barkMat = seeThrough(new THREE.MeshStandardMaterial({
      ...pbrMaterialMaps(bark(), TREE_KINDS[VILLAGE_KINDS[k]].bark, 1.6), color: 0xd8c8b0,
    }), 'prop');
    const barks = new THREE.InstancedMesh(kind.bark, barkMat, mine.length);
    const inside = mine.filter((s) => withinVillage(s.x, s.z)).length;
    const crowns = [
      { name: 'in the village', look: LEAVES_NEAR, count: inside, at: 0 },
      { name: 'in the wood', look: LEAVES_FAR, count: mine.length - inside, at: 0 },
    ].map((crown) => {
      const thin = thinnedLeaves(kind.leaves, crown.look.keep, crown.look.grow, k + 1);
      return { ...crown, mesh: new THREE.InstancedMesh(thin, leafMat, crown.count) };
    });
    mine.forEach((s, i) => {
      // (sunk a little: a trunk is an open tube at its foot)
      setInstance(barks, i, s.x, -0.25, s.z, 0, s.turn, 0, s.height, s.height, s.height);
      barks.getMatrixAt(i, mx);
      const crown = crowns[withinVillage(s.x, s.z) ? 0 : 1];
      crown.mesh.setMatrixAt(crown.at, mx);
      crown.mesh.setColorAt(crown.at, s.colour);
      crown.at++;
      wall.addGeometry(kind.trunk, mx, false, 'beyond');
      if (withinVillage(s.x, s.z)) {
        obstacles.push({ x: s.x, z: s.z, r: Math.max(0.3, kind.trunkFoot * s.height + 0.1), h: s.height });
      }
    });
    barks.castShadow = barks.receiveShadow = true;
    barks.name = `village trees' bark: ${TREE_KINDS[VILLAGE_KINDS[k]].preset}`;
    scene.add(...asTree(...cullInCells(barks, eachInstance)));
    for (const { mesh, name } of crowns) {
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.name = `village trees' leaves ${name}: ${TREE_KINDS[VILLAGE_KINDS[k]].preset}`;
      scene.add(...asTree(...cullInCells(mesh, eachInstance)));
    }
  });
}
