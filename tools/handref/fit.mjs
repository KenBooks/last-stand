// The game's fist fitted to the reference by its tunables: each in turn is stepped up and down, the hand sculpted
// again for each try (in processes side by side) and laid over the reference, and the steps that bring it closer are
// kept; the steps halve when none does. What it ends on is what the sculpt can reach by its settings alone.
//   node tools/handref/fit.mjs <reference.json> [--rounds 8] [--start "name.field=v;..."] [--views back,knuckles]
//     [--hold fistShape.strike,...]
// Run `npm run handref` first: it bundles the sculpt this runs (`out/ourHand.mjs`).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lowerPriority } from '../lab/node/priority.mjs';
import { VIEWS, draw, drawnSmall, fitted, likeness, readHand } from './studio.mjs';

const run = promisify(execFile);
const OUT = 'tools/handref/out';
const BUNDLE = `${OUT}/ourHand.mjs`;
/** how many sculpts run side by side */
const SIDE_BY_SIDE = 6;
/** the numbers fitted, each `name.field` or `name.field[i]`, with its first step */
const FITTED = {
  'fistShape.strike': 4,
  'fistShape.shift[0]': 0.003,
  'fistShape.shift[1]': 0.003,
  'shutShape.square': 0.25,
  'shutShape.fat': 0.3,
  'shutShape.head': 0.15,
  'shutShape.headOut': 0.002,
  'shutFill.curl': 0.1,
  'shutShape.web': 0.15,
  'shutShape.webOut': 0.002,
  'shutShape.webDown': 0.003,
};
/** each fitted number as the game has it */
const START = {
  'fistShape.strike': 86,
  'fistShape.shift[0]': 0,
  'fistShape.shift[1]': 0,
  'shutShape.square': 0.5,
  'shutShape.fat': 1,
  'shutShape.head': 0.8,
  'shutShape.headOut': 0,
  'shutFill.curl': 0.8,
  'shutShape.web': 0.55,
  'shutShape.webOut': 0.001,
  'shutShape.webDown': -0.002,
};

/** The command line's value after `--name`, or `fallback`. */
function option(name, fallback) {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : fallback;
}

/** The fitted numbers as the sculpt's `--tune` takes them: a list's numbers gathered into one assignment. */
function tuneOf(values) {
  const lists = new Map();
  const plain = [];
  for (const [path, value] of Object.entries(values)) {
    const listed = /^(.*)\[(\d+)\]$/.exec(path);
    if (!listed) plain.push(`${path}=${value}`);
    else lists.set(listed[1], Object.assign(lists.get(listed[1]) ?? [], { [Number(listed[2])]: value }));
  }
  for (const [path, list] of lists) plain.push(`${path}=${list.join(',')}`);
  return plain.join(';');
}

/** The hand sculpted with `values`, read back. */
async function sculpted(values, tag) {
  await run('node', [BUNDLE, '--build', 'heavy', '--tune', tuneOf(values), '--tag', tag]);
  return readHand(`${OUT}/ours-heavy-shut-${tag}.json`);
}

/** `jobs` (functions returning promises) run a few at a time, their results in order. */
async function pooled(jobs) {
  const results = new Array(jobs.length);
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const mine = next++;
      results[mine] = await jobs[mine]();
    }
  };
  await Promise.all(Array.from({ length: SIDE_BY_SIDE }, worker));
  return results;
}

/** How like the reference a hand is in the views fitted, laid over it from `from`: `{ score, at }`. */
function scored(reference, hand, from, views) {
  const fit = fitted(reference.small, hand, from, from ? 2 : undefined);
  const drawn = views.map((view) => draw(fit.hand, view, reference.size));
  return { score: likeness(reference.drawn, drawn), at: fit.at };
}

async function main() {
  lowerPriority();
  const referenceHand = readHand(process.argv[2]);
  const views = option('views', Object.keys(VIEWS).join(',')).split(',');
  const size = 96;
  const reference = {
    small: drawnSmall(referenceHand),
    drawn: views.map((view) => draw(referenceHand, view, size)),
    size,
  };
  const values = { ...START };
  for (const each of option('start', '').split(';').filter(Boolean)) {
    const [path, value] = each.split('=');
    values[path] = Number(value);
  }
  const steps = { ...FITTED };
  // (`--hold a,b`: numbers kept as they start)
  for (const held of option('hold', '').split(',').filter(Boolean)) delete steps[held];
  let best = scored(reference, await sculpted(values, 'fit'), null, views);
  console.log(`start: likeness ${best.score.toFixed(4)}`);
  const rounds = Number(option('rounds', '8'));
  for (let round = 0; round < rounds; round++) {
    const tries = Object.keys(steps).flatMap((path) => [1, -1].map((way) => ({ path, way })));
    const hands = await pooled(tries.map((each, i) => () => {
      const tried = { ...values, [each.path]: values[each.path] + each.way * steps[each.path] };
      return sculpted(tried, `fit${i}`);
    }));
    const gains = tries
      .map((each, i) => ({ ...each, ...scored(reference, hands[i], best.at, views) }))
      .filter((each) => each.score > best.score)
      .sort((a, b) => b.score - a.score);
    if (!gains.length) {
      for (const path of Object.keys(steps)) steps[path] /= 2;
      console.log(`round ${round + 1}: no gain, steps halved`);
      continue;
    }
    // (every gaining step taken together if together they gain more than the best alone)
    const together = { ...values };
    const taken = new Set();
    for (const gain of gains) {
      if (taken.has(gain.path)) continue;
      taken.add(gain.path);
      together[gain.path] = values[gain.path] + gain.way * steps[gain.path];
    }
    const all = scored(reference, await sculpted(together, 'fit'), best.at, views);
    if (all.score > gains[0].score) {
      Object.assign(values, together);
      best = all;
    } else {
      values[gains[0].path] += gains[0].way * steps[gains[0].path];
      best = { score: gains[0].score, at: gains[0].at };
    }
    console.log(`round ${round + 1}: likeness ${best.score.toFixed(4)}  ${tuneOf(values)}`);
  }
  await sculpted(values, 'fitted');
  console.log(`fitted: likeness ${best.score.toFixed(4)}`);
  console.log(`--tune "${tuneOf(values)}"`);
  console.log(`${OUT}/ours-heavy-shut-fitted.json`);
}

await main();
