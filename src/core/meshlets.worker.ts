// Makes the GPU-driven drawing's clusters (`?meshlets`) off the main thread: three's `createMeshlets`
// (three/examples/jsm/utils/MeshletGeometryUtils.js, r187, MIT) up to its arrays, the nodes over them made by the page
// (core/meshlets.ts). On the page each geometry's was a task of up to 160 ms as the lobby showed.
import { MeshoptClusterizer } from 'three/addons/libs/meshopt_clusterizer.module.js';
import { MeshoptSimplifier } from 'three/addons/libs/meshopt_simplifier.module.js';
import type { ClusterJob, ClusterArrays } from './meshlets';

/** three's: the triangles of a cluster, padded to it with degenerate ones */
const MESHLET_SIZE = 64;
/** three's: the vertices a cluster may reach, so faceted shapes still fill their 64 triangles */
const MAX_MESHLET_VERTICES = MESHLET_SIZE * 3;
/** three's: a level that removes less than 15% of the one before is simplified again without keeping its topology */
const MIN_LOD_REDUCTION = 0.85;
const SLOPPY_ERROR_SCALE = 4;

/** three's levels of detail, each a share of the triangles and the error it may make */
const LOD_TARGETS = [
  { ratio: 1.0, error: 0.0, weights: [0.25, 0.25, 0.25, 0.5, 0.5], flags: [] },
  { ratio: 0.55, error: 0.004, weights: [0.2, 0.2, 0.2, 0.35, 0.35], flags: ['RegularizeLight', 'Permissive', 'Prune'] },
  { ratio: 0.25, error: 0.015, weights: [0.12, 0.12, 0.12, 0.2, 0.2], flags: ['RegularizeLight', 'Permissive', 'Prune'] },
  { ratio: 0.1, error: 0.05, weights: [0.08, 0.08, 0.08, 0.12, 0.12], flags: ['RegularizeLight', 'Permissive', 'Prune'] },
  { ratio: 0.04, error: 0.14, weights: [0.04, 0.04, 0.04, 0.06, 0.06], flags: ['Regularize', 'Permissive', 'Prune'] },
  { ratio: 0.015, error: 0.3, weights: [0.02, 0.02, 0.02, 0.03, 0.03], flags: ['Regularize', 'Permissive', 'Prune'] },
] as const;

const ready = Promise.all([MeshoptClusterizer.ready, MeshoptSimplifier.ready]);

self.onmessage = async (e: MessageEvent<ClusterJob>) => {
  await ready;
  const arrays = clustersOf(e.data);
  const transfer = [arrays.vertexArray.buffer, arrays.indexArray.buffer, arrays.chunkArray.buffer];
  self.postMessage(arrays, { transfer });
};

/** Identical vertices welded into one, each the first of its kind: their sources and each vertex's weld */
function weld(job: ClusterJob): { sources: number[]; remap: Uint32Array } {
  const { sourceCount, keys: keyAttributes } = job;
  const keySize = keyAttributes.reduce((size, attribute) => size + attribute.itemSize, 0);
  const keys = new Float32Array(sourceCount * keySize);
  const keyBits = new Uint32Array(keys.buffer);
  const tableSize = 2 ** Math.ceil(Math.log2(sourceCount * 2 + 1));
  const table = new Int32Array(tableSize).fill(-1);
  const remap = new Uint32Array(sourceCount);
  const sources: number[] = [];
  const referenced = referencedBy(job);
  for (let i = 0; i < sourceCount; i++) {
    if (referenced !== null && referenced[i] === 0) continue;
    const offset = i * keySize;
    let k = offset;
    for (const attribute of keyAttributes) {
      for (let c = 0; c < attribute.itemSize; c++) keys[k++] = attribute.array[i * attribute.itemSize + c] + 0;
    }
    let hash = 2166136261;
    for (let c = offset; c < k; c++) hash = Math.imul(hash ^ keyBits[c], 16777619);
    let slot = (hash >>> 0) & (tableSize - 1);
    let index = -1;
    while (table[slot] !== -1) {
      const other = sources[table[slot]] * keySize;
      let c = 0;
      while (c < keySize && keys[other + c] === keys[offset + c]) c++;
      if (c === keySize) {
        index = table[slot];
        break;
      }
      slot = (slot + 1) & (tableSize - 1);
    }
    if (index === -1) {
      index = sources.length;
      sources.push(i);
      table[slot] = index;
    }
    remap[i] = index;
  }
  return { sources, remap };
}

/** the vertices a group's triangles use (null: the whole geometry's) */
function referencedBy(job: ClusterJob): Uint8Array | null {
  if (!job.grouped) return null;
  const referenced = new Uint8Array(job.sourceCount);
  for (let i = job.start; i < job.start + job.count; i++) referenced[job.index !== null ? job.index[i] : i] = 1;
  return referenced;
}

/** three's `createMeshlets`, its arrays alone */
function clustersOf(job: ClusterJob): ClusterArrays {
  const [position, normal] = job.keys;
  const uv = job.hasUv ? job.keys[2] : null;
  const extras = job.keys.slice(job.hasUv ? 3 : 2);
  const { sources, remap } = weld(job);
  const vertexCount = sources.length;
  const positions = new Float32Array(vertexCount * 3);
  const simplifierAttributes = new Float32Array(vertexCount * 5);
  // [ position.xyz, uv.x ], [ normal.xyz, uv.y ] and one vec4 per other attribute
  const stride = 2 + extras.length;
  const vertexArray = new Float32Array(vertexCount * stride * 4);
  for (let i = 0; i < vertexCount; i++) {
    const source = sources[i];
    for (let e = 0; e < extras.length; e++) {
      const { itemSize, array } = extras[e];
      for (let c = 0; c < itemSize; c++) vertexArray[(i * stride + 2 + e) * 4 + c] = array[source * itemSize + c];
    }
    const p = position.array, n = normal.array;
    const x = p[source * 3], y = p[source * 3 + 1], z = p[source * 3 + 2];
    const nx = n[source * 3], ny = n[source * 3 + 1], nz = n[source * 3 + 2];
    const u = uv !== null ? uv.array[source * 2] : 0;
    const v = uv !== null ? uv.array[source * 2 + 1] : 0;
    positions.set([x, y, z], i * 3);
    simplifierAttributes.set([nx, ny, nz, u, v], i * 5);
    vertexArray.set([x, y, z, u, nx, ny, nz, v], i * stride * 4);
  }
  const sourceIndices = new Uint32Array(job.count);
  for (let i = 0; i < sourceIndices.length; i++) {
    sourceIndices[i] = remap[job.index !== null ? job.index[job.start + i] : job.start + i];
  }
  const lods = levelsOf(sourceIndices, positions, simplifierAttributes);
  const packed = packed_(lods);
  return {
    id: job.id, vertexArray, stride, vertexCount, ...packed,
    maxChunks: lods[0].meshletCount,
    box: job.grouped ? boxOf(positions) : null,
    radius: job.grouped ? radiusOf(positions, job.center) : null,
  };
}

/** a level of detail's clusters as meshoptimizer gives them */
interface Level {
  meshlets: ReturnType<typeof MeshoptClusterizer.buildMeshlets>;
  bounds: ReturnType<typeof MeshoptClusterizer.computeMeshletBounds>;
  error: number;
  meshletCount: number;
}

/** each level of detail simplified from the last and cut into clusters */
function levelsOf(sourceIndices: Uint32Array, positions: Float32Array, attributes: Float32Array): Level[] {
  const sourceScale = MeshoptSimplifier.getScale(positions, 3);
  const levels: Level[] = [];
  let indices = sourceIndices;
  let previousError = 0;
  for (let i = 0; i < LOD_TARGETS.length; i++) {
    let error = 0;
    if (i > 0) {
      const target = LOD_TARGETS[i];
      const targetIndexCount = Math.min(indices.length,
        Math.max(3, Math.floor(sourceIndices.length * target.ratio / 3) * 3));
      let simplified = MeshoptSimplifier.simplifyWithAttributes(indices, positions, 3, attributes, 5,
        [...target.weights], null, targetIndexCount, target.error, [...target.flags]);
      if (indices.length > targetIndexCount && simplified[0].length > indices.length * MIN_LOD_REDUCTION) {
        const sloppy = MeshoptSimplifier.simplifySloppy(indices, positions, 3, null, targetIndexCount,
          target.error * SLOPPY_ERROR_SCALE);
        if (sloppy[0].length >= 3 && sloppy[0].length < simplified[0].length) simplified = sloppy;
      }
      if (simplified[0].length >= 3) {
        indices = simplified[0];
        error = previousError + simplified[1] * sourceScale;
      } else {
        error = previousError;
      }
    }
    previousError = error;
    const meshlets = MeshoptClusterizer.buildMeshlets(indices, positions, 3, MAX_MESHLET_VERTICES, MESHLET_SIZE, 0.25);
    const bounds = MeshoptClusterizer.computeMeshletBounds(meshlets, positions, 3);
    levels.push({ meshlets, bounds, error, meshletCount: meshlets.meshletCount });
  }
  return levels;
}

/** every level's clusters in one index array, padded to 64 triangles, and their bounds and normal cones */
function packed_(levels: Level[]): Pick<ClusterArrays, 'indexArray' | 'chunkArray' | 'lods' | 'totalChunks'> {
  const totalChunks = levels.reduce((sum, level) => sum + level.meshletCount, 0);
  const indexArray = new Uint32Array(totalChunks * MESHLET_SIZE * 3);
  const chunkArray = new Float32Array(totalChunks * 8);
  const lods: ClusterArrays['lods'] = [];
  let chunkOffset = 0;
  let triangleOffset = 0;
  for (const level of levels) {
    lods.push({ chunkStart: chunkOffset, triangleStart: triangleOffset, numTriangles: level.meshletCount * MESHLET_SIZE,
      error: level.error });
    for (let m = 0; m < level.meshletCount; m++) {
      const meshlet = MeshoptClusterizer.extractMeshlet(level.meshlets, m);
      const meshletTriangles = meshlet.triangles.length / 3;
      for (let t = 0; t < MESHLET_SIZE; t++) {
        const triangle = triangleOffset + m * MESHLET_SIZE + t;
        for (let k = 0; k < 3; k++) {
          indexArray[triangle * 3 + k] = t < meshletTriangles
            ? meshlet.vertices[meshlet.triangles[t * 3 + k]] : meshlet.vertices[0];
        }
      }
      const bound = level.bounds[m];
      chunkArray.set([bound.centerX, bound.centerY, bound.centerZ, bound.radius,
        bound.coneAxisX, bound.coneAxisY, bound.coneAxisZ, bound.coneCutoff], chunkOffset * 8);
      chunkOffset++;
    }
    triangleOffset += level.meshletCount * MESHLET_SIZE;
  }
  return { indexArray, chunkArray, lods, totalChunks };
}

/** the box round a group's welded vertices, min then max */
function boxOf(positions: Float32Array): number[] {
  const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      box[c] = Math.min(box[c], positions[i + c]);
      box[c + 3] = Math.max(box[c + 3], positions[i + c]);
    }
  }
  return box;
}

/** how far a group's vertices reach from the geometry's sphere's centre (three keeps a group's sphere there) */
function radiusOf(positions: Float32Array, center: readonly number[]): number {
  let radiusSq = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const dx = positions[i] - center[0], dy = positions[i + 1] - center[1], dz = positions[i + 2] - center[2];
    radiusSq = Math.max(radiusSq, dx * dx + dy * dy + dz * dz);
  }
  return Math.sqrt(radiusSq);
}
