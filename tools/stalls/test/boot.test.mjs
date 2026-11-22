// The stalls' boot measure (tools/stalls, `--scenario boot`): a made-up boot's record and trace, each step's findings,
// and the report.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeBoot, REVEALED, SLOW_LAUNCHES } from '../analyze.mjs';
import { bootRecording, loaded, stopBootRecording } from '../page.mjs';
import { bootRoundsText, bootText, gpuWaitProblems } from '../report.mjs';

const MARK = 'stalls:boot';
/** the page's renderer and one of its workers */
const PAGE = { pid: 9, tid: 90 };
const WORKER = { pid: 9, tid: 91 };
/** the page's clock (ms) as the recording started, and the trace's time (µs) of the mark made then */
const START = 50;
const MARK_TS = 1_000_000;
/** A piece of work `name` on `thread`, starting at the page's `at` (ms) for `ms`. */
const workAt = (name, thread, at, ms) => {
  return { ph: 'X', name, ...thread, ts: MARK_TS + (at - START) * 1000, dur: ms * 1000 };
};

/** A trace: the threads named, the mark, the bundle run on the page's thread and the maps made in a worker. */
function trace() {
  return [
    { ph: 'M', name: 'process_name', pid: PAGE.pid, args: { name: 'Renderer' } },
    { ph: 'M', name: 'thread_name', ...PAGE, args: { name: 'CrRendererMain' } },
    { ph: 'M', name: 'thread_name', ...WORKER, args: { name: 'DedicatedWorker thread' } },
    { ph: 'I', name: 'TimeStamp', ...PAGE, ts: MARK_TS, args: { data: { message: MARK } } },
    workAt('EvaluateScript', PAGE, 120, 60),
    workAt('FunctionCall', WORKER, 400, 300),
  ];
}

/** A boot's record: the document fetched by 50 ms, its scripts run, the arena from 300, the lobby revealed at 900. */
function record() {
  return {
    start: START,
    frames: [{ at: 200, ms: 150 }, { at: 500, ms: 300 }, { at: 950, ms: 10 }, { at: 960, ms: 10 }],
    changes: [],
    phases: [
      { name: 'the document fetched', at: 0 },
      { name: 'Loading…', at: 100 },
      { name: 'Forging the arena', at: 300 },
      { name: REVEALED, at: 900 },
    ],
    longTasks: [{ at: 120, ms: 60 }, { at: 400, ms: 250 }],
    paint: { 'first-contentful-paint': 80 },
    files: [
      { name: '(the page)', kind: 'navigation', bytes: 50_000, at: 0, end: 40 },
      { name: 'index.js', kind: 'script', bytes: 900_000, at: 60, end: 110 },
      { name: 'music.ogg', kind: 'fetch', bytes: 2_000_000, at: 1000, end: 1400 },
      { name: 'maps.worker.js', kind: 'other', bytes: 60_000, at: 300, end: 0 },
    ],
    maps: [
      { name: 'steel()', at: 310, ms: 100, kept: false },
      { name: 'face(warrior)', at: 310, ms: 400, kept: false },
      { name: 'slabs(21,6,3)', at: 410, ms: 200, kept: false },
      { name: 'cobblestone()', at: 610, ms: 50, kept: false },
    ],
    exit: { kind: 'blown', before: { slow: 0, off: false }, after: { slow: 0, off: false } },
  };
}

/** `loaded` asked of a document in `readyState`, its loading screen `loading` (null: none) with `classes`. */
function loadedIn(readyState, classes) {
  const loading = classes === null ? null : { classList: { contains: (name) => classes.includes(name) } };
  globalThis.document = { readyState, getElementById: (id) => (id === 'loading' ? loading : null) };
  try {
    return loaded();
  } finally {
    delete globalThis.document;
  }
}

test('takes no document for loaded until it was parsed and its loading screen is done or gone', () => {
  // (just after a navigation commits the document is empty: a slowed CPU's boot was taken as loaded then)
  assert.equal(loadedIn('loading', null), false);
  assert.equal(loadedIn('interactive', []), false);
  assert.equal(loadedIn('interactive', ['blowing']), false);
  assert.equal(loadedIn('interactive', ['blowing', 'done']), true);
  assert.equal(loadedIn('complete', null), true);
});

test('the page names the step a boot ends on as the analysis looks for it', () => {
  assert.ok(String(bootRecording).includes(`'${REVEALED}'`));
});

test('the page reads the maps\' measures by the name and detail the game gives them', () => {
  const game = readFileSync(new URL('../../../src/core/textures.ts', import.meta.url), 'utf8');
  assert.match(game, /const detail = \{ kept, readMs, asked, up: up - performance\.timeOrigin \};/);
  assert.match(game, /performance\.measure\(`map \$\{key\}`, \{ [^}]*detail \}\)/);
  assert.ok(String(stopBootRecording).includes("startsWith('map ')"));
  for (const read of ['entry.detail?.kept === true', 'entry.detail?.readMs ?? null', 'entry.detail?.asked ?? null']) {
    assert.ok(String(stopBootRecording).includes(read));
  }
  assert.ok(String(stopBootRecording).includes('entry.detail?.up ?? null'));
});

test('times each step of a boot, with what held the page up and what each thread did in it', () => {
  const findings = analyzeBoot(record(), trace(), MARK);
  assert.equal(findings.clockFound, true);
  assert.equal(findings.revealedAt, 900);
  assert.equal(findings.painted, 80);
  assert.deepEqual(findings.steps.map((step) => [step.name, step.from, step.ms]), [
    ['the document fetched', 0, 100],
    ['Loading…', 100, 200],
    ['Forging the arena', 300, 600],
    [REVEALED, 900, 60],
  ]);
  const [, scripts, arena] = findings.steps;
  assert.deepEqual(scripts.longTasks, { count: 1, ms: 60, longest: 60 });
  assert.deepEqual(scripts.work, [{ name: 'EvaluateScript', thread: 'Renderer CrRendererMain', ms: 60 }]);
  assert.equal(arena.frames.worst[0], 300);
  assert.deepEqual(arena.work, [{ name: 'FunctionCall', thread: 'Renderer DedicatedWorker thread', ms: 300 }]);
  assert.deepEqual(findings.files, {
    count: 4,
    bytes: 3_010_000,
    later: 1,
    largest: [
      { name: 'music.ogg', bytes: 2_000_000, ms: 400 },
      { name: 'index.js', bytes: 900_000, ms: 50 },
      { name: 'maps.worker.js', bytes: 60_000, ms: null },
    ],
  });
  assert.deepEqual(findings.maps, {
    count: 4,
    kept: 0,
    from: 310,
    to: 710,
    ms: 750,
    readMs: null,
    longest: [{ name: 'face(warrior)', ms: 400 }, { name: 'slabs(21,6,3)', ms: 200 }, { name: 'steel()', ms: 100 }],
    workers: null,
  });
});

test('says how much of the maps\' work waited for the store, where the build tells', () => {
  const told = record();
  told.maps = told.maps.map((map, at) => ({ ...map, readMs: at * 100 }));
  const findings = analyzeBoot(told, trace(), MARK);
  assert.equal(findings.maps.readMs, 600);
  const text = bootText({ name: 'http://x/ base, a first visit', notes: [], findings });
  assert.match(text, /, 0\.75 s of work, 0\.60 s of it asking the store for them \(the longest /);
});

test('says when the maps\' workers were asked for and when their scripts ran, where the build tells', () => {
  const told = record();
  told.maps = told.maps.map((map, at) => ({ ...map, asked: 160 + at, up: 1050 + at * 10 }));
  const findings = analyzeBoot(told, trace(), MARK);
  assert.deepEqual(findings.maps.workers, { asked: 160, upFrom: 1050, upTo: 1080 });
  const text = bootText({ name: 'http://x/ base, a first visit', notes: [], findings });
  assert.match(text, /\); the workers asked for at 0\.16 s, up from 1\.05 s to 1\.08 s\n/);
});

test('lists a step\'s JS by each function\'s own time and with what it calls, where it was sampled', () => {
  const findings = analyzeBoot(record(), trace(), MARK);
  const arena = findings.steps.find((step) => step.name === 'Forging the arena');
  arena.js = {
    own: [{ name: 'derive core/engraving.ts:138', ms: 236 }],
    within: [{ name: 'boot main.ts:64', ms: 800 }, { name: 'derive core/engraving.ts:138', ms: 300 }],
  };
  const text = bootText({ name: 'http://x/ base, a first visit', notes: [], findings });
  assert.match(text, /its JS, each function's own time, ms: 236\.00 derive core\/engraving\.ts:138\n/);
  assert.match(text, /and with what it calls, ms: 800\.00 boot main\.ts:64; 300\.00 derive core\/engraving\.ts:138/);
});

test('lists each warm-up\'s steps, its waits for its maps and their uploads where the build times them', () => {
  const timed = record();
  const lobby = { name: 'the lobby', compileMs: 98, mapsMs: 1200, uploadsMs: 40, linksMs: 294, drawMs: 265 };
  const older = { name: 'the fight at once', compileMs: 58, linksMs: 656, drawMs: 82 };
  timed.warmUps = [lobby, older];
  const findings = analyzeBoot(timed, trace(), MARK);
  const text = bootText({ name: 'http://x/ base, a first visit', notes: [], findings });
  assert.match(text, /\(compile 98, maps 1200, uploads 40, links 294, draw 265\)/);
  assert.match(text, /the fight at once \(compile 58, links 656, draw 82\)/);
});

test('counts the threads a step\'s GPU compiles ran on, on average and at most at once', () => {
  const pool = (tid) => ({ pid: 7, tid });
  const events = [
    ...trace(),
    { ph: 'M', name: 'process_name', pid: 7, args: { name: 'GPU Process' } },
    workAt('ANGLEPlatformImpl::RunWorkerTask', pool(1), 300, 200),
    workAt('ANGLEPlatformImpl::RunWorkerTask', pool(2), 350, 100),
    // (starting as the second ends: two at once, not three)
    workAt('ANGLEPlatformImpl::RunWorkerTask', pool(3), 450, 200),
  ];
  const findings = analyzeBoot(record(), events, MARK);
  const text = bootText({ name: 'http://x/ base, a first visit', notes: [], findings });
  const lines = text.match(/the GPU process's compiles: .*/g);
  const expected = 'the GPU process\'s compiles: on 3 threads, 0.8 at once on average, 2 at most; each 0.25 s: 2 0 0';
  assert.deepEqual(lines, [expected]);
});

test('counts a step\'s Skia programs by where they were built, with links asked for', () => {
  const gpu = { pid: 7, tid: 70 };
  const events = [
    ...trace(),
    { ph: 'M', name: 'process_name', pid: 7, args: { name: 'GPU Process' } },
    { ph: 'M', name: 'thread_name', ...gpu, args: { name: 'CrGpuMain' } },
    workAt('RasterTask', gpu, 400, 100),
    workAt('driver_link_program', gpu, 410, 20),
    workAt('driver_link_program', gpu, 440, 30),
    workAt('FinishPaintRenderPass', gpu, 600, 50),
    workAt('driver_link_program', gpu, 610, 10),
  ];
  const findings = analyzeBoot(record(), events, MARK);
  const measure = { name: 'http://x/ base, a first visit', notes: [], findings };
  const text = bootText(measure, { links: true });
  assert.match(text, /its Skia programs, where they were built: 2 \(50 ms\) in RasterTask; /);
  assert.match(text, /; 1 \(10 ms\) in FinishPaintRenderPass\n/);
  assert.doesNotMatch(bootText(measure), /where they were built/);
});

test('reports a boot step by step, and the boots by visit over the rounds', () => {
  const findings = analyzeBoot(record(), trace(), MARK);
  const text = bootText({ name: 'http://x/ base, a first visit', notes: ['a fresh profile'], findings });
  assert.match(text, /^http:\/\/x\/ base, a first visit: a fresh profile/);
  assert.match(text, /the lobby revealed at 0\.90 s, first painted at 0\.08 s; 4 files, 3\.01 MB over the network /);
  assert.match(text, /\(1 after the reveal; the largest music\.ogg 2\.00 MB in 0\.40 s, /);
  assert.match(text, /, index\.js 0\.90 MB in 0\.05 s, /);
  assert.match(text, /maps\.worker\.js 0\.06 MB\)/);
  assert.match(text, /\n {2}4 maps made in the workers from 0\.31 s to 0\.71 s, 0\.75 s of work /);
  assert.match(text, / of work \(the longest face\(warrior\) 0\.40 s, /);
  assert.match(text, /, slabs\(21,6,3\) 0\.20 s, steel\(\) 0\.10 s\)\n/);
  const arena = / {3}0\.30 s {2}Forging the arena: 0\.60 s; 1 frames, the page held up 300 ms at most, 1 long tasks/;
  assert.match(text, arena);
  assert.match(text, /its work, ms: 300\.0 FunctionCall on Renderer DedicatedWorker thread/);
  const later = { ...findings, revealedAt: 1100 };
  const boots = [
    { group: 'x, a first visit', findings },
    { group: 'x, a first visit', findings: later },
    { group: 'x, a return', findings: { ...findings, revealedAt: 400 } },
  ];
  const rounds = bootRoundsText(boots);
  assert.match(rounds, /x, a first visit: 2 boots; the lobby revealed at 0\.90 \(0\.90–1\.10 s\)/);
  assert.match(rounds, /\n {4}the workers' maps done at 0\.71 \(0\.71–0\.71 s\)/);
  assert.match(rounds, /\n {4}Forging the arena: 0\.60 \(0\.60–0\.60 s\)/);
  assert.match(rounds, /x, a return: 1 boots; the lobby revealed at 0\.40 \(0\.40–0\.40 s\)/);
});

test('says when a boot never revealed the lobby', () => {
  const unrevealed = record();
  unrevealed.phases.pop();
  const findings = analyzeBoot(unrevealed, trace(), MARK);
  assert.equal(findings.revealedAt, null);
  assert.equal(findings.files.later, 0);
  assert.match(bootText({ name: 'x', notes: [], findings }), /the lobby never revealed/);
});

test('says how many maps were read back from a visit before', () => {
  const returned = record();
  for (const map of returned.maps.slice(1)) map.kept = true;
  const findings = analyzeBoot(returned, trace(), MARK);
  assert.equal(findings.maps.kept, 3);
  const text = bootText({ name: 'x', notes: [], findings });
  assert.match(text, /\n {2}4 maps made in the workers \(3 of them read back from a visit before\) from 0\.31 s /);
});

test('the page reads the exit\'s marks of a slow device by the names and limit the game gives them', () => {
  const game = readFileSync(new URL('../../../src/ui/logoWind.ts', import.meta.url), 'utf8');
  assert.match(game, /SLOW_KEY = 'last-stand\.logo-wind-slow'/);
  assert.match(game, new RegExp(`SLOW_LAUNCHES = ${SLOW_LAUNCHES}\\b`));
  assert.match(game, /OLD_OFF_KEY = 'last-stand\.logo-wind-off'/);
  const page = String(bootRecording);
  assert.ok(page.includes("'last-stand.logo-wind-slow'") && page.includes("'last-stand.logo-wind-off'"));
});

test('says how the loading screen left: blown away, cut short by its watchdog, or a plain fade and why', () => {
  const exitWith = (kind, before, after) => {
    const boot = record();
    boot.exit = { kind, before, after };
    const findings = analyzeBoot(boot, trace(), MARK);
    return { findings, text: bootText({ name: 'x', notes: [], findings }) };
  };
  const none = { slow: 0, off: false };
  assert.match(exitWith('blown', none, none).text, /\n {2}the loading screen left: the logo blown away\n/);
  const cut = exitWith('blown', none, { slow: 1, off: false });
  assert.equal(cut.findings.exit.kind, 'cut');
  assert.match(cut.text, /left: the logo's blow cut short by its watchdog \(slow launches in a row: 1\)/);
  // (a build before this one switched the blow off for good on one launch cut short)
  const forGood = exitWith('blown', none, { slow: 0, off: true });
  assert.equal(forGood.findings.exit.kind, 'cut');
  assert.match(forGood.text, /left: the logo's blow cut short by its watchdog, which switched it off for good\n/);
  assert.match(exitWith('plain', { slow: 0, off: true }, none).text, /a plain fade \(the device marked slow/);
  const marked = { slow: SLOW_LAUNCHES, off: false };
  assert.match(exitWith('plain', marked, marked).text, /a plain fade \(the device marked slow/);
  assert.match(exitWith('plain', none, none).text, /a plain fade \(reduced motion, low graphics, or the blow /);
  const boots = [cut, exitWith('blown', none, none), exitWith('blown', none, none)]
    .map(({ findings }) => ({ group: 'x', findings }));
  assert.match(bootRoundsText(boots), /\n {4}the loading screen left: the logo's blow cut short by its watchdog /);
  assert.match(bootRoundsText(boots), /\(slow launches in a row: 1\) 1, the logo blown away 2\n/);
});

test('says when the loading screen was gone after the reveal: a plain fade cut short by its parts\' ends', () => {
  const goneAt = (at) => {
    const boot = record();
    boot.exit = { kind: 'plain', before: { slow: 0, off: false }, after: { slow: 0, off: false } };
    boot.goneAt = at;
    return { group: 'x', name: 'x', notes: [], findings: analyzeBoot(boot, trace(), MARK) };
  };
  assert.match(bootText(goneAt(1800)), /left: a plain fade \(.*\), gone 0\.90 s after the reveal\n/);
  const rounds = bootRoundsText([goneAt(1050), goneAt(1500), goneAt(1800)]);
  assert.match(rounds, /\n {4}the loading screen gone 0\.60 \(0\.15–0\.90 s\) after the reveal\n/);
});

/** A boot whose lobby revealed at 900 ms: the logo's 40 frames before it at 7 ms, then `seconds` seconds of the
 *  lobby's frames, each second's frames as many as `rates` says in turn, evenly spread (the last repeated). */
function lobbyBoot(rates, seconds) {
  const boot = record();
  const frames = Array.from({ length: 40 }, (_, index) => ({ at: 620 + index * 7, ms: 7 }));
  let at = 900;
  for (let second = 0; second < seconds; second++) {
    const rate = rates[Math.min(second, rates.length - 1)];
    // (each frame's time from its second's start, the multiply first: the last falls on the second's end exactly)
    for (let index = 0; index < rate; index++) frames.push({ at: at + ((index + 1) * 1000) / rate, ms: 1000 / rate });
    at += 1000;
  }
  boot.phases = [{ name: 'the document fetched', at: 0 }, { name: 'the logo blown away', at: 600 }];
  boot.phases.push({ name: REVEALED, at: 900 });
  boot.frames = frames;
  return boot;
}

test('counts the lobby\'s frames a second as the overlay does, the fewest, till when short of the screen\'s', () => {
  // (a second at 17 frames, as the owner read off the overlay, then the screen's 143)
  const findings = analyzeBoot(lobbyBoot([17, 143], 3), trace(), MARK);
  const { lobby } = findings;
  assert.equal(Math.round(lobby.screenRate), 143);
  assert.deepEqual(lobby.fewest, { at: 1000, count: 17 });
  assert.equal(lobby.seconds.length, 9);
  assert.equal(lobby.roughTill, 1750);
  const text = bootText({ name: 'x', notes: [], findings });
  assert.match(text, /\n {2}the lobby's frames a second \(the overlay's count, the screen's 143\): the fewest 17, /);
  assert.match(text, /1\.00 s in; short of the screen's rate till 1\.75 s in; each 0\.25 s from 1 s in: 17 48 /);
  const smooth = analyzeBoot(lobbyBoot([143], 2), trace(), MARK);
  assert.equal(smooth.lobby.roughTill, 0);
  const endless = analyzeBoot(lobbyBoot([60], 2), trace(), MARK);
  assert.equal(endless.lobby.roughTill, null);
  const rounds = bootRoundsText([findings, smooth, endless].map((boot) => ({ group: 'x', findings: boot })));
  assert.match(rounds, /\n {4}the lobby's fewest frames a second 60 \(17–143\); 2 of 3 short of the screen's /);
  assert.match(rounds, /rate, till 1\.75 \(1\.75–1\.75 s\) in \(1 to the end\)\n/);
});

test('counts the lobby\'s frames till Start was pressed, and none for a lobby watched under a second', () => {
  const pressed = lobbyBoot([143, 17], 3);
  pressed.pressed = 1900;
  assert.equal(analyzeBoot(pressed, trace(), MARK).lobby.fewest.count, 143);
  const short = lobbyBoot([143], 3);
  short.pressed = 1500;
  const findings = analyzeBoot(short, trace(), MARK);
  assert.equal(findings.lobby, null);
  assert.doesNotMatch(bootText({ name: 'x', notes: [], findings }), /the lobby's frames/);
});

test('the lobby\'s canary holds up each of its frames for the second that is counted', () => {
  const page = String(bootRecording);
  assert.match(page, /if \(now - from < 1000\) requestAnimationFrame\(frame\)/);
  assert.ok(page.includes('holdLobby(performance.now())'));
});

test('lists the GPU process\'s main thread\'s work in each step apart', () => {
  const gpu = { pid: 7, tid: 70 };
  const events = [
    ...trace(),
    { ph: 'M', name: 'process_name', pid: gpu.pid, args: { name: 'GPU Process' } },
    { ph: 'M', name: 'thread_name', ...gpu, args: { name: 'CrGpuMain' } },
    workAt('MainLinkLoadEvent::wait', gpu, 350, 120),
  ];
  const findings = analyzeBoot(record(), events, MARK);
  const arena = findings.steps[2];
  assert.deepEqual(arena.gpuMain, [{ name: 'MainLinkLoadEvent::wait', thread: 'GPU Process CrGpuMain', ms: 120 }]);
  assert.deepEqual(findings.steps[1].gpuMain, []);
  const text = bootText({ name: 'x', notes: [], findings });
  assert.match(text, /\n {4}the GPU process's main thread's, ms: 120\.0 MainLinkLoadEvent::wait on GPU Process /);
});

test('lists the main thread\'s waits on the GPU\'s process in each step, and holds the game\'s steps to a budget', () => {
  const other = { pid: 9, tid: 92 };
  const events = [
    ...trace(),
    // (the loading screen's context made, before the game's first step: listed, not held to the budget)
    workAt('CommandBufferProxyImpl::WaitForGetOffset', PAGE, 130, 500),
    // (in the arena's step: a finish and the wait inside it, counted once; a short read; another thread's, never)
    workAt('CommandBufferHelper::Finish', PAGE, 350, 300),
    workAt('CommandBufferProxyImpl::WaitForGetOffset', PAGE, 360, 280),
    workAt('CommandBufferProxyImpl::WaitForToken', PAGE, 700, 150),
    workAt('CommandBufferProxyImpl::WaitForGetOffset', other, 400, 900),
  ];
  const findings = analyzeBoot(record(), events, MARK);
  const [, loading, arena] = findings.steps;
  assert.equal(loading.gpuWaits.count, 1);
  assert.equal(arena.gpuWaits.count, 2);
  assert.equal(arena.gpuWaits.ms, 450);
  assert.deepEqual(arena.gpuWaits.longest.map((wait) => [wait.task, wait.at, wait.ms]), [
    ['CommandBufferHelper::Finish', 350, 300],
    ['CommandBufferProxyImpl::WaitForToken', 700, 150],
  ]);
  const measure = { name: 'x', notes: [], findings };
  const text = bootText(measure);
  assert.match(text, /the main thread waited on the GPU's process 2 times, 450 ms in all; the longest: 300 ms at /);
  assert.match(text, /1 times, 500 ms in all \(before the first step of the game: not held to the budget\)/);
  assert.deepEqual(gpuWaitProblems(measure, 400), [
    'x: Forging the arena: the main thread waited on the GPU\'s process 450 ms (most 400 ms)',
  ]);
  assert.deepEqual(gpuWaitProblems(measure, 450), []);
});

test('a boot with no wait on the GPU\'s process says nothing of them', () => {
  const findings = analyzeBoot(record(), trace(), MARK);
  assert.equal(findings.steps[2].gpuWaits.count, 0);
  const measure = { name: 'x', notes: [], findings };
  assert.doesNotMatch(bootText(measure), /waited on the GPU/);
  assert.deepEqual(gpuWaitProblems(measure, 0), []);
});

test('lists no maps for a build that times none', () => {
  const untimed = record();
  delete untimed.maps;
  const findings = analyzeBoot(untimed, trace(), MARK);
  assert.equal(findings.maps, null);
  assert.doesNotMatch(bootText({ name: 'x', notes: [], findings }), /maps made/);
  assert.doesNotMatch(bootRoundsText([{ group: 'x', findings }]), /maps done/);
});
