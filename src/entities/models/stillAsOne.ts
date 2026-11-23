// A hero who stands still drawn as a few meshes, his alike parts merged where they stand (WebGL). The hall of heroes'
// heroes stand on their plinths unposed while the camera is outside (`holdStill` in game/hall.ts), yet each was drawn
// part by part: from the square the two were 133 of the frame's 439 draws, about 2.9 ms of the render's CPU in a dev
// build, for 0.03% of the frame's pixels seen through the door. Here his shown parts are laid into meshes of his own
// space, one for each set of parts drawn alike (the same look: a skinned part's copy of a material and the rigid
// parts' material it was copied from are one), each vertex where his pose puts it (a skinned part's posed on the CPU
// as three's shader poses it, its normals with it), and drawn in the parts' place, which are taken off every layer meanwhile. Nothing
// new compiles: a set with a rigid part is drawn as a plain mesh with that part's material, whose program is the rigid
// parts'; a set of skinned parts alone is drawn as a skinned mesh on one bone that never moves, with the first part's
// material, whose program is theirs. It's made a slice a frame (`SLICE_MS`), each set drawn in its parts' place as
// it's made (its upload a frame of its own), and made again from the start as soon as a part it was made of changes
// (his far detail, his gear shown or hidden). WebGPU draws a hero as one its own way
// (`drawAsOne.ts`). `?stillAsOne=0` draws each part on its own.
import * as THREE from 'three';
import { perfClock } from '../../core/perfClock';

/** Whether a still hero is drawn as a few meshes (it was WebGL's alone: off until something switches it on), read at
 *  each step. */
export const stillAsOne = {
  on: false,
  /** the lab's canary: normals laid as they were made, not turned as their parts are drawn (`lab village --only
   *  heroesStillAsOne`) */
  unturned: false,
};

/** how long a frame's slice of the merge goes on (ms, by `perfClock`): two heroes' parts are some 60k vertices */
const SLICE_MS = 1.5;

/** A part as it was merged: the mesh, what it drew and the layers it was drawn on (it's taken off every layer while
 *  merged: hidden, what hangs from it would go with it). */
interface Merged {
  readonly mesh: THREE.Mesh;
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.Material;
  readonly layers: number;
}

/** The attributes a part is merged with: what its material reads (a skinned part's bones are laid in its vertices). */
const attributesOf = (geometry: THREE.BufferGeometry): string[] => Object.keys(geometry.attributes)
  .filter((name) => name !== 'skinIndex' && name !== 'skinWeight')
  .sort();

/** Whether `mesh` can be merged: one opaque material drawn by three as it stands (no work of its own before its draw,
 *  no glow, no hood's shade, which read its own space), casting no shadow, its shape fixed and its attributes plain. */
function mergeable(mesh: THREE.SkinnedMesh): boolean {
  if (!mesh.isMesh || (mesh as unknown as THREE.InstancedMesh).isInstancedMesh) return false;
  if (Object.hasOwn(mesh, 'onBeforeRender') || mesh.renderOrder !== 0 || mesh.castShadow) return false;
  if (mesh.userData.drawsAlone || mesh.morphTargetInfluences?.length || mesh.layers.mask === 0) return false;
  if (mesh.isSkinnedMesh && !mesh.skeleton) return false;
  const material = mesh.material;
  if (Array.isArray(material) || material.transparent || (material as THREE.ShaderMaterial).isShaderMaterial) return false;
  if (readsOwnSpace(material)) return false;
  const geometry = mesh.geometry;
  if (geometry.groups.length > 1 || geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity) return false;
  if (Object.keys(geometry.morphAttributes).length || geometry.attributes.tangent || !geometry.attributes.normal) return false;
  for (const name of Object.keys(geometry.attributes)) {
    const attribute = geometry.attributes[name];
    if (!(attribute instanceof THREE.BufferAttribute)) return false;
  }
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const normal = geometry.attributes.normal as THREE.BufferAttribute;
  return position.usage === THREE.StaticDrawUsage && position.array instanceof Float32Array
    && normal.array instanceof Float32Array;
}

/** what the kit's patch gives a material (`core/materials.ts`): its looks read off it, and its hood's shade */
interface KitLooked {
  kitLooks?: { aura: { value: THREE.Color }; rim: { value: THREE.Color }; near: { value: number };
    hair: { value: THREE.Vector3 } };
}

/** Whether `material` draws by the place in its mesh's own space (a worn item's glow, a hood's shade), which a merge
 *  moves. */
function readsOwnSpace(material: THREE.Material): boolean {
  const aura = (material as KitLooked).kitLooks?.aura.value;
  if (aura && (aura.r > 0 || aura.g > 0 || aura.b > 0)) return true;
  const shade = material.userData.shade?.value as THREE.Vector4 | undefined;
  return !!shade && shade.x > 0;
}

/** ids of the objects a material holds that are compared by what they are (a hook, a map) */
const ids = new WeakMap<object, number>();
let lastId = 0;
const idOf = (thing: object): number => {
  let id = ids.get(thing);
  if (id === undefined) ids.set(thing, id = ++lastId);
  return id;
};

/** the properties of a material that don't change how it draws */
const UNDRAWN = new Set(['id', 'uuid', 'name', 'version', 'userData', 'kitLooks', '_listeners']);

/** One property's value as its look's key: a number or a flag as it is, a colour or a vector by its numbers, anything
 *  else by what it is. */
function valueKey(value: unknown): string {
  if (value === null || typeof value !== 'object') return String(value);
  const numbers = value as { isColor?: boolean; isVector2?: boolean; isVector3?: boolean; isVector4?: boolean;
    toArray?: () => number[] };
  if (numbers.isColor || numbers.isVector2 || numbers.isVector3 || numbers.isVector4) return numbers.toArray!().join(',');
  return `#${idOf(value)}`;
}

/** What `material` draws as: its kind, its shader's patch and key, and every property and look it draws by. Two
 *  materials of one key draw the same (a skinned part's copy and the rigid parts' material it was copied from). */
function lookOf(material: THREE.Material): string {
  const words = [material.type, String(idOf(material.onBeforeCompile)), material.customProgramCacheKey()];
  for (const name of Object.keys(material).sort()) {
    if (UNDRAWN.has(name) || name.startsWith('_')) continue;
    words.push(`${name}=${valueKey((material as unknown as Record<string, unknown>)[name])}`);
  }
  const looks = (material as KitLooked).kitLooks;
  if (looks) words.push(valueKey(looks.rim.value), String(looks.near.value), valueKey(looks.hair.value));
  words.push(JSON.stringify(material.userData));
  return words.join('|');
}

/** What parts must share to be merged: their look, their layers, their shadows taken, their attributes' kinds. */
function keyOf(mesh: THREE.Mesh, looks: Map<THREE.Material, string>): string {
  const material = mesh.material as THREE.Material;
  let look = looks.get(material);
  if (look === undefined) looks.set(material, look = lookOf(material));
  const geometry = mesh.geometry;
  const attributes = attributesOf(geometry).map((name) => {
    const attribute = geometry.attributes[name] as THREE.BufferAttribute;
    return `${name}${attribute.itemSize}${attribute.array.constructor.name}${attribute.normalized}`;
  });
  return `${look}|${mesh.layers.mask}|${mesh.receiveShadow}|${attributes.join(',')}`;
}

/** Whether `object` is shown as far up as `root`. */
function shownUnder(object: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let at: THREE.Object3D | null = object; at; at = at.parent) {
    if (!at.visible) return false;
    if (at === root) return true;
  }
  return false;
}

const _world = new THREE.Matrix4();
const _bone = new THREE.Matrix4();
const _holderInverse = new THREE.Matrix4();
const _normals = new THREE.Matrix3();
const _turn = new THREE.Matrix3();

/**
 * Where a part's vertices go in the holder's space, by bone: each bone's matrix for positions (16 numbers) and for
 * normals (9), a rigid part's one. A skinned vertex is drawn by three at Σ wₖ B⁻¹ Mₖ B p (B its bind matrix, Mₖ its
 * bones' matrices), turned to the world by its mesh's W; here each bone's is H⁻¹ W B⁻¹ Mₖ B (H the holder's world
 * matrix), so a vertex lands at the weighted sum of its bones' places. Normals: three turns a skinned normal by the
 * same blend, then by W's normal matrix; drawn by H's, the merged one is Hᵀ W⁻ᵀ of it.
 */
interface BoneMatrices { readonly places: Float32Array; readonly normals: Float32Array }

function boneMatricesOf(mesh: THREE.Mesh, holder: THREE.Object3D): BoneMatrices {
  _holderInverse.copy(holder.matrixWorld).invert();
  _world.multiplyMatrices(_holderInverse, mesh.matrixWorld);
  _normals.getNormalMatrix(mesh.matrixWorld);
  _turn.setFromMatrix4(holder.matrixWorld).transpose();
  _normals.premultiply(_turn);
  const skinned = mesh as THREE.SkinnedMesh;
  if (!skinned.isSkinnedMesh) {
    return { places: Float32Array.from(_world.elements), normals: Float32Array.from(_normals.elements) };
  }
  const bones = skinned.skeleton.bones;
  const places = new Float32Array(bones.length * 16);
  const normals = new Float32Array(bones.length * 9);
  const blend = new THREE.Matrix3();
  for (let b = 0; b < bones.length; b++) {
    // (a bone's matrix as three's skeleton makes it, from its world matrix and its inverse at the bind)
    _bone.multiplyMatrices(bones[b].matrixWorld, skinned.skeleton.boneInverses[b]);
    _bone.premultiply(skinned.bindMatrixInverse).multiply(skinned.bindMatrix);
    blend.setFromMatrix4(_bone).premultiply(_normals);
    _bone.premultiply(_world);
    places.set(_bone.elements, b * 16);
    normals.set(blend.elements, b * 9);
  }
  return { places, normals };
}

/** A part's vertices that its index draws, in order, and its index into them. */
interface Used { readonly vertices: Uint32Array; readonly index: Uint32Array }

function usedOf(geometry: THREE.BufferGeometry): Used {
  const count = geometry.attributes.position.count;
  const own = geometry.index;
  if (!own) {
    const all = new Uint32Array(count);
    for (let i = 0; i < count; i++) all[i] = i;
    return { vertices: all, index: all };
  }
  const into = new Int32Array(count).fill(-1);
  const vertices: number[] = [];
  const index = new Uint32Array(own.count);
  for (let i = 0; i < own.count; i++) {
    const vertex = own.getX(i);
    if (into[vertex] < 0) {
      into[vertex] = vertices.length;
      vertices.push(vertex);
    }
    index[i] = into[vertex];
  }
  return { vertices: Uint32Array.from(vertices), index };
}

/** A set of parts as it's merged: its parts, what each draws, and the arrays laid so far. */
interface Laying {
  readonly parts: THREE.Mesh[];
  readonly used: Used[];
  readonly names: string[];
  arrays: Map<string, THREE.TypedArray>;
  index: Uint32Array | Uint16Array;
  vertex: number;
  corner: number;
}

/** Part `k` of `laying` laid into its arrays, in the holder's space. */
function layPart(laying: Laying, k: number, holder: THREE.Object3D): void {
  const mesh = laying.parts[k];
  const used = laying.used[k];
  const geometry = mesh.geometry;
  const bones = boneMatricesOf(mesh, holder);
  const skin = (mesh as THREE.SkinnedMesh).isSkinnedMesh ? geometry.attributes : null;
  const from = laying.vertex;
  for (const name of laying.names) {
    const source = geometry.attributes[name] as THREE.BufferAttribute;
    const into = laying.arrays.get(name)!;
    if (name === 'position' || (name === 'normal' && !stillAsOne.unturned)) {
      layTurned(source, into, from, used.vertices, name === 'position', bones, skin);
    } else layCopied(source, into, from, used.vertices);
  }
  // (a part drawn mirrored turns its faces as three would; the merged mesh is drawn as its holder is)
  const mirrored = (mesh.matrixWorld.determinant() < 0) !== (holder.matrixWorld.determinant() < 0);
  const index = laying.index;
  for (let i = 0; i < used.index.length; i += 3) {
    for (let c = 0; c < 3; c++) index[laying.corner + i + c] = from + used.index[i + (mirrored ? 2 - c : c)];
  }
  laying.vertex += used.vertices.length;
  laying.corner += used.index.length;
}

/** An attribute's values for `vertices` copied into `into` from vertex `from`. */
function layCopied(source: THREE.BufferAttribute, into: THREE.TypedArray, from: number, vertices: Uint32Array): void {
  const size = source.itemSize;
  const array = source.array;
  for (let v = 0; v < vertices.length; v++) {
    const at = vertices[v] * size;
    for (let c = 0; c < size; c++) into[(from + v) * size + c] = array[at + c];
  }
}

/** Positions (`place`) or normals for `vertices` put where their bones put them, into `into` from vertex `from`. */
function layTurned(source: THREE.BufferAttribute, into: THREE.TypedArray, from: number, vertices: Uint32Array,
  place: boolean, bones: BoneMatrices, skin: Record<string, THREE.BufferAttribute | THREE.InterleavedBufferAttribute> | null): void {
  const array = source.array as Float32Array;
  const boneIndex = skin?.skinIndex;
  const boneWeight = skin?.skinWeight;
  const out = new THREE.Vector3();
  const one = new THREE.Vector3();
  for (let v = 0; v < vertices.length; v++) {
    const vertex = vertices[v];
    const x = array[vertex * 3], y = array[vertex * 3 + 1], z = array[vertex * 3 + 2];
    if (!boneIndex || !boneWeight) {
      turned(bones, 0, place, x, y, z, out);
    } else {
      out.set(0, 0, 0);
      for (let k = 0; k < 4; k++) {
        const weight = boneWeight.getComponent(vertex, k);
        if (weight === 0) continue;
        turned(bones, boneIndex.getComponent(vertex, k), place, x, y, z, one);
        out.addScaledVector(one, weight);
      }
    }
    if (!place) out.normalize();
    into[(from + v) * 3] = out.x;
    into[(from + v) * 3 + 1] = out.y;
    into[(from + v) * 3 + 2] = out.z;
  }
}

/** (x, y, z) put by bone `b`'s matrix into `out`: as a point (`place`) or as a normal. */
function turned(bones: BoneMatrices, b: number, place: boolean, x: number, y: number, z: number, out: THREE.Vector3): void {
  if (place) {
    const m = bones.places;
    const at = b * 16;
    out.set(m[at] * x + m[at + 4] * y + m[at + 8] * z + m[at + 12],
      m[at + 1] * x + m[at + 5] * y + m[at + 9] * z + m[at + 13],
      m[at + 2] * x + m[at + 6] * y + m[at + 10] * z + m[at + 14]);
    return;
  }
  const n = bones.normals;
  const at = b * 9;
  out.set(n[at] * x + n[at + 3] * y + n[at + 6] * z, n[at + 1] * x + n[at + 4] * y + n[at + 7] * z,
    n[at + 2] * x + n[at + 5] * y + n[at + 8] * z);
}

/** A set's arrays made, each the size of every part's vertices it draws. */
function begin(parts: THREE.Mesh[]): Laying {
  const used = parts.map((part) => usedOf(part.geometry));
  const vertices = used.reduce((sum, u) => sum + u.vertices.length, 0);
  const corners = used.reduce((sum, u) => sum + u.index.length, 0);
  const names = attributesOf(parts[0].geometry);
  const arrays = new Map<string, THREE.TypedArray>();
  for (const name of names) {
    const attribute = parts[0].geometry.attributes[name] as THREE.BufferAttribute;
    const kind = attribute.array.constructor as new (length: number) => THREE.TypedArray;
    arrays.set(name, new kind(vertices * attribute.itemSize));
  }
  const index = vertices > 65535 ? new Uint32Array(corners) : new Uint16Array(corners);
  return { parts, used, names, arrays, index, vertex: 0, corner: 0 };
}

/** The mesh a laid set is drawn as: a plain one with a rigid part's material, else a skinned one on `skeleton`'s
 *  one bone that never moves, with a skinned part's (their programs are theirs). */
function meshOf(laying: Laying, skeleton: THREE.Skeleton): THREE.Mesh {
  const first = laying.parts[0];
  const geometry = new THREE.BufferGeometry();
  for (const name of laying.names) {
    const attribute = first.geometry.attributes[name] as THREE.BufferAttribute;
    geometry.setAttribute(name, new THREE.BufferAttribute(laying.arrays.get(name)!, attribute.itemSize, attribute.normalized));
  }
  geometry.setIndex(new THREE.BufferAttribute(laying.index, 1));
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  const rigid = laying.parts.find((part) => !(part as THREE.SkinnedMesh).isSkinnedMesh);
  let mesh: THREE.Mesh;
  if (rigid) mesh = new THREE.Mesh(geometry, rigid.material);
  else {
    // (every vertex wholly on the one bone: indices as floats, as the heroes' are, `Sculpt.skin`)
    const vertices = laying.vertex;
    geometry.setAttribute('skinIndex', new THREE.BufferAttribute(new Float32Array(vertices * 4), 4));
    const weights = new Float32Array(vertices * 4);
    for (let v = 0; v < vertices; v++) weights[v * 4] = 1;
    geometry.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4));
    const skinned = new THREE.SkinnedMesh(geometry, first.material);
    skinned.bindMode = THREE.DetachedBindMode;
    skinned.bind(skeleton, new THREE.Matrix4());
    skinned.boundingSphere = geometry.boundingSphere!.clone();
    skinned.boundingBox = geometry.boundingBox!.clone();
    mesh = skinned;
  }
  mesh.name = 'still as one';
  mesh.layers.mask = first.layers.mask;
  mesh.receiveShadow = first.receiveShadow;
  mesh.castShadow = false;
  return mesh;
}

/** Whether `part` is hidden or draws another geometry or material than it was merged with. */
const changedSince = (part: Merged, holder: THREE.Object3D): boolean => !shownUnder(part.mesh, holder)
  || part.mesh.geometry !== part.geometry || part.mesh.material !== part.material;

/** A hero standing still drawn as a few meshes: `step` each frame he stands (a slice of the merge, then its meshes in
 *  his parts' place, made again if a part changes), `undo` as he moves again or leaves. */
export class StillAsOne {
  private steps: Generator<void, boolean, undefined> | null = null;
  /** whether every set is merged and shown */
  private done = false;
  private meshes: THREE.Mesh[] = [];
  private merged: Merged[] = [];
  /** the bone the sets of skinned parts alone are drawn on, never moved (out of the scene: its matrix is none) */
  private readonly skeleton = new THREE.Skeleton([new THREE.Bone()]);

  constructor(private readonly holder: THREE.Object3D) {}

  /** The merge a slice further, or begun again once a part it was made of changed. */
  step(): void {
    // (read each step: the lab draws a frame merged and one not, `lab village`)
    if (!stillAsOne.on || this.stale()) this.undo();
    if (!stillAsOne.on || this.done) return;
    this.steps ??= this.merge();
    const since = perfClock.now();
    while (perfClock.now() - since < SLICE_MS) {
      const step = this.steps.next();
      if (!step.done) continue;
      this.steps = null;
      // (a part changed as it was merged: begun again next frame)
      if (step.value) this.done = true;
      else this.undo();
      return;
    }
  }

  /** His parts drawn again, the merged meshes let go of; a merge under way dropped. */
  undo(): void {
    this.steps = null;
    this.done = false;
    for (const part of this.merged) part.mesh.layers.mask = part.layers;
    this.merged = [];
    for (const mesh of this.meshes) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }
    this.meshes = [];
  }

  /** Whether a part merged changed since: hidden, put on a layer, drawing another geometry or material. */
  private stale(): boolean {
    return this.merged.some((part) => part.mesh.layers.mask !== 0 || changedSince(part, this.holder));
  }

  /** The merge, a set or a part a step, each set shown in its parts' place as it's made (their uploads a frame
   *  apart); false once a part changed as it was merged. */
  private *merge(): Generator<void, boolean, undefined> {
    const parts: THREE.Mesh[] = [];
    this.holder.traverse((object) => {
      const mesh = object as THREE.SkinnedMesh;
      if (mesh.isMesh && shownUnder(mesh, this.holder) && mergeable(mesh)) parts.push(mesh);
    });
    const looks = new Map<THREE.Material, string>();
    const sets = new Map<string, Merged[]>();
    for (const mesh of parts) {
      const key = keyOf(mesh, looks);
      const part = { mesh, geometry: mesh.geometry, material: mesh.material as THREE.Material, layers: mesh.layers.mask };
      const set = sets.get(key);
      if (set) set.push(part);
      else sets.set(key, [part]);
    }
    yield;
    for (const set of sets.values()) {
      // (a set of one part is drawn as it was: merging it saves no draw)
      if (set.length < 2) continue;
      const laying = begin(set.map((part) => part.mesh));
      yield;
      for (let k = 0; k < set.length; k++) {
        layPart(laying, k, this.holder);
        yield;
      }
      const mesh = meshOf(laying, this.skeleton);
      if (set.some((part) => part.mesh.layers.mask !== part.layers || changedSince(part, this.holder))) {
        mesh.geometry.dispose();
        return false;
      }
      this.show(mesh, set);
      yield;
    }
    return true;
  }

  /** `mesh` drawn in the place of the parts of `set`, which are taken off every layer. */
  private show(mesh: THREE.Mesh, set: readonly Merged[]): void {
    for (const part of set) part.mesh.layers.mask = 0;
    this.merged.push(...set);
    this.holder.add(mesh);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.matrixWorld.copy(this.holder.matrixWorld);
    this.meshes.push(mesh);
  }
}
