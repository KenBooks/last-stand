// Procedural PBR maps (albedo, normal, roughness) as plain pixel data: pure maths, no DOM, so a
// worker can make them (core/pbr.worker.ts) while the loading screen stays live. `core/textures.ts`
// turns them into canvases and textures.
import { makeFbm, mulberry, clamp, smooth } from '../util';
import { faceData, type HeadGrid } from '../entities/models/face';
import { ashlarSpan, fract, hash3, jointBevel, latticeCells, latticeFbm, latticeNoise, mix, smoothstep, wrap, type Cells, type Field } from './patterns';

/** Per-pixel output of a PBR sampler: height, albedo rgb (0..1), roughness. */
interface PBRSample { h: number; r: number; g: number; b: number; rough: number }
type PBRSampler = (u: number, v: number, out: PBRSample) => void;
/** A material's maps as RGBA pixels, `size` square (or `size` wide and `height` tall); a face's with the ray grid it
 *  was painted on, which its head is built on (cast once, by the worker painting it). */
export interface PBRData { size: number; height?: number; albedo: Uint8ClampedArray<ArrayBuffer>; normal: Uint8ClampedArray<ArrayBuffer>; rough: Uint8ClampedArray<ArrayBuffer>; grid?: HeadGrid }

// Builds albedo / normal / roughness maps from per-pixel callbacks. The roughness map's red channel (which no material
// reads: roughness is green) keeps the height, 0 at the map's lowest point and 1 at its highest, for the floors'
// relief (core/parallax.ts).
function buildPBR(size: number, sampler: PBRSampler, normalStrength = 2.5): PBRData {
  const n = size * size;
  const height = new Float32Array(n);
  const albedo = new Uint8ClampedArray(n * 4);
  const rough = new Uint8ClampedArray(n * 4);
  const out: PBRSample = { h: 0, r: 0, g: 0, b: 0, rough: 0.8 };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      sampler(x / size, y / size, out);
      const i = y * size + x;
      height[i] = out.h;
      albedo[i * 4] = out.r * 255; albedo[i * 4 + 1] = out.g * 255; albedo[i * 4 + 2] = out.b * 255; albedo[i * 4 + 3] = 255;
      const rv = out.rough * 255;
      rough[i * 4] = rv; rough[i * 4 + 1] = rv; rough[i * 4 + 2] = rv; rough[i * 4 + 3] = 255;
    }
  }
  const normal = new Uint8ClampedArray(n * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xl = (x - 1 + size) % size, xr = (x + 1) % size, yu = (y - 1 + size) % size, yd = (y + 1) % size;
      const dx = (height[y * size + xr] - height[y * size + xl]) * normalStrength;
      const dy = (height[yd * size + x] - height[yu * size + x]) * normalStrength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      normal[i] = (-dx / len * 0.5 + 0.5) * 255;
      normal[i + 1] = (dy / len * 0.5 + 0.5) * 255;
      normal[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      normal[i + 3] = 255;
    }
  }
  let low = Infinity, high = -Infinity;
  for (let i = 0; i < n; i++) { low = Math.min(low, height[i]); high = Math.max(high, height[i]); }
  const span = high - low || 1;
  for (let i = 0; i < n; i++) rough[i * 4] = (height[i] - low) / span * 255;
  return { size, albedo, normal, rough };
}

// Jittered-grid Voronoi, tileable. Returns F1, F2 (in cell units) and cell id.
export function makeVoronoi(seed: number, cells: number) {
  const rng = mulberry(seed);
  const pts = new Float32Array(cells * cells * 2);
  const ids = new Float32Array(cells * cells);
  for (let i = 0; i < cells * cells; i++) {
    pts[i * 2] = 0.15 + rng() * 0.7;
    pts[i * 2 + 1] = 0.15 + rng() * 0.7;
    ids[i] = rng();
  }
  const res = { f1: 0, f2: 0, id: 0, cx: 0, cy: 0 };
  return (u: number, v: number) => {
    const x = u * cells, y = v * cells;
    const xi = Math.floor(x), yi = Math.floor(y);
    let f1 = 9, f2 = 9, id = 0;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const cx = xi + ox, cy = yi + oy;
        const wx = ((cx % cells) + cells) % cells, wy = ((cy % cells) + cells) % cells;
        const k = wy * cells + wx;
        const px = cx + pts[k * 2], py = cy + pts[k * 2 + 1];
        const d = Math.hypot(px - x, py - y);
        if (d < f1) { f2 = f1; f1 = d; id = ids[k]; }
        else if (d < f2) f2 = d;
      }
    }
    res.f1 = f1; res.f2 = f2; res.id = id;
    return res;
  };
}

/** Cobbles (5 m a tile), the crypt's ground without its photo (`cobblestone`): domed stones in cells, dirt between. */
function cellCobbles(): PBRData {
  const vor = makeVoronoi(7, 14);
  const fbm = makeFbm(3, 8, 5);
  const fine = makeFbm(11, 64, 3);
  const maps = buildPBR(1024, (u, v, o) => {
    const c = vor(u, v);
    const edge = c.f2 - c.f1;
    const n = fbm(u, v), f = fine(u, v);
    const stone = smooth(clamp(edge / 0.22, 0, 1));
    const dome = Math.sqrt(stone);
    o.h = dome * (0.75 + c.id * 0.35) + f * 0.12 * stone;
    const shade = 0.09 + c.id * 0.08 + (f - 0.5) * 0.05 + (n - 0.5) * 0.06;
    const dirt = 1 - stone;
    // cold blue-grey stones, brown-black grout
    o.r = clamp(shade * 0.95 * stone + dirt * 0.045, 0, 1);
    o.g = clamp(shade * 1.0 * stone + dirt * 0.04, 0, 1);
    o.b = clamp(shade * 1.12 * stone + dirt * 0.035, 0, 1);
    // Worn tops are smoother (slight wet sheen), grout is rough.
    o.rough = clamp(0.92 - dome * 0.38 + (f - 0.5) * 0.2, 0.3, 1);
  }, 3.5);
  return maps;
}

// --- stone, wood and steel after sdf-harness's materials (core/patterns.ts: its hash, noise and cells, made to
// tile): its patterns' shapes and its presets' numbers, in a tile. Where a preset is in metres, here it's in the
// unit the tile is counted in (a block's length, a slab's size, a furrow's width), which the material's repeat
// sizes on the surface; its colours are darkened to the arena's (a biome's light was set for its maps' albedo).

/** a cell's sdf colour (sRGB 0..1) scaled by `k` */
const shade = (rgb: readonly [number, number, number], k: number, o: PBRSample): void => {
  o.r = clamp(rgb[0] * k, 0, 1); o.g = clamp(rgb[1] * k, 0, 1); o.b = clamp(rgb[2] * k, 0, 1);
};
/** where a relief's low places take its joints' colour: sdf's 1 - smoothstep(0.05, 0.35, height) */
const inJoint = (h: number): number => 1 - smoothstep(0.05, 0.35, h);

/** the crypt's stone (sRGB 0..1, darkened to its night): its blocks' cold grey, and the mortar's */
const CRYPT_STONE = [0.17, 0.176, 0.198] as const;
const CRYPT_MORTAR = [0.055, 0.055, 0.06] as const;

/**
 * Ashlar (the crypt's walls, the dummy's plinth): sdf-harness's castle stone. Squared blocks in courses, each
 * course's joints half a block on from the one below and each joint moved up to 0.3 of a block from its place
 * (`ashlarSpan`), so no two blocks are as long; the arrises bevelled into the mortar, each face rough-dressed (sdf's
 * pits: 0.3 deep at 6 a block, 0.15 at 15), its shade its own (sdf's 0.5: within 25%). In sdf a block is 0.5 m long
 * and a course 0.25 m tall, the joints 12 mm and their bevel 18 mm: here a block is a tile's width over `blocks`, a
 * course its height over `courses` (an even number, so the courses' half-block offsets tile).
 */
function ashlar(seed: number, courses: number, blocks: number): PBRData {
  const block = 1 / blocks, course = 1 / courses;
  const gap = (0.012 / 0.5) * block, bevel = (0.018 / 0.5) * block;
  const pits6 = latticeNoise(6 * blocks, 6 * blocks, seed + 1), pits15 = latticeNoise(15 * blocks, 15 * blocks, seed + 2);
  const mottle = latticeFbm(2 * blocks, 2 * blocks, seed + 3);
  return buildPBR(512, (u, v, o) => {
    const rv = v * courses, row = Math.floor(rv), fv = rv - row;
    const [du, index] = ashlarSpan(u * blocks + 0.5 * (row % 2), row, 40 + seed, blocks);
    const joint = Math.min(du * block, Math.min(fv, 1 - fv) * course);
    const pits = 0.3 * pits6(u, v) + 0.15 * pits15(u, v);
    const h = jointBevel(joint, gap, bevel) * (1 - pits);
    // (its pits a little darker: in the map alone the dressed face read as flat paint)
    const f = inJoint(h), tint = (1 + 0.5 * (hash3(index + 24, row + 24, seed) - 0.5)) * (0.9 + 0.2 * mottle(u, v)) * (1.1 - 0.45 * pits);
    o.h = h;
    o.r = mix(CRYPT_STONE[0] * tint, CRYPT_MORTAR[0], f); o.g = mix(CRYPT_STONE[1] * tint, CRYPT_MORTAR[1], f); o.b = mix(CRYPT_STONE[2] * tint, CRYPT_MORTAR[2], f);
    o.rough = clamp(mix(0.8, 0.95, f) + (pits - 0.22) * 0.3, 0.5, 1);
  }, 4);
}

/** a flagstone's joint and its bevel, in a slab's size (sdf's flagstone: a slab 0.45 m, the joint 20 mm, its bevel
 *  15 mm) */
const FLAG_GAP = 0.02 / 0.45;
const FLAG_BEVEL = 0.015 / 0.45;
/** the forest's dais's stone (sRGB 0..1, darkened to its dusk), and its joints' */
const FLAG_STONE = [0.17, 0.176, 0.186] as const;
const FLAG_JOINT = [0.05, 0.05, 0.048] as const;
/** pale marble (sdf's marble_white, #ece9e4 with veins #7a7a84, darkened to the crypt's night, cooler), and its
 *  joints: the crypt's paths, lighter than its cobbles round them (in black marble their slabs read as the cobbles) */
const MARBLE = [0.35, 0.355, 0.372] as const;
const MARBLE_VEIN = [0.17, 0.172, 0.19] as const;
const MARBLE_JOINT = [0.06, 0.06, 0.066] as const;
/** the ways a marble slab's veins run, each a whole number of bands across a tile and down it (so they tile) */
const VEIN_WAYS = [[6, 2], [2, 6], [5, -4], [-4, 5], [6, -1]] as const;

/**
 * Flagstones (the forest's dais): sdf-harness's flagstone. Irregular slabs, cells of a lattice `cells` by `cells`
 * a tile with a point in each up to 0.35 of a cell from its middle; the joint where two meet (half their distances'
 * difference), bevelled into, each slab tilted its own way a little (its top 0.8 to 1 of the highest) and pitted, its
 * shade its own (within 25%). `veined`: cut from pale marble (the crypt's paths), sdf's marble's veins through each
 * slab its own way, a vein 0.03 to 0.07 of a band wide with a finer one between, honed, not polished. (sdf's bands
 * warped 2.8 bands deep by noise a cell a band came out as worms in a tile's few bands: here they're warped 1.2
 * bands deep by noise three cells a tile, a slow flow.)
 */
function flags(seed: number, cells: number, veined: boolean): PBRData {
  const c: Cells = { f1: 0, f2: 0, id: 0, cx: 0, cy: 0 }, slabsAt = latticeCells(cells, cells, 0.7, seed);
  const pitsAt = latticeNoise(cells * 6, cells * 6, seed + 1), mottle = latticeFbm(cells * 2, cells * 2, seed + 2);
  const flow = latticeFbm(3, 3, seed + 3), eddies = latticeFbm(8, 8, seed + 4), width = latticeNoise(6, 6, seed + 5);
  const finer = latticeFbm(10, 10, seed + 6), cloud = latticeFbm(8, 8, seed + 7);
  return buildPBR(512, (u, v, o) => {
    slabsAt(u, v, c);
    const tilt = 0.8 + 0.2 * hash3(c.cx + 48, c.cy + 48, seed), pits = pitsAt(u, v);
    const bevel = jointBevel((c.f2 - c.f1) * 0.5, FLAG_GAP, FLAG_BEVEL);
    const h = bevel * tilt * (1 - 0.15 * pits), f = inJoint(h);
    const tint = 1 + 0.5 * (c.id - 0.5);
    o.h = h;
    if (!veined) {
      const k = tint * (0.88 + 0.24 * mottle(u, v));
      o.r = mix(FLAG_STONE[0] * k, FLAG_JOINT[0], f); o.g = mix(FLAG_STONE[1] * k, FLAG_JOINT[1], f); o.b = mix(FLAG_STONE[2] * k, FLAG_JOINT[2], f);
      o.rough = clamp(mix(0.78, 0.95, f) + (pits - 0.5) * 0.12, 0.5, 1);
      return;
    }
    const [ku, kv] = VEIN_WAYS[Math.floor(hash3(c.cx + 60, c.cy + 60, seed) * VEIN_WAYS.length)];
    const t = ku * u + kv * v + 10 * hash3(c.cx + 62, c.cy + 62, seed) + 1.2 * (flow(u, v) + 0.12 * eddies(u, v));
    const w = 0.03 + 0.04 * width(u, v);
    const vein = 1 - smoothstep(0.3 * w, w, Math.abs(fract(t) - 0.5));
    const fine = 1 - smoothstep(0.2 * w, 0.6 * w, Math.abs(fract(2 * t + 0.6 * finer(u, v)) - 0.5));
    const fv = Math.max(vein, 0.45 * fine), k = tint * (1 + 0.25 * (cloud(u, v) - 0.5));
    const stone = (i: number): number => mix(mix(MARBLE[i] * k, MARBLE_VEIN[i], fv), MARBLE_JOINT[i], f);
    o.r = stone(0); o.g = stone(1); o.b = stone(2);
    // (its arris worn rough: honed like the face, the bevel's few steep pixels caught the light at a grazing angle,
    // a white line along every slab)
    const arris = 1 - smoothstep(0.75, 1, bevel);
    o.rough = clamp(mix(mix(0.3 + fv * 0.06, 0.85, arris), 0.92, f) + (pits - 0.5) * 0.06, 0.2, 1);
  }, 4);
}
const flagstone = (seed: number, cells: number): PBRData => flags(seed, cells, false);
const marble = (seed: number, cells: number): PBRData => flags(seed, cells, true);

/** slate's colours (sdf's slate, #464a52 with its softer layers #30343a, darkened to the crypt's night), and its
 *  joints */
const SLATE = [0.2, 0.21, 0.236] as const;
const SLATE_SOFT = [0.155, 0.165, 0.188] as const;
const SLATE_JOINT = [0.045, 0.045, 0.05] as const;
/** slate's cleaved layers down a tile (sdf's are 1 cm: here 8 cm on the dais's 2 m tile, 21 pixels each; finer,
 *  in long slabs, they read as boards) */
const SLATE_LAYERS = 24;

/**
 * Riven slate slabs (the crypt's dais and its braziers' steps): ashlar's courses of slabs, `courses` a tile and
 * `blocks` a course, each slab's face sdf-harness's slate: its strata, cleaved layers along the slab, warped by
 * its fractal noise (0.9 of a layer deep), the softer ones darker and worn a little in, each layer's shade a little
 * its own; each slab cut from its own place in the bed, its shade its own, mottled.
 */
function slate(seed: number, courses: number, blocks: number): PBRData {
  const block = 1 / blocks, course = 1 / courses, L = SLATE_LAYERS;
  const gap = (0.012 / 0.5) * block, bevel = (0.018 / 0.5) * block;
  const warp = latticeFbm(L / 4, L / 4, seed + 1), mottle = latticeFbm(4, 4, seed + 6), layer = latticeNoise(L, 1, seed + 2), layer3 = latticeNoise(3 * L, 1, seed + 3);
  const layer9 = latticeNoise(9 * L, 1, seed + 4), layer23 = latticeNoise(23 * L, 1, seed + 5);
  return buildPBR(512, (u, v, o) => {
    const rv = v * courses, row = Math.floor(rv), fv = rv - row;
    const [du, index] = ashlarSpan(u * blocks + 0.5 * (row % 2), row, 50 + seed, blocks);
    const slab = hash3(index + 24, row + 24, seed);
    // sdf's strata: the place in the layers (here a whole number of them down a tile, each slab from its own place)
    const t = v * L + 0.9 * warp(u, v) + Math.floor(slab * 97) * 7, s = t / L;
    const band = smoothstep(0.42, 0.58, 0.65 * layer(s, 0) + 0.35 * layer3(s, 0)) * (0.8 + 0.2 * layer9(s, 0));
    const h = jointBevel(Math.min(du * block, Math.min(fv, 1 - fv) * course), gap, bevel) * (1 - 0.25 * band);
    const f = inJoint(h), tint = (1 + 0.3 * (slab - 0.5)) * (0.85 + 0.3 * mottle(u, v)) * (1 + 0.2 * (hash3(wrap(Math.floor(2 * t), 2 * L), 3, 7) - 0.5) + 0.08 * (layer23(s, 0) - 0.5));
    const stone = (i: number): number => mix(mix(SLATE[i] * tint, SLATE_SOFT[i], band), SLATE_JOINT[i], f);
    o.h = h;
    o.r = stone(0); o.g = stone(1); o.b = stone(2);
    o.rough = clamp(mix(0.62 + band * 0.15, 0.95, f), 0, 1);
  }, 4);
}

/** a rock's stone (bright and near grey, as grunge was: its material's colour tints it, and each biome's light was
 *  set for that), its cracks, the moss in its hollows and its lichen's pale crusts */
const ROCK = [0.76, 0.75, 0.72] as const;
const ROCK_CRACK = [0.22, 0.22, 0.21] as const;
const ROCK_MOSS = [0.36, 0.48, 0.22] as const;
const ROCK_LICHEN = [0.84, 0.85, 0.77] as const;

/**
 * Weathered rock (the forest's boulders, the thicket's rocks, the gates' boulders, the standing stones and pebbles), a
 * tile a metre: sdf-harness's fractal noise in lumps (3 a tile) and a mottle (4), its grain (64 a tile and finer) and
 * its minerals' specks (256 a tile: 4 mm), darker in its hollows; cracks along its cells' edges (sdf's cells, 5 a
 * tile), wandering (their place warped by a noise, 3 cm at most) and only where a third noise lets them (cracked all
 * over, or in a finer net as well, it read as paving), worn into it; moss in its hollows, its own fine tufts, and
 * lichen in small pale crusts on what's left.
 */
function rock(seed: number): PBRData {
  const lumps = latticeFbm(3, 3, seed), mottle = latticeFbm(4, 4, seed + 1), grain = latticeFbm(64, 64, seed + 2, 3);
  const speck = latticeNoise(256, 256, seed + 3), cracked = latticeFbm(3, 3, seed + 4);
  const warpU = latticeFbm(4, 4, seed + 5), warpV = latticeFbm(4, 4, seed + 6);
  const cracks = latticeCells(5, 5, 0.9, seed + 7), mossy = latticeFbm(6, 6, seed + 8);
  const tufts = latticeFbm(48, 48, seed + 9, 2), lichen = latticeFbm(24, 24, seed + 10, 3);
  const cell: Cells = { f1: 0, f2: 0, id: 0, cx: 0, cy: 0 };
  return buildPBR(512, (u, v, o) => {
    cracks(u + 0.15 * (warpU(u, v) - 0.5), v + 0.15 * (warpV(u, v) - 0.5), cell);
    const cut = (1 - smoothstep(0, 0.045, cell.f2 - cell.f1)) * smoothstep(0.5, 0.62, cracked(u, v));
    const relief = 0.6 * lumps(u, v) + 0.25 * mottle(u, v) + 0.15 * grain(u, v);
    // moss where it's low and the noise lets it; lichen on what's left, in crusts
    const moss = smoothstep(0.53, 0.67, mossy(u, v) + 0.35 * (0.5 - relief)) * (1 - cut);
    const crust = 0.75 * smoothstep(0.66, 0.72, lichen(u, v)) * (1 - moss) * (1 - cut);
    const s = speck(u, v), mineral = s > 0.86 ? 0.75 : s < 0.1 ? 1.12 : 1;
    const tone = (0.9 + 0.36 * (mottle(u, v) - 0.5) + 0.2 * (grain(u, v) - 0.5)) * (0.8 + 0.4 * relief) * mineral;
    const tuft = 0.7 + 0.6 * tufts(u, v);
    const colour = (i: number): number =>
      mix(mix(mix(ROCK[i] * tone, ROCK_LICHEN[i], crust), ROCK_MOSS[i] * tuft, moss), ROCK_CRACK[i], cut);
    o.h = relief * (1 - 0.85 * cut) + 0.05 * moss * tufts(u, v);
    o.r = colour(0); o.g = colour(1); o.b = colour(2);
    o.rough = clamp(0.82 + 0.1 * moss + 0.06 * crust + 0.08 * cut, 0, 1);
  }, 5);
}

/** granite's crystals (sRGB 0..1, darkened to the crypt's night): grey feldspar, its pinker kind, pale quartz and
 *  black mica, each a share of the grains */
const GRANITE = [
  { share: 0.5, rgb: [0.3, 0.3, 0.31] },
  { share: 0.18, rgb: [0.36, 0.32, 0.31] },
  { share: 0.14, rgb: [0.46, 0.46, 0.47] },
  { share: 0.18, rgb: [0.05, 0.05, 0.055] },
] as const;

/** the crystal a grain's hash (0..1) falls to */
function graniteCrystal(id: number): (typeof GRANITE)[number] {
  let at = 0;
  for (const crystal of GRANITE) {
    at += crystal.share;
    if (id < at) return crystal;
  }
  return GRANITE[0];
}

/**
 * Granite (the crypt's braziers' plinths), a tile half a metre: interlocking crystals (cells, 128 a tile: about 4 mm,
 * their place warped so no grain is a cell's shape), each grey feldspar, a pinker feldspar, pale quartz or black mica
 * by its hash, each a little its own shade, in a slow mottle; honed, its mica a shade glossier. (In slate's cleaved
 * strata a plinth's steps read as planks.)
 */
function granite(seed: number): PBRData {
  const grains = latticeCells(128, 128, 0.9, seed), mottle = latticeFbm(3, 3, seed + 1);
  const warpU = latticeFbm(32, 32, seed + 2), warpV = latticeFbm(32, 32, seed + 3);
  const cell: Cells = { f1: 0, f2: 0, id: 0, cx: 0, cy: 0 };
  return buildPBR(512, (u, v, o) => {
    grains(u + 0.006 * (warpU(u, v) - 0.5), v + 0.006 * (warpV(u, v) - 0.5), cell);
    const crystal = graniteCrystal(cell.id);
    const own = 0.88 + 0.24 * hash3(cell.cx + 90, cell.cy + 90, seed), k = own * (0.9 + 0.2 * mottle(u, v));
    const edge = 1 - smoothstep(0, 0.08, cell.f2 - cell.f1);
    o.h = 0.5 + 0.1 * (own - 1) - 0.08 * edge;
    o.r = crystal.rgb[0] * k; o.g = crystal.rgb[1] * k; o.b = crystal.rgb[2] * k;
    o.rough = clamp((crystal === GRANITE[3] ? 0.34 : 0.48) + 0.1 * edge, 0, 1);
  }, 1);
}

/** limestone's weathered face (bright and near grey, as grunge was: its material's colour tints it), the grime the
 *  rain leaves down it and in its pits, and its lichen's crusts */
const LIMESTONE = [0.8, 0.78, 0.73] as const;
const LIMESTONE_GRIME = [0.3, 0.3, 0.29] as const;
const LIMESTONE_LICHEN = [0.7, 0.72, 0.6] as const;

/**
 * Weathered limestone (the crypt's carved stone: its broken columns and drums, its coffins and gravestones), a tile a
 * metre (v down the stone, as a column's shaft runs): soft hollows the weather wore (fractal noise, 3 a tile) and its
 * grain (64 a tile and finer); pits where the softer stuff washed out (cells, 36 a tile: about 3 cm, a fifth of them
 * pitted, each its own size, grimed inside); hairline cracks (cells, 4 a tile, wandering, only where a noise lets them);
 * the rain's streaks down it (a noise 12 across and 2 down: 40 drew stripes, a grain), darker; lichen in small pale
 * crusts. A plain grunge read as flat painted grey (the owner: "add more 3d to other otherwise flat looking
 * textures").
 */
function limestone(seed: number): PBRData {
  const hollows = latticeFbm(3, 3, seed), grain = latticeFbm(64, 64, seed + 1, 3), mottle = latticeFbm(5, 5, seed + 2);
  const pits = latticeCells(36, 36, 0.9, seed + 3), cracks = latticeCells(4, 4, 0.9, seed + 4);
  const cracked = latticeFbm(3, 3, seed + 5), warpU = latticeFbm(6, 6, seed + 6), warpV = latticeFbm(6, 6, seed + 7);
  const streaks = latticeFbm(12, 2, seed + 8, 3), lichen = latticeFbm(20, 20, seed + 9, 3);
  const pit: Cells = { f1: 0, f2: 0, id: 0, cx: 0, cy: 0 };
  const crack: Cells = { f1: 0, f2: 0, id: 0, cx: 0, cy: 0 };
  return buildPBR(512, (u, v, o) => {
    pits(u, v, pit);
    // (a fifth of the cells pitted, each its own size: 0.1 to 0.35 of a cell across)
    const size = pit.id > 0.8 ? 0.1 + 1.25 * (pit.id - 0.8) : 0;
    const hole = size > 0 ? 1 - smoothstep(size * 0.4, size, pit.f1) : 0;
    cracks(u + 0.12 * (warpU(u, v) - 0.5), v + 0.12 * (warpV(u, v) - 0.5), crack);
    const cut = (1 - smoothstep(0, 0.03, crack.f2 - crack.f1)) * smoothstep(0.52, 0.64, cracked(u, v));
    const worn = hollows(u, v);
    const relief = 0.6 * worn + 0.18 * grain(u, v) + 0.1 * mottle(u, v);
    o.h = relief - 0.35 * hole - 0.3 * cut;
    // grime down the rain's streaks and deeper in the hollows, the pits and the cracks
    const streak = smoothstep(0.55, 0.8, streaks(u, v));
    const grime = clamp(0.45 * streak + 0.35 * (0.5 - worn) + 0.8 * hole + 0.9 * cut, 0, 1);
    const crust = 0.7 * smoothstep(0.7, 0.76, lichen(u, v)) * (1 - hole) * (1 - cut);
    const tone = 0.92 + 0.22 * (mottle(u, v) - 0.5) + 0.16 * (grain(u, v) - 0.5);
    const colour = (i: number): number => mix(mix(LIMESTONE[i] * tone, LIMESTONE_GRIME[i], grime * 0.6), LIMESTONE_LICHEN[i], crust);
    o.r = colour(0); o.g = colour(1); o.b = colour(2);
    o.rough = clamp(0.84 + 0.1 * hole + 0.06 * crust - 0.06 * streak, 0, 1);
  }, 5);
}

/** moss's young green, its old darker green and the shade between its cushions */
const MOSS = [0.4, 0.52, 0.2] as const;
const MOSS_OLD = [0.2, 0.3, 0.1] as const;
const MOSS_GAP = [0.07, 0.09, 0.04] as const;

/**
 * Moss (the fallen logs' backs, the standing stones' shoulders), a tile half a metre: cushions (cells, 7 a tile, their
 * place warped) domed and shaded apart in the gaps between them, each its own green, mottled young to old, its
 * fronds' fine tufts (64 and 128 a tile) over it all. A plain grunge tinted green read as a flat painted top.
 */
function moss(seed: number): PBRData {
  const cushions = latticeCells(4, 4, 0.85, seed), warpU = latticeFbm(4, 4, seed + 1), warpV = latticeFbm(4, 4, seed + 2);
  const age = latticeFbm(3, 3, seed + 3), parted = latticeFbm(5, 5, seed + 6);
  const fronds = latticeFbm(48, 48, seed + 4, 3), fine = latticeNoise(192, 192, seed + 5);
  const cell: Cells = { f1: 0, f2: 0, id: 0, cx: 0, cy: 0 };
  return buildPBR(256, (u, v, o) => {
    cushions(u + 0.2 * (warpU(u, v) - 0.5), v + 0.2 * (warpV(u, v) - 0.5), cell);
    const dome = smoothstep(0, 0.9, 1 - cell.f1 / 0.8);
    // (a soft, broken dip between cushions, only where a noise parts them: drawn sharp along every edge, it was paving)
    const gap = (1 - smoothstep(0, 0.22, cell.f2 - cell.f1)) * smoothstep(0.45, 0.65, parted(u, v));
    const f = fine(u, v), tip = f > 0.8 ? 1.25 : f < 0.25 ? 0.8 : 1;
    const tuft = fronds(u, v);
    const old = smoothstep(0.3, 0.75, 0.7 * age(u, v) + 0.3 * cell.id);
    const lit = (0.8 + 0.25 * dome) * (0.55 + 0.9 * tuft) * tip;
    const colour = (i: number): number => mix(mix(MOSS[i], MOSS_OLD[i], old) * lit, MOSS_GAP[i], gap * 0.6);
    o.h = 0.35 * dome * (1 - 0.5 * gap) + 0.5 * tuft + 0.15 * f;
    o.r = colour(0); o.g = colour(1); o.b = colour(2);
    o.rough = clamp(0.9 + 0.08 * gap - 0.06 * tuft, 0, 1);
  }, 3);
}

function grunge(): PBRData {
  const fbm = makeFbm(42, 4, 6);
  const maps = buildPBR(256, (u, v, o) => {
    const n = fbm(u, v);
    o.h = n; o.r = o.g = o.b = 0.55 + n * 0.45;
    o.rough = 0.6 + n * 0.4;
  }, 2);
  return maps;
}

/** wood's rings across a tile (v runs along the grain: a tile is as long as it's wide) */
const WOOD_RINGS = 24;
/** sdf's oak (#a87a4a, its latewood #7a5230), greyed and darkened by weather */
const OAK = [0.4, 0.3, 0.19] as const;
const OAK_LATE = [0.28, 0.19, 0.115] as const;

/**
 * Weathered oak (the dummy's post, the mage's staff, the ranger's bow): sdf-harness's oak. Its rings across u, each
 * ring's latewood a sharp band (sdf's smoothstep 0.55 to 0.85 of the ring) wavering with its fractal noise (0.6 of a
 * ring deep, a cell a ring across and four rings' length along the grain), streaked with fine pores (sdf's: ten a
 * ring across, one each two rings along); the latewood stands where the softer earlywood weathered away.
 */
function wood(): PBRData {
  const R = WOOD_RINGS, waver = latticeFbm(R, R / 4, 77), pores = latticeNoise(R * 10, R / 2, 79), weathered = latticeFbm(3, 3, 81);
  return buildPBR(256, (u, v, o) => {
    const ring = fract(u * R + 0.6 * waver(u, v)), pore = pores(u, v);
    const late = smoothstep(0.55, 0.85, ring) * (0.75 + 0.25 * pore), weather = weathered(u, v);
    o.h = late * 0.55 + pore * 0.15 + weather * 0.3;
    const k = 0.82 + (weather - 0.5) * 0.35;
    o.r = mix(OAK[0], OAK_LATE[0], late) * k; o.g = mix(OAK[1], OAK_LATE[1], late) * k; o.b = mix(OAK[2], OAK_LATE[2], late) * k;
    o.rough = clamp(0.76 + late * 0.1 + (1 - pore) * 0.08, 0, 1);
  }, 3);
}

/** Coarse burlap weave. */
function burlap(): PBRData {
  const fbm = makeFbm(91, 4, 4);
  const threads = 48;
  const maps = buildPBR(256, (u, v, o) => {
    const a = Math.sin(u * threads * Math.PI * 2), b = Math.sin(v * threads * Math.PI * 2);
    // over / under: which thread is on top alternates per cell
    const top = (Math.floor(u * threads) + Math.floor(v * threads)) % 2 === 0 ? Math.abs(a) : Math.abs(b);
    const n = fbm(u, v);
    o.h = top * 0.7 + n * 0.3;
    const k = 0.62 + top * 0.25 + (n - 0.5) * 0.3;
    o.r = 0.66 * k; o.g = 0.53 * k; o.b = 0.34 * k;
    o.rough = 0.95;
  }, 2);
  return maps;
}

/**
 * A tileable scatter of things on a jittered grid, at most one a cell (`share` of the cells): each with its centre in its
 * cell (cell units), a turn (its cos and sin), a size and an id (0..1). `near(u, v)` lists those in the 3x3 cells round the point
 * (a thing must reach no further than a cell from its centre), as offsets from the point to each centre.
 */
function makeScatter(seed: number, cells: number, share: number) {
  const rng = mulberry(seed), n = cells * cells;
  const cx = new Float32Array(n), cy = new Float32Array(n), size = new Float32Array(n), id = new Float32Array(n);
  const cos = new Float32Array(n), sin = new Float32Array(n), on = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const turn = rng() * Math.PI * 2;
    cx[i] = rng(); cy[i] = rng(); cos[i] = Math.cos(turn); sin[i] = Math.sin(turn); size[i] = rng(); id[i] = rng();
    on[i] = rng() < share ? 1 : 0;
  }
  const found = { count: 0, dx: new Float32Array(9), dy: new Float32Array(9), k: new Int32Array(9) };
  const near = (u: number, v: number) => {
    const x = u * cells, y = v * cells, xi = Math.floor(x), yi = Math.floor(y);
    found.count = 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      // (wrapped round the tile by a comparison: the point is in it, so a neighbour is at most a cell outside)
      const gx = xi + ox, gy = yi + oy;
      const wx = gx < 0 ? gx + cells : gx >= cells ? gx - cells : gx, wy = gy < 0 ? gy + cells : gy >= cells ? gy - cells : gy;
      const k = wy * cells + wx;
      if (!on[k]) continue;
      const j = found.count++;
      found.dx[j] = gx + cx[k] - x; found.dy[j] = gy + cy[k] - y; found.k[j] = k;
    }
    return found;
  };
  return { near, cos, sin, size, id, cells };
}

/** the forest floor's tile (m) and its texels (cm a pixel: 5 m over 1024) */
const FLOOR_TILE = 5;
const FLOOR_CM = FLOOR_TILE * 100 / 1024;
/** a leaf's colours, fresh to rotten (sRGB 0..1): russet, ochre, tan, yellowed green, brown, rotten */
const LEAF_COLOURS: [number, number, number][] = [
  [0.46, 0.2, 0.08], [0.52, 0.34, 0.11], [0.4, 0.27, 0.13], [0.4, 0.38, 0.14], [0.3, 0.18, 0.08], [0.19, 0.12, 0.06],
];

/**
 * The forest floor without its photo (`forestFloor`; 5 m a tile, heights in cm): clumpy dark soil under a litter of fallen leaves in three layers (each leaf
 * turned its own way, cupped, a raised midrib with veins off it and its edges darker; the lower layers older and
 * darker), twigs lying across them and pebbles from 2 to 6 cm across. At each point what lies highest is what shows,
 * so pebbles poke through the leaves and twigs lie over them: the floors' relief (core/parallax.ts) stands each up out
 * of the soil. Moss is added in world space by the biome, so it doesn't tile.
 */
function litterFloor(): PBRData {
  const soil = makeFbm(29, 24, 4), crumbs = makeFbm(31, 160, 2), rot = makeFbm(37, 96, 2);
  const leafCells = 64, twigCells = 24, pebbleCells = 32;
  const layers = [makeScatter(41, leafCells, 0.55), makeScatter(43, leafCells, 0.45), makeScatter(47, leafCells, 0.35)];
  const twigs = makeScatter(53, twigCells, 0.18), pebbles = makeScatter(59, pebbleCells, 0.22);
  const cm = (cells: number) => FLOOR_TILE * 100 / cells;   // a cell of a grid, cm
  return buildPBR(1024, (u, v, o) => {
    // the soil: clumpy, crumbs over it, darker where it's damp
    const s = soil(u, v), c = crumbs(u, v), rotten = rot(u, v) - 0.5;
    let h = s * 0.9 + c * 0.25, r = 0.13, g = 0.09, b = 0.06, rough = 0.95;
    const damp = smooth(clamp((s - 0.55) / 0.2, 0, 1));
    const k = (0.75 + c * 0.5) * (1 - damp * 0.3);
    r *= k; g *= k; b *= k;
    const lay = (top: number, cr: number, cg: number, cb: number, ro: number) => {
      if (top <= h) return;
      h = top; r = cr; g = cg; b = cb; rough = ro;
    };
    // the leaves, layer by layer up
    layers.forEach((layer, li) => {
      const near = layer.near(u, v), size = cm(layer.cells);
      for (let j = 0; j < near.count; j++) {
        const key = near.k[j], z = layer.size[key], half = 4 + z * 3.5;
        const px = -near.dx[j] * size, py = -near.dy[j] * size;
        if (px * px + py * py >= half * half) continue;
        // along the leaf and across it (cm), its half length 4 to 7.5 cm, half width a third of that or more
        const cs = layer.cos[key], sn = layer.sin[key];
        const a = px * cs + py * sn, w0 = -px * sn + py * cs, wide = half * (0.32 + layer.id[key] * 0.14);
        const along = a / half;
        if (Math.abs(along) >= 1) continue;
        const width = wide * Math.pow(Math.sin((along + 1) * Math.PI / 2), 0.85) * (along < 0 ? 1 : 1 - along * 0.25);
        const across = w0 / width;
        if (width <= 0 || Math.abs(across) >= 1) continue;
        const cup = across * across, rib = Math.max(0, 1 - Math.abs(w0) / 0.25);
        const vein = Math.max(0, 1 - Math.abs(((along * 3.5 - Math.abs(across) * 1.4) % 1 + 1) % 1 - 0.5) / 0.08);
        const top = 0.6 + li * 0.45 + layer.size[key] * 0.15 + cup * 0.45 + rib * 0.12 - vein * 0.04;
        // fresher on top, older below, rotting in spots, darker to its edges
        const age = clamp(layer.id[key] * 0.7 + (2 - li) * 0.18 + rotten * 0.5, 0, 0.999);
        const col = LEAF_COLOURS[Math.floor(age * LEAF_COLOURS.length)];
        const shade = (1 - cup * 0.35) * (1 + rib * 0.25) * (1 - vein * 0.25) * (0.85 + c * 0.3);
        lay(top, col[0] * shade, col[1] * shade, col[2] * shade, 0.72 + age * 0.2);
      }
    });
    // twigs: capsules lying over the litter, 16 to 38 cm long and 1.2 to 2 cm thick
    {
      const near = twigs.near(u, v), size = cm(twigCells);
      for (let j = 0; j < near.count; j++) {
        const key = near.k[j], half = (0.4 + twigs.size[key] * 0.5) * size;
        const px = -near.dx[j] * size, py = -near.dy[j] * size;
        if (px * px + py * py >= (half + 1) * (half + 1)) continue;
        const dirX = twigs.cos[key], dirY = twigs.sin[key];
        const along = clamp(px * dirX + py * dirY, -half, half);
        const d = Math.hypot(px - along * dirX, py - along * dirY), radius = 0.6 + twigs.id[key] * 0.4;
        if (d >= radius) continue;
        const round = Math.sqrt(1 - (d / radius) ** 2);
        const bark = 0.8 + round * 0.3 + (crumbs(u * 3, v) - 0.5) * 0.25;
        lay(1.5 + radius * round * 2, 0.22 * bark, 0.16 * bark, 0.1 * bark, 0.85);
      }
    }
    // pebbles: low domes, 2 to 6 cm across, a little flattened and turned
    {
      const near = pebbles.near(u, v), size = cm(pebbleCells);
      for (let j = 0; j < near.count; j++) {
        const key = near.k[j], radius = 1 + pebbles.size[key] * 2;
        const px = -near.dx[j] * size, py = -near.dy[j] * size;
        if (px * px + py * py >= radius * radius * 1.6) continue;
        const cs = pebbles.cos[key], sn = pebbles.sin[key];
        const qx = (px * cs + py * sn) / 1.25, qy = -px * sn + py * cs;
        const d = Math.hypot(qx, qy);
        if (d >= radius) continue;
        const dome = Math.sqrt(1 - (d / radius) ** 2);
        const grey = (0.28 + pebbles.id[key] * 0.12) * (0.85 + dome * 0.25 + (crumbs(u * 2, v * 2) - 0.5) * 0.2);
        lay(1.2 + dome * radius * 0.75, grey, grey * 0.97, grey * 0.9, 0.6);
      }
    }
    o.h = h; o.r = clamp(r, 0, 1); o.g = clamp(g, 0, 1); o.b = clamp(b, 0, 1); o.rough = rough;
  }, 1 / (2 * FLOOR_CM));
}

/** bare soil's tile (m) and its pixels' size (cm) */
const SOIL_TILE = 3;
const SOIL_CM = SOIL_TILE * 100 / 512;

/**
 * Bare earth (3 m a tile, heights in cm): the forest floor's clumpy soil without its litter, crumbs over it, darker
 * where it's damp, and grit, small stones 0.5 to 2 cm across poking out of it. Where the crypt's dead trees grow
 * (`crypt.ts`): the forest floor's photo was fallen leaves, and in the crypt "they cannot come from anywhere".
 */
function soil(): PBRData {
  const clods = makeFbm(61, 16, 4), crumbs = makeFbm(67, 128, 2), cracks = makeFbm(71, 48, 3);
  const gritCells = 96;
  const grit = makeScatter(73, gritCells, 0.15);
  const size = SOIL_TILE * 100 / gritCells;
  return buildPBR(512, (u, v, o) => {
    const s = clods(u, v), c = crumbs(u, v);
    // (dried into clods: a dark seam where the fbm's ridges meet)
    const seam = Math.max(0, 1 - Math.abs(cracks(u, v) - 0.5) / 0.03);
    let h = s * 1.6 + c * 0.5 - seam * 0.6;
    const damp = smooth(clamp((s - 0.55) / 0.2, 0, 1));
    const k = (0.75 + c * 0.5) * (1 - damp * 0.3) * (1 - seam * 0.35);
    let r = 0.13 * k, g = 0.095 * k, b = 0.065 * k, rough = 0.95 - damp * 0.15;
    const near = grit.near(u, v);
    for (let j = 0; j < near.count; j++) {
      const key = near.k[j], radius = 0.25 + grit.size[key] * 0.75;
      const px = -near.dx[j] * size, py = -near.dy[j] * size;
      const d = Math.hypot(px, py);
      if (d >= radius) continue;
      const dome = Math.sqrt(1 - (d / radius) ** 2), top = 1.1 + dome * radius * 0.6;
      if (top <= h) continue;
      const grey = (0.13 + grit.id[key] * 0.08) * (0.85 + dome * 0.25);
      h = top; r = grey; g = grey * 0.96; b = grey * 0.9; rough = 0.7;
    }
    o.h = h; o.r = clamp(r, 0, 1); o.g = clamp(g, 0, 1); o.b = clamp(b, 0, 1); o.rough = rough;
  }, 1 / SOIL_CM);
}

/** bark's furrows round a tile, and its plates' cells along it (each six furrows' widths long, sdf's) */
const BARK_AROUND = 12;
const BARK_ALONG = 2;
/** sdf's carved bark (#7a6b5a, in its furrows #2e241b), darkened to the arena's */
const BARK = [0.15, 0.132, 0.11] as const;
const BARK_FURROW = [0.055, 0.042, 0.032] as const;

// --- photos: a recipe may take its colours from a picture (core/photos/), decoded where the recipe runs (a worker,
// or the page) before it runs: `photosFor`.

/** the pictures recipes take, by name: each a square that tiles, `margin` pixels of it wrapped round each edge
 *  outside the square (lossy coding steps at a picture's edges, where it can't see the other side: a seam in a
 *  ground's height). */
const PHOTO_FILES = {
  oakBark: { url: new URL('./photos/oak-bark.webp', import.meta.url).href, margin: 0 },
  forestLeaves: { url: new URL('./photos/forest-leaves.webp', import.meta.url).href, margin: 5 },
  forestLeavesHeight: { url: new URL('./photos/forest-leaves-height.webp', import.meta.url).href, margin: 5 },
  cobblestone: { url: new URL('./photos/cobblestone.webp', import.meta.url).href, margin: 5 },
  cobblestoneHeight: { url: new URL('./photos/cobblestone-height.webp', import.meta.url).href, margin: 5 },
};
type PhotoName = keyof typeof PHOTO_FILES;
interface Photo { size: number; rgba: Uint8ClampedArray }
/** the photos decoded here, by name */
const photos = new Map<PhotoName, Photo>();

/** A picture's pixels inside its margin, decoded off the DOM (OffscreenCanvas: a worker has no document). */
async function decode(url: string, margin: number): Promise<Photo> {
  const bitmap = await createImageBitmap(await (await fetch(url)).blob());
  const size = bitmap.width - 2 * margin;
  const context = new OffscreenCanvas(size, size).getContext('2d')!;
  context.drawImage(bitmap, -margin, -margin);
  bitmap.close(); // (a closed bitmap's width reads 0)
  return { size, rgba: context.getImageData(0, 0, size, size).data };
}

/** the brightness a photo's height is taken from (sdf-harness's weights) */
const PHOTO_LUMA = [0.3, 0.55, 0.15] as const;
/** the oak bark photo's albedo, its mean brightness scaled to this: the forest's light was set for bark this dark
 *  (sdf's carved bark's, procedural, 0.134) */
const BARK_PHOTO_MEAN = 0.16;

/**
 * Oak bark from sdf-harness's oak photo (its `bark` preset; core/photos/oak-bark.webp): its colours darkened to the
 * forest's light, its brightness the height (smoothed a pixel each way: its grain is the colour's, not the shading's),
 * rougher down the furrows. Its furrows run down the picture, along v as a trunk's do.
 */
function photoBark(photo: Photo): PBRData {
  const n = photo.size, rgba = photo.rgba, luma = new Float32Array(n * n);
  let mean = 0;
  for (let i = 0; i < n * n; i++) {
    luma[i] = (PHOTO_LUMA[0] * rgba[i * 4] + PHOTO_LUMA[1] * rgba[i * 4 + 1] + PHOTO_LUMA[2] * rgba[i * 4 + 2]) / 255;
    mean += luma[i];
  }
  const k = BARK_PHOTO_MEAN / (mean / (n * n)), at = (x: number, y: number): number => luma[((y + n) % n) * n + ((x + n) % n)];
  return buildPBR(n, (u, v, o) => {
    const x = Math.round(u * n), y = Math.round(v * n), i = (y * n + x) * 4;
    let h = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) h += at(x + dx, y + dy);
    o.h = h / 9;
    o.r = clamp((rgba[i] / 255) * k, 0, 1); o.g = clamp((rgba[i + 1] / 255) * k, 0, 1); o.b = clamp((rgba[i + 2] / 255) * k, 0, 1);
    o.rough = clamp(0.8 + (1 - o.h) * 0.18, 0, 1);
  }, 6);
}

/** Tree bark (the forest's trunks, stumps, logs and roots, the crypt's dead wood, the thornlings, treants and
 *  sporecallers): the oak photo where it was decoded (`photosFor`), else sdf's carved bark. */
function bark(): PBRData {
  const photo = photos.get('oakBark');
  return photo ? photoBark(photo) : carvedBark();
}

/** the forest floor's and the crypt's cobbles' photos' brightness: the procedural maps' they stand in for (`lab maps`),
 *  as each biome's light was set for them */
const FLOOR_PHOTO_MEAN = 0.174;
const COBBLE_PHOTO_MEAN = 0.111;

/**
 * A ground from a photo's colours and its scanned height (each a tile, of a size): the colours scaled to `mean`
 * brightness, the roughness `rough` of the height (0 to 1).
 */
function photoGround(colour: Photo, height: Photo, mean: number, rough: (h: number) => number, bumps: number): PBRData {
  const n = colour.size, rgba = colour.rgba, heights = height.rgba, m = height.size;
  let sum = 0;
  for (let i = 0; i < n * n; i++) {
    sum += (PHOTO_LUMA[0] * rgba[i * 4] + PHOTO_LUMA[1] * rgba[i * 4 + 1] + PHOTO_LUMA[2] * rgba[i * 4 + 2]) / 255;
  }
  const k = mean / (sum / (n * n));
  return buildPBR(n, (u, v, o) => {
    const i = (Math.round(v * n) * n + Math.round(u * n)) * 4;
    o.h = heights[(Math.floor(v * m) * m + Math.floor(u * m)) * 4] / 255;
    o.r = clamp((rgba[i] / 255) * k, 0, 1); o.g = clamp((rgba[i + 1] / 255) * k, 0, 1); o.b = clamp((rgba[i + 2] / 255) * k, 0, 1);
    o.rough = rough(o.h);
  }, bumps);
}

/** The forest floor: Poly Haven's Leaves Forest Ground (CC0, core/photos/), fallen leaves over soil, drier on the
 *  leaves' tops; else the litter painted here (`litterFloor`). */
function forestFloor(): PBRData {
  const colour = photos.get('forestLeaves'), height = photos.get('forestLeavesHeight');
  return colour && height ? photoGround(colour, height, FLOOR_PHOTO_MEAN, (h) => 0.95 - 0.12 * h, 8) : litterFloor();
}

/** The crypt's cobbles: Poly Haven's Cobblestone Floor 04 (CC0, core/photos/), rounded cobbles in earthy joints,
 *  their tops worn smoother; else the cobbles made here (`cellCobbles`). */
function cobblestone(): PBRData {
  const colour = photos.get('cobblestone'), height = photos.get('cobblestoneHeight');
  return colour && height ? photoGround(colour, height, COBBLE_PHOTO_MEAN, (h) => 0.9 - 0.4 * h, 10) : cellCobbles();
}

/**
 * Carved bark (`bark` without its photo: no worker, or one asked for before its photo came): sdf-harness's carved
 * oak bark (`reliefBark`, matched against studio pictures), in a tile. Long
 * plates between wandering furrows (cells six furrows' widths long, `BARK_AROUND` round a tile and `BARK_ALONG`
 * along it), the furrow's walls stepped; each plate broken into blocks of their own heights along it, notched where
 * they part, cracked across and along, lumped and crumbled. Dark down the furrows, the plates' tops lighter. v runs
 * along the trunk. (sdf's blocks every 1.8 furrows' widths and its cracks 2.3 a block are 2 and 7/3 here, whole
 * numbers of each along a tile.)
 */
function carvedBark(): PBRData {
  const U = BARK_AROUND, R = BARK_ALONG, L = R * 6, blocks = L / 2;
  // a plate's point in its cell (furrows round, cells along), as sdf's: its offsets in the cell, made once
  const offsetU = new Float32Array(U * R), offsetV = new Float32Array(U * R);
  for (let cv = 0; cv < R; cv++) for (let cu = 0; cu < U; cu++) {
    offsetU[cv * U + cu] = 0.5 + 0.8 * (hash3(cu + 8, cv + 8, 8) - 0.5);
    offsetV[cv * U + cu] = 0.5 + 0.8 * (hash3(cu + 16, cv + 16, 16) - 0.5);
  }
  const pointU = (cu: number, cv: number): number => cu + offsetU[wrap(cv, R) * U + wrap(cu, U)];
  const pointV = (cu: number, cv: number): number => cv + offsetV[wrap(cv, R) * U + wrap(cu, U)];
  // sdf's noises at the point scaled by `k` (a cell a furrow's width; along the trunk a quarter of that where `quarter`)
  const field = (k: number, quarter: boolean, salt: number): Field => {
    return latticeNoise(Math.round(U * k), Math.max(1, Math.round(L * k * (quarter ? 0.25 : 1))), salt);
  };
  const warpU = field(1.2, true, 2), warpV = field(1.2, true, 9), walls = field(7, false, 13), slant = field(3, true, 44);
  const across = field(5, true, 71), along = field(4, true, 77), crumbs = field(10, false, 5), patches = field(1.5, false, 90);
  const floorAt = field(2, true, 23), lumpsAt = latticeFbm(U * 5, L * 5, 3), broad = latticeNoise(Math.round(U * 0.35), 1, 61);
  return buildPBR(512, (u, v, o) => {
    const x = u * U + 0.5 * (warpU(u, v) - 0.5), y = (v * L) / 6 + 0.3 * (warpV(u, v) - 0.5);
    const iu = Math.floor(x), iv = Math.floor(y);
    let near = 1e9, cu = 0, cv = 0, pu = 0, pv = 0;
    for (let k = 0; k < 9; k++) {
      const qu = iu + (k % 3) - 1, qv = iv + Math.floor(k / 3) - 1, au = pointU(qu, qv), av = pointV(qu, qv);
      const d = (x - au) * (x - au) + (y - av) * (y - av);
      if (d < near) { near = d; cu = qu; cv = qv; pu = au; pv = av; }
    }
    // how far into the plate: to the nearest of the lines halfway to each next plate's point
    let ed = 1e9;
    for (let k = 0; k < 9; k++) {
      if (k === 4) continue;
      const du = pointU(cu + (k % 3) - 1, cv + Math.floor(k / 3) - 1) - pu, dv = pointV(cu + (k % 3) - 1, cv + Math.floor(k / 3) - 1) - pv;
      ed = Math.min(ed, ((pu + 0.5 * du - x) * du + (pv + 0.5 * dv - y) * dv) / Math.sqrt(du * du + (dv * dv) / 36));
    }
    const id0 = wrap(cu, U), id1 = wrap(cv, R);
    ed = Math.max(ed, 0) * (0.7 + 0.6 * walls(u, v));
    const wall = 0.15 * clamp(ed / 0.07, 0, 1) + 0.75 * smoothstep(0.07, 0.15, ed) + 0.1 * clamp((ed - 0.15) / 0.1, 0, 1);
    const bl = v * L * 0.5 + 3 * hash3(id0 + 40, id1 + 40, 40) + 0.6 * (hash3(id0 + 42, id1 + 42, 42) - 0.5) * (x - pu) + 0.4 * slant(u, v);
    const fb = fract(bl), block = wrap(Math.floor(bl), blocks);
    const hb = (s: number): number => hash3(id0 + s, id1 + s, block + s);
    const notch = smoothstep(0, 0.1, Math.min(fb, 1 - fb));
    const f3 = fract(bl * 7 / 3 + 0.4 * across(u, v)), f4 = fract(u * U * 2 + 0.5 * along(u, v));
    const chunks = (1 - 0.3 * (1 - smoothstep(0, 0.08, Math.min(f3, 1 - f3)))) * (1 - 0.25 * (1 - smoothstep(0, 0.1, Math.min(f4, 1 - f4))));
    const lumps = lumpsAt(u, v);
    const crumb = (1 - Math.abs(2 * crumbs(u, v) - 1)) * smoothstep(0.3, 0.7, patches(u, v));
    const top = (0.5 + 0.5 * hb(48) + 0.15 * (fb - 0.5) * (2 * hb(52) - 1)) * (1 - 0.35 * lumps - 0.22 * crumb) * chunks;
    const floor0 = 0.1 * floorAt(u, v) + 0.2 * lumps + 0.1 * crumb;
    const shared = mix(0.15, 0.6, hash3(id0 + 56, id1 + 56, wrap(Math.floor(bl + 0.5), blocks) + 56)) * (1 - 0.35 * lumps);
    let h = floor0 + (shared + (top - shared) * notch - floor0) * wall;
    h = 1.35 * h * (0.85 + 0.15 * broad(u, v));
    h = h < 0.75 ? h : 1 - 0.25 * Math.exp(-(h - 0.75) / 0.25);
    // sdf's bark's colour: its furrows' where it's low, the plates' tinted by their block and lighter up their sides
    const f = 1 - smoothstep(0.05, 0.22, h), k = (1 + 0.2 * (hb(24) - 0.5)) * mix(0.5, 1.15, smoothstep(0.15, 0.55, h));
    o.h = h;
    o.r = mix(BARK[0] * k, BARK_FURROW[0], f); o.g = mix(BARK[1] * k, BARK_FURROW[1], f); o.b = mix(BARK[2] * k, BARK_FURROW[2], f);
    o.rough = clamp(mix(0.86, 0.97, f) + (lumps - 0.5) * 0.1, 0, 1);
  }, 4);
}

// --- the heroes' materials. Their albedo is neutral (a light grey with the pattern's shading), so the
// material's colour tints it: one map serves every leather, cloth or steel of any hue.

/** Worn leather: a fine pebbled grain, soft creases, scuffed lighter patches and a few scratches. */
function leather(): PBRData {
  const grain = makeVoronoi(131, 90);
  const crease = makeFbm(137, 6, 4), wear = makeFbm(139, 3, 4), scratch = makeFbm(141, 24, 2);
  return buildPBR(512, (u, v, o) => {
    const g = grain(u, v), pebble = smooth(clamp((g.f2 - g.f1) / 0.35, 0, 1));
    const c = crease(u, v), line = clamp(1 - Math.abs(c - 0.5) * 22, 0, 1);
    const w = smooth(clamp((wear(u, v) - 0.45) / 0.3, 0, 1));
    const s = clamp(1 - Math.abs(scratch(u * 0.3, v * 3) - 0.5) * 60, 0, 1) * 0.6;
    o.h = pebble * 0.35 - line * 0.2 - s * 0.3;
    const k = 0.62 + pebble * 0.1 - line * 0.08 + w * 0.3 + s * 0.2 + (g.id - 0.5) * 0.05;
    o.r = o.g = o.b = clamp(k, 0, 1);
    o.rough = clamp(0.78 - w * 0.25 - pebble * 0.08 + line * 0.15, 0.3, 1);
  }, 3);
}

/** the lines a bare skin's map has across v in a tile, and how far each may wander along (in lines: at 8 they ran
 *  every way, down a finger's length as often as across it) */
const SKIN_LINES = 40;
const SKIN_WANDER = 2.5;

/**
 * Bare skin (the fingers a glove leaves bare): fine wrinkles across v, gathered in patches and fading out between them,
 * a faint web of finer creases and pores under them, a little mottle; near white, tinted by the material's colour (or
 * the vertices'). On the hands' sculpt a finger's length runs along v in its side views (models/triplanar.ts), so the
 * lines cross it as a finger's wrinkles do. Smooth and even, the fingers read as plastic (#425). 256 px: seen on a
 * hand's few pixels, a larger map was memory a low-end device spent for nothing.
 */
function skin(): PBRData {
  const wander = makeFbm(301, 4, 3), patch = makeFbm(303, 3, 3), fade = makeFbm(307, 8, 2);
  const web = makeFbm(311, 16, 2), pore = makeFbm(317, 64, 1), mottle = makeFbm(319, 4, 3);
  return buildPBR(256, (u, v, o) => {
    const along = v * SKIN_LINES + (wander(u, v) - 0.5) * SKIN_WANDER;
    const off = along - Math.floor(along);
    const groove = clamp(1 - Math.min(off, 1 - off) / 0.1, 0, 1) ** 2;
    const wrinkle = groove * smooth(clamp((patch(u, v) - 0.38) / 0.3, 0, 1)) * (0.3 + 0.7 * fade(u, v));
    const crease = clamp(1 - Math.abs(web(u, v) - 0.5) * 16, 0, 1);
    const hole = clamp((pore(u, v) - 0.62) / 0.18, 0, 1);
    const m = mottle(u, v) - 0.5;
    o.h = 0.5 - wrinkle * 0.5 - crease * 0.12 - hole * 0.08;
    o.r = o.g = o.b = clamp(0.96 - wrinkle * 0.18 - crease * 0.03 - hole * 0.03 + m * 0.08, 0, 1);
    // (a share of the material's roughness: duller in the lines and pores)
    o.rough = clamp(0.86 + wrinkle * 0.14 + hole * 0.1 + m * 0.08, 0.6, 1);
  }, 2);
}

/** Oiled leather (the ranger's boots, belt and straps): smooth under a faint grain, long soft creases and finer wrinkles
 *  running across v (round a boot's shaft, along u), darker and duller in them, lighter scuffs where it rubs, and a sheen
 *  elsewhere. (The pebbled hide read as snakeskin at a hero's size.) */
function oiled(): PBRData {
  const grain = makeFbm(191, 128, 2), crease = makeFbm(193, 4, 4), wrinkle = makeFbm(197, 12, 3), wear = makeFbm(199, 3, 4), blot = makeFbm(201, 6, 3);
  return buildPBR(512, (u, v, o) => {
    const g = grain(u, v), c = crease(u, v * 3), cl = clamp(1 - Math.abs(c - 0.5) * 12, 0, 1) ** 1.5;
    const wk = wrinkle(u, v * 4), wl = clamp(1 - Math.abs(wk - 0.5) * 9, 0, 1) ** 2;
    const w = smooth(clamp((wear(u, v) - 0.5) / 0.22, 0, 1)), b = blot(u, v);
    o.h = 0.5 - cl * 0.22 - wl * 0.12 + (g - 0.5) * 0.08;
    o.r = o.g = o.b = clamp(0.6 - cl * 0.09 - wl * 0.04 + w * 0.2 + (b - 0.5) * 0.14 + (g - 0.5) * 0.04, 0, 1);
    o.rough = clamp(0.45 + cl * 0.2 + wl * 0.08 + w * 0.2 + (g - 0.5) * 0.12, 0.25, 1);
  }, 2);
}

/** Polished bow wood (the ranger's limbs and riser): fine straight grain along v, its latewood lines narrow, darker and
 *  gently wavering, a soft figure through it, under a lacquer; neutral, tinted by the material's (or the vertices') colour.
 *  (The weathered wood's warped streaks read as bark on a bow, and its brown under a tint went black.) */
function bowWood(): PBRData {
  const wave = makeFbm(223, 3, 3), fig = makeFbm(227, 6, 4), fine = makeFbm(229, 96, 2);
  return buildPBR(512, (u, v, o) => {
    const x = (u + (wave(u, v) - 0.5) * 0.1) * 48, ring = x - Math.floor(x);
    const late = smooth(clamp((ring - 0.76) / 0.08, 0, 1)) * (1 - smooth(clamp((ring - 0.93) / 0.06, 0, 1)));
    const f = fig(u, v), n = fine(u, v);
    o.h = 0.5 - late * 0.3 + (n - 0.5) * 0.06;
    o.r = o.g = o.b = clamp(0.8 - late * 0.24 + (f - 0.5) * 0.18 + (n - 0.5) * 0.05, 0, 1);
    o.rough = clamp(0.38 + late * 0.14 + (n - 0.5) * 0.06, 0, 1);
  }, 1.2);
}

/** Woollen cloth (the ranger's coat and trousers): a fine plain weave under a heathered surface, flecks of lighter and
 *  darker fibre in it and a soft mottle of the dye. (The twill's regular diagonal ribs read as synthetic.) */
function wool(): PBRData {
  const mottle = makeFbm(211, 5, 4), fleck = makeFbm(213, 128, 2), fuzz = makeFbm(217, 64, 3);
  const T = 192;
  return buildPBR(512, (u, v, o) => {
    const weave = 0.5 + 0.5 * Math.sin(u * T * Math.PI * 2) * Math.sin(v * T * Math.PI * 2), m = mottle(u, v), fz = fuzz(u, v), fl = fleck(u, v);
    const light = smooth(clamp((fl - 0.64) / 0.08, 0, 1)), dark = smooth(clamp((0.36 - fl) / 0.08, 0, 1));
    o.h = weave * 0.3 + fz * 0.45 + m * 0.25;
    o.r = o.g = o.b = clamp(0.7 + (m - 0.5) * 0.2 + light * 0.14 - dark * 0.14 + (fz - 0.5) * 0.08 + weave * 0.03, 0, 1);
    o.rough = 0.93 + (fz - 0.5) * 0.08;
  }, 1.4);
}

/** Felt (the ranger's hat): no weave, matted fibre, a soft mottle and fine fuzz. */
function felt(): PBRData {
  const mottle = makeFbm(221, 6, 4), fuzz = makeFbm(223, 96, 3), clump = makeFbm(227, 24, 3);
  return buildPBR(512, (u, v, o) => {
    const m = mottle(u, v), fz = fuzz(u, v), c = clump(u, v);
    o.h = fz * 0.5 + c * 0.35 + m * 0.15;
    o.r = o.g = o.b = clamp(0.7 + (m - 0.5) * 0.16 + (c - 0.5) * 0.14 + (fz - 0.5) * 0.12, 0, 1);
    o.rough = 0.97;
  }, 1.1);
}

/** Riveted mail: rows of interlocking rings (each row half a ring over), dark between them. */
function mail(): PBRData {
  const rows = 32, fbm = makeFbm(151, 8, 3);
  return buildPBR(512, (u, v, o) => {
    let h = 0;
    for (let dy = -1; dy <= 1; dy++) {
      const ry = Math.floor(v * rows) + dy, shift = (ry & 1) * 0.5;
      for (let dx = -1; dx <= 1; dx++) {
        const rx = Math.floor(u * rows - shift) + dx;
        const cx = (rx + 0.5 + shift) / rows, cy = (ry + 0.5) / rows;
        // rings a little taller than wide, overlapping their neighbours; the lower one on top
        const d = Math.hypot((u - cx) * rows, (v - cy) * rows * 0.85);
        const ring = clamp(1 - Math.abs(d - 0.52) / 0.2, 0, 1);
        h = Math.max(h, Math.sqrt(ring) * (0.8 + 0.2 * (dy + 1) / 2));
      }
    }
    const n = fbm(u, v);
    o.h = h;
    o.r = o.g = o.b = clamp(0.08 + h * (0.72 + (n - 0.5) * 0.3), 0, 1);
    o.rough = clamp(0.95 - h * 0.55 + (n - 0.5) * 0.15, 0.25, 1);
  }, 5);
}

/** Wool twill: fine diagonal ribs over threads, with a little uneven dye. */
function cloth(): PBRData {
  const fbm = makeFbm(161, 4, 4), fine = makeFbm(163, 64, 2);
  const threads = 96;
  return buildPBR(512, (u, v, o) => {
    const twill = 0.5 + 0.5 * Math.sin((u + v) * threads * Math.PI);
    const warp = 0.5 + 0.5 * Math.sin(u * threads * 2 * Math.PI), f = fine(u, v), n = fbm(u, v);
    o.h = twill * 0.6 + warp * 0.2 + f * 0.2;
    o.r = o.g = o.b = clamp(0.72 + twill * 0.12 + (n - 0.5) * 0.25 + (f - 0.5) * 0.1, 0, 1);
    o.rough = 0.9 + (f - 0.5) * 0.1;
  }, 1.5);
}

/** a hammered steel's dents across a tile */
const STEEL_DENTS = 12;

/**
 * Worn steel (the heroes' plate, blades and gold): hammered after sdf-harness's hammered pewter, each dent dished (its
 * height the square of the distance to its point, 0.75 of a cell out: flat-bottomed, ridged between) with its own
 * shade (within 3%: sdf's 0.1, within 5%, read as patches) and sheen; brushed along u after its brushed steel (fractal noise 30 times finer across
 * the brushing than along it, 0.3 of it); long scratches; grime settled in the dents. Neutral, tinted by the
 * material's colour.
 */
function steel(): PBRData {
  const grime = makeFbm(177, 4, 5), c: Cells = { f1: 0, f2: 0, id: 0, cx: 0, cy: 0 };
  const dents = latticeCells(STEEL_DENTS, STEEL_DENTS, 0.7, 171), brush = latticeFbm(4, 120, 173), scratches = latticeFbm(6, 40, 179);
  return buildPBR(512, (u, v, o) => {
    dents(u, v, c);
    const r = Math.min(c.f1 / 0.75, 1), dish = r * r;
    const brushed = clamp(0.5 + (brush(u, v) - 0.5) * 4 * 0.3, 0, 1) - 0.5;
    const s = clamp(1 - Math.abs(scratches(u, v) - 0.5) * 70, 0, 1);
    const gr = smooth(clamp((grime(u, v) - 0.42) / 0.35, 0, 1));
    o.h = dish * 0.5 + brushed * 0.08 - s * 0.15;
    o.r = o.g = o.b = clamp(0.78 + brushed * 0.12 + (c.id - 0.5) * 0.06 - gr * 0.4 * (1 - dish * 0.5) + s * 0.2, 0, 1);
    o.rough = clamp(0.32 + gr * 0.4 + brushed * 0.24 + (c.id - 0.5) * 0.08 - s * 0.12, 0.12, 1);
  }, 1.5);
}

/** Fur: long streaks of hair along v, darker at the roots between tufts. */
function fur(): PBRData {
  const tuft = makeFbm(181, 6, 3);
  // (a hair 96 across a tile and 8 along it, and an octave finer: 0.08 along, as it was, didn't tile)
  const hairs = latticeNoise(96, 8, 183), finer = latticeNoise(192, 16, 184);
  const hair = (u: number, v: number): number => (hairs(u, v) * 2 + finer(u, v)) / 3;
  return buildPBR(256, (u, v, o) => {
    const t = tuft(u, v), s = hair(u, v);
    o.h = s * 0.7 + t * 0.3;
    o.r = o.g = o.b = clamp(0.35 + s * 0.55 + (t - 0.5) * 0.4, 0, 1);
    o.rough = 0.95;
  }, 3);
}

/** Every recipe, by name; its arguments are part of what it makes. */
export const RECIPES = { cobblestone, ashlar, flagstone, marble, slate, rock, granite, limestone, moss, grunge, wood, burlap, forestFloor, soil, bark, leather, oiled, skin, wool, felt, mail, cloth, steel, fur, bowWood, face: faceData };
export type RecipeName = keyof typeof RECIPES;
export type RecipeArgs<N extends RecipeName> = Parameters<(typeof RECIPES)[N]>;
export const recipeKey = (name: RecipeName, args: readonly unknown[]): string => `${name}(${args.join(',')})`;

/** the photos each recipe takes (`photosFor`) */
const PHOTOS_OF: Partial<Record<RecipeName, PhotoName[]>> = {
  bark: ['oakBark'],
  forestFloor: ['forestLeaves', 'forestLeavesHeight'],
  cobblestone: ['cobblestone', 'cobblestoneHeight'],
};

/** Resolved once the photos `name`'s recipe takes are decoded here, for it to run; a photo that fails is left out
 *  (its recipe makes its procedural map). */
export async function photosFor(name: RecipeName): Promise<void> {
  const wanted = (PHOTOS_OF[name] ?? []).filter((photo) => !photos.has(photo));
  await Promise.all(wanted.map(async (photo) => {
    const file = PHOTO_FILES[photo];
    try { photos.set(photo, await decode(file.url, file.margin)); } catch { /* its recipe's procedural map */ }
  }));
}

/**
 * The maps the game uses, made in workers during loading. Anything missing here is still made on
 * the main thread when first asked for, so keep this in step with the calls (a miss is only slower).
 */
export const PRELOAD: { [N in RecipeName]: [N, RecipeArgs<N>] }[RecipeName][] = [
  // steel first, as the heroes' engraving is painted over it as they're built (the others are only drawn); then the
  // longest first, so the workers finish together (handed out in the lobby's order: core/textures.ts
  // `inTheLobbysOrder`, the hero it shows his face first)
  ['steel', []],
  ['face', ['warrior']], ['face', ['mage']], ['face', ['ranger']],
  ['rock', [17]], ['marble', [33, 5]], ['cobblestone', []], ['slate', [33, 2, 2]], ['bark', []], ['forestFloor', []], ['soil', []],
  ['flagstone', [47, 5]], ['moss', [5]], ['granite', [7]], ['limestone', [11]], ['ashlar', [33, 2, 2]], ['ashlar', [21, 6, 3]], ['grunge', []], ['wood', []], ['burlap', []],
  ['leather', []], ['oiled', []], ['skin', []], ['wool', []], ['felt', []], ['mail', []], ['cloth', []], ['fur', []], ['bowWood', []],
];
