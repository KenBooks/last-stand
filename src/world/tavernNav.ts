// The tavern's keeper's way about his room (world/tavernKeeper.ts walks it): a grid over the floor in 10 cm cells,
// blocked where his body won't fit (every stool, table, bench and barrel grown by his width, the bar and the back
// counter as boxes), searched by A* from wherever he is to wherever he goes, each cell's cost raised near what blocks
// it so he keeps to the middle of a way, then pulled straight between cells that see each other: a few legs he walks
// along a curve. From play: "it seems like he is following just 1 path. Have him actually pathfind", "when he walks
// back from fixing the fireplace, he walks through a bar chair". His ways were a handful of fixed points joined in
// straight lines.
import type { Obstacle } from '../types';

/** A box on the floor he keeps `keep` off (room m). */
export interface NavBox { x0: number; x1: number; z0: number; z1: number; keep: number }

/** the grid's cell (m), how far his body's middle keeps from a circle that blocks (m), and how much a cell near
 *  something costs over an open one (its cost grows to `near` times within `nearWithin` m) */
const CELL = 0.1, BODY_R = 0.26, NEAR = { cost: 2.5, within: 0.35 };

/** A point on the floor (room m). */
export type Point = readonly [number, number];

/** The room's floor as he may walk it, and the ways across it. */
export class TavernNav {
  private readonly nx: number;
  private readonly nz: number;
  /** each cell's clearance from what blocks it (m; 0 blocked) */
  private readonly clear: Float32Array;

  constructor(private readonly half: Point, private readonly circles: readonly Obstacle[], private readonly boxes: readonly NavBox[]) {
    this.nx = Math.round((half[0] * 2) / CELL);
    this.nz = Math.round((half[1] * 2) / CELL);
    this.clear = new Float32Array(this.nx * this.nz);
    for (let iz = 0; iz < this.nz; iz++) {
      for (let ix = 0; ix < this.nx; ix++) {
        const [x, z] = this.centre(ix, iz);
        this.clear[iz * this.nx + ix] = Math.max(0, this.room(x, z));
      }
    }
  }

  /** How far (x, z) is from the nearest thing he must keep off (m: below 0 inside its keep) */
  room(x: number, z: number): number {
    let least = Math.min(this.half[0] - BODY_R - Math.abs(x), this.half[1] - BODY_R - Math.abs(z));
    for (const c of this.circles) least = Math.min(least, Math.hypot(x - c.x, z - c.z) - c.r - BODY_R);
    for (const b of this.boxes) {
      const dx = Math.max(b.x0 - x, 0, x - b.x1), dz = Math.max(b.z0 - z, 0, z - b.z1);
      least = Math.min(least, Math.hypot(dx, dz) - b.keep);
    }
    return least;
  }

  /** Whether he fits at (x, z). */
  free(x: number, z: number): boolean {
    return this.room(x, z) > 0;
  }

  /** The way from `from` to `to`: the points he walks through after `from`, `to` the last (moved to the nearest place
   *  he fits, if it's somewhere he doesn't); none where there's no way. */
  path(from: Point, to: Point): Point[] {
    const start = this.nearestFree(this.cellOf(from)), goal = this.nearestFree(this.cellOf(to));
    if (start < 0 || goal < 0) return [];
    const cells = this.search(start, goal);
    if (!cells.length) return [];
    const points: Point[] = cells.map((c) => this.centre(c % this.nx, Math.floor(c / this.nx)));
    // (his own place first and the place asked last, where he fits there; standing where he doesn't fit, by a counter
    // he leaned over, his first step is out to where he does: dropped with his own place, he set off along the
    // counter and his swinging elbow went into its top, `lab tavern`)
    const startsFree = this.free(from[0], from[1]);
    if (startsFree) points[0] = from;
    if (this.free(to[0], to[1])) points[points.length - 1] = to;
    const way = this.pulled(points);
    return startsFree ? way.slice(1) : way;
  }

  /** whether the straight line a to b keeps him clear all along it */
  sees(a: Point, b: Point): boolean {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(d / (CELL * 0.5)));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      if (!this.free(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) return false;
    }
    return true;
  }

  /** a cell's middle (room m) */
  private centre(ix: number, iz: number): [number, number] {
    return [-this.half[0] + (ix + 0.5) * CELL, -this.half[1] + (iz + 0.5) * CELL];
  }

  private cellOf(p: Point): number {
    const ix = Math.min(this.nx - 1, Math.max(0, Math.floor((p[0] + this.half[0]) / CELL)));
    const iz = Math.min(this.nz - 1, Math.max(0, Math.floor((p[1] + this.half[1]) / CELL)));
    return iz * this.nx + ix;
  }

  /** the free cell nearest `cell` (itself if free), by rings outward; -1 if none within a metre */
  private nearestFree(cell: number): number {
    if (this.clear[cell] > 0) return cell;
    const cx = cell % this.nx, cz = Math.floor(cell / this.nx);
    for (let ring = 1; ring <= 10; ring++) {
      let best = -1, bestD = Infinity;
      for (let dz = -ring; dz <= ring; dz++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          const ix = cx + dx, iz = cz + dz;
          if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) continue;
          const c = iz * this.nx + ix, d = dx * dx + dz * dz;
          if (this.clear[c] > 0 && d < bestD) { best = c; bestD = d; }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  /** A* over the free cells, eight ways, each step's cost raised near what blocks it */
  private search(start: number, goal: number): number[] {
    const n = this.nx * this.nz, cost = new Float32Array(n).fill(Infinity), came = new Int32Array(n).fill(-1);
    const open = new MinHeap();
    const gx = goal % this.nx, gz = Math.floor(goal / this.nx);
    const guess = (c: number) => Math.hypot((c % this.nx) - gx, Math.floor(c / this.nx) - gz) * CELL;
    cost[start] = 0;
    open.push(start, guess(start));
    const closed = new Uint8Array(n);
    while (open.size) {
      const c = open.pop();
      if (c === goal) break;
      if (closed[c]) continue;
      closed[c] = 1;
      const cx = c % this.nx, cz = Math.floor(c / this.nx);
      for (const [dx, dz, len] of STEPS) {
        const ix = cx + dx, iz = cz + dz;
        if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) continue;
        const next = iz * this.nx + ix;
        if (closed[next] || this.clear[next] <= 0) continue;
        // (a diagonal only where both cells it passes between are free: never across a corner)
        if (dx && dz && (this.clear[cz * this.nx + ix] <= 0 || this.clear[iz * this.nx + cx] <= 0)) continue;
        const near = 1 + (NEAR.cost - 1) * Math.max(0, 1 - this.clear[next] / NEAR.within);
        const through = cost[c] + len * CELL * near;
        if (through >= cost[next]) continue;
        cost[next] = through;
        came[next] = c;
        open.push(next, through + guess(next));
      }
    }
    if (came[goal] < 0 && goal !== start) return [];
    const cells: number[] = [];
    for (let c = goal; c >= 0; c = came[c]) {
      cells.push(c);
      if (c === start) break;
    }
    return cells.reverse();
  }

  /** the cells' points pulled straight: from each kept point, on to the furthest it sees */
  private pulled(points: Point[]): Point[] {
    const out: Point[] = [points[0]];
    let at = 0;
    while (at < points.length - 1) {
      let next = at + 1;
      for (let k = points.length - 1; k > at + 1; k--) {
        if (this.sees(points[at], points[k])) { next = k; break; }
      }
      out.push(points[next]);
      at = next;
    }
    return out;
  }
}

/** a cell's eight neighbours and the length of the step to each */
const STEPS: readonly [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/** A binary heap of cells by their key, least first. */
class MinHeap {
  private readonly cells: number[] = [];
  private readonly keys: number[] = [];
  get size(): number { return this.cells.length; }

  push(cell: number, key: number): void {
    this.cells.push(cell);
    this.keys.push(key);
    let i = this.cells.length - 1;
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (this.keys[up] <= this.keys[i]) break;
      this.swap(i, up);
      i = up;
    }
  }

  pop(): number {
    const top = this.cells[0], lastCell = this.cells.pop()!, lastKey = this.keys.pop()!;
    if (this.cells.length) {
      this.cells[0] = lastCell;
      this.keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let least = i;
        if (l < this.cells.length && this.keys[l] < this.keys[least]) least = l;
        if (r < this.cells.length && this.keys[r] < this.keys[least]) least = r;
        if (least === i) break;
        this.swap(i, least);
        i = least;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.cells[a], this.cells[b]] = [this.cells[b], this.cells[a]];
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
  }
}
