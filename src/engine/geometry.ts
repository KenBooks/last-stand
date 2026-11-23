// The game's geometry handed to the engine: a mesh's vertices (written in place where they only moved), an instanced
// mesh's set of matrices and tints, and a skinned mesh's bones, written into the frame's own memory.
import * as THREE from 'three';
import type { Core } from './core';

/** (its attributes as handed over too: a geometry given others in their place, a hero's piece at another detail,
 *  has their versions begin again, and drew with the buffers it had: the ranger's boots without their shafts) */
interface GeometryEntry {
  id: number; version: number; position: unknown; index: unknown; draws: number; indexVersion: number;
}
interface SetEntry { id: number; version: number; count: number }
type Attribute = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;

const scratchMatrix = new THREE.Matrix4();
const IDENTITY = new THREE.Matrix4();
const EMPTY_FLOATS = new Float32Array(0), EMPTY_SHORTS = new Uint16Array(0), EMPTY_INDICES = new Uint32Array(0);

/** An attribute's values as floats, whatever array holds them (interleaved, normalized bytes...). */
function floatsOf(attribute: Attribute | undefined): Float32Array {
  if (!attribute) return EMPTY_FLOATS;
  const plain = attribute as THREE.BufferAttribute;
  const interleaved = (attribute as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute;
  if (!interleaved && plain.array instanceof Float32Array) {
    return plain.array.length === attribute.count * attribute.itemSize ? plain.array
      : plain.array.subarray(0, attribute.count * attribute.itemSize);
  }
  const size = attribute.itemSize, out = new Float32Array(attribute.count * size);
  for (let i = 0; i < attribute.count; i++) {
    for (let c = 0; c < size; c++) out[i * size + c] = attribute.getComponent(i, c);
  }
  return out;
}

export class Geometries {
  private geometries = new WeakMap<THREE.BufferGeometry, GeometryEntry>();
  private sets = new WeakMap<THREE.InstancedMesh, SetEntry>();
  private skeletonFrames = new WeakMap<THREE.Skeleton, { frame: number; binds: { bind: number[]; at: number }[] }>();

  constructor(private core: Core) {}

  /** What's kept of the geometry handed over forgotten: the next frame hands each over again. */
  forget(): void {
    this.geometries = new WeakMap();
    this.sets = new WeakMap();
  }

  /** A geometry's mesh in the engine, its vertices placed by the attribute `positions`; 0: it has none. */
  geometryId(geometry: THREE.BufferGeometry, positions = 'position'): number {
    const core = this.core, attributes = geometry.attributes;
    const position = attributes[positions] as THREE.BufferAttribute | undefined;
    if (!position) return 0;
    const index = geometry.index;
    // (a geometry rewritten in place says so by its attributes' versions)
    const colorVersion = (attributes.color as THREE.BufferAttribute | undefined)?.version ?? 0;
    const version = position.version + (index?.version ?? 0) * 4096 + colorVersion * 16777216;
    const entry = this.geometries.get(geometry);
    const draws = index ? index.count : position.count;
    const sameShape = !!entry && entry.position === position && entry.index === index && entry.draws === draws;
    if (entry && entry.version === version && sameShape) return entry.id;
    const color = attributes.color;
    // (the same vertices moved, none added or taken: written into the buffer it has. Made anew, the hero's cloth and a
    // blade's trail were three meshes made and dropped every frame)
    if (entry?.id && sameShape && entry.indexVersion === (index?.version ?? 0) && !core.tape) {
      const set = core.engine.set_mesh_vertices(entry.id, floatsOf(position), floatsOf(attributes.normal),
        floatsOf(attributes.uv), floatsOf(color), color?.itemSize ?? 3);
      core.freshViews();
      if (set) {
        entry.version = version;
        core.stats.movedMeshes++;
        return entry.id;
      }
    }
    if (entry?.id) { core.engine.drop_mesh(entry.id); core.held.meshes--; }
    const skinIndex = attributes.skinIndex as THREE.BufferAttribute | undefined;
    const joints = !skinIndex ? EMPTY_SHORTS
      : skinIndex.array instanceof Uint16Array ? skinIndex.array : Uint16Array.from(skinIndex.array);
    const indices = !index ? EMPTY_INDICES : index.array instanceof Uint32Array ? index.array : Uint32Array.from(index.array);
    const id = core.engine.add_mesh(
      floatsOf(position), floatsOf(attributes.normal), floatsOf(attributes.uv),
      floatsOf(color), color?.itemSize ?? 3, indices, joints, floatsOf(attributes.skinWeight));
    this.geometries.set(geometry, { id, version, position, index, draws, indexVersion: index?.version ?? 0 });
    core.held.meshes++;
    core.stats.newMeshes++;
    core.freshViews();
    return id;
  }

  /** An instanced mesh's set of matrices and tints in the engine, sent again as their versions or its count move. */
  setId(mesh: THREE.InstancedMesh): number {
    const core = this.core, matrices = mesh.instanceMatrix, tints = mesh.instanceColor;
    const version = matrices.version + (tints?.version ?? 0) * 65536;
    const entry = this.sets.get(mesh);
    if (entry && entry.version === version && entry.count === mesh.count) return entry.id;
    let colours = EMPTY_FLOATS;
    if (tints) {
      colours = new Float32Array(mesh.count * 4);
      for (let i = 0; i < mesh.count; i++) {
        colours[i * 4] = tints.getX(i); colours[i * 4 + 1] = tints.getY(i); colours[i * 4 + 2] = tints.getZ(i);
        colours[i * 4 + 3] = 1;
      }
    }
    const placed = (matrices.array as Float32Array).subarray(0, mesh.count * 16);
    const id = core.engine.set_instances(entry?.id ?? 0, placed, colours);
    if (!entry) core.held.sets++;
    this.sets.set(mesh, { id, version, count: mesh.count });
    core.freshViews();
    return id;
  }

  /** A look's list (`RustLook.list`) written after the frame's bones, and where it begins (in rows of 16). */
  listOf(floats: Float32Array): number {
    const core = this.core;
    // (whole rows: a row is a matrix to the shader)
    const from = core.boneFloats, room = Math.ceil(floats.length / 16) * 16;
    if (from + room > core.boneCapacity) core.takeViews(core.capacity, (from + room) * 2);
    core.bones.set(floats, from);
    core.boneFloats = from + room;
    return from / 16;
  }

  /**
   * A skinned mesh's bones written after the frame's others, and where they begin (in matrices): each bone times
   * the mesh's own bind matrix, so a skeleton's are written once for each way its meshes are bound. (A hero's pieces
   * each hang on a joint of their own, bound where that joint stood: written once for them all by the first's, the
   * ranger's boots drew without their shafts, skinned from the wrong place.)
   */
  bonesOf(mesh: THREE.SkinnedMesh): number {
    const core = this.core, skeleton = mesh.skeleton;
    let written = this.skeletonFrames.get(skeleton);
    if (!written || written.frame !== core.frame) {
      skeleton.update();
      written = { frame: core.frame, binds: [] };
      this.skeletonFrames.set(skeleton, written);
    }
    const bind = mesh.bindMatrix.elements;
    for (const one of written.binds) {
      if (one.bind.every((value, index) => value === bind[index])) return one.at;
    }
    const from = core.boneFloats, floats = skeleton.boneMatrices?.length ?? skeleton.bones.length * 16;
    if (from + floats > core.boneCapacity) core.takeViews(core.capacity, (from + floats) * 2);
    const matrices = skeleton.boneMatrices as Float32Array;
    if (mesh.bindMatrix.equals(IDENTITY)) {
      core.bones.set(matrices, from);
    } else {
      for (let bone = 0; bone < floats; bone += 16) {
        scratchMatrix.fromArray(matrices, bone).multiply(mesh.bindMatrix).toArray(core.bones, from + bone);
      }
    }
    core.boneFloats = from + floats;
    written.binds.push({ bind: bind.slice(), at: from / 16 });
    return from / 16;
  }
}
