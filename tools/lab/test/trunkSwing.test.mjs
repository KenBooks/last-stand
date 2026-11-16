// The trunk against the legs (page/trunkSwing.ts): a body walking as a person does reads its pelvis turning with the
// legs, its shoulders against them, its pelvis tipped and its hips swayed over the foot down; the same body with its
// trunk moved the other way reads every one the wrong way round.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correlation, halfSpan, judgeTrunk, trunkLine } from '../page/trunkSwing.ts';

/** frames a stride, and the strides walked */
const STRIDE = 40;
const STRIDES = 4;
/** half the hips' width and the shoulders' (m) */
const HIP = 0.1;
const SHOULDER = 0.2;

/**
 * A body walking along +z (its left +x) at 1.2 m/s for `STRIDES` strides: the left foot ahead and down as the cycle's
 * sine and cosine have it, the trunk turned, tipped and swayed by `sign` (1 as a person, -1 the other way round).
 */
function walk(sign) {
  const samples = [];
  for (let f = 0; f < STRIDE * STRIDES; f++) {
    const phase = (f / STRIDE) * Math.PI * 2;
    const ahead = 1.2 * f / 60;
    const split = 0.6 * Math.sin(phase);
    const leftDown = Math.cos(phase) > -0.2;
    const rightDown = Math.cos(phase) < 0.2;
    const stance = Math.cos(phase);
    const pelvis = sign * 0.07 * Math.sin(phase);
    const shoulders = -sign * 0.06 * Math.sin(phase);
    const tip = sign * 0.07 * stance;
    const sway = sign * 0.02 * stance;
    const across = (half, turn, y, rise) => [
      { x: sway + half * Math.cos(turn), y: y + rise, z: ahead + half * Math.sin(turn) },
      { x: sway - half * Math.cos(turn), y: y - rise, z: ahead - half * Math.sin(turn) },
    ];
    samples.push({
      planted: [leftDown, rightDown],
      hips: across(HIP, pelvis, 1, HIP * Math.sin(tip)),
      shoulders: across(SHOULDER, shoulders, 1.5, 0),
      ankles: [{ x: 0.1, y: 0.1, z: ahead + split / 2 }, { x: -0.1, y: 0.1, z: ahead - split / 2 }],
    });
  }
  return samples;
}

test('a correlation reads +1 for a series against itself, -1 against its negative and 0 against a flat one', () => {
  const series = [1, 3, 2, 5, 4];
  assert.ok(Math.abs(correlation(series, series) - 1) < 1e-9);
  assert.ok(Math.abs(correlation(series, series.map((value) => -value)) + 1) < 1e-9);
  assert.equal(correlation(series, [2, 2, 2, 2, 2]), 0);
});

test('half the span between the 5th and 95th percentiles is how far a sine swings either way', () => {
  const sine = Array.from({ length: 400 }, (_, i) => 3 * Math.sin(i / 400 * Math.PI * 2));
  assert.ok(Math.abs(halfSpan(sine) - 3) < 0.1);
});

test('a body walking as a person does reads the pelvis with the legs and the shoulders against them', () => {
  const swing = judgeTrunk(walk(1));
  assert.ok(swing.pelvisWithLegs > 0.9, `pelvis ${swing.pelvisWithLegs}`);
  assert.ok(swing.shouldersWithLegs < -0.9, `shoulders ${swing.shouldersWithLegs}`);
  assert.ok(swing.tipWithStance > 0.7, `tip ${swing.tipWithStance}`);
  assert.ok(swing.swayWithStance > 0.7, `sway ${swing.swayWithStance}`);
  assert.ok(Math.abs(swing.pelvisTurn - 4) < 0.6, `pelvis turn ${swing.pelvisTurn}`);
  assert.ok(Math.abs(swing.sway - 2) < 0.3, `sway ${swing.sway}`);
  const unlike = [];
  trunkLine(swing, unlike);
  assert.deepEqual(unlike, []);
});

test('the same body with its trunk moved the other way reads every one against its legs', () => {
  const swing = judgeTrunk(walk(-1));
  assert.ok(swing.pelvisWithLegs < -0.9);
  assert.ok(swing.shouldersWithLegs > 0.9);
  assert.ok(swing.tipWithStance < -0.7);
  assert.ok(swing.swayWithStance < -0.7);
  const unlike = [];
  trunkLine(swing, unlike);
  assert.equal(unlike.length, 4);
});

test('too few frames read nothing', () => {
  assert.equal(judgeTrunk(walk(1).slice(0, 10)), null);
});
