// The boot kept at its pace while its page is hidden. A browser gives a hidden page no frames (a window covered by
// another counts, on Windows) and runs its timers once a second at the most, and the boot waits for a frame or a
// short timer between its steps, so the loading screen's steps are painted and nothing holds the page long: a
// player who looked at another window while the game loaded came back to a boot of 48 s where it takes 8 to 13
// (reports 80NM-443E and BM6R-CTRB, both with the page out of focus and no frame for 13 to 16 s; `npm run stalls --
// --scenario boot --covered`: 23 to 26 s with the window minimised). From the owner: "cannot have 4070 Ti take 30+
// sec to load, even cold".
//
// So until the loading screen has left, every frame and short timer the page asks for is also timed by a worker
// (whose timers the browser leaves alone), a little later than the browser would run it: whichever comes first
// runs it, once. A page that's shown gets the browser's own, as before; one that gets none goes on at the worker's
// pace. It doesn't ask whether the page is hidden: a covered window may get no frames and still say it's shown (an
// embedded browser's pane did). After the loading screen a hidden game rests, as before.

/** how long after a frame was asked for the worker runs it, if the browser hasn't (ms): past a slow screen's frame */
const FRAME_LATE_MS = 50;
/** how much later than a timer's own time the worker runs it, if the browser hasn't (ms), and the longest timer
 *  it stands by (a longer one loses little to a second's rounding) */
const TIMER_LATE_MS = 30;
const TIMER_MOST_MS = 2000;

let worker: Worker | null = null;
let last = 0;
/** what the worker's timers run, by their ids */
const timed = new Map<number, () => void>();
/** the frames asked for and not yet run, by their ids */
const frames = new Map<number, FrameRequestCallback>();
let active = false;

/** `run` after `ms`, by the worker's clock. Returns its id. */
function byWorker(ms: number, run: () => void): number {
  const id = ++last;
  timed.set(id, run);
  worker!.postMessage({ id, ms });
  return id;
}

/** Every frame asked for so far run, once (whichever of the browser's frame and the worker's timer comes first). */
function runFrames(): void {
  if (!frames.size) return;
  const asked = [...frames.values()];
  frames.clear();
  const now = performance.now();
  for (const frame of asked) {
    // (each on its own, as the browser runs them: one that throws takes none of the others with it)
    try {
      frame(now);
    } catch (error) {
      reportError(error);
    }
  }
}

/** the pace of the frames of a page the browser gives none (ms): nothing is shown, so no faster than a screen's */
const STARVED_FRAME_MS = 16;

/** whether the browser has run a frame since the worker last looked, how many times in a row it hadn't, and
 *  whether the page is taken to get no frames (till the browser runs one) */
let shown = false;
let misses = 0;
let starved = false;
let standing = false;
/** whether a frame of the browser's is asked for: one at a time (asked once for each frame the page asked, each ran
 *  every frame waiting, those asked for in that same frame too, and a loop of frames ran many times a frame) */
let asked = false;

/** The browser's own frame: the frames asked for run, and the page known to be shown. */
function browserFrame(): void {
  asked = false;
  shown = true;
  starved = false;
  runFrames();
}

/**
 * The worker stood by for the frames asked for, one timer at a time. It runs them only once the browser has let
 * two of its timers in a row go by without a frame: after a long task its timer and the browser's frame both wait,
 * and run at the first, a step of the boot went on before the loading screen was painted (the bar stood still, the
 * first paint 12 s in). From then, till the browser runs a frame again, the worker runs them at a screen's pace.
 */
function standBy(): void {
  if (standing) return;
  standing = true;
  byWorker(starved ? STARVED_FRAME_MS : FRAME_LATE_MS, () => {
    standing = false;
    misses = shown ? 0 : misses + 1;
    shown = false;
    if (misses >= 2) starved = true;
    if (starved) runFrames();
    if (frames.size && active) standBy();
  });
}

/**
 * From here until `left` resolves (the loading screen gone), the page's frames and timers keep their pace while it's
 * hidden. Call it before the boot's first wait.
 */
export function keepBootPaceHidden(left: Promise<void>): void {
  if (active || typeof Worker === 'undefined') return;
  try {
    worker = new Worker(new URL('./hiddenBoot.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return;
  }
  active = true;
  worker.onmessage = (event: MessageEvent<number>): void => {
    const run = timed.get(event.data);
    timed.delete(event.data);
    run?.();
  };
  const native = {
    frame: window.requestAnimationFrame.bind(window),
    cancelFrame: window.cancelAnimationFrame.bind(window),
    timeout: window.setTimeout.bind(window),
    clear: window.clearTimeout.bind(window),
  };
  window.requestAnimationFrame = (frame: FrameRequestCallback): number => {
    if (!active) return native.frame(frame);
    // (ids of its own, under the browser's: a frame cancelled is found in either)
    const id = -(++last);
    frames.set(id, frame);
    if (!asked) native.frame(browserFrame);
    asked = true;
    standBy();
    return id;
  };
  window.cancelAnimationFrame = (id: number): void => {
    if (id < 0) frames.delete(id);
    else native.cancelFrame(id);
  };
  /** the browser's timer standing by each of the worker's not yet run, by the worker's id */
  const beside = new Map<number, number>();
  const timeout = (run: TimerHandler, ms = 0, ...given: unknown[]): number => {
    if (!active || typeof run !== 'function' || ms > TIMER_MOST_MS) return native.timeout(run, ms, ...given);
    // (the browser's timer and the worker's both come here: the first runs it, the other finds it gone)
    const once = (): void => {
      if (!beside.has(id)) return;
      native.clear(beside.get(id));
      beside.delete(id);
      (run as (...args: unknown[]) => void)(...given);
    };
    const id: number = byWorker(ms + TIMER_LATE_MS, once);
    beside.set(id, native.timeout(once, ms));
    return -id;
  };
  window.setTimeout = timeout as typeof window.setTimeout;
  window.clearTimeout = ((id?: number): void => {
    if (id === undefined || id >= 0) {
      native.clear(id);
      return;
    }
    timed.delete(-id);
    native.clear(beside.get(-id));
    beside.delete(-id);
  }) as typeof window.clearTimeout;
  void left.then(() => {
    // (what's still asked for runs as it was timed; from here the browser's own are used alone)
    active = false;
  });
}
