// Crowds: every creature of a kind drawn in one draw call a material (and one more each for its shadow), however
// many are about. A creature is a few meshes a joint (models/shapes.ts `Sculpt`), some 77 draw calls a body with its
// shadow, and a full wave was mostly draw calls (#222). So a kind's pieces are merged per material into one geometry
// skinned on its joints, and each body is an instance of it: its joints' matrices and its looks (the kit's dissolve,
// frost, char and hit flash, its edge's colour, how strongly each glow shines, whether it casts a shadow) are a row
// of a float texture the shaders read by `gl_InstanceID`. The bodies keep their own meshes on a layer the camera
// doesn't draw (`CROWD_LAYER`), for what reads them: an arrow lodges in them, the outline draws them.
// `?crowd=0` draws each body on its own again, for A/B.
import * as THREE from 'three';
import { G } from '../../state';
import { QUALITY } from '../../data/quality';
import { qualityLevel } from '../../core/quality';
import type { Model } from '../../types';
import { CROWD_LAYER, HERO_SHADOW_LAYER } from '../../core/layers';
import { WEBGPU, refreshedInFull, uploadTexture } from '../../core/webgpu';
import { crowdNodeMaterial } from './crowdNodes';

const ON = typeof location === 'undefined' || !/[?&]crowd=0/.test(location.search);

/** A body drawn in its kind's crowd. */
export interface CrowdBody {
  readonly model: Model;
  /** whether it casts a shadow (a dissolving body doesn't: its shadow wouldn't dissolve with it) */
  readonly castsShadow: boolean;
}

/** a row's texels past its joints' matrices: the kit's dissolve, frost, char and hit; its edge, and its shadow's
 *  scale (0: none); then each material's glow, four to a texel */
const LOOKS = 2;

/** One kind's crowd: its pieces merged per material (`slots`), its bodies, and their rows. */
interface Kind {
  /** the joints' inverse bind matrices: its skeleton's bones, then the joints its rigid pieces hang on */
  inverses: THREE.Matrix4[];
  /** of a body's pieces, the one hung on each rigid joint, and the one whose material each slot draws */
  jointFrom: number[];
  slotFrom: number[];
  /** how many pieces a body has */
  pieces: number;
  seats: Seat[];
  /** floats a row, rows the texture has room for */
  row: number;
  rows: number;
  data: Float32Array;
  uniforms: { uCrowd: { value: THREE.DataTexture }; uCrowdJoints: { value: number } };
  slots: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.Material>[];
  /** how far a body's pieces reach from its root at its root's scale of 1 (its slots' spheres round it) */
  reach: number;
}

/** A body's place in its crowd: the joints its row is made from, and the materials whose glow it reads. */
interface Seat {
  body: CrowdBody;
  kind: Kind;
  joints: THREE.Object3D[];
  glows: THREE.MeshStandardMaterial[];
}

const kinds = new Map<string, Kind>();
const seats = new Map<CrowdBody, Seat>();
/** the smallest piece that casts a shadow at the quality (`QUALITY.minCasterRadius`, core/quality.ts) */
const minCaster = { value: 0 };
const _box = new THREE.Box3(), _sphere = new THREE.Sphere();
const _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _n = new THREE.Matrix3();

/** The kit material `material` is, or is a copy of (a skinned piece's: models/shapes.ts), or null. */
function baseOf(model: Model, material: THREE.Material): THREE.MeshStandardMaterial | null {
  const mats = model.kit.mats as THREE.MeshStandardMaterial[];
  if (mats.includes(material as THREE.MeshStandardMaterial)) return material as THREE.MeshStandardMaterial;
  return mats.find((m) => m.onBeforeCompile === material.onBeforeCompile) ?? null;
}

/** The pieces of `model` its kind shares (`Sculpt`'s), in a solid material of its kit: what the crowd draws. */
function piecesOf(model: Model): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  model.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry.userData.shared || Array.isArray(m.material)) return;
    if (m.material.transparent || !baseOf(model, m.material)) return;
    out.push(m);
  });
  return out;
}

/** An object's largest scale in the world, as core/quality.ts judges a piece's shadow by. */
function maxScale(o: THREE.Object3D): number {
  o.getWorldScale(_s);
  return Math.max(_s.x, _s.y, _s.z);
}

/** Whether a piece casts a shadow by the model's own choice (core/quality.ts keeps it in `userData.casts`). */
const castsOf = (m: THREE.Mesh): boolean => (m.userData.casts as boolean | undefined) ?? m.castShadow;

/** A piece in its slot: the mesh, and the joint it hangs on (-1: skinned on the skeleton's bones). */
type Part = { mesh: THREE.Mesh; joint: number };

/** The kind of `model` (its pieces `pieces`) set up: its joints, and its slots' merged geometry and materials. */
function kindOf(model: Model, pieces: THREE.Mesh[]): Kind | null {
  model.root.updateMatrixWorld(true);
  const rootInv = model.root.matrixWorld.clone().invert();
  const skinned = pieces.filter((p) => (p as THREE.SkinnedMesh).isSkinnedMesh) as THREE.SkinnedMesh[];
  const skeleton = skinned[0]?.skeleton;
  if (skinned.some((p) => p.skeleton !== skeleton)) return null;
  const inverses = skeleton ? skeleton.boneInverses.map((m) => m.clone()) : [];
  const jointFrom: number[] = [], slotFrom: number[] = [], parts: Part[][] = [];
  const jointOf = new Map<THREE.Object3D, number>(), slotOf = new Map<THREE.Material, number>();
  pieces.forEach((mesh, k) => {
    const base = baseOf(model, mesh.material as THREE.Material)!;
    let slot = slotOf.get(base);
    if (slot === undefined) { slotOf.set(base, slot = slotFrom.push(k) - 1); parts.push([]); }
    let joint = -1;
    if (!(mesh as THREE.SkinnedMesh).isSkinnedMesh) {
      const parent = mesh.parent!;
      joint = jointOf.get(parent) ?? -1;
      if (joint < 0) {
        jointOf.set(parent, joint = inverses.length);
        jointFrom.push(k);
        inverses.push(new THREE.Matrix4().multiplyMatrices(rootInv, parent.matrixWorld).invert());
      }
    }
    parts[slot].push({ mesh, joint });
  });
  const row = (inverses.length * 4 + LOOKS + Math.ceil(slotFrom.length / 4)) * 4;
  const texture = rowsTexture(new Float32Array(row * 8), row / 4, 8);
  const kind: Kind = {
    inverses, jointFrom, slotFrom, pieces: pieces.length, seats: [], row, rows: 8, data: texture.image.data as Float32Array,
    uniforms: { uCrowd: { value: texture }, uCrowdJoints: { value: inverses.length } }, slots: [], reach: 0,
  };
  const rootScale = maxScale(model.root);
  parts.forEach((list, slot) => {
    const base = baseOf(model, pieces[slotFrom[slot]].material as THREE.Material)!;
    const geometry = merged(list, rootInv, rootScale, base.vertexColors);
    const material = WEBGPU ? crowdNodeMaterial(base, { texture, joints: inverses.length, looks: LOOKS, minCaster, eyeClear: EYE_CLEAR }, slot)
      : crowdMaterial(base, kind, slot);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = list.some((p) => castsOf(p.mesh));
    // (drawn over the kept shadows, as the heroes are: `world/moonShadow.ts`)
    mesh.layers.enable(HERO_SHADOW_LAYER);
    mesh.receiveShadow = true;
    // (culled by a sphere round its bodies, made each frame as their rows are: `writeRows`. Never culled, the
    // village's training dummies drew into every face of the hall's shadowed lamps, 60 shadow draws a frame)
    geometry.computeBoundingSphere();
    const sphere = geometry.boundingSphere!;
    kind.reach = Math.max(kind.reach, sphere.center.length() + sphere.radius);
    // (on WebGPU the shadow is drawn by the slot's own material, skinned by its position node)
    if (!WEBGPU) mesh.customDepthMaterial = depthMaterial(kind);
    mesh.visible = false;
    mesh.name = `crowd ${model.root.userData.crowdKind}`;
    kind.slots.push(mesh);
    G.scene.add(mesh);
  });
  return kind;
}

/** A float texture of `rows` rows `width` texels wide, over `data`. */
function rowsTexture(data: Float32Array, width: number, rows: number): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, width, rows, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * A slot's pieces merged into one geometry in the kind's bind pose: a rigid piece put where it hangs at rest and
 * skinned whole to its joint, a skinned piece kept on its bones; each vertex's `crowdCaster` the piece's size as its
 * shadow is judged by (its bounding radius at its scale over the root's), 0 where it casts none.
 */
function merged(list: Part[], rootInv: THREE.Matrix4, rootScale: number, colors: boolean): THREE.InstancedBufferGeometry {
  const flat = list.map(({ mesh }) => (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry));
  const count = flat.reduce((n, g) => n + g.attributes.position.count, 0);
  const colorSize = colors ? flat[0].attributes.color.itemSize : 0;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  const index = new Float32Array(count * 2), weight = new Float32Array(count * 2), caster = new Float32Array(count);
  const color = new Float32Array(count * colorSize);
  let at = 0;
  list.forEach(({ mesh, joint }, n) => {
    const g = flat[n], p = g.attributes.position, nm = g.attributes.normal, t = g.attributes.uv;
    const skin = joint < 0 ? mesh as THREE.SkinnedMesh : null;
    const place = skin ? _m.copy(skin.bindMatrix) : _m.multiplyMatrices(rootInv, mesh.matrixWorld);
    _n.getNormalMatrix(place);
    if (!g.boundingSphere) g.computeBoundingSphere();
    const size = castsOf(mesh) ? g.boundingSphere!.radius * maxScale(mesh) / rootScale : 0;
    placeAll(p, place, pos, at);
    turnAll(nm, _n, nor, at);
    for (let i = 0; i < p.count; i++, at++) {
      if (t) { uv[at * 2] = t.getX(i); uv[at * 2 + 1] = t.getY(i); }
      for (let c = 0; c < colorSize; c++) color[at * colorSize + c] = g.attributes.color.getComponent(i, c);
      index[at * 2] = skin ? g.attributes.skinIndex.getX(i) : joint;
      index[at * 2 + 1] = skin ? g.attributes.skinIndex.getY(i) : 0;
      weight[at * 2] = skin ? g.attributes.skinWeight.getX(i) : 1;
      weight[at * 2 + 1] = skin ? g.attributes.skinWeight.getY(i) : 0;
      caster[at] = size;
    }
    if (g !== mesh.geometry) g.dispose();
  });
  const out = new THREE.InstancedBufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (colorSize) out.setAttribute('color', new THREE.BufferAttribute(color, colorSize));
  out.setAttribute('crowdIndex', new THREE.BufferAttribute(index, 2));
  out.setAttribute('crowdWeight', new THREE.BufferAttribute(weight, 2));
  out.setAttribute('crowdCaster', new THREE.BufferAttribute(caster, 1));
  out.instanceCount = 0;
  return out;
}

/**
 * Every point of `from` placed by `m` into `to` from vertex `at`, as `Vector3.applyMatrix4` places each, read off the
 * array: read and written a vector at a time, the crowd's merge took 0.36 s of a boot's warm-up.
 */
function placeAll(from: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, m: THREE.Matrix4,
  to: Float32Array, at: number): void {
  const e = m.elements;
  for (let i = 0, o = at * 3; i < from.count; i++, o += 3) {
    const x = from.getX(i), y = from.getY(i), z = from.getZ(i);
    const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
    to[o] = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
    to[o + 1] = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
    to[o + 2] = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
  }
}

/** Every normal of `from` turned by `m` into `to` from vertex `at` and made a unit long, as `Vector3`'s would be. */
function turnAll(from: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, m: THREE.Matrix3,
  to: Float32Array, at: number): void {
  const e = m.elements;
  for (let i = 0, o = at * 3; i < from.count; i++, o += 3) {
    const x = from.getX(i), y = from.getY(i), z = from.getZ(i);
    const nx = e[0] * x + e[3] * y + e[6] * z, ny = e[1] * x + e[4] * y + e[7] * z, nz = e[2] * x + e[5] * y + e[8] * z;
    const scale = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1);
    to[o] = nx * scale;
    to[o + 1] = ny * scale;
    to[o + 2] = nz * scale;
  }
}

/** `text` with `from` replaced by `to`; throws when it isn't there (a three.js update moved the chunk). */
function swap(text: string, from: string, to: string): string {
  if (!text.includes(from)) throw new Error(`crowd: the shader has no ${from}`);
  return text.replace(from, to);
}

/** what the vertex shaders read a body's row with: its joints' matrices, its looks and its skinning */
const ROW_GLSL = /* glsl */ `
uniform highp sampler2D uCrowd;
uniform int uCrowdJoints;
attribute vec2 crowdIndex;
attribute vec2 crowdWeight;
vec4 crowdTexel(int x) { return texelFetch(uCrowd, ivec2(x, gl_InstanceID), 0); }
mat4 crowdJoint(float i) {
  int x = int(i) * 4;
  return mat4(crowdTexel(x), crowdTexel(x + 1), crowdTexel(x + 2), crowdTexel(x + 3));
}
vec4 crowdLook(int i) { return crowdTexel(uCrowdJoints * 4 + i); }
mat4 crowdSkin() {
  mat4 m = crowdJoint(crowdIndex.x);
  if (crowdWeight.y > 0.0) m = m * crowdWeight.x + crowdJoint(crowdIndex.y) * crowdWeight.y;
  return m;
}`;

/** how far from the camera (m, along its view) a body is drawn whole, and nearer than which none of it is, a screen
 *  door between: through the eyes a charge runs into the foe it throws ahead of it, and the camera stood inside a
 *  husk's glowing body, half the frame its glow (lab `cast bullRush --views first --what`); shadows stay whole */
const EYE_CLEAR = { from: 0.2, to: 0.5 };

/** A slot's material: its kind's own, drawn from the rows, every body's looks its own, dissolved at the camera. */
function crowdMaterial(base: THREE.MeshStandardMaterial, kind: Kind, slot: number): THREE.MeshStandardMaterial {
  const m = base.clone();
  // (each body's glow is its own material's, from its row)
  m.emissiveIntensity = 1;
  const own = base.onBeforeCompile, key = base.customProgramCacheKey();
  m.onBeforeCompile = (shader, renderer) => {
    own.call(base, shader, renderer);
    Object.assign(shader.uniforms, kind.uniforms, { uCrowdSlot: { value: slot } });
    let v = swap(shader.vertexShader, '#include <common>', `#include <common>
${ROW_GLSL}
uniform int uCrowdSlot;
flat varying vec4 vCrowdFx;
flat varying vec4 vCrowdLook;`);
    v = swap(v, '#include <beginnormal_vertex>', `#include <beginnormal_vertex>
mat4 crowdMatrix = crowdSkin();
objectNormal = mat3(crowdMatrix) * objectNormal;`);
    shader.vertexShader = swap(v, '#include <begin_vertex>', `#include <begin_vertex>
transformed = (crowdMatrix * vec4(transformed, 1.0)).xyz;
vCrowdFx = crowdLook(0);
vec4 crowdGlows = crowdLook(${LOOKS} + uCrowdSlot / 4);
vCrowdLook = vec4(crowdLook(1).rgb, crowdGlows[uCrowdSlot % 4]);`);
    let f = swap(shader.fragmentShader, 'uniform float uDissolve;', `flat varying vec4 vCrowdFx;
flat varying vec4 vCrowdLook;
#define uDissolve vCrowdFx.x`);
    f = swap(f, 'uniform float uFrozen;', '#define uFrozen vCrowdFx.y');
    f = swap(f, 'uniform float uChar;', '#define uChar vCrowdFx.z');
    f = swap(f, 'uniform float uHit;', '#define uHit vCrowdFx.w');
    f = swap(f, 'uniform vec3 uEdge;', '#define uEdge vCrowdLook.rgb');
    f = swap(f, '#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
float crowdDoor = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
if (crowdDoor < 1.0 - smoothstep(${EYE_CLEAR.from.toFixed(2)}, ${EYE_CLEAR.to.toFixed(2)}, 1.0 / gl_FragCoord.w)) discard;`);
    shader.fragmentShader = swap(f, 'vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = emissive * vCrowdLook.a;');
  };
  m.customProgramCacheKey = () => `${key}-crowd`;
  return m;
}

/** A slot's shadow material: skinned from the rows, the pieces too small for the quality's shadows (and every piece
 *  of a body casting none) cut from the shadow map. */
function depthMaterial(kind: Kind): THREE.MeshDepthMaterial {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, kind.uniforms, { uMinCaster: minCaster });
    let v = swap(shader.vertexShader, '#include <common>', `#include <common>
${ROW_GLSL}
uniform float uMinCaster;
attribute float crowdCaster;`);
    v = swap(v, '#include <begin_vertex>', `#include <begin_vertex>
transformed = (crowdSkin() * vec4(transformed, 1.0)).xyz;`);
    shader.vertexShader = swap(v, '#include <project_vertex>', `#include <project_vertex>
float crowdCast = crowdCaster * crowdLook(1).w;
if (crowdCast <= 0.0 || crowdCast < uMinCaster) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);`);
  };
  m.customProgramCacheKey = () => 'crowd-depth';
  return m;
}

/**
 * `body` drawn in its kind's crowd from now on, its own meshes put on `CROWD_LAYER`: false when it isn't a creature
 * whose kind shares its geometry (a hero), which is drawn on its own.
 */
export function joinCrowd(body: CrowdBody): boolean {
  const name = body.model.root.userData.crowdKind as string | undefined;
  if (!ON || !name || seats.has(body)) return false;
  const pieces = piecesOf(body.model);
  if (!pieces.length) return false;
  let kind = kinds.get(name);
  if (!kind) {
    const made = kindOf(body.model, pieces);
    if (!made) return false;
    kinds.set(name, kind = made);
    hookScene();
  }
  if (pieces.length !== kind.pieces) {
    console.warn(`crowd: a ${name} with ${pieces.length} pieces, its kind's ${kind.pieces}: drawn on its own`);
    return false;
  }
  const bones = (pieces.find((p) => (p as THREE.SkinnedMesh).isSkinnedMesh) as THREE.SkinnedMesh | undefined)?.skeleton.bones ?? [];
  const joints = [...bones, ...kind.jointFrom.map((k) => pieces[k].parent!)];
  const glows = kind.slotFrom.map((k) => baseOf(body.model, pieces[k].material as THREE.Material)!);
  for (const p of pieces) p.layers.set(CROWD_LAYER);
  const seat: Seat = { body, kind, joints, glows };
  kind.seats.push(seat);
  seats.set(body, seat);
  return true;
}

/** The meshes `model`'s kind's crowd is drawn with (none before a body of its kind has joined it): what a warm-up of
 *  the kind compiles (game/warmup.ts). */
export function crowdSlots(model: Model): THREE.Object3D[] {
  return kinds.get(model.root.userData.crowdKind as string)?.slots ?? [];
}

/** Whether `body` is drawn in its kind's crowd (the lab's `coop` asks of every foe). */
export const inCrowd = (body: CrowdBody): boolean => seats.has(body);

/** `body` out of its crowd (disposed). */
export function leaveCrowd(body: CrowdBody): void {
  const seat = seats.get(body);
  if (!seat) return;
  seats.delete(body);
  const list = seat.kind.seats, i = list.indexOf(seat);
  list[i] = list[list.length - 1];
  list.pop();
  // (its last body gone, its draws hidden at once: left to the next frame drawn, a crowd of the last biome's foes
  // stood shown through the frames run undrawn after it, and a cast on a page a check kept came out otherwise)
  if (!list.length) for (const slot of seat.kind.slots) slot.visible = false;
}

let hooked = false;
/** The rows written as the scene is drawn: after its matrices are updated, before its shadows and its objects. */
function hookScene(): void {
  if (hooked) return;
  hooked = true;
  const before = G.scene.onBeforeRender;
  G.scene.onBeforeRender = (...args) => {
    before.apply(G.scene, args);
    // (on WebGPU a shadow is a render of the scene of its own, the arms too: the bodies stand as they did)
    if (!WEBGPU || args[2] === G.camera) writeRows();
  };
}

/** Every crowd's rows written from its bodies as they stand this frame. */
function writeRows(): void {
  minCaster.value = QUALITY[qualityLevel()].minCasterRadius;
  for (const mesh of grown.splice(0)) refreshedInFull.delete(mesh);
  for (const kind of kinds.values()) {
    const n = kind.seats.length;
    for (const slot of kind.slots) {
      slot.visible = n > 0;
      slot.geometry.instanceCount = n;
    }
    if (!n) continue;
    if (n > kind.rows) grow(kind, n);
    _box.makeEmpty();
    let scale = 0;
    kind.seats.forEach((seat, i) => {
      writeRow(kind, seat, i * kind.row);
      for (const joint of seat.joints) _box.expandByPoint(_v.setFromMatrixPosition(joint.matrixWorld));
      scale = Math.max(scale, seat.body.model.root.matrixWorld.getMaxScaleOnAxis());
    });
    // (each piece lies within its body's reach of a joint it hangs on, however its ragdoll lies)
    _box.getBoundingSphere(_sphere);
    _sphere.radius += kind.reach * scale;
    for (const slot of kind.slots) slot.geometry.boundingSphere!.copy(_sphere);
    kind.uniforms.uCrowd.value.needsUpdate = true;
    // (its materials are still: their refresh sends no texture, core/webgpu.ts)
    if (WEBGPU) uploadTexture(kind.uniforms.uCrowd.value);
  }
}

/** the slots refreshed in full this frame, their texture made anew (`grow`) */
const grown: THREE.Mesh[] = [];

/** A body's row, from float `at`: its joints' matrices, then its looks. */
function writeRow(kind: Kind, seat: Seat, at: number): void {
  const data = kind.data, joints = seat.joints, model = seat.body.model;
  for (let b = 0; b < joints.length; b++, at += 16) _m.multiplyMatrices(joints[b].matrixWorld, kind.inverses[b]).toArray(data, at);
  const u = model.kit.u, edge = u.uEdge.value;
  data[at] = u.uDissolve.value;
  data[at + 1] = u.uFrozen.value;
  data[at + 2] = u.uChar.value;
  data[at + 3] = u.uHit.value;
  data[at + 4] = edge.r;
  data[at + 5] = edge.g;
  data[at + 6] = edge.b;
  data[at + 7] = seat.body.castsShadow ? model.root.matrixWorld.getMaxScaleOnAxis() : 0;
  for (let s = 0; s < seat.glows.length; s++) data[at + LOOKS * 4 + s] = seat.glows[s].emissiveIntensity;
}

/**
 * Room in `kind`'s texture for `n` bodies, its rows `n` up to a power of two: the same texture over a larger image,
 * made again on the GPU. (A new texture draws random numbers for its id, three's `generateUUID`: made mid-fight, it
 * moved every particle after it, and an A/B's pictures differed where nothing was drawn otherwise.)
 */
function grow(kind: Kind, n: number): void {
  kind.rows = 2 ** Math.ceil(Math.log2(n));
  kind.data = new Float32Array(kind.row * kind.rows);
  const texture = kind.uniforms.uCrowd.value;
  texture.dispose();
  texture.image = { data: kind.data, width: kind.row / 4, height: kind.rows };
  texture.needsUpdate = true;
  // (a new texture on the GPU: its slots' bindings told of it, by a full refresh for a frame)
  if (WEBGPU) {
    for (const mesh of kind.slots) {
      refreshedInFull.add(mesh);
      grown.push(mesh);
    }
  }
}
