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
import { probeDepthOnly } from './depthProbe';
import { fault, watchDevice } from './said';

/** what the page asks of the engine ahead of a frame, set as the engine boots (`index.ts`): for the game's code
 *  that can't import the engine (core/shaders.ts' warm-ups, a cycle through the renderer) */
export const AHEAD = {
  /** `objects` and all under them handed to the engine with the pipelines they'll draw with, shown or not */
  prepare: null as ((objects: readonly THREE.Object3D[]) => void) | null,
  /** the first `lamps` lamps' shadows drawn of `casters`, which stand still (world/lampAtlas.ts asks, as it asks
   *  three for its atlas; `lampShadows.ts` draws them) */
  bakeLamps: null as ((casters: THREE.Mesh[], lamps: number) => void) | null,
  /** how many times the props have changed (world/destructible.ts `state.rev`, told here: the engine can't import
   *  the world's props, a cycle through the overlays): a place's own lights' shadows are drawn again then */
  propsRev: 0,
};

/** the engine's scene pipelines: how many were asked for, and how many are still compiling */
/** `depthRefused`: a pipeline of the depth drawn first was refused, so the frame is drawn without that pass */
export const PIPELINES = {
  made: 0,
  compiling: 0,
  refused: 0,
  depthRefused: false,
  /** what the boot waited on, for a slow boot's report (perf/upload.ts lays them among its steps): when (ms from
   *  the navigation) and what. A 48 s boot (BM6R-CTRB) said only which loading step was long. */
  notes: [] as [number, string][],
  /** the ms the loading screens may still wait for pipelines, all their waits together (`pipelinesReady`) */
  waitLeft: 12000,
  /** how many were first asked for once the loading screens were done with (`waitLeft` endless) */
  late: 0,
  /** how many times a pass set a pipeline still compiling since this was last set to 0: each a thing left out of
   *  a frame (`sceneReady` reads a frame's) */
  unready: 0,
  /** a harness's: pipelines asked for from now on stay unready until `releaseHeld` (`lab rustcheck`: a frame
   *  drawn with pipelines still compiling, as a busy GPU's process leaves one) */
  hold: false,
};

/** the pipelines compiled and held back (`PIPELINES.hold`): each made ready by its call */
const held: (() => void)[] = [];

/** A harness's: every pipeline held back made ready (`PIPELINES.hold`, which this ends). */
export function releaseHeld(): void {
  PIPELINES.hold = false;
  for (const ready of held.splice(0)) ready();
}

/** how many pipelines first asked for in play are said among the notes */
const LATE_NOTED = 40;

/** the engine's device, for asking how long the GPU's process takes to answer */
let asked: Device | null = null;

/** How long the GPU's process takes to answer the engine's device now (ms): past a frame or two, it's busy with
 *  something that holds every canvas's frames with it. -1 with no device. */
async function gpuAnswerMs(): Promise<number> {
  const queue = (asked as unknown as { queue?: { onSubmittedWorkDone?: () => Promise<void> } } | null)?.queue;
  if (!queue?.onSubmittedWorkDone) return -1;
  const began = performance.now();
  await queue.onSubmittedWorkDone();
  return performance.now() - began;
}

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
  createComputePipeline(descriptor: Descriptor): object;
  createRenderPipelineAsync(descriptor: Descriptor): Promise<object>;
}
interface Pass {
  setPipeline(pipeline: object): void;
  draw(...counts: number[]): void;
  drawIndexed(...counts: number[]): void;
  drawIndirect(buffer: object, offset: number): void;
  drawIndexedIndirect(buffer: object, offset: number): void;
  /** the pipeline set last is still compiling: its draws are left out */
  waits?: boolean;
}

/** What kind of scene pipeline a descriptor makes: a shadow's, the particles', the depth drawn first (no colour),
 *  the scene after it (its depth equal), or the scene drawn whole in one pass (`lab pipelines` counts them). */
function kindOf(descriptor: Descriptor): string {
  if (descriptor.label !== 'scene') return descriptor.label ?? 'unnamed';
  if (descriptor.fragment && !descriptor.fragment.targets?.length) return 'depth first';
  return descriptor.depthStencil?.depthCompare === 'equal' ? 'after the depth' : 'whole';
}

/** A scene pipeline stood in for: its kind, when it was asked for (the page's ms), and whether a pass has set it. */
export interface PipelineAsked { kind: string; at: number; drawn: boolean }
/** Every scene pipeline stood in for, as it was asked for: what the boot asked for that nothing draws, read by
 *  `lab pipelines`. */
export const PIPELINES_ASKED: PipelineAsked[] = [];

/** the pipelines still compiling */
const compiling = new Set<StandIn>();

/** The pipelines still compiling that a pass has set, by what they are with how many of each: what a frame is
 *  drawn without. */
function leftOut(): string {
  const counts = new Map<string, number>();
  for (const pipeline of compiling) {
    if (pipeline.asked.drawn) counts.set(pipeline.what, (counts.get(pipeline.what) ?? 0) + 1);
  }
  return [...counts].map(([what, count]) => (count > 1 ? `${count} ${what}` : what)).join(', ');
}

/** A pipeline being compiled aside: what the engine holds in its place. */
class StandIn {
  real: object | null = null;
  asked: PipelineAsked;
  /** what it is, for a report of what the lobby was shown without */
  readonly what: string;
  constructor(device: Device, descriptor: Descriptor) {
    this.asked = { kind: kindOf(descriptor), at: performance.now(), drawn: false };
    this.what = `${this.asked.kind} ${descriptor.vertex?.module?.label ?? ''}`.trim();
    compiling.add(this);
    PIPELINES_ASKED.push(this.asked);
    PIPELINES.made++;
    PIPELINES.compiling++;
    // (one first asked for once the loading screens are done with: it compiles as the player plays, the GPU's
    // process busy with it; said among the boot's notes with what it is, the first `LATE_NOTED` of them)
    if (PIPELINES.waitLeft === Infinity && PIPELINES.late < LATE_NOTED) {
      PIPELINES.notes.push([Math.round(performance.now()), `(a pipeline first asked for in play: ${described(descriptor)})`]);
    }
    if (PIPELINES.waitLeft === Infinity) PIPELINES.late++;
    device.createRenderPipelineAsync(descriptor).then((real) => {
      const ready = (): void => {
        this.real = real;
        compiling.delete(this);
        PIPELINES.compiling--;
      };
      if (PIPELINES.hold) held.push(ready);
      else ready();
    }, (refused: { reason?: string; message?: string }) => {
      compiling.delete(this);
      // (refused by this device: its draws stay left out, and the refusal is a fault with what the GPU said of
      // it. Made the plain way instead, it was an invalid pipeline, and a pass drawing with one made the whole
      // frame invalid: a phone's village all black)
      PIPELINES.compiling--;
      PIPELINES.refused++;
      // (a pipeline of the depth drawn first, which shades nothing: the pass after it draws only where that
      // depth is, so with it left out nothing opaque was drawn at all. A phone's Adreno refuses every one of
      // them, VK_ERROR_UNKNOWN, on some loads: the frame goes back to one pass, `bridge.ts`)
      if (descriptor.fragment && !descriptor.fragment.targets?.length) {
        PIPELINES.depthRefused = true;
        // (and the device asked which kind of such a pipeline it refuses, for the report: `depthProbe.ts`)
        void probeDepthOnly(device, descriptor);
      }
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
  const { setPipeline, draw, drawIndexed, drawIndirect, drawIndexedIndirect } = pass;
  pass.setPipeline = function (this: Pass, pipeline: object): void {
    if (pipeline instanceof StandIn) {
      pipeline.asked.drawn = true;
      this.waits = !pipeline.real;
      if (this.waits) PIPELINES.unready++;
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
  // (a counted draw placed ahead, the meadow's blades, is drawn by a buffer's counts: left to draw with no
  // pipeline set, the GPU refused the whole frame, every frame until its pipeline was ready)
  pass.drawIndirect = function (this: Pass, buffer: object, offset: number): void {
    if (!this.waits) drawIndirect.call(this, buffer, offset);
  };
  pass.drawIndexedIndirect = function (this: Pass, buffer: object, offset: number): void {
    if (!this.waits) drawIndexedIndirect.call(this, buffer, offset);
  };
}

/** `device`'s scene pipelines compiled aside from here on (the engine's device; a harness's second one). */
export function asideOn(device: object): void {
  const made = device as Device;
  asked ??= made;
  const make = made.createRenderPipeline;
  made.createRenderPipeline = (descriptor: Descriptor): object =>
    (ASIDE.has(descriptor.label ?? '') ? new StandIn(made, descriptor) : make.call(made, descriptor));
  // (a compute pipeline is compiled there and then, the GPU's process busy with it: one made in play is said,
  // as a scene pipeline first asked for then is)
  const compute = made.createComputePipeline;
  made.createComputePipeline = (descriptor: Descriptor): object => {
    if (PIPELINES.waitLeft === Infinity) {
      PIPELINES.notes.push([Math.round(performance.now()), `(a compute pipeline made in play: ${descriptor.label ?? 'unnamed'})`]);
      PIPELINES.late++;
    }
    return compute.call(made, descriptor);
  };
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

/** the shortest a wait is logged from (ms) */
const NOTED_FROM = 400;

/**
 * Resolves once no pipeline is compiling, or after `most` ms (a loading bar waits for what its place draws with),
 * or once the loading screens' waits together have used their budget (`PIPELINES.waitLeft`): each waited up to
 * 15 s, a boot's four 48 s in all on a desktop whose GPU's process was slow to compile, where the lobby shown with
 * a thing or two a few frames late is the lesser harm. A long wait is logged with what it waited for.
 */
export async function pipelinesReady(most: number): Promise<void> {
  const began = performance.now();
  const until = began + Math.min(most, PIPELINES.waitLeft);
  const { made, compiling: compilingThen } = PIPELINES;
  await new Promise<void>((done) => {
    const look = (): void => {
      if (PIPELINES.compiling === 0 || performance.now() >= until) done();
      else setTimeout(look, 30);
    };
    look();
  });
  const waited = performance.now() - began;
  PIPELINES.waitLeft = Math.max(0, PIPELINES.waitLeft - waited);
  if (waited < NOTED_FROM) return;
  const left = PIPELINES.compiling;
  const note: [number, string] = [Math.round(began), `(pipelines: ${made} made, ${compilingThen} compiling; waited `
    + `${Math.round(waited)} ms, ${left} left)`];
  PIPELINES.notes.push(note);
  // (and how busy the GPU's process is after it, said when it answers: never waited for)
  void gpuAnswerMs().then((ms) => { note[1] = note[1].replace(/\)$/, `; the GPU answered in ${Math.round(ms)} ms)`); });
}

/** the longest the lobby's own frame is waited for (ms), and how often it's drawn again meanwhile */
const SCENE_WAIT_MOST = 10000, SCENE_LOOK_MS = 50;

/**
 * Resolves once a frame drawn by `draw` sets no pipeline still compiling, or after `most` ms: the last thing a
 * loading screen waits for, with a budget of its own. The loading screens' waits share one (`PIPELINES.waitLeft`),
 * and a boot on a PC whose GPU's process was busy spent it on the fight's pipelines and the other heroes', which
 * the lobby doesn't draw: the lobby was shown with 9 still compiling, its ground among what was left out and the
 * sky's colour in its place (from play, "white ground on load", report 8YEZ-W9ZG). Only what the frame itself
 * draws with holds it here; what it was shown without is said among the boot's notes.
 */
export async function sceneReady(draw: () => void, most = SCENE_WAIT_MOST): Promise<void> {
  const began = performance.now();
  for (;;) {
    PIPELINES.unready = 0;
    draw();
    if (PIPELINES.unready === 0 || performance.now() - began >= most) break;
    await new Promise((done) => setTimeout(done, SCENE_LOOK_MS));
  }
  const waited = performance.now() - began;
  if (PIPELINES.unready > 0) {
    PIPELINES.notes.push([Math.round(began), `(the lobby shown without: ${leftOut()}; waited ${Math.round(waited)} ms)`]);
  } else if (waited >= NOTED_FROM) {
    PIPELINES.notes.push([Math.round(began), `(the lobby's own pipelines waited for ${Math.round(waited)} ms)`]);
  }
}
