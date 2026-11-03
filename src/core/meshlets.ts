// The GPU-driven drawing's clusters (`?meshlets`) made in workers (core/meshlets.worker.ts): three makes a geometry's
// as it's first drawn, on the main thread, one a frame. As the lobby showed, each was a task of up to 160 ms, and its
// slowest second drew 29 frames (without meshlets, 76). Here a geometry not yet made draws as before (three's own
// way while it has none) until its clusters come back, all those asked together let in at once.
import * as THREE from 'three';
import { Box3, StorageBufferAttribute, Vector4 } from 'three/webgpu';
import { storage, uniform, uniformArray, vec2 } from 'three/tsl';

/** three's: the levels of detail a geometry may have */
const MAX_LODS = 6;
/** workers making clusters, at most */
const WORKERS = 2;

/** an attribute as the worker reads it: floats, `itemSize` a vertex */
export interface Floats { itemSize: number; array: Float32Array }

/** A geometry, or one of its groups, to cut into clusters */
export interface ClusterJob {
  id: number;
  sourceCount: number;
  /** what welds a vertex to another: position, normal, the uv if any, then the other attributes */
  keys: Floats[];
  hasUv: boolean;
  index: Uint32Array | null;
  start: number;
  count: number;
  grouped: boolean;
  /** the geometry's sphere's centre */
  center: number[];
}

/** what the worker sends back: three's `createMeshlets`, its arrays */
export interface ClusterArrays {
  id: number;
  vertexArray: Float32Array;
  stride: number;
  vertexCount: number;
  indexArray: Uint32Array;
  chunkArray: Float32Array;
  lods: { chunkStart: number; triangleStart: number; numTriangles: number; error: number }[];
  totalChunks: number;
  maxChunks: number;
  /** a group's box, min then max (null: the geometry's) */
  box: number[] | null;
  /** a group's sphere's radius (null: the geometry's) */
  radius: number | null;
}

type Group = { start: number; count: number } | null;
type Clusters = object;
/** what of three's meshlet pipeline this reaches */
interface Pipeline {
  _getClusters(geometry: THREE.BufferGeometry, group?: Group, prepare?: boolean): Clusters | null;
  _updateGeometry(geometry: THREE.BufferGeometry): void;
  _disposeGeometry(geometry: THREE.BufferGeometry): void;
  _onGeometryDispose: (event: { target: THREE.BufferGeometry }) => void;
  _clusters: WeakMap<THREE.BufferGeometry, Clusters>;
  _groupClusters: WeakMap<THREE.BufferGeometry, Map<string, Clusters>>;
  _waitingGeometry: unknown;
  _gpuProjectionId: unknown;
}

/** a job sent and not yet back */
interface Pending { geometry: THREE.BufferGeometry; group: Group; key: string | null }

/** What a warm-up does with the clusters its compile asks for */
export interface ClusterWait {
  /** holds every cluster back as it comes; the release lets in those held and says how many */
  hold: () => () => number;
  /** waits for every cluster asked so far to be back */
  back: () => Promise<void>;
}

/** Has `drawing` (three's MeshletDrawingPipeline) get its clusters from workers, or null where no worker can start
 *  (three makes them, as before). */
export function clustersInWorkers(drawing: object): ClusterWait | null {
  if (typeof Worker === 'undefined') return null;
  const pipeline = drawing as Pipeline;
  const workers: Worker[] = [];
  const pending = new Map<number, Pending>();
  const asked = new WeakMap<THREE.BufferGeometry, Set<string | null>>();
  let made: { job: Pending; arrays: ClusterArrays }[] = [];
  const waiting: (() => void)[] = [];
  let next = 0;
  let holds = 0;
  for (let i = 0; i < WORKERS; i++) {
    try {
      const worker = new Worker(new URL('./meshlets.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<ClusterArrays>) => back(e.data);
      worker.onerror = (e) => console.error('WebGPU clusters:', e.message);
      workers.push(worker);
    } catch {
      break;
    }
  }
  if (workers.length === 0) return null;

  /** a job's clusters back: kept until every job asked is back, then all let in at once (three makes its culling
   *  and batches again for each geometry let in, and waits while any is to come), unless a warm-up holds them */
  const back = (arrays: ClusterArrays) => {
    const job = pending.get(arrays.id);
    pending.delete(arrays.id);
    if (job === undefined) return;
    made.push({ job, arrays });
    letInOnceAllBack();
  };
  const letInOnceAllBack = (): number => {
    if (pending.size > 0) return 0;
    for (const resolve of waiting.splice(0)) resolve();
    if (holds > 0) return 0;
    for (const { job, arrays } of made) letIn(pipeline, job, arrays);
    const count = made.length;
    made = [];
    return count;
  };
  const ask = (geometry: THREE.BufferGeometry, group: Group, key: string | null) => {
    let keys = asked.get(geometry);
    if (keys === undefined) asked.set(geometry, keys = new Set());
    if (keys.has(key)) return;
    keys.add(key);
    const id = next++;
    pending.set(id, { geometry, group, key });
    const job = jobOf(id, geometry, group);
    const transfer = [...new Set([...job.keys.map((k) => k.array.buffer), ...(job.index ? [job.index.buffer] : [])])];
    workers[id % workers.length].postMessage(job, { transfer });
  };

  const disposeGeometry = pipeline._disposeGeometry.bind(pipeline);
  pipeline._disposeGeometry = (geometry) => {
    // (a job asked before the geometry changed comes back for what it was: dropped)
    asked.delete(geometry);
    for (const [id, job] of pending) if (job.geometry === geometry) pending.delete(id);
    made = made.filter(({ job }) => job.geometry !== geometry);
    disposeGeometry(geometry);
    letInOnceAllBack();
  };
  pipeline._getClusters = (geometry, group = null) => {
    pipeline._updateGeometry(geometry);
    const key = group !== null ? `${group.start}:${group.count}` : null;
    const clusters = key === null ? pipeline._clusters.get(geometry) : pipeline._groupClusters.get(geometry)?.get(key);
    if (clusters !== undefined) return clusters;
    ask(geometry, group, key);
    pipeline._waitingGeometry = pipeline._gpuProjectionId;
    return null;
  };
  return {
    hold: () => {
      holds++;
      return () => {
        holds--;
        return letInOnceAllBack();
      };
    },
    back: () => pending.size === 0 ? Promise.resolve() : new Promise((resolve) => waiting.push(resolve)),
  };
}

/** an attribute's values as floats, `itemSize` a vertex, whatever its layout */
function floatsOf(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): Floats {
  const { itemSize, count } = attribute;
  const plain = !('isInterleavedBufferAttribute' in attribute && attribute.isInterleavedBufferAttribute)
    && !attribute.normalized && attribute.array instanceof Float32Array;
  if (plain) return { itemSize, array: (attribute.array as Float32Array).slice(0, count * itemSize) };
  const array = new Float32Array(count * itemSize);
  for (let i = 0; i < count; i++) {
    for (let c = 0; c < itemSize; c++) array[i * itemSize + c] = attribute.getComponent(i, c);
  }
  return { itemSize, array };
}

/** the attributes three reads into clusters beyond position, normal and uv, by name */
function extrasOf(geometry: THREE.BufferGeometry): string[] {
  return Object.keys(geometry.attributes).filter((name) => name !== 'position' && name !== 'normal' && name !== 'uv'
    && !(geometry.attributes[name] as THREE.InstancedBufferAttribute).isInstancedBufferAttribute
    && geometry.attributes[name].itemSize <= 4);
}

/** a geometry's job, its arrays copied out (sent to the worker, not shared) */
function jobOf(id: number, geometry: THREE.BufferGeometry, group: Group): ClusterJob {
  const { position, normal, uv } = geometry.attributes;
  const indexCount = geometry.index !== null ? geometry.index.count : position.count;
  const start = group !== null ? group.start : 0;
  const count = group !== null ? Math.floor(Math.min(group.count, indexCount - start) / 3) * 3 : indexCount;
  if (geometry.boundingSphere === null) geometry.computeBoundingSphere();
  if (geometry.boundingBox === null) geometry.computeBoundingBox();
  const keys = [position, normal, ...(uv ? [uv] : []), ...extrasOf(geometry).map((name) => geometry.attributes[name])];
  const index = geometry.index !== null ? Uint32Array.from(geometry.index.array as ArrayLike<number>) : null;
  return {
    id, sourceCount: position.count, keys: keys.map(floatsOf), hasUv: uv !== undefined, index, start, count,
    grouped: group !== null, center: geometry.boundingSphere!.center.toArray(),
  };
}

/** three's: a vec4 node's components an attribute of `itemSize` uses */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const swizzle = (node: any, itemSize: number) =>
  itemSize === 1 ? node.x : itemSize === 2 ? node.xy : itemSize === 3 ? node.xyz : node;

/** The worker's arrays made into what three's `createMeshlets` returns, and cached as three caches its own */
function letIn(pipeline: Pipeline, job: Pending, arrays: ClusterArrays): void {
  const { geometry, group, key } = job;
  const clusters = clustersOf(geometry, group, arrays);
  if (key === null) {
    pipeline._clusters.set(geometry, clusters);
  } else {
    let cache = pipeline._groupClusters.get(geometry);
    if (cache === undefined) pipeline._groupClusters.set(geometry, cache = new Map());
    cache.set(key, clusters);
  }
  if (!geometry.hasEventListener('dispose', pipeline._onGeometryDispose as never)) {
    geometry.addEventListener('dispose', pipeline._onGeometryDispose as never);
  }
}

/** three's `createMeshlets`' return, from the worker's arrays (its nodes over them, made here) */
function clustersOf(geometry: THREE.BufferGeometry, group: Group, arrays: ClusterArrays): Clusters {
  const { vertexArray, stride, vertexCount, indexArray, chunkArray, lods, totalChunks } = arrays;
  const extras = extrasOf(geometry);
  const vertexBuffer = storage(new StorageBufferAttribute(vertexArray, 4), 'vec4', vertexCount * stride).toReadOnly();
  const strideNode = uniform(stride, 'uint');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = (vertex: any, offset: number) => vertexBuffer.element(vertex.mul(strideNode).add(offset));
  const chunkBuffer = storage(new StorageBufferAttribute(chunkArray, 4), 'vec4', totalChunks * 2).toReadOnly();
  const lodOffsets = Array.from({ length: MAX_LODS }, (_, i) => {
    const lod = lods[i];
    return lod !== undefined ? new Vector4(lod.triangleStart, lod.numTriangles, lod.chunkStart, lod.error) : new Vector4();
  });
  const attributes = new Map(extras.map((name, e) =>
    [name, { offset: 2 + e, itemSize: geometry.attributes[name].itemSize }]));
  const instancedAttributes = Object.keys(geometry.attributes)
    .filter((name) => (geometry.attributes[name] as THREE.InstancedBufferAttribute).isInstancedBufferAttribute
      && geometry.attributes[name].itemSize <= 4)
    .map((name) => ({ name, itemSize: geometry.attributes[name].itemSize }));
  const layoutKey = extras.map((name) => name + ':' + geometry.attributes[name].itemSize).join(',') + '|'
    + instancedAttributes.map(({ name, itemSize }) => name + ':' + itemSize).join(',');
  const boundingSphere = geometry.boundingSphere!.clone();
  if (arrays.radius !== null) boundingSphere.radius = arrays.radius;
  const boundingBox = arrays.box !== null
    ? new Box3().setFromArray(arrays.box) : geometry.boundingBox!.clone();
  const totalTriangles = indexArray.length / 3;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return {
    position: (vertex: any) => element(vertex, 0).xyz,
    normal: (vertex: any) => element(vertex, 1).xyz,
    uv: (vertex: any) => vec2(element(vertex, 0).w, element(vertex, 1).w),
    hasAttribute: (name: string) => attributes.has(name),
    attribute: (name: string, vertex: any) =>
      swizzle(element(vertex, attributes.get(name)!.offset), attributes.get(name)!.itemSize),
    indexBuffer: storage(new StorageBufferAttribute(indexArray, 1), 'uint', totalTriangles * 3).toReadOnly(),
    chunkBounds: (chunk: any) => chunkBuffer.element(chunk.mul(2)),
    chunkCone: (chunk: any) => chunkBuffer.element(chunk.mul(2).add(1)),
    /* eslint-enable @typescript-eslint/no-explicit-any */
    chunkArray,
    chunkCount: totalChunks,
    lodOffsets: uniformArray(lodOffsets, 'vec4'),
    lodOffsetValues: lodOffsets,
    lodTriangleEnds: lods.map((lod) => lod.triangleStart + lod.numTriangles),
    lodCount: lods.length,
    maxChunks: arrays.maxChunks,
    instancedAttributes,
    vertexArray,
    stride,
    indexArray,
    attributeLayout: attributes,
    layoutKey,
    geometry,
    boundingSphere,
    boundingBox,
  };
}
