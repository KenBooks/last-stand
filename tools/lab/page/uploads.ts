// What a frame sends to the GPU: the calls and bytes of the engine's device's queue (`writeBuffer`, `writeTexture`,
// `copyExternalImageToTexture`), counted as the page makes them (the queue's prototype wrapped once, as the first
// count is asked for). They were the page's WebGL context's (`bufferData`, `bufferSubData`, the textures' uploads),
// which the engine's frame has none of: under it the count was empty. What's also read is the scene's buffers whose
// version changed, each handed to the engine again: on a phone's GPU a buffer written while a frame still queued
// reads it holds the page until that frame is done (or copies it): from play, the S25's render took 3.3 ms a frame
// standing in the village and 10 to 17 walking (trace JQ2E-3Y1K), its draws much the same.
import * as THREE from 'three';
import { G } from '../../../src/state';

/** one kind of upload's running count: its calls and their bytes */
export interface UploadCount {
  calls: number;
  bytes: number;
}

/** the running count, by call, since the queue was first wrapped */
const counted = new Map<string, UploadCount>();
/** who's told of each write as it's made (`uploadsOver`), if anyone */
let listener: ((bytes: number) => void) | null = null;

/** A write of `bytes` by `call` counted. */
function count(call: string, bytes: number): void {
  const now = counted.get(call) ?? { calls: 0, bytes: 0 };
  now.calls++;
  now.bytes += bytes;
  counted.set(call, now);
  listener?.(bytes);
}

/** The bytes `writeBuffer` sends: its `size` (in elements of a typed array, else bytes), else the data's from
 *  `offset` on. */
function bufferBytes(data: { byteLength: number }, offset = 0, size?: number): number {
  const element = (data as unknown as { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT ?? 1;
  if (size !== undefined) return size * element;
  return data.byteLength - offset * element;
}

/** The bytes a texture's write covers: its rows by their bytes, its layers. */
function textureBytes(layout: GPUTexelCopyBufferLayout, size: GPUExtent3D, data: { byteLength: number }): number {
  const extent = size as GPUExtent3DDict & number[];
  const height = extent.height ?? extent[1] ?? 1;
  const layers = extent.depthOrArrayLayers ?? extent[2] ?? 1;
  const row = layout.bytesPerRow ?? data.byteLength;
  return Math.min(data.byteLength, row * height * layers);
}

/** A copied picture's pixels at 4 bytes each. */
function pictureBytes(size: GPUExtent3D): number {
  const extent = size as GPUExtent3DDict & number[];
  const width = extent.width ?? extent[0] ?? 1;
  const height = extent.height ?? extent[1] ?? 1;
  return width * height * 4;
}

/** The queue's writes wrapped to be counted, once. */
let wrapped = false;
function wrapQueue(): void {
  if (wrapped || typeof GPUQueue === 'undefined') return;
  wrapped = true;
  // (each wrapped by its arguments as a list: the calls' overloads don't type as one function)
  const queue = GPUQueue.prototype as unknown as Record<string, (...args: unknown[]) => void>;
  wrapCall(queue, 'writeBuffer', (args) => bufferBytes(args[2] as { byteLength: number },
    args[3] as number | undefined, args[4] as number | undefined));
  wrapCall(queue, 'writeTexture', (args) => textureBytes(args[2] as GPUTexelCopyBufferLayout,
    args[3] as GPUExtent3D, args[1] as { byteLength: number }));
  wrapCall(queue, 'copyExternalImageToTexture', (args) => pictureBytes(args[2] as GPUExtent3D));
}

/** `call` of `on` counted by the bytes `bytesOf` its arguments says. */
function wrapCall(
  on: Record<string, (...args: unknown[]) => void>,
  call: string,
  bytesOf: (args: unknown[]) => number,
): void {
  const own = on[call];
  on[call] = function counted(this: unknown, ...args: unknown[]): void {
    count(call, bytesOf(args));
    own.apply(this, args);
  };
}

/** What's been uploaded so far, a running count by call to take differences of (counted from the first ask). */
export function uploadsSoFar(): Map<string, UploadCount> {
  wrapQueue();
  return new Map([...counted].map(([call, now]) => [call, { ...now }]));
}

/** Every write's bytes told to `told` while `run` runs. */
export async function writesOver(run: () => Promise<unknown>, told: (bytes: number) => void): Promise<void> {
  wrapQueue();
  listener = told;
  try {
    await run();
  } finally {
    listener = null;
  }
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
