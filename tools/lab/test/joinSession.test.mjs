// `lab join`'s command line read into what the game's steps take (node/joinSession.mjs): `set`'s name=value words
// and `picture`'s camera. The link and the held process are checked end to end by `lab invite`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pictureArgs, STEPS, valueOf, valuesOf } from '../node/joinSession.mjs';

test('a typed value is true, false, a number, else its text', () => {
  assert.equal(valueOf('true'), true);
  assert.equal(valueOf('off'), false);
  assert.equal(valueOf('0.25'), 0.25);
  assert.equal(valueOf('-3'), -3);
  assert.equal(valueOf('forest'), 'forest');
  assert.equal(valueOf(''), '');
});

test('set takes name=value words, a part of the frame\'s name with its colon and spaces, a value with an =', () => {
  assert.deepEqual(valuesOf(['god=true', 'wave=12', 'part:the particles=false', 'biome=forest']),
    { god: true, wave: 12, 'part:the particles': false, biome: 'forest' });
  assert.deepEqual(valuesOf(['style=a=b']), { style: 'a=b' });
  assert.deepEqual(valuesOf([]), {});
  assert.throws(() => valuesOf(['god']), /name=value/);
});

test('a picture is the player\'s view unless a camera is placed, which needs its place', () => {
  assert.deepEqual(pictureArgs({}), { format: 'jpeg' });
  assert.deepEqual(pictureArgs({ png: true, side: 640 }), { format: 'png', side: 640 });
  assert.deepEqual(pictureArgs({ at: ['1', '2', '-3'], to: ['0', '1', '0'], keep: true }),
    { format: 'jpeg', camera: { at: [1, 2, -3], to: [0, 1, 0] }, keep: true });
  assert.deepEqual(pictureArgs({ at: ['1', '2', '3'], yaw: 0.5 }).camera, { at: [1, 2, 3], yaw: 0.5, pitch: 0 });
  assert.throws(() => pictureArgs({ to: ['0', '1', '0'] }), /--at/);
  assert.throws(() => pictureArgs({ keep: true }), /--at/);
  assert.throws(() => pictureArgs({ at: ['1', '2'] }), /three numbers/);
});

test('no step is a word a code could be', () => {
  // (the relay's codes are 32 characters of base64url)
  for (const step of STEPS) assert.ok(step.length < 32);
});
