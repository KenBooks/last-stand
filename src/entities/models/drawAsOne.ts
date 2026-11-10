// A hero's parts drawn as one mesh a material, on WebGPU. three's WebGPU path costs about three times its WebGL path a
// draw, and a part that moves writes all its uniforms anew at each draw: a hero is 77 of the lobby's 134 scene draws,
// nearly all of them moving, and WebGPU's frame took twice WebGL's. Here the parts sharing a material and how they're
// drawn are merged, and each vertex reads where it goes from one texture holding the matrices of every hero's every
// part and bone (`JOINTS`), written once a view: the merged meshes themselves stand still at the scene's origin, so
// three has nothing of theirs to write as the hero moves, and they're drawn from a render bundle, a command in the pass
// however many there are. (Merged as skinned meshes instead, a hero was drawn in half the draws for 4% of the frame's
// JS: three writes a skinned mesh's bones into its own uniforms at each of its draws.)
//
// A rigid piece is a joint of its own that is the piece itself, its vertices as built, so it lands where its world
// matrix puts it whatever moves or scales it; its normals are laid in as (LᵀL)⁻¹ n for the linear part L of its world
// matrix as merged, which the joint turns by L into L⁻ᵀ n, the normal as three draws it, as long as the piece's own
// scale holds. A skinned part keeps its bones, its vertices laid where its bind matrix put them. Each view's render
// draws the merged meshes and hides the parts, put back after it: the game shows, hides and sorts the parts as before.
// What it shows and hides from moment to moment costs no merge (each rebuilt all of a hero, about 250 ms under the
// profiler: three of them each time the hall of heroes opened, and a ranger at every arrow): a merged part hidden is
// shrunk to nothing by its gate, read by its vertices off the same texture, and a part shown that isn't merged draws
// on its own. Merged again only once that has held for `SETTLED` views (gear changed), or at once as a part changes
// its layers, its shadows or its positions (the first person's body, the quality). A shadow drawn inside a view's render is cast from the joints too, by one mesh for
// every part; a hero's other parts (a cloth's) cast on their own. WebGL keeps its draws: there a draw costs little.
// `?drawAsOne=0` draws each part on its own, for A/B. A part whose material changes (an item's as it glows or not,
// `itemGlow.ts`) is merged again at once too.
import * as THREE from 'three';
import { G } from '../../state';
import { gpu, standInBases, stillNodes, tsl, uploadTexture, WEBGPU } from '../../core/webgpu';
import { HIDDEN_LAYER } from '../../core/layers';
import { aroundShadows, aroundViews } from '../../world/culling';
import type { Model } from '../../types';

/** Whether a hero's parts are drawn as one (WebGPU only; `?drawAsOne=0`: each on its own). */
export const drawingAsOne = {
  on: WEBGPU && (typeof location === 'undefined' || !/[?&]drawAsOne=0/.test(location.search)),
};

/** One model's parts drawn as one: its merged meshes, and how many times they were made. */
export interface OneDraw {
  readonly meshes: readonly THREE.Mesh[];
  readonly made: number;
  dispose(): void;
}

/** how many joints one hero may hold (past it, a part draws on its own); how many heroes at once (a game's players and
 *  the hall of heroes'; past it, a hero draws each part on its own); how many joints fit a row of the texture */
const JOINTS = 320;
const HEROES = 8;
const ROW_JOINTS = 64;
const TEXELS_A_JOINT = 4;
/** how many of a hero's views in a row must show parts the merge doesn't hold, or hide parts it does, to merge again:
 *  some seconds, so a flask or an arrow in hand comes and goes without one */
const SETTLED = 400;

const NOTHING = (): void => {};
const DEFAULT_BEFORE_RENDER = THREE.Object3D.prototype.onBeforeRender;

/** the joints' matrices, every hero's: made as the first hero is */
let joints: THREE.DataTexture | null = null;
const heroTaken: boolean[] = [];

/** The texture of every hero's joints, made once. */
function jointsTexture(): THREE.DataTexture {
  if (joints) return joints;
  const width = ROW_JOINTS * TEXELS_A_JOINT;
  const height = (JOINTS / ROW_JOINTS) * HEROES;
  joints = new THREE.DataTexture(new Float32Array(width * height * 4), width, height, THREE.RGBAFormat, THREE.FloatType);
  joints.minFilter = joints.magFilter = THREE.NearestFilter;
  joints.generateMipmaps = false;
  joints.needsUpdate = true;
  return joints;
}

// (untyped: TSL's types don't follow its int conversions across these calls yet, as in crowdNodes.ts)
/* eslint-disable @typescript-eslint/no-explicit-any */
let positioned: any = null;

/** How open the gate of the part a vertex belongs to is: 1 shown, 0 shrunk to nothing. */
function gateOpen(gate: any, texture: THREE.DataTexture): any {
  const { textureLoad, ivec2, int } = tsl as any;
  const at = int(gate);
  return textureLoad(texture, ivec2(at.mod(ROW_JOINTS).mul(TEXELS_A_JOINT), at.div(ROW_JOINTS))).x;
}

/** The position node of every merged mesh: a vertex's joints read off the texture, its normal turned with them. */
function jointedPosition(): unknown {
  if (positioned) return positioned;
  const { Fn, attribute, textureLoad, ivec2, int, mat4, vec4, positionLocal, normalLocal } = tsl as any;
  const texture = jointsTexture();
  const joint = (i: any): any => {
    const at = int(i);
    const x = at.mod(ROW_JOINTS).mul(TEXELS_A_JOINT);
    const y = at.div(ROW_JOINTS);
    const texel = (k: number): any => textureLoad(texture, ivec2(x.add(k), y));
    return mat4(texel(0), texel(1), texel(2), texel(3));
  };
  const index = attribute('jointIndex', 'vec4');
  const weight = attribute('jointWeight', 'vec4');
  const gate = attribute('jointGate', 'float');
  positioned = Fn(() => {
    const skin = joint(index.x).mul(weight.x).add(joint(index.y).mul(weight.y))
      .add(joint(index.z).mul(weight.z)).add(joint(index.w).mul(weight.w)).mul(gateOpen(gate, texture)).toVar();
    normalLocal.assign(skin.mul(vec4(normalLocal, 0)).xyz);
    return skin.mul(vec4(positionLocal, 1)).xyz;
  })();
  return positioned;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** each material's stand-in on a merged mesh, by what it stands in for */
const standIns = new WeakMap<THREE.Material, THREE.Material>();

/** What a merged mesh draws for `base`: `base` itself as far as three reads it, its values live (a glow's pulse, a
 *  colour set on it), with the position from the joints. A copy would stay as it was copied. Each of its properties is
 *  an own one that reads `base`'s: three keys a material's build by its own properties (`getMaterialCacheKey`), and
 *  inherited alone, materials with and without a map shared one build, its map null. */
function standInFor(base: THREE.Material): THREE.Material {
  let made = standIns.get(base);
  if (!made) {
    made = Object.create(base) as THREE.Material;
    const values = base as unknown as Record<string, unknown>;
    for (const key of Object.keys(base)) {
      Object.defineProperty(made, key, {
        enumerable: true,
        get: () => values[key],
        set: (value: unknown) => { values[key] = value; },
      });
    }
    (made as unknown as { positionNode: unknown }).positionNode = jointedPosition();
    // (its node reads nothing of the object: three would refresh it at every draw for holding one)
    stillNodes.add(made);
    standInBases.set(made, base);
    standIns.set(base, made);
  }
  return made;
}

/** The kit's material `part`'s is, or is the copy of (a skinned part keeps a copy: `Sculpt.build`), else its own. */
function baseOf(part: THREE.Mesh, kit: readonly THREE.Material[]): THREE.Material {
  const material = part.material as THREE.Material;
  if (kit.includes(material)) return material;
  return kit.find((m) => m.onBeforeCompile === material.onBeforeCompile) ?? material;
}

/** Whether `mesh` can be drawn as one with others: a mesh of one opaque lit material (a skinned one bound as three
 *  binds by default), drawn by three as it stands (no work of its own before its draw), whose shape never changes (a
 *  cloth's positions are marked as they move), its attributes plain floats. */
function drawsAsOne(mesh: THREE.SkinnedMesh): boolean {
  const instanced = (mesh as unknown as THREE.InstancedMesh).isInstancedMesh;
  if (!mesh.isMesh || instanced || mesh.morphTargetInfluences?.length) return false;
  if (mesh.isSkinnedMesh && mesh.bindMode !== THREE.AttachedBindMode) return false;
  if (mesh.onBeforeRender !== DEFAULT_BEFORE_RENDER || mesh.renderOrder !== 0 || mesh.userData.drawsAlone) return false;
  const material = mesh.material;
  if (Array.isArray(material) || material.transparent) return false;
  if ((material as THREE.ShaderMaterial).isShaderMaterial || (material as unknown as { webgpuLooks?: unknown }).webgpuLooks) return false;
  const geometry = mesh.geometry;
  if (geometry.groups.length > 1 || geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity) return false;
  if (Object.keys(geometry.morphAttributes).length || geometry.attributes.tangent) return false;
  for (const attribute of Object.values(geometry.attributes)) {
    if (!(attribute instanceof THREE.BufferAttribute) || !(attribute.array instanceof Float32Array)) return false;
  }
  return (geometry.attributes.position as THREE.BufferAttribute).usage === THREE.StaticDrawUsage;
}

/** Whether `object` is shown as far up as `root` (and is under it). */
function shownUnder(object: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let at: THREE.Object3D | null = object; at; at = at.parent) {
    if (!at.visible) return false;
    if (at === root) return true;
  }
  return false;
}

/** The attributes a merged mesh takes of a part: what the material reads (the bones become its joints). */
const attributesOf = (part: THREE.Mesh): string[] => Object.keys(part.geometry.attributes)
  .filter((name) => name !== 'skinIndex' && name !== 'skinWeight')
  .sort();

/** What parts must share to be drawn as one: what they draw as, the layers, the shadows received, the attributes. */
function keyOf(part: THREE.Mesh, kit: readonly THREE.Material[]): string {
  const attributes = attributesOf(part).map((name) => `${name}${part.geometry.attributes[name].itemSize}`).join(',');
  return `${baseOf(part, kit).id}|${part.layers.mask}|${part.receiveShadow}|${attributes}`;
}

const _normals = new THREE.Matrix3();
const _linear = new THREE.Matrix3();
const _matrix = new THREE.Matrix4();

/** `_normals` made (LᵀL)⁻¹ for the linear part L of a rigid piece's world matrix as merged: its joint turns a normal by
 *  L, and L (LᵀL)⁻¹ is L⁻ᵀ, the normal matrix three would draw the piece with. (A piece shrunk to nothing as it's
 *  merged keeps its normals: there's none to invert.) */
function normalsOfRigid(world: THREE.Matrix4): void {
  _linear.setFromMatrix4(world);
  _normals.copy(_linear).transpose().multiply(_linear);
  if (Math.abs(_normals.determinant()) < 1e-12) _normals.identity();
  else _normals.invert();
}

/** One attribute of a part laid into the merged one at `vertex`: positions by `bind` (a skinned part's bind matrix;
 *  none for a rigid piece), normals by `_normals`, every other attribute as it is. */
function layInto(name: string, from: THREE.BufferAttribute, into: Float32Array, vertex: number, bind: THREE.Matrix4 | null): void {
  const source = from.array as Float32Array;
  const at = vertex * from.itemSize;
  if (name === 'position' && bind) transformPoints(source, into, at, bind.elements);
  else if (name === 'normal') transformNormals(source, into, at, _normals.elements);
  else into.set(source, at);
}

/** Each point of `source` put by the matrix `m` into `into` from `at`. */
function transformPoints(source: Float32Array, into: Float32Array, at: number, m: ArrayLike<number>): void {
  for (let i = 0; i < source.length; i += 3) {
    const x = source[i];
    const y = source[i + 1];
    const z = source[i + 2];
    into[at + i] = m[0] * x + m[4] * y + m[8] * z + m[12];
    into[at + i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    into[at + i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  }
}

/** Each direction of `source` turned by the 3x3 matrix `m` into `into` from `at`. */
function transformNormals(source: Float32Array, into: Float32Array, at: number, m: ArrayLike<number>): void {
  for (let i = 0; i < source.length; i += 3) {
    const x = source[i];
    const y = source[i + 1];
    const z = source[i + 2];
    into[at + i] = m[0] * x + m[3] * y + m[6] * z;
    into[at + i + 1] = m[1] * x + m[4] * y + m[7] * z;
    into[at + i + 2] = m[2] * x + m[5] * y + m[8] * z;
  }
}

/** How the vertices of a part name their joints, and its gate. */
interface JointNames {
  of(part: THREE.SkinnedMesh): (bone: number) => number;
  gate(part: THREE.SkinnedMesh): number;
}

/** A merge for compiling alone: every vertex on the first joint. */
const NO_JOINTS: JointNames = { of: () => () => 0, gate: () => 0 };

/** A part's vertices' joints, and its gate, laid in at `vertex`. */
function layJoints(part: THREE.SkinnedMesh, names: JointNames, index: Float32Array, weight: Float32Array, gate: Float32Array,
  vertex: number): void {
  const count = part.geometry.attributes.position.count;
  const bones = part.geometry.attributes.skinIndex;
  const weights = part.geometry.attributes.skinWeight;
  const jointOf = names.of(part);
  gate.fill(names.gate(part), vertex, vertex + count);
  for (let i = 0; i < count; i++) {
    const at = (vertex + i) * 4;
    if (!part.isSkinnedMesh) {
      index[at] = jointOf(0);
      weight[at] = 1;
      continue;
    }
    for (let c = 0; c < 4; c++) {
      const share = weights.getComponent(i, c);
      index[at + c] = share > 0 ? jointOf(bones.getComponent(i, c)) : 0;
      weight[at + c] = share;
    }
  }
}

/** The parts' geometries in one, each vertex naming its joints and its part's gate (`names`). */
function mergedOf(parts: THREE.SkinnedMesh[], jointNames: JointNames, names = attributesOf(parts[0])): THREE.BufferGeometry {
  let vertices = 0;
  let corners = 0;
  for (const part of parts) {
    const geometry = part.geometry;
    vertices += geometry.attributes.position.count;
    corners += geometry.index ? geometry.index.count : geometry.attributes.position.count;
  }
  const sizeOf = (name: string): number => parts[0].geometry.attributes[name].itemSize;
  const arrays = new Map(names.map((name) => [name, new Float32Array(vertices * sizeOf(name))]));
  const jointIndex = new Float32Array(vertices * 4);
  const jointWeight = new Float32Array(vertices * 4);
  const jointGate = new Float32Array(vertices);
  const index = new Uint32Array(corners);
  let vertex = 0;
  let corner = 0;
  for (const part of parts) {
    const geometry = part.geometry;
    const count = geometry.attributes.position.count;
    const bind = part.isSkinnedMesh ? part.bindMatrix : null;
    // (a mirrored part's triangles wound the other way: three turns a mirrored mesh's faces as it draws it)
    const mirrored = (bind ?? part.matrixWorld).determinant() < 0;
    if (bind) _normals.getNormalMatrix(bind);
    else normalsOfRigid(part.matrixWorld);
    for (const name of names) layInto(name, geometry.attributes[name] as THREE.BufferAttribute, arrays.get(name)!, vertex, bind);
    layJoints(part, jointNames, jointIndex, jointWeight, jointGate, vertex);
    const own = geometry.index;
    const ownCount = own ? own.count : count;
    for (let i = 0; i < ownCount; i += 3) {
      for (let k = 0; k < 3; k++) {
        const from = i + (mirrored ? 2 - k : k);
        index[corner + i + k] = vertex + (own ? own.getX(from) : from);
      }
    }
    vertex += count;
    corner += ownCount;
  }
  const merged = new THREE.BufferGeometry();
  for (const name of names) merged.setAttribute(name, new THREE.BufferAttribute(arrays.get(name)!, sizeOf(name)));
  merged.setAttribute('jointIndex', new THREE.BufferAttribute(jointIndex, 4));
  merged.setAttribute('jointWeight', new THREE.BufferAttribute(jointWeight, 4));
  merged.setAttribute('jointGate', new THREE.BufferAttribute(jointGate, 1));
  merged.setIndex(new THREE.BufferAttribute(index, 1));
  return merged;
}

/** A merged mesh of `geometry`, drawing as `parts` do, standing at the origin of `holder`. */
function oneOf(parts: THREE.SkinnedMesh[], geometry: THREE.BufferGeometry, kit: readonly THREE.Material[], holder: THREE.Object3D): THREE.Mesh {
  const first = parts[0];
  const base = baseOf(first, kit);
  const mesh = new THREE.Mesh(geometry, standInFor(base));
  mesh.name = `drawn as one: ${base.name || first.name || 'part'}`;
  // (one mesh casts for all: `shadowOf`)
  mesh.castShadow = false;
  mesh.receiveShadow = first.receiveShadow;
  mesh.layers.mask = first.layers.mask;
  // (its vertices are wherever its joints put them)
  mesh.frustumCulled = false;
  // (nothing aims at it: the parts are what aims meet)
  mesh.raycast = NOTHING;
  mesh.matrixAutoUpdate = false;
  mesh.visible = false;
  holder.add(mesh);
  return mesh;
}

let shadowMaterial: THREE.MeshBasicMaterial | null = null;

/** What a hero's merged shadow is drawn with: the shadow map's own material, which takes its position node. */
function shadowStandIn(): THREE.Material {
  if (shadowMaterial) return shadowMaterial;
  shadowMaterial = new THREE.MeshBasicMaterial();
  shadowMaterial.name = 'hero shadow drawn as one';
  (shadowMaterial as unknown as { positionNode: unknown }).positionNode = jointedPosition();
  stillNodes.add(shadowMaterial);
  return shadowMaterial;
}

/** Whether `part` casts its shadow in the merged one: drawn as three's shadow pass draws any front-sided material. */
function castsMerged(part: THREE.SkinnedMesh): boolean {
  const material = part.material as THREE.Material;
  if (!part.castShadow || part.layers.isEnabled(HIDDEN_LAYER)) return false;
  return material.side === THREE.FrontSide && material.shadowSide === null && !(material.alphaTest > 0);
}

/** One mesh casting the shadows of `parts`, the shadow map alone drawing it (`drawAsOne`'s `shadow` shows it for that). */
function shadowOf(parts: THREE.SkinnedMesh[], jointNames: JointNames): THREE.Mesh {
  const mesh = new THREE.Mesh(mergedOf(parts, jointNames, ['position']), shadowStandIn());
  mesh.name = 'hero shadow drawn as one';
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.raycast = NOTHING;
  mesh.matrixAutoUpdate = false;
  mesh.visible = false;
  return mesh;
}

/** `parts` sorted by what they must share to be drawn as one. */
function groupsOf(parts: THREE.SkinnedMesh[], kit: readonly THREE.Material[]): THREE.SkinnedMesh[][] {
  const groups = new Map<string, THREE.SkinnedMesh[]>();
  for (const part of parts) {
    const key = keyOf(part, kit);
    const group = groups.get(key);
    if (group) group.push(part);
    else groups.set(key, [part]);
  }
  return [...groups.values()];
}

/** The parts of `root` that may be drawn as one. */
function candidatesOf(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const found: THREE.SkinnedMesh[] = [];
  root.traverse((object) => {
    if (drawsAsOne(object as THREE.SkinnedMesh)) found.push(object as THREE.SkinnedMesh);
  });
  return found;
}

/** The merged meshes of `model`'s parts as they stand now, for a warm-up to compile (each material drawn from the
 *  joints, a pipeline of its own), shown and hung from its root. */
export function drawnAsOneSamples(model: Model): void {
  if (!drawingAsOne.on) return;
  model.root.updateMatrixWorld(true);
  const kit = model.kit.mats as THREE.Material[];
  const shown = candidatesOf(model.root).filter((part) => shownUnder(part, model.root));
  for (const group of groupsOf(shown, kit)) {
    const mesh = oneOf(group, mergedOf(group, NO_JOINTS), kit, model.root);
    mesh.visible = true;
  }
  const casters = shown.filter(castsMerged);
  if (!casters.length) return;
  const caster = shadowOf(casters, NO_JOINTS);
  caster.visible = true;
  model.root.add(caster);
}

/** each part's key for its gate among a hero's joints (the part itself keys its own place) */
const gateKeys = new WeakMap<THREE.Object3D, object>();
function gateKeyOf(part: THREE.Object3D): object {
  let key = gateKeys.get(part);
  if (!key) {
    key = {};
    gateKeys.set(part, key);
  }
  return key;
}

/** A joint of a hero's: what makes its matrix; or a part's gate, its first number whether the part is shown. */
interface Joint { object: THREE.Object3D; inverse: THREE.Matrix4 | null; gate: boolean }

/**
 * `model`'s parts drawn as one (a hero's), its merged meshes in the scene, out of the model and standing still: the
 * first person sorts the model's meshes onto its layers once (`entities/viewModel.ts`), and what moves a mesh is what
 * writes its uniforms. The parts are those `drawsAsOne` takes, found now (gear is built whole and shown or hidden: a
 * part added later draws on its own).
 */
export function drawAsOne(model: Model): OneDraw {
  const seat = heroTaken.findIndex((taken) => !taken);
  const at = seat < 0 ? heroTaken.length : seat;
  if (!drawingAsOne.on || at >= HEROES) return { meshes: [], made: 0, dispose: NOTHING };
  heroTaken[at] = true;
  const firstJoint = at * JOINTS;
  const root = model.root;
  const kit = model.kit.mats as THREE.Material[];
  const candidates = candidatesOf(root);
  /** each candidate's state as last merged: its layers, shadows and positions' version in a number */
  const states = candidates.map(() => NaN);
  /** each candidate's material as last merged (an item's parts change theirs as it glows or not: `itemGlow.ts`) */
  const materials = candidates.map((): THREE.Material | null => null);
  let meshes: THREE.Mesh[] = [];
  /** the parts the merged meshes draw, those shown hidden while a render draws */
  let merged: THREE.SkinnedMesh[] = [];
  let holding = new Set<THREE.SkinnedMesh>();
  const hiddenForView: THREE.SkinnedMesh[] = [];
  /** how many views in a row the merge hasn't held what's shown */
  let unsettled = 0;
  /** the merged meshes' render bundle: recorded once, its commands one to the pass as he moves */
  const bundle = new gpu.BundleGroup();
  bundle.name = 'hero drawn as one';
  bundle.matrixAutoUpdate = false;
  bundle.visible = false;
  G.scene.add(bundle);
  let list: Joint[] = [];
  /** the mesh casting the merged parts' shadows, and those parts */
  let caster: THREE.Mesh | null = null;
  let casters: THREE.SkinnedMesh[] = [];
  let made = 0;
  /** whether a view's render has the parts hidden now */
  let hidden = false;

  const letGo = (): void => {
    for (const mesh of meshes) {
      bundle.remove(mesh);
      mesh.geometry.dispose();
    }
    meshes = [];
    merged = [];
    holding = new Set();
    list = [];
    unsettled = 0;
    if (caster) {
      G.scene.remove(caster);
      caster.geometry.dispose();
    }
    caster = null;
    casters = [];
  };

  const stateOf = (part: THREE.SkinnedMesh): number => {
    const version = (part.geometry.attributes.position as THREE.BufferAttribute).version;
    return part.layers.mask * 4 + (part.receiveShadow ? 2 : 0) + (part.castShadow ? 1 : 0) + version * 2 ** 34;
  };

  /** The joints of `parts` added to `list`, and how each part names them; null past what a hero holds. */
  const jointsFor = (parts: THREE.SkinnedMesh[], taken: Map<object, number>): JointNames | null => {
    const add = (object: THREE.Object3D, inverse: THREE.Matrix4 | null, gate = false): number => {
      const key = gate ? gateKeyOf(object) : inverse ?? object;
      let joint = taken.get(key);
      if (joint === undefined) {
        joint = list.length;
        list.push({ object, inverse, gate });
        taken.set(key, joint);
      }
      return firstJoint + joint;
    };
    for (const part of parts) {
      add(part, null, true);
      if (part.isSkinnedMesh) part.skeleton.bones.forEach((bone, i) => add(bone, part.skeleton.boneInverses[i]));
      else add(part, null);
    }
    if (list.length > JOINTS) return null;
    return {
      of: (part) => (bone) => (part.isSkinnedMesh ? add(part.skeleton.bones[bone], part.skeleton.boneInverses[bone]) : add(part, null)),
      gate: (part) => add(part, null, true),
    };
  };

  /** Merged again of the candidates shown now. */
  const make = (): void => {
    letGo();
    made++;
    const shown = candidates.filter((part) => shownUnder(part, root));
    const taken = new Map<object, number>();
    for (const group of groupsOf(shown, kit)) {
      const before = list.length;
      const jointNames = jointsFor(group, taken);
      if (!jointNames) {
        // (past what a hero holds, this group draws part by part)
        list.length = before;
        for (const [key, joint] of taken) if (joint >= before) taken.delete(key);
        continue;
      }
      const mesh = oneOf(group, mergedOf(group, jointNames), kit, bundle);
      mesh.visible = true;
      meshes.push(mesh);
      merged.push(...group);
    }
    holding = new Set(merged);
    bundle.needsUpdate = true;
    casters = merged.filter(castsMerged);
    if (!casters.length) return;
    caster = shadowOf(casters, jointsFor([], taken)!);
    G.scene.add(caster);
  };

  /** Whether a candidate is drawn otherwise since the last merge. */
  const changed = (): boolean => {
    let any = false;
    for (let i = 0; i < candidates.length; i++) {
      const state = stateOf(candidates[i]);
      const material = candidates[i].material as THREE.Material;
      if (state !== states[i] || material !== materials[i]) any = true;
      states[i] = state;
      materials[i] = material;
    }
    return any;
  };

  /** Whether what's shown has been other than the merge holds for `SETTLED` views in a row. */
  const settledOtherwise = (): boolean => {
    let differs = false;
    for (const part of candidates) {
      if (shownUnder(part, root) !== holding.has(part)) {
        differs = true;
        break;
      }
    }
    unsettled = differs ? unsettled + 1 : 0;
    return unsettled >= SETTLED;
  };

  /** Every joint's matrix written where the vertices read it. */
  const writeJoints = (): void => {
    const texture = jointsTexture();
    const data = texture.image.data as Float32Array;
    let write = firstJoint * TEXELS_A_JOINT * 4;
    for (const { object, inverse, gate } of list) {
      if (gate) {
        data[write] = shownUnder(object, root) ? 1 : 0;
      } else {
        const matrix = inverse ? _matrix.multiplyMatrices(object.matrixWorld, inverse) : object.matrixWorld;
        matrix.toArray(data, write);
      }
      write += TEXELS_A_JOINT * 4;
    }
    texture.needsUpdate = true;
    uploadTexture(texture);
  };

  /** The merged meshes shown and the parts hidden, or (`drawn` false) the other way round. */
  const show = (drawn: boolean): void => {
    hidden = drawn;
    if (drawn) {
      for (const part of merged) {
        if (!part.visible) continue;
        part.visible = false;
        hiddenForView.push(part);
      }
    } else {
      for (const part of hiddenForView) part.visible = true;
      hiddenForView.length = 0;
    }
    bundle.visible = drawn;
  };

  const view = (): (() => void) => {
    // (a render that never reached its end leaves them so: a compile's walk calls the scene's hook before and none
    // after. Believed, the hero's merged meshes stood where they first drew for good, his cloth walking off without him)
    if (hidden) show(false);
    // (as far up as the scene: the hall of heroes keeps its heroes out of it between its openings, and the merged
    // meshes stand in it whatever the hero does)
    if (!shownUnder(root, G.scene)) return NOTHING;
    if (changed() || settledOtherwise()) make();
    if (!meshes.length) return NOTHING;
    writeJoints();
    show(true);
    return () => show(false);
  };

  /** A shadow drawn inside a view's render: the merged parts cast by their one mesh, the others shown for it as they
   *  were, the merged meshes hidden, and back after. */
  const shadow = (): (() => void) => {
    if (!hidden) return NOTHING;
    show(false);
    for (const part of casters) part.castShadow = false;
    if (caster) caster.visible = true;
    return () => {
      for (const part of casters) part.castShadow = true;
      if (caster) caster.visible = false;
      show(true);
    };
  };

  const stopViews = aroundViews(view);
  const stopShadows = aroundShadows(shadow);
  return {
    get meshes() { return meshes; },
    get made() { return made; },
    dispose() {
      stopViews();
      stopShadows();
      letGo();
      G.scene.remove(bundle);
      heroTaken[at] = false;
    },
  };
}
