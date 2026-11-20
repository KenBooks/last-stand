// Where a command's time went (node/profile.mjs): a sampled profile summarized.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { longestStretches, summarize } from '../node/profile.mjs';

const frame = (functionName, url, lineNumber) => ({ functionName, url, lineNumber });

/** root → run → (bake, raycast); bake calls itself once */
const PROFILE = {
  nodes: [
    { id: 1, callFrame: frame('(root)', '', -1), children: [2] },
    { id: 2, callFrame: frame('run', 'http://localhost:5190/tools/lab/page/carry.ts?t=1', 9), children: [3, 4] },
    { id: 3, callFrame: frame('bake', 'http://localhost:5190/tools/lab/page/geometry.ts', 200), children: [5] },
    { id: 4, callFrame: frame('raycast', 'http://localhost:5190/node_modules/three.js', 10), children: [] },
    { id: 5, callFrame: frame('bake', 'http://localhost:5190/tools/lab/page/geometry.ts', 200), children: [] },
  ],
  samples: [3, 3, 5, 4, 2],
  timeDeltas: [1000, 1000, 1000, 1000, 1000],
};

test('own time and total time, each function once per sample', () => {
  const lines = summarize(PROFILE).split('\n');
  assert.equal(lines[0], 'profile: 5 ms sampled');
  const own = lines.slice(lines.indexOf('by own time') + 1, lines.indexOf('by total time (with what it called)'));
  assert.match(own[0], /60\.0 %\s+3 ms {2}bake geometry\.ts:201$/);
  const total = lines.slice(lines.indexOf('by total time (with what it called)') + 1);
  assert.match(total[0], /100\.0 %\s+5 ms {2}run carry\.ts:10$/);
  // (the recursive bake counted once in each of its three samples, not four times)
  assert.match(total[1], /60\.0 %\s+3 ms {2}bake geometry\.ts:201$/);
  assert.ok(!total.some((line) => line.includes('(root)')));
});

test('places each function by its source when the source maps know it', () => {
  const sourceOf = (url, line) => (url.includes('geometry.ts') ? { file: '/src/geometry.ts', line: line + 26 } : null);
  const lines = summarize(PROFILE, sourceOf).split('\n');
  assert.ok(lines.some((line) => line.endsWith('bake geometry.ts:227')));
  assert.ok(lines.some((line) => line.endsWith('raycast three.js:11')));
});

test('within a function: only its time, by its share of it', () => {
  const lines = summarize(PROFILE, () => null, 'bake').split('\n');
  assert.equal(lines[0], 'profile: 3 ms in bake, 60.0 % of 5 ms sampled');
  const total = lines.slice(lines.indexOf('by total time (with what it called)') + 1);
  // (the recursive bake once in each of its samples, and nothing outside it: not run, its caller)
  assert.match(total[0], /100\.0 %\s+3 ms {2}bake geometry\.ts:201$/);
  assert.equal(total.length, 1);
  assert.match(summarize(PROFILE, () => null, 'paint'), /no function paint ran$/);
});

/** root → (idle, warm → compile in three, the lab's step → the game's frame) */
const STRETCHED = {
  nodes: [
    { id: 1, callFrame: frame('(root)', '', -1), children: [2, 3, 5] },
    { id: 2, callFrame: frame('(idle)', '', -1), children: [] },
    { id: 3, callFrame: frame('warm', 'http://localhost:5190/src/game/warmup.ts', 40), children: [4] },
    { id: 4, callFrame: frame('compile', 'http://localhost:5190/tools/lab/out/vite/deps/three.js', 10), children: [] },
    { id: 5, callFrame: frame('step', 'http://localhost:5190/tools/lab/page/lab.ts', 70), children: [6] },
    { id: 6, callFrame: frame('frame', 'http://localhost:5190/src/main.ts', 1300), children: [] },
  ],
  // (a 30 ms stretch, idle, a 5 ms one, idle, a 25 ms one, then a 22 ms frame the lab stepped straight after it)
  samples: [4, 3, 4, 2, 3, 2, 4, 3, 6, 6],
  timeDeltas: [10000, 10000, 10000, 1000, 5000, 1000, 15000, 10000, 12000, 10000],
};

test("the longest busy stretches, longest first, each naming the game's functions in it", () => {
  const lines = longestStretches(STRETCHED);
  // (the 5 ms stretch is under the 20 said; three's compile and the lab's step aren't the game's)
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^\s+30 ms at 0\.01 s, between frames: warm warmup\.ts:41 30$/);
  assert.match(lines[1], /^\s+25 ms at 0\.05 s, between frames: warm warmup\.ts:41 25$/);
  assert.match(lines[2], /^\s+22 ms at 0\.07 s, a frame the lab stepped: frame main\.ts:1301 22$/);
  assert.ok(summarize(STRETCHED).includes('the longest busy stretches (20 ms or more)'));
  // (within a function, only its samples: the stepped frame isn't in warm)
  const within = summarize(STRETCHED, () => null, 'warm').split('\n');
  const said = within.slice(within.indexOf('the longest busy stretches (20 ms or more)') + 1);
  assert.equal(said.length, 2);
  assert.ok(said.every((line) => line.includes('between frames: warm')));
});
