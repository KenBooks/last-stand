// Where a command's time goes in the page (tools/lab, `--profile`): the browser's sampling profiler run round it,
// and the functions it found busiest, by their own time and by the time spent in them and what they called, each at
// its line in the source (the page runs the modules as Vite compiled them; sourceMaps.mjs traces them back).

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { OUT, REPO } from './paths.mjs';

/** where a command's profile is kept whole */
const KEPT = join(OUT, 'profile');

/**
 * `profile` kept whole as `out/profile/<command>-<side>.cpuprofile`, every sample with its time (the summary adds
 * them up over the whole run, and a slow stretch of half a second is lost in it): DevTools' Performance panel loads
 * the file. Returns its path from the repo.
 */
export function keepProfile(command, side, profile) {
  mkdirSync(KEPT, { recursive: true });
  const name = `${command}-${side}`.replace(/[^a-z0-9-]+/gi, '-');
  const file = join(KEPT, `${name}.cpuprofile`);
  writeFileSync(file, JSON.stringify(profile));
  return relative(REPO, file);
}

/** the profiler's sampling interval, µs */
const SAMPLING_US = 200;
/** how many functions each list shows */
const SHOWN = 14;

/**
 * Runs `work` with the page's sampling profiler on; resolves with what `work` returned and the profile (the
 * DevTools protocol's `Profiler.Profile`).
 */
export async function profiled(page, work) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: SAMPLING_US });
  await cdp.send('Profiler.start');
  let result;
  let profile;
  try {
    result = await work();
  } finally {
    ({ profile } = await cdp.send('Profiler.stop'));
    await cdp.detach().catch(() => {});
  }
  return { result, profile };
}

/** The addresses of the scripts a profile's functions are in. */
export function scriptsIn(profile) {
  return [...new Set(profile.nodes.map((node) => node.callFrame.url).filter(Boolean))];
}

/** a script's file name, from its address or its path */
const fileName = (address) => address.replace(/[?#].*$/, '').split(/[\\/]/).pop();

/**
 * A function's name and place, as the lists show it (`bake geometry.ts:212`): its file and line in the source when
 * `sourceOf(url, line, column)` knows them (`{ file, line }`, lines from 0), else where it ran.
 */
function placeOf(callFrame, sourceOf) {
  const name = callFrame.functionName || '(anonymous)';
  const found = sourceOf(callFrame.url, callFrame.lineNumber, callFrame.columnNumber);
  const file = fileName(found?.file ?? callFrame.url) || '(native)';
  return `${name} ${file}:${(found?.line ?? callFrame.lineNumber) + 1}`;
}

/** the frames the profiler stands for no function of the page's */
const IDLE = new Set(['(idle) (native):0', '(program) (native):0', '(root) (native):0']);

/** Whether a function's place (`animate ranger.ts:775`) is the one `wanted` names: its name, or its name and file. */
function isNamed(place, wanted) {
  return place === wanted || place.startsWith(`${wanted} `) || place.startsWith(`${wanted}:`);
}

/**
 * A sample's stack as places, from the function it was in out to the root; with `within`, only up to the outermost
 * function `within` names (null when it isn't in the stack), so a function that calls itself is counted once.
 */
function stackOf(id, nodes, parentOf, sourceOf, within) {
  const places = [];
  let end = within ? -1 : Infinity;
  for (let at = id; at !== undefined; at = parentOf.get(at)) {
    const place = placeOf(nodes.get(at).callFrame, sourceOf);
    places.push(place);
    if (within && isNamed(place, within)) end = places.length;
  }
  return end < 0 ? null : places.slice(0, end);
}

/**
 * The profile's busiest functions: by self time, and by total time (each function once per sample's stack), each
 * placed by `sourceOf` (see `placeOf`; by where it ran when not given). With `within` (a function's name, or its
 * name and file: `animate ranger.ts`), only the time in that function, with its shares of it.
 */
export function summarize(profile, sourceOf = () => null, within = null) {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const parentOf = new Map();
  for (const node of profile.nodes) {
    for (const child of node.children ?? []) parentOf.set(child, node.id);
  }
  const self = new Map();
  const total = new Map();
  let sampled = 0;
  let counted = 0;
  profile.samples.forEach((id, index) => {
    const ms = (profile.timeDeltas[index] ?? 0) / 1000;
    sampled += ms;
    const stack = stackOf(id, nodes, parentOf, sourceOf, within);
    if (!stack) return;
    counted += ms;
    self.set(stack[0], (self.get(stack[0]) ?? 0) + ms);
    for (const place of new Set(stack)) total.set(place, (total.get(place) ?? 0) + ms);
  });
  const row = ([place, ms]) => {
    const share = (ms / counted * 100).toFixed(1).padStart(5);
    return `  ${share} %  ${ms.toFixed(0).padStart(6)} ms  ${place}`;
  };
  const busiest = (times) => [...times]
    .filter(([place]) => !IDLE.has(place))
    .sort((a, b) => b[1] - a[1])
    .slice(0, SHOWN)
    .map(row);
  const head = within
    ? `profile: ${counted.toFixed(0)} ms in ${within}, ${(counted / sampled * 100).toFixed(1)} % of `
      + `${sampled.toFixed(0)} ms sampled`
    : `profile: ${sampled.toFixed(0)} ms sampled`;
  if (within && counted === 0) return `${head}: no function ${within} ran`;
  return [head, 'by own time', ...busiest(self), 'by total time (with what it called)', ...busiest(total)].join('\n');
}
