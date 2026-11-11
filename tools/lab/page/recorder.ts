// `lab recorder`: what the always-on performance recorder (src/perf/recorder.ts) costs a frame, and the trace it
// would send. A fight played as the player plays it (the biome's foes coming, the basic attack held, every frame drawn
// so the GPU's times come back), each of the recorder's calls timed by the browser's clock (the page's stands still
// within a frame), its frame's sum against a budget of 0.05 ms; then a snapshot packed and gzipped as a send packs it,
// read back and reported as `lab trace` reports it (the frames, the stages, the GPU's parts, the casts marked).
// Canary: each frame's recording made 0.2 ms slower, which must break the budget.
import type { Lab, Report } from './lab';
import { recorder, type Slow } from '../../../src/perf/recorder';
import { gzip, sendTrace, traceOf } from '../../../src/perf/upload';
import { decodeTrace, type ColumnInfo } from '../../../src/perf/traceFormat';
import { traceReport } from '../../../src/perf/traceReport';
import { foesAhead } from './cast';
import { quantile, timeCalls, type Timing } from './timing';
import { G } from '../../../src/state';
import { manualRecording } from './manualRecording';

export interface RecorderOptions {
  /** frames played and timed */
  frames: number;
  canary: boolean;
  /** the traces service the trace is sent to (the lab's own: node/tracesService.mjs) */
  send: string;
}

/** the recorder's work a frame may take (ms): 0.3% of a 60th of a second */
const BUDGET_MS = 0.05;
/** the canary's cost a frame (ms) */
const CANARY_MS = 0.2;
/** the recorder's calls the game makes each frame (or as its results come) */
const CALLS = ['begin', 'lap', 'end', 'gpu', 'longFrame'] as const;
/** the foes that come at the hero */
const FOES = 10;
/** the basic attack pressed for this many frames of every so many */
const ATTACK_EVERY = 50;
const ATTACK_HELD = 35;
/** the trace's report lines shown */
const REPORT_LINES = 14;

/** Busy for `ms` by the browser's clock. */
function busyFor(ms: number): void {
  const start = window.__labClock.realNow();
  while (window.__labClock.realNow() - start < ms) {
    // (busy)
  }
}

/** The recorder's `begin` made `ms` slower; the way back. */
function slowedBegin(ms: number): () => void {
  const begin = recorder.begin;
  recorder.begin = (now: number) => {
    busyFor(ms);
    return begin(now);
  };
  return () => {
    recorder.begin = begin;
  };
}

/** The fight played `frames` frames, the recorder's calls timed; each frame's sum of them (ms). */
async function timedFight(lab: Lab, frames: number): Promise<number[]> {
  const timings: Timing[] = CALLS.map((method) => timeCalls(recorder, method));
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    // (pressed and let go: a bow looses as it's let go)
    const perFrame = await lab.step(frames, (frame) => ({ m0: frame % ATTACK_EVERY < ATTACK_HELD }), () => {
      let sum = 0;
      for (const timing of timings) sum += timing.lap();
      return sum;
    });
    return perFrame;
  } finally {
    lab.drawing = drawing;
    for (const timing of timings) timing.stop();
  }
}

/** What a frame's recording cost, in a line, and whether it's within the budget. */
function costLine(label: string, perFrame: number[]): { line: string; mean: number } {
  const sorted = [...perFrame].sort((a, b) => a - b);
  const mean = perFrame.reduce((sum, ms) => sum + ms, 0) / Math.max(1, perFrame.length);
  const line = `  ${label}: ${mean.toFixed(4)} ms a frame on average, p90 ${quantile(sorted, 0.9).toFixed(2)}, `
    + `most ${sorted[sorted.length - 1]?.toFixed(2)} (budget ${BUDGET_MS} ms) over ${perFrame.length} frames`;
  return { line, mean };
}

/** the frames' counts, each packed as a count */
const COUNTS = ['draws', 'tris', 'programs', 'foes', 'particles'];

/** Each count column packed as anything but a count, or missing: an update stage named as a count took its column,
 *  kind and all, and the report read a time as the count (0.0999 particles, trace Z8GY-RHSN). The lab's clock times
 *  every stage at 0 ms, a whole number, so the values alone can't show it: the column's kind does. Problems. */
function countsKept(columns: ColumnInfo[]): string[] {
  const problems: string[] = [];
  for (const name of COUNTS) {
    const kind = columns.find((column) => column.name === name)?.kind;
    if (kind !== 'n16' && kind !== 'n32') problems.push(`the trace's ${name} column is packed as ${kind}, not a count`);
  }
  return problems;
}

/** A send's trace of now, packed, gzipped, read back: its lines, size and what it holds. `canary`: a count's
 *  column with a time planted in a copy of it, which must be found. */
async function traceNow(send: string, canary: boolean): Promise<{ lines: string[]; problems: string[] }> {
  // Before the captured play: it must survive even though the rolling history excludes it.
  recorder.longFrame({ startTime: 1, duration: 5000, renderStart: 5001, styleAndLayoutStart: 5001,
    scripts: [{ duration: 4900, invoker: 'lab', sourceURL: 'boot.js', sourceFunctionName: 'bootStallCanary' }] });
  const start = window.__labClock.realNow();
  const verdict = recorder.judged();
  // (taken as the detector finds a slow stretch, mid-fight: its own time said apart; the packing waits for a calm)
  const snapshot = recorder.snapshot();
  const snapshotMs = window.__labClock.realNow() - start;
  const slow: Slow = { scene: 'fight', verdict, tookMs: 0, at: performance.now(), snapshot };
  const packed = traceOf(slow);
  const gzipped = await gzip(packed);
  const took = window.__labClock.realNow() - start;
  const trace = decodeTrace(packed);
  const names = Object.keys(trace.columns);
  const stages = names.filter((name) => !name.startsWith('gpu') && !['interval', 'late', 'cpu', 'upd', 'rnd', 'draws',
    'tris', 'programs', 'foes', 'particles', 'state'].includes(name));
  const parts = names.filter((name) => name.startsWith('gpu '));
  const casts = trace.header.marks.filter(([, text]) => text.startsWith('cast')).length;
  const timedOnGpu = [...trace.columns.gpu].filter((ms) => ms >= 0).length;
  const lines = [
    `  the trace: ${trace.header.frames} frames, ${names.length} columns (${stages.length} stages, ${parts.length} GPU `
      + `parts), ${trace.header.marks.length} marks (${casts} casts), ${Math.round(packed.length / 1024)} KB packed, `
      + `${Math.round(gzipped.length / 1024)} KB gzipped, made in ${took.toFixed(1)} ms (its snapshot `
      + `${snapshotMs.toFixed(1)}); ${timedOnGpu} frames timed whole on the GPU (few or none here: the lab's frames `
      + `run back to back without a yield, and the queries come back only after one); the detector: ${verdict.slow ? `slow (${verdict.why})` : 'not slow'}`,
    '  as lab trace reports it:',
    ...traceReport(trace).slice(0, REPORT_LINES).map((line) => `    ${line}`),
  ];
  const problems: string[] = [];
  if (!String(trace.header.game.bootStalls).includes('bootStallCanary')) {
    problems.push('the trace lost its loading stall before the captured play history');
  }
  const sent = await sendTrace(gzipped, send);
  if ('code' in sent) lines.push(`  sent to the traces service: ${sent.code}`);
  else problems.push(`the trace couldn't be sent: ${sent.error}`);
  if (!stages.length) problems.push('the trace holds no update stage');
  if (!casts) problems.push('the trace marks no cast, though the hero attacked throughout');
  if (!(trace.header.frames > 0)) problems.push('the trace holds no frame');
  problems.push(...countsKept(trace.header.columns));
  if (!canary) return { lines, problems };
  // (the particles' column packed as a time, as a stage of that name made it)
  const planted = trace.header.columns.map((column) => (column.name === 'particles'
    ? { ...column, kind: 'lg' as const }
    : column));
  const caught = countsKept(planted).some((problem) => problem.includes('particles'));
  lines.push(`  canary, the particles' count packed as a time: ${caught ? 'caught' : 'went unseen'}`);
  if (!caught) problems.push('canary: the particles\' count packed as a time went unseen');
  return { lines, problems };
}

/** A slow boot's trace must hold at least this share of its wait after the reveal */
const TAIL_HELD = 0.95;
/** the mark a slow boot's reveal leaves (src/perf/recorder.ts `slowBootRevealed`) */
const TAIL_MARK = 'slow: boot, its trace waits';

/** How long the trace runs on after the last mark that starts with `text` (ms); -1 if it has none. */
function afterMark(trace: ReturnType<typeof decodeTrace>, text: string): number {
  const marked = trace.header.marks.findLast(([, said]) => said.startsWith(text));
  if (!marked) return -1;
  let span = 0;
  for (const ms of trace.columns.interval) span += ms;
  return span - marked[0];
}

/**
 * A slow boot's trace: its reveal stood in for (`slowBootRevealed`), the lobby played on through its wait, then the
 * trace taken read back. It must hold the play after the reveal, judged beside the boot's time: taken at the reveal,
 * a laptop's held one second, 17 frames, where its player saw 5 frames a second for a minute (trace JGNM-1NCF).
 * `tailMs` is the wait (the canary's 0: taken at once, as before).
 */
async function bootTail(lab: Lab, tailMs: number): Promise<{ lines: string[]; problems: string[]; held: number }> {
  const wanted = recorder.wanted;
  const kept = recorder.bootTailMs;
  recorder.wanted = () => true;
  recorder.bootTailMs = tailMs;
  recorder.release();
  try {
    recorder.slowBootRevealed(performance.now());
    const early = recorder.pending();
    await lab.until(() => recorder.pending() !== null, Math.ceil(tailMs / 16) + 120, 'a slow boot\'s trace taken');
    const slow = recorder.pending()!;
    const trace = decodeTrace(traceOf(slow));
    const held = afterMark(trace, TAIL_MARK);
    const why = traceReport(trace).find((line) => line.startsWith('Sent because')) ?? '(no reason line)';
    const lines = [
      `  a slow boot's trace, waiting ${(tailMs / 1000).toFixed(0)} s: ${trace.header.frames} frames, `
        + `${(held / 1000).toFixed(1)} s of them after the reveal`,
      `    ${why}`,
    ];
    const problems: string[] = [];
    if (early && tailMs > 0) problems.push('a slow boot\'s trace was taken at the reveal, not after its wait');
    if (slow.scene !== 'boot') problems.push(`a slow boot's trace was sent for the ${slow.scene}`);
    // Judge the required wait, not the injected one: a zero-wait canary must fail even when its mark survives.
    if (held < kept * TAIL_HELD) {
      problems.push(`a slow boot's trace holds ${(held / 1000).toFixed(1)} s after the reveal, under the required `
        + `${(kept * TAIL_HELD / 1000).toFixed(1)} s`);
    }
    if (!why.includes('the play after it')) problems.push('a slow boot\'s trace says nothing of the play after it');
    return { lines, problems, held };
  } finally {
    recorder.release();
    recorder.wanted = wanted;
    recorder.bootTailMs = kept;
  }
}

export async function recorderCost(lab: Lab, options: RecorderOptions): Promise<Report> {
  await lab.setup({});
  await foesAhead(lab, G.arena.biome, FOES);
  const fight = costLine('the recorder', await timedFight(lab, options.frames));
  const lines = ['the always-on performance recorder, the basic attack held into the foes, every frame drawn:', fight.line];
  const problems: string[] = [];
  if (fight.mean > BUDGET_MS) problems.push(`the recorder took ${fight.mean.toFixed(3)} ms a frame, over ${BUDGET_MS}`);
  const trace = await traceNow(options.send, options.canary);
  lines.push(...trace.lines);
  problems.push(...trace.problems);
  const tail = await bootTail(lab, recorder.bootTailMs);
  lines.push(...tail.lines);
  problems.push(...tail.problems);
  const manual = await manualRecording(lab, options.send, options.canary);
  lines.push(manual.text);
  problems.push(...manual.problems);
  if (!options.canary) return { text: lines.join('\n'), problems };
  const tailCanary = await bootTail(lab, 0);
  const tailCaught = tailCanary.problems.length > 0;
  lines.push(`  canary, a slow boot's trace taken at the reveal: ${tailCaught ? 'caught' : 'went unseen'}`);
  if (!tailCaught) problems.push('canary: a slow boot\'s trace taken at the reveal went unseen');
  const restore = slowedBegin(CANARY_MS);
  let planted: { line: string; mean: number };
  try {
    planted = costLine(`canary, ${CANARY_MS} ms more a frame`, await timedFight(lab, Math.min(120, options.frames)));
  } finally {
    restore();
  }
  const caught = planted.mean > BUDGET_MS;
  lines.push(planted.line, `  canary: ${caught ? 'the slower recording caught' : 'the slower recording went unseen'}`);
  return { text: lines.join('\n'), problems: caught ? problems : [...problems, 'canary: the slower recording went unseen'] };
}
