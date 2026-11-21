// A skinned mesh met by a ray in its pose, as it's drawn and cheaply. A box round each part of it, posed by the bones
// that move the part, finds the few triangles the ray may meet, and those alone are posed and met: three's own test
// poses every vertex first (1 to 9 ms a body), this takes microseconds. The aim meets a body's skinned limbs so
// (fx/stuckArrows.ts `castSolid`, core/input.ts `aimAlong`): met on its rigid meshes alone, the eye's ray over a boss's
// skinned limbs went on to the floor behind it, and Quarry Mark marked a small foe there.
import * as THREE from 'three';

/**
 * A part of a skinned mesh: the triangles of one piece it was merged from that one bone moves the most of their first
 * corner (3 vertices each), the box round them as the mesh was built (its middle and half its size), and every bone
 * that moves any of their corners. Posed, a vertex is a weighted mean of where each of its bones would put it, so the
 * box round the part's box as each of those bones puts it holds the part as it's drawn. (A box a bone in its own space
 * left the skin bent between two bones out, and one round a bone's share of every piece met the gaps between legs.)
 */
interface Part { mid: THREE.Vector3; half: THREE.Vector3; bones: Uint16Array; tris: Uint32Array }
/** the parts one bone moves the most of, and the box round them that way (met first: the ray meets a few of them) */
interface Group { mid: THREE.Vector3; half: THREE.Vector3; bones: Uint16Array; parts: Part[]; /** that bone */ bone: number }

/** A ray's meeting with a skinned mesh: what three's is, and the joint that moves what it met the most (the bone a
 *  headshot reads, combat/strikes.ts `onHead`). */
export interface HullHit extends THREE.Intersection { joint: THREE.Object3D }

/** each geometry's parts, by the bone that moves them most: every body of a kind shares its geometry */
const GROUPS = new WeakMap<THREE.BufferGeometry, Group[]>();

/** Which piece each vertex of `g` is of, by the triangles joining them: the pieces it was merged from. */
function piecesOf(g: THREE.BufferGeometry): Int32Array {
  const n = g.attributes.position.count, up = new Int32Array(n), index = g.index;
  for (let i = 0; i < n; i++) up[i] = i;
  const top = (i: number): number => { while (up[i] !== i) i = up[i] = up[up[i]]; return i; };
  const corner = (k: number): number => (index ? index.getX(k) : k);
  for (let k = 0, count = index ? index.count : n; k + 2 < count; k += 3) {
    const a = top(corner(k));
    up[top(corner(k + 1))] = a; up[top(corner(k + 2))] = a;
  }
  for (let i = 0; i < n; i++) up[i] = top(i);
  return up;
}

function groupsOf(g: THREE.BufferGeometry): Group[] {
  let groups = GROUPS.get(g);
  if (groups) return groups;
  const pos = g.attributes.position, skin = g.attributes.skinIndex, weight = g.attributes.skinWeight, index = g.index, piece = piecesOf(g);
  const most = (i: number): number => {
    let bone = skin.getX(i), w = weight.getX(i);
    for (let k = 1; k < 4; k++) if (weight.getComponent(i, k) > w) { w = weight.getComponent(i, k); bone = skin.getComponent(i, k); }
    return bone;
  };
  type Making = { box: THREE.Box3; bones: Set<number>; tris: number[] };
  const made = new Map<number, Map<number, Making>>(), v = new THREE.Vector3();
  for (let t = 0, count = index ? index.count : pos.count; t + 2 < count; t += 3) {
    const first = index ? index.getX(t) : t, bone = most(first);
    let pieces = made.get(bone);
    if (!pieces) made.set(bone, pieces = new Map());
    let part = pieces.get(piece[first]);
    if (!part) pieces.set(piece[first], part = { box: new THREE.Box3(), bones: new Set(), tris: [] });
    for (let c = 0; c < 3; c++) {
      const i = index ? index.getX(t + c) : t + c;
      part.tris.push(i);
      part.box.expandByPoint(v.fromBufferAttribute(pos, i));
      for (let k = 0; k < 4; k++) if (weight.getComponent(i, k) > 0) part.bones.add(skin.getComponent(i, k));
    }
  }
  const middle = (box: THREE.Box3) => box.getCenter(new THREE.Vector3());
  const halfOf = (box: THREE.Box3) => box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  groups = [...made.entries()].map(([bone, pieces]) => {
    const box = new THREE.Box3(), bones = new Set<number>();
    const parts = [...pieces.values()].map((part) => {
      box.union(part.box);
      for (const b of part.bones) bones.add(b);
      return { mid: middle(part.box), half: halfOf(part.box), bones: Uint16Array.from(part.bones), tris: Uint32Array.from(part.tris) };
    });
    return { mid: middle(box), half: halfOf(box), bones: Uint16Array.from(bones), parts, bone };
  });
  GROUPS.set(g, groups);
  return groups;
}

/** How far a body reaches (m): over its feet, and out from its middle; and how high it stands as built, its opaque
 *  meshes' top over its feet (its crown: what's shown over its head goes over it). */
export interface Reach { top: number; out: number; crown: number }
/** room for the limbs to swing past where they were built */
const SWING = 1.15;

/**
 * How far `root`'s meshes reach as built (the skinned ones as they were bound), `SWING` past it: the room a ray's
 * first test looks for the body in. (A boss's crown stood 1.8 times its height, which counts its hits.) Its skinned
 * meshes' parts are made too, once a geometry: as the foes are warmed up at load, not as the aim first meets them.
 */
export function reachOf(root: THREE.Object3D): Reach {
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3(), part = new THREE.Box3();
  let crown = -Infinity;
  root.traverse((o) => {
    const g = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh).geometry : null;
    if (!g) return;
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) groupsOf(g);
    if (!g.boundingBox) g.computeBoundingBox();
    box.union(part.copy(g.boundingBox!).applyMatrix4(o.matrixWorld));
    if (opaque(o as THREE.Mesh)) crown = Math.max(crown, part.max.y);
  });
  if (box.isEmpty()) return { top: 0, out: 0, crown: 0 };
  const at = root.parent?.getWorldPosition(new THREE.Vector3()) ?? new THREE.Vector3();
  const x = Math.max(Math.abs(box.min.x - at.x), Math.abs(box.max.x - at.x)), z = Math.max(Math.abs(box.min.z - at.z), Math.abs(box.max.z - at.z));
  return { top: (box.max.y - at.y) * SWING, out: Math.hypot(x, z) * SWING, crown: Math.max(0, crown - at.y) };
}

/** Whether `mesh` is drawn opaque: not a glow, an aura or a see-through effect. */
function opaque(mesh: THREE.Mesh): boolean {
  const m = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.Material;
  return m.blending === THREE.NormalBlending && !(m.transparent && m.opacity < 0.9);
}

/** One test's posing of a mesh: each bone's matrix from where the mesh was built to the world now, and each vertex
 *  as it's drawn, each made as it's first needed. */
class Posing {
  /** each bone's matrix (kept from test to test: made anew for each, they were most of a test's garbage), and the
   *  test it was last made for */
  private readonly mats: THREE.Matrix4[] = [];
  private madeFor = new Uint32Array(0);
  private posed = new Float32Array(0);
  private stamp = new Uint32Array(0);
  private test = 0;
  private mesh!: THREE.SkinnedMesh;
  private readonly sum = new THREE.Vector3();
  private readonly one = new THREE.Vector3();

  start(mesh: THREE.SkinnedMesh): void {
    const n = Math.max(mesh.geometry.attributes.position.count, this.stamp.length), bones = Math.max(mesh.skeleton.bones.length, this.madeFor.length);
    if (n > this.stamp.length || bones > this.madeFor.length) {
      this.posed = new Float32Array(n * 3); this.stamp = new Uint32Array(n); this.madeFor = new Uint32Array(bones); this.test = 0;
    }
    this.mesh = mesh;
    if (++this.test === 0xffffffff) { this.stamp.fill(0); this.madeFor.fill(0); this.test = 1; }
  }

  /** bone `b`'s matrix: a vertex it moves alone, from where it was built to where it's drawn */
  bone(b: number): THREE.Matrix4 {
    const m = this.mats[b] ??= new THREE.Matrix4();
    if (this.madeFor[b] === this.test) return m;
    this.madeFor[b] = this.test;
    // (the skinning's steps: into the bone's space as bound, out by its world now, the binding undone, the mesh's world)
    const mesh = this.mesh, sk = mesh.skeleton;
    return m.multiplyMatrices(mesh.matrixWorld, mesh.bindMatrixInverse)
      .multiply(sk.bones[b].matrixWorld).multiply(sk.boneInverses[b]).multiply(mesh.bindMatrix);
  }

  /** vertex `i` as it's drawn now, into `out` */
  vertex(i: number, out: THREE.Vector3): THREE.Vector3 {
    const p = this.posed, at = i * 3;
    if (this.stamp[i] === this.test) return out.set(p[at], p[at + 1], p[at + 2]);
    const g = this.mesh.geometry, skin = g.attributes.skinIndex, weight = g.attributes.skinWeight, pos = g.attributes.position;
    this.sum.set(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const w = weight.getComponent(i, k);
      if (w) this.sum.addScaledVector(this.one.fromBufferAttribute(pos, i).applyMatrix4(this.bone(skin.getComponent(i, k))), w);
    }
    p[at] = this.sum.x; p[at + 1] = this.sum.y; p[at + 2] = this.sum.z;
    this.stamp[i] = this.test;
    return out.copy(this.sum);
  }
}

/** the box `meetsPosed` grows: its least x, y, z, then its most */
const _box = new Float64Array(6);
/**
 * Whether `ray` meets the box round the box (`mid`, `half`) as each of `bones` puts it (`posing`): in plain numbers,
 * as it's done for each part the ray comes near every frame the aim is on a body.
 */
function meetsPosed(ray: THREE.Ray, mid: THREE.Vector3, half: THREE.Vector3, bones: Uint16Array): boolean {
  const b = _box;
  b[0] = b[1] = b[2] = Infinity; b[3] = b[4] = b[5] = -Infinity;
  for (const bone of bones) {
    const e = posing.bone(bone).elements;
    for (let a = 0; a < 3; a++) {
      const c = e[a] * mid.x + e[4 + a] * mid.y + e[8 + a] * mid.z + e[12 + a];
      const r = Math.abs(e[a]) * half.x + Math.abs(e[4 + a]) * half.y + Math.abs(e[8 + a]) * half.z;
      if (c - r < b[a]) b[a] = c - r;
      if (c + r > b[3 + a]) b[3 + a] = c + r;
    }
  }
  // (the slabs: where the ray is within each axis's span, and whether those overlap ahead of it)
  const o = ray.origin, d = ray.direction;
  let near = 0, far = Infinity;
  for (let a = 0; a < 3; a++) {
    const from = a === 0 ? o.x : a === 1 ? o.y : o.z, step = a === 0 ? d.x : a === 1 ? d.y : d.z;
    if (Math.abs(step) < 1e-12) { if (from < b[a] || from > b[3 + a]) return false; continue; }
    let t0 = (b[a] - from) / step, t1 = (b[3 + a] - from) / step;
    if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }
    if (t0 > near) near = t0;
    if (t1 < far) far = t1;
    if (near > far) return false;
  }
  return true;
}

const posing = new Posing();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _p = new THREE.Vector3();
/** Where `by`'s ray first meets `mesh` as it's drawn now (within `by.near` to `by.far`), or null. */
export function hullHit(mesh: THREE.SkinnedMesh, by: THREE.Raycaster): HullHit | null {
  const ray = by.ray, mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.Material;
  const cull = mat.side === THREE.FrontSide;
  let best: HullHit | null = null;
  posing.start(mesh);
  for (const group of groupsOf(mesh.geometry)) {
    if (!meetsPosed(ray, group.mid, group.half, group.bones)) continue;
    for (const { mid, half, bones, tris } of group.parts) {
      if (!meetsPosed(ray, mid, half, bones)) continue;
      for (let t = 0; t < tris.length; t += 3) {
        const hit = ray.intersectTriangle(posing.vertex(tris[t], _a), posing.vertex(tris[t + 1], _b), posing.vertex(tris[t + 2], _c), cull, _p);
        if (!hit) continue;
        const d = ray.origin.distanceTo(hit);
        if (d < by.near || d > by.far || (best && d >= best.distance)) continue;
        best = { distance: d, point: hit.clone(), object: mesh, joint: mesh.skeleton.bones[group.bone] ?? mesh };
      }
    }
  }
  return best;
}
