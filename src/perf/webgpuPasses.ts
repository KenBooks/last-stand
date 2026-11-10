// WebGPU's frame split by what each of its passes draws, from three's own timestamps: the sun's shadow, the scene,
// the post chain, what's drawn over the finished frame. WebGL's split comes from its timer queries a part at a time
// (`ui/perfHud.ts`); on WebGPU three times every render pass, and tells its inspector each one's timestamp id as it
// begins (`beginRender`), so each is named by its id. Named by its call's order in the frame instead, the scene's
// pass read as the shadow's in every frame the sun's shadow drew in it (three draws it inside the scene's call, and
// numbers the scene's id after it). From the owner's phone: its GPU took 11.5 ms a frame paused and 24 in the lobby,
// the same view (traces N5TH-2XC9, R5FJ-9TNN), where this PC drew the two alike: the split says which pass grows.
import * as THREE from 'three';
import { G } from '../state';

/** what of three's WebGPU renderer this reads: its inspector, told of each render, and its pool of timestamps */
interface Timed {
  inspector: { beginRender(uid: string, scene: THREE.Object3D, camera: THREE.Camera, target: unknown): void };
  backend: { timestampQueryPool: { render: { timestamps: Map<string, number> } | null } };
}

/** each render's part, by its timestamp id: the last few hundred kept, the oldest let go first (all let go at once,
 *  the frame whose timestamps were being read lost its names every 50 frames or so) */
const partOf = new Map<string, string>();
const KEPT = 400;

/** A render's part of the frame: what it draws and into what. */
function partFor(scene: THREE.Object3D, camera: THREE.Camera, target: unknown): string {
  if ((scene as unknown as { isQuadMesh?: boolean }).isQuadMesh) return 'post';
  if (scene === G.scene) return camera === G.camera ? 'scene' : 'shadow';
  // (the world's labels and a foe's outline go straight onto the canvas, over the post chain's last pass)
  return target === null ? 'over frame' : 'other';
}

/** Names each of the renderer's renders by its timestamp id as it begins, for `lastFrameParts`. */
export function nameWebGpuPasses(renderer: THREE.WebGLRenderer): void {
  const inspector = (renderer as unknown as Timed).inspector;
  const begin = inspector.beginRender.bind(inspector);
  inspector.beginRender = (uid, scene, camera, target) => {
    partOf.set(uid, partFor(scene, camera, target));
    if (partOf.size > KEPT) partOf.delete(partOf.keys().next().value!);
    begin(uid, scene, camera, target);
  };
}

/** The last frame's time by part (ms), from the timestamps three's last read resolved, or null if none. */
export function lastFrameParts(renderer: THREE.WebGLRenderer): Record<string, number> | null {
  const stamps = (renderer as unknown as Timed).backend.timestampQueryPool.render?.timestamps;
  if (!stamps?.size) return null;
  const frameOf = (uid: string): number => Number(/:f(\d+)$/.exec(uid)?.[1] ?? -1);
  const last = Math.max(...[...stamps.keys()].map(frameOf));
  if (last < 0) return null;
  const parts: Record<string, number> = {};
  for (const [uid, ms] of stamps) {
    if (frameOf(uid) !== last) continue;
    const part = partOf.get(uid) ?? 'other';
    parts[part] = (parts[part] ?? 0) + ms;
  }
  return parts;
}

/** what of three's WebGPU renderer resolves its timestamps */
interface Resolving {
  hasFeature(name: string): boolean;
  resolveTimestampsAsync(type: 'render' | 'compute'): Promise<number | undefined>;
  backend: { timestampQueryPool: { render: { timestamps: Map<string, number> } | null } };
}

/** Whether this renderer's passes are timed by the GPU's own timestamps (WebGPU's `timestamp-query`). */
export function timesPasses(renderer: THREE.WebGLRenderer): boolean {
  return (renderer as unknown as Resolving).hasFeature?.('timestamp-query') === true;
}

/** Every render pass drawn since the last read, timed by the GPU's timestamps and summed (ms): the profiler's frame
 *  on WebGPU (its own reads held meanwhile, `holdWebGpuTimes`), which a wait for the queue's work timed badly on a
 *  phone (its shadow maps' part read -38 ms, trace 4ADF-XJBB). */
export async function passesSinceLastRead(renderer: THREE.WebGLRenderer): Promise<number> {
  const resolving = renderer as unknown as Resolving;
  await resolving.resolveTimestampsAsync('render');
  let ms = 0;
  for (const took of resolving.backend.timestampQueryPool.render?.timestamps.values() ?? []) ms += took;
  return ms;
}
