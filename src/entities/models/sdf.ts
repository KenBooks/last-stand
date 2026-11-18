// Shapes as signed distance fields, to sculpt organic forms out of (models/handShape.ts) and mesh with surface nets
// (models/surfaceNets.ts): a tapering tube, an ellipsoid, a tapering rounded slab, a half-space, each in a frame of
// its own (a joint's), joined softly to the rest or cut away. Each knows a sphere that holds it, so a point far from
// it is never asked of it: asked of every part, a hand's field took 5 s to mesh.
import * as THREE from 'three';
import { clamp } from '../../util';
import type { Field } from './surfaceNets';

/** A shape in its own frame: its distance at a point (m: negative inside; near enough on its surface, and never more
 *  than the true distance), and a sphere that holds it (its centre, its radius). */
export interface Shape {
  distance: (x: number, y: number, z: number) => number;
  centre: THREE.Vector3Tuple;
  radius: number;
}

/** A part of a sculpt: its shape, the frame it's in (from the sculpt's own, inverted: a joint's at the pose it's
 *  sculpted in), how softly it joins the rest (m), whether it's cut away, and which joints the surface on it moves with
 *  (bones by their index, each with its share). */
export interface Part {
  shape: Shape;
  frame: Float64Array;
  blend: number;
  cut?: boolean;
  bones: [number, number][];
  /** shaping the surface alone (no say in which joints the skin on it follows), or that say alone (no surface) */
  shapeOnly?: boolean;
  sayOnly?: boolean;
  /** the holding sphere's centre in the sculpt's frame */
  at?: THREE.Vector3Tuple;
}

/** how much nearer a part's distance may say a point is than its holding sphere does (a shape squashed to `depth`
 *  of its width says its distance that much smaller) */
const BOUND_SHARE = 0.6;

export const smin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
export const smax = (a: number, b: number, k: number) => -smin(-a, -b, k);

/** A tube down -y from `from` to `to` (m), its radius `r0` to `r1`, its depth (z) `depth` of its width, rounded at
 *  both ends. */
export function tube(r0: number, r1: number, from: number, to: number, depth: number): Shape {
  const length = to - from;
  return {
    distance: (x, y, z) => {
      const t = clamp((-y - from) / length, 0, 1);
      const along = -y - (from + t * length);
      const zs = z / depth;
      return (Math.sqrt(x * x + zs * zs + along * along) - (r0 + (r1 - r0) * t)) * depth;
    },
    centre: [0, -(from + to) / 2, 0],
    radius: length / 2 + Math.max(r0, r1),
  };
}

/** A capsule from `a` to `b` (in its frame), of radius `r`. */
export function capsule(a: THREE.Vector3, b: THREE.Vector3, r: number): Shape {
  const ab = b.clone().sub(a);
  const length2 = Math.max(ab.lengthSq(), 1e-12);
  return {
    distance: (x, y, z) => {
      const t = clamp(((x - a.x) * ab.x + (y - a.y) * ab.y + (z - a.z) * ab.z) / length2, 0, 1);
      const dx = x - (a.x + ab.x * t);
      const dy = y - (a.y + ab.y * t);
      const dz = z - (a.z + ab.z * t);
      return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
    },
    centre: a.clone().add(b).multiplyScalar(0.5).toArray(),
    radius: Math.sqrt(length2) / 2 + r,
  };
}

/** An ellipsoid round (cx, cy, cz) of radii (rx, ry, rz). */
export function ellipsoid(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number): Shape {
  return {
    distance: (x, y, z) => {
      const px = (x - cx) / rx;
      const py = (y - cy) / ry;
      const pz = (z - cz) / rz;
      const k0 = Math.sqrt(px * px + py * py + pz * pz);
      const qx = px / rx;
      const qy = py / ry;
      const qz = pz / rz;
      const k1 = Math.sqrt(qx * qx + qy * qy + qz * qz);
      return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
    },
    centre: [cx, cy, cz],
    radius: Math.max(rx, ry, rz),
  };
}

/** A slab from `top` down to `bottom` (y), its half-width and half-depth going from `wide`, `deep` at its top to
 *  `wideB`, `deepB` at its bottom, its back and front domed (`dome`: the share of its depth lost at its sides), rounded
 *  by `round`. */
export function slab(top: number, bottom: number, wide: number, wideB: number, deep: number, deepB: number,
  dome: number, round: number): Shape {
  const mid = (top + bottom) / 2;
  const half = (top - bottom) / 2;
  return {
    distance: (x, y, z) => {
      const t = clamp((top - y) / (top - bottom), 0, 1);
      const w = wide + (wideB - wide) * t;
      const across = clamp(x / w, -1, 1);
      const d = (deep + (deepB - deep) * t) * (1 - dome * across * across);
      const qx = Math.abs(x) - (w - round);
      const qy = Math.abs(y - mid) - (half - round);
      const qz = Math.abs(z) - (d - round);
      const ox = Math.max(qx, 0);
      const oy = Math.max(qy, 0);
      const oz = Math.max(qz, 0);
      return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - round;
    },
    centre: [0, mid, 0],
    radius: Math.sqrt(Math.max(wide, wideB) ** 2 + half * half + Math.max(deep, deepB) ** 2),
  };
}

/** Everything above `y` (a half-space, to cut a sculpt off flat). */
export function above(y: number): Shape {
  return { distance: (_x, py) => y - py, centre: [0, 0, 0], radius: Infinity };
}

/** `object`'s frame in `space`'s (`space` above it in one hierarchy), inverted: from `space`'s frame into its own. */
export function frameIn(object: THREE.Object3D, space: THREE.Object3D): Float64Array {
  const m = new THREE.Matrix4();
  for (let o: THREE.Object3D | null = object; o && o !== space; o = o.parent) {
    o.updateMatrix();
    m.premultiply(o.matrix);
  }
  return new Float64Array(m.invert().elements);
}
export const IDENTITY = new Float64Array(new THREE.Matrix4().elements);

/** Where `part`'s holding sphere is in the sculpt's frame. */
function centreOf(part: Part): THREE.Vector3Tuple {
  if (!part.at) {
    const toSculpt = new THREE.Matrix4().fromArray(part.frame).invert();
    part.at = new THREE.Vector3(...part.shape.centre).applyMatrix4(toSculpt).toArray();
  }
  return part.at;
}

/** How near `part` may be to (x, y, z), at the least (its distance there is never less). */
export function leastDistance(part: Part, x: number, y: number, z: number): number {
  const [cx, cy, cz] = centreOf(part);
  const dx = x - cx;
  const dy = y - cy;
  const dz = z - cz;
  return (Math.sqrt(dx * dx + dy * dy + dz * dz) - part.shape.radius) * BOUND_SHARE;
}

/** Whether `part` is surely further than `reach` from (x, y, z) (as `leastDistance` says, without its root). */
export function beyond(part: Part, x: number, y: number, z: number, reach: number): boolean {
  const [cx, cy, cz] = part.at!;
  const dx = x - cx;
  const dy = y - cy;
  const dz = z - cz;
  const out = part.shape.radius + reach / BOUND_SHARE;
  return out > 0 && dx * dx + dy * dy + dz * dz > out * out;
}

/** `part`'s distance at (x, y, z) in the sculpt's frame. */
export function distanceOf(part: Part, x: number, y: number, z: number): number {
  const e = part.frame;
  return part.shape.distance(
    e[0] * x + e[4] * y + e[8] * z + e[12],
    e[1] * x + e[5] * y + e[9] * z + e[13],
    e[2] * x + e[6] * y + e[10] * z + e[14],
  );
}

/** how far from the surface a field of the parts near a ball keeps its distances right (m): beyond, only its sign */
const KEPT = 0.02;

/**
 * The parts' field: each part joined to the rest by its blend, the cuts taken away after; a part whose holding sphere
 * is too far for it to change the distance so far isn't asked. Within a ball (`within`), a field of the parts that can
 * change its distances there, where they're under `KEPT`.
 */
export function fieldOf(parts: Part[]): Field {
  for (const part of parts) centreOf(part);
  const field = joinedField(parts);
  field.within = (x, y, z, radius) => {
    const near = parts.filter((part) => !beyond(part, x, y, z, KEPT + part.blend + radius * BOUND_SHARE));
    return joinedField(near);
  };
  return field;
}

/** `parts` joined, their cuts taken away. */
function joinedField(parts: Part[]): Field {
  const joined = parts.filter((part) => !part.cut && !part.sayOnly);
  const cuts = parts.filter((part) => part.cut);
  return (x, y, z) => {
    let d = 1;
    for (const part of joined) {
      if (beyond(part, x, y, z, d + part.blend)) continue;
      d = smin(d, distanceOf(part, x, y, z), part.blend);
    }
    for (const part of cuts) {
      if (beyond(part, x, y, z, Math.abs(d) + part.blend)) continue;
      d = smax(d, -distanceOf(part, x, y, z), part.blend);
    }
    return d;
  };
}
