// The page's sampled JS (tools/stalls `--js`): a source map's mappings read, and a made-up profile in the trace put
// on the page's clock and summed by function.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../analyze.mjs';
import { jsUnder } from '../profile.mjs';
import { measureText } from '../report.mjs';
import { decode, placeIn, readMap, shortSource, vlqs } from '../sourceMap.mjs';

const MARK = 'stalls:start';
const PAGE = { pid: 9, tid: 90 };
/** the profiler's own thread, which carries the chunks */
const SAMPLER = { pid: 9, tid: 91 };

test('reads a source map\'s numbers and finds where built code came from', () => {
  assert.deepEqual(vlqs('AAAA'), [0, 0, 0, 0]);
  assert.deepEqual(vlqs('IAAI'), [4, 0, 0, 4]);
  // (a negative, and one of two digits: 16 is gA)
  assert.deepEqual(vlqs('D'), [-1]);
  assert.deepEqual(vlqs('gB'), [16]);
  // (line 0: columns 0 and 4 from the source's lines 1 and 3; line 1: column 2 from its line 3 again)
  assert.deepEqual(decode('AAAA,IAEA;EAAC'), [[[0, 0, 0], [4, 0, 2]], [[2, 0, 2]]]);
  const map = readMap({ sources: ['../../src/ui/perfHud.ts'], mappings: 'AAAA,IAEA;EAAC' });
  assert.deepEqual(placeIn(map, 0, 9), { source: 'ui/perfHud.ts', line: 3 });
  assert.deepEqual(placeIn(map, 0, 1), { source: 'ui/perfHud.ts', line: 1 });
  assert.equal(placeIn(map, 1, 1), null);
  assert.equal(placeIn(map, 5, 0), null);
  assert.equal(shortSource('../../node_modules/three/build/three.core.js'), 'three/build/three.core.js');
});

/** A node of V8's profile: `id`, its parent's, and the function it's in (`name`, at `line` of the page's script). */
const node = (id, parent, name, line = 0) => ({
  id,
  parent,
  callFrame: { functionName: name, url: 'http://x/assets/index.js', lineNumber: line, columnNumber: 0 },
});

test('puts the page\'s JS samples on its clock and sums a phase\'s by function', () => {
  const record = {
    start: 1000,
    frames: Array.from({ length: 10 }, (_, index) => ({ at: 1010 + index * 10, ms: 10 })),
    changes: [],
    phases: [{ name: 'away', at: 1000 }],
  };
  // (a frame (the root's child) calling render, which calls draw; samples every 2 ms: draw 3 times, render once,
  // the frame once, then idle)
  const nodes = [node(1, undefined, '(root)'), node(2, 1, 'frame', 9), node(3, 2, 'render', 19),
    node(4, 3, 'draw', 29), node(5, 1, '(idle)')];
  const profiled = {
    cpuProfile: { nodes, samples: [4, 4, 4, 3, 2, 5] },
    timeDeltas: [0, 2000, 2000, 2000, 2000, 2000],
  };
  const events = [
    { ph: 'M', name: 'process_name', pid: PAGE.pid, args: { name: 'Renderer' } },
    { ph: 'M', name: 'thread_name', ...PAGE, args: { name: 'CrRendererMain' } },
    { ph: 'I', name: 'TimeStamp', ...PAGE, ts: 1_000_000, args: { data: { message: MARK } } },
    { ph: 'P', name: 'Profile', ...PAGE, id: '0x1', ts: 1_000_000, args: { data: { startTime: 1_010_000 } } },
    {
      ph: 'P',
      name: 'ProfileChunk',
      ...SAMPLER,
      id: '0x1',
      ts: 1_020_000,
      args: { data: profiled },
    },
  ];
  // (its functions named where the build's map says they're written)
  const sourceOf = (url, line) => ({ source: 'core/renderer.ts', line: line + 1 });
  const [phase] = analyze(record, events, MARK, undefined, sourceOf).phases;
  assert.deepEqual(phase.js.own, [
    { name: 'draw core/renderer.ts:30', ms: 0.6 },
    { name: 'render core/renderer.ts:20', ms: 0.2 },
    { name: 'frame core/renderer.ts:10', ms: 0.2 },
  ]);
  assert.deepEqual(phase.js.within.map(({ name, ms }) => [name, ms.toFixed(1)]), [
    ['frame core/renderer.ts:10', '1.0'], ['render core/renderer.ts:20', '0.8'], ['draw core/renderer.ts:30', '0.6']]);
  const text = measureText({ name: 'x', notes: [], findings: analyze(record, events, MARK, undefined, sourceOf) });
  assert.match(text, /a frame's JS, each function's own time, ms: 0\.60 draw core\/renderer\.ts:30; 0\.20 render /);
  assert.match(text, /and with what it calls, ms: 1\.00 frame core\/renderer\.ts:10; 0\.80 render/);
  // (without a map, by the script's file and line)
  const [unnamed] = analyze(record, events, MARK).phases;
  assert.equal(unnamed.js.own[0].name, 'draw index.js:30');
});

test('breaks a function\'s time down by what it calls, from its innermost call', () => {
  // (each stack leaf first: the leaf's own time is the callee's, or the function's own where it's the leaf)
  const samples = [
    { at: 10, ms: 2, stack: ['upload three.js:5', 'render three.js:1', 'frame main.ts:9'] },
    { at: 11, ms: 1, stack: ['render three.js:1', 'frame main.ts:9'] },
    { at: 12, ms: 3, stack: ['draw three.js:7', 'render three.js:1', 'project three.js:3', 'render three.js:1'] },
    { at: 13, ms: 4, stack: ['animate player.ts:2', 'frame main.ts:9'] },
    { at: 99, ms: 8, stack: ['upload three.js:5', 'render three.js:1'] },
  ];
  assert.deepEqual(jsUnder(samples, 0, 50, 2, 'render'), [
    { name: 'draw three.js:7', ms: 1.5 },
    { name: 'upload three.js:5', ms: 1 },
    { name: '(its own)', ms: 0.5 },
  ]);
});
