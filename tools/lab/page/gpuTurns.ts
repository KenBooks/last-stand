// tools/lab's GPU time of a change to the frame: each render timed by a query of its own
// (EXT_disjoint_timer_query_webgl2, where the browser has it), the change on and off in turns. The machine's load
// drifts, and two runs apart read two loads (the lab's frame times moved by a millisecond from run to run, and a
// commit against itself read 1.2 ms apart): in turns within one page, both sides read the same load. A turn's renders
// are sent back to back, their times read after, and the turns start after a warm-up: each render waited for alone
// left the GPU idle between them, its clocks fell, and a frame drawn twice read 1.26 times one (`envcost --canary`).
// `fire --cost` times its flames with it, `envcost` the environment's lookups.
import * as THREE from 'three';
import { quantile } from './timing';

/** The frame's median time on the GPU (ms) with the change on and off. */
export interface TurnsCost {
  on: number;
  off: number;
  /** the renders each side was timed over */
  renders: number;
}

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

/** `count` renders by `draw`, sent back to back, each timed; the times that came back. */
async function timedRenders(timer: Timer, draw: () => void, count: number): Promise<number[]> {
  const queries = Array.from({ length: count }, () => queried(timer, draw));
  const times: number[] = [];
  for (const query of queries) {
    const took = await timeOf(timer, query);
    if (took !== null) times.push(took);
  }
  return times;
}

/**
 * The frame's time on the GPU as `draw` renders it with `change(true)` and `change(false)` in turns, left on; null
 * where the browser times nothing. A change that swaps programs is drawn once each way first, so no turn waits on a
 * link, and the GPU is warmed before the turns.
 */
export async function costInTurns(
  renderer: THREE.WebGLRenderer,
  change: (on: boolean) => void,
  draw: () => void,
  turns: Turns = TURNS,
): Promise<TurnsCost | null> {
  const timer = timerOf(renderer);
  if (!timer) return null;
  const on: number[] = [];
  const off: number[] = [];
  try {
    change(false);
    draw();
    change(true);
    for (let render = 0; render < WARM_RENDERS; render++) draw();
    for (let round = 0; round < turns.rounds; round++) {
      change(true);
      on.push(...await timedRenders(timer, draw, turns.renders));
      change(false);
      off.push(...await timedRenders(timer, draw, turns.renders));
    }
  } finally {
    change(true);
  }
  if (!on.length || !off.length) return null;
  return { on: medianOf(on), off: medianOf(off), renders: Math.min(on.length, off.length) };
}
