// Geometry for the creatures: tapered tubes along a curve (horns, claws, ribs, tentacles), lathed
// profiles, organic noise displacement, ragged cloth, and `Sculpt`, which merges the static pieces
// of each joint per material into one mesh, so a detailed creature stays a few draw calls. A creature
// is built once per kind: later ones replay the merged geometry (see Sculpt), so spawning stays cheap.
import * as THREE from 'three';
import { sameLooks } from '../../core/materials';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry } from '../../util';

/** while a Sculpt replays cached geometry, the builders return this stand-in instead of doing work */
const NONE = new THREE.BufferGeometry();
let replaying = false;
/** true while a creature's geometry comes from the cache: skip building any geometry by hand */
export const skipping = (): boolean => replaying;

const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _b = new THREE.Vector3(), _t = new THREE.Vector3();

/**
 * A tube along `pts` (a Catmull-Rom curve through them) whose radius follows `radius(t)`, t 0..1 from
 * the first point, closed with a point at the far end. Horns, claws, ribs, tails, fingers. Its faces point out.
 * (They pointed in, which a double-sided material hides, as three turns a back face's normal to the camera: one
 * sided, the forest's roots showed their inside, lit from below, black. #289)
 */
export function taperTube(pts: THREE.Vector3[], radius: (t: number) => number, segs = 12, radial = 7): THREE.BufferGeometry {
  if (replaying) return NONE;
  const curve = new THREE.CatmullRomCurve3(pts);
  // (its arc lengths over 8 steps a segment: by three's 200 a fur tuft of 3 segments took 200 points of the curve to
  // place 4 rings, half of a hero's fur; the rings move under 0.2 mm)
  curve.arcLengthDivisions = Math.max(segs * 8, 32);
  const frames = curve.computeFrenetFrames(segs, false);
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, r = Math.max(1e-4, radius(t));
    curve.getPointAt(t, _v);
    for (let k = 0; k <= radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      _n.copy(frames.normals[i]).multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i], Math.sin(a));
      pos.push(_v.x + _n.x * r, _v.y + _n.y * r, _v.z + _n.z * r);
      uv.push(k / radial, t);
    }
  }
  for (let i = 0; i < segs; i++) for (let k = 0; k < radial; k++) {
    const a = i * (radial + 1) + k, b = a + radial + 1;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  // cap the far end with a point
  curve.getPointAt(1, _v); curve.getTangentAt(1, _t);
  const tip = pos.length / 3;
  pos.push(_v.x + _t.x * radius(1) * 0.8, _v.y + _t.y * radius(1) * 0.8, _v.z + _t.z * radius(1) * 0.8); uv.push(0.5, 1);
  for (let k = 0; k < radial; k++) { const a = segs * (radial + 1) + k; idx.push(a, a + 1, tip); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A horn: out along `dir`, curling by `curl` radians about `axis`, with growth rings. */
export function horn(len: number, base: number, curl: number, axis = new THREE.Vector3(1, 0, 0), dir = new THREE.Vector3(0, 1, 0), rings = 0): THREE.BufferGeometry {
  if (replaying) return NONE;
  const pts: THREE.Vector3[] = [], p = new THREE.Vector3(), d = dir.clone().normalize(), step = len / 6;
  for (let i = 0; i <= 6; i++) { pts.push(p.clone()); p.addScaledVector(d, step); d.applyAxisAngle(axis, curl / 6); }
  return taperTube(pts, (t) => base * (1 - t * 0.92) * (rings ? 1 + 0.1 * Math.max(0, Math.sin(t * rings * Math.PI * 2)) * (1 - t) : 1), rings ? 16 : 10, 7);
}

/** A lathed solid from a profile of [radius, y] pairs, bottom to top: its faces point out (top to bottom, in). */
export const lathe = (profile: [number, number][], segs = 16): THREE.BufferGeometry => replaying ? NONE :
  new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(1e-4, r), y)), segs);

/** Push every vertex along its normal by smooth 3D noise: turns primitives into flesh, rock or bark. */
export function organic(src: THREE.BufferGeometry, amp: number, freq: number, seed = 1): THREE.BufferGeometry {
  if (replaying) return NONE;
  const n = noise3(seed);
  // faceted geometry (polyhedra) has a vertex per face: weld it first, or the faces would drift apart
  let g = src;
  if (!g.index) {
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    g = mergeVertices(g); src.dispose();
    // a cylindrical projection stands in for the per-face uvs
    const p = g.attributes.position, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { uv[i * 2] = Math.atan2(p.getZ(i), p.getX(i)) / Math.PI + 1; uv[i * 2 + 1] = p.getY(i); }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  const p = g.attributes.position, nr = g.attributes.normal;
  // vertices on a seam share a position: key the offset by position so seams stay closed
  for (let i = 0; i < p.count; i++) {
    _v.fromBufferAttribute(p, i); _n.fromBufferAttribute(nr, i);
    const d = (n(_v.x * freq, _v.y * freq, _v.z * freq) - 0.5) * 2 * amp;
    p.setXYZ(i, _v.x + _n.x * d, _v.y + _n.y * d, _v.z + _n.z * d);
  }
  g.computeVertexNormals();
  return g;
}

/** Bend a geometry: x offset grows with y (lean), for drooping cloth or curved blades. */
export function bend<G extends THREE.BufferGeometry>(g: G, k: number, axis: 'x' | 'z' = 'z'): G {
  if (replaying) return g;
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); axis === 'z' ? p.setZ(i, p.getZ(i) + k * y * y) : p.setX(i, p.getX(i) + k * y * y); }
  g.computeVertexNormals();
  return g;
}

/** A hanging ragged strip of cloth, top edge at y = 0: uneven torn hem, a little crumple. */
export function rag(w: number, h: number, seed = 1, tears = 3): THREE.BufferGeometry {
  if (replaying) return NONE;
  const r = mulberry(seed), g = new THREE.PlaneGeometry(w, h, 4, 6).translate(0, -h / 2, 0), p = g.attributes.position;
  const cuts = Array.from({ length: 5 }, () => r());
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), u = (x / w + 0.5), k = -y / h;
    // the bottom rows are pulled up into a torn edge
    if (k > 0.99) p.setY(i, y + h * 0.35 * cuts[Math.round(u * 4)] * Math.min(1, tears / 3));
    p.setZ(i, Math.sin(u * 9 + seed) * 0.012 + (r() - 0.5) * 0.01 * k);
  }
  g.computeVertexNormals();
  return g;
}

/** An open robe cone (top radius r0 at y = 0, bottom r1 at -h) with folds and a torn, uneven hem. */
export function tatteredSkirt(r0: number, r1: number, h: number, seed: number, radial = 28): THREE.BufferGeometry {
  if (replaying) return NONE;
  const r = mulberry(seed), geo = new THREE.CylinderGeometry(r0, r1, h, radial, 8, true).translate(0, -h / 2, 0);
  const cuts = Array.from({ length: radial + 1 }, () => r());
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = -y / h;
    const a = Math.atan2(z, x), c = cuts[Math.round(((a / (Math.PI * 2)) + 1) % 1 * radial)];
    // folds, and the lower edge torn into tongues of different lengths
    const fold = 1 + Math.sin(a * 9 + seed) * 0.06 * k;
    p.setXYZ(i, x * fold, k > 0.99 ? y + h * 0.55 * c * c : y, z * fold);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * A leaf blade growing along +Y from its stalk at the origin, facing +Z: `len` long, `w` wide, its halves
 * folded up along the midrib by `fold` and the blade curling back (-Z) by `curl`. Draw it double-sided.
 */
export function leaf(len: number, w: number, fold = 0.35, curl = 0.3, segs = 6): THREE.BufferGeometry {
  if (replaying) return NONE;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, half = (w / 2) * Math.sin(Math.PI * Math.pow(t, 0.75)), y = len * t, z = -curl * len * t * t;
    for (const k of [-1, 0, 1]) { pos.push(k * half, y, z + Math.abs(k) * fold * half); uv.push(k * 0.5 + 0.5, t); }
  }
  for (let i = 0; i < segs; i++) for (let k = 0; k < 2; k++) {
    const a = i * 3 + k, b = a + 3;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A fern frond along +Y: an arching stem with paired leaflets shrinking to the tip; arches towards +Z. */
export function frond(len: number, pairs = 7, arch = 0.5, seed = 1): THREE.BufferGeometry {
  if (replaying) return NONE;
  const r = mulberry(seed), parts: THREE.BufferGeometry[] = [];
  const at = (t: number) => V3(0, len * t, arch * len * t * t);
  parts.push(taperTube([at(0), at(0.33), at(0.66), at(1)], (t) => len * 0.02 * (1 - t * 0.8), 8, 4));
  for (let i = 1; i <= pairs; i++) {
    const t = i / (pairs + 1), p = at(t), s = 1 - t * 0.75, tilt = Math.atan2(2 * arch * t, 1);
    for (const side of [-1, 1]) {
      const l = leaf(len * 0.26 * s, len * 0.07 * s, 0.3, 0.3, 3);
      l.rotateZ(-side * (1.05 + (r() - 0.5) * 0.2)).rotateX(tilt).translate(p.x, p.y, p.z);
      parts.push(l.index ? l.toNonIndexed() : l);
    }
  }
  const g = mergeGeometries(parts.map((x) => (x.index ? x.toNonIndexed() : x)))!;
  for (const x of parts) x.dispose();
  return g;
}

/** A strand winding round the Y axis from y = 0 down to -len: a vine or root wrapping a limb or trunk. */
export function twist(len: number, rad: number, thick: number, turns: number, phase = 0): THREE.BufferGeometry {
  if (replaying) return NONE;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8, a = phase + t * turns * Math.PI * 2; pts.push(V3(Math.cos(a) * rad, -len * t, Math.sin(a) * rad)); }
  return taperTube(pts, (t) => thick * (1 - t * 0.5), 12, 4);
}

/**
 * A branching limb: a bent tube from `from` along `dir`, forking `depth` more times. Pushes each tube into
 * `out` and every twig end into `tips` (for leaves or blossoms). Seeded: the same rng gives the same tree.
 */
export function branches(rng: () => number, from: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, depth: number,
  out: THREE.BufferGeometry[], tips: THREE.Vector3[], spread = 0.6, radial = 6): void {
  const d = dir.clone().normalize(), pts = [from.clone()], p = from.clone();
  for (let i = 1; i <= 3; i++) {
    d.x += (rng() - 0.5) * 0.35; d.z += (rng() - 0.5) * 0.35; d.normalize();
    pts.push(p.addScaledVector(d, len / 3).clone());
  }
  const end = depth > 0 ? 0.62 : 0.15;
  out.push(taperTube(pts, (t) => rad * (1 - t * (1 - end)), 8, radial));
  if (depth <= 0) { tips.push(p.clone()); return; }
  const side = V3(rng() - 0.5, 0, rng() - 0.5).cross(d).normalize();
  for (let k = 0; k < 2; k++) {
    const at = pts[2 + k].clone(), nd = d.clone().applyAxisAngle(side, (k ? 1 : -1) * spread * (0.7 + rng() * 0.6)).applyAxisAngle(d, rng() * Math.PI * 2);
    branches(rng, at, nd, len * (0.6 + rng() * 0.15), rad * end, depth - 1, out, tips, spread, Math.max(4, radial - 1));
  }
}

const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Smooth 3D value noise in [0, 1]. */
export function noise3(seed: number): (x: number, y: number, z: number) => number {
  const r = mulberry(seed), perm = new Uint8Array(512), val = new Float32Array(256);
  for (let i = 0; i < 256; i++) { perm[i] = i; val[i] = r(); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const h = (x: number, y: number, z: number) => val[perm[perm[perm[x & 255] + (y & 255)] + (z & 255)]];
  const s = (t: number) => t * t * (3 - 2 * t);
  return (x, y, z) => {
    const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z), u = s(x - X), v = s(y - Y), w = s(z - Z);
    const l = (a: number, b: number, t: number) => a + (b - a) * t;
    return l(l(l(h(X, Y, Z), h(X + 1, Y, Z), u), l(h(X, Y + 1, Z), h(X + 1, Y + 1, Z), u), v),
      l(l(h(X, Y, Z + 1), h(X + 1, Y, Z + 1), u), l(h(X, Y + 1, Z + 1), h(X + 1, Y + 1, Z + 1), u), v), w);
  };
}

/** Mirror a non-indexed geometry across x = 0, keeping its triangles facing out. */
export function mirrorX<G extends THREE.BufferGeometry>(g: G): G {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) { p.setX(i, -p.getX(i)); if (n) n.setX(i, -n.getX(i)); }
  for (let i = 0; i + 2 < p.count; i += 3) for (const a of [p, n, uv]) {
    if (!a) continue;
    for (let c = 0; c < a.itemSize; c++) { const t = a.getComponent(i + 1, c); a.setComponent(i + 1, c, a.getComponent(i + 2, c)); a.setComponent(i + 2, c, t); }
  }
  return g;
}

/**
 * A limb hanging down from its joint: length `len`, radius r0 at the joint to r1 at the far end,
 * a muscle `bulge` (fraction of the radius) centred at `at`, rounded ends. Lathed about -Y.
 */
export function limb(len: number, r0: number, r1: number, bulge = 0, at = 0.35, segs = 12): THREE.BufferGeometry {
  if (replaying) return NONE;
  const prof: [number, number][] = [];
  const r = (t: number) => (r0 + (r1 - r0) * t) * (1 + bulge * Math.exp(-(((t - at) / 0.28) ** 2)));
  for (let i = 4; i >= 1; i--) { const a = (i / 4) * Math.PI / 2; prof.push([Math.cos(a) * r1, -len - Math.sin(a) * r1 * 0.8]); }
  for (let i = 10; i >= 0; i--) { const t = i / 10; prof.push([r(t), -len * t]); }
  for (let i = 1; i <= 4; i++) { const a = (i / 4) * Math.PI / 2; prof.push([Math.cos(a) * r0, Math.sin(a) * r0 * 0.8]); }
  return lathe(prof, segs);
}

/** Remove the rig's stand-in primitives (a creature sculpts its own body on the joints). */
export function stripRig(root: THREE.Object3D): void {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  for (const m of meshes) { m.removeFromParent(); m.geometry.dispose(); }
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3();

/** merged geometry per creature kind, shared by every creature of that kind (never disposed) */
const CACHE = new Map<string, THREE.BufferGeometry[]>();
/** Skin weights across joints (prototype, issue #85): `?skin=0` puts every spanning piece back on its one joint */
export const SKINNING = typeof location === 'undefined' || !/[?&]skin=0/.test(location.search);
/** The shadow pass draws every caster with one shared depth material, so a skinned caster among rigid ones made
 *  three rebuild that material's program parameters at each switch; skinned meshes get a depth material of their own */
export const SKIN_DEPTH = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
/** pieces smaller than this (bounding radius, m) cast no shadow: chain links, claws, charms */
const SHADOW_MIN = 0.07;

/**
 * Collects static pieces and merges them per (joint, material) into one mesh each on `build()`.
 * Pieces that move on their own need their own joint; everything on one joint moves together anyway.
 * With a `kind`, the first build is cached; later builds of that kind run the same code, but the
 * geometry builders return at once and `build()` hands out the cached meshes in the same order.
 * The build must be deterministic (seeded randomness only) for that to hold.
 */
export class Sculpt {
  private groups = new Map<THREE.Object3D, Map<THREE.Material, THREE.BufferGeometry[]>>();
  private skins = new Map<THREE.Object3D, Map<THREE.Material, THREE.BufferGeometry[]>>();
  private bones: THREE.Object3D[] = [];
  private noShadow = new Set<THREE.Material>();
  private cached: THREE.BufferGeometry[] | undefined;

  constructor(private kind?: string) {
    this.cached = kind ? CACHE.get(kind) : undefined;
    replaying = !!this.cached;
  }

  /** add `geo` under `parent` at a position, Euler rotation (XYZ) and scale (number = uniform) */
  add(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D,
    pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0], scale: number | [number, number, number] = 1): this {
    if (this.cached) { this.push(parent, mat, NONE); return this; }
    const sc = typeof scale === 'number' ? _s.setScalar(scale) : _s.set(...scale);
    _m.compose(_v.set(...pos), _q.setFromEuler(_e.set(...rot)), sc);
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(_m);
    if (geo.index) geo.dispose();
    // (a piece may give its own blend, b's share at each vertex: a `skinK` attribute)
    const own = g.attributes.skinK as THREE.BufferAttribute | undefined;
    // (vertex colours kept for a material that uses them: they merge only with pieces of that material, which carry them too)
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && (k !== 'color' || !(mat as THREE.MeshStandardMaterial).vertexColors)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    this.push(parent, mat, g);
    return this;
  }

  /**
   * A piece hung on joint `a` that carries on past its child joint `b` (a sleeve over the elbow, the neck up
   * into the head): its vertices follow `a` above `from` and `b` below `to` (metres along the bone, from
   * `a`), blended between, so the surface bends with the joint instead of leaving a gap. `geo` is in `a`'s
   * space, placed like `add`. `b` must be a direct child of `a`. Without skinning it is a rigid piece of `a`.
   */
  skin(geo: THREE.BufferGeometry, mat: THREE.Material, a: THREE.Object3D, b: THREE.Object3D, from: number, to: number,
    pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0], scale: number | [number, number, number] = 1): this {
    if (!SKINNING) return this.add(geo, mat, a, pos, rot, scale);
    const ia = this.bone(a), ib = this.bone(b);
    // a creature's skinned pieces are one mesh per material on the root (draws are what a crowd pays for);
    // a hero's stay on their joint, which the first-person view shows or hides by
    let space = a;
    if (this.kind) while (space.parent) space = space.parent;
    if (this.cached) { this.pushTo(this.skins, space, mat, NONE); return this; }
    const sc = typeof scale === 'number' ? _s.setScalar(scale) : _s.set(...scale);
    _m.compose(_v.set(...pos), _q.setFromEuler(_e.set(...rot)), sc);
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(_m);
    if (geo.index) geo.dispose();
    // (a piece may give its own blend, b's share at each vertex: a `skinK` attribute)
    const own = g.attributes.skinK as THREE.BufferAttribute | undefined;
    // (vertex colours kept for a material that uses them: they merge only with pieces of that material, which carry them too)
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && (k !== 'color' || !(mat as THREE.MeshStandardMaterial).vertexColors)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    // (the bones' indices as floats: Uint16 ones read by a float attribute are a format D3D11 converts, and ANGLE
    // compiled a vertex shader for it at each skinned program's first draw, on the GPU process's main thread)
    const axis = b.position.clone().normalize(), p = g.attributes.position, idx = new Float32Array(p.count * 4), w = new Float32Array(p.count * 4);
    for (let i = 0; i < p.count; i++) {
      const t = Math.min(1, Math.max(0, (_v.fromBufferAttribute(p, i).dot(axis) - from) / (to - from))), k = own ? own.getX(i) : t * t * (3 - 2 * t);
      idx[i * 4] = ia; idx[i * 4 + 1] = ib; w[i * 4] = 1 - k; w[i * 4 + 1] = k;
    }
    g.setAttribute('skinIndex', new THREE.Float32BufferAttribute(idx, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(w, 4));
    if (space !== a) {   // into the root's space, as the joints stand now (at rest)
      a.updateWorldMatrix(true, false);
      g.applyMatrix4(_m.copy(space.matrixWorld).invert().multiply(a.matrixWorld));
    }
    this.pushTo(this.skins, space, mat, g);
    return this;
  }
  /**
   * A piece hung on joint `a` blended along a chain of joints (a coat over the shoulder: the chest, a joint turned half as
   * far as the arm, the arm): its `skinK` attribute (0..1) says how far along the chain each vertex is, between each pair of
   * neighbours a linear blend. (Blended straight from the chest to an arm raised over the head, the cloth halfway took a
   * chord between the two and folded in on the joint.) `geo` is in `a`'s space; without skinning it is a rigid piece of `a`.
   */
  skinChain(geo: THREE.BufferGeometry, mat: THREE.Material, a: THREE.Object3D, chain: THREE.Object3D[]): this {
    if (!SKINNING) { geo.deleteAttribute('skinK'); return this.add(geo, mat, a); }
    const ids = chain.map((b) => this.bone(b));
    let space = a;
    if (this.kind) while (space.parent) space = space.parent;
    if (this.cached) { this.pushTo(this.skins, space, mat, NONE); return this; }
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (geo.index) geo.dispose();
    const own = g.attributes.skinK as THREE.BufferAttribute;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && (k !== 'color' || !(mat as THREE.MeshStandardMaterial).vertexColors)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    // (the bones' indices as floats, as `skin`'s)
    const n = ids.length - 1, p = g.attributes.position, idx = new Float32Array(p.count * 4), w = new Float32Array(p.count * 4);
    for (let i = 0; i < p.count; i++) {
      const t = Math.min(1, Math.max(0, own.getX(i))) * n, at = Math.min(n - 1, Math.floor(t)), f = t - at;
      idx[i * 4] = ids[at]; idx[i * 4 + 1] = ids[at + 1]; w[i * 4] = 1 - f; w[i * 4 + 1] = f;
    }
    g.setAttribute('skinIndex', new THREE.Float32BufferAttribute(idx, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(w, 4));
    if (space !== a) {
      a.updateWorldMatrix(true, false);
      g.applyMatrix4(_m.copy(space.matrixWorld).invert().multiply(a.matrixWorld));
    }
    this.pushTo(this.skins, space, mat, g);
    return this;
  }
  /** `skin` on both sides: the piece on the left joints and its mirror image on the right */
  skinPair(geo: THREE.BufferGeometry, mat: THREE.Material, aL: THREE.Object3D, bL: THREE.Object3D, aR: THREE.Object3D, bR: THREE.Object3D, from: number, to: number,
    pos: [number, number, number] = [0, 0, 0]): this {
    const mirror = this.cached ? geo.clone() : mirrorX(geo.index ? geo.toNonIndexed() : geo.clone());
    this.skin(geo, mat, aL, bL, from, to, pos);
    return this.skin(mirror, mat, aR, bR, from, to, [-pos[0], pos[1], pos[2]]);
  }
  private bone(o: THREE.Object3D): number {
    let i = this.bones.indexOf(o);
    if (i < 0) i = this.bones.push(o) - 1;
    return i;
  }

  private push(parent: THREE.Object3D, mat: THREE.Material, g: THREE.BufferGeometry): void { this.pushTo(this.groups, parent, mat, g); }
  private pushTo(store: Map<THREE.Object3D, Map<THREE.Material, THREE.BufferGeometry[]>>, parent: THREE.Object3D, mat: THREE.Material, g: THREE.BufferGeometry): void {
    // (a piece of no triangles is left out, so a material none of whose pieces has any draws nothing: a hero's
    // stitches below Low's detail, models/armor.ts. Never a replay's stand-in, which holds a cached piece's place)
    if (g !== NONE && !this.cached && !(g.attributes.position?.count > 0)) { g.dispose(); return; }
    let m = store.get(parent);
    if (!m) store.set(parent, (m = new Map()));
    let list = m.get(mat);
    if (!list) m.set(mat, (list = []));
    list.push(g);
  }

  /** the piece on the left joint and its mirror image (x → -x) on the right one */
  pair(geo: THREE.BufferGeometry, mat: THREE.Material, parentL: THREE.Object3D, parentR: THREE.Object3D | null,
    pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0], scale: number | [number, number, number] = 1): this {
    // (a piece of no triangles has no mirror image either: `pushTo` leaves it out)
    if (!this.cached && !(geo.attributes.position?.count > 0)) return this;
    this.add(geo, mat, parentL, pos, rot, scale);
    const list = this.groups.get(parentL)!.get(mat)!;
    this.push(parentR ?? parentL, mat, this.cached ? NONE : mirrorX(list[list.length - 1].clone()));
    return this;
  }

  /** pieces in this material cast no shadow (glows, and leaves: small and thin, their shadows add little) */
  glow(mat: THREE.Material): this { this.noShadow.add(mat); return this; }

  build(): THREE.Mesh[] {
    replaying = false;
    const out: THREE.Mesh[] = [], made: THREE.BufferGeometry[] = [];
    let i = 0;
    for (const [parent, m] of this.groups) for (const [mat, list] of m) {
      let g = this.cached?.[i++];
      if (!g) {
        g = list.length === 1 ? list[0] : mergeGeometries(list)!;
        if (list.length > 1) for (const x of list) x.dispose();
        g.computeBoundingSphere();
        if (this.kind) g.userData.shared = true;
      }
      made.push(g);
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = !this.noShadow.has(mat) && g.boundingSphere!.radius > SHADOW_MIN;
      mesh.receiveShadow = true;
      parent.add(mesh);
      out.push(mesh);
    }
    if (this.skins.size) {
      // one skeleton over the joints the spanning pieces use; each joint's pieces are a SkinnedMesh on it
      let top = this.bones[0];
      while (top.parent) top = top.parent;
      top.updateMatrixWorld(true);
      const skeleton = new THREE.Skeleton(this.bones as unknown as THREE.Bone[]), twins = new Map<THREE.Material, THREE.Material>();
      for (const [parent, m] of this.skins) for (const [mat, list] of m) {
        let g = this.cached?.[i++];
        if (!g) {
          g = list.length === 1 ? list[0] : mergeGeometries(list)!;
          if (list.length > 1) for (const x of list) x.dispose();
          g.computeBoundingSphere();
          if (this.kind) g.userData.shared = true;
        }
        made.push(g);
        // its own copy of the material: one shared with rigid meshes makes three rebuild its program's
        // parameters on every switch between the two (it was the whole cost of a crowd)
        let sm = twins.get(mat);
        if (!sm) { twins.set(mat, sm = mat.clone()); sm.onBeforeCompile = mat.onBeforeCompile; sm.customProgramCacheKey = mat.customProgramCacheKey; sameLooks(sm, mat); }
        const mesh = new THREE.SkinnedMesh(g, sm);
        // (its sphere the bind pose's: three would pose every vertex for it at its first draw)
        mesh.boundingSphere = g.boundingSphere!.clone();
        mesh.castShadow = !this.noShadow.has(mat) && g.boundingSphere!.radius > SHADOW_MIN;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;   // the bounds are the bind pose's
        mesh.customDepthMaterial = SKIN_DEPTH;
        parent.add(mesh);
        mesh.updateWorldMatrix(true, false);
        mesh.bind(skeleton);
        out.push(mesh);
      }
    }
    if (this.kind && !this.cached) CACHE.set(this.kind, made);
    // (its kind, on the model's root: every body of the kind is drawn as one crowd, models/crowd.ts)
    if (this.kind && out.length) {
      let top: THREE.Object3D = out[0];
      while (top.parent) top = top.parent;
      top.userData.crowdKind = this.kind;
    }
    this.groups.clear();
    this.skins.clear();
    return out;
  }
}
