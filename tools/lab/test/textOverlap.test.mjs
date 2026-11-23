// Text drawn over other text (page/textOverlap.ts): the boxes' shared area, and which pairs count.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inked, overlapping, shared } from '../page/textOverlap.ts';

const box = (name, left, top, right, bottom) => ({ name, left, top, right, bottom });

test('two boxes share the area both cover, none where they only touch', () => {
  assert.deepEqual(shared(box('a', 0, 0, 10, 10), box('b', 5, 5, 20, 20)), { width: 5, height: 5 });
  assert.deepEqual(shared(box('a', 0, 0, 10, 10), box('b', 10, 0, 20, 10)), { width: 0, height: 0 });
});

test('a class name run on over a stat\'s label is found; neighbours a hair apart or a sliver over are not', () => {
  const card = [
    box('Ranger', 120, 40, 200, 54),
    box('Gear level', 180, 44, 250, 56),
    box('Best wave', 262, 44, 330, 56),
    box('1', 205, 20, 215, 42),
  ];
  assert.deepEqual(overlapping(card), ['"Ranger" over "Gear level" (20x10 px)']);
  const apart = [box('Ranger', 120, 40, 179, 54), box('Gear level', 180, 44, 250, 56)];
  assert.deepEqual(overlapping(apart), []);
  const sliver = [box('Ranger', 120, 40, 181, 54), box('Gear level', 180, 44, 250, 56)];
  assert.deepEqual(overlapping(sliver), [], 'a pixel\'s antialiasing is no overlap');
});

test('one text\'s own lines are never counted against each other', () => {
  assert.deepEqual(overlapping([box('Up to 4', 0, 0, 100, 14), box('Up to 4', 0, 10, 100, 24)]), []);
});

test('a line\'s box is cut to its letters: a number over its label, their lines touching, isn\'t an overlap', () => {
  // (as drawn at 1920x1080: the number's line 22 px tall, the label's 14, touching by 2 px)
  const number = inked(box('1', 205, 20, 215, 42));
  const label = inked(box('Gear level', 180, 40, 250, 54));
  assert.deepEqual(overlapping([number, label]), []);
  assert.equal(inked(box('a', 0, 0, 10, 20)).top, 3);
});
