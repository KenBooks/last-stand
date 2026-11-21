// The engine's scene pipelines compiled aside, off the GPU process's main thread. The engine (wgpu) makes a pipeline
// by the browser's `createRenderPipeline`, which compiles it there and then: with it the page's own compositing
// waits, loading bar and all, and a pipeline first needed in a frame held that frame (from play: "first RMB cast in
// fight lags 2-3sec", "first 3 skill cast (maelstorm) also lags 3-4sec", "all loading bars should be 100% smooth").
// wgpu has no way to ask for the browser's `createRenderPipelineAsync`, which compiles on the GPU process's other
// threads, so the page asks in its place: the engine is handed a stand-in at once, the real pipeline is compiled
// aside, and a draw with a stand-in not yet ready is left out (the thing shows a few frames late; nothing waits).
// Only the engine's device, and only the pipelines of its scene (their labels): its post chain's and its maps' are
// made as it boots and drawn with at once.
import type * as THREE from 'three';

/** what the page asks of the engine ahead of a frame, set as the engine boots (`index.ts`): for the game's code
 *  that can't import the engine (core/shaders.ts' warm-ups, a cycle through the renderer) */
export const AHEAD = {
  /** `objects` and all under them handed to the engine with the pipelines they'll draw with, shown or not */
  prepare: null as ((objects: readonly THREE.Object3D[]) => void) | null,
};

/** the engine's scene pipelines: how many were asked for, and how many are still compiling */
export const PIPELINES = { made: 0, compiling: 0 };

/** the labels of the pipelines stood in for (Bulwark's gpu/pipelines.rs) */
const ASIDE = new Set(['scene', 'shadow', 'sprites']);

interface Descriptor { label?: string }
interface Device {
  createRenderPipeline(descriptor: Descriptor): object;
  createRenderPipelineAsync(descriptor: Descriptor): Promise<object>;
}
interface Pass {
  setPipeline(pipeline: object): void;
  draw(...counts: number[]): void;
  drawIndexed(...counts: number[]): void;
  /** the pipeline set last is still compiling: its draws are left out */
  waits?: boolean;
}

/** A pipeline being compiled aside: what the engine holds in its place. */
class StandIn {
  real: object | null = null;
  constructor(device: Device, descriptor: Descriptor, make: Device['createRenderPipeline']) {
    PIPELINES.made++;
    PIPELINES.compiling++;
    device.createRenderPipelineAsync(descriptor).then((real) => {
      this.real = real;
      PIPELINES.compiling--;
    }, () => {
      // (refused: made the plain way, so the engine hears what the GPU says of it)
      this.real = make.call(device, descriptor);
      PIPELINES.compiling--;
    });
  }
}

let patched = false;

/** A pass's draws left out while the pipeline set last is a stand-in not yet ready (every device's passes: a check
 *  a call, and three's pipelines are never stand-ins). */
function patchPasses(): void {
  if (patched) return;
  patched = true;
  const pass = (globalThis as unknown as { GPURenderPassEncoder?: { prototype: Pass } }).GPURenderPassEncoder?.prototype;
  if (!pass) return;
  const { setPipeline, draw, drawIndexed } = pass;
  pass.setPipeline = function (this: Pass, pipeline: object): void {
    if (pipeline instanceof StandIn) {
      this.waits = !pipeline.real;
      if (pipeline.real) setPipeline.call(this, pipeline.real);
      return;
    }
    this.waits = false;
    setPipeline.call(this, pipeline);
  };
  pass.draw = function (this: Pass, ...counts: number[]): void {
    if (!this.waits) draw.apply(this, counts);
  };
  pass.drawIndexed = function (this: Pass, ...counts: number[]): void {
    if (!this.waits) drawIndexed.apply(this, counts);
  };
}

/**
 * While `boot` runs (the engine made: it asks an adapter for its device), the device it's given is taken, and its
 * scene pipelines are compiled aside from then on.
 */
export async function pipelinesAside<T>(boot: () => Promise<T>): Promise<T> {
  type Adapter = { requestDevice(...given: unknown[]): Promise<Device> };
  const adapter = (globalThis as unknown as { GPUAdapter?: { prototype: Adapter } }).GPUAdapter?.prototype;
  if (!adapter) return boot();
  const request = adapter.requestDevice;
  adapter.requestDevice = async function (this: Adapter, ...given: unknown[]): Promise<Device> {
    const device = await request.apply(this, given);
    const make = device.createRenderPipeline;
    device.createRenderPipeline = (descriptor: Descriptor): object =>
      (ASIDE.has(descriptor.label ?? '') ? new StandIn(device, descriptor, make) : make.call(device, descriptor));
    return device;
  };
  try {
    patchPasses();
    return await boot();
  } finally {
    adapter.requestDevice = request;
  }
}

/** Resolves once no pipeline is compiling, or after `most` ms (a loading bar waits for what its place draws with). */
export function pipelinesReady(most: number): Promise<void> {
  const until = performance.now() + most;
  return new Promise((done) => {
    const look = (): void => {
      if (PIPELINES.compiling === 0 || performance.now() >= until) done();
      else setTimeout(look, 30);
    };
    look();
  });
}
