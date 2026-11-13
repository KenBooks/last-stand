// The village's plan as geometry (data/village.ts lays it out): the palisade's winding line and its gaps, the roads'
// lines, the cottages' doors and footpaths, and what stands where, so the builder (world/village.ts), the meadow's
// mask and the trees all read one plan: grass and trees go wherever nothing's built or trodden.
import * as THREE from 'three';
import {
  CAMPFIRE, COTTAGES, ENTRANCES, GAP_HALF, HALL, NOTICE, PALISADE_LINE, RACK, ROADS, TERRACE, YARD, worldToYard,
  type Cottage, type Spot,
} from '../data/village';
import { BIOME_IDS, type BiomeId } from '../data/biomes';

/** a cottage's size: its walls (across, deep, tall), its roof's rise over them and its overhang */
export const COTTAGE = { w: 6.2, d: 4.6, h: 2.9, rise: 2.1, eave: 0.45 };
/** the square round the fountain: how far out its cobbles reach on average (m) */
export const SQUARE_R = 7.4;
/** where the square's edge is drawn and a footpath meets it (m from the middle) */
export const SQUARE_EDGE = 7.2;
/** each way out's own ground beyond its gap: how far out it reaches, and how wide either side of its way (m): the
 *  crypt's reaches past its mausoleum */
export const WAY: Record<BiomeId, { out: number; half: number }> = {
  crypt: { out: 21, half: 6.4 },
  forest: { out: 11, half: 4.6 },
};

/** The crypt's mausoleum, out along its way (m from the gap): its stair up from the court (its foot, its steps' count,
 *  rise and tread), the porch on its columns, the door's face, its back; its walls' width, its eaves' height and its
 *  roof's rise; the door (half wide, tall) and the stair inside going down from it (how far in it reaches). */
export const TOMB = {
  stairFoot: 6.8, steps: 5, rise: 0.2, tread: 0.32, porch: 2.2, door: 10.6, back: 19.6,
  w: 9, eave: 6.4, roof: 2.6, doorHalf: 1.2, doorHigh: 3.1, well: 4.6,
};
/** the mausoleum's podium: its front (m out along the way) and how high it stands */
export const PODIUM = { front: TOMB.stairFoot + TOMB.steps * TOMB.tread, high: TOMB.steps * TOMB.rise };

/** The palisade's line, a closed curve through its points. */
export const palisadeCurve = new THREE.CatmullRomCurve3(
  PALISADE_LINE.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');

/** The palisade's line as a polygon (`n` points along it). */
export function palisadePolygon(n = 360): Spot[] {
  return palisadeCurve.getSpacedPoints(n).slice(0, n).map((p) => [p.x, p.z]);
}
const outline = palisadePolygon();

/** How far (x, z) is from the nearest gap in the palisade (m, from the gap's middle). */
export function fromGap(x: number, z: number): number {
  return Math.min(...BIOME_IDS.map((id) => Math.hypot(x - ENTRANCES[id].gap[0], z - ENTRANCES[id].gap[1])));
}

/** Whether (x, z) is inside the palisade's line, at least `margin` m in from it. */
export function insidePalisade(x: number, z: number, margin = 0): boolean {
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [xi, zi] = outline[i], [xj, zj] = outline[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside && toPolyline(x, z, outline, true) >= margin;
}

/** How far (x, z) is from a line through `points` (closed: back to its first). */
export function toPolyline(x: number, z: number, points: readonly Spot[], closed = false): number {
  let best = Infinity;
  const n = closed ? points.length : points.length - 1;
  for (let i = 0; i < n; i++) {
    const [ax, az] = points[i], [bx, bz] = points[(i + 1) % points.length];
    const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz || 1;
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / len2));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

/** A winding line through `points`, as points every `step` m along it. */
export function windingLine(points: readonly Spot[], step = 0.4): Spot[] {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const n = Math.max(2, Math.ceil(curve.getLength() / step));
  return curve.getSpacedPoints(n).map((p) => [p.x, p.z]);
}

/** each road's line, every 0.4 m */
export const roadLines = ROADS.map((r) => ({ line: windingLine(r.points), width: r.width }));

/** Where cottage `c`'s door is (the middle of its face, on the ground). */
export function doorOf(c: Cottage): Spot {
  const out = (COTTAGE.d / 2 + 0.15) * c.size;
  return [c.x + Math.sin(c.facing) * out, c.z + Math.cos(c.facing) * out];
}

/** Cottage `c`'s footpath from its door to the road, every 0.4 m, or none. */
export function footpathOf(c: Cottage): Spot[] | null {
  return footpaths.get(c) ?? null;
}

/** The nearest point of a line (its points, every 0.4 m or so) to (x, z). */
function nearestOn(x: number, z: number, line: readonly Spot[]): Spot {
  let best: Spot = line[0], far = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, az] = line[i], [bx, bz] = line[i + 1];
    const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz || 1;
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / len2));
    const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
    if (d < far) {
      far = d;
      best = [px, pz];
    }
  }
  return best;
}

/**
 * Each footpath from its cottage's door through its points, on to where it meets the way it joins: the edge of the
 * nearest road or of the square, or a footpath laid before it. Ended at its last point alone, a path stopped short in
 * the grass, at a road's side or in its middle.
 */
const footpaths = new Map<Cottage, Spot[]>();
for (const c of COTTAGES) {
  if (!c.path) continue;
  const [x, z] = c.path[c.path.length - 1];
  const out = Math.hypot(x, z);
  // each way it may join: the point it meets it at, and how far from there the way's edge is (a road's half width)
  const ways: { at: Spot; edge: number }[] = [
    { at: [x * SQUARE_EDGE / out, z * SQUARE_EDGE / out], edge: 0 },
    ...roadLines.map((r) => ({ at: nearestOn(x, z, r.line), edge: r.width / 2 })),
    ...[...footpaths.values()].map((line) => ({ at: nearestOn(x, z, line), edge: 0 })),
  ];
  const gapTo = (w: { at: Spot; edge: number }): number => Math.hypot(w.at[0] - x, w.at[1] - z) - w.edge;
  const way = ways.reduce((a, b) => (gapTo(b) < gapTo(a) ? b : a));
  const off = Math.hypot(x - way.at[0], z - way.at[1]) || 1;
  const end: Spot = [way.at[0] + (x - way.at[0]) / off * way.edge, way.at[1] + (z - way.at[1]) / off * way.edge];
  const joined = Math.hypot(end[0] - x, end[1] - z) > 0.3 ? [...c.path, end] : c.path;
  footpaths.set(c, windingLine([doorOf(c), ...joined]));
}

/** Whether (x, z) is in a box of half sides (hx, hz) round (cx, cz), turned `turn` rad about y, `pad` m round it. */
export function inBox(x: number, z: number, cx: number, cz: number, hx: number, hz: number, turn: number, pad: number): boolean {
  const dx = x - cx, dz = z - cz, c = Math.cos(turn), s = Math.sin(turn);
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  return Math.abs(lx) < hx + pad && Math.abs(lz) < hz + pad;
}

/** Whether (x, z) lies under stone or walls built on the ground: the terrace, its stair, a cottage (their own footprints, unpadded: what a curb runs into). */
export function solidAt(x: number, z: number): boolean {
  const { half, front, back, stairHalf, stairFoot } = TERRACE;
  if (inBox(x, z, TERRACE.x, (front + back) / 2, half, (front - back) / 2, 0, 0)) return true;
  if (inBox(x, z, TERRACE.x, (stairFoot + front) / 2, stairHalf, (stairFoot - front) / 2, 0, 0)) return true;
  return COTTAGES.some((c) => inBox(x, z, c.x, c.z, (COTTAGE.w / 2) * c.size, (COTTAGE.d / 2) * c.size, c.facing, 0));
}

/** Whether (x, z) is in a way out's own ground (its walk from the gap to its portal and round it), `pad` m round it. */
export function inWay(x: number, z: number, pad = 0): boolean {
  return BIOME_IDS.some((id) => {
    const { gap, out } = ENTRANCES[id];
    const dx = x - gap[0], dz = z - gap[1];
    const along = dx * out[0] + dz * out[1], across = -dx * out[1] + dz * out[0];
    return along > -1 - pad && along < WAY[id].out + pad && Math.abs(across) < WAY[id].half + pad;
  });
}

/** Whether (x, z) is paved: the square's cobbles or a road's. */
export function pavedAt(x: number, z: number): boolean {
  if (Math.hypot(x, z) < SQUARE_EDGE) return true;
  return roadLines.some((road) => toPolyline(x, z, road.line) < road.width / 2);
}

/** Whether something's built or trodden at (x, z), `pad` m round it: no tree stands there. */
export function builtAt(x: number, z: number, pad = 0): boolean {
  if (Math.hypot(x, z) < SQUARE_R + 1 + pad) return true;
  const { half, front, back, stairHalf, stairFoot } = TERRACE;
  if (inBox(x, z, TERRACE.x, (front + back) / 2, half + 0.6, (front - back) / 2 + 0.6, 0, pad)) return true;
  if (inBox(x, z, TERRACE.x, (stairFoot + front) / 2, stairHalf + 0.5, (front - stairFoot) / 2 + 0.5, 0, pad)) return true;
  // (the hall of heroes runs on past the terrace's back, on a footing of its own)
  if (inBox(x, z, TERRACE.x, (back + HALL.wall) / 2, HALL.half + 1.2, (back - HALL.wall) / 2 + 1.6, 0, pad)) return true;
  const [yx, yz] = worldToYard(x, z);
  if (Math.abs(yx) < YARD.halfX + 0.6 + pad && Math.abs(yz) < YARD.halfZ + 0.6 + pad) return true;
  for (const c of COTTAGES) {
    const hx = (COTTAGE.w / 2 + 0.8) * c.size, hz = (COTTAGE.d / 2 + 0.8) * c.size;
    if (inBox(x, z, c.x, c.z, hx, hz, c.facing, pad)) return true;
    const path = footpathOf(c);
    if (path && toPolyline(x, z, path) < 1 + pad) return true;
  }
  if (Math.hypot(x - CAMPFIRE[0], z - CAMPFIRE[1]) < 3.8 + pad) return true;
  if (Math.hypot(x - NOTICE.x, z - NOTICE.z) < 1.6 + pad) return true;
  if (Math.hypot(x - RACK.x, z - RACK.z) < 2.4 + pad) return true;
  if (roadLines.some((r) => toPolyline(x, z, r.line) < r.width / 2 + 0.8 + pad)) return true;
  return inWay(x, z, pad);
}

/** Whether a body may come to (x, z) through the palisade: inside it, or in a way out's ground beyond its gap. */
export const withinVillage = (x: number, z: number): boolean => insidePalisade(x, z) || inWay(x, z) || fromGap(x, z) < GAP_HALF;
