// A trace read as the perf overlay's report reads (src/ui/perfHud.ts), for an agent (`npm run lab -- trace`): why it
// was sent, the frame rate and timings over its play, the device and settings, the histories a second at a time, the
// worst stretches with what happened before each, the worst frames, the long frames, the update's stages, and the
// lab command that plays it again on the reported settings. Pure, with no imports but types, so Node runs it as is.
import type { Trace } from './traceFormat.ts';

/** a frame in any of these states isn't play (`STATE` in traceFormat.ts: paused, warming, hidden, menu, settling,
 *  readying) */
const NOT_PLAY = 4 | 8 | 16 | 32 | 64 | 128;
const STATE_NAMES: [number, string][] = [[1, 'run'], [2, 'fighting'], [4, 'paused'], [8, 'warming'], [16, 'hidden'],
  [32, 'menu'], [64, 'settling'], [128, 'readying']];
/** the stretches a history and the worst stretches are cut in (ms), how many worst ones, what's said before each (ms) */
const BUCKET_MS = 1000;
const WORST_STRETCHES = 5;
const BEFORE_MS = 5000;

const percentile = (sorted: number[], q: number): number =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))] : NaN;
const mean = (a: number[]): number => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const fmt = (v: number, digits = 1): string => (Number.isFinite(v) ? v.toFixed(digits) : '--');
const fps = (v: number): string => (Number.isFinite(v) ? (v < 20 ? v.toFixed(1) : String(Math.round(v))) : '--');
const known = (a: Float64Array | undefined): number[] => (a ? [...a].filter((v) => v >= 0) : []);
const sec = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;
const stateText = (bits: number): string => STATE_NAMES.filter(([bit]) => bits & bit).map(([, n]) => n).join('+') || 'lobby';

/** Each frame's time from the trace's first (ms): its intervals summed. */
function timesOf(interval: Float64Array): Float64Array {
  const t = new Float64Array(interval.length);
  for (let i = 1; i < t.length; i++) t[i] = t[i - 1] + Math.max(0, interval[i]);
  return t;
}

/** The frames' indices in each `BUCKET_MS` stretch. */
function buckets(t: Float64Array): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < t.length; i++) (out[Math.floor(t[i] / BUCKET_MS)] ??= []).push(i);
  return out.map((b) => b ?? []);
}

/** A column's mean over `frames` (known values alone). */
function meanOver(column: Float64Array | undefined, frames: number[]): number {
  if (!column) return NaN;
  return mean(frames.map((i) => column[i]).filter((v) => v >= 0));
}

/** The update's stages: the columns that aren't the fixed ones or the GPU's parts. */
const FIXED = new Set(['interval', 'late', 'cpu', 'upd', 'rnd', 'gpu', 'draws', 'tris', 'programs', 'foes', 'particles', 'state']);

/** Why the trace was sent, in a line: what took long, or what the detector saw (a number it never had, -1, left out). */
function whyText(r: Record<string, number | string>): string {
  if (r.why === 'boot') {
    const took = `the boot took ${sec(Number(r.tookMs))}`;
    // (a trace from before the boot's waited for the play after it has no verdict on it)
    return r.playMs === undefined ? took : `${took}; the play after it: ${playText(r)}`;
  }
  if (r.why === 'readying') return `a loading bar was up ${sec(Number(r.tookMs))}`;
  return `${r.why || 'not slow (taken by a harness)'}: ${playText(r)}`;
}

/** What the detector saw of the play, in a line. */
function playText(r: Record<string, number | string>): string {
  const rate = Number(r.lowFps) >= 0
    ? `1% low ${fps(Number(r.lowFps))} fps, mean ${fps(Number(r.meanFps))}, missed ${fmt(Number(r.missed) * 100, 0)}% of the display's frames, `
    : 'the frame rate not judged (too little play), ';
  return `${rate}${r.stalls} stalls (longest ${fmt(Number(r.longestMs), 0)} ms) over ${sec(Number(r.playMs))} of play`;
}

/** The lab command that plays the trace's moment again on its settings (a guess at its CPU: a phone's is 4x). */
export function replayCommand(trace: Trace): string {
  const { header } = trace;
  const skills = [...new Set(header.marks.map(([, text]) => /^(?:cast|channel) (\w+)/.exec(text)?.[1]).filter(Boolean))].slice(0, 3);
  const parts = ['npm run lab -- perf', skills.length ? skills.join(',') : '<skills>'];
  if (header.game.hero) parts.push(`--class ${header.game.hero}`);
  if (header.game.biome) parts.push(`--biome ${header.game.biome}`);
  const [w, h] = String(header.device.window ?? '').split('x').map(Number);
  if (w && h) parts.push(`--screen ${w}x${h}@${header.device.dpr ?? 1}`);
  if (header.settings.quality) parts.push(`--quality ${header.settings.quality}${Number(header.settings.budgetPx) > 0 ? `@${header.settings.budgetPx}` : ''}`);
  if (header.device.touch && Number(header.device.cores) <= 8) parts.push('--throttle 4');
  return parts.join(' ');
}

/** The trace as a report: its lines. `code`: the report's code, when it came from the server. */
export function traceReport(trace: Trace, code = ''): string[] {
  const { header: h, columns: c } = trace;
  const interval = c.interval, n = h.frames;
  const t = timesOf(interval);
  const span = n ? t[n - 1] : 0;
  const play = [...Array(n).keys()].filter((i) => !(c.state?.[i] & NOT_PLAY) && interval[i] > 0);
  const playIntervals = play.map((i) => interval[i]).sort((a, b) => a - b);
  const playMs = playIntervals.reduce((s, v) => s + v, 0);
  const gpu = known(c.gpu);
  const r = h.reason;
  const lines: string[] = [];
  const build = `build ${h.build.commit}${h.build.pr ? ` (PR #${h.build.pr})` : ''}, ${h.build.bundle}`;
  lines.push(`Last Stand performance trace${code ? ` ${code}` : ''} (${h.at}, ${build})`);
  lines.push(`Page ${h.page} | ${n} frames over ${sec(span)}, ${sec(playMs)} of it play | display ${r.refreshHz ?? '?'} Hz`);
  lines.push(`Sent because: ${r.scene}, ${whyText(r)}`);
  lines.push(`Boot: shown at ${sec(Number(r.bootMs))} (waiting on its files ${sec(Number(r.bootDownloadMs))}${r.firstVisit ? ', no worker: its files from the network' : ''})${h.game.bootSteps ? ` | ${h.game.bootSteps}` : ''}`);
  lines.push(`FPS over play: mean ${fps((play.length * 1000) / playMs)} | 1% low ${fps(1000 / percentile(playIntervals, 0.99))}`);
  lines.push(`Frame p50 ${fmt(percentile(playIntervals, 0.5))} ms | p95 ${fmt(percentile(playIntervals, 0.95))} ms | CPU ${fmt(meanOver(c.cpu, play), 2)} ms | GPU ${gpu.length ? fmt(meanOver(c.gpu, play), 2) + ' ms' : 'n/a'}`);
  const last = n - 1;
  lines.push(`Draw calls ${c.draws?.[last] ?? '--'} (max ${Math.max(...known(c.draws))}) | triangles ${c.tris?.[last] ?? '--'} | programs ${c.programs?.[last] ?? '--'} (compiled after load ${h.game.compiledLate ?? 0})`);
  const s = h.settings;
  lines.push(`Quality ${s.quality} (setting ${s.setting}${Number(s.budgetPx) > 0 ? `, at most ${(Number(s.budgetPx) / 1e6).toFixed(2)} Mpx` : ''}) | MSAA ${s.msaa} | shadow map ${s.shadowMap} | scene ${s.scene} at ${s.sceneRatio} | pixel ratio ${s.pixelRatio} | view ${s.view} | renderer ${s.renderer}${s.hdr ? ' HDR' : ''}${s.vsync === 'off' ? ' | vsync off' : ''}`);
  const parts = Object.keys(c).filter((k) => k.startsWith('gpu '));
  if (parts.length) {
    const sums = parts.map((k) => [k.slice(4), known(c[k]).reduce((a, v) => a + v, 0)] as const);
    const all = sums.reduce((a, [, v]) => a + v, 0);
    if (all > 0) lines.push(`GPU split: ${sums.sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round((100 * v) / all)}%`).join(' | ')}`);
  }
  const g = h.game, d = h.device;
  lines.push(`Mode ${g.mode} | biome ${g.biome} | hero ${g.hero} | ${g.coop ? 'co-op' : 'solo'} | wave ${g.wave} | enemies ${g.foes}`);
  lines.push(`GPU ${d.gpu} | CPU cores ${d.cores} | memory ${d.memoryGb || '?'} GB | JS bench ${d.jsBenchMs} ms | screen ${d.screen} | window ${d.window} @${d.dpr}${d.touch ? ' | touch' : ''}${d.installed ? ' | installed' : ''}`);
  lines.push(`UA ${d.ua}`);

  const cut = buckets(t);
  const history = (f: (frames: number[]) => number, digits = 1): string =>
    cut.map((frames) => (frames.length ? fmt(f(frames), digits) : '-')).join(' ');
  lines.push(`FPS history (1 s) ${history((frames) => frames.length, 0)}`);
  lines.push(`Ours history (ms a frame: update + render) ${history((frames) => meanOver(c.cpu, frames))}`);
  lines.push(`Late history (ms a frame started after its time) ${history((frames) => meanOver(c.late, frames))}`);
  lines.push(`GPU history (ms a frame, our draws) ${history((frames) => meanOver(c.gpu, frames))}`);
  lines.push(`State history ${cut.map((frames) => (frames.length ? stateText(c.state?.[frames[0]] ?? 0) : '-')).join(' ')}`);

  lines.push(`Worst stretches (1 s, the fewest frames; what happened in the ${BEFORE_MS / 1000} s before each):`);
  const whole = cut.map((frames, k) => ({ k, frames })).filter(({ frames, k }) => frames.length && (k + 1) * BUCKET_MS <= span);
  for (const { k, frames } of whole.sort((a, b) => a.frames.length - b.frames.length).slice(0, WORST_STRETCHES)) {
    const from = k * BUCKET_MS, to = from + BUCKET_MS;
    const before = h.marks.filter(([at]) => at >= from - BEFORE_MS && at < to).map(([at, text]) => `${sec(at)} ${text}`);
    const longs = h.longFrames.filter(([at]) => at >= from && at < to).length;
    const i = frames[frames.length - 1];
    lines.push(`  ${sec(from)}-${sec(to)}: ${frames.length} frames, ours ${fmt(meanOver(c.cpu, frames))} ms, late ${fmt(meanOver(c.late, frames))}, GPU ${fmt(meanOver(c.gpu, frames))}, longest ${fmt(Math.max(...frames.map((f) => interval[f])), 0)} | ${stateText(c.state?.[i] ?? 0)}, ${c.foes?.[i]} foes, ${c.particles?.[i]} particles, ${c.draws?.[i]} draws${longs ? `, ${longs} long frames` : ''}`);
    lines.push(`    before: ${before.length ? before.slice(-6).join('; ') : 'nothing marked'}`);
  }

  const stages = Object.keys(c).filter((k) => !FIXED.has(k) && !k.startsWith('gpu '));
  const topStages = (i: number): string => stages.map((k) => [k, c[k][i]] as const).filter(([, v]) => v >= 0.5)
    .sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ');
  lines.push('Worst frames (interval ms: ours = update + render, late = callback start delay):');
  for (const i of [...Array(n).keys()].sort((a, b) => interval[b] - interval[a]).slice(0, 8)) {
    const top = topStages(i);
    lines.push(`  ${fmt(interval[i])} ms at ${sec(t[i])}: ours ${fmt(c.cpu?.[i])} = ${fmt(c.upd?.[i])} + ${fmt(c.rnd?.[i])}, late ${fmt(c.late?.[i])}, GPU ${c.gpu?.[i] >= 0 ? fmt(c.gpu[i]) : '--'} | ${stateText(c.state?.[i] ?? 0)}, ${c.foes?.[i]} foes, ${c.draws?.[i]} draws${top ? ` | ${top}` : ''}`);
  }
  lines.push(`Long frames (50 ms+, the main thread's work in them, ms): ${h.longFrames.length} in the trace`);
  for (const [at, dur, before, callbacks, layout, scripts, longest, by] of [...h.longFrames].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    lines.push(`  ${dur} ms at ${sec(at)}: before its render ${before}, frame callbacks ${callbacks}, style and layout ${layout} | scripts ${scripts}${longest ? `, the longest ${longest}: ${by}` : ''}`);
  }
  lines.push('Update stages (ms: mean p95 max):');
  for (const k of stages.map((k) => ({ k, v: known(c[k]).sort((a, b) => a - b) })).sort((a, b) => mean(b.v) - mean(a.v))) {
    lines.push(`  ${k.k.padEnd(12)} ${fmt(mean(k.v), 2).padStart(6)} ${fmt(percentile(k.v, 0.95), 2).padStart(6)} ${fmt(k.v[k.v.length - 1], 2).padStart(6)}`);
  }
  if (g.lateCompiles) lines.push('Shaders compiled after load:', ...String(g.lateCompiles).split(' || ').map((l) => '  ' + l));
  lines.push(`Marks (${h.marks.length}): ${h.marks.slice(-40).map(([at, text]) => `${sec(at)} ${text}`).join('; ')}`);
  lines.push(`Play it again in the lab: ${replayCommand(trace)}`);
  return lines;
}
