// The page's JS as V8's sampling profiler saw it (tools/stalls `--js`): the trace's profile chunks put together into
// samples on the page's main thread, each on the page's clock with its stack, and a phase's summed by function: each
// one's own time and its time with what it calls, a frame's. The game's own frame is most of a lobby's main thread
// (#269: 4.7 ms of JS a frame at 144 Hz, where a frame is 6.9), and the trace's tasks say only `FunctionCall`.

/** V8's nodes that are no function of the page's: the thread idle, the browser's work outside JS, the root */
const NOT_JS = new Set(['(idle)', '(program)', '(root)']);
/** the most functions listed a phase by their own time, and by their time with what they call (the first few of
 *  which are the frame's own spine: the loop, the render, three's) */
const OWN_SHOWN = 12;
const WITHIN_SHOWN = 24;

/** A function's name as it's listed: its own, and where it's written (`sourceOf`: the source map's), else the
 *  script's file and line (the trace leaves out a place it hasn't: V8's own code, a native function's). */
function nameOf(callFrame, sourceOf) {
  const { functionName, url = '', lineNumber = -1, columnNumber = 0 } = callFrame;
  const name = functionName || '(anonymous)';
  if (NOT_JS.has(name) || name === '(garbage collector)') return name;
  const place = sourceOf(url, lineNumber, columnNumber);
  if (place) return `${name} ${place.source}:${place.line}`;
  if (!url) return name;
  const file = url.split('/').pop().replace(/\?.*$/, '') || '?';
  return `${name} ${file}:${lineNumber + 1}`;
}

/** The trace's profiles by `pid:id`: each its thread (the `Profile` event's), start (trace µs), nodes by id, and its
 *  chunks' samples and time deltas in order. */
function profilesOf(events) {
  const profiles = new Map();
  const profileOf = (event) => {
    const key = `${event.pid}:${event.id}`;
    if (!profiles.has(key)) profiles.set(key, { thread: null, start: 0, nodes: new Map(), samples: [], deltas: [] });
    return profiles.get(key);
  };
  for (const event of events) {
    if (event.ph !== 'P') continue;
    const profile = profileOf(event);
    const data = event.args?.data ?? {};
    if (event.name === 'Profile') {
      profile.thread = `${event.pid}:${event.tid}`;
      profile.start = data.startTime ?? event.ts;
      continue;
    }
    for (const node of data.cpuProfile?.nodes ?? []) profile.nodes.set(node.id, node);
    profile.samples.push(...(data.cpuProfile?.samples ?? []));
    profile.deltas.push(...(data.timeDeltas ?? []));
  }
  return profiles;
}

/** Each node's stack by id, the node first and the root last, by `nameOf`. */
function stacksOf(nodes, sourceOf) {
  const stacks = new Map();
  const stackOf = (id) => {
    if (stacks.has(id)) return stacks.get(id);
    const node = nodes.get(id);
    if (!node) return [];
    const stack = [nameOf(node.callFrame, sourceOf), ...(node.parent ? stackOf(node.parent) : [])];
    stacks.set(id, stack);
    return stack;
  };
  for (const id of nodes.keys()) stackOf(id);
  return stacks;
}

/**
 * The page's JS samples: those on its renderer's main thread (`names`' `... CrRendererMain`), each with its time on
 * the page's clock (`toPage` of trace µs), how long it stands for (to the next sample, ms) and its stack (the running
 * function first), V8's own nodes out (an idle thread's, the browser's work). `sourceOf` names the functions.
 */
export function jsSamples(events, toPage, names, sourceOf) {
  const samples = [];
  for (const profile of profilesOf(events).values()) {
    if (!profile.thread || !names.get(profile.thread)?.endsWith('CrRendererMain')) continue;
    const stacks = stacksOf(profile.nodes, sourceOf);
    const times = [];
    let ts = profile.start;
    for (const delta of profile.deltas) {
      ts += delta;
      times.push(ts);
    }
    profile.samples.forEach((id, index) => {
      const stack = (stacks.get(id) ?? []).filter((name) => !NOT_JS.has(name));
      const next = times[index + 1];
      const at = toPage(times[index]);
      if (stack.length === 0 || next === undefined || at === null) return;
      samples.push({ at, ms: (next - times[index]) / 1000, stack });
    });
  }
  return samples.sort((a, b) => a.at - b.at);
}

/** `totals` (ms by name) as a list shared out `count` ways, the most first, `shown` of them. */
function listed(totals, count, shown) {
  return [...totals]
    .sort((a, b) => b[1] - a[1])
    .slice(0, shown)
    .map(([name, ms]) => ({ name, ms: count ? ms / count : 0 }));
}

/** What the page's JS spent `count` frames' time on in `[from, to)` of the page's clock, by function: each one's own
 *  time (`own`: running it) and its time with what it calls (`within`: on the stack), the most first. */
export function jsIn(samples, from, to, count) {
  const own = new Map();
  const within = new Map();
  for (const { at, ms, stack } of samples) {
    if (at < from || at >= to) continue;
    own.set(stack[0], (own.get(stack[0]) ?? 0) + ms);
    for (const name of new Set(stack)) within.set(name, (within.get(name) ?? 0) + ms);
  }
  return { own: listed(own, count, OWN_SHOWN), within: listed(within, count, WITHIN_SHOWN) };
}

/** Whether a listed function's name (`nameOf`: its own, then where it's written) is `wanted`'s. */
const namedAs = (name, wanted) => name === wanted || name.startsWith(`${wanted} `);

/** What `under` (a function's name, as listed or its own alone) spent `count` frames' time on in `[from, to)` of the
 *  page's clock: each function it calls with what that calls, and its own time, the most first (`--js-under`). Where
 *  it runs inside itself, from its innermost call: three draws the post chain's quad by the same function as each
 *  object of the scene, the scene's pass run inside it. */
export function jsUnder(samples, from, to, count, under) {
  const beneath = new Map();
  for (const { at, ms, stack } of samples) {
    if (at < from || at >= to) continue;
    const innermost = stack.findIndex((name) => namedAs(name, under));
    if (innermost < 0) continue;
    const callee = innermost === 0 ? '(its own)' : stack[innermost - 1];
    beneath.set(callee, (beneath.get(callee) ?? 0) + ms);
  }
  return listed(beneath, count, WITHIN_SHOWN);
}
