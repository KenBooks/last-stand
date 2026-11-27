// The engine's order of what blends (page/blendedOrderKeys.ts), as Bulwark's plan.rs makes it, and the pairs whose
// order turns round between two stands of the camera while they overlap on the screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawnBefore, flipsBetween, sphereOfPositions, turnsBroken } from '../page/blendedOrderKeys.ts';

const RECT = { left: 0, top: 0, right: 100, bottom: 100 };

/** A record at (x, y, z) of `radius`, thinned or not. */
function record(name, x, y, z, radius, thinned = true) {
  return { name, thinned, adds: false, sphere: { x, y, z, radius }, rect: RECT };
}

test('a sphere is its box\'s middle and the farthest point from it', () => {
  const sphere = sphereOfPositions([0, 0, 0, 2, 0, 0, 2, 4, 0]);
  assert.deepEqual([sphere.x, sphere.y, sphere.z], [1, 2, 0]);
  assert.equal(sphere.radius, Math.sqrt(5));
});

test('the thinned are drawn first, then the farthest', () => {
  const eye = { x: 0, y: 0, z: 0 };
  const near = record('near', 1, 0, 0, 0.1);
  const far = record('far', 5, 0, 0, 0.1, false);
  assert.equal(drawnBefore(near, 0, far, 1, eye), true);
  assert.equal(drawnBefore(record('a', 5, 0, 0, 0.1), 1, near, 0, eye), true);
});

test('a tall record and a low one swap turns as the eye rises, and the swap is found', () => {
  const stands = [0.5, 6].map((height) => ({
    eye: { x: 6, y: height, z: 0 },
    records: [record('plinths', 0, 0.2, 0, 6.9), record('shafts', 0, 3, 0, 7.1)],
  }));
  assert.equal(flipsBetween(stands, 0, 0).length, 1);
});

test('records with one sphere keep the order they are met in', () => {
  const stands = [0.5, 6].map((height) => ({
    eye: { x: 6, y: height, z: 0 },
    records: [record('plinths', 0, 2, 0, 7.1), record('shafts', 0, 2, 0, 7.1)],
  }));
  assert.equal(flipsBetween(stands, 0, 0).length, 0);
});

test('two that add light are never a flip, nor two apart on the screen', () => {
  const adds = (name, y) => ({ ...record(name, 0, y, 0, 1), adds: true });
  const apart = (name, y, left) => ({ ...record(name, 0, y, 0, 1), rect: { ...RECT, left, right: left + 10 } });
  for (const make of [(name, y) => adds(name, y), (name, y) => apart(name, y, name === 'a' ? 0 : 50)]) {
    const stands = [0, 6].map((height) => ({ eye: { x: 4, y: height, z: 0 }, records: [make('a', 0), make('b', 5)] }));
    assert.equal(flipsBetween(stands, 0, 0).length, 0);
  }
});

test('a set drawn out of its turns is found, and one in them is not', () => {
  const part = (name, radius, at) => ({ ...record(name, 0, 2, 0, radius), turn: { set: 0, at } });
  const eye = { x: 6, y: 3, z: 0 };
  const inTurns = { eye, records: [part('shafts', 7.0, 1), part('plinths', 7.01, 0)] };
  const outOfTurns = { eye, records: [part('shafts', 7.0, 1), part('plinths', 7.0, 0)] };
  assert.deepEqual(turnsBroken(inTurns), []);
  assert.deepEqual(turnsBroken(outOfTurns), [0]);
});
