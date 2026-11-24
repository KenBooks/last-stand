// What took a frame past the light budget, as `cast` says it (page/budgetLines.ts): the things that lowered a measure
// most when taken out, and the line it makes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { breakdownLine, keyOf, mostLowering } from '../page/budgetLines.ts';

/** The brightest sixteenth as `cast` reads it: a whole number. */
const SIXTEENTH = { name: 'its brightest sixteenth', read: () => 0, shown: (value) => value.toFixed(0) };

/** Glacial Nova's brightest sixteenth over the shoulder, as `cast` took it apart. */
const NOVA = {
  whole: 163,
  without: [
    { name: 'particles: glow', value: 159 },
    { name: 'shockwave (2)', value: 146 },
    { name: 'hero mage', value: 163 },
    { name: 'ground flash', value: 129 },
    { name: 'frost decal', value: 150 },
    { name: 'husk (2)', value: 164 },
  ],
  castsOwn: { value: 31, count: 11 },
};

test('a crowd is known by its name without its count', () => {
  assert.equal(keyOf('husk (4)'), 'husk');
  assert.equal(keyOf('ground flash'), 'ground flash');
  assert.equal(keyOf('crypt: unnamed Mesh (CircleGeometry, MeshStandardMaterial) (19)'),
    'crypt: unnamed Mesh (CircleGeometry, MeshStandardMaterial)');
});

test('the things that lowered it most come first, and none that left it or raised it', () => {
  const names = mostLowering(NOVA).map((thing) => thing.name);
  assert.deepEqual(names, ['ground flash', 'shockwave (2)', 'frost decal', 'particles: glow']);
});

test('at most five things are listed', () => {
  const without = Array.from({ length: 8 }, (_, i) => ({ name: `thing ${i}`, value: 100 - i }));
  assert.equal(mostLowering({ whole: 120, without, castsOwn: { value: 0, count: 8 } }).length, 5);
});

test('the line says each thing\'s reading without it and its drop, the cast\'s together and before the press', () => {
  const line = breakdownLine(SIXTEENTH, NOVA, 31);
  assert.match(line, /^ {6}its brightest sixteenth 163; without ground flash 129 \(-34\); shockwave \(2\) 146 \(-17\)/);
  assert.match(line, /without the cast's 11 things together 31 \(-132\); before the press 31$/);
});

test('a frame no one thing lowers says so', () => {
  const steady = { whole: 90, without: [{ name: 'hero mage', value: 90 }], castsOwn: { value: 95, count: 1 } };
  assert.match(breakdownLine(SIXTEENTH, steady, 80), /without no one thing lowers it; without the cast's 1 things together 95 \(\+5\)/);
});
