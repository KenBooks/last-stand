// Enemy navigation: a flow field over the arena floor, so enemies walk around obstacles to reach
// the player instead of pushing into a pillar that stands between them.
// The floor is a grid; each cell knows its clearance (distance to the nearest obstacle or the arena
// edge). For each size of enemy, a Dijkstra from the player's position gives every cell its path
// length to the player, over the cells wide enough for that size. An enemy steers at the furthest
// cell along its descending path that it can see in a straight line, which gives smooth lines
// hugging the obstacles rather than grid steps. With a clear line to the player it walks straight.
// Paths keep a margin off every obstacle, and `steerClear` bends any other movement (flanking,
// strafing, backing off) round what's ahead before touching it, so enemies never bump and slide.
import { G } from '../state';
import type { Obstacle } from '../types';
import { state as propState } from './destructible';

/** cell size (m), and how often a field follows the player (s) */
const CELL = 0.5, REFRESH = 0.2;
/** the gap kept between a body and an obstacle when planning (m) */
export const MARGIN = 0.25;
/** how many cells ahead the path is looked along for a straight-line waypoint */
const LOOKAHEAD = 20;
/** bodies share the field of the smallest size class that holds them (fewer fields to keep fresh) */
const SIZES = [0.65, 1.05];

interface Grid { obstacles: Obstacle[]; rev: number; n: number; half: number; clear: Float32Array; steps: Int32Array; weights: Float32Array; sideX: Int32Array; sideZ: Int32Array }
interface Field { r: number; open: Uint8Array; cost: Float32Array; t: number; cell: number }

let grid: Grid | null = null;
const fields = new Map<number, Field>();
let rebuiltAt = -1;

/** The fields let go, as a run starts: each is found again as its foes first ask, as on a run's first frames
 *  (stamped by the game's clock, a field kept from the last run read as fresh where the lab's set-up moves the clock
 *  back, and its foes walked otherwise than on a page booted for it). */
export function forgetFields(): void {
  fields.clear();
  rebuiltAt = -1;
}

/** The clearance grid of the current biome (rebuilt when the biome's obstacles change). */
function getGrid(): Grid {
  const obstacles = G.arena.obstacles;
  if (grid?.obstacles === obstacles && grid.rev === propState.rev) return grid;
  // the outermost cells lie beyond the wall, so they're never open: no bounds checks needed
  const wall = G.arena.wall, n = Math.ceil((2 * wall.most) / CELL) + 2, half = (n * CELL) / 2;
  const clear = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = (i + 0.5) * CELL - half, z = (j + 0.5) * CELL - half;
    let c = wall.reachAt(x, z) - Math.hypot(x, z);
    for (const o of obstacles) c = Math.min(c, Math.hypot(x - o.x, z - o.z) - o.r);
    clear[j * n + i] = c;
  }
  // the 8 neighbours; a diagonal step's two side cells are sideX[k] and sideZ[k] away
  const steps = new Int32Array([1, -1, n, -n, n + 1, n - 1, -n + 1, -n - 1]);
  const sideX = new Int32Array([0, 0, 0, 0, 1, -1, 1, -1]), sideZ = new Int32Array([0, 0, 0, 0, n, n, -n, -n]);
  const weights = new Float32Array([1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2].map((w) => w * CELL));
  fields.clear();
  return (grid = { obstacles, rev: propState.rev, n, half, clear, steps, weights, sideX, sideZ });
}

const cellOf = (g: Grid, x: number, z: number): number => {
  const i = Math.min(g.n - 1, Math.max(0, Math.floor((x + g.half) / CELL)));
  const j = Math.min(g.n - 1, Math.max(0, Math.floor((z + g.half) / CELL)));
  return j * g.n + i;
};
const cx = (g: Grid, c: number): number => ((c % g.n) + 0.5) * CELL - g.half;
const cz = (g: Grid, c: number): number => (Math.floor(c / g.n) + 0.5) * CELL - g.half;

/** Is the straight line from a to b clear of obstacles for a body of this radius? `above`: the line
 *  runs at that height (a shot), so obstacles whose top is lower don't block it. */
export function lineClear(ax: number, az: number, bx: number, bz: number, radius: number, above = -Infinity): boolean {
  const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
  for (const o of G.arena.obstacles) {
    if (o.h <= above) continue;
    const k = len2 > 1e-9 ? Math.min(1, Math.max(0, ((o.x - ax) * dx + (o.z - az) * dz) / len2)) : 0;
    const px = ax + dx * k - o.x, pz = az + dz * k - o.z, r = o.r + radius;
    if (px * px + pz * pz < r * r) return false;
  }
  return true;
}

// a binary min-heap of cells keyed by cost, reused between fields
let heap = new Int32Array(4096), hsize = 0;
function push(cost: Float32Array, c: number): void {
  if (hsize === heap.length) { const h = new Int32Array(hsize * 2); h.set(heap); heap = h; }
  const v = cost[c];
  let i = hsize++;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (cost[heap[p]] <= v) break;
    heap[i] = heap[p]; i = p;
  }
  heap[i] = c;
}
function pop(cost: Float32Array): number {
  const top = heap[0], last = heap[--hsize], v = cost[last];
  let i = 0;
  for (;;) {
    let m = 2 * i + 1;
    if (m >= hsize) break;
    if (m + 1 < hsize && cost[heap[m + 1]] < cost[heap[m]]) m++;
    if (cost[heap[m]] >= v) break;
    heap[i] = heap[m]; i = m;
  }
  heap[i] = last;
  return top;
}

/** Path lengths to (tx, tz) for bodies up to radius `r`, over the cells wide enough for them.
 *  Each co-op player (`slot`) has fields of their own, as enemies go for either. */
function getField(g: Grid, r: number, tx: number, tz: number, slot: number): Field {
  const size = SIZES.find((s) => r <= s) ?? r;
  const key = Math.round(size * 100) + slot * 1000, target = cellOf(g, tx, tz);
  let f = fields.get(key);
  // at most one field is rebuilt per frame (a couple of ms each): the others wait their turn
  if (f && (f.cell === target || G.time - f.t < REFRESH || rebuiltAt === G.time)) return f;
  rebuiltAt = G.time;
  if (!f) {
    const open = new Uint8Array(g.n * g.n);
    for (let c = 0; c < open.length; c++) open[c] = g.clear[c] >= size + MARGIN * 0.5 ? 1 : 0;
    f = { r: size, open, cost: new Float32Array(g.n * g.n), t: 0, cell: -1 };
    fields.set(key, f);
  }
  const { open, cost } = f, { n, steps, weights, sideX, sideZ } = g;
  cost.fill(Infinity);
  // seeded from the cells around the player that this body fits in (the player may stand closer
  // to a pillar than a big enemy can), each at its straight distance
  const reach = Math.ceil((size + 1.5) / CELL), ti = target % n, tj = Math.floor(target / n);
  hsize = 0;
  for (let j = Math.max(0, tj - reach); j <= Math.min(n - 1, tj + reach); j++) {
    for (let i = Math.max(0, ti - reach); i <= Math.min(n - 1, ti + reach); i++) {
      const c = j * n + i;
      if (!open[c]) continue;
      const d = Math.hypot(cx(g, c) - tx, cz(g, c) - tz);
      if (d > size + 1.5 || !lineClear(cx(g, c), cz(g, c), tx, tz, 0.3)) continue;
      cost[c] = d;
      push(cost, c);
    }
  }
  while (hsize > 0) {
    const c = pop(cost), base = cost[c];
    for (let k = 0; k < 8; k++) {
      const nc = c + steps[k];
      if (!open[nc]) continue;
      // diagonals can't cut a blocked corner
      if (k >= 4 && (!open[c + sideX[k]] || !open[c + sideZ[k]])) continue;
      const v = base + weights[k];
      if (v < cost[nc]) { cost[nc] = v; push(cost, nc); }
    }
  }
  f.t = G.time; f.cell = target;
  return f;
}

/**
 * Where a body of radius `r` at (x, z) should head to reach (tx, tz): the target itself when the way
 * is clear, else a waypoint around what's in the way. Writes the waypoint into `out`.
 */
export function navTarget(x: number, z: number, r: number, tx: number, tz: number, slot: number, out: { x: number; z: number }): void {
  out.x = tx; out.z = tz;
  if (lineClear(x, z, tx, tz, r + MARGIN)) return;
  const g = getGrid(), f = getField(g, r, tx, tz, slot), cost = f.cost;

  let c = cellOf(g, x, z);
  // pushed into a cell too narrow for it (against a pillar or the edge): start from the best neighbour
  if (!Number.isFinite(cost[c])) {
    let best = -1, bestCost = Infinity;
    const i = c % g.n, j = Math.floor(c / g.n);
    for (let nj = Math.max(0, j - 2); nj <= Math.min(g.n - 1, j + 2); nj++) {
      for (let ni = Math.max(0, i - 2); ni <= Math.min(g.n - 1, i + 2); ni++) {
        const nc = nj * g.n + ni;
        if (cost[nc] < bestCost) { bestCost = cost[nc]; best = nc; }
      }
    }
    if (best < 0) return;   // nowhere known: fall back to walking straight
    c = best;
  }
  // follow the path downhill, keeping the furthest cell still in plain sight
  let seen = c;
  for (let k = 0; k < LOOKAHEAD; k++) {
    // an open cell is never on the grid's border, so its neighbours are all in the grid
    let next = -1, nextCost = cost[c];
    for (let d = 0; d < 8; d++) {
      const nc = c + g.steps[d];
      if (cost[nc] < nextCost) { nextCost = cost[nc]; next = nc; }
    }
    if (next < 0) break;   // reached the seeded cells round the target
    c = next;
    if (lineClear(x, z, cx(g, c), cz(g, c), r + MARGIN * 0.5)) seen = c;
    else if (k > 3) break;
  }
  out.x = cx(g, seen); out.z = cz(g, seen);
}

/**
 * Bends a heading (ux, uz: unit) round the obstacles within `reach` ahead, onto the tangent of the
 * nearest one in the way (plus the margin), on the side the heading already leans to. It starts
 * turning as soon as an obstacle is within reach, so the curve is smooth and never touches. Near
 * the arena edge the outward part of the heading fades out. Writes the unit heading into `out`. An obstacle `skip`
 * says to (given it and how far ahead its centre is) is passed over: a hero walking to a seat goes round the seat on
 * his own way, and leaves what lies past where he's going.
 */
export function steerClear(x: number, z: number, r: number, ux: number, uz: number, reach: number, out: { x: number; z: number },
  skip?: (o: Obstacle, ahead: number) => boolean): void {
  let last: Obstacle | null = null;
  for (let pass = 0; pass < 3; pass++) {
    let hit: Obstacle | null = null, hitT = Infinity, hitR = 0;
    for (const o of G.arena.obstacles) {
      if (o === last) continue;   // already on its tangent
      const ox = o.x - x, oz = o.z - z, R = o.r + r + MARGIN;
      const t = ox * ux + oz * uz, side = ox * uz - oz * ux;
      if (t <= 0 || t - R > reach || Math.abs(side) >= R || t >= hitT || skip?.(o, t)) continue;
      hit = o; hitT = t; hitR = R;
    }
    if (!hit) break;
    last = hit;
    const ox = hit.x - x, oz = hit.z - z, d = Math.hypot(ox, oz);
    // which way round: the side of the centre the heading already passes on
    const s = ox * uz - oz * ux >= 0 ? 1 : -1;
    // the tangent's angle off the line to the centre; inside the margin, straight round it
    const a = s * (d > hitR ? Math.asin(hitR / d) : Math.PI / 2);
    const c = Math.cos(a), sn = Math.sin(a), bx = ox / d, bz = oz / d;
    ux = bx * c - bz * sn; uz = bx * sn + bz * c;
  }
  // the wall: no pushing on into it
  const rr = Math.hypot(x, z), edge = G.arena.wall.reachAt(x, z) - r;
  if (rr > edge - 2 && rr > 1e-3) {
    const nx = x / rr, nz = z / rr, outward = ux * nx + uz * nz;
    if (outward > 0) {
      const k = Math.min(1, (rr - (edge - 2)) / 2) * outward;
      ux -= nx * k; uz -= nz * k;
      const l = Math.hypot(ux, uz);
      if (l > 1e-4) { ux /= l; uz /= l; }
    }
  }
  out.x = ux; out.z = uz;
}
