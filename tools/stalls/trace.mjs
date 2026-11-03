// A trace of the whole browser while the stalls are measured (tools/stalls): Skia's shader compiles and program links
// on the GPU process, every piece of work on every thread but the shortest, and the mark the page puts on its clock.
// Its events stream back as they come (a trace read back at the end was too large for Chrome's stream), and only
// those are kept, each work's slimmed to its name, thread and times: a 20 s trace with Skia's draws in it was 250 MB.
import { within } from './within.mjs';

/** what the trace records: each thread's tasks, the GPU process, Skia's shaders and the page's timeline marks */
const CATEGORIES = [
  'toplevel',
  'gpu',
  'viz',
  'disabled-by-default-skia.shaders',
  'disabled-by-default-devtools.timeline',
  'devtools.timeline',
];

/** with `--js`, V8's sampling profiler too, a sample every 0.1 ms (`profile.mjs`) */
const JS_CATEGORIES = ['disabled-by-default-v8.cpu_profiler', 'disabled-by-default-v8.cpu_profiler.hires'];
/** with `--angle`, ANGLE's own work on the GPU process: a shader compiled at a draw (`D3DCompile`), a program
 *  linked, read back from the cache or waited for */
const ANGLE_CATEGORIES = ['gpu.angle'];
/** with `--dawn`, Dawn's own work (WebGPU): its shaders translated by Tint and compiled, its pipelines made, its
 *  cache read */
const DAWN_CATEGORIES = ['gpu.dawn', 'disabled-by-default-gpu.dawn'];
/** with `--passes`, the compositor's draws as it made them: each render pass begun, each quad drawn and of what */
const PASSES_CATEGORY = 'disabled-by-default-viz.quads';
/** Chrome's trace buffer with `--passes` (kB): the draws are hundreds of events a frame, and a sweep's filled the
 *  200 MB it has by default, which then dropped the trace's start */
const PASSES_BUFFER_KB = 400_000;
/** the compositor's draws `--passes` counts, by their names in the trace: a frame drawn, a render pass begun in it
 *  (its root among them), a quad drawn (its `material`: a tile of a layer, a texture, a colour, a pass drawn into
 *  another). Each is kept as a draw of its own (`ph: 'D'`), out of the work the threads spent their time on. */
const DRAWS = {
  'DirectRenderer::DrawFrame': 'frame',
  'SkiaRenderer::BeginDrawingRenderPass': 'pass',
  'SkiaRenderer::DoDrawQuad': 'quad',
};

/** with `--paints`, each paint of the page's as the timeline names it: the element it painted (its `nodeId`, the
 *  DOM's backend node id), kept as a paint of its own (`ph: 'P'`) */
const PAINT = 'Paint';

/** the events kept whatever their length: Skia building a program, the page's mark, and the profiler's (each whole:
 *  its samples are its arguments) */
const KEPT_NAMES = new Set(['driver_link_program', 'driver_compile_shader', 'TimeStamp', 'Profile', 'ProfileChunk']);
/** a piece of work this long or longer is kept (µs): what each thread spent a frame's time on (`analyze.mjs`
 *  `workIn`), long tasks among them (one may hold a program's link, and anything 20 ms long stalls a frame) */
const WORK_US = 500;
/** how long Chrome is given to end a trace and send what's left of it (ms): a 16 s trace's end comes in a second
 *  or two, and once it never came (Chrome's tracing off, no `tracingComplete`: a run waited 14 minutes) */
const TRACE_END_MS = 60_000;

/** A trace Chrome never ended: its measure is lost, and the browser can be traced again. */
export class TraceLost extends Error {}

/** Whether `event` is one the measure reads. */
function kept(event) {
  if (event.ph === 'M') return event.name === 'process_name' || event.name === 'thread_name';
  if (KEPT_NAMES.has(event.name)) return true;
  return event.ph === 'X' && event.dur >= WORK_US;
}

/** `event` as it's kept: a piece of work by its name, thread and times alone (its arguments are most of its size). */
function slim(event) {
  if (event.ph !== 'X') return event;
  const { ph, name, pid, tid, ts, dur } = event;
  return { ph, name, pid, tid, ts, dur };
}

/** `event` as a draw of the compositor's (`DRAWS`), or null if it's none. */
function drawOf(event) {
  const kind = DRAWS[event.name];
  if (!kind || event.ph !== 'X') return null;
  return { ph: 'D', kind, material: event.args?.material ?? null, pid: event.pid, ts: event.ts };
}

/** `event` as a piece of Dawn's work (`--dawn`), however short (a read from its cache is microseconds), or null if
 *  it's none. Kept apart from the threads' work, inside which it runs. */
function dawnOf(event) {
  if (event.ph !== 'X' || !event.cat?.includes('gpu.dawn')) return null;
  return { ph: 'W', name: event.name, pid: event.pid, tid: event.tid, ts: event.ts, dur: event.dur };
}

/** `event` as a paint of the page's (`PAINT`), or null if it's none. */
function paintOf(event) {
  if (event.name !== PAINT || event.ph !== 'X') return null;
  return { ph: 'P', node: event.args?.data?.nodeId ?? null, pid: event.pid, ts: event.ts };
}

/**
 * Starts tracing `browser` (connected over CDP), with `js` the page's JS sampled too, with `passes` each of the
 * compositor's draws (`drawOf`) and with `paints` each of the page's paints (`paintOf`). Returns `stop`, which ends
 * the trace and gives its kept events, or throws `TraceLost` if Chrome never ends it.
 */
export async function startTrace(browser, options = {}) {
  const { js = false, angle = false, dawn = false, passes = false, paints = false } = options;
  const session = await browser.newBrowserCDPSession();
  const events = [];
  session.on('Tracing.dataCollected', ({ value }) => {
    for (const event of value) {
      if (kept(event)) events.push(slim(event));
      const draw = passes ? drawOf(event) : null;
      if (draw) events.push(draw);
      const paint = paints ? paintOf(event) : null;
      if (paint) events.push(paint);
      const work = dawn ? dawnOf(event) : null;
      if (work) events.push(work);
    }
  });
  const categories = [
    ...CATEGORIES,
    ...(js ? JS_CATEGORIES : []),
    ...(angle ? ANGLE_CATEGORIES : []),
    ...(dawn ? DAWN_CATEGORIES : []),
    ...(passes ? [PASSES_CATEGORY] : []),
  ];
  const traceConfig = { includedCategories: categories, recordMode: 'recordContinuously' };
  if (passes) traceConfig.traceBufferSizeInKb = PASSES_BUFFER_KB;
  await session.send('Tracing.start', { transferMode: 'ReportEvents', traceConfig });
  return {
    async stop() {
      const complete = new Promise((resolve) => session.once('Tracing.tracingComplete', resolve));
      const ended = await within(session.send('Tracing.end').then(() => complete), TRACE_END_MS);
      await session.detach().catch(() => {});
      if (!ended) throw new TraceLost(`Chrome never ended the trace (no tracingComplete in ${TRACE_END_MS} ms)`);
      return events;
    },
  };
}
