// A patch's slivers told from the patch (page/thinBright.ts): the brightest few pixels' mean, which a sliver under a
// pixel wide moves where the share of pixels standing out barely does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { standsOut, TOP_SHARE } from '../page/thinBright.ts';

/** A patch of `count` pixels at `dark`, `lit` of them at `bright`. */
function patch(count, dark, lit, bright) {
  return Array.from({ length: count }, (_, at) => (at < lit ? bright : dark));
}

test('a plain patch has nothing standing out, and its brightest are as the rest', () => {
  const found = standsOut(patch(2000, 0.01, 0, 0), 3, 0.012);
  assert.equal(found.share, 0);
  assert.ok(Math.abs(found.top - 0.01) < 1e-6);
  assert.ok(Math.abs(found.median - 0.01) < 1e-6);
});

test('a sliver lights few pixels: its share stays small, the brightest pixels\' mean tells it', () => {
  const dim = standsOut(patch(2000, 0.001, 12, 0.03), 3, 0.012);
  const bright = standsOut(patch(2000, 0.001, 12, 0.4), 3, 0.012);
  assert.equal(dim.share, bright.share, 'the share is the same however bright the sliver');
  assert.ok(bright.share < 0.01);
  assert.ok(Math.abs(dim.top - 0.03) < 1e-6 && Math.abs(bright.top - 0.4) < 1e-6);
});

test('one hot pixel is averaged with the brightest beside it', () => {
  const count = 2000;
  const found = standsOut(patch(count, 0, 1, 1), 3, 0.012);
  assert.equal(found.most, 1);
  assert.ok(Math.abs(found.top - 1 / Math.round(count * TOP_SHARE)) < 1e-6);
});

test('a black patch counts no noise of its own, and an empty one reads nothing', () => {
  assert.equal(standsOut(patch(1000, 0.004, 0, 0).map((v, at) => v + (at % 2) * 0.004), 3, 0.012).share, 0);
  assert.deepEqual(standsOut([], 3, 0.012), { median: 0, most: 0, share: 0, top: 0 });
});
