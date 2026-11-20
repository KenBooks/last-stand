// What a frame sends to the GPU, counted as the page's WebGL context is told of it: each buffer's data
// (`bufferData`, `bufferSubData`) and each texture's pixels (`texImage2D`, `texSubImage2D`, `texImage3D`,
// `texSubImage3D`), the calls and their bytes, by the call. On a phone's GPU a buffer or a texture written while a
// frame still queued reads it holds the page until that frame is done (or copies it): from play, the S25's render took
// 3.3 ms a frame standing in the village and 10 to 17 walking (trace JQ2E-3Y1K), its draws much the same.
import * as THREE from 'three';
import { G } from '../../../src/state';
import { WEBGPU } from '../../../src/core/webgpu';

/** one kind of upload's running count: its calls and their bytes */
export interface UploadCount {
  calls: number;
  bytes: number;
}

/** what's been uploaded since the context was first wrapped, by the call's name */
const counts = new Map<string, UploadCount>();
/** the context wrapped, so it's wrapped once */
let wrapped: WebGL2RenderingContext | null = null;

/** The bytes of a typed array or buffer handed to a call, or 0 for anything else (a size alone, a picture). */
function bytesOf(data: unknown): number {
  if (ArrayBuffer.isView(data)) return data.byteLength;
  if (data instanceof ArrayBuffer) return data.byteLength;
  return 0;
}

/** The bytes a texture call's pixels hold: the typed array among its arguments, else a picture's width by height by 4
 *  (a canvas, an image: as the GPU takes it). */
function textureBytes(args: unknown[]): number {
  for (const arg of args) {
    const bytes = bytesOf(arg);
    if (bytes > 0) return bytes;
  }
  const picture = args.find((arg) => typeof arg === 'object' && arg !== null && 'width' in arg && 'height' in arg);
  if (!picture) return 0;
  const { width, height } = picture as { width: number; height: number };
  return width * height * 4;
}

/** The bytes a `bufferSubData` sends: its data's whole, or where it's given a length (WebGL 2's `srcOffset` and
 *  `length`, in elements, as three sends an attribute's update ranges) that many of its elements. */
function subDataBytes(args: unknown[]): number {
  const data = args[2];
  const length = args[4];
  if (ArrayBuffer.isView(data) && typeof length === 'number' && length > 0) {
    const element = (data as unknown as { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT ?? 1;
    return length * element;
  }
  return bytesOf(data);
}

/** `name` counted once more, `bytes` long. */
function count(name: string, bytes: number): void {
  const now = counts.get(name) ?? { calls: 0, bytes: 0 };
  now.calls++;
  now.bytes += bytes;
  counts.set(name, now);
}

/** The context's method `name` wrapped to count its calls and their bytes by `bytesFrom`. */
function wrapMethod(gl: WebGL2RenderingContext, name: string, bytesFrom: (args: unknown[]) => number): void {
  const target = gl as unknown as Record<string, (...args: unknown[]) => unknown>;
  const original = target[name].bind(gl);
  target[name] = (...args: unknown[]): unknown => {
    count(name, bytesFrom(args));
    return original(...args);
  };
}

/** Starts counting on the renderer's context (WebGL alone). */
function wrap(): void {
  if (WEBGPU) return;
  const gl = G.renderer.getContext() as WebGL2RenderingContext;
  if (wrapped === gl) return;
  // (bufferData's second argument is a size or the data; bufferSubData's third is the data)
  wrapMethod(gl, 'bufferData', (args) => bytesOf(args[1]));
  wrapMethod(gl, 'bufferSubData', subDataBytes);
  for (const name of ['texImage2D', 'texSubImage2D', 'texImage3D', 'texSubImage3D']) {
    wrapMethod(gl, name, textureBytes);
  }
  wrapped = gl;
}

/** What's been uploaded so far, a running count by call to take differences of (none on WebGPU). */
export function uploadsSoFar(): Map<string, UploadCount> {
  wrap();
  return new Map([...counts].map(([name, { calls, bytes }]) => [name, { calls, bytes }]));
}

/** What was uploaded between two running counts, by call. */
export function uploadsBetween(
  before: Map<string, UploadCount>,
  after: Map<string, UploadCount>,
): Map<string, UploadCount> {
  const between = new Map<string, UploadCount>();
  for (const [name, now] of after) {
    const was = before.get(name) ?? { calls: 0, bytes: 0 };
    const calls = now.calls - was.calls;
    if (calls > 0) between.set(name, { calls, bytes: now.bytes - was.bytes });
  }
  return between;
}

/** each attribute's version as last read, to tell which changed (three sends an attribute again when it does) */
const versions = new WeakMap<THREE.BufferAttribute | THREE.InterleavedBuffer, number>();

/** A name for `object`: its own and its parent's, as a reader finds it. */
function nameOf(object: THREE.Object3D): string {
  const own = object.name || object.type;
  const parent = object.parent && object.parent !== G.scene ? object.parent.name || object.parent.type : '';
  return parent ? `${parent} > ${own}` : own;
}

/** The buffers `mesh` sends three, with a name each: its geometry's attributes, and an instanced mesh's instances. */
function buffersOf(mesh: THREE.Mesh): [string, THREE.BufferAttribute | THREE.InterleavedBufferAttribute][] {
  const named: [string, THREE.BufferAttribute | THREE.InterleavedBufferAttribute][] = [];
  for (const [key, attribute] of Object.entries(mesh.geometry.attributes)) named.push([key, attribute]);
  if (mesh.geometry.index) named.push(['index', mesh.geometry.index]);
  const instanced = mesh as THREE.InstancedMesh;
  if (instanced.isInstancedMesh) {
    named.push(['instanceMatrix', instanced.instanceMatrix]);
    if (instanced.instanceColor) named.push(['instanceColor', instanced.instanceColor]);
  }
  return named;
}

/** The scene's buffers whose version changed since the last call (each sent again as it's next drawn, in whole or by
 *  its update ranges), each named by its object and attribute with its whole size, the most first; the first call
 *  reads them all and names none. */
export function buffersChanged(): { name: string; bytes: number }[] {
  const changed: { name: string; bytes: number }[] = [];
  G.scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.geometry) return;
    for (const [key, attribute] of buffersOf(mesh)) {
      const store = (attribute as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute
        ? (attribute as THREE.InterleavedBufferAttribute).data
        : (attribute as THREE.BufferAttribute);
      const was = versions.get(store);
      versions.set(store, store.version);
      if (was === undefined || was === store.version) continue;
      changed.push({ name: `${nameOf(object)} ${key}`, bytes: store.array.byteLength });
    }
  });
  return changed.sort((a, b) => b.bytes - a.bytes);
}
