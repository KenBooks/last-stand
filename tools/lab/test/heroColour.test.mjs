// Allocation is serialized by the host: live requests cannot evict a colour's current owner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HERO_COLOURS } from '../../../src/data/heroColours.ts';
import { freeColour, changedColour, roomColoursOf } from '../../../src/net/heroColour.ts';

test('twelve stable colour IDs retain existing choices and allocate only unused colours', () => {
  assert.equal(HERO_COLOURS.length, 12);
  assert.equal(new Set(HERO_COLOURS.map(c => c.id)).size, 12);
  const taken = HERO_COLOURS.slice(0, 11).map(c => c.id);
  assert.equal(freeColour(taken, taken[0], 0), HERO_COLOURS[11].id);
  assert.equal(freeColour(['red'], 'teal'), 'teal');
});

test('competing live requests keep the loser in its current colour without replacing the owner', () => {
  const first = changedColour(['red', 'blue'], 'rose', 'green');
  const second = changedColour(['red', first], 'rose', 'blue');
  assert.equal(first, 'rose');
  assert.equal(second, 'blue');
  assert.notEqual(changedColour(['red'], null, 'blue'), 'red');
});

test('host snapshots reject duplicate colours, duplicate slots, unknown IDs and invalid slots', () => {
  const host = { slot: 0, col: 'red' };
  assert.deepEqual([...roomColoursOf([host, { slot: 1, col: 'teal' }], 4)], [[0, 'red'], [1, 'teal']]);
  for (const invalid of [null, [], [host, host], [{ slot: 1, col: 'red' }],
    [host, { slot: 1, col: 'red' }], [host, { slot: 1, col: 'unknown' }],
    [host, { slot: -1, col: 'blue' }], [host, { slot: 4, col: 'blue' }], [host, { slot: 0.5, col: 'blue' }]]) {
    assert.equal(roomColoursOf(invalid, 4), null);
  }
});
