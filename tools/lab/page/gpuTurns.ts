// tools/lab's GPU time of a change to the frame: each render timed by a query of its own
// (EXT_disjoint_timer_query_webgl2, where the browser has it), the change on and off in turns. The machine's load
// drifts, and two runs apart read two loads (the lab's frame times moved by a millisecond from run to run, and a
// commit against itself read 1.2 ms apart): in turns within one page, both sides read the same load. A turn's renders
// are sent back to back, their times read after, and the turns start after a warm-up: each render waited for alone
// left the GPU idle between them, its clocks fell, and a frame drawn twice read 1.26 times one (`envcost --canary`).
// `fire --cost` times its flames with it, `envcost` the environment's lookups.
import * as THREE from 'three';
import { quantile } from './timing';

/** The frame's median time on the GPU (ms) with the change on and off, and what the change takes. */
export interface TurnsCost {
  on: number;
  off: number;
  /** what the change takes (ms): the median over the rounds of each round's own difference, its two turns drawn
   *  back to back, so the GPU's clock drifting from round to round falls out of it */
  takes: number;
  /** how far `takes` may be off (ms): the standard error of that median, from the rounds' spread */
  error: number;
  /** the renders each side was timed over */
  renders: number;
}

/** Whether a cost is told from nothing: over twice its own error. Under it, the run can't say the change costs or
 *  saves anything (a part read -1.3 ms and +1.6 ms in two runs of six rounds, each printed as if it meant it). */
export const sure = (cost: TurnsCost): boolean => Math.abs(cost.takes) > 2 * cost.error;

/** How the turns run: their rounds, a side's in each, and the renders in a turn. */
export interface Turns {
  rounds: number;
  renders: number;
}

/** fire's turns: 8 rounds of 6 renders a side */
export const TURNS: Turns = { rounds: 8, renders: 6 };

/** how long a query's time is waited for (ms, by the browser's clock) */
const QUERY_WAIT = 2000;
/** the renders drawn untimed before the turns, the GPU's clocks brought up */
const WARM_RENDERS = 30;

/** The GPU's timer: the context and its extension, or null where the browser has none. */
interface Timer {
  gl: WebGL2RenderingContext;
  ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number };
}

/** The browser's next task: a query's time comes back only once the task that ended it is over. */
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** The GPU's timer on `renderer`'s context, or null. */
function timerOf(renderer: THREE.WebGLRenderer): Timer | null {
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  return ext ? { gl, ext } : null;
}

/** `draw` run inside a timer query of its own; the query, to be read by `timeOf`. */
function queried(timer: Timer, draw: () => void): WebGLQuery {
  const { gl, ext } = timer;
  const query = gl.createQuery()!;
  gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
  draw();
  gl.endQuery(ext.TIME_ELAPSED_EXT);
  return query;
}

/** `query`'s time on the GPU (ms), deleted once read, or null where the time was lost (the GPU's clock disjoint, or
 *  never back). */
async function timeOf(timer: Timer, query: WebGLQuery): Promise<number | null> {
  const { gl, ext } = timer;
  // (by the browser's clock: the page's stands still within a lab frame)
  const now = window.__labClock.realNow;
  const start = now();
  try {
    while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
      if (now() - start > QUERY_WAIT) return null;
      await nextTask();
    }
    if (gl.getParameter(ext.GPU_DISJOINT_EXT)) return null;
    return gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
  } finally {
    gl.deleteQuery(query);
  }
}

/** The median of `values`, or 0 with none. */
function medianOf(values: number[]): number {
  return values.length ? quantile([...values].sort((a, b) => a - b), 0.5) : 0;
}

/** The times of `queries` that came back. */
async function timesOf(timer: Timer, queries: WebGLQuery[]): Promise<number[]> {
  const times: number[] = [];
  for (const query of queries) {
    const took = await timeOf(timer, query);
    if (took !== null) times.push(took);
  }
  return times;
}

/** a median's standard error over a normal spread's, and a normal spread's over its median deviation */
const MEDIAN_ERROR = 1.2533;
const DEVIATION = 1.4826;

/** How far the median of `values` may be off: its standard error, from their median deviation (a round a stray
 *  load fell on counts for little). */
function medianError(values: number[]): number {
  if (values.length < 2) return Infinity;
  const middle = medianOf(values);
  const deviation = medianOf(values.map((value) => Math.abs(value - middle)));
  return (MEDIAN_ERROR * DEVIATION * deviation) / Math.sqrt(values.length);
}

/**
 * The frame's time on the GPU as `draw` renders it with `change(true)` and `change(false)` in turns, left on; null
 * where the browser times nothing. A change that swaps programs is drawn once each way first, so no turn waits on a
 * link, and the GPU is warmed before the turns. Every turn of every round is sent before any time is read: read
 * turn by turn, the GPU stood idle while each was waited for, its clock fell, and the next turn's first renders ran
 * slow. A round's turns come in the other order each round, so a drift along the run falls on both sides alike. A
 * turn's median leaves out what a change costs once as it's made (a mesh merged again, a buffer sent).
 */
export async function costInTurns(
  renderer: THREE.WebGLRenderer,
  change: (on: boolean) => void,
  draw: () => void,
  turns: Turns = TURNS,
): Promise<TurnsCost | null> {
  const timer = timerOf(renderer);
  if (!timer) return null;
  const sent: { on: WebGLQuery[]; off: WebGLQuery[] }[] = [];
  try {
    change(false);
    draw();
    change(true);
    for (let render = 0; render < WARM_RENDERS; render++) draw();
    for (let round = 0; round < turns.rounds; round++) {
      const queries = { on: [] as WebGLQuery[], off: [] as WebGLQuery[] };
      for (const on of round % 2 ? [false, true] : [true, false]) {
        change(on);
        const turn = on ? queries.on : queries.off;
        for (let render = 0; render < turns.renders; render++) turn.push(queried(timer, draw));
      }
      sent.push(queries);
    }
  } finally {
    change(true);
  }
  const on: number[] = [];
  const off: number[] = [];
  const differences: number[] = [];
  for (const queries of sent) {
    const with_ = await timesOf(timer, queries.on);
    const without = await timesOf(timer, queries.off);
    on.push(...with_);
    off.push(...without);
    if (with_.length && without.length) differences.push(medianOf(with_) - medianOf(without));
  }
  if (!differences.length) return null;
  return {
    on: medianOf(on),
    off: medianOf(off),
    takes: medianOf(differences),
    error: medianError(differences),
    renders: Math.min(on.length, off.length),
  };
}
