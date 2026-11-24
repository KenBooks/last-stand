// The bones of the ossuary's dead (the Ossuary Twins, models/twins.ts): each bone sculpted as a distance field
// (models/sdf.ts) and meshed with surface nets, its hollows darkened in its vertex colours (world/skull.ts's
// `netGeometry`), at the size it's drawn, so its ends and joints read: a femur's ball on its neck, its trochanter and
// its two condyles; a tibia's plateau with its fibula beside it; a humerus's head and its elbow's spool; the ulna's
// hook behind the elbow and the radius crossing to the thumb; a pelvis of two flared wings over a sacrum, its sockets
// cut and its rings open; a shoulder blade with its spine; a breastbone. The skull is the crypt's (world/skull.ts)
// with a jaw of its own to match, hinged at its condyles. The ribs, the vertebrae, the fingers and the toes are
// tapered tubes, each carrying vertex colours too, so every piece of a twin's bone is one material.
//
// Each sculpted bone is simplified once meshed (`fewer`: three's meshoptimizer, loaded with the Twins' file,
// `readyOssuary`): a surface net lays its triangles evenly, as many on a smooth shaft as round a socket, and the edge
// collapse leaves its kept vertices on the field's surface with their normals and hollows' shading, within an eighth of
// its grid's cell of where it was (`FEWER_ERROR`: well under the grid's own error, so no shape moves). The twins drew 52k
// triangles each with the belt skulls' faces; their bones simplified so, every face kept (#900, from Kenneth: "Those
// skulls need work, improve model").
//
// Every bone is built pointing down -y from its joint (a thigh from the hip, a shin from the knee) for the left side
// of the body (+x), its inner side towards -x: the right side is its mirror image (`Sculpt.pair`).
import * as THREE from 'three';
import { clamp } from '../../util';
import { ellipsoid, fieldOf, IDENTITY, type Part, type Shape } from './sdf';
import { netGeometry, skullParts, SKULL_BOX } from '../../world/skull';
import { taperTube } from './shapes';

type V3 = THREE.Vector3Tuple;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// --- shapes ---------------------------------------------------------------------------------------------------

/** A tube from `a` to `b`, its radius `r0` to `r1`, rounded at both ends. */
export function capsule(a: V3, b: V3, r0: number, r1: number): Shape {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const length2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
  return {
    distance: (x, y, z) => {
      const px = x - a[0];
      const py = y - a[1];
      const pz = z - a[2];
      const t = clamp((px * ab[0] + py * ab[1] + pz * ab[2]) / length2, 0, 1);
      const dx = px - ab[0] * t;
      const dy = py - ab[1] * t;
      const dz = pz - ab[2] * t;
      return Math.sqrt(dx * dx + dy * dy + dz * dz) - (r0 + (r1 - r0) * t);
    },
    centre: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
    radius: Math.sqrt(length2) / 2 + Math.max(r0, r1),
  };
}

/** A sculpt's parts as they're gathered: joined, cut away, or placed turned (`at`, `turn` an Euler XYZ). */
/** how far a simplified bone's surface may lie from its net's, a share of the grid's cell it was meshed on */
const FEWER_ERROR = 0.12;
/** and a twin's own head's, finer: simplified as its bones, its crown showed facets and Slab's crack faded */
const HEAD_ERROR = 0.04;
/** the simplifier (three's meshoptimizer): null until it has loaded */
let simplifier: typeof import('three/addons/libs/meshopt_simplifier.module.js').MeshoptSimplifier | null = null;
let loading: Promise<void> | null = null;

/** The simplifier loaded, once: the Twins' file waits for it as it loads, so their bones are made simplified. */
export function readyOssuary(): Promise<void> {
  loading ??= import('three/addons/libs/meshopt_simplifier.module.js').then(async ({ MeshoptSimplifier }) => {
    await MeshoptSimplifier.ready;
    simplifier = MeshoptSimplifier;
  });
  return loading;
}

/** A net (indexed: its points, normals and hollows' shading) with fewer triangles, its surface within `error` (m)
 *  of its own, its vertices those it kept (none moved); as it was where the simplifier hasn't loaded. */
export function fewer(g: THREE.BufferGeometry, error: number): THREE.BufferGeometry {
  if (!simplifier || !g.getIndex()) return g;
  const positions = g.getAttribute('position').array as Float32Array;
  const index = new Uint32Array(g.getIndex()!.array);
  const [kept] = simplifier.simplify(index, positions, 3, 3, error, ['ErrorAbsolute']);
  if (kept.length >= index.length) return g;
  const remap = new Int32Array(positions.length / 3).fill(-1);
  let count = 0;
  for (const v of kept) if (remap[v] < 0) remap[v] = count++;
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const attribute = g.getAttribute(name);
    if (!attribute) continue;
    const from = attribute.array as Float32Array;
    const to = new Float32Array(count * 3);
    remap.forEach((at, v) => {
      if (at >= 0) to.set(from.subarray(v * 3, v * 3 + 3), at * 3);
    });
    out.setAttribute(name, new THREE.BufferAttribute(to, 3));
  }
  out.setIndex(new THREE.BufferAttribute(Uint32Array.from(kept, (v) => remap[v]), 1));
  out.computeBoundingSphere();
  g.dispose();
  return out;
}

class Parts {
  readonly list: Part[] = [];
  join(shape: Shape, blend: number): this {
    this.list.push({ shape, frame: IDENTITY, blend, bones: [] });
    return this;
  }
  cut(shape: Shape, blend: number): this {
    this.list.push({ shape, frame: IDENTITY, blend, cut: true, bones: [] });
    return this;
  }
  /** `shape` (made round its own origin) set at `at`, turned by `turn` */
  turned(shape: Shape, at: V3, turn: V3, blend: number, cut = false): this {
    const placed = new THREE.Matrix4().compose(V(...at), new THREE.Quaternion().setFromEuler(new THREE.Euler(...turn)), V(1, 1, 1));
    this.list.push({ shape, frame: new Float64Array(placed.invert().elements), blend, cut, bones: [] });
    return this;
  }
  /** the surface meshed on a grid of `cell` within `box` */
  /** the parts meshed on `cell` and simplified within `error` (m: `FEWER_ERROR` of a cell by default) */
  mesh(box: THREE.Box3, cell: number, error = cell * FEWER_ERROR): THREE.BufferGeometry {
    return fewer(netGeometry(fieldOf(this.list), box, cell, cell * 0.75), error);
  }
}

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): THREE.Box3 =>
  new THREE.Box3(V(x0, y0, z0), V(x1, y1, z1));

// --- the skull and its jaw ----------------------------------------------------------------------------------

/** where the skull sits on its neck (the hole at its base, m in the sculpt's own units), and its jaw's hinge */
export const SKULL_NECK: V3 = [0, 0.03, -0.035];
export const JAW_HINGE: V3 = [0, 0.032, -0.02];
/** where each eye's socket is (its left one; the right is its mirror) */
export const SKULL_EYE: V3 = [0.027, 0.066, 0.078];

/** The crypt's skull (no jaw), a man's in size, facing +z, its teeth's foot at y 0: meshed on `cell`. */
export function skull(cell: number, error = cell * FEWER_ERROR): THREE.BufferGeometry {
  return fewer(netGeometry(fieldOf(skullParts()), SKULL_BOX, cell, cell * 0.75), error);
}

/** How a twin's skull differs from the crypt's: `heavy` (Slab's) a thick brow and cheekbones, a crack across the crown
 *  and a front tooth broken off; `long` (Reliquary's) its crown drawn back long, its cheeks hollow, and a third socket
 *  cut in its brow, a glow set in it (`THIRD_EYE`). */
export type SkullLook = 'heavy' | 'long';
/** where Reliquary's third socket is, on its brow */
export const THIRD_EYE: V3 = [0, 0.104, 0.074];

/** A twin's skull, meshed on `cell`, in the crypt's skull's space. */
export function twinSkull(cell: number, look: SkullLook): THREE.BufferGeometry {
  const parts = new Parts();
  parts.list.push(...skullParts());
  if (look === 'heavy') {
    parts.join(ellipsoid(0, 0.087, 0.07, 0.062, 0.014, 0.022), 0.012);
    for (const s of [-1, 1]) parts.join(ellipsoid(s * 0.051, 0.058, 0.046, 0.024, 0.019, 0.03), 0.012);
    // the crack down from the crown over the left brow, and the tooth knocked out
    parts.cut(capsule([0.012, 0.165, 0.0], [0.03, 0.14, 0.05], 0.0042, 0.0042), 0.002)
      .cut(capsule([0.03, 0.14, 0.05], [0.026, 0.1, 0.078], 0.0042, 0.0035), 0.002)
      .cut(ellipsoid(0.006, 0.008, 0.088, 0.008, 0.009, 0.01), 0.002);
  } else {
    parts.join(ellipsoid(0, 0.1, -0.06, 0.06, 0.064, 0.085), 0.025);
    for (const s of [-1, 1]) parts.cut(ellipsoid(s * 0.058, 0.04, 0.034, 0.011, 0.016, 0.02), 0.01);
    parts.cut(ellipsoid(THIRD_EYE[0], THIRD_EYE[1], THIRD_EYE[2] + 0.01, 0.008, 0.011, 0.016), 0.004);
  }
  return parts.mesh(box(-0.095, -0.012, -0.17, 0.095, 0.19, 0.135), cell, cell * HEAD_ERROR);
}

/** The jaw that fits the crypt's skull, shut, in the skull's own space: its body round the chin, under a row of teeth,
 *  rising at its angles to the condyles it's hinged on (`JAW_HINGE`) and the coronoids before them. */
export function jaw(cell: number, error = cell * FEWER_ERROR): THREE.BufferGeometry {
  const parts = new Parts();
  // the body, a curve of ellipsoids each turned along it: tall, thin, round the chin from angle to angle
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8 - 0.5) * 3.0;
    const at: V3 = [Math.sin(a) * 0.041, -0.018, 0.026 + Math.cos(a) * 0.057];
    parts.turned(ellipsoid(0, 0, 0, 0.013, 0.014, 0.0065), at, [0, a, 0], 0.006);
  }
  parts.join(ellipsoid(0, -0.03, 0.084, 0.015, 0.01, 0.008), 0.006);
  for (const s of [-1, 1]) {
    // back from the body's ends to the angle, then the ramus up to the condyle, the coronoid before it
    parts.join(capsule([s * 0.041, -0.02, 0.028], [s * 0.044, -0.028, -0.008], 0.008, 0.008), 0.006);
    parts.join(ellipsoid(s * 0.045, 0.0, -0.006, 0.0045, 0.024, 0.013), 0.006);
    parts.join(capsule([s * 0.044, -0.028, -0.01], [s * 0.048, 0.03, -0.02], 0.006, 0.005), 0.004);
    parts.join(ellipsoid(s * 0.048, 0.032, -0.02, 0.009, 0.005, 0.006), 0.003);
    parts.join(capsule([s * 0.042, 0.0, 0.006], [s * 0.043, 0.026, 0.012], 0.004, 0.003), 0.004);
  }
  // the lower teeth, each its own bump, just under the upper ones
  for (let i = 0; i < 10; i++) {
    const a = (i / 9 - 0.5) * 2.4;
    parts.join(ellipsoid(Math.sin(a) * 0.028, -0.006, 0.054 + Math.cos(a) * 0.028, 0.0045, 0.006, 0.0045), 0.002);
  }
  return parts.mesh(box(-0.065, -0.05, -0.035, 0.065, 0.045, 0.1), cell, error);
}

// --- the long bones ---------------------------------------------------------------------------------------------

/** A thighbone `len` long from the hip (its ball at the joint) to the knee, its shaft `r` thick, slanting in to the
 *  knee from its trochanter: the ball on its neck, the great trochanter outside, two condyles at its foot. */
export function femur(len: number, r: number): THREE.BufferGeometry {
  const parts = new Parts()
    .join(ellipsoid(0, 0, 0, 1.7 * r, 1.7 * r, 1.7 * r), r * 0.3)
    .join(capsule([0.4 * r, -0.4 * r, 0], [2.0 * r, -2.2 * r, 0], 0.95 * r, 1.05 * r), r * 0.5)
    .join(ellipsoid(2.9 * r, -1.7 * r, -0.3 * r, 1.1 * r, 1.6 * r, 1.2 * r), r * 0.6)
    .join(capsule([2.2 * r, -2.6 * r, 0], [1.1 * r, -len * 0.5, 0.35 * r], 1.15 * r, 1.0 * r), r * 0.6)
    .join(capsule([1.1 * r, -len * 0.5, 0.35 * r], [0.1 * r, -len + 3.2 * r, 0], 1.0 * r, 1.05 * r), r * 0.6)
    .join(capsule([0.1 * r, -len + 4.2 * r, 0], [0, -len + 1.8 * r, -0.2 * r], 1.05 * r, 1.65 * r), r * 0.8);
  for (const s of [-1, 1]) parts.join(ellipsoid(s * 0.95 * r, -len + 1.15 * r, -0.25 * r, 0.95 * r, 1.15 * r, 1.55 * r), r * 0.4);
  // (the groove between the condyles, in front, the kneecap's)
  parts.cut(ellipsoid(0, -len + 1.5 * r, 1.45 * r, 0.45 * r, 1.0 * r, 0.6 * r), r * 0.3);
  return parts.mesh(box(-2 * r, -len - 0.2 * r, -2.2 * r, 4.4 * r, 2 * r, 2.2 * r), r * 0.62);
}

/** A shinbone and its fibula, `len` long from the knee down to the ankle: the tibia's plateau of two condyles, its
 *  tuberosity in front, a shaft narrowing to the ankle and its inner malleolus; the fibula thin beside it, behind and
 *  outside, its own knob at the ankle. */
export function tibia(len: number, r: number): THREE.BufferGeometry {
  const parts = new Parts();
  for (const s of [-1, 1]) parts.join(ellipsoid(s * 0.95 * r, -0.65 * r, -0.1 * r, 1.15 * r, 0.65 * r, 1.35 * r), r * 0.4);
  parts.join(ellipsoid(0, -1.9 * r, 0.85 * r, 0.6 * r, 1.0 * r, 0.5 * r), r * 0.5)
    .join(capsule([0, -1.0 * r, 0], [0, -len * 0.55, 0.1 * r], 1.25 * r, 0.85 * r), r * 0.6)
    .join(capsule([0, -len * 0.55, 0.1 * r], [0, -len + 1.4 * r, 0], 0.85 * r, 0.95 * r), r * 0.5)
    .join(ellipsoid(0, -len + 0.9 * r, 0, 1.15 * r, 0.8 * r, 1.0 * r), r * 0.5)
    .join(capsule([-0.9 * r, -len + 1.3 * r, 0], [-1.0 * r, -len + 0.15 * r, 0.05 * r], 0.45 * r, 0.4 * r), r * 0.3);
  // (the fibula: its own bone, not joined to the tibia but at its ends)
  parts.join(ellipsoid(1.55 * r, -1.25 * r, -0.55 * r, 0.6 * r, 0.6 * r, 0.6 * r), r * 0.1)
    .join(capsule([1.55 * r, -1.3 * r, -0.55 * r], [1.6 * r, -len + 1.0 * r, -0.25 * r], 0.42 * r, 0.38 * r), r * 0.1)
    .join(ellipsoid(1.6 * r, -len + 0.55 * r, -0.2 * r, 0.55 * r, 0.75 * r, 0.55 * r), r * 0.15);
  return parts.mesh(box(-2.4 * r, -len - 0.4 * r, -2 * r, 2.6 * r, 0.4 * r, 2 * r), r * 0.6);
}

/** An upper arm bone `len` long from the shoulder (its head at the joint) to the elbow: the head turned in and back,
 *  its tubercle before it, a shaft, and at its foot the elbow's spread with its spool, a hollow behind for the ulna. */
export function humerus(len: number, r: number): THREE.BufferGeometry {
  const parts = new Parts()
    .join(ellipsoid(-0.35 * r, 0.2 * r, -0.35 * r, 1.75 * r, 1.75 * r, 1.75 * r), r * 0.3)
    .join(ellipsoid(0.9 * r, -0.5 * r, 0.7 * r, 0.9 * r, 1.1 * r, 0.9 * r), r * 0.5)
    .join(capsule([0.2 * r, -1.2 * r, 0], [0, -len + 2.0 * r, 0], 1.1 * r, 0.95 * r), r * 0.6)
    .join(ellipsoid(0, -len + 1.05 * r, -0.1 * r, 2.1 * r, 0.9 * r, 1.0 * r), r * 0.7);
  for (const s of [-1, 1]) parts.join(ellipsoid(s * 0.75 * r, -len + 0.45 * r, 0.25 * r, 0.8 * r, 0.75 * r, 0.8 * r), r * 0.3);
  parts.cut(ellipsoid(0, -len + 1.6 * r, -1.0 * r, 0.7 * r, 0.9 * r, 0.5 * r), r * 0.3);
  return parts.mesh(box(-2.6 * r, -len - 0.5 * r, -2.4 * r, 2.6 * r, 2.2 * r, 2 * r), r * 0.62);
}

/** The two forearm bones `len` long from the elbow to the wrist: the ulna with its hook up behind the elbow, thinning
 *  to the wrist on the inside; the radius from its round head outside, thickening to the wrist on the thumb's side. */
export function forearm(len: number, r: number): THREE.BufferGeometry {
  const parts = new Parts()
    .join(ellipsoid(-0.45 * r, 0.6 * r, -0.85 * r, 0.9 * r, 1.2 * r, 0.9 * r), r * 0.4)
    .join(capsule([-0.45 * r, 0, -0.5 * r], [-0.65 * r, -len + 0.7 * r, -0.15 * r], 0.95 * r, 0.5 * r), r * 0.5)
    .join(ellipsoid(-0.65 * r, -len + 0.45 * r, -0.15 * r, 0.6 * r, 0.5 * r, 0.6 * r), r * 0.2)
    .join(ellipsoid(0.9 * r, -0.35 * r, 0.35 * r, 0.8 * r, 0.4 * r, 0.8 * r), r * 0.2)
    .join(capsule([0.9 * r, -0.6 * r, 0.35 * r], [0.85 * r, -len + 0.9 * r, 0.15 * r], 0.5 * r, 0.85 * r), r * 0.2)
    .join(ellipsoid(0.6 * r, -len + 0.5 * r, 0.1 * r, 1.25 * r, 0.55 * r, 0.95 * r), r * 0.35);
  return parts.mesh(box(-2 * r, -len - 0.4 * r, -2.2 * r, 2.4 * r, 2 * r, 1.8 * r), r * 0.62);
}

// --- the pelvis, the shoulder blade, the breastbone ---------------------------------------------------------

/** A pelvis whose sockets are `hip` m either side of its middle, at its origin (the hips' height): two wings flared
 *  forward and out over the sacrum, the crests along their tops, the sockets cut into their sides, and the rings below
 *  (pubis before, ischium under) left open between their bars. */
export function pelvis(hip: number): THREE.BufferGeometry {
  const h = hip;
  const parts = new Parts();
  for (const s of [-1, 1]) {
    parts.turned(ellipsoid(0, 0, 0, 0.5 * h, 0.55 * h, 0.08 * h), [s * 0.8 * h, 0.5 * h, -0.08 * h], [0, s * 0.55, s * -0.3], 0.08 * h)
      .join(capsule([s * 0.4 * h, 0.95 * h, -0.42 * h], [s * 1.15 * h, 0.82 * h, 0.12 * h], 0.07 * h, 0.08 * h), 0.06 * h)
      .join(capsule([s * 1.15 * h, 0.82 * h, 0.12 * h], [s * 1.0 * h, 0.35 * h, 0.32 * h], 0.08 * h, 0.06 * h), 0.06 * h)
      // the socket's rim, cut out for the thighbone's ball
      .join(ellipsoid(s * 0.92 * h, -0.02 * h, 0.03 * h, 0.3 * h, 0.3 * h, 0.3 * h), 0.1 * h)
      .cut(ellipsoid(s * 1.08 * h, -0.02 * h, 0.06 * h, 0.21 * h, 0.21 * h, 0.21 * h), 0.03 * h)
      // the pubis forward to the join at the middle, the ischium down and back, its lower bar forward again
      .join(capsule([s * 0.82 * h, -0.08 * h, 0.2 * h], [s * 0.12 * h, -0.3 * h, 0.48 * h], 0.09 * h, 0.08 * h), 0.05 * h)
      .join(capsule([s * 0.88 * h, -0.15 * h, -0.05 * h], [s * 0.6 * h, -0.58 * h, -0.12 * h], 0.13 * h, 0.12 * h), 0.06 * h)
      .join(capsule([s * 0.6 * h, -0.58 * h, -0.12 * h], [s * 0.14 * h, -0.42 * h, 0.42 * h], 0.07 * h, 0.06 * h), 0.04 * h);
  }
  // the sacrum, wedged between the wings at the back, and the tail under it
  parts.join(capsule([0, 0.6 * h, -0.5 * h], [0, -0.15 * h, -0.6 * h], 0.32 * h, 0.13 * h), 0.12 * h)
    .join(capsule([0, -0.15 * h, -0.6 * h], [0, -0.38 * h, -0.45 * h], 0.08 * h, 0.04 * h), 0.03 * h)
    .join(ellipsoid(0, -0.32 * h, 0.47 * h, 0.15 * h, 0.2 * h, 0.1 * h), 0.04 * h);
  return parts.mesh(box(-1.4 * h, -0.8 * h, -0.95 * h, 1.4 * h, 1.15 * h, 0.75 * h), h * 0.125);
}

/** A shoulder blade `size` m tall, flat on the back with its outer edge at its origin: its triangle of bone, its thick
 *  outer border, the spine across it out to the acromion, and the shallow socket at its outer corner. */
export function scapula(size: number): THREE.BufferGeometry {
  const k = size;
  const top: V3 = [-0.55 * k, 0, 0], low: V3 = [-0.42 * k, -0.95 * k, 0.02 * k], outer: V3 = [0, -0.05 * k, 0.06 * k];
  const parts = new Parts()
    .join(capsule(top, low, 0.035 * k, 0.04 * k), 0.03 * k)
    .join(capsule(low, outer, 0.05 * k, 0.07 * k), 0.03 * k)
    .join(capsule(top, outer, 0.03 * k, 0.04 * k), 0.03 * k);
  // (its blade between: thin ellipsoids filling the triangle)
  parts.join(ellipsoid(-0.32 * k, -0.32 * k, 0.02 * k, 0.24 * k, 0.3 * k, 0.025 * k), 0.04 * k)
    .join(ellipsoid(-0.38 * k, -0.62 * k, 0.02 * k, 0.12 * k, 0.28 * k, 0.025 * k), 0.04 * k)
    .join(ellipsoid(-0.18 * k, -0.15 * k, 0.04 * k, 0.16 * k, 0.12 * k, 0.03 * k), 0.04 * k)
    // the spine, standing off its back out to the acromion over the socket
    .join(capsule([-0.52 * k, -0.2 * k, -0.04 * k], [0.02 * k, 0.04 * k, -0.07 * k], 0.03 * k, 0.045 * k), 0.03 * k)
    .join(ellipsoid(0.04 * k, 0.05 * k, 0.0, 0.08 * k, 0.04 * k, 0.08 * k), 0.03 * k)
    .join(ellipsoid(0.01 * k, -0.08 * k, 0.09 * k, 0.05 * k, 0.08 * k, 0.04 * k), 0.02 * k);
  return parts.mesh(box(-0.7 * k, -1.05 * k, -0.18 * k, 0.18 * k, 0.15 * k, 0.2 * k), k * 0.062);
}

/** A breastbone `len` m long, down from its origin: the handle at its top, its body in three pieces, the point under. */
export function sternum(len: number): THREE.BufferGeometry {
  const a = len / 7;
  const parts = new Parts()
    .join(ellipsoid(0, -0.6 * a, 0, 1.9 * a, 1.2 * a, 0.45 * a), 0.3 * a)
    .join(ellipsoid(0, -2.3 * a, 0.05 * a, 1.3 * a, 1.0 * a, 0.4 * a), 0.35 * a)
    .join(ellipsoid(0, -3.6 * a, 0.08 * a, 1.35 * a, 1.0 * a, 0.4 * a), 0.35 * a)
    .join(ellipsoid(0, -4.9 * a, 0.08 * a, 1.2 * a, 0.9 * a, 0.38 * a), 0.35 * a)
    .join(capsule([0, -5.6 * a, 0.05 * a], [0, -6.7 * a, 0.25 * a], 0.45 * a, 0.2 * a), 0.2 * a);
  return parts.mesh(box(-2.2 * a, -7.1 * a, -0.7 * a, 2.2 * a, 0.8 * a, 0.9 * a), a * 0.38);
}

// --- tubes with colours: ribs, vertebrae, fingers ---------------------------------------------------------------

/** `g` given vertex colours of `shade` where it has none, so it merges with the sculpted bones (one material). */
export function toned(g: THREE.BufferGeometry, shade = 1): THREE.BufferGeometry {
  if (g.attributes.color || !g.attributes.position) return g;
  const colours = new Float32Array(g.attributes.position.count * 3).fill(shade);
  g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return g;
}

/** A vertebra round its body's middle at the origin, `r` m its body's radius: its body, the spine sticking back and
 *  down from its arch, and a process out to either side; its ribs (if any) meet those. */
export function vertebra(r: number, h: number): THREE.BufferGeometry[] {
  return [
    toned(new THREE.CylinderGeometry(r, r * 1.05, h, 9, 1)),
    toned(taperTube([V(0, 0, -r * 0.9), V(0, -h * 0.35, -r * 1.9), V(0, -h * 0.9, -r * 2.6)], (t) => r * (0.32 - t * 0.16), 3, 5), 0.85),
    toned(taperTube([V(-r * 0.4, h * 0.1, -r * 1.0), V(-r * 1.2, h * 0.2, -r * 1.3), V(-r * 1.9, h * 0.15, -r * 1.25)], (t) => r * (0.28 - t * 0.1), 3, 5), 0.9),
    toned(taperTube([V(r * 0.4, h * 0.1, -r * 1.0), V(r * 1.2, h * 0.2, -r * 1.3), V(r * 1.9, h * 0.15, -r * 1.25)], (t) => r * (0.28 - t * 0.1), 3, 5), 0.9),
  ];
}

/** A finger's bones from its knuckle at the origin: a metacarpal's end already placed, then `lengths` (m) of
 *  phalanges each bent by `curl` (rad) towards +z from the last, set off along `dir`; a knob at each joint. */
export function finger(dir: THREE.Vector3, lengths: number[], curl: number, r: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const at = V(0, 0, 0), way = dir.clone().normalize(), axis = V(1, 0, 0);
  let thick = r;
  for (const length of lengths) {
    out.push(toned(new THREE.SphereGeometry(thick * 1.15, 5, 3).translate(at.x, at.y, at.z), 0.82));
    way.applyAxisAngle(axis, -curl);
    const end = at.clone().addScaledVector(way, length);
    const mid = at.clone().lerp(end, 0.5);
    const from = thick;
    out.push(toned(taperTube([at.clone(), mid, end], (t) => from * (1 - t * 0.2), 3, 4)));
    at.copy(end);
    thick *= 0.82;
  }
  return out;
}

/** `g`'s mirror image across x = 0 (non-indexed, every attribute carried with its corner, its faces kept facing out):
 *  shapes.ts's `mirrorX` leaves the vertex colours where they were, out of step with their corners. */
export function mirrored(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g.clone();
  const p = out.attributes.position, n = out.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    p.setX(i, -p.getX(i));
    if (n) n.setX(i, -n.getX(i));
  }
  for (const attribute of Object.values(out.attributes) as THREE.BufferAttribute[]) {
    for (let i = 0; i + 2 < attribute.count; i += 3) {
      for (let c = 0; c < attribute.itemSize; c++) {
        const second = attribute.getComponent(i + 1, c);
        attribute.setComponent(i + 1, c, attribute.getComponent(i + 2, c));
        attribute.setComponent(i + 2, c, second);
      }
    }
  }
  return out;
}

/** A panel of cloth hung from an arc of radius `r` round the y axis, its middle at angle `at` (0 is +z), `width` m
 *  round it and `h` m long down from y 0: laid in folds deepening down it, flared out by `flare` at its foot, its hem
 *  torn into tongues up to `tear` m shorter, with slits torn up into it between some of them. Drawn two-sided. */
export function drape(o: {
  r: number; at: number; width: number; h: number; tear: number; flare: number; seed: number;
  cols?: number; rows?: number; folds?: number; depth?: number;
}): THREE.BufferGeometry {
  const cols = o.cols ?? 18, rows = o.rows ?? 8, folds = o.folds ?? cols / 2.5, depth = o.depth ?? 0.06;
  let state = o.seed * 9301 + 49297;
  const rnd = (): number => {
    state = (state * 233280 + 49297) % 233280;
    return state / 233280;
  };
  const cut = Array.from({ length: cols + 1 }, () => rnd());
  const slit = Array.from({ length: cols }, () => (rnd() < 0.45 ? 0.3 + rnd() * 0.35 : 0));
  const positions: number[] = [], uvs: number[] = [], index: number[] = [];
  for (let i = 0; i <= cols; i++) {
    const u = i / cols, phi = o.at + (u - 0.5) * o.width / o.r;
    const hem = o.h - o.tear * cut[i] * cut[i];
    for (let j = 0; j <= rows; j++) {
      const v = j / rows;
      const fold = depth * (0.25 + v) * Math.sin(u * folds * Math.PI * 2 + o.seed + 1.7 * Math.sin(u * 5 + o.seed));
      const radius = o.r + o.flare * v * v + fold;
      positions.push(Math.sin(phi) * radius, -v * hem, Math.cos(phi) * radius);
      uvs.push(u * o.width, v * hem);
    }
  }
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      // (a slit torn up from the hem between two tongues: the cells along it left out)
      if (slit[i] && j / rows >= 1 - slit[i] && i % 4 === 2) continue;
      const a = i * (rows + 1) + j, b = a + rows + 1;
      index.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}
