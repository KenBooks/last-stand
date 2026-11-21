// What a picture of a hand shows through it (page/seeThrough.ts): its back faces and the backdrop it closes round.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seenThrough } from '../page/seeThrough.ts';

const BACKDROP = [90, 95, 102];
const FRONT = [61, 111, 224];
const BACK = [224, 64, 46];

/** A `size` square picture of backdrop with `paint(x, y)` giving a pixel's colour where it isn't. */
function picture(size, paint) {
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const colour = paint(x, y) ?? BACKDROP;
      pixels.set([...colour, 255], (y * size + x) * 4);
    }
  }
  return pixels;
}

/** A solid square from 2 to 7 of a 10 picture. */
const solid = (x, y) => (x >= 2 && x <= 7 && y >= 2 && y <= 7 ? FRONT : null);

test('a solid shape shows nothing through it', () => {
  const seen = seenThrough(picture(10, solid), 10, 10, BACKDROP, 2);
  assert.deepEqual(seen, { inside: 0, holes: 0, drawn: 36 });
});

test('a ring closed round the backdrop shows a hole', () => {
  const ring = (x, y) => (x >= 4 && x <= 5 && y >= 4 && y <= 5 ? null : solid(x, y));
  const seen = seenThrough(picture(10, ring), 10, 10, BACKDROP, 2);
  assert.equal(seen.holes, 4);
  assert.equal(seen.inside, 0);
});

test('a notch open to the edge is not a hole', () => {
  const notch = (x, y) => (x >= 4 && x <= 5 && y >= 2 && y <= 5 ? null : solid(x, y));
  assert.equal(seenThrough(picture(10, notch), 10, 10, BACKDROP, 2).holes, 0);
});

test('back faces count as the inside seen, shaded or not', () => {
  const shade = 0.5;
  const dim = BACK.map((channel) => Math.round(channel * shade));
  const inside = (x, y) => (x === 3 && y === 3 ? BACK : x === 6 && y === 6 ? dim : solid(x, y));
  assert.equal(seenThrough(picture(10, inside), 10, 10, BACKDROP, 2).inside, 2);
});
