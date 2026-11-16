// The trunk against the legs (`lab form`, `lab gait`): how the pelvis and the shoulders turn, the pelvis tips and the
// hips sway over a stride, each against where the feet are. A person's pelvis turns with the leg that reaches out (the
// hip of the foot ahead is ahead: it lengthens the step), the shoulders turn the other way (with the arms, against
// the legs), the pelvis drops on the side of the leg in the air (the hip of the leg it stands on is the higher), and
// the hips sway out over the foot that carries them. Each is read as the correlation, over the frames moving, of the
// trunk's swing (taken off its mean over a stride, so a turn of the whole body or a strafe's twist doesn't count)
// with the feet's: their split fore and aft for the turns, which foot alone is down for the tip and the sway. A
// person's turns read about +1 (the pelvis) and -1 (the shoulders), the tip and the sway about +1; a value of the
// wrong sign is a body moving against its legs, which no clip or range measure sees (the walk cycle turned the pelvis
// with the hip of the leg behind ahead and tipped it up on the side in the air for a year: from the side and above it
// read as a waddle). Perry (1992) and Whittle (2007) for a walk, Novacheck (1998) and Schache et al. (2002) for a run:
// a walker's pelvis turns about 4 degrees either way and tips about 4, the shoulders turn about as far the other way
// and the hips sway about 2 cm over each foot; a runner's pelvis turns and tips a little more and the shoulders a lot
// more (up to about 15), and the sway is about 1 cm.
import * as THREE from 'three';
import type { Joints } from '../../../src/entities/models/rig';

/** A point in the world (m). */
export interface Point {
  x: number;
  y: number;
  z: number;
}

/** One frame of the trunk and the feet. */
export interface TrunkSample {
  /** whether each foot (left, right) is down */
  planted: [boolean, boolean];
  /** each hip joint, each shoulder joint and each ankle (left, right) */
  hips: [Point, Point];
  shoulders: [Point, Point];
  ankles: [Point, Point];
}

/** What the trunk did against the legs over a run of frames. */
export interface TrunkSwing {
  /** the frames read */
  frames: number;
  /** the correlation of the pelvis's turn with the feet's split (a person's about +1), and how far it turns either
   *  way (deg) */
  pelvisWithLegs: number;
  pelvisTurn: number;
  /** the correlation of the shoulders' turn with the feet's split (a person's about -1), and how far they turn either
   *  way (deg) */
  shouldersWithLegs: number;
  shouldersTurn: number;
  /** the correlation of the pelvis's tip, its side over the foot down the higher, with which foot alone is down (a
   *  person's about +1), and how far it tips either way (deg) */
  tipWithStance: number;
  tip: number;
  /** the correlation of the hips' sway with which foot alone is down (a person's about +1), and how far they sway
   *  either way (cm) */
  swayWithStance: number;
  sway: number;
}

/** the least frames a reading needs (a stride or two at a walk) */
const LEAST_FRAMES = 40;
/** a stride's frames when the feet give none to read (a run's at 60 frames a second) */
const STRIDE_FRAMES = 40;
/** how far a correlation may go the wrong way before it reads as a body moving against its legs */
const AGAINST = -0.3;
const DEG = 180 / Math.PI;

const minus = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

/** The frames each foot landed on (down after up). */
function touchdowns(samples: TrunkSample[], side: number): number[] {
  const downs: number[] = [];
  for (let f = 1; f < samples.length; f++) {
    if (samples[f].planted[side] && !samples[f - 1].planted[side]) downs.push(f);
  }
  return downs;
}

/** The median stride in frames, from one foot's touchdown to its next. */
function strideFrames(samples: TrunkSample[]): number {
  const strides: number[] = [];
  for (const side of [0, 1]) {
    const downs = touchdowns(samples, side);
    for (let i = 1; i < downs.length; i++) strides.push(downs[i] - downs[i - 1]);
  }
  if (!strides.length) return STRIDE_FRAMES;
  strides.sort((a, b) => a - b);
  return strides[Math.floor(strides.length / 2)];
}

/** The hips' line from the right hip to the left, along the ground, averaged over the stride round frame `f` and
 *  made a unit: the body's left as it goes, its forward square to it. */
function meanLeft(samples: TrunkSample[], f: number, half: number): { x: number; z: number } {
  let x = 0;
  let z = 0;
  const from = Math.max(0, f - half);
  const to = Math.min(samples.length - 1, f + half);
  for (let i = from; i <= to; i++) {
    const line = minus(samples[i].hips[0], samples[i].hips[1]);
    const length = Math.hypot(line.x, line.z) || 1;
    x += line.x / length;
    z += line.z / length;
  }
  const length = Math.hypot(x, z) || 1;
  return { x: x / length, z: z / length };
}

/** A line's turn from the body's left towards its forward (rad): its left end ahead, positive. */
function turnOf(line: Point, left: { x: number; z: number }): number {
  const forward = { x: -left.z, z: left.x };
  return Math.atan2(line.x * forward.x + line.z * forward.z, line.x * left.x + line.z * left.z);
}

/** Each value less the mean of those over the stride round it. */
function offMean(values: number[], half: number): number[] {
  return values.map((_, f) => {
    const from = Math.max(0, f - half);
    const to = Math.min(values.length - 1, f + half);
    let sum = 0;
    for (let i = from; i <= to; i++) sum += values[i];
    return values[f] - sum / (to - from + 1);
  });
}

/** The mean of the places over the stride round frame `f`. */
function meanOver(places: { x: number; z: number }[], f: number, half: number): { x: number; z: number } {
  const from = Math.max(0, f - half);
  const to = Math.min(places.length - 1, f + half);
  let x = 0;
  let z = 0;
  for (let i = from; i <= to; i++) {
    x += places[i].x;
    z += places[i].z;
  }
  return { x: x / (to - from + 1), z: z / (to - from + 1) };
}

/** The correlation of two series (0 where either is flat). */
export function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const meanA = a.slice(0, n).reduce((sum, value) => sum + value, 0) / n;
  const meanB = b.slice(0, n).reduce((sum, value) => sum + value, 0) / n;
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < n; i++) {
    ab += (a[i] - meanA) * (b[i] - meanB);
    aa += (a[i] - meanA) ** 2;
    bb += (b[i] - meanB) ** 2;
  }
  return aa > 1e-12 && bb > 1e-12 ? ab / Math.sqrt(aa * bb) : 0;
}

/** How far a series swings either way: half the span between its 5th and 95th percentiles. */
export function halfSpan(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (share: number): number => sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))];
  return (at(0.95) - at(0.05)) / 2;
}

/** Which foot alone is down: +1 the left, -1 the right, 0 both or neither. */
const stanceOf = (sample: TrunkSample): number => Number(sample.planted[0]) - Number(sample.planted[1]);

/** The trunk against the legs over `samples` (consecutive frames, moving), or null with too few to read. */
export function judgeTrunk(samples: TrunkSample[]): TrunkSwing | null {
  const half = Math.round(strideFrames(samples) / 2);
  if (samples.length - 2 * half < LEAST_FRAMES) return null;
  const lefts = samples.map((_, f) => meanLeft(samples, f, half));
  const pelvis = samples.map((sample, f) => turnOf(minus(sample.hips[0], sample.hips[1]), lefts[f]));
  const shoulders = samples.map((sample, f) => turnOf(minus(sample.shoulders[0], sample.shoulders[1]), lefts[f]));
  // (the feet's split: the left ankle's lead on the right along the way the body faces)
  const split = samples.map((sample, f) => {
    const line = minus(sample.ankles[0], sample.ankles[1]);
    return line.x * -lefts[f].z + line.z * lefts[f].x;
  });
  // (the tip: the left hip's height over the right's, as an angle across the hips)
  const tips = samples.map((sample) => {
    const line = minus(sample.hips[0], sample.hips[1]);
    return Math.atan2(line.y, Math.hypot(line.x, line.z));
  });
  // (the sway: the hips' middle off its mean over the stride, along the body's left: its place in the world along a
  // left that turns a little with the stride read the ground covered as sway)
  const middles = samples.map((sample) => ({
    x: (sample.hips[0].x + sample.hips[1].x) / 2,
    z: (sample.hips[0].z + sample.hips[1].z) / 2,
  }));
  const sways = middles.map((middle, f) => {
    const mean = meanOver(middles, f, half);
    return (middle.x - mean.x) * lefts[f].x + (middle.z - mean.z) * lefts[f].z;
  });
  // (read where the stride round a frame is whole: a mean over a stride cut short at either end leaves the motion
  // along the way in it)
  const whole = (values: number[]): number[] => values.slice(half, values.length - half);
  const stance = whole(samples.map(stanceOf));
  const pelvisOff = whole(offMean(pelvis, half));
  const shouldersOff = whole(offMean(shoulders, half));
  const splitOff = whole(offMean(split, half));
  const tipsOff = whole(offMean(tips, half));
  const swaysOff = whole(sways);
  return {
    frames: stance.length,
    pelvisWithLegs: correlation(pelvisOff, splitOff),
    pelvisTurn: halfSpan(pelvisOff) * DEG,
    shouldersWithLegs: correlation(shouldersOff, splitOff),
    shouldersTurn: halfSpan(shouldersOff) * DEG,
    tipWithStance: correlation(tipsOff, stance),
    tip: halfSpan(tipsOff) * DEG,
    swayWithStance: correlation(swaysOff, stance),
    sway: halfSpan(swaysOff) * 100,
  };
}

/** The line a report gives the trunk, and what of it is unlike a person (each pushed onto `unlike`). */
export function trunkLine(swing: TrunkSwing | null, unlike: string[]): string {
  if (!swing) return 'the trunk against the legs: too few frames moving to read';
  const r = (value: number): string => value.toFixed(2);
  const d = (value: number): string => value.toFixed(1);
  if (swing.pelvisWithLegs < AGAINST) {
    unlike.push(`the pelvis turns against the legs (${r(swing.pelvisWithLegs)}): the hip of the leg behind ahead`);
  }
  if (swing.shouldersWithLegs > -AGAINST) {
    unlike.push(`the shoulders turn with the legs (${r(swing.shouldersWithLegs)}), not against them`);
  }
  if (swing.tipWithStance < AGAINST) {
    unlike.push(`the pelvis tips up on the side of the leg in the air (${r(swing.tipWithStance)})`);
  }
  if (swing.swayWithStance < AGAINST) {
    unlike.push(`the hips sway away from the foot that carries them (${r(swing.swayWithStance)})`);
  }
  return `the trunk against the legs: the pelvis turns ${d(swing.pelvisTurn)} deg either way, with the legs ` +
    `${r(swing.pelvisWithLegs)} (a person's +1); the shoulders ${d(swing.shouldersTurn)}, with the legs ` +
    `${r(swing.shouldersWithLegs)} (-1); the pelvis tips ${d(swing.tip)} deg, over the foot down ` +
    `${r(swing.tipWithStance)} (+1); the hips sway ${d(swing.sway)} cm, over the foot down ` +
    `${r(swing.swayWithStance)} (+1)`;
}

/** Reads a frame of the trunk and the feet off a hero's joints. */
export function trunkSampleOf(j: Joints, planted: [boolean, boolean]): TrunkSample {
  const at = (joint: THREE.Object3D): Point => {
    const place = joint.getWorldPosition(new THREE.Vector3());
    return { x: place.x, y: place.y, z: place.z };
  };
  return {
    planted,
    hips: [at(j.thighL), at(j.thighR)],
    shoulders: [at(j.shoulderL), at(j.shoulderR)],
    ankles: [at(j.ankleL), at(j.ankleR)],
  };
}
