// The page's main thread waiting on the GPU's process (tools/stalls, `--scenario boot`): a call that can't return
// until the GPU's process has answered (a context made, a link's status or a uniform's place read, pixels read
// back, a `finish`) holds the page for as long as that process is busy, with whatever else is on the GPU. A
// desktop's boot held the page 9.5 s with the GPU under another's load (from the owner: "we should not freeze even
// if GPU is under heavy load"). On an idle GPU each wait is short, so a step's frames never showed them: they are
// listed by step, the longest first with the function that waited, and held to a budget.

/** the trace's tasks that are the main thread waiting for the GPU's process to answer */
export const GPU_WAIT_TASKS = new Set([
  'CommandBufferProxyImpl::WaitForGetOffset',
  'CommandBufferProxyImpl::WaitForToken',
  'CommandBufferHelper::Finish',
]);
/** how many of a step's waits are listed, the longest first, and how many of the waiting function's callers */
const WAITS_SHOWN = 3;
const CALLERS_SHOWN = 3;
/** the steps before the game's own first: the browser builds its own programs for the page's first paint then, and
 *  the loading screen's context waits behind them on a first visit (0.5 to 0.7 s, the page held 0.2 s). Listed, not
 *  held to the budget */
export const BEFORE_THE_GAME = ['the document fetched', 'Loading…'];
/** the most a step's waits may come to from the game's first step on, ms (`--most-gpu-wait`). As this was written,
 *  on an idle GPU, the most on main was a first visit's "Forging the arena", 336 (232 of it the loading screen's
 *  programs asked whether they had linked), once a return's "Conjuring spells" no longer read the lobby logo's
 *  shadow back from the GPU (309 to 461 before) */
export const MOST_GPU_WAIT_MS = 500;

/** Whether `inner` runs wholly within `outer`, on its thread. */
function within(inner, outer) {
  const sameThread = inner.pid === outer.pid && inner.tid === outer.tid;
  return sameThread && inner !== outer && outer.ts <= inner.ts && outer.ts + outer.dur >= inner.ts + inner.dur;
}

/** The page's functions running as the wait at `at` (ms, the page's clock) began: the one that waited, then its
 *  callers, `CALLERS_SHOWN` of them; none where the page's JS wasn't sampled (`--js`). */
function waitedIn(samples, at, ms) {
  const running = samples.find((sample) => sample.at + sample.ms > at && sample.at < at + ms);
  return running ? running.stack.slice(0, CALLERS_SHOWN) : [];
}

/**
 * The waits on the GPU's process of the page's main thread (`thread`: the mark's `pid` and `tid`) that began in
 * the page's `[from, to)`: how many, their time in all, and the longest `WAITS_SHOWN`, each with when it began, how
 * long it took, its task and the functions it waited in. A wait inside another (a `finish`'s own) is the outer's.
 */
export function gpuWaitsIn({ tasks, toPage, samples }, thread, from, to) {
  if (!thread) return { count: 0, ms: 0, longest: [] };
  const onThread = tasks.filter((task) => task.pid === thread.pid && task.tid === thread.tid);
  const waits = onThread.filter((task) => GPU_WAIT_TASKS.has(task.name));
  const outer = waits.filter((wait) => !waits.some((other) => within(wait, other)));
  const timed = outer
    .map((wait) => ({ at: toPage(wait.ts), ms: wait.dur / 1000, task: wait.name }))
    .filter((wait) => wait.at !== null && wait.at >= from && wait.at < to);
  const longest = [...timed]
    .sort((a, b) => b.ms - a.ms)
    .slice(0, WAITS_SHOWN)
    .map((wait) => ({ ...wait, waitedIn: waitedIn(samples, wait.at, wait.ms) }));
  return { count: timed.length, ms: timed.reduce((sum, wait) => sum + wait.ms, 0), longest };
}

/** A boot's steps whose waits come to more than the budget (`mostMs`), from the game's first step on. */
export function gpuWaitsOver(steps, mostMs) {
  const held = steps.filter((step) => !BEFORE_THE_GAME.includes(step.name));
  return held.filter((step) => (step.gpuWaits?.ms ?? 0) > mostMs);
}
