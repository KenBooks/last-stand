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
import { fault, watchDevice } from './said';

/** what the page asks of the engine ahead of a frame, set as the engine boots (`index.ts`): for the game's code
 *  that can't import the engine (core/shaders.ts' warm-ups, a cycle through the renderer) */
export const AHEAD = {
  /** `objects` and all under them handed to the engine with the pipelines they'll draw with, shown or not */
  prepare: null as ((objects: readonly THREE.Object3D[]) => void) | null,
  /** the first `lamps` lamps' shadows drawn of `casters`, which stand still (world/lampAtlas.ts asks, as it asks
   *  three for its atlas; `lampShadows.ts` draws them) */
  bakeLamps: null as ((casters: THREE.Mesh[], lamps: number) => void) | null,
};

/** the engine's scene pipelines: how many were asked for, and how many are still compiling */
export const PIPELINES = { made: 0, compiling: 0, refused: 0 };

/** the labels of the pipelines stood in for (Bulwark's gpu/pipelines.rs) */
const ASIDE = new Set(['scene', 'shadow', 'sprites']);

interface Stage { entryPoint?: string; module?: { label?: string }; targets?: ({ format?: string } | null)[] }
interface Descriptor {
  label?: string;
  vertex?: Stage;
  fragment?: Stage;
  depthStencil?: { format?: string; depthCompare?: string };
  multisample?: { count?: number };
  primitive?: { cullMode?: string };
}

/** What a pipeline is, for a report of its refusal: its shaders' entries, its targets, its depth, its samples. */
function described(descriptor: Descriptor): string {
  const targets = descriptor.fragment?.targets?.map((target) => target?.format ?? 'none').join(',') ?? 'none';
  return `vertex ${descriptor.vertex?.module?.label ?? ''}.${descriptor.vertex?.entryPoint ?? '?'}, `
    + `fragment ${descriptor.fragment?.module?.label ?? ''}.${descriptor.fragment?.entryPoint ?? 'none'}, `
    + `onto ${targets}, depth ${descriptor.depthStencil?.format ?? 'none'} ${descriptor.depthStencil?.depthCompare ?? ''}, `
    + `${descriptor.multisample?.count ?? 1} samples, cull ${descriptor.primitive?.cullMode ?? 'none'}`;
}
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
  constructor(device: Device, descriptor: Descriptor) {
    PIPELINES.made++;
    PIPELINES.compiling++;
    device.createRenderPipelineAsync(descriptor).then((real) => {
      this.real = real;
      PIPELINES.compiling--;
    }, (refused: { reason?: string; message?: string }) => {
      // (refused by this device: its draws stay left out, and the refusal is a fault with what the GPU said of
      // it. Made the plain way instead, it was an invalid pipeline, and a pass drawing with one made the whole
      // frame invalid: a phone's village all black)
      PIPELINES.compiling--;
      PIPELINES.refused++;
      fault(`the pipeline "${descriptor.label ?? ''}" was refused (${refused?.reason ?? 'no reason'})`,
        `${refused?.message || 'the GPU said nothing'} | ${described(descriptor)}`);
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

/** `device`'s scene pipelines compiled aside from here on (the engine's device; a harness's second one). */
export function asideOn(device: object): void {
  const made = device as Device;
  const make = made.createRenderPipeline;
  made.createRenderPipeline = (descriptor: Descriptor): object =>
    (ASIDE.has(descriptor.label ?? '') ? new StandIn(made, descriptor) : make.call(made, descriptor));
}

/**
 * While `boot` runs (the engine made: it asks an adapter for its device), the device it's given is taken, and its
 * scene pipelines are compiled aside from then on.
 */
export async function pipelinesAside<T>(boot: () => Promise<T>): Promise<T> {
  type Adapter = { requestDevice(...given: unknown[]): Promise<Device>; info?: object };
  const adapter = (globalThis as unknown as { GPUAdapter?: { prototype: Adapter } }).GPUAdapter?.prototype;
  if (!adapter) return boot();
  const request = adapter.requestDevice;
  adapter.requestDevice = async function (this: Adapter, ...given: unknown[]): Promise<Device> {
    const device = await request.apply(this, given);
    watchDevice(device, this.info);
    asideOn(device);
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
