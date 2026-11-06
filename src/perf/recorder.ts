// The performance recorder (src/perf/AGENTS.md): always on, from the boot to the page's end, in every scene. Each
// frame's times and counts go into a ring of columns of numbers (about the last minute), the boot's steps, long
// animation frames and what happened (marks) beside them; once a second `detect.ts` judges the last stretch, and a
// slow one is kept as a snapshot for the player to be asked about (`consent.ts`). Its calls go through `recorder` so
// the lab can time them (`lab recorder`: their cost a frame).
import { G } from '../state';
import { isReadying, isWarming } from '../game/warm';
import { hallOpen } from '../game/hall';
import { judge, refreshOf, slowBoot, slowReadying, type Verdict } from './detect.ts';
import { STATE, type ColumnKind, type LongFrameRow, type MarkRow } from './traceFormat.ts';

/** frames the ring holds (a minute at 240 frames a second and more), and the most a snapshot keeps (ms) */
const RING = 1 << 14;
const KEPT_MS = 60_000;
/** how often the last stretch is judged (ms), how long a new scene settles before its frames count (ms) */
const JUDGE_EVERY_MS = 1000;
const SETTLE_MS = 3000;
/** the most stages and GPU parts kept as columns, and marks and long frames kept */
const MOST_NAMED = 32;
const MOST_MARKS = 400;
const MOST_LONG = 200;
/** How long a slow boot's trace waits after the reveal, recording the play after it, before it's taken (ms). Taken at
 *  the reveal, a laptop's held its last second alone, 17 frames, while its player saw 5 frames a second "for the first
 *  minute or two", and the one ask a session went on it (trace JGNM-1NCF). The snapshot keeps the minute before it is
 *  taken, so the loading screen's last frames come with it. */
const BOOT_TAIL_MS = 45_000;

/** the frames' fixed columns, each a value a frame */
const FIXED = ['interval', 'late', 'cpu', 'upd', 'rnd', 'gpu', 'draws', 'tris', 'programs', 'foes', 'particles', 'state'] as const;
type Fixed = (typeof FIXED)[number];
/** how each is packed (traceFormat.ts): the interval exact, the frames' times from it; any other time a byte */
const KINDS: Record<Fixed, Snapshot['kinds'][string]> = {
  interval: 'ms', late: 'lg', cpu: 'lg', upd: 'lg', rnd: 'lg', gpu: 'lg',
  draws: 'n16', tris: 'n32', programs: 'n16', foes: 'n16', particles: 'n16', state: 'u8',
};

/** Where the game was when it was slow. */
export type Scene = 'boot' | 'heroes' | 'lobby' | 'fight' | 'break' | 'readying';

/** A slow stretch the detector found, and the frames it was found in. */
export interface Slow {
  scene: Scene;
  verdict: Verdict | null;
  /** what took too long, for a boot or a loading bar (ms) */
  tookMs: number;
  at: number;
  snapshot: Snapshot;
}

/** The ring's last minute, its times from its first frame (ms). */
export interface Snapshot {
  frames: number;
  columns: Record<string, Float64Array>;
  kinds: Record<string, ColumnKind>;
  longFrames: LongFrameRow[];
  marks: MarkRow[];
  boot: { steps: MarkRow[]; revealMs: number; downloadMs: number; firstVisit: boolean };
  refreshHz: number;
}

const t = new Float64Array(RING);
const fixed = Object.fromEntries(FIXED.map((name) => [name, new Float32Array(RING)])) as Record<Fixed, Float32Array>;
/** the update's stages and the GPU's parts, a column each as they're first seen */
const named = new Map<string, Float32Array>();
let head = -1, count = 0;
let lastFrame = 0, settleUntil = 0, lastJudged = 0, refreshMs = 1000 / 60;
const marks: { t: number; text: string }[] = [];
const longFrames: { t: number; row: LongFrameRow }[] = [];
const boot = { steps: [] as MarkRow[], revealMs: 0, downloadMs: 0, firstVisit: false };
let readyingSince = 0, wasHidden = false;
const listeners: ((slow: Slow) => void)[] = [];
let pending: Slow | null = null;
/** when a slow boot was revealed, its trace waiting for the play after it (`BOOT_TAIL_MS`); 0: none waits */
let slowBootAt = 0;

/** what the scene was last frame: a change marks it and settles the frames after it */
const seen = { mode: '', phase: '', wave: 0, biome: '', player: null as unknown, hall: false };

function scene(): Scene {
  if (isReadying()) return 'readying';
  if (hallOpen()) return 'heroes';
  if (G.mode !== 'run') return 'lobby';
  return G.run?.phase === 'fighting' ? 'fight' : 'break';
}

function mark(text: string, at = performance.now()): void {
  marks.push({ t: at, text });
  if (marks.length > MOST_MARKS) marks.shift();
}

/** A new scene marked, its first seconds left out of the frame rate. */
function noteScene(now: number): void {
  const phase = G.run?.phase ?? '', wave = G.run?.wave ?? 0, biome = G.arena?.biome ?? '', hall = hallOpen();
  const changed: string[] = [];
  if (G.mode !== seen.mode) changed.push(`mode ${G.mode}`);
  if (phase !== seen.phase) changed.push(phase ? `wave ${wave} ${phase}` : 'run over');
  else if (wave !== seen.wave) changed.push(`wave ${wave}`);
  if (biome !== seen.biome) changed.push(`biome ${biome}`);
  if (G.player !== seen.player) changed.push(`hero ${G.player?.cls?.id ?? ''} built`);
  if (hall !== seen.hall) changed.push(hall ? 'hero selection open' : 'hero selection closed');
  if (!changed.length) return;
  Object.assign(seen, { mode: G.mode, phase, wave, biome, player: G.player, hall });
  mark(changed.join(', '), now);
  settleUntil = now + SETTLE_MS;
}

function stateBits(now: number): number {
  const hidden = document.hidden || wasHidden;
  wasHidden = document.hidden;
  return (G.mode === 'run' ? STATE.run : 0) | (G.run?.phase === 'fighting' ? STATE.fighting : 0)
    | (G.paused ? STATE.paused : 0) | (isWarming() ? STATE.warming : 0) | (hidden ? STATE.hidden : 0)
    | (G.menuOpen ? STATE.menu : 0) | (now < settleUntil ? STATE.settling : 0) | (isReadying() ? STATE.readying : 0);
}

/** The ring's frames in order, as the detector reads them. */
const framesNow = () => ({ interval: fixed.interval, state: fixed.state, start: (head - count + 1 + RING) % RING, count, size: RING });

function judgeNow(now: number): void {
  const second: number[] = [];
  for (let k = 0, s = 0; k < count && s < 1000; k++) {
    const i = (head - k + RING) % RING;
    s += fixed.interval[i];
    if (!(fixed.state[i] & (STATE.hidden | STATE.warming))) second.push(fixed.interval[i]);
  }
  refreshMs = refreshOf(second, refreshMs);
  const verdict = judge(framesNow(), refreshMs);
  if (verdict.slow) found(scene(), verdict, 0);
}

function found(where: Scene, verdict: Verdict | null, tookMs: number): void {
  // (a slow boot's trace, still waiting, takes in whatever else is slow meanwhile: the one ask a session is its)
  if (slowBootAt && where !== 'boot') return;
  if (pending || !recorder.wanted()) return;
  mark(`slow: ${where === 'boot' ? 'boot' : verdict ? verdict.why : where}`);
  pending = { scene: where, verdict, tookMs, at: performance.now(), snapshot: takeSnapshot() };
  for (const fn of listeners) fn(pending);
}

function takeSnapshot(): Snapshot {
  let n = 0, span = 0;
  while (n < count && span < KEPT_MS) span += fixed.interval[(head - n++ + RING) % RING];
  const first = (head - n + 1 + RING) % RING;
  const t0 = n ? t[first] : performance.now();
  const columns: Record<string, Float64Array> = {};
  const kinds: Snapshot['kinds'] = {};
  const copy = (name: string, from: Float32Array, kind: Snapshot['kinds'][string]): void => {
    const out = new Float64Array(n);
    for (let k = 0; k < n; k++) out[k] = from[(first + k) % RING];
    columns[name] = out;
    kinds[name] = kind;
  };
  for (const name of FIXED) {
    copy(name, fixed[name], KINDS[name]);
  }
  // (the update's stages and the GPU's parts: times, a byte each)
  for (const [name, column] of named) copy(name, column, 'lg');
  const since = <T extends { t: number }>(rows: T[]): T[] => rows.filter((r) => r.t >= t0 - 1);
  const at = (ms: number): number => Math.round((ms - t0) * 10) / 10;
  return {
    frames: n,
    columns,
    kinds,
    longFrames: since(longFrames).map(({ t: seenAt, row }) => [at(seenAt), ...row.slice(1)] as LongFrameRow),
    marks: since(marks).map(({ t: when, text }) => [at(when), text] as MarkRow),
    boot: { ...boot, steps: boot.steps.slice() },
    refreshHz: Math.round(1000 / refreshMs),
  };
}

/** The long animation frame `entry` (`perfHud`'s observer hands each over), kept by when it started. */
interface LongFrameEntry {
  startTime: number; duration: number; renderStart: number; styleAndLayoutStart: number;
  scripts: { duration: number; invoker: string; sourceURL: string; sourceFunctionName: string }[];
}

export const recorder = {
  /** Call at the very start of a rAF callback. Returns the frame's place in the ring (for its GPU time). */
  begin(now: number): number {
    noteScene(now);
    const interval = lastFrame ? now - lastFrame : 0;
    lastFrame = now;
    head = (head + 1) % RING;
    count = Math.min(RING, count + 1);
    t[head] = now;
    fixed.interval[head] = interval;
    fixed.late[head] = performance.now() - now;
    fixed.gpu[head] = -1;
    for (const column of named.values()) column[head] = -1;
    const state = stateBits(now);
    fixed.state[head] = state;
    if (state & STATE.readying) readyingSince ||= now;
    else if (readyingSince) {
      const took = now - readyingSince;
      readyingSince = 0;
      mark(`loading bar down after ${(took / 1000).toFixed(1)} s`, now);
      if (slowReadying(took)) found('readying', null, took);
    }
    return head;
  },

  /** An update stage's time this frame (ms). */
  lap(stage: string, ms: number): void {
    let column = named.get(stage);
    if (!column) {
      if (named.size >= MOST_NAMED) return;
      named.set(stage, (column = new Float32Array(RING).fill(-1)));
    }
    column[head] = (column[head] > 0 ? column[head] : 0) + ms;
  },

  /** Call after the frame was drawn: its work (ms) and what it drew. */
  end(cpu: number, upd: number, rnd: number, draws: number, tris: number, programs: number, foes: number, particles: number): void {
    fixed.cpu[head] = cpu; fixed.upd[head] = upd; fixed.rnd[head] = rnd;
    fixed.draws[head] = draws; fixed.tris[head] = tris; fixed.programs[head] = programs;
    fixed.foes[head] = foes; fixed.particles[head] = particles;
    if (lastFrame - lastJudged >= JUDGE_EVERY_MS) { lastJudged = lastFrame; judgeNow(lastFrame); }
    if (slowBootAt && lastFrame - slowBootAt >= recorder.bootTailMs) bootTail();
  },

  /** A frame's GPU time as it came back (ms), and its parts' when it was timed in parts, by its place in the ring. */
  gpu(at: number, ms: number, parts: Record<string, number> | null): void {
    fixed.gpu[at] = ms;
    for (const part in parts ?? {}) {
      const name = `gpu ${part}`;
      let column = named.get(name);
      if (!column) {
        if (named.size >= MOST_NAMED) continue;
        named.set(name, (column = new Float32Array(RING).fill(-1)));
      }
      column[at] = parts![part];
    }
  },

  longFrame(f: LongFrameEntry): void {
    const end = f.startTime + f.duration, render = f.renderStart || end, layout = f.styleAndLayoutStart || end;
    const scripts = f.scripts.reduce((sum, s) => sum + s.duration, 0);
    const longest = [...f.scripts].sort((a, b) => b.duration - a.duration)[0];
    const file = longest?.sourceURL.split('/').pop()?.split('?')[0];
    const by = longest ? [longest.invoker, longest.sourceFunctionName, file].filter(Boolean).join(' ') : '';
    const r = (v: number): number => Math.round(v);
    longFrames.push({ t: f.startTime, row: [0, r(f.duration), r(render - f.startTime), r(layout - render), r(end - layout), r(scripts), r(longest?.duration ?? 0), by] });
    if (longFrames.length > MOST_LONG) longFrames.shift();
  },

  /** Something worth seeing beside the frames: a cast, a warm-up... */
  mark,

  /** A boot step shown (`ui/loading.ts`). */
  bootStep(label: string): void { boot.steps.push([Math.round(performance.now()), label]); },

  /** The game shown: the boot judged by its own work, its download's time taken out (ms). `firstVisit`: no worker
   *  served the page, so its files came from the network. */
  revealed(firstVisit: boolean): void {
    const now = performance.now();
    boot.revealMs = Math.round(now);
    boot.firstVisit = firstVisit;
    boot.downloadMs = Math.round(downloadTime());
    boot.steps.push([boot.revealMs, 'shown']);
    mark('shown', now);
    if (slowBoot(boot.revealMs, boot.downloadMs)) recorder.slowBootRevealed(now);
  },

  /** A slow boot revealed at `now`: its trace waits `bootTailMs` for the play after it (the lab's `recorder` calls it
   *  to check the wait). */
  slowBootRevealed(now: number): void {
    if (pending || !recorder.wanted()) return;
    slowBootAt = now;
    mark('slow: boot, its trace waits for the play after it', now);
  },
  /** how long a slow boot's trace waits after the reveal (ms): `BOOT_TAIL_MS`, the lab's canary none */
  bootTailMs: BOOT_TAIL_MS,

  /** Whether a slow stretch found now could go anywhere (`consent.ts` says): none is snapshotted otherwise. */
  wanted: (): boolean => false,
  /** Calls `fn` with each slow stretch found (one at a time: none till the last is taken). */
  onSlow(fn: (slow: Slow) => void): void { listeners.push(fn); },
  /** The slow stretch waiting to be sent or let go. */
  pending: (): Slow | null => pending,
  /** Lets the waiting one go: the next slow stretch may be found. */
  release(): void { pending = null; },
  /** A snapshot of now, and the detector's verdict on it, for a harness (`lab recorder`). */
  snapshot: takeSnapshot,
  judged: (): Verdict => judge(framesNow(), refreshMs),
};

/** A slow boot's trace taken, the play after its reveal judged beside it. */
function bootTail(): void {
  slowBootAt = 0;
  found('boot', judge(framesNow(), refreshMs), boot.revealMs);
}

/** How long the page waited on its files (ms): the time any of the document, its scripts, styles and fetches was
 *  coming, as the browser timed them (overlaps counted once), up to now. */
function downloadTime(): number {
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  const spans: [number, number][] = nav ? [[0, nav.responseEnd]] : [];
  for (const r of performance.getEntriesByType('resource') as PerformanceResourceTiming[]) {
    if (['script', 'link', 'fetch', 'xmlhttprequest', 'css'].includes(r.initiatorType)) spans.push([r.startTime, r.responseEnd]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  let total = 0, from = -1, to = -1;
  for (const [start, end] of spans) {
    if (start > to) { total += to - from; from = start; to = end; } else to = Math.max(to, end);
  }
  return total + to - from;
}
