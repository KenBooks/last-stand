// `lab village`'s roads bent no tighter than their curbs can follow: a road whose line turns on a radius under its
// half width folds its inner edge back over itself, and the curb along it doubled over into slivers on the paving and
// left the edge bare (from play, the yard's road at its gate: "lets fix curb near training area", its last 1.6 m
// turning 60 degrees). `canary` adds that road as it was, which must be found.
import { ROADS, YARD, yardToWorld, type Spot } from '../../../src/data/village';
import * as THREE from 'three';
import { curbGeometry } from '../../../src/world/village';
import { windingLine } from '../../../src/world/villagePlan';
import type { LightsChecked } from './villageLights';

/** how far either side of a point the bend is read (points, 0.4 m apart: one apart read the spline's own wobble), and
 *  how much wider than its half width a road's tightest bend must be (m: the curb stands 0.2 m out past the edge) */
const SPAN = 2;
const MARGIN = 0.3;

/** the yard's road as it was, its turn into the gate the canary */
const FOLDED = {
  points: [[4.6, 4.3], [6.3, 5.9], yardToWorld(YARD.gateAt, -6.6), yardToWorld(YARD.gateAt, -5.0)] as Spot[],
  width: 2.6,
};

/** The radius of the circle through three points (m), or Infinity on a straight line. */
function radiusThrough(a: Spot, b: Spot, c: Spot): number {
  const ab = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const bc = Math.hypot(c[0] - b[0], c[1] - b[1]);
  const ca = Math.hypot(a[0] - c[0], a[1] - c[1]);
  const twiceArea = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  return twiceArea < 1e-9 ? Infinity : (ab * bc * ca) / (2 * twiceArea);
}

/** The tightest bend along a road's line (m), and where. */
export function tightestBend(points: readonly Spot[]): { radius: number; at: Spot } {
  const line = windingLine(points);
  let tightest = { radius: Infinity, at: line[0] };
  for (let i = SPAN; i + SPAN < line.length; i++) {
    const radius = radiusThrough(line[i - SPAN], line[i], line[i + SPAN]);
    if (radius < tightest.radius) tightest = { radius, at: line[i] };
  }
  return tightest;
}

/** Every road's tightest bend against its half width (with `canary`, the yard's road as it was too). */
export function roadsBendWide(canary: boolean): LightsChecked {
  const roads = canary ? [...ROADS, FOLDED] : ROADS;
  const read = roads.map((road, i) => ({ i, ...tightestBend(road.points), least: road.width / 2 + MARGIN }));
  const each = read.map(({ i, radius, least }) => `${i} ${radius.toFixed(1)}/${least.toFixed(1)} m`);
  const line = `roads' tightest bends, against the half width and the curb they need: ${each.join(', ')}`;
  const folded = read.filter(({ radius, least }) => radius < least);
  if (canary) {
    return { lines: [line], problems: [], caught: folded.some(({ i }) => i === ROADS.length), moments: [] };
  }
  const problems = folded.map(({ i, at }) => `${line}: road ${i} folds its inner curb at ${at[0].toFixed(1)}, `
    + `${at[1].toFixed(1)}`);
  return { lines: [line], problems, caught: null, moments: [] };
}

/** a triangle counts as on a curb's top from this height (m) */
const TOP_FROM = 0.05;

/** The curbs' top triangles: how many there are and how many face down, seen from above as nothing (the material is
 *  one-sided). `flipped`: read each as wound the other way. */
function curbTops(flipped: boolean): { tops: number; down: number } {
  const position = curbGeometry().getAttribute('position');
  const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const normal = new THREE.Vector3();
  let tops = 0;
  let down = 0;
  for (let at = 0; at + 2 < position.count; at += 3) {
    a.fromBufferAttribute(position, at);
    b.fromBufferAttribute(position, at + 1);
    c.fromBufferAttribute(position, at + 2);
    if (Math.min(a.y, b.y, c.y) < TOP_FROM) continue;
    tops++;
    normal.subVectors(b, a).cross(c.clone().sub(a));
    if ((normal.y < 0) !== flipped) down++;
  }
  return { tops, down };
}

/** Every curb's top faces up (from a review: one curb of each road a sliver, its top culled). `canary` reads them
 *  wound the other way, which must be found. */
export function curbsFaceUp(canary: boolean): LightsChecked {
  const { tops, down } = curbTops(canary);
  const line = `curbs' tops: ${down} of ${tops} triangles face down`;
  if (canary) return { lines: [line], problems: [], caught: down > 0, moments: [] };
  if (tops === 0) return { lines: [line], problems: ['no curb top read'], caught: null, moments: [] };
  return { lines: [line], problems: down > 0 ? [line] : [], caught: null, moments: [] };
}
