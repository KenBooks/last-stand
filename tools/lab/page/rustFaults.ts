// `lab rustcheck`'s faults: a failure planted in each layer the Rust engine's self-check listens on
// (`src/engine/said.ts`), each of which it must catch (from the owner: "check planting a failure in each layer of
// our app, and it should catch all of them"). The plants are real: a shader the GPU can't compile, a pipeline it
// refuses, a call it rejects and a device lost, on a second device watched as the engine's is (the engine's own
// stays whole for the checks after); a panic said as the engine says its own; the frame drawn black; and a report
// packed and read back as `lab trace` reads one. Before any plant, nothing may have been heard: that is the
// check that this device drew the game with no failure.
import { depthProbed, refusedProbed } from '../../../src/engine/depthProbe';
import { TUNE } from '../../../src/engine/globals';
import { asideOn, PIPELINES } from '../../../src/engine/pipelinesAside';
import { clearFaults, faultsSoFar, frameChecked, shaderCode, watchDevice } from '../../../src/engine/said';
import { recorder, type Slow } from '../../../src/perf/recorder';
import { decodeTrace } from '../../../src/perf/traceFormat';
import { traceReport } from '../../../src/perf/traceReport';
import { traceOf } from '../../../src/perf/upload';
import type { Lab } from './lab';

/** how long a plant is given to be heard, in the browser's frames */
const HEARD_WITHIN = 40;
/** how long the device is given to answer its probes, in the browser's frames */
const PROBED_WITHIN = 240;
/** the black frames in a row the self-check calls a fault */
const BLACK_CHECKS = 3;

interface PlantDevice {
  createShaderModule(descriptor: { label: string; code: string }): object;
  createRenderPipeline(descriptor: object): object;
  createSampler(descriptor: { lodMinClamp: number; lodMaxClamp: number }): object;
  queue: { onSubmittedWorkDone(): Promise<void> };
  destroy(): void;
}

/** A layer's plant, and what a fault heard of it holds. */
interface Layer {
  name: string;
  heard: string;
  plant: () => void | Promise<void>;
}

/** Waits until a fault holding `heard` is kept, or `HEARD_WITHIN` frames of the browser's have gone. */
async function heardFault(heard: string): Promise<boolean> {
  for (let frame = 0; frame < HEARD_WITHIN; frame++) {
    if (faultsSoFar().some((fault) => fault.includes(heard))) return true;
    await window.__labClock.realFrame();
  }
  return false;
}

/** A second device, watched and its scene pipelines compiled aside as the engine's are. */
async function watchedDevice(): Promise<PlantDevice | null> {
  const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<{ requestDevice(): Promise<object>; info?: object } | null> } }).gpu;
  const adapter = await gpu?.requestAdapter();
  if (!adapter) return null;
  const device = await adapter.requestDevice();
  watchDevice(device, adapter.info);
  asideOn(device);
  return device as PlantDevice;
}

/** The frame drawn black (no exposure) `BLACK_CHECKS` times, each checked as the engine checks its own. */
async function blackFrames(lab: Lab): Promise<void> {
  const exposure = TUNE.exposure;
  TUNE.exposure = 0;
  try {
    for (let check = 0; check < BLACK_CHECKS; check++) {
      await lab.step(1);
      frameChecked();
    }
  } finally {
    TUNE.exposure = exposure;
  }
}

/** A report of `lines` packed and read back as `lab trace` reads one: whether it holds each line. */
function reportHolds(lines: string[]): boolean {
  const slow: Slow = { scene: 'profile', verdict: null, tookMs: 0, at: performance.now(), snapshot: recorder.snapshot(), fault: lines };
  const read = traceReport(decodeTrace(traceOf(slow))).join('\n');
  return read.includes('Renderer faults:') && lines.every((line) => read.includes(line));
}

/**
 * The engine's self-check held to a plant in each of its layers. Returns a line saying what it caught and the
 * problems found: a fault heard before any plant, a plant unheard, a notice with no way to send it.
 */
export async function plantedFaults(lab: Lab): Promise<{ line: string; problems: string[] }> {
  const problems: string[] = [];
  const before = faultsSoFar();
  if (before.length) problems.push(`the engine's self-check heard ${before.length} faults: ${before.join(' || ').slice(0, 800)}`);
  // (a frame as it is isn't black: checked as often as a black one is, it must say nothing)
  for (let check = 0; check < BLACK_CHECKS; check++) {
    await lab.step(1);
    frameChecked();
  }
  if (faultsSoFar().length > before.length) problems.push('the frame as it is was called black');
  const device = await watchedDevice();
  if (!device) return { line: 'failed: no second device to plant faults on', problems: ['no second device to plant faults on'] };
  const broken = (): object => device.createShaderModule({ label: 'planted', code: 'this is not a shader' });
  const layers: Layer[] = [
    { name: 'a shader that doesn\'t compile', heard: 'the shader "planted" didn\'t compile', plant: () => { broken(); } },
    {
      name: 'a pipeline the GPU refuses',
      heard: 'the pipeline "scene" was refused',
      plant: () => { device.createRenderPipeline({ label: 'scene', layout: 'auto', vertex: { module: broken(), entryPoint: 'vs' } }); },
    },
    {
      // (what a phone's GPU did: the pipelines of the depth drawn first refused, the rest made)
      name: 'a pipeline of the depth drawn first refused',
      heard: 'fragment lit.fs_depth',
      plant: async () => {
        // (the engine's own lit shader, refused here for having none of its vertex buffers: the probes then write
        // its fs_depth again a part at a time, and each writing must still compile)
        const module = device.createShaderModule({ label: 'lit', code: shaderCode('lit') ?? 'the lit shader was not kept' });
        const fragment = { module, entryPoint: 'fs_depth', targets: [] };
        device.createRenderPipeline({ label: 'scene', layout: 'auto', vertex: { module, entryPoint: 'vs_main' }, fragment });
        // (the device is then asked which kinds it refuses: an idle device's answers wait to be sent on)
        for (let frame = 0; frame < PROBED_WITHIN && !depthProbed; frame++) {
          await device.queue.onSubmittedWorkDone();
          await window.__labClock.realFrame();
        }
        // (a few frames more, for each probe's shader to say what it compiled to)
        await heardFault('nothing is waited for by this name');
        uncompiled = faultsSoFar().filter((said) => said.includes('"depth probe" didn\'t compile'));
      },
    },
    {
      name: 'a call the GPU rejects',
      heard: 'the GPU (',
      plant: async () => {
        device.createSampler({ lodMinClamp: 2, lodMaxClamp: 1 });
        // (an idle device's calls wait in the page for something to send them on: the engine's own frames do)
        await device.queue.onSubmittedWorkDone();
      },
    },
    { name: 'a panic of the engine\'s', heard: 'said: panicked at a planted place', plant: () => console.error('panicked at a planted place') },
    { name: 'the frame drawn black', heard: 'the frame is black', plant: () => blackFrames(lab) },
    { name: 'the device lost', heard: 'the device was lost', plant: () => device.destroy() },
  ];
  const caught: string[] = [];
  let uncompiled: string[] = [];
  for (const layer of layers) {
    clearFaults();
    await layer.plant();
    if (await heardFault(layer.heard)) caught.push(layer.name);
    else problems.push(`planted and not caught: ${layer.name} (heard: ${faultsSoFar().join(' || ').slice(0, 300) || 'nothing'})`);
  }
  // (the notice the last plant put up, and its report read back)
  const notice = document.querySelector('#rust-fault');
  const buttons = [...(notice?.querySelectorAll('button') ?? [])].map((button) => button.textContent);
  if (!buttons.includes('Send report')) problems.push(`a fault's notice has no Send report (buttons: ${buttons.join(', ') || 'none'})`);
  if (!reportHolds(['the device: planted', '1. the pipeline "scene" was refused (validation): planted'])) {
    problems.push('a report of the faults, packed and read back, doesn\'t hold them');
  }
  // (the depth's refusal must have taken the frame back to one pass, and that frame must draw: not black)
  if (!PIPELINES.depthRefused) problems.push('a refused pipeline of the depth drawn first left the pass on');
  // (and the device must have been asked which kinds it refuses: here, a desktop's, none)
  const probes = depthProbed.split(' | ');
  if (probes.length < 7 || probes.some((probe) => !probe.endsWith(': made'))) {
    problems.push(`the depth-only pipelines tried after the refusal: ${depthProbed || 'none'}`);
  }
  // (and the refused pipeline itself tried again, its shader written a part at a time, each part compiling)
  const parts = refusedProbed.split(' | ');
  if (parts.length < 9 || /wasn't kept|no fs_depth|not tried/.test(refusedProbed)) {
    problems.push(`the refused pipeline tried again: ${refusedProbed || 'not at all'}`);
  }
  if (uncompiled.length) problems.push(`a probe's writing of fs_depth didn't compile: ${uncompiled.join(' || ').slice(0, 600)}`);
  clearFaults();
  for (let check = 0; check < BLACK_CHECKS; check++) {
    await lab.step(1);
    frameChecked();
  }
  if (faultsSoFar().length) problems.push(`drawn in one pass after the depth's refusal: ${faultsSoFar().join(' || ').slice(0, 300)}`);
  PIPELINES.depthRefused = false;
  clearFaults();
  const line = `the self-check heard no fault of this device's, and caught ${caught.length} of ${layers.length} planted: ${caught.join('; ')}`;
  return { line, problems };
}
