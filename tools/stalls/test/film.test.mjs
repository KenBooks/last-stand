// The stalls' film of a boot's exit (tools/stalls `--film`): its frames picked and put on the page's clock, the
// flickers found among made-up frames, and the canary's blinks matched to them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apart, blinksFound, filmFrames, flickersOf } from '../film.mjs';
import { REVEALED } from '../analyze.mjs';

/** A frame of four pixels all `grey`. */
const flat = (grey) => [grey, grey, grey, grey];
/** A fade: `count` frames from `from`, `step` greys a frame. */
const fade = (count, from = 100, step = -2) => Array.from({ length: count }, (_, i) => flat(from + i * step));

test('two frames are as far apart as their mean difference', () => {
  assert.equal(apart([0, 10, 20, 30], [10, 10, 10, 10]), 10);
});

test('a fade, and a step from one picture to another, are no flicker', () => {
  assert.deepEqual(flickersOf(fade(30)), []);
  assert.deepEqual(flickersOf([...fade(10), ...fade(10, 20, 0)]), []);
});

test('a frame unlike those either side is a flicker, as are up to three in a row', () => {
  const frames = fade(20);
  frames[6] = flat(200);
  frames[12] = flat(5);
  frames[13] = flat(5);
  const found = flickersOf(frames);
  assert.deepEqual(found.map(({ first, length }) => [first, length]), [[6, 1], [12, 2]]);
  assert.ok(found.every(({ out }) => out > 50));
});

test('a frame between two flickers is no flicker: the next run is set against frames beside it', () => {
  const frames = fade(20);
  frames[5] = flat(200);
  frames[7] = flat(200);
  assert.deepEqual(flickersOf(frames).map(({ first }) => first), [5, 7]);
});

test('a blink is found by a flicker starting within a moment after it', () => {
  const flickers = [{ at: 40 }, { at: 300 }];
  assert.equal(blinksFound(flickers, [30, 120, 290]), 2);
});

test("the film runs from before the exit to after the loading screen has gone, on the page's clock", () => {
  const record = {
    origin: 1_000_000,
    phases: [{ name: 'the loop started, waiting for smooth frames', at: 900 }, { name: REVEALED, at: 1000 }],
    goneAt: 1900,
  };
  const shots = [300, 600, 1000, 2300, 2500].map((at) => ({ wall: record.origin + at, jpeg: String(at) }));
  const { frames, caught } = filmFrames(record, shots);
  assert.equal(caught, 5);
  assert.deepEqual(frames.map(({ at, jpeg }) => [at, jpeg]), [[600, '600'], [1000, '1000'], [2300, '2300']]);
});

test('the whole boot filmed starts at the page\'s first frame', () => {
  const record = { origin: 1_000_000, phases: [{ name: REVEALED, at: 1000 }], goneAt: 1900 };
  const shots = [300, 600, 2300, 2500].map((at) => ({ wall: record.origin + at, jpeg: String(at) }));
  const { frames } = filmFrames(record, shots, true);
  assert.deepEqual(frames.map(({ at }) => at), [300, 600, 2300]);
});
