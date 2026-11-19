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

/** three's pool of render timestamps, as this reads it: its queries not yet read, and the last read's by id */
interface Pool {
  timestamps: Map<string, number>;
  currentQueryIndex: number;
  resolveQueriesAsync(): Promise<number | undefined>;
}

/** what of three's WebGPU renderer this reads: its node frame, its features and its pool */
interface Resolving {
  info: { frame: number };
  hasFeature(name: string): boolean;
  backend: { timestampQueryPool: { render: Pool | null } };
}

/** the wait before reading again where three skipped a read (its result buffer still mapped), ms */
const READ_AGAIN_MS = 4;

/** The node frame three is on: a draw's frames are those after it, up to the one it's on after. */
export const nodeFrameNow = (renderer: THREE.WebGLRenderer): number => (renderer as unknown as Resolving).info.frame;

/** Whether this renderer's passes are timed by the GPU's own timestamps (WebGPU's `timestamp-query`). */
export function timesPasses(renderer: THREE.WebGLRenderer): boolean {
  return (renderer as unknown as Resolving).hasFeature?.('timestamp-query') === true;
}

/** A draw's node frames waiting for their passes' times: those after `from`, up to `to`. */
interface Waiting {
  from: number;
  to: number;
  resolve: (ms: number) => void;
}

/**
 * The profiler's frames on WebGPU timed by the GPU's own timestamps, read beside the draws (the overlay's reads held
 * meanwhile, `holdWebGpuTimes`): each draw's node frames, their passes summed once three has read them. Nothing waits
 * for the GPU between draws, so it runs at the game's own pace: a frame drawn alone and waited out read the phone's
 * 12 ms frame at 37 (trace 58GW-MY55), its GPU idle between frames and clocked down, and a wait for the queue's work
 * timed by the page's clock read it at 74 with a shadow part of -38 (4ADF-XJBB). A read three skips (its result
 * buffer still mapped) leaves its queries to the next: summed read by read, the phone's frames came to 1 to 4 frames'
 * time (430N-GTXH), so each pass is counted once by its id, and a draw is done once a read taken after it is back.
 */
export class PassReader {
  private readonly pool: Pool;
  /** each node frame's passes read so far, by id */
  private readonly passes = new Map<number, Map<string, number>>();
  private waiting: Waiting[] = [];
  private reading = false;

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.pool = (renderer as unknown as Resolving).backend.timestampQueryPool.render!;
  }

  /** The node frame three is on now: what a draw starts after. */
  now(): number {
    return nodeFrameNow(this.renderer);
  }

  /** The time of the node frames after `from` up to now (ms), once three has read their passes. */
  drawn(from: number): Promise<number> {
    const to = this.now();
    return new Promise((resolve) => {
      this.waiting.push({ from, to, resolve });
      void this.read();
    });
  }

  /** Every pass not yet read let go of, and every draw waiting told what it has. */
  async drain(): Promise<void> {
    while (this.reading) await new Promise((resolve) => setTimeout(resolve, READ_AGAIN_MS));
    await this.read();
  }

  /** Reads until every draw waiting has its time, one read at a time. */
  private async read(): Promise<void> {
    if (this.reading) return;
    this.reading = true;
    try {
      while (this.waiting.length || this.pool.currentQueryIndex > 0) {
        const served = this.waiting.length;
        const queued = this.pool.currentQueryIndex;
        const reading = this.pool.resolveQueriesAsync();
        // (three takes the queries as the read starts, or leaves them all where it skips it)
        const taken = queued > 0 && this.pool.currentQueryIndex === 0;
        await reading;
        if (!taken) {
          if (queued === 0) break;
          await new Promise((resolve) => setTimeout(resolve, READ_AGAIN_MS));
          continue;
        }
        this.keep(this.pool.timestamps);
        for (const done of this.waiting.splice(0, served)) done.resolve(this.sum(done.from, done.to));
      }
      for (const done of this.waiting.splice(0)) done.resolve(this.sum(done.from, done.to));
    } finally {
      this.reading = false;
    }
  }

  /** A read's passes kept by their node frame. */
  private keep(read: Map<string, number>): void {
    for (const [uid, ms] of read) {
      const frame = frameOf(uid);
      let passes = this.passes.get(frame);
      if (!passes) this.passes.set(frame, (passes = new Map()));
      passes.set(uid, ms);
    }
  }

  /** The node frames after `from` up to `to`, their passes summed (ms), and let go of. */
  private sum(from: number, to: number): number {
    let ms = 0;
    for (let frame = from + 1; frame <= to; frame++) {
      for (const took of this.passes.get(frame)?.values() ?? []) ms += took;
      this.passes.delete(frame);
    }
    return ms;
  }
}
