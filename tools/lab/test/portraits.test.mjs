// Portrait choices are bounded, class-specific preferences; peers cannot name arbitrary image resources.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  portraitIds, portraitId, savedPortrait, savePortrait, portraitOf, receivePortrait,
} from '../../../src/net/portraits.ts';

const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const values = new Map();
let unavailable = false;
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem(key) { if (unavailable) throw new Error('blocked'); return values.get(key) ?? null; },
  setItem(key, value) { if (unavailable) throw new Error('blocked'); values.set(key, value); },
  removeItem(key) { if (unavailable) throw new Error('blocked'); values.delete(key); },
} });
after(() => {
  if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
  else delete globalThis.localStorage;
});

test('five coordinated male portraits per class, with none for an unknown class', () => {
  const all = ['mage', 'warrior', 'ranger'].flatMap(portraitIds);
  assert.equal(all.length, 15);
  assert.equal(new Set(all).size, 15);
  assert.equal(portraitIds('mage')[0], 'mage-11');
  assert.deepEqual(portraitIds('mage'), ['mage-11', 'mage-12', 'mage-13', 'mage-14', 'mage-15']);
  assert.deepEqual(portraitIds('warrior'), ['warrior-11', 'warrior-12', 'warrior-13', 'warrior-14', 'warrior-15']);
  assert.deepEqual(portraitIds('ranger'), ['ranger-11', 'ranger-12', 'ranger-13', 'ranger-14', 'ranger-15']);
  assert.deepEqual(portraitIds('unknown'), []);
});

test('URLs, unknown IDs, wrong classes and malformed values are rejected', () => {
  for (const invalid of ['https://example.com/x.webp', '../mage-01', 'mage-00', 'mage-16', 'mage-1', 'mage-02', 'warrior-02', {}, 1]) {
    assert.equal(portraitId(invalid, 'mage'), null);
  }
  assert.equal(portraitId('ranger-01', 'mage'), null);
  assert.equal(portraitId('mage-11', 'mage'), 'mage-11');
});

test('corrupt saved choices default to None; each class remembers its own optional preference', () => {
  values.set('last-stand.portrait.mage.v1', 'mage-02');
  assert.equal(savedPortrait('mage'), null);
  assert.equal(savePortrait('mage', 'mage-13'), true);
  assert.equal(values.get('last-stand.portrait.mage.v1'), 'mage-13');
  assert.equal(savePortrait('warrior', 'warrior-15'), true);
  const local = { local: true, cls: { id: 'mage' } };
  assert.equal(portraitOf(local), 'mage-13');
  local.cls.id = 'warrior';
  assert.equal(portraitOf(local), 'warrior-15');
  local.cls.id = 'mage';
  assert.equal(portraitOf(local), 'mage-13');
  assert.equal(savePortrait('mage', null), true);
  assert.equal(portraitOf(local), null);
  assert.equal(values.has('last-stand.portrait.mage.v1'), false);
  assert.equal(savedPortrait('warrior'), 'warrior-15');
});

test('peer changes, clearing, class rebuilding and invalid reports preserve valid state', () => {
  const partner = { local: false, cls: { id: 'mage' } };
  assert.equal(portraitOf(partner), null);
  assert.equal(receivePortrait(partner, 'mage-13'), true);
  assert.equal(receivePortrait(partner, 'mage-13'), false);
  assert.equal(receivePortrait(partner, 'warrior-02'), false);
  assert.equal(receivePortrait(partner, 'https://example.com/a.webp'), false);
  assert.equal(receivePortrait(partner, undefined), false);
  assert.equal(portraitOf(partner), 'mage-13');
  assert.equal(receivePortrait(partner, null), true);
  assert.equal(portraitOf(partner), null);
  const rebuilt = { local: false, cls: { id: 'warrior' } };
  assert.equal(portraitOf(rebuilt), null);
  assert.equal(receivePortrait(rebuilt, 'mage-02'), false);
});

test('blocked storage does not prevent choosing a portrait for the current session', () => {
  unavailable = true;
  try {
    assert.equal(savedPortrait('ranger'), null);
    assert.equal(savePortrait('ranger', 'ranger-13'), true);
    assert.equal(savedPortrait('ranger'), 'ranger-13');
    assert.equal(savePortrait('ranger', 'ranger-99'), false);
    assert.equal(savedPortrait('ranger'), 'ranger-13');
  } finally {
    unavailable = false;
  }
});
