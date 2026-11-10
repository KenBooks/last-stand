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

/** A timestamp id's node frame (`...:f<frame>`), or -1. */
const frameOf = (uid: string): number => Number(/:f(\d+)$/.exec(uid)?.[1] ?? -1);

/** The last frame's time by part (ms), from the timestamps three's last read resolved, or null if none. */
export function lastFrameParts(renderer: THREE.WebGLRenderer): Record<string, number> | null {
  const stamps = (renderer as unknown as Timed).backend.timestampQueryPool.render?.timestamps;
  if (!stamps?.size) return null;
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

/** what of three's WebGPU renderer resolves its timestamps: its frame, and its pool's queries not yet read */
interface Resolving {
  info: { frame: number };
  hasFeature(name: string): boolean;
  resolveTimestampsAsync(type: 'render' | 'compute'): Promise<number | undefined>;
  backend: { timestampQueryPool: { render: { timestamps: Map<string, number>; currentQueryIndex: number } | null } };
}

/** the reads a frame's passes are waited for through, at most, and the wait between them (ms) */
const MOST_READS = 20;
const READ_AGAIN_MS = 4;

/** The node frame three is on: a draw's frames are those after it, up to the one it's on after (`passesOf`). */
export const nodeFrameNow = (renderer: THREE.WebGLRenderer): number => (renderer as unknown as Resolving).info.frame;

/** Whether this renderer's passes are timed by the GPU's own timestamps (WebGPU's `timestamp-query`). */
export function timesPasses(renderer: THREE.WebGLRenderer): boolean {
  return (renderer as unknown as Resolving).hasFeature?.('timestamp-query') === true;
}

/**
 * The render passes of the node frames after `from` up to `to`, timed by the GPU's timestamps and summed (ms): the
 * profiler's frame on WebGPU (the overlay's reads held meanwhile, `holdWebGpuTimes`), which a wait for the queue's
 * work timed badly on a phone (its shadow maps' part read -38 ms, trace 4ADF-XJBB). Read again until three has read
 * every query: a read three skips (its result buffer still mapped) leaves its queries to the next, and each read
 * summed whole, the phone's frames read 1 to 4 frames' time in steps of about 12 ms (trace 430N-GTXH). Each pass is
 * counted once, by its id.
 */
export async function passesOf(renderer: THREE.WebGLRenderer, from: number, to: number): Promise<number> {
  const resolving = renderer as unknown as Resolving;
  const pool = resolving.backend.timestampQueryPool.render;
  const passes = new Map<string, number>();
  for (let read = 0; read < MOST_READS && pool; read++) {
    await resolving.resolveTimestampsAsync('render');
    for (const [uid, ms] of pool.timestamps) {
      const frame = frameOf(uid);
      if (frame > from && frame <= to) passes.set(uid, ms);
    }
    if (pool.currentQueryIndex === 0) break;
    await new Promise((resolve) => setTimeout(resolve, READ_AGAIN_MS));
  }
  let ms = 0;
  for (const took of passes.values()) ms += took;
  return ms;
}
