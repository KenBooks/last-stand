// The performance traces (src/perf): packed and read back as they were, the detector judging slow and smooth play in
// every scene as it should, and `lab trace`'s report naming a planted slow stretch and what came before it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { decodeTrace, encodeTrace, NONE, PACKING, STATE, traceHeader } from '../../../src/perf/traceFormat.ts';
import { judge, refreshOf, slowBoot, slowReadying } from '../../../src/perf/detect.ts';
import { replayCommand, traceReport } from '../../../src/perf/traceReport.ts';
import { readEnvFile, reportOf } from '../node/trace.mjs';
import { parseCommandLine } from '../node/options.mjs';

/** what a trace's header says beside its frames, for these tests */
const HEADER = {
  at: '2026-11-06T12:00:00.000Z', build: { bundle: 'index-abc.js', commit: 'abc1234', pr: 12 }, page: '/?renderer=webgpu',
  reason: { scene: 'fight', why: 'low', refreshHz: 60, bootMs: 9000, bootDownloadMs: 3000, firstVisit: true },
  device: { gpu: 'Test GPU', cores: 8, touch: true, window: '844x390', dpr: 3, ua: 'test', jsBenchMs: 4 },
  settings: { quality: 'low', setting: 'auto', budgetPx: 518400, msaa: 0, shadowMap: 1024 },
  game: { mode: 'run', biome: 'forest', hero: 'mage', wave: 3 },
  longFrames: [], marks: [],
};

/** `seconds` of frames at `ms` each, in `state` */
const frames = (seconds, ms, state = 0) => Array.from({ length: Math.round((seconds * 1000) / ms) }, () => [ms, state]);

/** A ring of `rows` ([interval, state]) as the recorder holds them. */
function ring(rows) {
  return { interval: rows.map((r) => r[0]), state: rows.map((r) => r[1]), start: 0, count: rows.length, size: rows.length };
}

test('a trace packs and reads back: times to a fiftieth of a ms, longer ones exactly, counts and bits as they were', () => {
  const columns = {
    interval: [16.67, 2000.5, 8.333, NONE],
    tris: [0, 123456, 4e6, 7],
    state: [0, STATE.fighting | STATE.readying, 255, STATE.run],
  };
  const header = { ...HEADER, columns: [{ name: 'interval', kind: 'ms' }, { name: 'tris', kind: 'n32' }, { name: 'state', kind: 'u8' }] };
  const bytes = encodeTrace(header, 4, columns);
  const trace = decodeTrace(bytes);
  assert.deepEqual([...trace.columns.interval], [16.68, 2000.5, 8.34, NONE]);
  assert.deepEqual([...trace.columns.tris], columns.tris);
  assert.deepEqual([...trace.columns.state], columns.state);
  assert.equal(traceHeader(bytes).build.commit, 'abc1234');
  assert.throws(() => decodeTrace(new TextEncoder().encode('LSPX....')), /not a trace/);
});

test('a time in a byte comes back within 4%, under its floor as 0, none as none, as changes alike; the text once', () => {
  const lg = [0, 0.013, 0.06, 0.4, 1.5, 33.3, 199, 5000, NONE];
  const header = {
    ...HEADER,
    columns: [{ name: 'interval', kind: 'ms' }, { name: 'cpu', kind: 'lg' }],
    marks: [[1, 'cast maelstrom'], [2, 'cast maelstrom'], [3, 'cast glacialNova']],
  };
  const columns = { interval: lg.map(() => 16.7), cpu: lg };
  const bytes = encodeTrace(header, lg.length, columns);
  const back = [...decodeTrace(bytes).columns.cpu];
  for (const [i, v] of lg.entries()) {
    if (v === NONE) assert.equal(back[i], NONE);
    else if (v < PACKING.floor) assert.equal(back[i], 0, `${v} under the floor came back ${back[i]}`);
    else assert.ok(Math.abs(back[i] - v) / v <= 0.041, `${v} came back ${back[i]}`);
  }
  const asChanges = encodeTrace(header, lg.length, columns, { ...PACKING, changes: ['cpu'] });
  assert.deepEqual([...decodeTrace(asChanges).columns.cpu], back);
  const json = new TextDecoder().decode(bytes);
  assert.equal(json.split('cast maelstrom').length - 1, 1, 'a mark\'s text is kept once');
  assert.deepEqual(decodeTrace(bytes).header.marks.map(([, text]) => text), header.marks.map(([, text]) => text));
});

test('slow play is found by its 1% low, by frames missed, and by stalls, in any scene', () => {
  const display = 1000 / 60;
  assert.equal(judge(ring(frames(25, 16.7)), display).slow, false);
  const low = judge(ring([...frames(20, 16.7), ...frames(2, 45)]), display);
  assert.deepEqual([low.slow, low.why], [true, 'low']);
  // 40 frames a second steady on a 60 Hz display: a third missed, its low over 30
  const missed = judge(ring(frames(25, 25)), display);
  assert.deepEqual([missed.slow, missed.why], [true, 'missed']);
  // the same on 144 Hz at 100 frames a second: missed a third, but the mean over 50
  assert.equal(judge(ring(frames(25, 10)), 1000 / 144).slow, false);
  // a steady 60 on a 120 Hz display, a frame now and then two refreshes late (33.4 ms, its refreshes' 33.3 by the
  // display's jitter): its low is 30, not slow (trace R2XY-H2DW, an S25 Edge sent as slow at 60 frames a second)
  const sixty = [];
  for (let second = 0; second < 25; second++) sixty.push(...frames(1, 16.7), ...frames(0.02, 33.4));
  assert.equal(judge(ring(sixty), 1000 / 120).slow, false);
  // a steady 60 on a 60 Hz screen whose browser's frames came on another screen's 145 Hz ticks: 2 and 3 ticks in turn,
  // and now and then 5 (34.5 ms): a low of 29 that is a refresh missed, not slow (trace T9NG-CZ79)
  const tick = 1000 / 145;
  const ticked = [];
  for (let second = 0; second < 25; second++) {
    for (let frame = 0; frame < 30; frame++) ticked.push([2 * tick, 0], [3 * tick, 0]);
    ticked.push([5 * tick, 0]);
  }
  assert.equal(judge(ring(ticked), tick).slow, false);
  // a game at that screen's 145 with the same 34.5 ms frames is slow by its low: five of its own frames
  const hitched = [];
  for (let second = 0; second < 25; second++) hitched.push(...frames(1, tick), [5 * tick, 0], [5 * tick, 0]);
  assert.deepEqual([judge(ring(hitched), tick).slow, judge(ring(hitched), tick).why], [true, 'low']);
  const stalled = judge(ring([...frames(20, 16.7), [1500, 0]]), display);
  assert.deepEqual([stalled.slow, stalled.why], [true, 'stalls']);
  // (the lobby's stalls count as much as a fight's)
  assert.equal(judge(ring([...frames(20, 16.7), [300, 0], [300, 0], [300, 0]]), display).why, 'stalls');
});

test('loading, warm-ups, pauses and settling are left out of the frame rate, and a hidden tab out of all', () => {
  const display = 1000 / 60;
  const notPlay = [STATE.paused, STATE.warming, STATE.menu, STATE.settling, STATE.readying];
  for (const state of notPlay) {
    assert.equal(judge(ring([...frames(20, 16.7), ...frames(10, 45, state)]), display).slow, false, `state ${state}`);
  }
  assert.equal(judge(ring([...frames(20, 16.7), [3000, STATE.hidden]]), display).slow, false);
  // a warm-up's stall is still a stall the player saw
  assert.equal(judge(ring([...frames(20, 16.7), [1200, STATE.warming]]), display).why, 'stalls');
  // too little play to judge the frame rate on
  assert.equal(judge(ring(frames(10, 45)), display).slow, false);
});

test('the display\'s rate is the fastest second seen, and slow boots and loading bars by their time', () => {
  assert.equal(refreshOf(Array(144).fill(1000 / 144), 1000 / 60), 1000 / 144);
  assert.equal(refreshOf(Array(30).fill(33.3), 1000 / 144), 1000 / 144);
  assert.equal(slowBoot(20_000, 3_000), true);
  assert.equal(slowBoot(20_000, 10_000), false);
  assert.equal(slowReadying(9_000), true);
  assert.equal(slowReadying(3_000), false);
});

/** A 20 s trace at 60 frames a second, a slow second planted at 12 s with a cast marked just before it. */
function plantedTrace() {
  const interval = [], cpu = [], state = [];
  for (let t = 0; t < 20_000;) {
    const slow = t >= 12_000 && t < 13_000;
    const ms = slow ? 100 : 1000 / 60;
    interval.push(ms);
    cpu.push(slow ? 90 : 4);
    state.push(STATE.run | STATE.fighting);
    t += ms;
  }
  const header = {
    ...HEADER,
    marks: [[3000, 'mode run'], [11_500, 'cast maelstrom']],
    longFrames: [[12_100, 100, 90, 5, 5, 88, 80, 'FrameRequestCallback frame index.js']],
    columns: [{ name: 'interval', kind: 'ms' }, { name: 'cpu', kind: 'ms' }, { name: 'state', kind: 'u8' }],
  };
  return encodeTrace(header, interval.length, { interval, cpu, state });
}

test('the report names the planted slow second worst, with the cast before it, and the command to play it again', () => {
  const text = reportOf(gzipSync(plantedTrace()), 'TEST-CODE');
  const lines = text.split('\n');
  const worst = lines.findIndex((line) => line.startsWith('Worst stretches'));
  assert.match(lines[worst + 1], /^ {2}12\.0 s-13\.0 s: 10 frames, ours 90\.0 ms/);
  assert.match(lines[worst + 2], /11\.5 s cast maelstrom/);
  assert.match(text, /the longest 80: FrameRequestCallback frame index\.js/);
  assert.match(text, /Play it again in the lab: npm run lab -- perf maelstrom --class mage --biome forest --screen 844x390@3 --quality low@518400 --throttle 4/);
  assert.match(lines[0], /trace TEST-CODE .*build abc1234 \(PR #12\)/);
  assert.equal(replayCommand(decodeTrace(plantedTrace())).startsWith('npm run lab -- perf maelstrom'), true);
  assert.ok(traceReport(decodeTrace(plantedTrace())).length > 20);
});

test('the env file and the command line', () => {
  assert.deepEqual(readEnvFile('# the token\nTRACES_TOKEN = "abc"\nTRACES_SERVER=http://localhost:8080\n'),
    { TRACES_TOKEN: 'abc', TRACES_SERVER: 'http://localhost:8080' });
  assert.deepEqual(parseCommandLine(['trace', 'ABCD-EFGH'])._, undefined);
  assert.deepEqual(parseCommandLine(['trace', 'ABCD-EFGH']).options._, ['ABCD-EFGH']);
  assert.equal(parseCommandLine(['trace', '--latest']).options.latest, true);
  assert.equal(parseCommandLine(['trace', '--build', 'abc1234']).options.build, 'abc1234');
});

