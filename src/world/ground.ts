// Height of the walkable arena floor (dais tiers, and what the biome has lying on it to step onto: the forest's
// roots), free of scene code.
import { ARENA } from '../data/balance';

const STEP = 0.18;

/** the floor's heights, highest first */
export const GROUND_LEVELS = [ARENA.daisHeight, STEP, 0];
/** the half sides of the squares the floor's levels lie in (the dais's top, then its step), each the edge between its
 *  level and the next: every level is the same height out to its edge, and drops straight down at it */
export const GROUND_EDGES = [ARENA.daisHalf, ARENA.daisHalf + 0.7];

export function groundHeight(x: number, z: number): number {
  return Math.max(daisAt(Math.max(Math.abs(x), Math.abs(z))), reliefAt(x, z));
}

/** The highest floor any part of a ball `r` across its middle over (x, z) is over: what it rests on, overhanging a
 *  step's edge (the levels' squares are nearer the middle the higher they are). */
export function groundUnder(x: number, z: number, r: number): number {
  return Math.max(daisAt(Math.max(Math.abs(x), Math.abs(z)) - r), reliefAt(x, z));
}

/** What lies on the floor that feet step onto (a biome's: the forest's roots), as the height of its top over a grid
 *  (`cell` m, `n` a side, from `-half` on x and z), 0 where nothing is. */
export interface Relief {
  half: number;
  cell: number;
  n: number;
  heights: Float32Array;
  /** false: no dais in the middle (the village's square is level with its lanes; its floor is its relief alone) */
  dais?: boolean;
}

/** the biome's relief, if it has one (the arena sets it as it switches biome) */
let relief: Relief | null = null;
export function setRelief(r: Relief | null): void {
  relief = r;
}

/** the grid a relief is baked on (m): a root's top, 0.56 m across at its widest, over 4 or more cells */
const RELIEF_CELL = 0.1;

/**
 * The relief of tubes lying on the floor (each a run of samples along it: [x, y, z, radius]): over each cell, the
 * highest top of any tube's section there (its middle's height, and the round of it over the cell's distance from it,
 * between two samples the nearest point between them). Within `half` of the middle.
 */
export function tubesRelief(tubes: [number, number, number, number][][], half: number): Relief {
  const cell = RELIEF_CELL, n = Math.ceil((2 * half) / cell) + 1, heights = new Float32Array(n * n);
  for (const tube of tubes) {
    for (let s = 0; s + 1 < tube.length; s++) layCapsule(tube[s], tube[s + 1], heights, n, cell, half);
  }
  return { half, cell, n, heights };
}

/** One piece of a tube, from sample `a` to `b`, laid into `heights`. */
function layCapsule(a: number[], b: number[], heights: Float32Array, n: number, cell: number, half: number): void {
  const reach = Math.max(a[3], b[3]);
  const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - reach + half) / cell));
  const i1 = Math.min(n - 1, Math.ceil((Math.max(a[0], b[0]) + reach + half) / cell));
  const j0 = Math.max(0, Math.floor((Math.min(a[2], b[2]) - reach + half) / cell));
  const j1 = Math.min(n - 1, Math.ceil((Math.max(a[2], b[2]) + reach + half) / cell));
  const dx = b[0] - a[0], dz = b[2] - a[2], length2 = dx * dx + dz * dz || 1;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = i * cell - half, z = j * cell - half;
    const t = Math.min(1, Math.max(0, ((x - a[0]) * dx + (z - a[2]) * dz) / length2));
    const r = a[3] + (b[3] - a[3]) * t, ox = x - (a[0] + dx * t), oz = z - (a[2] + dz * t), d2 = ox * ox + oz * oz;
    if (d2 >= r * r) continue;
    const top = a[1] + (b[1] - a[1]) * t + Math.sqrt(r * r - d2);
    if (top > heights[j * n + i]) heights[j * n + i] = top;
  }
}

/** the relief's height at (x, z), between the grid's points; 0 off it, or with none */
function reliefAt(x: number, z: number): number {
  if (!relief) return 0;
  const { half, cell, n, heights } = relief;
  const fx = (x + half) / cell, fz = (z + half) / cell;
  if (fx < 0 || fz < 0 || fx >= n - 1 || fz >= n - 1) return 0;
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, at = j * n + i;
  const near = heights[at] + (heights[at + 1] - heights[at]) * u;
  const far = heights[at + n] + (heights[at + n + 1] - heights[at + n]) * u;
  return near + (far - near) * v;
}


/** the dais's level at `m` out from the middle along its squares' axes, where the place has one */
const daisAt = (m: number): number => (relief?.dais === false ? 0 : levelAt(m));

/** the floor's level at `m` out from the middle along the squares' axes */
function levelAt(m: number): number {
  if (m < GROUND_EDGES[0]) return GROUND_LEVELS[0];
  if (m < GROUND_EDGES[1]) return GROUND_LEVELS[1];
  return GROUND_LEVELS[2];
}
