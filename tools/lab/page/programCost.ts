// `lab programs --cost`: what each of the engine's scene pipelines takes to compile, alone. The engine's pipelines are
// compiled aside as they're asked for (`engine/pipelinesAside.ts`), many at once on the GPU's process's threads, so
// the time from a pipeline's ask to its readiness says how busy that was, not what it costs. Here each is compiled
// again on the engine's device, one after another, as it was asked for but with its shaders' code salted (a comment
// of its own: the browser's caches key a shader by its code, and answered a pipeline compiled before in under a
// millisecond), and timed from its shaders made to its pipeline ready. Its canary compiles the costliest again with
// the same salt, which the cache must answer in under `CACHE_MOST` of its first time: a measure whose salt didn't
// reach the code would read the cache throughout. (Under three this compiled three's WebGL programs again.)
import type { PipelineAsked } from '../../../src/engine/pipelinesAside';
import type { Report } from './lab';

/** A pipeline's cost: its census entry, and its compile alone (ms). */
export interface PipelineCost {
  pipeline: PipelineAsked;
  ms: number;
}

/** the most of its first time the same salt compiled again may take: the cache answering it */
const CACHE_MOST = 0.5;
/** the most listed in a list */
const LISTED = 12;

/** A shader stage of a pipeline's descriptor, as this reads it. */
interface Stage { module: object; entryPoint?: string }
/** A render pipeline's descriptor, as this reads it. */
interface Descriptor { label?: string; vertex: Stage; fragment?: Stage }
/** The engine's device, as this asks it. */
interface Device {
  createShaderModule(descriptor: { label?: string; code: string }): object;
  createRenderPipelineAsync(descriptor: Descriptor): Promise<object>;
}

/** Each shader module's code, kept by the lab's page script (`shaderCodes` in node/browser.mjs). */
function codeOf(module: object): string | undefined {
  const codes = (window as unknown as { __labShaderCodes?: WeakMap<object, string> }).__labShaderCodes;
  return codes?.get(module);
}

/** Whether each of a pipeline's shaders' code is kept: one made before the page script ran can't be salted. */
function salted(pipeline: PipelineAsked): boolean {
  const descriptor = pipeline.descriptor as Descriptor;
  const fragmentKept = !descriptor.fragment || Boolean(codeOf(descriptor.fragment.module));
  return Boolean(codeOf(descriptor.vertex.module)) && fragmentKept;
}

/** The browser's own clock (ms): the page's `performance.now` is the lab's, which stands still within a frame. */
const realNow = (): number => window.__labClock.realNow();

/** `descriptor`'s pipeline compiled on `device` with its shaders' code salted by `salt`: its time (ms), from its
 *  shaders made to it ready. */
async function compileAlone(device: Device, descriptor: Descriptor, salt: string): Promise<number> {
  const began = realNow();
  const made = new Map<object, object>();
  const stage = (given: Stage): Stage => {
    let module = made.get(given.module);
    if (!module) {
      module = device.createShaderModule({ code: `${codeOf(given.module)}\n// lab programs --cost: ${salt}\n` });
      made.set(given.module, module);
    }
    return { ...given, module };
  };
  const vertex = stage(descriptor.vertex);
  const fragment = descriptor.fragment ? stage(descriptor.fragment) : undefined;
  await device.createRenderPipelineAsync({ ...descriptor, vertex, fragment });
  return realNow() - began;
}

/** Each of `asked` whose shaders' code is kept compiled again alone, one after another, on `device`. */
export async function costs(device: object, asked: readonly PipelineAsked[]): Promise<PipelineCost[]> {
  const salt = `${Date.now()}`;
  const measured: PipelineCost[] = [];
  for (const [index, pipeline] of asked.entries()) {
    if (!salted(pipeline)) continue;
    const ms = await compileAlone(device as Device, pipeline.descriptor as Descriptor, `${salt}.${index}`);
    measured.push({ pipeline, ms });
  }
  return measured;
}

/** `measured` summed by `keyOf`, the most first, `LISTED` of them as `name count: s`. */
export function summedText(measured: PipelineCost[], keyOf: (pipeline: PipelineAsked) => string): string {
  const sums = new Map<string, { count: number; ms: number }>();
  for (const { pipeline, ms } of measured) {
    const sum = sums.get(keyOf(pipeline)) ?? { count: 0, ms: 0 };
    sum.count++;
    sum.ms += ms;
    sums.set(keyOf(pipeline), sum);
  }
  const sorted = [...sums].sort((a, b) => b[1].ms - a[1].ms);
  const shown = sorted.slice(0, LISTED).map(([name, sum]) => `${name} ${sum.count}: ${(sum.ms / 1000).toFixed(2)} s`);
  const left = sorted.length - shown.length;
  return `${shown.join('; ')}${left > 0 ? `; and ${left} more` : ''}`;
}

/** The `LISTED` costliest of `measured`, each a line. */
export function longestText(measured: PipelineCost[]): string[] {
  const sorted = [...measured].sort((a, b) => b.ms - a.ms).slice(0, LISTED);
  return sorted.map(({ pipeline, ms }) => `    ${ms.toFixed(0)} ms: a ${pipeline.kind} pipeline, ${pipeline.what}`);
}

/** The cache's canary: the costliest of `measured` compiled again with the salt it was last compiled with, which the
 *  cache must answer in under `CACHE_MOST` of that time. */
export async function cacheCanary(device: object, measured: PipelineCost[], salt: string): Promise<Report> {
  const costliest = [...measured].sort((a, b) => b.ms - a.ms)[0];
  if (!costliest) {
    const nothing = 'the cache\'s canary: nothing measured';
    return { text: nothing, problems: [nothing] };
  }
  const descriptor = costliest.pipeline.descriptor as Descriptor;
  const first = await compileAlone(device as Device, descriptor, salt);
  const again = await compileAlone(device as Device, descriptor, salt);
  const caught = again < CACHE_MOST * first;
  const text = `the cache's canary: the costliest compiled with a salt of its own ${first.toFixed(0)} ms, and again `
    + `with the same salt ${again.toFixed(0)} ms (${caught ? 'the cache answered' : 'missed'})`;
  const missed = 'the cache\'s canary: the same salt compiled again was not answered by the cache';
  return { text, problems: caught ? [] : [missed] };
}

/** How many of `asked` couldn't be salted (their shaders' code not kept), as a line, or none. */
export function unsaltedText(asked: readonly PipelineAsked[]): string[] {
  const left = asked.filter((pipeline) => !salted(pipeline)).length;
  return left ? [`  ${left} not compiled again: their shaders' code wasn't kept (made before the page script)`] : [];
}
