// Geometry for the lab's measures (tools/lab): the hero's meshes as they are drawn this frame, in world space, and
// what a line meets on its way through them. Every probe before the lab copied these by hand, and the copies drifted.
import * as THREE from 'three';
import type { Joints } from '../../../src/entities/models/rig';

/** a mesh's lengths along a line: how many times the line crosses its surface, and how much of the line lies inside */
export interface Crossing {
  crossings: number;
  /** metres between pairs of crossings (inside a closed mesh, or through a sheet and back) */
  inside: number;
}

/** true when the object and every one of its parents are visible */
export function isShown(object: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    if (!node.visible) return false;
  }
  return true;
}

/** true when `object` is `ancestor` or lies under it */
export function isUnder(object: THREE.Object3D, ancestor: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    if (node === ancestor) return true;
  }
  return false;
}

/** the first material of a mesh */
function firstMaterial(mesh: THREE.Mesh): THREE.Material {
  return Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
}

/**
 * Names meshes by the joint each hangs from and its own name (or its material's), as `chest/coat`: what a report says
 * a line went through.
 */
export function meshLabeller(joints: Joints): (mesh: THREE.Mesh) => string {
  const jointNames = new Map<THREE.Object3D, string>();
  for (const [name, value] of Object.entries(joints)) {
    if (value instanceof THREE.Object3D) jointNames.set(value, name);
  }
  return (mesh) => {
    let joint = '';
    for (let parent = mesh.parent; parent && !joint; parent = parent.parent) joint = jointNames.get(parent) ?? '';
    const material = firstMaterial(mesh) as THREE.Material & { color?: THREE.Color };
    const own = mesh.name || material.name || material.color?.getHexString() || '?';
    return `${joint}/${own}`;
  };
}

/** how far a baked vertex may lie past its mesh's bound before the bound is taken to be wrong (float error), m */
const BOUND_SLACK = 1e-4;
/** how far a skinned vertex's weights may add up off one before its mesh is left unbounded */
const WEIGHT_SLACK = 1e-3;

/**
 * A sphere a mesh lies within as it is drawn this frame, found without skinning its vertices. A skinned vertex is
 * where each of its bones would carry it rigidly, averaged by its weights, so it lies within the spheres round each
 * bone's own vertices (made once, in the bone's frame at rest) as the bones carry them now: a few matrices a mesh
 * where skinning every vertex took 30 ms a frame. A rigid mesh's is its geometry's sphere, made again whenever its
 * positions change (cloth). Null when no such bound holds (morph targets, or weights that don't add up to one).
 */
class MeshBound {
  private readonly bones: { index: number; sphere: THREE.Sphere }[] = [];
  private readonly bounded: boolean;
  private readonly local = new THREE.Sphere();
  private readonly world = new THREE.Sphere();
  private readonly part = new THREE.Sphere();
  private readonly toWorld = new THREE.Matrix4();
  /** the version of a rigid mesh's positions its sphere was made from */
  private positionVersion = -1;

  constructor(private readonly mesh: THREE.Mesh) {
    if (mesh.geometry.morphAttributes.position?.length) this.bounded = false;
    else if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) this.bounded = this.measureBones(mesh as THREE.SkinnedMesh);
    else this.bounded = true;
  }

  /** this frame's bound in world space (the world matrices up to date), or null when there is none */
  sphere(): THREE.Sphere | null {
    if (!this.bounded) return null;
    const mesh = this.mesh;
    if (!(mesh as THREE.SkinnedMesh).isSkinnedMesh) return this.rigidSphere();
    const skinned = mesh as THREE.SkinnedMesh;
    let first = true;
    for (const { index, sphere } of this.bones) {
      this.toWorld.multiplyMatrices(skinned.matrixWorld, skinned.bindMatrixInverse);
      this.toWorld.multiply(skinned.skeleton.bones[index].matrixWorld);
      this.part.copy(sphere).applyMatrix4(this.toWorld);
      if (first) this.world.copy(this.part);
      else this.world.union(this.part);
      first = false;
    }
    return this.world;
  }

  private rigidSphere(): THREE.Sphere {
    const position = this.mesh.geometry.attributes.position as THREE.BufferAttribute;
    if (position.version !== this.positionVersion) {
      // (made here rather than by the geometry's own: the lab leaves the game's bounds as the game made them)
      const point = new THREE.Vector3();
      new THREE.Box3().setFromBufferAttribute(position).getCenter(this.local.center);
      this.local.radius = 0;
      for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i);
        this.local.radius = Math.max(this.local.radius, point.distanceTo(this.local.center));
      }
      this.positionVersion = position.version;
    }
    return this.world.copy(this.local).applyMatrix4(this.mesh.matrixWorld);
  }

  /** each bone's sphere round its own vertices; false when a vertex's weights don't add up to one */
  private measureBones(mesh: THREE.SkinnedMesh): boolean {
    const boxes = new Map<number, THREE.Box3>();
    const weighted = eachBonePoint(mesh, (bone, point) => {
      const box = boxes.get(bone) ?? new THREE.Box3();
      boxes.set(bone, box.expandByPoint(point));
    });
    if (!weighted) return false;
    const spheres = new Map<number, THREE.Sphere>();
    for (const [bone, box] of boxes) spheres.set(bone, new THREE.Sphere(box.getCenter(new THREE.Vector3()), 0));
    eachBonePoint(mesh, (bone, point) => {
      const sphere = spheres.get(bone)!;
      sphere.radius = Math.max(sphere.radius, point.distanceTo(sphere.center));
    });
    for (const [index, sphere] of spheres) this.bones.push({ index, sphere });
    return true;
  }
}

/**
 * Calls `visit` with each vertex of a skinned mesh at rest, in the frame of each bone it's weighted to. Returns false
 * (having stopped) at a vertex whose weights don't add up to one: it isn't then an average of its bones' placements.
 */
function eachBonePoint(mesh: THREE.SkinnedMesh, visit: (bone: number, point: THREE.Vector3) => void): boolean {
  const { geometry, skeleton } = mesh;
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const skinIndex = geometry.attributes.skinIndex as THREE.BufferAttribute;
  const skinWeight = geometry.attributes.skinWeight as THREE.BufferAttribute;
  const rest = new THREE.Vector3();
  const point = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    rest.fromBufferAttribute(position, i).applyMatrix4(mesh.bindMatrix);
    let total = 0;
    for (let k = 0; k < 4; k++) {
      const weight = skinWeight.getComponent(i, k);
      if (weight === 0) continue;
      total += weight;
      const bone = skinIndex.getComponent(i, k);
      visit(bone, point.copy(rest).applyMatrix4(skeleton.boneInverses[bone]));
    }
    if (Math.abs(total - 1) > WEIGHT_SLACK) return false;
  }
  return true;
}

/** a body mesh, its copy in world space and its bound */
interface BakedPart {
  source: THREE.Mesh;
  copy: THREE.Mesh;
  bound: MeshBound;
}

/**
 * The body's meshes copied into world space, skinned as they are drawn, so a ray meets them as the player sees them
 * (three's raycast meets a skinned mesh in its rest pose, and a front-sided one only from outside). Bake once a frame,
 * after the pose, with the world matrices up to date.
 */
export class BakedBody {
  private readonly parts: BakedPart[] = [];
  private readonly material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });

  /** `include` picks the meshes; alpha-tested cards (hair, leaves) are left out, as rays would meet their quads */
  constructor(root: THREE.Object3D, joints: Joints, include: (mesh: THREE.Mesh) => boolean) {
    const label = meshLabeller(joints);
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !include(mesh) || firstMaterial(mesh).alphaTest > 0) return;
      this.parts.push({ source: mesh, copy: this.copyOf(mesh, label(mesh)), bound: new MeshBound(mesh) });
    });
  }

  private copyOf(source: THREE.Mesh, label: string): THREE.Mesh {
    const geometry = new THREE.BufferGeometry();
    const count = source.geometry.attributes.position.count;
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    if (source.geometry.index) geometry.setIndex(source.geometry.index);
    const copy = new THREE.Mesh(geometry, this.material);
    copy.matrixAutoUpdate = false;
    copy.userData = { label };
    return copy;
  }

  /**
   * This frame's shown meshes, each vertex where it's drawn. With `near`, only the meshes that may reach into it: the
   * rest aren't baked or returned. Throws if a baked vertex lies outside its mesh's bound (the bound would be wrong,
   * and meshes left out by it might not be out of reach).
   */
  bake(near?: THREE.Sphere): THREE.Mesh[] {
    const shown: THREE.Mesh[] = [];
    for (const { source, copy, bound } of this.parts) {
      if (!isShown(source)) continue;
      const sphere = bound.sphere();
      if (near && sphere && !sphere.intersectsSphere(near)) continue;
      const position = copy.geometry.attributes.position as THREE.BufferAttribute;
      const out = position.array as Float32Array;
      placeVertices(source, out);
      position.needsUpdate = true;
      if (sphere) {
        checkWithin(out, sphere, copy.userData.label as string);
        copy.geometry.boundingSphere = sphere.clone();
      } else {
        copy.geometry.computeBoundingSphere();
      }
      copy.updateMatrixWorld(true);
      shown.push(copy);
    }
    return shown;
  }
}

/** true when an attribute's numbers can be read straight from its array (not interleaved, not normalized) */
function readsDirectly(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): boolean {
  return !(attribute as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute && !attribute.normalized;
}

/**
 * Writes where each of a mesh's vertices is drawn this frame, in world space, into `out` (x, y, z a vertex). A skinned
 * mesh's bones each have their matrix made once (three's `getVertexPosition` makes it again for every vertex and
 * weight, and took 30 ms a frame for the hero); a mesh with morph targets, or attributes that can't be read straight,
 * goes through three's own.
 */
export function placeVertices(mesh: THREE.Mesh, out: Float32Array): void {
  const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
  const morphed = Boolean(mesh.geometry.morphAttributes.position?.length);
  const skinned = (mesh as THREE.SkinnedMesh).isSkinnedMesh;
  const direct = readsDirectly(position) && (!skinned || (readsDirectly(skinIndex) && readsDirectly(skinWeight)));
  if (morphed || !direct) {
    placeEachVertex(mesh, out);
    return;
  }
  const points = position.array as ArrayLike<number>;
  if (!skinned) {
    transformPoints(points, mesh.matrixWorld.elements, out);
    return;
  }
  skinPoints(mesh as THREE.SkinnedMesh, points, out);
}

/** three's own way, a vertex at a time */
function placeEachVertex(mesh: THREE.Mesh, out: Float32Array): void {
  const vertex = new THREE.Vector3();
  const count = mesh.geometry.attributes.position.count;
  for (let i = 0; i < count; i++) {
    mesh.getVertexPosition(i, vertex).applyMatrix4(mesh.matrixWorld);
    vertex.toArray(out, i * 3);
  }
}

/** `out` = each point (x, y, z) of `points` through the affine `matrix` (column-major, as three keeps it) */
function transformPoints(points: ArrayLike<number>, matrix: ArrayLike<number>, out: Float32Array): void {
  for (let i = 0; i < points.length; i += 3) {
    const x = points[i];
    const y = points[i + 1];
    const z = points[i + 2];
    out[i] = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
    out[i + 1] = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
    out[i + 2] = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
  }
}

/**
 * Skins `points` as three draws them: each vertex carried by each of its bones (the bone's world matrix, its inverse
 * at rest, the bind matrix), summed by its weights, then through the bind matrix's inverse and the mesh's world.
 */
function skinPoints(mesh: THREE.SkinnedMesh, points: ArrayLike<number>, out: Float32Array): void {
  const { bones, boneInverses } = mesh.skeleton;
  const carried = new Float64Array(bones.length * 16);
  const matrix = new THREE.Matrix4();
  for (let j = 0; j < bones.length; j++) {
    matrix.multiplyMatrices(bones[j].matrixWorld, boneInverses[j]).multiply(mesh.bindMatrix);
    matrix.toArray(carried, j * 16);
  }
  const toWorld = new THREE.Matrix4().multiplyMatrices(mesh.matrixWorld, mesh.bindMatrixInverse).elements;
  const indices = mesh.geometry.attributes.skinIndex.array as ArrayLike<number>;
  const weights = mesh.geometry.attributes.skinWeight.array as ArrayLike<number>;
  for (let i = 0, v = 0; i < points.length; i += 3, v += 4) {
    const px = points[i];
    const py = points[i + 1];
    const pz = points[i + 2];
    let x = 0;
    let y = 0;
    let z = 0;
    for (let k = 0; k < 4; k++) {
      const weight = weights[v + k];
      if (weight === 0) continue;
      // (the bone's matrix in `carried`, column-major)
      const at = indices[v + k] * 16;
      x += weight * (carried[at] * px + carried[at + 4] * py + carried[at + 8] * pz + carried[at + 12]);
      y += weight * (carried[at + 1] * px + carried[at + 5] * py + carried[at + 9] * pz + carried[at + 13]);
      z += weight * (carried[at + 2] * px + carried[at + 6] * py + carried[at + 10] * pz + carried[at + 14]);
    }
    out[i] = toWorld[0] * x + toWorld[4] * y + toWorld[8] * z + toWorld[12];
    out[i + 1] = toWorld[1] * x + toWorld[5] * y + toWorld[9] * z + toWorld[13];
    out[i + 2] = toWorld[2] * x + toWorld[6] * y + toWorld[10] * z + toWorld[14];
  }
}

/** throws if a point of `points` lies outside `sphere` (by more than float error) */
function checkWithin(points: Float32Array, sphere: THREE.Sphere, label: string): void {
  const reach = (sphere.radius + BOUND_SLACK) ** 2;
  const { x, y, z } = sphere.center;
  for (let i = 0; i < points.length; i += 3) {
    const dx = points[i] - x;
    const dy = points[i + 1] - y;
    const dz = points[i + 2] - z;
    if (dx * dx + dy * dy + dz * dz > reach) throw new Error(`lab: geometry: ${label} lies outside its bound`);
  }
}

const raycaster = new THREE.Raycaster();

/**
 * What the segment from `a` to `b` meets among `meshes` (from `BakedBody.bake`), by mesh label: each crossing of a
 * surface counts, and the length between pairs of crossings is what lies inside. `skip` leaves out labels it matches.
 */
export function crossingsAlong(
  meshes: THREE.Mesh[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  skip?: RegExp,
): Map<string, Crossing> {
  const result = new Map<string, Crossing>();
  const direction = b.clone().sub(a);
  const length = direction.length();
  if (length < 1e-6) return result;
  raycaster.set(a, direction.divideScalar(length));
  raycaster.far = length;
  const distances = new Map<string, number[]>();
  for (const hit of raycaster.intersectObjects(meshes, false)) {
    const label = hit.object.userData.label as string;
    if (skip?.test(label)) continue;
    const list = distances.get(label) ?? [];
    list.push(hit.distance);
    distances.set(label, list);
  }
  for (const [label, list] of distances) {
    list.sort((x, y) => x - y);
    let inside = 0;
    for (let i = 0; i + 1 < list.length; i += 2) inside += list[i + 1] - list[i];
    result.set(label, { crossings: list.length, inside });
  }
  return result;
}

/** adds `more` into `total`, label by label */
export function addCrossings(total: Map<string, Crossing>, more: Map<string, Crossing>): void {
  for (const [label, crossing] of more) {
    const sum = total.get(label) ?? { crossings: 0, inside: 0 };
    sum.crossings += crossing.crossings;
    sum.inside += crossing.inside;
    total.set(label, sum);
  }
}

/** the least distance from point `p` to the segment `a`-`b` */
export function pointSegmentDistance(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
  const ab = b.clone().sub(a);
  const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
  return p.distanceTo(a.clone().addScaledVector(ab, t));
}

/**
 * The least distance between the segments `p0`-`p1` and `q0`-`q1`: the closest points' parameters `s` and `t` along
 * them, from Ericson's Real-Time Collision Detection (5.1.9), whose names for the dot products it keeps.
 */
export function segmentDistance(p0: THREE.Vector3, p1: THREE.Vector3, q0: THREE.Vector3, q1: THREE.Vector3): number {
  const d1 = p1.clone().sub(p0);
  const d2 = q1.clone().sub(q0);
  const r = p0.clone().sub(q0);
  const a = d1.dot(d1);
  const e = d2.dot(d2);
  if (a < 1e-12) return pointSegmentDistance(p0, q0, q1);
  if (e < 1e-12) return pointSegmentDistance(q0, p0, p1);
  const b = d1.dot(d2);
  const c = d1.dot(r);
  const f = d2.dot(r);
  const denominator = a * e - b * b;
  let s = denominator > 1e-12 ? THREE.MathUtils.clamp((b * f - c * e) / denominator, 0, 1) : 0;
  let t = (b * s + f) / e;
  if (t < 0) {
    t = 0;
    s = THREE.MathUtils.clamp(-c / a, 0, 1);
  } else if (t > 1) {
    t = 1;
    s = THREE.MathUtils.clamp((b - c) / a, 0, 1);
  }
  return p0.clone().addScaledVector(d1, s).distanceTo(q0.clone().addScaledVector(d2, t));
}
