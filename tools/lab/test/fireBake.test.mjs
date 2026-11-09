// The fire's loop (src/world/fireBake.ts) within what it may take: kept and on the GPU (its whole loop on the GPU was
// 23 MB, the game's download 3 MB, and passed two reviews unmeasured), none of its flame cut off outside its box, and
// every frame read back whole. The bake itself runs here, about 4 s.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bakeFlames, BUDGET_KB, decodeFrame, FRAME_CELLS, LOOP, loopSizesKb } from '../../../src/world/fireBake.ts';

const baked = bakeFlames();

test('the fire\'s loop is within its budget, kept and on the GPU', () => {
  const sizes = loopSizesKb(baked);
  assert.ok(sizes.kept <= BUDGET_KB.kept, `kept ${sizes.kept.toFixed(0)} KB, over ${BUDGET_KB.kept}`);
  assert.ok(sizes.gpu <= BUDGET_KB.gpu, `on the GPU ${sizes.gpu.toFixed(0)} KB, over ${BUDGET_KB.gpu}`);
});

test('none of the fire\'s flame falls outside its kept box', () => {
  assert.ok(baked.outside <= 0.001, `${(baked.outside * 100).toFixed(2)}% cut off: widen KEPT`);
});

test('every frame of the loop decodes to its whole box, with flame in it', () => {
  const cells = new Uint8Array(FRAME_CELLS);
  for (let frame = 0; frame < LOOP.frames; frame++) {
    decodeFrame(baked, frame, cells);
    assert.ok(cells.some((life) => life > 0), `frame ${frame} is empty`);
  }
});

test('a frame read with a run cut short throws (the canary)', () => {
  const cut = { ...baked, starts: baked.starts.slice() };
  cut.starts[1] -= 2;
  assert.throws(() => decodeFrame(cut, 0, new Uint8Array(FRAME_CELLS)));
});
