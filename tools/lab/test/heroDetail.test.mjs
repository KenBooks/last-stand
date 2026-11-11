// An Auto change between pieces must neither change an in-flight model nor leak its detail into other builds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { atHeroDetail, heroDetail, setHeroDetail } from '../../../src/entities/models/detail.ts';

test('interleaved model builds keep their detail and restore the current Auto level after each piece', () => {
  const seen = [];
  function* model() { seen.push(heroDetail()); yield; seen.push(heroDetail()); return heroDetail(); }
  const low = atHeroDetail(model(), 0.35), high = atHeroDetail(model(), 1);
  setHeroDetail(0.6);
  low.next(); high.next();
  assert.equal(heroDetail(), 0.6);
  setHeroDetail(0.2);
  assert.equal(low.next().value, 0.35);
  assert.equal(high.next().value, 1);
  assert.deepEqual(seen, [0.35, 1, 0.35, 1]);
  assert.equal(heroDetail(), 0.2);
});

test('a failed model piece restores the live detail', () => {
  function* model() { throw new Error('bad piece'); }
  setHeroDetail(0.6);
  assert.throws(() => atHeroDetail(model(), 1).next(), /bad piece/);
  assert.equal(heroDetail(), 0.6);
});
