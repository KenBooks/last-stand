// What a measure of the stalls found (tools/stalls): the page's frames and the trace's Skia program links put on one
// clock, each stall with the programs built in it, the tasks they were built inside, and what the page changed just
// before it.
import { jsIn, jsSamples, jsUnder } from './profile.mjs';

/** a frame this long or longer is a stall (ms), and one this long is listed on its own unless the command says
 *  (`--listed`, down to `LISTED_LEAST`: the trace keeps tasks of 20 ms and more, `trace.mjs`) */
export const STALL_MS = 100;
export const LISTED_MS = 300;
export const LISTED_LEAST = 20;
/** the page's changes this long before a stall are listed with it (ms) */
const CHANGES_BEFORE_MS = 400;
/** the most kinds of change listed with a stall */
const CHANGES_SHOWN = 6;
/** the page's changes this long before a program's link are listed with it (ms), and how many kinds */
const CHANGES_BEFORE_LINK_MS = 150;
const CHANGES_SHOWN_FOR_LINK = 3;
/** the most of the longest tasks listed with a stall: what each thread was busy with through it */
const BUSY_SHOWN = 4;
/** a task this long or longer is listed as one a stall was busy with (ms: the trace keeps work from 0.5 ms) */
const BUSY_LEAST_MS = 20;
/** the most kinds of work listed for each phase, the most of a frame's time first, and for each stall */
const WORK_SHOWN = 10;
const STALL_WORK_SHOWN = 6;
/** the most kinds of work listed for each step of a boot, the most first, and the largest files listed */
const BOOT_WORK_SHOWN = 6;
/** the GPU process's main thread, listed apart in a boot's steps: it runs every page's GL and the compositor, and
 *  anything long on it holds every frame up (ANGLE's waits for a link, a shader compiled at a draw: `--angle`) */
const GPU_MAIN = 'GPU Process CrGpuMain';
/** ANGLE's tasks on the GPU process's pool of threads: where a first visit's shaders are compiled and linked */
const GPU_COMPILE = 'ANGLEPlatformImpl::RunWorkerTask';
/** the span the GPU process's compiles are counted over in turn through a step (ms) */
export const GPU_STEP_MS = 250;
const FILES_SHOWN = 3;
/** the most of the workers' maps listed, the longest first */
const MAPS_SHOWN = 3;
/** the slow launches in a row (`ui/logoWind.ts`'s watchdog counts them) at which the exit is a plain fade */
export const SLOW_LAUNCHES = 2;
/** the step a boot ends on (`page.mjs` `bootRecording` names it, in the page where nothing can be imported) */
export const REVEALED = 'the lobby revealed';
/** the most kinds of work other pages' renderers did that are listed (`othersWork`) */
const OTHERS_LISTED = 4;
/** the work after a change of the page's look counted as its own up to the next change or for this long at most (ms:
 *  its paint, and the fades it starts, .3 s in the stash); the most kinds of change listed, the costliest first */
const LOOK_SPAN_MS = 300;
const LOOKS_SHOWN = 4;
/** the threads whose tasks are waits, not work, left out of a phase's: the GPU process's waits for the screen's
 *  vertical blank (a frame's whole time, whatever the frame cost) */
const WAITING_THREADS = new Set(['GpuVSyncThread']);
/** the work that is the page's own rather than the browser's for it: its scripts (the game's frame among them), and
 *  the GPU process running the commands it's sent (the game's WebGL with the rest, slowed by whatever else is on the
 *  GPU). What's left (style, layout, paint, layers, raster, the compositor's frames) is a phase's `browserWork`. */
const PAGE_OWN_WORK = new Set(['FunctionCall', 'EvaluateScript', 'CommandBufferService:PutChanged']);
/** Skia's own events, listed as the programs built rather than as tasks */
const SKIA_EVENTS = new Set(['driver_link_program', 'driver_compile_shader']);

/** The page's time (ms) of a trace time (µs), given the mark's trace time and the page's time at it. */
const onPageClock = (ts, markTs, pageStart) => (ts - markTs) / 1000 + pageStart;

/** A C++ function's readable name: `virtual void __cdecl ns::Type::method(args)` → `Type::method`. */
export function shortName(name) {
  // (the anonymous namespace first: its parenthesis comes before the arguments')
  const named = name.replace(/\(anonymous namespace\)::/g, '');
  const withoutArgs = named.replace(/\(.*$/s, '');
  const words = withoutArgs.split(' ');
  const last = words[words.length - 1];
  const parts = last.split('::').filter(Boolean);
  return parts.slice(-2).join('::') || name;
}

/** Each thread's name by `pid:tid`, from the trace's metadata. */
function threadNames(events) {
  const processes = new Map();
  const threads = new Map();
  for (const event of events) {
    if (event.ph !== 'M') continue;
    if (event.name === 'process_name') processes.set(event.pid, event.args?.name ?? '?');
    if (event.name === 'thread_name') threads.set(`${event.pid}:${event.tid}`, event.args?.name ?? '?');
  }
  const named = new Map();
  for (const [key, thread] of threads) {
    const pid = Number(key.split(':')[0]);
    named.set(key, `${processes.get(pid) ?? pid} ${thread}`);
  }
  return named;
}

/** The trace's event of the page's mark (its time, its renderer), or null when the trace never saw it. */
function markOf(events, mark) {
  return events.find((event) => event.name === 'TimeStamp' && event.args?.data?.message === mark) ?? null;
}

/** The page's mark on the trace and the page's time at it: the recording's start, or its end where the trace lost
 *  its start (Chrome's buffer full: `page.mjs` `stopRecording`). Null with neither. */
function clockOf(events, mark, record) {
  const start = markOf(events, mark);
  if (start) return { stamp: start, at: record.start };
  const end = record.end === undefined ? null : markOf(events, `${mark}:end`);
  return end ? { stamp: end, at: record.end } : null;
}

/** The work other pages' renderers did over the recording, which ran in its frames' time (none when they're
 *  held still while it plays: `--rounds` on more than one URL): in all (ms), and on each thread and task, the most
 *  first (`thread (pid) task`). */
function othersWork(placed, pagePid, start) {
  const theirs = placed.filter(({ task, thread, at }) => {
    return at >= start && task.pid !== pagePid && thread.startsWith('Renderer ');
  });
  const byWork = new Map();
  for (const { task, thread, ms } of theirs) {
    const key = `${thread} (${task.pid}) ${shortName(task.name)}`;
    byWork.set(key, (byWork.get(key) ?? 0) + ms);
  }
  const most = [...byWork].sort((a, b) => b[1] - a[1]).slice(0, OTHERS_LISTED);
  return { ms: theirs.reduce((sum, { ms }) => sum + ms, 0), most: most.map(([what, ms]) => ({ what, ms })) };
}

/** The tasks on the same thread that hold `link` (outermost first), by their readable names. */
function heldIn(link, tasks) {
  return tasks
    .filter((task) => task.pid === link.pid && task.tid === link.tid && task !== link)
    .filter((task) => task.ts <= link.ts && task.ts + task.dur >= link.ts + link.dur)
    .sort((a, b) => a.ts - b.ts)
    .map((task) => shortName(task.name));
}

/** A task's thread by name (`GPU Process CrGpuMain`), or its ids when the trace didn't name it. */
const threadOf = (task, names) => names.get(`${task.pid}:${task.tid}`) ?? `${task.pid}:${task.tid}`;

/** The longest tasks (on any thread) that overlap the page's `[from, to]`, longest first: how long, where and what. */
function busyIn(tasks, from, to, toPage, names) {
  return tasks
    .filter((task) => !SKIA_EVENTS.has(task.name) && task.dur >= BUSY_LEAST_MS * 1000)
    .map((task) => ({ task, at: toPage(task.ts), ms: task.dur / 1000 }))
    .filter(({ at, ms }) => at !== null && at < to && at + ms > from)
    .sort((a, b) => b.ms - a.ms)
    .slice(0, BUSY_SHOWN)
    .map(({ task, ms }) => ({ ms, thread: threadOf(task, names), name: shortName(task.name) }));
}

/** The page's changes in `[from, to]`, by kind and place, the most frequent first. */
function changesBetween(changes, from, to, shown = CHANGES_SHOWN) {
  const counts = new Map();
  for (const change of changes) {
    if (change.at < from || change.at > to) continue;
    const key = `${change.what} on ${change.where}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, shown)
    .map(([key, count]) => `${count} x ${key}`);
}

/** The interval at share `share` (0..1) of `sorted` intervals, or 0 without any. */
function atShare(sorted, share) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))];
}

/** a frame this many times the screen's refresh or longer missed one (the refresh: the fastest phase's median) */
const MISSED_SHARE = 1.5;

/** The frames' summary: how many, how many a second over their time, their median and 90th percentile, the stalls
 *  and the worst. */
function frameSummary(frames) {
  const intervals = frames.map((frame) => frame.ms).sort((a, b) => a - b);
  const stalls = frames.filter((frame) => frame.ms >= STALL_MS);
  const total = intervals.reduce((sum, ms) => sum + ms, 0);
  return {
    count: frames.length,
    rate: total > 0 ? (frames.length * 1000) / total : 0,
    median: atShare(intervals, 0.5),
    p90: atShare(intervals, 0.9),
    stalls: stalls.length,
    stalled: stalls.reduce((sum, frame) => sum + frame.ms, 0),
    worst: intervals.slice(-5).reverse(),
  };
}

/**
 * Each task with its own time (ms): its length less its children's, those on its thread inside it that the trace
 * kept (work shorter than it keeps counts as its holder's). A thread's run loop holding the work keeps little.
 */
export function selfTimes(tasks) {
  const byThread = new Map();
  for (const task of tasks) {
    const key = `${task.pid}:${task.tid}`;
    if (!byThread.has(key)) byThread.set(key, []);
    byThread.get(key).push(task);
  }
  const owned = [];
  for (const thread of byThread.values()) {
    // (the outer of two that start together first: it holds the other)
    thread.sort((a, b) => a.ts - b.ts || b.dur - a.dur);
    const open = [];
    for (const task of thread) {
      while (open.length && open[open.length - 1].end <= task.ts) open.pop();
      const entry = { task, end: task.ts + task.dur, children: 0 };
      if (open.length) open[open.length - 1].children += task.dur;
      open.push(entry);
      owned.push(entry);
    }
  }
  return owned.map(({ task, children }) => ({ task, ms: Math.max(0, task.dur - children) / 1000 }));
}

/** Whether a piece of work counts as a thread's: not Skia's builds (listed apart) nor a thread's waits. */
const isWork = ({ task, thread }) => !SKIA_EVENTS.has(task.name) && !WAITING_THREADS.has(thread.split(' ').pop());

/** Each piece of work (`selfTimes`) with its thread and its start on the page's clock, the earliest first (none the
 *  trace couldn't put on it). */
function placedWork(owned, toPage, names) {
  return owned
    .map(({ task, ms }) => ({ task, ms, at: toPage(task.ts), thread: threadOf(task, names) }))
    .filter((placed) => placed.at !== null && isWork(placed))
    .sort((a, b) => a.at - b.at);
}

/** The index of the first of `timed` (the earliest first: work placed, or frames) that is `at` or later. */
function firstFrom(timed, at) {
  let low = 0;
  let high = timed.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (timed[middle].at < at) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** The work that started in the page's `spans` (`[from, to)` each): each kind of work on each thread, its own time
 *  summed (ms), by `name\nthread`. */
function workTotals(placed, spans) {
  const totals = new Map();
  for (const [from, to] of spans) {
    for (let index = firstFrom(placed, from); index < placed.length && placed[index].at < to; index++) {
      const { task, ms, thread } = placed[index];
      const key = `${shortName(task.name)}\n${thread}`;
      totals.set(key, (totals.get(key) ?? 0) + ms);
    }
  }
  return totals;
}

/** `totals` (`workTotals`) shared out `count` ways, the most first, `WORK_SHOWN` kinds of it. */
function sharedWork(totals, count) {
  return [...totals]
    .sort((a, b) => b[1] - a[1])
    .slice(0, WORK_SHOWN)
    .map(([key, total]) => {
      const [name, thread] = key.split('\n');
      return { name, thread, ms: count ? total / count : 0 };
    });
}

/** What the threads spent `frames` frames' time on in the page's `spans` (`[from, to)` each): each kind of work on
 *  each thread that started in them, its own time summed and shared out a frame, the most first. */
const workIn = (placed, spans, frames) => sharedWork(workTotals(placed, spans), frames);

/** The browser's own work for the page (ms) that started in the page's `[from, to)`: all but `PAGE_OWN_WORK`. */
function browserWorkIn(placed, from, to) {
  let total = 0;
  for (let index = firstFrom(placed, from); index < placed.length && placed[index].at < to; index++) {
    const { task, ms } = placed[index];
    if (!PAGE_OWN_WORK.has(shortName(task.name))) total += ms;
  }
  return total;
}

/** a phase cut into spans this long (ms), each's frames and work counted (`bySecond`) */
const SECOND_MS = 1000;

/**
 * A phase a second at a time, its whole seconds from its mark: the frames drawn in each and the browser's work in it
 * (ms, `browser`). A cost that piles up as the player goes on falls through it, where the phase's sums hide it: the
 * owner's overlay fell from 144 frames a second to 28 over 4 s of moving between items, the sweep read whole as 94 to
 * 118.
 */
function bySecond(frames, from, to, browser, gpu) {
  const seconds = [];
  for (let start = from; start + SECOND_MS <= to; start += SECOND_MS) {
    const end = start + SECOND_MS;
    const drawn = frames.filter((frame) => frame.at > start && frame.at <= end).length;
    seconds.push({ frames: drawn, work: browser(start, end), gpu: gpuIn(gpu, start, end) });
  }
  return seconds;
}

/** how many kinds of quad a phase names, the most a frame first */
const MATERIALS_SHOWN = 5;

/**
 * The compositor's draws from `from` to `to` (`--passes`, `trace.mjs` `drawOf`, on the page's clock): the frames it
 * drew, and a frame's render passes (its root among them) and quads, each kind of quad's too (its material, the most
 * first). Counts, so a cost on the GPU reads the same however loaded the machine is, where its time moved by more
 * than the cost. Null where nothing was drawn (or it wasn't traced).
 */
function drawnIn(draws, from, to) {
  const within = draws.filter((draw) => draw.at > from && draw.at <= to);
  const frames = within.filter((draw) => draw.kind === 'frame').length;
  if (frames === 0) return null;
  const quads = within.filter((draw) => draw.kind === 'quad');
  const materials = new Map();
  for (const quad of quads) materials.set(quad.material, (materials.get(quad.material) ?? 0) + 1);
  const byMaterial = [...materials]
    .map(([name, count]) => ({ name: String(name).replace(/^k/, ''), perFrame: count / frames }))
    .sort((a, b) => b.perFrame - a.perFrame)
    .slice(0, MATERIALS_SHOWN);
  const passes = within.filter((draw) => draw.kind === 'pass').length;
  return { frames, passes: passes / frames, quads: quads.length / frames, materials: byMaterial };
}

/** how many elements a phase's paints name, the most painted first */
const PAINTED_SHOWN = 5;

/**
 * The page's paints from `from` to `to` (`--paints`, `trace.mjs` `paintOf`, on the page's clock) over `frames` frames:
 * paints a frame, and each name's (`names`, `stalls.mjs` `paintedNames`), the most first, with how many elements of
 * that name were painted. A paint is the page drawing an element again, to be rastered after: one every frame is
 * something that keeps changing how it looks. Null where nothing was painted (or it wasn't traced).
 */
function paintedIn(paints, from, to, frames, names) {
  const within = paints.filter((paint) => paint.at > from && paint.at <= to);
  if (within.length === 0 || frames === 0) return null;
  const byName = new Map();
  for (const paint of within) {
    const name = names.get(paint.node) ?? '(no element)';
    const named = byName.get(name) ?? { count: 0, nodes: new Set() };
    named.count += 1;
    named.nodes.add(paint.node);
    byName.set(name, named);
  }
  const elements = [...byName]
    .map(([name, { count, nodes }]) => ({ name, perFrame: count / frames, elements: nodes.size }))
    .sort((a, b) => b.perFrame - a.perFrame)
    .slice(0, PAINTED_SHOWN);
  return { perFrame: within.length / frames, elements };
}

/** The mean of the perf overlay's GPU readings from `from` to `to` (ms a frame), or null with none read. */
function gpuIn(gpu, from, to) {
  const read = gpu.filter((reading) => reading.at > from && reading.at <= to);
  return read.length ? read.reduce((sum, reading) => sum + reading.ms, 0) / read.length : null;
}

/**
 * Each phase the scenario marked (`page.mjs` `markPhase`): its frames' summary, from its mark to the next's (the
 * last's to the end), the share of them that missed the screen's refresh (`missedShare`), the share a tooltip was
 * shown in, what the threads spent their time on, a frame of the phase's and a frame of those that missed, the
 * browser's own work for the page a second (`browserWork`, ms), the perf overlay's GPU time (`gpu`, ms a frame;
 * null where it wasn't shown), and each a second at a time (`seconds`). A median alone hides the misses: #269's
 * sweep read 7.0 ms, a frame every refresh, at 99 frames a second where the screen gave 145. And frames a second hang
 * on the whole GPU: with another game in a browser beside it, one variant read 102 to 124 measure to measure, where
 * the browser's work for it held within a tenth. `work` is `workIn` and `browserWorkIn` on the trace's work, `gpu`
 * the overlay's readings, `draws` the compositor's (`drawn`, with `--passes`), `paints` the page's (`painted`, with
 * `--paints`, its elements by `names`).
 */
function phaseSummaries(spans, refresh, work, gpu, draws, paints, names) {
  return spans.map(({ phase, frames, from, to }) => {
    const tipped = frames.filter((frame) => frame.tip).length;
    const missed = missedOf(frames, refresh);
    return {
      name: phase.name,
      ...frameSummary(frames),
      missedShare: frames.length ? missed.length / frames.length : 0,
      tipShare: frames.length ? tipped / frames.length : 0,
      work: work.kinds([[from, to]], frames.length),
      missedWork: work.kinds(missed.map((frame) => [frame.at - frame.ms, frame.at]), missed.length),
      browserWork: perSecond(work.browser(from, to), frames),
      gpu: gpuIn(gpu, from, to),
      drawn: drawnIn(draws, from, to),
      painted: paintedIn(paints, from, to, frames.length, names),
      seconds: bySecond(frames, from, to, work.browser, gpu),
      js: work.js(from, to, frames.length),
    };
  });
}

/** Each phase the scenario marked, with its frames and the time it covers: from its mark to its last frame, the next
 *  phase's mark or the recording's end at the latest. */
function phaseSpans(record) {
  const phases = record.phases ?? [];
  return phases.map((phase, index) => {
    const end = phases[index + 1]?.at ?? Infinity;
    const frames = record.frames.filter((frame) => frame.at > phase.at && frame.at <= end);
    const last = frames.length ? frames[frames.length - 1].at : phase.at;
    return { phase, frames, from: phase.at, to: Math.min(end, last) };
  });
}

/** The quietest phase (the least of the browser's work for its length): its name, and its work a ms of its time,
 *  each kind's (`workTotals`) and the browser's in all. What a change of the page's look brought is counted over it;
 *  without phases, over nothing. */
function quietOf(spans, placed) {
  const timed = spans.filter((span) => span.to > span.from);
  if (timed.length === 0) return { name: null, kinds: new Map(), browser: 0 };
  const rate = (span) => browserWorkIn(placed, span.from, span.to) / (span.to - span.from);
  const quiet = timed.reduce((least, span) => (rate(span) < rate(least) ? span : least));
  const length = quiet.to - quiet.from;
  const totals = workTotals(placed, [[quiet.from, quiet.to]]);
  const kinds = new Map([...totals].map(([key, ms]) => [key, ms / length]));
  return { name: quiet.phase.name, kinds, browser: rate(quiet) };
}

/** `total` ms of work as ms a second of `frames`' time. */
function perSecond(total, frames) {
  const seconds = frames.reduce((sum, frame) => sum + frame.ms, 0) / 1000;
  return seconds > 0 ? total / seconds : 0;
}

/** The screen's refresh (ms): the fastest phase's median frame, or all the frames' without phases. */
function refreshOf(phaseFrames, all) {
  const medians = phaseFrames
    .filter((frames) => frames.length > 0)
    .map((frames) => frameSummary(frames).median);
  return medians.length ? Math.min(...medians) : frameSummary(all).median;
}

/** Those of `frames` that took `MISSED_SHARE` times the screen's refresh or longer. */
function missedOf(frames, refresh) {
  if (refresh <= 0) return [];
  return frames.filter((frame) => frame.ms >= refresh * MISSED_SHARE);
}

/**
 * The trace put on the page's clock (`record`'s, at `mark`): the mark's event, its tasks, the work placed
 * (`placedWork`), the JS sampled (`sourceOf` naming the page's functions) and Skia's program links, each with the
 * tasks it was built in.
 */
function onPage(record, events, mark, sourceOf) {
  const clock = clockOf(events, mark, record);
  const stamp = clock?.stamp ?? null;
  const names = threadNames(events);
  const tasks = events.filter((event) => event.ph === 'X');
  const toPage = (ts) => (clock === null ? null : onPageClock(ts, clock.stamp.ts, clock.at));
  const links = tasks
    .filter((event) => event.name === 'driver_link_program')
    .map((link) => ({
      at: toPage(link.ts),
      ms: link.dur / 1000,
      thread: threadOf(link, names),
      heldIn: heldIn(link, tasks),
    }));
  const placed = placedWork(selfTimes(tasks), toPage, names);
  const draws = events
    .filter((event) => event.ph === 'D')
    .map((draw) => ({ kind: draw.kind, material: draw.material, at: toPage(draw.ts) }))
    .filter((draw) => draw.at !== null);
  const paints = events
    .filter((event) => event.ph === 'P')
    .map((paint) => ({ node: paint.node, at: toPage(paint.ts) }))
    .filter((paint) => paint.at !== null);
  const samples = jsSamples(events, toPage, names, sourceOf);
  const dawn = events
    .filter((event) => event.ph === 'W')
    .map((work) => ({ name: work.name, ms: work.dur / 1000, at: toPage(work.ts) }))
    .filter((work) => work.at !== null);
  return { stamp, tasks, names, toPage, placed, samples, links, draws, paints, dawn };
}

/**
 * The findings of one measure: `record` is the page's (`page.mjs` `stopRecording`), `events` the trace's kept events
 * and `mark` the page's mark in them; `sourceOf` names the page's functions where its JS was sampled
 * (`sourceMap.mjs` `sourcesOf`), `painted` the elements it painted by their node ids (`stalls.mjs` `paintedNames`),
 * `under` a function whose time the whole measure's JS breaks down by what it calls (`--js-under`).
 */
export function analyze(record, events, mark, listedMs = LISTED_MS, sourceOf = () => null, painted = new Map(),
  under = null) {
  const traced = onPage(record, events, mark, sourceOf);
  const { stamp, tasks, names, toPage, placed, samples, links, draws, paints } = traced;
  const markTs = stamp?.ts ?? null;
  const inRecording = links.filter((link) => link.at === null || link.at >= record.start);
  const stalls = record.frames
    .filter((frame) => frame.ms >= listedMs)
    .map((frame) => {
      const from = frame.at - frame.ms;
      const built = inRecording.filter((link) => link.at !== null && link.at + link.ms >= from && link.at <= frame.at);
      return {
        at: (frame.at - record.start) / 1000,
        ms: frame.ms,
        built,
        busy: busyIn(tasks, from, frame.at, toPage, names),
        work: workIn(placed, [[from, frame.at]], 1).slice(0, STALL_WORK_SHOWN),
        // (a phase's JS is a frame's mean, where one stall's is lost among the frames round it)
        js: samples.length ? jsIn(samples, from, frame.at, 1) : null,
        changes: changesBetween(record.changes, from - CHANGES_BEFORE_MS, from + 20),
      };
    });
  const spans = phaseSpans(record);
  const refresh = refreshOf(spans.map(({ frames }) => frames), record.frames);
  // (the whole measure's JS a frame, for a scenario of no phases: the lobby stood in, a fight)
  const end = record.frames.length ? record.frames[record.frames.length - 1].at : record.start;
  const counted = samples.length && record.frames.length;
  const js = counted ? jsIn(samples, record.start, end, record.frames.length) : null;
  if (js && under) js.under = { name: under, calls: jsUnder(samples, record.start, end, record.frames.length, under) };
  const built = inRecording.map((link) => ({
    ...link,
    at: link.at === null ? null : (link.at - record.start) / 1000,
    changes: link.at === null ? []
      : changesBetween(record.changes, link.at - CHANGES_BEFORE_LINK_MS, link.at, CHANGES_SHOWN_FOR_LINK),
  }));
  return {
    clockFound: markTs !== null,
    others: stamp ? othersWork(placed, stamp.pid, record.start) : { ms: 0, most: [] },
    built,
    frames: frameSummary(record.frames),
    js,
    phases: phaseSummaries(spans, refresh, {
      kinds: (kept, count) => workIn(placed, kept, count),
      browser: (from, to) => browserWorkIn(placed, from, to),
      js: (from, to, count) => (samples.length ? jsIn(samples, from, to, count) : null),
    }, record.gpu ?? [], draws, paints, painted),
    programs: {
      count: inRecording.length,
      total: inRecording.reduce((sum, link) => sum + link.ms, 0),
      longest: Math.max(0, ...inRecording.map((link) => link.ms)),
    },
    listedMs,
    stalls,
    looks: looksChanged(record, placed, quietOf(spans, placed), refresh),
  };
}

/**
 * The changes of the page's look: the changes to its HTML made at once (the observer's one call: a script's in one
 * task), the earliest first, each with when, how many and which, its kind (the change it made most, as the page was
 * after it: `div.sitem.match` the stash's items lit) and the time after it that is its own (to the next,
 * `LOOK_SPAN_MS` at most). One change of a class can be the costliest: #269's `slot-focus` on the menu dimmed
 * every item at once.
 */
function looksOf(changes) {
  const byMoment = new Map();
  for (const change of changes) {
    if (!byMoment.has(change.at)) byMoment.set(change.at, []);
    byMoment.get(change.at).push(change);
  }
  const moments = [...byMoment].sort((a, b) => a[0] - b[0]);
  return moments.map(([at, made], index) => ({
    at,
    count: made.length,
    changes: made,
    kind: changesBetween(made, -Infinity, Infinity, 1)[0].replace(/^\d+ x /, ''),
    span: [at, Math.min(at + LOOK_SPAN_MS, moments[index + 1]?.[0] ?? Infinity)],
  }));
}

/**
 * The changes of the page's look by kind (`looksOf`), the costliest in all first: what one change of each brought,
 * the work in the time after it less the quiet phase's (`quietOf`) in as long, and the share of the frames in that
 * time that missed the screen's `refresh`. The time after a change holds a phase's frames too (the game's, the
 * tooltip's, a loop's); what the quiet phase spends on those, it takes out. #269's sweep across the stash read 140 to
 * 200 ms of work after each change of its focus, most of it the game's own frames, and 40 to 90 ms over them.
 */
function looksChanged(record, placed, quiet, refresh) {
  const kinds = new Map();
  for (const look of looksOf(record.changes)) {
    if (!kinds.has(look.kind)) kinds.set(look.kind, []);
    kinds.get(look.kind).push(look);
  }
  return [...kinds.values()]
    .map((made) => lookChanged(made, placed, quiet))
    .map((look) => ({ ...look, missedShare: missedShareIn(record.frames, look.spans, refresh) }))
    .sort((a, b) => b.browserWork * b.count - a.browserWork * a.count)
    .slice(0, LOOKS_SHOWN)
    .map(({ spans, ...look }) => look);
}

/** What the changes `made` (one kind's, `looksOf`) brought: how many, of how many changes to the page's HTML each and
 *  which, the time after each (ms), the browser's work in it over the quiet phase's and each kind of work's, and the
 *  times (`spans`). */
function lookChanged(made, placed, quiet) {
  const spans = made.map((look) => look.span);
  const time = spans.reduce((sum, [from, to]) => sum + to - from, 0);
  const browser = spans.reduce((sum, [from, to]) => sum + browserWorkIn(placed, from, to), 0);
  const over = new Map();
  for (const [key, ms] of workTotals(placed, spans)) {
    const extra = ms - (quiet.kinds.get(key) ?? 0) * time;
    if (extra > 0) over.set(key, extra);
  }
  return {
    kind: made[0].kind,
    count: made.length,
    changes: made.reduce((sum, look) => sum + look.count, 0) / made.length,
    what: changesBetween(made.flatMap((look) => look.changes), -Infinity, Infinity, CHANGES_SHOWN_FOR_LINK),
    ms: time / made.length,
    over: quiet.name,
    browserWork: (browser - quiet.browser * time) / made.length,
    work: sharedWork(over, made.length),
    spans,
  };
}

/** The share of `frames` (the earliest first) ending in `spans` that missed the screen's `refresh`. */
function missedShareIn(frames, spans, refresh) {
  let count = 0;
  let missed = 0;
  for (const [from, to] of spans) {
    for (let index = firstFrom(frames, from); index < frames.length && frames[index].at < to; index++) {
      count += 1;
      if (refresh > 0 && frames[index].ms >= refresh * MISSED_SHARE) missed += 1;
    }
  }
  return count ? missed / count : 0;
}

/** The files a boot fetched (`page.mjs` `stopBootRecording`): how many, their bytes over the network (a cache's
 *  are none), those fetched after `revealed` (the lobby revealed, ms; null: never), and the largest, each with how
 *  long it took (null where its timing ends before it starts: a worker's script). */
function filesOf(files, revealed) {
  const later = revealed === null ? [] : files.filter((file) => file.at > revealed);
  const largest = [...files]
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, FILES_SHOWN)
    .map((file) => ({ name: file.name, bytes: file.bytes, ms: file.end >= file.at ? file.end - file.at : null }));
  return {
    count: files.length,
    bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    later: later.length,
    largest,
  };
}

/** The maps the game's workers made (null where none were timed: a build before they were): how many, and how many
 *  of them were read back from a visit before, from the first one's start to the last one's end (the page's ms),
 *  their work in all, how much of it was waiting for the store's answer (null where the build didn't say), the
 *  longest, and when the workers were asked for and their scripts ran (`workers`: the first asked, the first and
 *  last up; null where the build didn't say). */
function mapsOf(maps) {
  if (!maps.length) return null;
  const longest = [...maps]
    .sort((a, b) => b.ms - a.ms)
    .slice(0, MAPS_SHOWN)
    .map(({ name, ms }) => ({ name, ms }));
  const answered = maps.every((map) => typeof map.readMs === 'number');
  return {
    count: maps.length,
    kept: maps.filter((map) => map.kept).length,
    from: Math.min(...maps.map((map) => map.at)),
    to: Math.max(...maps.map((map) => map.at + map.ms)),
    ms: maps.reduce((sum, map) => sum + map.ms, 0),
    readMs: answered ? maps.reduce((sum, map) => sum + map.readMs, 0) : null,
    longest,
    workers: workersOf(maps),
  };
}

/** When the maps' workers were asked for and when their scripts ran (the page's ms), where every map says. */
function workersOf(maps) {
  if (!maps.every((map) => typeof map.asked === 'number' && typeof map.up === 'number')) return null;
  const ups = maps.map((map) => map.up);
  return { asked: Math.min(...maps.map((map) => map.asked)), upFrom: Math.min(...ups), upTo: Math.max(...ups) };
}

/** The device's marks of a slow exit (`page.mjs` `bootRecording`): the slow launches in a row, and a build before's
 *  switch, which turned the blow off for good on one. */
const markedSlow = (marks) => marks.slow >= SLOW_LAUNCHES || marks.off;

/** How the loading screen left (null where the record has none): `blown` (the logo blown away in full), `cut` (the
 *  watchdog cut it short and marked the launch slow, or switched the blow off for good: `forGood`, a build before's)
 *  or `plain` (a plain fade), and whether the device was marked slow before (the plain fade's reason: else reduced
 *  motion, low graphics or the exit not ready in time). */
function exitOf(exit) {
  if (!exit?.kind) return null;
  const { before, after } = exit;
  const forGood = after.off && !before.off;
  const cut = exit.kind === 'blown' && (after.slow > before.slow || forGood);
  return { kind: cut ? 'cut' : exit.kind, markedSlow: markedSlow(before), slowAfter: after.slow, forGood };
}

/** the lobby's frames are counted as the performance overlay counts them (`ui/perfHud.ts`): those of the second up
 *  to a moment, every `LOBBY_STEP_MS` from a second after the reveal; a second with this share of the screen's
 *  refresh or more is smooth. The screen's refresh is the fastest median frame of a step of `REFRESH_FRAMES` or
 *  more (a step of a frame or two, its median one interval, would say anything). */
const LOBBY_SECOND_MS = 1000;
const LOBBY_STEP_MS = 250;
const SMOOTH_SHARE = 0.9;
const REFRESH_FRAMES = 30;

/**
 * The lobby's frames a second from its reveal to `end` (Start pressed, or the recording's end), as the performance
 * overlay counts them, each second's up to every `LOBBY_STEP_MS` (`at`: ms after the reveal); the fewest of them, the
 * screen's rate (`refresh`, ms a frame) and how long after the reveal its last second short of `SMOOTH_SHARE` of that
 * rate ended (0: none was; null: the last was), and what the threads and the page's JS (where sampled) spent the
 * fewest's second on (`traced`'s). Null where the lobby never revealed or was watched under a second. The owner read
 * 17 off the overlay as a return's lobby warmed the fight's programs behind it.
 */
function lobbyRateOf(frames, revealed, end, refresh, traced) {
  if (revealed === null || end - revealed < LOBBY_SECOND_MS) return null;
  const seconds = [];
  for (let to = revealed + LOBBY_SECOND_MS; to <= end; to += LOBBY_STEP_MS) {
    const count = frames.filter((frame) => frame.at > to - LOBBY_SECOND_MS && frame.at <= to).length;
    seconds.push({ at: to - revealed, count });
  }
  const fewest = seconds.reduce((low, second) => (second.count < low.count ? second : low));
  const screenRate = 1000 / refresh;
  const rough = seconds.filter((second) => second.count < screenRate * SMOOTH_SHARE);
  const lastRough = rough[rough.length - 1];
  const roughTill = lastRough === undefined ? 0 : lastRough === seconds[seconds.length - 1] ? null : lastRough.at;
  const to = revealed + fewest.at;
  const from = to - LOBBY_SECOND_MS;
  const work = sharedWork(workTotals(traced.placed, [[from, to]]), 1).slice(0, BOOT_WORK_SHOWN);
  const js = traced.samples.length ? jsIn(traced.samples, from, to, 1) : null;
  return { seconds, fewest, screenRate, roughTill, work, js };
}

/** The screen's refresh (ms) in a boot's `steps`: the fastest median frame of those with `REFRESH_FRAMES` or more
 *  (null: none has). */
function bootRefresh(steps) {
  const medians = steps.filter((step) => step.frames.count >= REFRESH_FRAMES).map((step) => step.frames.median);
  return medians.length ? Math.min(...medians) : null;
}

/** The most of `runs` (each `at` to `end`) under way at once. */
function mostAtOnce(runs) {
  const edges = runs.flatMap((run) => [{ at: run.at, change: 1 }, { at: run.end, change: -1 }]);
  // (one ending as another starts isn't both at once)
  edges.sort((a, b) => a.at - b.at || a.change - b.change);
  let open = 0;
  let most = 0;
  for (const { change } of edges) {
    open += change;
    most = Math.max(most, open);
  }
  return most;
}

/** How many of `runs` (each `at` to `end`) were under way on average in each `GPU_STEP_MS` from `from` to `to`. */
function atOnceBySteps(runs, from, to) {
  const steps = [];
  for (let start = from; start < to; start += GPU_STEP_MS) {
    const end = Math.min(start + GPU_STEP_MS, to);
    const busy = runs.reduce((sum, run) => sum + Math.max(0, Math.min(run.end, end) - Math.max(run.at, start)), 0);
    steps.push(busy / (end - start));
  }
  return steps;
}

/**
 * The GPU process's compiles that started in `[from, to)` (the page's ms; ANGLE's tasks on its pool): how many of
 * the pool's threads ran them, how many on average over the span (their time over its length), the most at once,
 * and how many on average in each `GPU_STEP_MS` of it. Whether a wait for links is bound by the threads (as many
 * busy as ran any, all the while) or by the work handed to them (a burst, then a few). Null where none ran.
 */
function gpuCompilesIn(placed, from, to) {
  const runs = [];
  for (let index = firstFrom(placed, from); index < placed.length && placed[index].at < to; index++) {
    const { task, at } = placed[index];
    if (shortName(task.name) !== GPU_COMPILE) continue;
    runs.push({ at, end: at + task.dur / 1000, thread: `${task.pid}:${task.tid}` });
  }
  if (!runs.length) return null;
  const busy = runs.reduce((sum, run) => sum + (run.end - run.at), 0);
  return {
    threads: new Set(runs.map((run) => run.thread)).size,
    mean: busy / (to - from),
    most: mostAtOnce(runs),
    steps: atOnceBySteps(runs, from, to),
  };
}

/** Dawn's work that started in the page's `[from, to)` (`--dawn`), by its name: how many and how long in all, the
 *  longest first, `WORK_SHOWN` kinds of it. Whether its cache was read (a shader or pipeline's blob) or its
 *  compiles run (Tint's, DXC's). Null where none was traced. */
function dawnIn(dawn, from, to) {
  const byName = new Map();
  for (const work of dawn) {
    if (work.at < from || work.at >= to) continue;
    const kind = byName.get(work.name) ?? { name: work.name, count: 0, ms: 0 };
    kind.count++;
    kind.ms += work.ms;
    byName.set(work.name, kind);
  }
  if (!byName.size) return null;
  return [...byName.values()].sort((a, b) => b.ms - a.ms).slice(0, WORK_SHOWN);
}

/** A boot's step from `from` to `to` (the page's ms): its frames' summary (the longest the page was held up in it,
 *  `worst`), its long tasks and Skia program links, and what the threads spent its time on in all, the GPU
 *  process's main thread apart, and the threads its compiles ran on (`gpuCompilesIn`). */
function bootStep(name, from, to, record, traced) {
  const frames = record.frames.filter((frame) => frame.at > from && frame.at <= to);
  const tasks = record.longTasks.filter((task) => task.at >= from && task.at < to);
  const links = traced.links.filter((link) => link.at !== null && link.at >= from && link.at < to);
  const totals = workTotals(traced.placed, [[from, to]]);
  const onGpuMain = new Map([...totals].filter(([key]) => key.endsWith(`\n${GPU_MAIN}`)));
  return {
    name,
    from,
    ms: to - from,
    frames: frameSummary(frames),
    longTasks: {
      count: tasks.length,
      ms: tasks.reduce((sum, task) => sum + task.ms, 0),
      longest: Math.max(0, ...tasks.map((task) => task.ms)),
    },
    programs: { count: links.length, ms: links.reduce((sum, link) => sum + link.ms, 0) },
    links: links.map(({ ms, thread, heldIn }) => ({ ms, thread, heldIn })),
    work: sharedWork(totals, 1).slice(0, BOOT_WORK_SHOWN),
    gpuMain: sharedWork(onGpuMain, 1).slice(0, BOOT_WORK_SHOWN),
    gpuCompiles: gpuCompilesIn(traced.placed, from, to),
    dawn: dawnIn(traced.dawn, from, to),
    js: traced.samples.length ? jsIn(traced.samples, from, to, 1) : null,
  };
}

/**
 * The findings of a boot: `record` is the page's (`page.mjs` `stopBootRecording`), `events` the trace's and `mark`
 * the page's mark in them. Each step (a phase of the record) from its start to the next's, the last's to the
 * recording's end (`bootStep`); when the lobby was revealed (`revealedAt`, ms from the navigation's start; null if
 * never) and the page first painted with content (`painted`); the files fetched (`filesOf`); how the loading screen
 * left (`exitOf`) and when it was gone (`goneAt`); the lobby's frames a second till Start was pressed
 * (`lobbyRateOf`). `sourceOf` names the page's functions where its JS was sampled.
 */
export function analyzeBoot(record, events, mark, sourceOf = () => null) {
  const traced = onPage(record, events, mark, sourceOf);
  const end = record.frames.length ? record.frames[record.frames.length - 1].at : record.start;
  const steps = record.phases.map((phase, index) => {
    const to = record.phases[index + 1]?.at ?? end;
    return bootStep(phase.name, phase.at, to, record, traced);
  });
  const revealedAt = record.phases.find((phase) => phase.name === REVEALED)?.at ?? null;
  const refresh = bootRefresh(steps);
  const lobbyEnd = record.pressed ?? end;
  return {
    lobby: refresh === null ? null : lobbyRateOf(record.frames, revealedAt, lobbyEnd, refresh, traced),
    clockFound: traced.stamp !== null,
    steps,
    revealedAt,
    painted: record.paint['first-contentful-paint'] ?? null,
    files: filesOf(record.files, revealedAt),
    maps: mapsOf(record.maps ?? []),
    exit: exitOf(record.exit),
    goneAt: record.goneAt ?? null,
    warmAt: record.warm ?? null,
    pressedAt: record.pressed ?? null,
    warmUps: record.warmUps ?? [],
  };
}
