// What a frame sends to the GPU. Its calls and bytes were counted as the page's WebGL context was told of them
// (`bufferData`, `bufferSubData`, the textures' uploads); the page draws on WebGPU alone now and has no such
// context, so that count is empty. What is still read is the scene's buffers whose version changed, each sent
// again as it's next drawn: on a phone's GPU a buffer written while a frame still queued reads it holds the page
// until that frame is done (or copies it): from play, the S25's render took 3.3 ms a frame standing in the village
// and 10 to 17 walking (trace JQ2E-3Y1K), its draws much the same.
import * as THREE from 'three';
import { G } from '../../../src/state';

/** one kind of upload's running count: its calls and their bytes */
export interface UploadCount {
  calls: number;
  bytes: number;
}

/** What's been uploaded so far, a running count by call to take differences of: nothing, as the page has no WebGL
 *  context to count on. */
export function uploadsSoFar(): Map<string, UploadCount> {
  return new Map();
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
