// `lab lobbystart`'s sums of the lobby's frames (page/lobbyFrames.ts): the work behind the lobby a frame, the frame
// that held the most, each warm-up's slices and the stretches of the lobby's first seconds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FrameWork, behindOf, quantile, slowestSlices } from '../page/lobbyFrames.ts';

/** A frame read: its own work, the queue's building, the warm-ups' slices `[need, part, ms]` and what held the page
 *  after it (their sum unless given: a slice that awaited a worker held it less). */
const read = (frame, building, slices = [], between = slices.reduce((sum, [, , ms]) => sum + ms, 0)) => ({
  frame,
  building,
  between,
  slices: slices.map(([need, part, ms]) => ({ need, part, ms })),
});

test('the work behind the lobby is the queue\'s building and what held the page after the frame', () => {
  assert.equal(behindOf(read(5, 2, [['fight', 'brute', 3], ['heroes', 'mage', 1.5]])), 6.5);
  assert.equal(behindOf(read(5, 0)), 0);
  // (a slice that awaited a worker's reply for 190 ms held the page for 4)
  assert.equal(behindOf(read(5, 1, [['heroes', 'mage', 190]], 4)), 5);
});

test('a quantile of nothing is 0, of one value that value', () => {
  assert.equal(quantile([], 0.9), 0);
  assert.equal(quantile([4], 0.5), 4);
  assert.equal(quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9), 10);
});

test('the frame holding the most behind the lobby is kept, its parts largest first', () => {
  const work = new FrameWork(2, 4);
  work.add(read(5, 2));
  work.add(read(6, 2, [['heroes', 'hall heroes', 12]]));
  work.add(read(5, 1, [['fight', 'brute', 3]]));
  assert.equal(work.frames, 3);
  assert.equal(work.longest.at, 1);
  assert.equal(work.longest.behind, 14);
  assert.equal(work.longest.what, 'heroes hall heroes 12.0, the queue\'s building 2.0');
});

test('each warm-up\'s slices are summed by need, and the slowest named', () => {
  const work = new FrameWork(2, 4);
  work.add(read(5, 0, [['fight', 'brute', 3], ['fight', 'husk', 4]]));
  work.add(read(5, 0, [['rooms', 'room library', 2]]));
  const lines = work.byNeed();
  assert.deepEqual(lines, [
    'fight: 2 slices, 7 ms in all, the longest 4.0 ms',
    'rooms: 1 slices, 2 ms in all, the longest 2.0 ms',
  ]);
  assert.equal(slowestSlices(work.slices), 'fight husk 4.0, fight brute 3.0, rooms room library 2.0');
});

test('a stretch with no frames isn\'t said', () => {
  const work = new FrameWork(2, 4);
  work.add(read(5, 1));
  const lines = work.lines(12);
  assert.ok(lines.some((line) => line.startsWith('its first 2 s (1 frames)')));
  assert.ok(!lines.some((line) => line.startsWith('2 to 10 s')));
  assert.ok(!lines.some((line) => line.startsWith('after')));
});

test('no slices at all are said as none', () => {
  assert.equal(slowestSlices([]), 'none');
  assert.equal(new FrameWork(2, 4).longest.what, 'nothing');
});
