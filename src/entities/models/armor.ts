// Geometry for the heroes' gear: solid plates bent to any surface (with rolled edges), straps that
// wrap round the body, fur tufts, studs, medallions, gloved fingers, and a skirt of cloth or mail that
// swings with the legs. Static pieces go through `Sculpt` (entities/models/shapes.ts) to merge per joint.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { taperTube, twist } from './shapes';
import { part, joint } from './rig';
import { clamp, lerp, smooth } from '../../util';
import { tunable } from '../../core/tuning';

let detail = 1;
/** The heroes' geometric detail, 1 = full (the quality preset's `heroDetail`): heroes built from now on
 *  use fewer hair locks and fur tufts and coarser curves below 1. */
export function setHeroDetail(k: number): void { detail = k; }
export const heroDetail = (): number => detail;
/** `n` scaled by the detail level, at least `min` */
export const lod = (n: number, min = 1): number => Math.max(min, Math.round(n * detail));

/** texture tile (m): uvs count metres / TILE, so every piece has the same texel density */
export const TILE = 0.3;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

const clean = (g: THREE.BufferGeometry): THREE.BufferGeometry => {
  const n = g.index ? g.toNonIndexed() : g;
  if (n !== g) g.dispose();
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k);
  return n;
};
/** merge pieces into one non-indexed geometry (position, normal, uv) */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const list = parts.map(clean);
  const g = mergeGeometries(list)!;
  for (const x of list) x.dispose();
  return g;
}

// (the tubes face out at the source now: they were turned round here, #289)
export { taperTube, twist };

/** scale a geometry's uvs */
export function scaleUV<G extends THREE.BufferGeometry>(g: G, su: number, sv: number): G {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return g;
}

/** A surface point for u, v in 0..1 (u across, v up). */
export type SurfaceFn = (u: number, v: number, out: THREE.Vector3) => THREE.Vector3;

function grid(fn: SurfaceFn, nu: number, nv: number): THREE.Vector3[][] {
  const P: THREE.Vector3[][] = [];
  for (let j = 0; j <= nv; j++) { const row: THREE.Vector3[] = []; for (let i = 0; i <= nu; i++) row.push(fn(i / nu, j / nv, new THREE.Vector3())); P.push(row); }
  return P;
}

/**
 * A plate following `fn`, `thick` deep (a solid with its edges closed), smooth-shaded. Its uvs run in
 * metres / TILE along u and v, unless `uv` gives them per grid point.
 */
export function plate(fn: SurfaceFn, nu: number, nv: number, thick: number, uv?: (u: number, v: number) => [number, number] | null, inside = new THREE.Vector3()): THREE.BufferGeometry {
  const P = grid(fn, nu, nv);
  // arc length along the middle row and column, for the uvs
  const su: number[] = [0], sv: number[] = [0], mj = Math.round(nv / 2), mi = Math.round(nu / 2);
  for (let i = 1; i <= nu; i++) su.push(su[i - 1] + P[mj][i].distanceTo(P[mj][i - 1]) / TILE);
  for (let j = 1; j <= nv; j++) sv.push(sv[j - 1] + P[j][mi].distanceTo(P[j - 1][mi]) / TILE);
  const pos: number[] = [], uvs: number[] = [], idx: number[] = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    pos.push(P[j][i].x, P[j][i].y, P[j][i].z);
    uvs.push(...(uv?.(i / nu, j / nv) ?? [su[i], sv[j]]));
  }
  const w = nu + 1;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * w + i; idx.push(a, a + 1, a + w, a + 1, a + w + 1, a + w); }
  const outer = new THREE.BufferGeometry();
  outer.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  outer.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  outer.setIndex(idx);
  outer.computeVertexNormals();
  let facing = 0;
  const on = outer.attributes.normal;
  for (let i = 0; i < on.count; i++) facing += on.getX(i) * (pos[i * 3] - inside.x) + on.getY(i) * (pos[i * 3 + 1] - inside.y) + on.getZ(i) * (pos[i * 3 + 2] - inside.z);
  if (facing < 0) {
    for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
    outer.setIndex(idx);
    outer.computeVertexNormals();
  }
  if (thick <= 0) return clean(outer);
  // the back face, the front pushed in along its normals, wound the other way
  const inner = outer.clone(), ip = inner.attributes.position, n = outer.attributes.normal;
  for (let i = 0; i < ip.count; i++) ip.setXYZ(i, ip.getX(i) - n.getX(i) * thick, ip.getY(i) - n.getY(i) * thick, ip.getZ(i) - n.getZ(i) * thick);
  const ri: number[] = [];
  for (let k = 0; k < idx.length; k += 3) ri.push(idx[k], idx[k + 2], idx[k + 1]);
  inner.setIndex(ri);
  inner.computeVertexNormals();
  // the edges: a strip joining each border of the front to the back's
  const rim: number[] = [], rimUV: number[] = [];
  const edge = (ids: number[]) => {
    for (let k = 0; k + 1 < ids.length; k++) {
      const a = ids[k], b = ids[k + 1];
      const A = [pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]], B = [pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]];
      const Ai = [ip.getX(a), ip.getY(a), ip.getZ(a)], Bi = [ip.getX(b), ip.getY(b), ip.getZ(b)];
      rim.push(...A, ...Ai, ...B, ...B, ...Ai, ...Bi);
      rimUV.push(0, 0, 0, 0.05, 0.3, 0, 0.3, 0, 0, 0.05, 0.3, 0.05);
    }
  };
  const bottom = [...Array(w).keys()], top = bottom.map((i) => nv * w + i).reverse();
  const right = [...Array(nv + 1).keys()].map((j) => j * w + nu), left = right.map((x) => x - nu).reverse();
  edge(bottom); edge(right); edge(top); edge(left);
  const r = new THREE.BufferGeometry();
  r.setAttribute('position', new THREE.Float32BufferAttribute(rim, 3));
  r.setAttribute('uv', new THREE.Float32BufferAttribute(rimUV, 2));
  r.computeVertexNormals();
  // the rim's winding depends on which way the surface faces: turn it round if it faces inwards
  const rn = r.attributes.normal, rp = r.attributes.position;
  _a.fromBufferAttribute(rp, 0); _b.fromBufferAttribute(rp, 2);
  _c.set(P[0][Math.min(1, nu)].x - P[1][Math.min(1, nu)].x, P[0][Math.min(1, nu)].y - P[1][Math.min(1, nu)].y, P[0][Math.min(1, nu)].z - P[1][Math.min(1, nu)].z);
  if (_a.set(rn.getX(0), rn.getY(0), rn.getZ(0)).dot(_c) < 0) {
    for (let i = 0; i < rp.count; i += 3) for (const at of [rp, rn, r.attributes.uv]) for (let c = 0; c < at.itemSize; c++) {
      const t = at.getComponent(i + 1, c); at.setComponent(i + 1, c, at.getComponent(i + 2, c)); at.setComponent(i + 2, c, t);
    }
    r.computeVertexNormals();
  }
  return merge([outer, inner, r]);
}

/** A round tube along one edge of a surface (a rolled rim): 'v0' the bottom, 'v1' the top, 'u0' / 'u1' the sides. */
export function edgeTube(fn: SurfaceFn, edge: 'u0' | 'u1' | 'v0' | 'v1', r: number, n = 16, inset = 0): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    pts.push(edge[0] === 'u' ? fn(edge === 'u0' ? inset : 1 - inset, t, new THREE.Vector3()) : fn(t, edge === 'v0' ? inset : 1 - inset, new THREE.Vector3()));
  }
  return scaleUV(taperTube(pts, () => r, n * 2, 6), 1, 4);
}

/** outward from the vertical axis through the origin: straps round a torso or a limb */
export const RADIAL = (p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 => out.set(p.x, 0, p.z).normalize();

/**
 * A flat strap `w` wide and `t` thick along a curve through `pts`, lying flat against the body (its face
 * turned to `outward(p)`); `closed` makes it a loop (a belt).
 */
export function strap(pts: THREE.Vector3[], w: number, t: number, closed = false, outward = RADIAL, n = 0): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts, closed);
  const segs = n || Math.max(4, Math.ceil(curve.getLength() / 0.02));
  const pos: number[] = [], uv: number[] = [];
  const S: THREE.Vector3[][] = [], L = curve.getLength() / TILE;
  const T = new THREE.Vector3(), O = new THREE.Vector3(), X = new THREE.Vector3(), p = new THREE.Vector3();
  for (let k = 0; k <= segs; k++) {
    const s = k / segs;
    curve.getPointAt(s, p); curve.getTangentAt(s, T);
    outward(p, O); O.addScaledVector(T, -O.dot(T)).normalize();
    X.crossVectors(T, O).normalize();
    // corners: outer left, outer right, inner right, inner left
    S.push([
      p.clone().addScaledVector(X, -w / 2).addScaledVector(O, t), p.clone().addScaledVector(X, w / 2).addScaledVector(O, t),
      p.clone().addScaledVector(X, w / 2), p.clone().addScaledVector(X, -w / 2),
    ]);
  }
  // four faces, each its own strip so the edges stay crisp
  for (let f = 0; f < 4; f++) {
    const a = f, b = (f + 1) % 4, wid = f % 2 ? t / TILE : w / TILE;
    for (let k = 0; k < segs; k++) {
      const q = [S[k][a], S[k][b], S[k + 1][a], S[k + 1][b]], v0 = (k / segs) * L, v1 = ((k + 1) / segs) * L;
      pos.push(...q[0].toArray(), ...q[1].toArray(), ...q[2].toArray(), ...q[2].toArray(), ...q[1].toArray(), ...q[3].toArray());
      uv.push(0, v0, wid, v0, 0, v1, 0, v1, wid, v0, wid, v1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** a loop of strap round an ellipse (rx by rz) at height y: a belt, a band round a limb */
export function belt(rx: number, rz: number, y: number, w: number, t: number, tilt = 0, n = 24): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; pts.push(new THREE.Vector3(Math.sin(a) * rx, y + Math.cos(a) * tilt, Math.cos(a) * rz)); }
  return strap(pts, w, t, true, RADIAL, n * 3);
}

/** Stitches along a seam: short dashes of thread through `pts` (a smooth curve), `len` long with `gap` between, standing
 *  on the cloth; one merged geometry. */
export function stitches(pts: THREE.Vector3[], len = 0.0045, gap = 0.003, r = 0.0011, closed = false): THREE.BufferGeometry {
  const c = new THREE.CatmullRomCurve3(pts, closed), L = c.getLength(), n = Math.max(1, Math.floor(L / (len + gap))), parts: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), t = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, p = c.getPointAt(u); c.getTangentAt(u, t);
    q.setFromUnitVectors(up, t);
    parts.push(new THREE.CylinderGeometry(r, r, len, 4, 1).applyQuaternion(q).translate(p.x, p.y, p.z));
  }
  return merge(parts);
}

/** A buckle: a flat rectangular frame with a pin, facing +Z. */
export function buckle(w: number, h: number, t = 0.006): THREE.BufferGeometry {
  const bar = t * 1.2, parts: THREE.BufferGeometry[] = [];
  for (const s of [1, -1]) {
    parts.push(new THREE.BoxGeometry(w, bar, t).translate(0, s * (h - bar) / 2, 0));
    parts.push(new THREE.BoxGeometry(bar, h, t).translate(s * (w - bar) / 2, 0, 0));
  }
  parts.push(new THREE.BoxGeometry(w * 0.55, bar * 0.6, t).translate(0, 0, t * 0.6));
  return merge(parts);
}

/** A stud: a small dome facing +Z. */
export const stud = (r: number): THREE.BufferGeometry => new THREE.SphereGeometry(r, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2);

/** A medallion facing +Z: a raised rim round a slightly domed face, `t` thick. */
export function disc(r: number, t: number, segs = 32): THREE.BufferGeometry {
  const prof: [number, number][] = [[0.001, -t * 0.5], [r, -t * 0.5], [r, t * 0.35], [r * 0.93, t * 0.5], [r * 0.86, t * 0.3], [r * 0.6, t * 0.45], [0.001, t * 0.6]];
  return new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), segs).rotateX(Math.PI / 2);
}

/** A cut gem facing +Z: a low crown over a pointed pavilion. */
export const gem = (r: number): THREE.BufferGeometry =>
  new THREE.LatheGeometry([[0.001, -r * 0.8], [r, 0], [r * 0.6, r * 0.45], [0.001, r * 0.5]].map(([a, b]) => new THREE.Vector2(a, b)), 8).rotateX(Math.PI / 2);

/**
 * Fur: `n` tufts, each rooted where `at(i)` puts it and growing along its direction, drooping under
 * their own weight; `len` and `rad` are the tufts' size, varied by `rng`.
 */
export function furTufts(rng: () => number, n: number, at: (i: number, out: { p: THREE.Vector3; d: THREE.Vector3 }) => void, len: number, rad: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [], o = { p: new THREE.Vector3(), d: new THREE.Vector3() };
  // fewer, fuller tufts at lower detail
  const m = lod(n, 4), k = Math.sqrt(n / m);
  for (let i = 0; i < m; i++) {
    at(Math.floor(i * n / m), o);
    const l = len * (0.7 + rng() * 0.6), d = o.d.clone().normalize();
    d.x += (rng() - 0.5) * 0.5; d.z += (rng() - 0.5) * 0.5; d.normalize();
    const pts = [o.p.clone(), o.p.clone().addScaledVector(d, l * 0.5).add(_a.set(0, -l * 0.12, 0)), o.p.clone().addScaledVector(d, l).add(_a.set(0, -l * 0.35, 0))];
    const r = rad * (0.7 + rng() * 0.6) * k;
    parts.push(scaleUV(taperTube(pts, (t) => r * (1 - t * 0.85), 3, 4), 1, 3));
  }
  return merge(parts);
}

// --- fingers -----------------------------------------------------------------------------------

export interface Finger { base: THREE.Group; mid: THREE.Group }
export interface Hand { f: Finger[]; thumb: Finger; s: number }

/**
 * Four fingers and a thumb on a rig hand joint, two knuckles each: the palm faces -z, so a finger curls
 * with +x, and the thumb sits on the inner side (`s` +1 the left hand, -1 the right). `mat` covers the
 * first knuckle, `tipMat` the second (bare fingertips out of a fingerless glove); `k` scales the hand.
 */
export function fingers(hand: THREE.Group, s: number, mat: THREE.Material, tipMat = mat, k = 1): Hand {
  const seg = (parent: THREE.Group, len: number, r: number, m: THREE.Material) => {
    part(new THREE.CapsuleGeometry(r, len - 2 * r, 3, 6), m, parent, 0, -len / 2, 0).castShadow = false;
  };
  const f = ([[-0.026, 0.034, 0.027], [-0.009, 0.037, 0.03], [0.008, 0.034, 0.027], [0.024, 0.028, 0.022]] as const).map(([x, l1, l2]) => {
    const base = joint(hand, s * x * k, -0.098 * k, -0.004 * k);
    seg(base, l1 * k, 0.0088 * k, mat);
    const mid = joint(base, 0, -l1 * k, 0);
    seg(mid, l2 * k, 0.0078 * k, tipMat);
    return { base, mid };
  });
  const tb = joint(hand, -s * 0.034 * k, -0.05 * k, -0.012 * k);
  seg(tb, 0.032 * k, 0.0095 * k, mat);
  const tm = joint(tb, 0, -0.032 * k, 0);
  seg(tm, 0.026 * k, 0.0085 * k, tipMat);
  return { f, thumb: { base: tb, mid: tm }, s };
}

/**
 * Pose a hand: `curl` bends every finger into the palm (0 flat, ~1.4 a fist), `spread` fans them,
 * `point` straightens the index and middle fingers (the other two stay curled), `twitch` a tremor.
 */
export function poseHand(h: Hand, curl: number, spread: number, point = 0, t = 0, twitch = 0): void {
  const s = h.s;
  h.f.forEach((f, i) => {
    const c = (i < 2 ? curl * (1 - point) : curl + point * 1.1) * (0.9 + i * 0.07) + Math.sin(t * 23 + i * 1.7) * twitch;
    f.base.rotation.set(c, 0, s * (i - 1.5) * spread * 0.35);
    f.mid.rotation.set(c * 1.15, 0, 0);
  });
  const tc = curl * 0.6 + point * 0.5;
  h.thumb.base.rotation.set(0.35 + tc * 0.5, 0, -s * (0.55 - spread * 0.4));
  h.thumb.mid.rotation.set(tc * 0.8, 0, 0);
}

// --- skirt -------------------------------------------------------------------------------------

export interface SkirtOpts {
  /** radius at the waist and at the hem, length, and depth (z) as a share of width */
  r0: number; r1: number; len: number; depth?: number;
  /** vertical folds round it and their depth (share of the radius, growing to the hem) */
  folds?: number; foldAmp?: number;
  /** extra length at angle a (0 = front, +x = the left): tails, a longer back */
  hem?: (a: number) => number;
  radial?: number; rows?: number;
  /** how much it flares with speed, and how far the legs push it */
  flare?: number; push?: number;
  /** how much further out than the limbs it lies (m): a skirt worn over another */
  layer?: number;
  /** a band this share of the length deep round the hem, drawn with the mesh's second material (a trim) */
  trim?: number;
  /** the front seam parted into a slit: from this share of the length down, eased open to `gap` across at the hem
   *  (m), its two edges hanging straight (a long coat's; cut out of the hem, a slit was a V two columns wide) */
  slit?: { from: number; gap: number };
}

/** A limb a skirt keeps clear of, in the skirt's own space: from `a` (radius `ra`) to `b` (radius `rb`), the cloth's gap
 *  included. */
export interface SkirtBody { a: THREE.Vector3; b: THREE.Vector3; ra: number; rb: number }
/** a point in a joint's own frame */
export type JointPoint = [THREE.Object3D, THREE.Vector3];
/** A model's limbs as a skirt's bodies (`list`): capsules between points on its joints, put into the skirt's space after the
 *  pose (`place`, the joints' world matrices up to date) */
export class SkirtLimbs {
  readonly list: SkirtBody[] = [];
  private ends: [JointPoint, JointPoint][] = [];
  /** a capsule from `a` (radius `ra`) to `b` (`rb`); the body is returned, so its radii can change */
  add(a: JointPoint, b: JointPoint, ra: number, rb = ra): SkirtBody {
    const s = { a: new THREE.Vector3(), b: new THREE.Vector3(), ra, rb };
    this.list.push(s); this.ends.push([a, b]);
    return s;
  }
  place(space: THREE.Object3D): void {
    for (let k = 0; k < this.list.length; k++) {
      const [[oa, pa], [ob, pb]] = this.ends[k], s = this.list[k];
      space.worldToLocal(oa.localToWorld(s.a.copy(pa))); space.worldToLocal(ob.localToWorld(s.b.copy(pb)));
    }
  }
}

/** An arm swung out at its shoulder just enough to keep its hand off a thigh and the cloth over it (a hand brushing a moving
 *  thigh rests on the skirt, never in it): points on the arm (`pts`, each with its radius: the ends of the hand's capsules, the
 *  cuff's) against the thigh's body (in `space`, placed) grown by `cloth` (what lies between), the shoulder turned out about its
 *  z (`side`: +1 the left arm) by the deepest's depth over its distance from the shoulder, a few times over. Pressed in between
 *  the hand and the thigh, the drape had no room to hold the skirt in behind the hand. */
export function armOffThigh(space: THREE.Object3D, shoulder: THREE.Object3D, side: number, thigh: SkirtBody, cloth: number, pts: [JointPoint, number][]): void {
  _sab.subVectors(thigh.b, thigh.a);
  const L2 = Math.max(1e-9, _sab.lengthSq());
  for (let it = 0; it < 3; it++) {
    let deep = 0, at = 0;
    for (const [[o, p], r] of pts) {
      space.worldToLocal(o.localToWorld(_sp.copy(p)));
      const u = clamp(_sq.subVectors(_sp, thigh.a).dot(_sab) / L2, 0, 1);
      const d = thigh.ra + (thigh.rb - thigh.ra) * u + cloth + r - _sp.distanceTo(_sq.copy(thigh.a).addScaledVector(_sab, u));
      if (d > deep) { deep = d; at = _sp.distanceTo(space.worldToLocal(shoulder.getWorldPosition(_sn))); }
    }
    if (deep <= 0.001) return;
    shoulder.rotation.z += side * Math.min(0.12, deep / Math.max(0.2, at));
    shoulder.updateMatrixWorld(true);
  }
}

/**
 * A skirt hanging from the hips: one continuous surface whose columns swing out from the waist as the
 * legs push them, flare with speed and lag a little behind (a spring per column). Call `update` after
 * posing the legs; draw `geo` with the outer material, and again with a back-face lining if wanted.
 * Given the limbs (`update`'s `legs` and `hands`), the posed cloth is then draped over them: each point inside a leg moved
 * out from the skirt's middle and up until it is clear, each a hand reaches or lies just outside put in behind it (the legs
 * having the last word), every point held to its length down the cloth and round it, so it lies over a raised knee and hangs
 * on below it. (Swung by the thighs' angles alone, a knee lifted at a run came out through the front and the flare swept over
 * a hand at the side; swinging whole columns out past the knee instead stood the cloth out as a stiff cone, in points.)
 */
const smoothstep = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

export class Skirt {
  readonly geo = new THREE.BufferGeometry();
  private rest: Float32Array;
  private ang: Float32Array;
  private theta: Float32Array;
  private vel: Float32Array;
  /** each point's sideways parting at the slit (m: `SkirtOpts.slit`) */
  private open: Float32Array;
  /** points round it in each row (the last a copy of the first, at the seam) */
  readonly cols: number;

  constructor(private o: SkirtOpts) {
    const radial = o.radial ?? 40, body = o.rows ?? 10, depth = o.depth ?? 0.85, trim = o.trim ?? 0;
    const rows = body + (trim ? 1 : 0);
    this.cols = radial + 1;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [], open: number[] = [];
    this.ang = new Float32Array(this.cols);
    for (let j = 0; j <= rows; j++) {
      const k = j <= body ? (j / body) * (1 - trim) : 1;
      for (let i = 0; i <= radial; i++) {
        const a = (i / radial) * Math.PI * 2;
        this.ang[i] = a;
        const len = o.len * (1 + (o.hem?.(a) ?? 0));
        const r = (o.r0 + (o.r1 - o.r0) * Math.pow(k, 0.8)) * (1 + (o.foldAmp ?? 0.05) * k * Math.sin(a * (o.folds ?? 9)));
        // (the front seam's two columns, the first and the last, parted either way: kept apart from the rest place, which
        // the swing turns about the skirt's middle, and added after it)
        open.push(o.slit && (i === 0 || i === radial) ? (i === 0 ? 0.5 : -0.5) * o.slit.gap * smoothstep(o.slit.from, 1, k) : 0);
        pos.push(Math.sin(a) * r + open[open.length - 1], -len * k, Math.cos(a) * r * depth);
        uv.push((i / radial) * (Math.PI * 2 * o.r1) / TILE, (1 - k) * len / TILE);
      }
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < radial; i++) {
      const a = j * this.cols + i, b = a + this.cols;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    this.open = new Float32Array(open);
    this.rest = new Float32Array(pos);
    for (let n = 0; n < open.length; n++) this.rest[n * 3] -= open[n];
    // (the lab's handle on it: tools/lab coat)
    this.geo.name = 'skirt';
    this.geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    this.geo.setIndex(idx);
    if (trim) { const n = body * radial * 6; this.geo.addGroup(0, n, 0); this.geo.addGroup(n, idx.length - n, 1); }
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
    this.geo.boundingSphere!.radius *= 1.6;
    this.theta = new Float32Array(this.cols);
    this.vel = new Float32Array(this.cols);
  }

  /** `fL`, `fR`: how far forward each thigh swings (radians); `move` 0..1; `t`, `dt` in seconds; `legs` and `hands`, the
   *  limbs it keeps clear of from inside and from outside (the skirt's own space) */
  update(fL: number, fR: number, move: number, t: number, dt: number, legs?: SkirtBody[], hands?: SkirtBody[]): void {
    const o = this.o, depth = o.depth ?? 0.85, push = o.push ?? 0.8, flare = o.flare ?? 1;
    const p = this.geo.attributes.position as THREE.BufferAttribute, R = this.rest;
    const h = Math.min(dt, 0.05);
    for (let i = 0; i < this.cols; i++) {
      const a = this.ang[i], sx = Math.sin(a), cz = Math.cos(a);
      const wl = clamp(0.5 + sx * 0.9, 0, 1);
      const legPush = (fL * wl + fR * (1 - wl)) * cz;
      const target = Math.max(-0.1, legPush * push) + (0.04 + move * 0.08 + Math.sin(t * 3 + a * 3) * 0.015) * flare + (cz > 0 ? 0 : move * 0.25 * -cz) * flare;
      // a stiff, damped spring: cloth follows the legs a moment late and settles without wobbling
      if (h > 0) {
        this.vel[i] += ((target - this.theta[i]) * 260 - this.vel[i] * 26) * h;
        this.theta[i] += this.vel[i] * h;
      } else this.theta[i] = target;
      const th = this.theta[i], c = Math.cos(th), s = Math.sin(th);
      for (let j = i; j < R.length / 3; j += this.cols) {
        const x = R[j * 3], y = R[j * 3 + 1], z = R[j * 3 + 2] / depth;
        const r = Math.hypot(x, z), r0 = o.r0, dr = r - r0;
        const nr = r0 + dr * c - y * s, ny = y * c + dr * s;
        p.setXYZ(j, sx * nr + this.open[j], ny, cz * nr * depth);
      }
    }
    if (legs?.length || hands?.length) this.drape(legs ?? [], hands ?? []);
    p.needsUpdate = true;
    vertexNormals(this.geo);
  }

  /** Point `p` (in the mesh's own space) put outside the cloth as it lies now, `gap` further out: out from the skirt's middle,
   *  where it is between the waist and the hem. Whether it moved. (A sleeve hanging beside it: kept off an ellipse the size of
   *  the hips, it hung into the cloth draped out over the thighs.) */
  pushOut(p: THREE.Vector3, gap: number): boolean {
    const P = (this.geo.attributes.position as THREE.BufferAttribute).array as Float32Array, C = this.cols, R = P.length / 3 / C, depth = this.o.depth ?? 0.85;
    if (p.y >= P[1]) return false;
    const u = ((Math.atan2(p.x, p.z / depth) / (Math.PI * 2) + 1) % 1) * (C - 1), i0 = Math.min(C - 2, Math.floor(u)), f = u - i0;
    let r = 0;
    for (let s = 0; s < 2; s++) {
      // (down the column to the two rows either side of its height)
      const i = i0 + s;
      let k = 0;
      while (k < R - 1 && P[((k + 1) * C + i) * 3 + 1] > p.y) k++;
      if (k === R - 1) return false;
      const a = (k * C + i) * 3, b = a + C * 3, ya = P[a + 1], yb = P[b + 1], t = ya > yb ? clamp((ya - p.y) / (ya - yb), 0, 1) : 0;
      r += (s ? f : 1 - f) * lerp(Math.hypot(P[a], P[a + 2] / depth), Math.hypot(P[b], P[b + 2] / depth), t);
    }
    const rp = Math.hypot(p.x, p.z / depth), want = r + gap;
    if (rp >= want || rp < 1e-6) return false;
    p.x *= want / rp; p.z *= want / rp;
    return true;
  }

  /** each point's length to the one above it and to the next round, as cut */
  private lens?: { down: Float32Array; round: Float32Array };
  private boxes = new Float32Array(0);
  /** The posed cloth over the limbs: a few rounds of putting each point the limbs reach out of them and holding the points to
   *  their lengths (a little give: cloth stretches) down the cloth from the waist and round it, ending off the limbs. */
  private drape(legs: SkirtBody[], hands: SkirtBody[]): void {
    const P = (this.geo.attributes.position as THREE.BufferAttribute).array as Float32Array, C = this.cols, n = P.length / 3, R = this.rest;
    if (!this.lens) {
      const down = new Float32Array(n), round = new Float32Array(n), d = (a: number, b: number) => Math.hypot(R[a * 3] - R[b * 3], R[a * 3 + 1] - R[b * 3 + 1], R[a * 3 + 2] - R[b * 3 + 2]);
      for (let j = C; j < n; j++) down[j] = d(j, j - C);
      for (let j = 0; j < n; j++) if (j % C < C - 1) round[j] = d(j, j + 1);
      this.lens = { down, round };
    }
    const { down, round } = this.lens, layer = this.o.layer ?? 0, slit = !!this.o.slit;
    // (limb by limb, each point a limb's box doesn't hold skipped, and the limbs in runs whose boxes overlap, a point outside a
    // run's box skipping all of it: most points are nowhere near most limbs, a hand's dozen capsules among them; each point
    // still meets the hands before the legs)
    const nb = hands.length + legs.length, B = this.boxes.length >= (nb * 2 + 1) * 6 ? this.boxes : (this.boxes = new Float32Array((nb * 2 + 1) * 6));
    const body = (q: number): SkirtBody => (q < hands.length ? hands[q] : legs[q - hands.length]);
    const runs: number[] = [];
    for (let q = 0; q < nb; q++) {
      const b = body(q), r = Math.max(b.ra, b.rb) + (q < hands.length ? HAND_REACH : layer), k = q * 6;
      B[k] = Math.min(b.a.x, b.b.x) - r; B[k + 1] = Math.max(b.a.x, b.b.x) + r; B[k + 2] = Math.min(b.a.y, b.b.y) - r;
      B[k + 3] = Math.max(b.a.y, b.b.y) + r; B[k + 4] = Math.min(b.a.z, b.b.z) - r; B[k + 5] = Math.max(b.a.z, b.b.z) + r;
      const g = (nb + runs.length / 2 - 1) * 6, joins = runs.length > 0 && q !== hands.length
        && B[k] <= B[g + 1] && B[k + 1] >= B[g] && B[k + 2] <= B[g + 3] && B[k + 3] >= B[g + 2] && B[k + 4] <= B[g + 5] && B[k + 5] >= B[g + 4];
      if (joins) { runs[runs.length - 1] = q + 1; for (let c = 0; c < 6; c += 2) { B[g + c] = Math.min(B[g + c], B[k + c]); B[g + c + 1] = Math.max(B[g + c + 1], B[k + c + 1]); } }
      else { runs.push(q, q + 1); const h = (nb + runs.length / 2 - 1) * 6; for (let c = 0; c < 6; c++) B[h + c] = B[k + c]; }
    }
    const offAll = (lines: boolean) => {
      for (let g = 0; g < runs.length; g += 2) {
        const G = (nb + g / 2) * 6, q0 = runs[g], q1 = runs[g + 1], leg = q0 >= hands.length, withLines = leg && lines;
        const gx0 = B[G], gx1 = B[G + 1], gy0 = B[G + 2], gy1 = B[G + 3], gz0 = B[G + 4], gz1 = B[G + 5];
        // (row by row and round each, as j runs from the first row's first point: no division a point)
        for (let j = C, c = 0; j < n; j++, c = c === C - 1 ? 0 : c + 1) {
          const x = P[j * 3], y = P[j * 3 + 1], z = P[j * 3 + 2];
          // (a point outside the run's box, the cloth to its neighbours aside, skipped before anything else is read)
          if (!withLines && (x < gx0 || x > gx1 || y < gy0 || y > gy1 || z < gz0 || z > gz1)) continue;
          // (against a leg, the cloth from the point above and to the next round too: their box; the last column is the first's
          // copy, so the one before it goes on to the first, and the copy itself to none; parted in a slit, the last is a
          // point of its own and the one before it goes on to it)
          const a = (j - C) * 3, nx = c === C - 2 && !slit ? j + 2 - C : c === C - 1 ? j : j + 1, e = nx * 3;
          let x0 = x, x1 = x, y0 = y, y1 = y, z0 = z, z1 = z;
          if (withLines) {
            x0 = Math.min(x, P[a], P[e]); x1 = Math.max(x, P[a], P[e]); y0 = Math.min(y, P[a + 1], P[e + 1]);
            y1 = Math.max(y, P[a + 1], P[e + 1]); z0 = Math.min(z, P[a + 2], P[e + 2]); z1 = Math.max(z, P[a + 2], P[e + 2]);
            if (x1 < gx0 || x0 > gx1 || y1 < gy0 || y0 > gy1 || z1 < gz0 || z0 > gz1) continue;
          }
          for (let q = q0; q < q1; q++) {
            const k = q * 6;
            if (x1 < B[k] || x0 > B[k + 1] || y1 < B[k + 2] || y0 > B[k + 3] || z1 < B[k + 4] || z0 > B[k + 5]) continue;
            if (!leg) { this.off(P, j, body(q), 0, true); continue; }
            const b = body(q);
            this.off(P, j, b, layer, false);
            if (!lines) continue;
            this.over(P, j, j - C, down[j], b, layer);
            // (and round it: of two neighbours either side of a leg, the one nearer the skirt's middle is inside it, under a raised
            // knee, and goes round)
            if (c < C - 1) {
              if (P[j * 3] ** 2 + P[j * 3 + 2] ** 2 < P[e] ** 2 + P[e + 2] ** 2) this.over(P, j, nx, round[j], b, layer, ROUND_SLACK);
              else this.over(P, nx, j, round[j], b, layer, ROUND_SLACK);
            }
          }
        }
      }
    };
    // (the lines between points kept out of the legs in the last passes only: the first pull the cloth most of the way)
    const passes = DRAPE.passes;
    for (let it = 0; it < passes; it++) {
      offAll(it >= passes - 1);
      // (down the cloth from the waist, which stays: each point no further from the one above than its length and a little)
      for (let j = C; j < n; j++) pull(P, j, j - C, down[j] * 1.04, 1);
      // (round it: neighbours no further apart than theirs and a little, both moving; across the seam the last column but one
      // with the first, the last being a copy of the first: tied to that copy, the cloth parted down the front)
      for (let j = C; j < n; j++) if (j % C < C - 1) pull(P, j, j % C === C - 2 && !slit ? j + 2 - C : j + 1, round[j] * 1.15, 0.5);
      // (the seam where the last column meets the first, unless it's parted in a slit: welded every frame, a slit closed)
      if (!slit) for (let j = C - 1; j < n; j += C) for (let k = 0; k < 3; k++) P[j * 3 + k] = P[(j - C + 1) * 3 + k];
    }
    // (ending off the limbs: the lengths last pulled points back into a thigh; and the seam closed again, unless it's a slit)
    offAll(true);
    if (!slit) for (let j = C - 1; j < n; j += C) for (let k = 0; k < 3; k++) P[j * 3 + k] = P[(j - C + 1) * 3 + k];
  }

  /** Point `j` put out of limb `b` (and `extra` further): a leg's moved away from the skirt's middle and up until it is clear
   *  (the cloth hangs from the waist outside the legs and over a raised thigh, never under it; put out by the nearest side, the
   *  points round a knee went every way round it and the cloth crumpled), a hand's on its side towards the middle. */
  private off(P: Float32Array, j: number, b: SkirtBody, extra: number, inward: boolean): void {
    _sp.set(P[j * 3], P[j * 3 + 1], P[j * 3 + 2]);
    _sab.subVectors(b.b, b.a);
    const L2 = _sab.lengthSq(), u = L2 > 1e-9 ? Math.min(1, Math.max(0, _sq.subVectors(_sp, b.a).dot(_sab) / L2)) : 0;
    _sq.copy(b.a).addScaledVector(_sab, u);
    const rad = b.ra + (b.rb - b.ra) * u + extra, dn = _sn.subVectors(_sp, _sq), d = dn.length();
    if (inward) { this.behind(P, j, dn, rad, L2); return; }
    if (d >= rad) return;
    // (the way out preferred: from the skirt's middle and up; across the limb)
    _so.set(_sp.x, 0, _sp.z).normalize(); _so.y += 0.6;
    if (L2 > 1e-9) _so.addScaledVector(_sab, -_so.dot(_sab) / L2);
    if (_so.lengthSq() > 1e-12) {
      // (along that way to where it leaves the limb: the distance to the axis grows no faster than the step)
      _so.normalize();
      for (let it = 0, g = rad - d; it < 8 && g > 0; it++) {
        _sp.addScaledVector(_so, g + 1e-4);
        const w = L2 > 1e-9 ? Math.min(1, Math.max(0, _sq.subVectors(_sp, b.a).dot(_sab) / L2)) : 0;
        g = b.ra + (b.rb - b.ra) * w + extra - _sp.distanceTo(_sq.copy(b.a).addScaledVector(_sab, w));
      }
      P[j * 3] = _sp.x; P[j * 3 + 1] = _sp.y; P[j * 3 + 2] = _sp.z;
      return;
    }
    if (d < 1e-6 || dn.dot(_so) < 0) dn.copy(_so);
    if (dn.lengthSq() < 1e-12) return;
    _sp.copy(_sq).addScaledVector(dn.normalize(), rad);
    P[j * 3] = _sp.x; P[j * 3 + 1] = _sp.y; P[j * 3 + 2] = _sp.z;
  }

  /** Point `j` (at `_sp`, `dn` from the nearest point on a limb's axis, `rad` its radius there, `L2` its axis's length
   *  squared in `_sab`) held in behind a limb lying on the cloth from outside (a hand, a bow): moved straight in, towards
   *  the skirt's middle across the limb, until it lies behind the limb's surface there, as much as the limb overlaps it
   *  seen from outside, and eased to nothing over `HAND_REACH` past the limb's side. A hanging hand's sway brought points
   *  in and out of its reach, and each put round onto its far side jumped by the hand's width: the ranger's coat jumped up
   *  to 11 cm a frame behind his hands as he stood, "moving unnaturally". */
  private behind(P: Float32Array, j: number, dn: THREE.Vector3, rad: number, L2: number): void {
    _so.set(-_sp.x, 0, -_sp.z);
    if (L2 > 1e-9) _so.addScaledVector(_sab, -_so.dot(_sab) / L2);
    if (_so.lengthSq() < 1e-12) return;
    _so.normalize();
    // (how far behind the axis it lies, and how far to the side of the way in)
    const back = dn.dot(_so), side = Math.sqrt(Math.max(0, dn.lengthSq() - back * back));
    if (side >= rad + HAND_REACH) return;
    const depth = side < rad ? Math.sqrt(rad * rad - side * side) : 0;
    const k = side <= rad ? 1 : 1 - smooth((side - rad) / HAND_REACH);
    const need = (depth - back) * k;
    if (need <= 0) return;
    P[j * 3] += _so.x * need; P[j * 3 + 1] += _so.y * need; P[j * 3 + 2] += _so.z * need;
  }

  /** The cloth from point `i` down to point `j` (`len` apart) kept out of leg `b` too (`extra` further): where it passes through
   *  the leg, `j` is on the leg's far side from where the cloth comes (outside, under a raised thigh or in front of a raised knee),
   *  and it is put round onto the leg's surface where that line went deepest and on over it, along the surface, by the length
   *  left. Points outside a leg were left where they were, and the cloth between a point over a thigh raised near level and the
   *  next under it went through it: the front's middle split round it and the leg came out between two columns; put only where
   *  the line went deepest, the cloth came up short over the thigh. */
  private over(P: Float32Array, j: number, i: number, len: number, b: SkirtBody, extra: number, slack = 0): void {
    // (the closest points of the line and the leg's axis)
    _sp.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); _sd.set(P[j * 3] - _sp.x, P[j * 3 + 1] - _sp.y, P[j * 3 + 2] - _sp.z);
    _sab.subVectors(b.b, b.a); _sn.subVectors(_sp, b.a);
    const A = _sd.dot(_sd), E = _sab.dot(_sab), F = _sab.dot(_sn);
    if (A < 1e-12 || E < 1e-12) return;
    // (a line out of a point inside the leg is the push's to settle, however near its start the line goes deepest:
    // the robe's waist lies inside the top of the thigh, and judged by where its line went deepest, a hair off that
    // point the point below was put round onto the thigh, 2.5 cm a frame at idle)
    const ui = Math.min(1, Math.max(0, F / E)), ri = b.ra + (b.rb - b.ra) * ui + extra;
    if (_sn.lengthSq() - 2 * ui * F + ui * ui * E < ri * ri) return;
    const Cc = _sd.dot(_sn), Bb = _sd.dot(_sab), den = A * E - Bb * Bb;
    let sl = den > 1e-12 ? Math.min(1, Math.max(0, (Bb * F - Cc * E) / den)) : 0, t = (Bb * sl + F) / E;
    if (t < 0) { t = 0; sl = Math.min(1, Math.max(0, -Cc / A)); } else if (t > 1) { t = 1; sl = Math.min(1, Math.max(0, (Bb - Cc) / A)); }
    // (a line ending inside it is the push's to settle too)
    if (sl <= 1e-3 || sl >= 1 - 1e-3) return;
    _sp.addScaledVector(_sd, sl); _sq.copy(b.a).addScaledVector(_sab, t);
    const rad = b.ra + (b.rb - b.ra) * t + extra, dn = _sn.subVectors(_sp, _sq), d = dn.length();
    if (d >= rad - slack) return;
    if (d < 1e-6) dn.set(P[i * 3] - _sq.x, P[i * 3 + 1] - _sq.y, P[i * 3 + 2] - _sq.z).addScaledVector(_sab, -dn.dot(_sab) / E);
    if (dn.lengthSq() < 1e-12) return;
    _sp.copy(_sq).addScaledVector(dn.normalize(), rad + 1e-4);
    // (on from there, across the surface the way the cloth was going)
    _sd.set(_sp.x - P[i * 3], _sp.y - P[i * 3 + 1], _sp.z - P[i * 3 + 2]);
    const rest = len - _sd.length();
    _sd.addScaledVector(dn, -_sd.dot(dn));
    if (rest > 0 && _sd.lengthSq() > 1e-12) _sp.addScaledVector(_sd.normalize(), rest);
    P[j * 3] = _sp.x; P[j * 3 + 1] = _sp.y; P[j * 3 + 2] = _sp.z;
  }
}

/** A geometry's vertex normals as three's `computeVertexNormals` makes them, to the bit (each triangle's area-weighted
 *  normal added to its corners', then each normalized), but over the flat arrays: three's goes through vectors read and
 *  written a vertex at a time, 0.1 ms a frame for the ranger's coat. Indexed geometry; anything else goes to three's. */
export function vertexNormals(geo: THREE.BufferGeometry): void {
  const position = geo.attributes.position as THREE.BufferAttribute, index = geo.index;
  let normal = geo.attributes.normal as THREE.BufferAttribute | undefined;
  if (!index || !normal || normal.count !== position.count || normal.normalized || !(normal.array instanceof Float32Array) || position.normalized) { geo.computeVertexNormals(); return; }
  const P = position.array, N = normal.array, I = index.array;
  N.fill(0);
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const bx = P[b], by = P[b + 1], bz = P[b + 2];
    const cbx = P[c] - bx, cby = P[c + 1] - by, cbz = P[c + 2] - bz, abx = P[a] - bx, aby = P[a + 1] - by, abz = P[a + 2] - bz;
    const nx = cby * abz - cbz * aby, ny = cbz * abx - cbx * abz, nz = cbx * aby - cby * abx;
    // (each corner's sum read before any is written, as three's does: a triangle with a corner twice adds once)
    const ax0 = N[a] + nx, ay0 = N[a + 1] + ny, az0 = N[a + 2] + nz, bx0 = N[b] + nx, by0 = N[b + 1] + ny, bz0 = N[b + 2] + nz;
    const cx0 = N[c] + nx, cy0 = N[c + 1] + ny, cz0 = N[c + 2] + nz;
    N[a] = ax0; N[a + 1] = ay0; N[a + 2] = az0; N[b] = bx0; N[b + 1] = by0; N[b + 2] = bz0; N[c] = cx0; N[c + 1] = cy0; N[c + 2] = cz0;
  }
  for (let i = 0; i < N.length; i += 3) {
    const x = N[i], y = N[i + 1], z = N[i + 2], s = 1 / (Math.sqrt(x * x + y * y + z * z) || 1);
    N[i] = x * s; N[i + 1] = y * s; N[i + 2] = z * s;
  }
  normal.needsUpdate = true;
}

/** points `a` and `b` (of a flat array) held no further apart than `max`: `a` moved by `wa` of the excess, `b` by the rest */
function pull(P: Float32Array, a: number, b: number, max: number, wa: number): void {
  const dx = P[a * 3] - P[b * 3], dy = P[a * 3 + 1] - P[b * 3 + 1], dz = P[a * 3 + 2] - P[b * 3 + 2], d2 = dx * dx + dy * dy + dz * dz;
  if (d2 <= max * max || d2 < 1e-18) return;
  const d = Math.sqrt(d2);
  const e = (d - max) / d;
  P[a * 3] -= dx * e * wa; P[a * 3 + 1] -= dy * e * wa; P[a * 3 + 2] -= dz * e * wa;
  const wb = 1 - wa;
  P[b * 3] += dx * e * wb; P[b * 3 + 1] += dy * e * wb; P[b * 3 + 2] += dz * e * wb;
}
const _sp = new THREE.Vector3(), _sq = new THREE.Vector3(), _sab = new THREE.Vector3(), _sn = new THREE.Vector3(), _so = new THREE.Vector3(), _sd = new THREE.Vector3();
/** the drape's passes a frame (and one more ending off the limbs): each puts the cloth out of the limbs and holds its
 *  lengths, the last the lines between points too; most of a hero's update a frame (four, the mage's 0.94 ms) */
const DRAPE = tunable('drape', { passes: 3 });
/** how far outside a hand's capsule the cloth beside it is still held in behind it (m): about the skirts' points' spacing */
const HAND_REACH = 0.035;
/** how far into a leg's gap the cloth between neighbours round a row may dip before it is put round (m): between two points
 *  lying on a thigh the line dips a millimetre or two into the gap, and moving them for it pushed the cloth out into the free
 *  hand's cuff */
const ROUND_SLACK = 0.005;

