// Initial hero construction must let the loading page handle input between its model's existing pieces.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { builtInSlices } from '../../../src/entities/models/steps.ts';

test('a sliced build preserves all pieces and its result while yielding at its time budget', async () => {
  let clock = 0;
  const made = [];
  const pauses = [];
  function* model() {
    for (let piece = 0; piece < 10; piece++) {
      made.push(piece);
      clock += 3;
      yield;
    }
    return { complete: true };
  }
  const result = await builtInSlices(model(), async () => { pauses.push(made.length); }, 12, () => clock);
  assert.deepEqual(made, Array.from({ length: 10 }, (_, index) => index));
  assert.deepEqual(pauses, [4, 8]);
  assert.deepEqual(result, { complete: true });
});

test('a single expensive piece yields immediately afterward instead of running the next piece', async () => {
  let clock = 0;
  let canContinue = false;
  function* model() {
    clock += 50;
    yield;
    assert.equal(canContinue, true);
    return 'ready';
  }
  assert.equal(await builtInSlices(model(), async () => { canContinue = true; }, 12, () => clock), 'ready');
});

test('a failed build rejects instead of returning a partial hero', async () => {
  function* model() {
    yield;
    throw new Error('construction failed');
  }
  await assert.rejects(builtInSlices(model(), async () => {}, 12, () => 0), /construction failed/);
});
