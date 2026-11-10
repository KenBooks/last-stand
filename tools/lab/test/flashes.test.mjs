// The flashes counted in a run of frames (page/flashes.ts), as WCAG 2 counts them: a pair of opposing changes of a
// tenth of white or more, the darker end under 0.8.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeSpans, worstFlashing } from '../page/flashes.ts';

const FRAME = 1 / 60;

/** One cell's lights, frame by frame, as the frames' cells (a single cell each). */
const oneCell = (lights) => lights.map((light) => [light]);

/** A light switching between `dark` and `lit` every `span` frames, `frames` long. */
function strobe(frames, span, dark, lit) {
  return Array.from({ length: frames }, (_, f) => (Math.floor(f / span) % 2 ? lit : dark));
}

test('a steady light has no flashes', () => {
  const lights = oneCell(Array.from({ length: 120 }, () => 0.3));
  assert.equal(worstFlashing(lights, FRAME).most, 0);
});

test('a strobe of five cycles a second is five flashes in a second', () => {
  const lights = oneCell(strobe(120, 6, 0.05, 0.5));
  assert.equal(worstFlashing(lights, FRAME).most, 5);
});

test('changes under a tenth of white are no flashes', () => {
  const lights = oneCell(strobe(120, 6, 0.2, 0.28));
  assert.equal(worstFlashing(lights, FRAME).most, 0);
});

test('a slow rise and fall over several frames is one flash', () => {
  const ramp = [0, 0.03, 0.06, 0.09, 0.12, 0.15, 0.12, 0.09, 0.06, 0.03, 0];
  const lights = oneCell([...ramp, ...Array.from({ length: 50 }, () => 0)]);
  assert.equal(worstFlashing(lights, FRAME).most, 1);
});

test('changes between lights over 0.8 of white are no flashes', () => {
  const lights = oneCell(strobe(120, 6, 0.85, 1));
  assert.equal(worstFlashing(lights, FRAME).most, 0);
});

test('the worst cell is the one that flashes, and when its second started', () => {
  const steady = Array.from({ length: 120 }, () => 0.3);
  const flashing = [...Array.from({ length: 60 }, () => 0.05), ...strobe(60, 6, 0.05, 0.5)];
  const frames = steady.map((light, f) => [light, flashing[f]]);
  const worst = worstFlashing(frames, FRAME);
  assert.equal(worst.cell, 1);
  assert.equal(worst.most, 4);
  assert.ok(Math.abs(worst.at - 66 * FRAME) < 1e-9);
  assert.equal(worst.changes.length, 8);
  assert.deepEqual(worst.changes.slice(0, 2), [{ frame: 66, rising: true }, { frame: 72, rising: false }]);
});

test('a change comes from the darkest frame before a rise and the brightest before a fall', () => {
  // (dark at frame 3, lit by 6, brightest at 8, dark again by 11)
  const lights = [0.3, 0.25, 0.2, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.5, 0.3, 0.2];
  const changes = [{ frame: 6, rising: true }, { frame: 11, rising: false }];
  assert.deepEqual(changeSpans(changes, lights), [
    { from: 3, to: 6, rising: true },
    { from: 8, to: 11, rising: false },
  ]);
});

test('a first change is looked for its start no further back than half a second', () => {
  const lights = Array.from({ length: 100 }, (_, f) => (f < 10 ? 0 : f < 90 ? 0.2 : 0.6));
  const [span] = changeSpans([{ frame: 90, rising: true }], lights);
  assert.equal(span.from, 60);
});
