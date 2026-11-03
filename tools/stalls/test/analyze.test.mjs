// The stalls' analysis and report (tools/stalls): a made-up trace and recording, each piece put on the page's clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, selfTimes, shortName } from '../analyze.mjs';
import { measureText, roundsText, summaryText } from '../report.mjs';

const MARK = 'stalls:start';
/** the GPU process's main thread, and the page's renderer */
const GPU = { pid: 7, tid: 70 };
const PAGE = { pid: 9, tid: 90 };
/** a task's name as the trace has it */
const RASTER = 'virtual void __cdecl gpu::RasterDecoderImpl::DoRaster(int)';

/** A trace: the threads named, the page's mark at 1 s (trace time, µs), and a task holding one program's link. */
function trace() {
  return [
    { ph: 'M', name: 'process_name', pid: GPU.pid, args: { name: 'GPU Process' } },
    { ph: 'M', name: 'thread_name', ...GPU, args: { name: 'CrGpuMain' } },
    { ph: 'M', name: 'process_name', pid: PAGE.pid, args: { name: 'Renderer' } },
    { ph: 'M', name: 'thread_name', ...PAGE, args: { name: 'CrRendererMain' } },
    { ph: 'I', name: 'TimeStamp', ...PAGE, ts: 1_000_000, args: { data: { message: MARK } } },
    { ph: 'X', name: RASTER, ...GPU, ts: 1_150_000, dur: 400_000 },
    { ph: 'X', name: 'driver_link_program', ...GPU, ts: 1_200_000, dur: 300_000 },
  ];
}

/** The page's recording, its clock starting at 500 ms: a short frame, then one of 450 ms ending at 1100. */
function recording() {
  return {
    start: 500,
    frames: [
      { at: 600, ms: 16 },
      { at: 1100, ms: 450 },
    ],
    changes: [
      { at: 640, what: 'attr style', where: 'div#meter' },
      { at: 645, what: 'attr style', where: 'div#meter' },
    ],
  };
}

test('names a C++ function by its type and method', () => {
  assert.equal(shortName(RASTER), 'RasterDecoderImpl::DoRaster');
  assert.equal(shortName('ThreadControllerImpl::RunTask'), 'ThreadControllerImpl::RunTask');
  assert.equal(shortName('void (anonymous namespace)::Run()'), 'Run');
});

test('puts the trace on the page\'s clock and finds the program built in the stall', () => {
  const findings = analyze(recording(), trace(), MARK);
  assert.equal(findings.clockFound, true);
  assert.deepEqual(findings.frames.stalls, 1);
  assert.deepEqual(findings.programs, { count: 1, total: 300, longest: 300 });
  const [stall] = findings.stalls;
  assert.equal(stall.ms, 450);
  assert.equal(stall.at, 0.6);
  assert.equal(stall.built.length, 1);
  assert.equal(stall.built[0].at, 700);
  assert.equal(stall.built[0].thread, 'GPU Process CrGpuMain');
  assert.deepEqual(stall.built[0].heldIn, ['RasterDecoderImpl::DoRaster']);
  assert.deepEqual(stall.busy, [{ ms: 400, thread: 'GPU Process CrGpuMain', name: 'RasterDecoderImpl::DoRaster' }]);
  assert.deepEqual(stall.changes, ['2 x attr style on div#meter']);
  // (each link with when it began, in seconds of the recording)
  assert.equal(findings.built[0].at, 0.2);
});

test('says what other pages\' renderers did while the page played: none when they were frozen', () => {
  const other = { pid: 11, tid: 110 };
  const events = [
    ...trace(),
    { ph: 'M', name: 'process_name', pid: other.pid, args: { name: 'Renderer' } },
    { ph: 'M', name: 'thread_name', ...other, args: { name: 'CrRendererMain' } },
    { ph: 'X', name: 'FunctionCall', ...other, ts: 1_050_000, dur: 40_000 },
    { ph: 'X', name: 'FunctionCall', ...PAGE, ts: 1_060_000, dur: 30_000 },
  ];
  const findings = analyze(recording(), events, MARK);
  assert.deepEqual(findings.others, { ms: 40, most: [{ what: 'Renderer CrRendererMain (11) FunctionCall', ms: 40 }] });
  assert.match(measureText({ name: 'a', notes: [], findings }), /other pages' renderers did 40 ms of work/);
  const alone = analyze(recording(), trace(), MARK);
  assert.equal(alone.others.ms, 0);
  assert.doesNotMatch(measureText({ name: 'a', notes: [], findings: alone }), /other pages/);
});

test('says a frame\'s JS by function over the whole measure, where it was sampled', () => {
  const findings = analyze(recording(), trace(), MARK);
  assert.equal(findings.js, null);
  assert.doesNotMatch(measureText({ name: 'x', notes: [], findings }), /a frame's JS/);
  findings.js = { own: [{ name: 'draw three.js:1', ms: 1.5 }], within: [{ name: 'frame main.ts:9', ms: 4.25 }] };
  const text = measureText({ name: 'x', notes: [], findings });
  assert.match(text, /a frame's JS, each function's own time, ms: 1\.50 draw three\.js:1/);
  assert.match(text, /and with what it calls, ms: 4\.25 frame main\.ts:9/);
  findings.js.under = { name: 'render', calls: [{ name: 'draw three.js:1', ms: 2 }] };
  const under = measureText({ name: 'x', notes: [], findings });
  assert.match(under, /under render, by what it calls, ms: 2\.00 draw three\.js:1/);
});

test('says when the trace never saw the page\'s mark', () => {
  const findings = analyze(recording(), trace(), 'another mark');
  assert.equal(findings.clockFound, false);
  assert.equal(findings.stalls[0].built.length, 0);
  const text = measureText({ name: 'x base', notes: ['a fight'], findings });
  assert.match(text, /the page's mark is missing from the trace/);
});

test('lists a link\'s innermost tasks alone', () => {
  const findings = analyze(recording(), trace(), MARK);
  findings.built[0].heldIn = ['RunTask', 'Scheduler::RunTask', 'GPUTask', 'Flush', 'shader_compile', 'cache_miss'];
  const text = measureText({ name: 'x', notes: [], findings }, { links: true });
  assert.match(text, /300 ms {2}… > GPUTask > Flush > shader_compile > cache_miss/);
});

test('reports each stall with what was built and busy in it, and the measures side by side', () => {
  const findings = analyze(recording(), trace(), MARK);
  const measure = { name: 'http://x/ base', notes: ['a run started'], findings };
  const text = measureText(measure, { links: true });
  assert.match(text, /^http:\/\/x\/ base: a run started/);
  assert.match(text, /stall of 450 ms at 0\.6 s/);
  assert.match(text, /Skia program linked: 300 ms on GPU Process CrGpuMain in RasterDecoderImpl::DoRaster/);
  assert.match(text, /the longest tasks through it: 400 ms RasterDecoderImpl::DoRaster on GPU Process CrGpuMain/);
  assert.match(text, /0\.2 s {2}300 ms {2}RasterDecoderImpl::DoRaster/);
  assert.match(summaryText([measure]), /http:\/\/x\/ base {2}\s+1 stalls, 0\.5 s stalled;\s+1 programs, 300 ms/);
});

test('sums up the rounds by variant: each phase\'s median frames a second and their range', () => {
  const round = (group, rate, missedShare) => ({
    group,
    findings: { phases: [{ name: 'away', rate: 144, missedShare: 0 }, { name: 'sweeping', rate, missedShare }] },
  });
  const measures = [round('x base', 110, 0.2), round('x still', 130, 0.05), round('x base', 122, 0.1),
    round('x still', 128, 0.06), round('x base', 104, 0.3)];
  const text = roundsText(measures);
  assert.match(text, /x base\s+3 rounds; away 144 \(144–144\) a second, 0% missed, /);
  assert.match(text, /x base .* sweeping 110 \(104–122\) a second, 20% missed, the browser's work /);
  assert.match(text, /x still\s+2 rounds; .*sweeping 128 \(128–130\) a second, 5% missed/);
});

/** `count` changes made at once at `at` (page ms), each `what` on `where`. */
const madeAt = (at, count, what, where) => Array.from({ length: count }, () => ({ at, what, where }));

/** A paint on the page's main thread at `at` (page ms, the recording starting at 1000 with the mark) for `ms`. */
const paintAt = (at, ms) => ({ ph: 'X', name: 'Paint', ...PAGE, ts: at * 1000, dur: ms * 1000 });

test('finds the changes of the page\'s look by kind and the work after each over the quiet phase\'s', () => {
  // (a quiet phase painting 2 ms in its 100, then two changes: the stash's, 50 ms before the tooltip's, and the
  // tooltip's with the 300 ms after it)
  const record = {
    start: 1000,
    frames: Array.from({ length: 30 }, (_, index) => ({ at: 1010 + index * 10, ms: 10 })),
    changes: [...madeAt(1110, 12, 'attr class', 'div.sitem'), ...madeAt(1160, 11, 'childList', 'b'),
      ...madeAt(1160, 2, 'attr class', 'div.sitem')],
    phases: [{ name: 'away', at: 1000 }, { name: 'sweeping', at: 1100 }],
  };
  const events = [...trace().slice(0, 5), paintAt(1050, 2), paintAt(1120, 6), paintAt(1200, 10)];
  const [stash, tooltip] = analyze(record, events, MARK).looks;
  assert.deepEqual({ ...stash, what: undefined, work: undefined },
    { kind: 'attr class on div.sitem', count: 1, changes: 12, ms: 50, over: 'away', browserWork: 5, missedShare: 0,
      what: undefined, work: undefined });
  assert.deepEqual(stash.work, [{ name: 'Paint', thread: 'Renderer CrRendererMain', ms: 5 }]);
  assert.equal(tooltip.kind, 'childList on b');
  assert.equal(tooltip.ms, 300);
  assert.equal(tooltip.browserWork, 4);
  const text = measureText({ name: 'x', notes: [], findings: analyze(record, events, MARK) });
  assert.match(text, /1 changes of the page's look as attr class on div\.sitem \(12 changes to its HTML at once: /);
  assert.match(text, /once: 12 x attr class on div\.sitem\); the browser's work in the 50 ms after each, over the /);
  assert.match(text, /over the away phase's: 5\.0 ms; 0% of the frames in it missed\n {4}a change's work, over /);
  assert.match(text, /a change's work, over the away phase's, ms: 5\.0 Paint/);
  assert.match(text, /as childList on b \(13 changes to its HTML at once: 11 x childList on b, 2 x attr class/);
});

test('counts each task\'s own time, less the work the trace kept inside it', () => {
  const tasks = [
    { name: 'RunTask', ...PAGE, ts: 0, dur: 10_000 },
    { name: 'Paint', ...PAGE, ts: 1_000, dur: 4_000 },
    { name: 'Layerize', ...PAGE, ts: 2_000, dur: 1_000 },
    { name: 'Commit', ...PAGE, ts: 6_000, dur: 3_000 },
    { name: 'DrawFrame', ...GPU, ts: 1_000, dur: 5_000 },
  ];
  const own = Object.fromEntries(selfTimes(tasks).map(({ task, ms }) => [task.name, ms]));
  assert.deepEqual(own, { RunTask: 3, Paint: 3, Layerize: 1, Commit: 3, DrawFrame: 5 });
});

test('lists what each phase\'s threads spent a frame\'s time on', () => {
  const record = {
    start: 1000,
    frames: [{ at: 1010, ms: 10 }, { at: 1020, ms: 10 }],
    changes: [],
    phases: [{ name: 'sweeping', at: 1000 }],
  };
  // (the mark at 1 s of trace time is the page's 1000 ms: the work at 1.002 s is in the phase)
  const events = [
    ...trace().slice(0, 5),
    { ph: 'X', name: 'RunTask', ...PAGE, ts: 1_002_000, dur: 12_000 },
    { ph: 'X', name: 'Paint', ...PAGE, ts: 1_003_000, dur: 8_000 },
  ];
  const [phase] = analyze(record, events, MARK).phases;
  assert.deepEqual(phase.work, [
    { name: 'Paint', thread: 'Renderer CrRendererMain', ms: 4 },
    { name: 'RunTask', thread: 'Renderer CrRendererMain', ms: 2 },
  ]);
  // (all of it the browser's: 12 ms of work in the frames' 20 ms, 600 ms a second)
  assert.equal(phase.browserWork, 600);
  const text = measureText({ name: 'x sweep', notes: [], findings: analyze(record, events, MARK) });
  assert.match(text, /a frame's work, ms: 4\.0 Paint on Renderer CrRendererMain; 2\.0 RunTask on Renderer/);
});

test('lists what the threads did in the frames that missed the screen\'s refresh apart', () => {
  // (frames of 7 ms, one of 21 ending at 1035 that a long paint started in: the screen's refresh is 7 ms)
  const record = {
    start: 1000,
    frames: [{ at: 1007, ms: 7 }, { at: 1014, ms: 7 }, { at: 1035, ms: 21 }, { at: 1042, ms: 7 }],
    changes: [],
    phases: [{ name: 'sweeping', at: 1000 }],
  };
  const events = [
    ...trace().slice(0, 5),
    { ph: 'X', name: 'Paint', ...PAGE, ts: 1_002_000, dur: 1_000 },
    { ph: 'X', name: 'Paint', ...PAGE, ts: 1_016_000, dur: 12_000 },
  ];
  const [phase] = analyze(record, events, MARK).phases;
  assert.equal(phase.missedShare, 1 / 4);
  assert.deepEqual(phase.missedWork, [{ name: 'Paint', thread: 'Renderer CrRendererMain', ms: 12 }]);
  const text = measureText({ name: 'x sweep', notes: [], findings: analyze(record, events, MARK) });
  assert.match(text, /a missed frame's, ms: 12\.0 Paint on Renderer CrRendererMain/);
});

test('sums up each phase the scenario marked apart, with the share of its frames a tooltip showed in', () => {
  const record = {
    start: 0,
    frames: [
      { at: 10, ms: 7, tip: false },
      { at: 17, ms: 7, tip: false },
      { at: 40, ms: 23, tip: true },
      { at: 63, ms: 23, tip: true },
      { at: 70, ms: 7, tip: false },
    ],
    changes: [],
    phases: [{ name: 'away', at: 0 }, { name: 'over items', at: 17 }],
  };
  const { phases } = analyze(record, trace(), MARK);
  assert.deepEqual(phases.map((phase) => [phase.name, phase.count, phase.median]), [
    ['away', 2, 7],
    ['over items', 3, 23],
  ]);
  assert.equal(phases[1].tipShare, 2 / 3);
  // (the screen's refresh is the fastest phase's median, 7 ms: two of the three frames over items missed it, and a
  // median of 23 hides nothing here, but a phase of 7 ms frames and a 23 now and then would read 7 alone)
  assert.equal(phases[0].missedShare, 0);
  assert.equal(phases[1].missedShare, 2 / 3);
  assert.equal(Math.round(phases[1].rate), 57);
  const measure = { name: 'x hover', notes: [], findings: analyze(record, trace(), MARK) };
  const text = measureText(measure);
  assert.match(text, /over items: 3 frames, 57 a second \(67% missed the screen's refresh\), median 23\.0 ms/);
  assert.match(text, /90% within 23\.0 ms/);
  assert.match(text, /a tooltip shown in 67% of them/);
  assert.match(summaryText([measure]), /frames a second \(missed\) away 143 \(0%\), over items 57 \(67%\)/);
});

/** `count` frames evenly through the second from `start` (ms), each as long as their spacing. */
function framesIn(start, count) {
  const spacing = 1000 / count;
  return Array.from({ length: count }, (_, index) => ({ at: start + (index + 1) * spacing, ms: spacing, tip: true }));
}

test('says a phase a second at a time, where a fall through it shows', () => {
  const record = {
    start: 500,
    frames: [...framesIn(1000, 144), ...framesIn(2000, 90), ...framesIn(3000, 30)],
    changes: [],
    phases: [{ name: 'sweeping', at: 1000 }],
  };
  const [phase] = analyze(record, trace(), MARK).phases;
  assert.deepEqual(phase.seconds.map((second) => second.frames), [144, 90, 30]);
  const measure = { name: 'x sweep', notes: [], findings: analyze(record, trace(), MARK) };
  assert.match(measureText(measure), /a second at a time: 144 90 30 frames; the browser's work \d+ \d+ \d+ ms/);
});

/** The compositor's draws (`trace.mjs` `drawOf`) at page time `at` (ms; the trace's clock is the page's from the
 *  mark at 1 s, the page's 500 ms): a frame, its `passes` render passes and a quad of each of `materials`. */
function drawnAt(at, passes, materials) {
  const ts = 1_000_000 + (at - 500) * 1000;
  const draw = (kind, material = null) => ({ ph: 'D', kind, material, pid: GPU.pid, ts });
  return [
    draw('frame'),
    ...Array.from({ length: passes }, () => draw('pass')),
    ...materials.map((material) => draw('quad', material)),
  ];
}

test('counts the compositor\'s render passes and quads a frame, each phase', () => {
  const record = {
    start: 500,
    frames: [...framesIn(1000, 144), ...framesIn(2000, 144)],
    changes: [],
    phases: [{ name: 'away', at: 1000 }, { name: 'sweeping', at: 2000 }],
  };
  const events = [
    ...trace(),
    ...drawnAt(1200, 1, ['kTiledContent', 'kSolidColor']),
    ...drawnAt(1700, 1, ['kTiledContent', 'kSolidColor']),
    ...drawnAt(2200, 4, ['kTiledContent', 'kTiledContent', 'kCompositorRenderPass']),
    ...drawnAt(2700, 2, ['kTiledContent', 'kCompositorRenderPass']),
  ];
  const [away, sweeping] = analyze(record, events, MARK).phases;
  const awayMaterials = [{ name: 'TiledContent', perFrame: 1 }, { name: 'SolidColor', perFrame: 1 }];
  assert.deepEqual(away.drawn, { frames: 2, passes: 1, quads: 2, materials: awayMaterials });
  assert.equal(sweeping.drawn.passes, 3);
  assert.equal(sweeping.drawn.quads, 2.5);
  assert.deepEqual(sweeping.drawn.materials[0], { name: 'TiledContent', perFrame: 1.5 });
  const text = measureText({ name: 'x sweep', notes: [], findings: analyze(record, events, MARK) });
  assert.match(text, /the compositor: 2 frames drawn, 3\.0 render passes and 2\.5 quads a frame \(1\.5 TiledContent/);
  assert.equal(analyze(record, trace(), MARK).phases[0].drawn, null);
});

/** A paint kept of the page's, `at` ms on its clock (`trace.mjs` `paintOf`), of the element `node` names. */
const paintedAt = (at, node) => ({ ph: 'P', node, pid: PAGE.pid, ts: 1_000_000 + (at - 500) * 1000 });

test('counts the page\'s paints a frame, each phase, by the element painted', () => {
  const record = {
    start: 500,
    frames: [...framesIn(1000, 144), ...framesIn(2000, 144)],
    changes: [],
    phases: [{ name: 'away', at: 1000 }, { name: 'sweeping', at: 2000 }],
  };
  const swept = Array.from({ length: 144 }, (_, frame) => paintedAt(2003 + frame * 6.9, 7));
  const events = [...trace(), paintedAt(1500, 9), ...swept, paintedAt(2500, 9), paintedAt(2600, 8)];
  const names = new Map([[7, 'div#hud'], [8, 'div.tt-card'], [9, 'div.tt-card']]);
  const [away, sweeping] = analyze(record, events, MARK, undefined, undefined, names).phases;
  assert.equal(away.painted.elements[0].name, 'div.tt-card');
  assert.equal(sweeping.painted.elements[0].name, 'div#hud');
  assert.ok(Math.abs(sweeping.painted.elements[0].perFrame - 1) < 0.02);
  const text = measureText({ name: 'x sweep', notes: [], findings: analyze(record, events, MARK, undefined,
    undefined, names) });
  assert.match(text, /the page painted 1\.0\d times a frame \(1\.0\d div#hud, 0\.01 div\.tt-card \(2 of them\)\)/);
  assert.equal(analyze(record, trace(), MARK).phases[1].painted, null);
});

test('puts the trace on the page\'s clock by its end mark where it lost its start', () => {
  const record = {
    start: 500,
    end: 3000,
    frames: [...framesIn(1000, 144), ...framesIn(2000, 144)],
    changes: [],
    phases: [{ name: 'away', at: 1000 }, { name: 'sweeping', at: 2000 }],
  };
  const lostStart = trace().filter((event) => event.name !== 'TimeStamp');
  const endMark = { ph: 'I', name: 'TimeStamp', ...PAGE, ts: 3_500_000, args: { data: { message: `${MARK}:end` } } };
  const events = [...lostStart, endMark, ...drawnAt(2200, 2, ['kTiledContent'])];
  const findings = analyze(record, events, MARK);
  assert.equal(findings.clockFound, true);
  assert.equal(findings.phases[1].drawn.passes, 2);
  assert.equal(analyze({ ...record, end: undefined }, events, MARK).clockFound, false);
});

test('says the perf overlay\'s GPU time through a phase and a second at a time', () => {
  const record = {
    start: 500,
    frames: [...framesIn(1000, 144), ...framesIn(2000, 60)],
    changes: [],
    phases: [{ name: 'sweeping', at: 1000 }],
    gpu: [{ at: 1200, ms: 5 }, { at: 1700, ms: 5 }, { at: 2200, ms: 13 }, { at: 2700, ms: 15 }],
  };
  const [phase] = analyze(record, trace(), MARK).phases;
  assert.equal(phase.gpu, 9.5);
  assert.deepEqual(phase.seconds.map((second) => second.gpu), [5, 14]);
  const measure = { name: 'x sweep', notes: [], findings: analyze(record, trace(), MARK) };
  const text = measureText(measure);
  assert.match(text, /the perf overlay's GPU 9\.5 ms a frame/);
  assert.match(text, /the perf overlay's GPU 5\.0 14\.0 ms a frame/);
});
