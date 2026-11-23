// A point carried into a skirt's space by world matrices made once a pass lands where three's `localToWorld` and
// `worldToLocal` put it, to the bit: the skirt's limbs are placed so (armor.ts), and a pose must not move.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { freshLocal, freshPass, freshWorld } from '../../../src/entities/models/freshWorld.ts';

/** a seeded random number in [0, 1), the same every run */
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/** an object with a place, a turn and a scale of `random`'s, under `parent` */
function jointUnder(parent, random) {
  const joint = new THREE.Object3D();
  joint.position.set(random() - 0.5, random() * 0.4, random() - 0.5);
  joint.rotation.set(random() * 3, random() * 3, random() * 3);
  joint.scale.setScalar(0.8 + random() * 0.4);
  parent.add(joint);
  return joint;
}

/** a body: a root, two chains of six joints off it (the limbs) and one of two (the skirt's space) */
function body(random) {
  const root = new THREE.Object3D();
  root.position.set(3.2, 0.1, -7.4);
  const limbs = [];
  for (let chain = 0; chain < 2; chain++) {
    let parent = root;
    for (let at = 0; at < 6; at++) {
      parent = jointUnder(parent, random);
      limbs.push(parent);
    }
  }
  const space = jointUnder(jointUnder(root, random), random);
  return { root, limbs, space };
}

/** each of `points` on its joint carried into `space`, as three carries it (its own matrices made for each) */
function asThree(space, points) {
  return points.map(([joint, point]) => space.worldToLocal(joint.localToWorld(point.clone())));
}

/** each of `points` on its joint carried into `space` by matrices made once a pass */
function asFresh(space, points) {
  freshPass();
  const local = freshLocal(space);
  return points.map(([joint, point]) => point.clone().applyMatrix4(freshWorld(joint)).applyMatrix4(local));
}

/** whether two lists of points are the same to the bit */
function sameBits(one, other) {
  return one.every((point, at) => ['x', 'y', 'z'].every((axis) => Object.is(point[axis], other[at][axis])));
}

test('points carried by matrices made once a pass land to the bit where three puts them', () => {
  const random = seeded(7);
  const { root, limbs, space } = body(random);
  const points = limbs.flatMap((joint) => [[joint, new THREE.Vector3(random(), random(), random())]]);
  // (fresh first: three's own then finds nothing stale either way)
  const fresh = asFresh(space, points);
  const three = asThree(space, points);
  assert.ok(sameBits(fresh, three));
  // (a joint moved between passes: the next pass makes its matrices again)
  limbs[3].rotation.x += 0.3;
  root.position.x += 0.5;
  const movedFresh = asFresh(space, points);
  const movedThree = asThree(space, points);
  assert.ok(sameBits(movedFresh, movedThree));
  assert.ok(!sameBits(movedFresh, fresh));
});

test('the canary: a joint moved within a pass is not seen until the next pass begins', () => {
  const random = seeded(11);
  const { limbs, space } = body(random);
  const points = [[limbs[5], new THREE.Vector3(0.1, 0.2, 0.3)]];
  freshPass();
  const local = freshLocal(space);
  const before = points[0][1].clone().applyMatrix4(freshWorld(limbs[5])).applyMatrix4(local);
  limbs[2].rotation.y += 0.5;
  const stale = points[0][1].clone().applyMatrix4(freshWorld(limbs[5])).applyMatrix4(local);
  assert.ok(sameBits([stale], [before]));
  assert.ok(!sameBits(asFresh(space, points), [before]));
});
