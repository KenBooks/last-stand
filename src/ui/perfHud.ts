// Optional performance overlay: FPS history graph, frame / CPU / GPU timings and
// renderer stats. Off by default; the pause menu shows it whole (Full) or as its frame rate and graph alone (Mini),
// kept in a cookie. Its timings run whether it's shown or not, for the always-on recorder (src/perf/recorder.ts),
// which they hand every frame to.
import { framesUncapped } from '../core/frameLoop';
import * as THREE from 'three';
import { WEBGPU } from '../core/webgpu';
import { RUNNING } from '../core/rendererChoice';
import { G } from '../state';
import { particles } from '../fx/particles';
import { readCookie, writeCookie } from '../core/cookies';
import { programsCompiledInGame, lateCompiles } from '../core/shaders';
import { qualitySetting, qualityLevel, qualityBudget } from '../core/quality';
import { atlasUse } from './overlay/atlas';
import { QUALITY } from '../data/quality';
import { gpuMarks, viewMode, sceneRatio, sceneSamples, sceneSize } from '../core/renderer';
import { recorder } from '../perf/recorder';

/** How much of the overlay shows: none of it, its frame rate and graph alone, or all of it. */
export type PerfHudSize = 'off' | 'mini' | 'full';
/** the cookie the size is kept in (before Mini it kept '1' for shown and '0' for hidden) */
export const PERF_HUD_COOKIE = 'last-stand-perf-hud';
/** The size the cookie keeps (none: off). */
export const keptPerfHudSize = (): PerfHudSize => {
  const kept = readCookie(PERF_HUD_COOKIE);
  return kept === '1' || kept === 'full' ? 'full' : kept === 'mini' ? 'mini' : 'off';
};
// the hashed bundle name identifies the build a report came from
const BUILD = import.meta.url.split('/').pop()?.replace(/\?.*$/, '') ?? 'unknown';
const WINDOW_MS = 15_000;     // history shown in the graph
const BUCKET_MS = 500;        // one graph point per bucket
const REDRAW_MS = 250;
const GRAPH_W = 160, GRAPH_H = 40;

const $ = (s: string): HTMLElement => document.querySelector<HTMLElement>(s)!;

/** The clock the overlay times the frame's work by (ms): the page's own, or a harness's in its place (tools/lab
 *  `perf`: the browser's, as the page's stands still within a frame there). The frames' own timestamps keep the
 *  window and the graph's time. */
export const perfClock = { now: (): number => performance.now() };

/** One frame: rAF time, interval since the previous one, our total / update / render time,
 *  how late our callback started after the rAF timestamp, the update split by stage, and what was on screen. */
interface Sample { t: number; frame: number; cpu: number; upd: number; rnd: number; late: number; stages: Stages; ctx: string }
type Stages = Record<string, number>;

let enabled = false;
let shownSize: PerfHudSize = 'off';
let el: HTMLElement;
let renderer: THREE.WebGLRenderer;
let gpuName = 'unknown';
const samples: Sample[] = [];   // one per frame inside WINDOW_MS
let lastFrame = 0, cpuStart = 0, lastDraw = 0;
/** this frame's place in the recorder's ring */
let ringAt = 0;
/** the latest frame's timestamp */
let frameNow = 0;
let frameCalls = 0, frameTris = 0;

// GPU time via EXT_disjoint_timer_query_webgl2 (Chrome/Edge/Firefox; not Safari). Only one query
// can run at a time, so every few frames one is timed in back-to-back parts (shadow map, scene,
// each post pass) for the split. The queries between parts slow the GPU a little, so the frame
// time itself comes from the frames timed whole.
let gl: WebGL2RenderingContext | null = null;
let timerExt: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null = null;
type Part = [label: string, q: WebGLQuery];
const SPLIT_EVERY = 4;
let frameParts: Part[] | null = null;   // the frame being timed
let frameNo = 0, splitting = false;
/** the frames whose GPU time is on its way, each with its place in the recorder's ring */
const pendingFrames: { parts: Part[]; split: boolean; ring: number }[] = [];
const gpuTimes: { t: number; ms: number }[] = [];
const gpuParts: Record<string, number>[] = [];   // the latest split frames
/** A frame's GPU time as it came back (ms), and its parts' if it was timed in parts. */
export interface GpuFrame { ms: number; parts: Record<string, number> | null }
/** the GPU's frames come back since a harness last took them (`takeGpuFrames`), the last `GPU_KEPT` */
const gpuTaken: GpuFrame[] = [];
const GPU_KEPT = 240;

// The browser's long animation frames (50 ms or more, Chrome's Long Animation Frames API): what the page's main
// thread did in them, which the frames' own times can't say. A frame that started late (`late`) had the thread busy
// with something else, or was held up outside the page (its GPU's process, the machine): the owner's lobby fell from
// 144 frames a second to 28 while hovering items, frames late by 20 to 46 ms, ours 11 to 18.
interface LongFrameScript { duration: number; invoker: string; sourceURL: string; sourceFunctionName: string }
interface LongFrame { startTime: number; duration: number; renderStart: number; styleAndLayoutStart: number; scripts: LongFrameScript[] }
const LONG_FRAMES = 'long-animation-frame';
const longFramesSeen = (): boolean => PerformanceObserver.supportedEntryTypes?.includes(LONG_FRAMES) ?? false;
/** each long frame in the window, by the timestamp of the frame it was seen in (the window's clock) */
const longFrames: { seen: number; frame: LongFrame }[] = [];
function watchLongFrames(): void {
  if (!longFramesSeen()) return;
  // (buffered: the boot's, from before this was set up, go to the recorder too)
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      recorder.longFrame(e as unknown as LongFrame);
      if (enabled) longFrames.push({ seen: frameNow, frame: e as unknown as LongFrame });
    }
  }).observe({ type: LONG_FRAMES, buffered: true });
}

export function initPerfHud(r: THREE.WebGLRenderer): void {
  renderer = r;
  el = $('#perf');
  // postprocessing issues several render calls per frame: count them all, reset per frame
  renderer.info.autoReset = false;
  if (WEBGPU) {
    timesGpu = (renderer as unknown as WebGpuTimes).hasFeature('timestamp-query');
    // (and its switches: a report's frames hang on them)
    const flags = [RUNNING.meshlets && 'meshlets', RUNNING.lightsEach && 'lights each'].filter(Boolean);
    gpuName = flags.length ? `WebGPU (${flags.join(', ')})` : 'WebGPU';
    el.onclick = copyReport;
    watchLongFrames();
    setPerfHudSize(keptPerfHudSize(), false);
    return;
  }
  gl = renderer.getContext() as WebGL2RenderingContext;
  timerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  gpuMarks.mark = gpuMark;
  // the shadow map renders inside the scene's render call
  const sm = renderer.shadowMap, smRender = sm.render.bind(sm);
  sm.render = (lights, scene, camera) => {
    // post passes render too (a full-screen quad): only the game scene has shadows
    const resume = frameParts?.[frameParts.length - 1]?.[0];
    if (scene !== G.scene || !resume) return smRender(lights, scene, camera);
    gpuMark('shadow'); smRender(lights, scene, camera); gpuMark(resume);
  };

  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  gpuName = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  el.onclick = copyReport;
  watchLongFrames();
  setPerfHudSize(keptPerfHudSize(), false);
}

export const perfHudEnabled = (): boolean => enabled;

export const perfHudSize = (): PerfHudSize => shownSize;

/** The overlay shown whole or put away (a harness's switch: the pause menu sets its size). */
export function setPerfHud(on: boolean, persist = true): void { setPerfHudSize(on ? 'full' : 'off', persist); }

/** The overlay at `to`. Between Mini and Full its window of frames is kept, so the graph goes on. */
export function setPerfHudSize(to: PerfHudSize, persist = true): void {
  const on = to !== 'off', was = enabled;
  shownSize = to;
  enabled = on;
  el.classList.toggle('hidden', !on);
  el.classList.toggle('mini', to === 'mini');
  if (persist) writeCookie(PERF_HUD_COOKIE, to);
  if (on && was) return;
  samples.length = 0; gpuTimes.length = 0; gpuParts.length = 0; longFrames.length = 0; lastFrame = 0;

  if (frameParts?.length && gl && timerExt) gl.endQuery(timerExt.TIME_ELAPSED_EXT);
  frameParts = null;
}

/** Call at the very start of a rAF callback. */
export function perfBeginFrame(now: number): void {
  renderer.info.reset();
  cpuStart = perfClock.now();
  frameNow = now;
  ringAt = recorder.begin(now);
  if (enabled) {
    if (lastFrame) samples.push({ t: now, frame: now - lastFrame, cpu: 0, upd: 0, rnd: 0, late: performance.now() - now, stages: {}, ctx: '' });
    lastFrame = now;
  }
  if (gl && timerExt) {
    pollQueries(now);
    if (pendingFrames.length < 3) { frameParts = []; splitting = ++frameNo % SPLIT_EVERY === 0; }
  }
}

/** From here on the GPU work of this frame counts towards `label`, until the next mark. */
function gpuMark(label: string): void {
  if (!frameParts || !gl || !timerExt) return;
  if (frameParts.length && !splitting) return;   // timed whole: the first mark's query runs to the end
  if (frameParts.length) gl.endQuery(timerExt.TIME_ELAPSED_EXT);
  const q = gl.createQuery();
  gl.beginQuery(timerExt.TIME_ELAPSED_EXT, q);
  frameParts.push([label, q]);
}

const split = { upd: 0, rnd: 0 };
/** Time spent in update() and render() this frame (ms), for the worst-frames breakdown. */
export function perfSplit(upd: number, rnd: number): void { split.upd = upd; split.rnd = rnd; }

let lapT = 0, stages: Stages = {};
/** Update-stage timer: call with no name to start, then with a stage name after each stage. */
export function perfLap(stage?: string): void {
  const now = perfClock.now();
  if (stage) {
    recorder.lap(stage, now - lapT);
    if (enabled) stages[stage] = (stages[stage] ?? 0) + now - lapT;
  }
  lapT = now;
}
// (WebGPU's `calls` counts its renders since the page started; the frame's draws are its `drawCalls`)
const frameDraws = (): number => (WEBGPU ? (renderer.info.render as unknown as { drawCalls: number }).drawCalls : renderer.info.render.calls);
const frameContext = (): string => `${G.mode}, ${G.enemies.length} foes, ${particles.glow.count + particles.smoke.count} particles, ${frameDraws()} draws`;

/** Call after the frame has been rendered. */
export function perfEndFrame(): void {
  const end = perfClock.now();
  frameCalls = frameDraws();
  frameTris = renderer.info.render.triangles;
  recorder.end(end - cpuStart, split.upd, split.rnd, frameCalls, frameTris, renderer.info.programs?.length ?? 0,
    G.enemies.length, particles.glow.count + particles.smoke.count);
  takeWebGpuTime();
  if (gl && timerExt && frameParts) {
    if (frameParts.length) { gl.endQuery(timerExt.TIME_ELAPSED_EXT); pendingFrames.push({ parts: frameParts, split: splitting, ring: ringAt }); }
    frameParts = null;
  }
  if (!enabled) return;
  const last = samples[samples.length - 1];
  if (last) { last.cpu = end - cpuStart; last.upd = split.upd; last.rnd = split.rnd; last.stages = stages; if (last.frame > 10) last.ctx = frameContext(); }
  stages = {};
  const cutoff = frameNow - WINDOW_MS;
  while (samples.length && samples[0].t < cutoff) samples.shift();
  while (gpuTimes.length && gpuTimes[0].t < cutoff) gpuTimes.shift();
  while (longFrames.length && longFrames[0].seen < cutoff) longFrames.shift();
  if (frameNow - lastDraw >= REDRAW_MS) { lastDraw = frameNow; draw(frameNow); }
}

/** What the overlay timed of the last frame (ms): its work, the update's and the render's, and each update stage's
 *  (none while it's off). */
export function lastPerfFrame(): Readonly<{ cpu: number; upd: number; rnd: number; stages: Readonly<Stages> }> | null {
  return samples[samples.length - 1] ?? null;
}

/** The GPU's frames come back since the last take, oldest first (for a harness: tools/lab `perf`). */
export const takeGpuFrames = (): GpuFrame[] => gpuTaken.splice(0);

/** what of three's WebGPU renderer times the GPU */
interface WebGpuTimes {
  hasFeature(name: string): boolean;
  resolveTimestampsAsync(type: 'render' | 'compute'): Promise<number | undefined>;
}
/** whether WebGPU's timestamp queries are there to read (WebGL's times come by `timerExt`) */
let timesGpu = false;
/** whether a read of them is under way: one at a time, each its latest frame's */
let readingGpuTime = false;
/** whether a harness reads them itself (`holdWebGpuTimes`) */
let webGpuTimesHeld = false;

/** WebGPU's timestamps left to a harness that reads them itself (tools/lab `passes`): three keeps one pool, and a
 *  read takes every query in it, so the overlay's read each frame took the harness's renders before it could. */
export function holdWebGpuTimes(held: boolean): void {
  webGpuTimesHeld = held;
}

/** The latest frame's GPU time on WebGPU (all its passes, and the GPU-driven drawing's culling), asked for if none is
 *  on its way. Not split into parts: three sums a frame's passes. */
function takeWebGpuTime(): void {
  if (!timesGpu || readingGpuTime || webGpuTimesHeld) return;
  readingGpuTime = true;
  const at = ringAt;
  const gpuTimer = renderer as unknown as WebGpuTimes;
  void Promise.all([gpuTimer.resolveTimestampsAsync('render'), gpuTimer.resolveTimestampsAsync('compute')])
    .then(([render, compute]) => {
      const ms = (render ?? 0) + (compute ?? 0);
      if (ms <= 0) return;
      recorder.gpu(at, ms, null);
      if (enabled) gpuTimes.push({ t: frameNow, ms });
      if (gpuTaken.push({ ms, parts: null }) > GPU_KEPT) gpuTaken.shift();
    })
    .finally(() => { readingGpuTime = false; });
}

/** The GPU's frames whose times have come back, kept by the frame's timestamp `now`. */
function pollQueries(now: number): void {
  if (!gl || !timerExt) return;
  while (pendingFrames.length) {
    const f = pendingFrames[0];
    if (!gl.getQueryParameter(f.parts[f.parts.length - 1][1], gl.QUERY_RESULT_AVAILABLE)) break;
    pendingFrames.shift();
    const disjoint = gl.getParameter(timerExt.GPU_DISJOINT_EXT) as boolean;
    const parts: Record<string, number> = {};
    let ms = 0;
    for (const [label, q] of f.parts) {
      const v = (gl.getQueryParameter(q, gl.QUERY_RESULT) as number) / 1e6;
      gl.deleteQuery(q);
      parts[label] = (parts[label] ?? 0) + v; ms += v;
    }
    if (disjoint) continue;
    // (a frame timed in parts is slowed by its queries: its parts go to the recorder, its time none)
    recorder.gpu(f.ring, f.split ? -1 : ms, f.split ? parts : null);
    if (gpuTaken.push({ ms, parts: f.split ? parts : null }) > GPU_KEPT) gpuTaken.shift();
    if (!enabled) continue;
    if (!f.split) gpuTimes.push({ t: now, ms });
    else if (gpuParts.push(parts) > 30) gpuParts.shift();
  }
}

/** Each part's share of the GPU frame, e.g. "scene 80% | bloom 11% | shadow 4%". */
function gpuSplit(): string {
  const sum: Record<string, number> = {};
  let all = 0;
  for (const g of gpuParts) for (const k in g) { sum[k] = (sum[k] ?? 0) + g[k]; all += g[k]; }
  return Object.entries(sum).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round((100 * v) / all)}%`).join(' | ');
}

// --- stats ------------------------------------------------------------------------
const percentile = (sorted: number[], q: number): number => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))] : NaN;
const mean = (a: number[]): number => a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN;
const fmt = (v: number, digits = 1): string => Number.isFinite(v) ? v.toFixed(digits) : '--';
/** Auto's budget of the scene's pixels, when it has one (its steps down on High). */
const budgetNote = (): string => Number.isFinite(qualityBudget()) ? `, at most ${(qualityBudget() / 1e6).toFixed(2)} Mpx` : '';
const fmtFps = (v: number): string => Number.isFinite(v) ? (v < 20 ? v.toFixed(1) : String(Math.round(v))) : '--';
const kilo = (n: number): string => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : String(n);

interface Stats {
  fps: number; avgFps: number; lowFps: number; p50: number; p95: number; cpu: number; gpu: number;
  buckets: (number | null)[];
}

function computeStats(now: number): Stats {
  const frames = samples.map((s) => s.frame).sort((a, b) => a - b);
  const recent = samples.filter((s) => s.t > now - 1000);
  const span = samples.length ? now - samples[0].t + samples[0].frame : 0;
  const n = WINDOW_MS / BUCKET_MS, t0 = now - WINDOW_MS, first = samples[0]?.t ?? now;
  // (the first frame counted began a frame before it ended: rated from its end, a bucket whose edge it ended just
  // before read one frame over a fraction of a millisecond, 2500 fps on a 144 Hz screen; `lab ui --states perfGraph`)
  const begun = first - (samples[0]?.frame ?? 0);
  const counts = new Array<number>(n).fill(0);
  for (const s of samples) counts[Math.min(n - 1, Math.max(0, Math.floor((s.t - t0) / BUCKET_MS)))]++;
  // the first partial bucket is rated by the time its frames took, once that's half a bucket: a few frames' rate
  // isn't the half second's (one short frame alone read 900 fps), and the scale follows the highest point
  const buckets = counts.map((c, i) => {
    const start = t0 + i * BUCKET_MS, end = start + BUCKET_MS;
    const covered = end - Math.max(start, begun);
    return end <= first || covered < BUCKET_MS / 2 ? null : c * 1000 / covered;
  });
  return {
    fps: recent.length * 1000 / Math.max(1, Math.min(1000, span)),
    avgFps: span > 0 ? samples.length * 1000 / span : NaN,
    lowFps: 1000 / percentile(frames, 0.99),
    p50: percentile(frames, 0.5),
    p95: percentile(frames, 0.95),
    cpu: mean(samples.slice(-60).map((s) => s.cpu)),
    gpu: mean(gpuTimes.slice(-60).map((g) => g.ms)),
    buckets,
  };
}

function graphPath(buckets: (number | null)[], top: number): string {
  const step = GRAPH_W / (buckets.length - 1);
  let d = '';
  buckets.forEach((v, i) => {
    if (v === null) return;
    const y = GRAPH_H - Math.min(1, v / top) * (GRAPH_H - 2) - 1;
    d += `${d ? 'L' : 'M'}${(i * step).toFixed(1)} ${y.toFixed(1)}`;
  });
  return d;
}

function draw(now: number): void {
  const s = computeStats(now);
  const info = renderer.info;
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const peak = Math.max(60, ...s.buckets.map((v) => v ?? 0));
  const top = Math.ceil(peak / 30) * 30;
  const set = (k: string, v: string) => { el.querySelector(`[data-p="${k}"]`)!.textContent = v; };
  set('fps', fmtFps(s.fps));
  set('ms', fmt(s.p50));
  set('p95', fmt(s.p95));
  set('avg', fmtFps(s.avgFps));
  set('low', fmtFps(s.lowFps));
  set('cpu', fmt(s.cpu, 2));
  set('gpu', timerExt || timesGpu ? fmt(s.gpu, 2) : 'n/a');
  set('top', String(top));
  set('mid', String(top / 2));
  set('calls', kilo(frameCalls));
  set('tris', kilo(frameTris));
  set('progs', `${info.programs?.length ?? 0} (+${programsCompiledInGame()})`);
  set('geo', String(info.memory.geometries));
  set('tex', String(info.memory.textures));
  // (the scene's resolution: the canvas's own, at the screen's ratio, holds the overlays drawn over it)
  const scene = sceneSize(new THREE.Vector2());
  set('res', `${scene.x}×${scene.y} @${sceneRatio().toFixed(2)}`);
  set('quality', `${QUALITY[qualityLevel()].label}${qualitySetting() === 'auto' ? ' (auto)' : ''}`);
  set('ents', `${G.enemies.length} / ${G.projectiles.length} / ${particles.glow.count + particles.smoke.count}`);
  set('gpuname', gpuName);
  el.querySelector('.pf-line')!.setAttribute('d', graphPath(s.buckets, top));
  // amber when the last seconds dropped well below the 15s average, red below 30
  el.classList.toggle('warn', s.fps < s.avgFps * 0.75);
  el.classList.toggle('bad', s.fps < 30);
}

// --- report -----------------------------------------------------------------------
/** Per update stage over the window: mean, p95 and max (ms), slowest first. */
function stageStats(): string[] {
  const all = new Map<string, number[]>();
  for (const s of samples) for (const k in s.stages) (all.get(k) ?? all.set(k, []).get(k)!).push(s.stages[k]);
  return [...all].map(([k, v]) => ({ k, mean: mean(v), sorted: v.sort((a, b) => a - b) }))
    .sort((a, b) => b.mean - a.mean)
    .map(({ k, mean, sorted }) => `  ${k.padEnd(12)} ${fmt(mean, 2).padStart(6)} ${fmt(percentile(sorted, 0.95), 2).padStart(6)} ${fmt(sorted[sorted.length - 1], 2).padStart(6)}`);
}

/** The slowest stages of one frame, e.g. "player 31.2, effects 4.0". */
const topStages = (s: Stages): string => Object.entries(s).sort((a, b) => b[1] - a[1]).slice(0, 3)
  .filter(([, v]) => v >= 0.5).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ');

/** `points`' mean in each bucket of the window, as the FPS history's ('-' where it has none). */
function bucketMeans(points: { t: number; v: number }[]): string {
  const n = WINDOW_MS / BUCKET_MS, t0 = frameNow - WINDOW_MS;
  const sums = new Array<number>(n).fill(0), counts = new Array<number>(n).fill(0);
  for (const { t, v } of points) {
    if (t < t0) continue;
    const i = Math.min(n - 1, Math.floor((t - t0) / BUCKET_MS));
    sums[i] += v; counts[i]++;
  }
  return sums.map((s, i) => counts[i] ? (s / counts[i]).toFixed(1) : '-').join(' ');
}

/** A long frame's line: how long, when, and what the main thread did in it: the tasks before its render (input,
 *  timers, messages), its animation frame callbacks (the game's frame among them), style and layout, its scripts in
 *  all and the longest by what ran it. */
function longFrameLine({ seen, frame: f }: { seen: number; frame: LongFrame }): string {
  const end = f.startTime + f.duration, render = f.renderStart || end, layout = f.styleAndLayoutStart || end;
  const scripts = f.scripts.reduce((sum, s) => sum + s.duration, 0);
  const longest = [...f.scripts].sort((a, b) => b.duration - a.duration)[0];
  const file = longest?.sourceURL.split('/').pop()?.split('?')[0];
  const named = longest && [longest.invoker, longest.sourceFunctionName, file].filter(Boolean).join(' ');
  return `  ${f.duration.toFixed(0)} ms at -${((frameNow - seen) / 1000).toFixed(1)}s: before its render ${(render - f.startTime).toFixed(0)}, `
    + `frame callbacks ${(layout - render).toFixed(0)}, style and layout ${(end - layout).toFixed(0)} | scripts ${scripts.toFixed(0)}`
    + (longest ? `, the longest ${longest.duration.toFixed(0)}: ${named}` : '');
}

/** The window's long frames, the worst first. */
function longFramesText(): string[] {
  if (!longFramesSeen()) return ['Long frames: not reported by this browser'];
  const worst = [...longFrames].sort((a, b) => b.frame.duration - a.frame.duration).slice(0, 6);
  return [`Long frames (50 ms+, the main thread's work in them, ms): ${longFrames.length} in the window`, ...worst.map(longFrameLine)];
}

/** A fixed CPU workload: how fast this machine runs our kind of JS right now (ms). */
function jsBench(): number {
  const a = new Float32Array(4096);
  const t = perfClock.now();
  for (let r = 0; r < 120; r++) for (let i = 0; i < a.length; i++) a[i] = a[i] * 0.98 + Math.sin(i * 0.01 + r);
  const ms = perfClock.now() - t;
  return a[7] > 1e9 ? -1 : ms;   // reads the result so the loop can't be optimised away
}

function report(): string {
  const s = computeStats(frameNow);
  const info = renderer.info;
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  return [
    `Last Stand performance report (${new Date().toISOString()}, build ${BUILD})`,
    `URL ${location.href}`,
    `FPS now ${fmtFps(s.fps)} | 15s avg ${fmtFps(s.avgFps)} | 1% low ${fmtFps(s.lowFps)}`,
    `Frame p50 ${fmt(s.p50)} ms | p95 ${fmt(s.p95)} ms | CPU ${fmt(s.cpu, 2)} ms | GPU ${timerExt || timesGpu ? fmt(s.gpu, 2) + ' ms' : 'n/a'}`,
    `Draw calls ${frameCalls} | triangles ${frameTris} | programs ${info.programs?.length ?? 0} (compiled after load ${programsCompiledInGame()}) | geometries ${info.memory.geometries} | textures ${info.memory.textures}`,
    `Canvas ${size.x}x${size.y} | pixel ratio ${renderer.getPixelRatio()} | scene ${sceneSize(new THREE.Vector2()).toArray().join('x')} at ${sceneRatio()} | devicePixelRatio ${window.devicePixelRatio} | window ${window.innerWidth}x${window.innerHeight}`,
    `Quality ${qualityLevel()} (setting ${qualitySetting()}${budgetNote()}) | MSAA ${sceneSamples()} | shadow map ${QUALITY[qualityLevel()].shadowMap} | label atlas ${Math.round(atlasUse() * 100)}% used | vsync ${framesUncapped() ? 'off' : 'on'}`,
    ...(gpuParts.length ? [`GPU split: ${gpuSplit()}`] : []),
    `Mode ${G.mode} | biome ${G.arena.biome} | view ${viewMode()} | enemies ${G.enemies.length} | projectiles ${G.projectiles.length} | particles ${particles.glow.count + particles.smoke.count}`,

    `GPU ${gpuName} | CPU cores ${navigator.hardwareConcurrency ?? '?'} | JS bench ${fmt(jsBench(), 2)} ms`,
    `UA ${navigator.userAgent}`,
    `FPS history (0.5s buckets) ${s.buckets.map((v) => v === null ? '-' : Math.round(v)).join(' ')}`,
    // (each bucket's frames: ours, how late ours started, the GPU's time for our draws; a fall with ours and the GPU's
    // steady and our frames late is held up outside our frame, which the long frames say whether the page's)
    `Ours history (ms a frame: update + render) ${bucketMeans(samples.map((f) => ({ t: f.t, v: f.cpu })))}`,
    `Late history (ms a frame started after its time) ${bucketMeans(samples.map((f) => ({ t: f.t, v: f.late })))}`,
    `GPU history (ms a frame, our draws) ${bucketMeans(gpuTimes.map((g) => ({ t: g.t, v: g.ms })))}`,
    'Worst frames (interval ms: ours = update + render, late = callback start delay):',
    ...[...samples].sort((a, b) => b.frame - a.frame).slice(0, 8).map((f) =>
      `  ${f.frame.toFixed(1)} ms at -${((frameNow - f.t) / 1000).toFixed(1)}s: ours ${f.cpu.toFixed(1)} = ${f.upd.toFixed(1)} + ${f.rnd.toFixed(1)}, late ${f.late.toFixed(1)} | ${f.ctx}${topStages(f.stages) ? ` | ${topStages(f.stages)}` : ''}`),
    `CPU p95 ${fmt(percentile(samples.map((f) => f.cpu).sort((a, b) => a - b), 0.95), 2)} ms max ${fmt(Math.max(...samples.map((f) => f.cpu)), 2)} | GPU p95 ${fmt(percentile(gpuTimes.map((g) => g.ms).sort((a, b) => a - b), 0.95), 2)} ms max ${fmt(Math.max(...gpuTimes.map((g) => g.ms)), 2)}`,
    ...longFramesText(),
    'Update stages (ms: mean p95 max):',
    ...stageStats(),
    ...(lateCompiles.length ? ['Shaders compiled after load:', ...lateCompiles.slice(-40).map((l) => '  ' + l)] : []),
  ].join('\n');
}

/** The GPU as the browser names it, and the fixed CPU workload's time now (ms), for a trace's device (src/perf). */
export const perfGpuName = (): string => gpuName;
export const perfJsBench = (): number => jsBench();
/** The build a report or trace came from (its bundle's hashed name). */
export const perfBundle = BUILD;

/** The report as the overlay copies it (for a harness: tools/lab `perf`). */
export const perfReport = (): string => report();

function copyReport(): void {
  const hint = el.querySelector('[data-p="copy"]')!;
  // (its words as the page has them, which say how to copy with the mouse and on touch: kept from the first copy, as a
  // second within 1.6 s would keep "Copied")
  const ask = hint.getAttribute('data-ask') ?? hint.innerHTML;
  hint.setAttribute('data-ask', ask);
  // (Mini hides the hint: it shows while it has something to say, `.said`)
  const say = (text: string) => { hint.textContent = text; el.classList.add('said'); };
  navigator.clipboard.writeText(report()).then(
    () => say('Copied to clipboard'),
    () => say('Copy failed'),
  ).finally(() => setTimeout(() => { hint.innerHTML = ask; el.classList.remove('said'); }, 1600));
}
