// The tavern's tables as their tops are drawn (world/houses/tavern.ts builds them): a round top or a long one, its
// edge nearest a point and the way out from it, how far a point is past it, and a point kept off it. The keeper
// stands at a table's side by these (`world/tavernKeeper.ts`) and a hero's mug is set down on them; each table was a
// circle of its `reach` round its middle, the long table's 0.38 m in a top 0.9 by 2.2 m, and he collected a mug from
// it standing inside its top from the hips down (Kenneth's round 5: "when he grabs cup he goes through table").
import { TABLES } from '../data/tavern';

/** A table's top: its middle, its height, and its radius (round) or half sizes (long), in the room (m). */
export interface TableTop { name: string; x: number; z: number; top: number; r?: number; hx?: number; hz?: number }

/** A point on a top's edge and the way out from it (room m, the way of unit length). */
export interface Edge { x: number; z: number; nx: number; nz: number }

/** The candles and tankards standing on the tables' tops (room m, a mug's room round each): the room adds them as it
 *  builds them (world/houses/tavern.ts), and a mug put down keeps off them. */
export const TOP_THINGS: { x: number; z: number }[] = [];

/** Every table's top. */
export const TABLE_TOPS: readonly TableTop[] = Object.entries(TABLES).map(([name, t]) => ({ name, ...t }));

/** How far (x, z) lies past `t`'s edge (m: below 0 over its top). */
export function pastEdge(t: TableTop, x: number, z: number): number {
  if (t.r !== undefined) return Math.hypot(x - t.x, z - t.z) - t.r;
  const dx = Math.abs(x - t.x) - t.hx!, dz = Math.abs(z - t.z) - t.hz!;
  return Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0);
}

/** The point of `t`'s edge nearest (x, z), and the way out from the top there. */
export function edgeNear(t: TableTop, x: number, z: number): Edge {
  const dx = x - t.x, dz = z - t.z;
  if (t.r !== undefined) {
    const d = Math.hypot(dx, dz) || 1;
    return { x: t.x + (dx / d) * t.r, z: t.z + (dz / d) * t.r, nx: dx / d, nz: dz / d };
  }
  const hx = t.hx!, hz = t.hz!;
  const inside = Math.abs(dx) <= hx && Math.abs(dz) <= hz;
  if (inside) {
    // (over the top: out by its nearest side)
    if (hx - Math.abs(dx) < hz - Math.abs(dz)) return { x: t.x + Math.sign(dx || 1) * hx, z, nx: Math.sign(dx || 1), nz: 0 };
    return { x, z: t.z + Math.sign(dz || 1) * hz, nx: 0, nz: Math.sign(dz || 1) };
  }
  const ex = t.x + Math.max(-hx, Math.min(hx, dx)), ez = t.z + Math.max(-hz, Math.min(hz, dz));
  const ox = x - ex, oz = z - ez, d = Math.hypot(ox, oz) || 1;
  return { x: ex, z: ez, nx: ox / d, nz: oz / d };
}

/** `p` moved out from `t` to `keep` past its edge, if it's nearer (a body's middle kept that far off the top). */
export function keepOffTop(t: TableTop, p: { x: number; z: number }, keep: number): void {
  if (pastEdge(t, p.x, p.z) >= keep) return;
  const e = edgeNear(t, p.x, p.z);
  p.x = e.x + e.nx * keep;
  p.z = e.z + e.nz * keep;
}

/** The table whose top is nearest (x, z), and how far past its edge (x, z) is. */
export function nearestTop(x: number, z: number): { top: TableTop; past: number } {
  let best = TABLE_TOPS[0], past = Infinity;
  for (const t of TABLE_TOPS) {
    const d = pastEdge(t, x, z);
    if (d < past) { best = t; past = d; }
  }
  return { top: best, past };
}
