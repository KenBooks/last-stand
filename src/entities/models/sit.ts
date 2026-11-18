// A hero sat on a log or a stone (`entities/sitting.ts` takes him there): his hips down onto the seat and back over it,
// his feet left on the floor where he stood to sit if they reach it, else hanging from the knees, swinging a little; the
// trunk leant forward over the way down and up, as a body sits and stands, and upright with a slouch once sat. By a
// fire he sits on the floor, knees up and apart, his pelvis rolled back and his hands on his knees.
import * as THREE from 'three';
import type { SitState } from '../../types';
import { reachArm, type Joints } from './rig';
import { clampWrist } from './anatomy';
import { groundHeight } from '../../world/ground';
import { tunable } from '../../core/tuning';
import { SEAT } from '../../world/seats';

export const SIT_POSE = tunable('sit', {
  /** the trunk's lean forward at the middle of the way down or up, and its slouch once sat (rad) */
  lean: 0.5, slouch: 0.12,
  /** the knees apart (rad, each thigh out) */
  apart: 0.08,
  /** the feet reach the floor when it is no further from the hips than this share of the legs' length */
  reach: 0.97,
  /** hanging: the thighs out along the seat, the shins hanging a little ahead of straight down, the feet let go
   *  (rad), and their slow swing (rad, rad/s) */
  hang: [1.45, 1.3, 0.4, 0.1, 1.1],
  /** a hand at rest on its thigh: how far down the thigh from the hip (a share of it), over it (rig units, on the
   *  thigh's top) and out to its side (rig units) */
  rest: [0.55, 0.025, 0.03],
  /** on a seat, hands lifted as the knees rise, before settling onto them (rig units) */
  handLift: 0.25,
  /** how far sat (eased) the arm's own elbow has given way to the rest's whole (reached with the rest's elbow from his
   *  first moment sat, the warrior's left elbow went 19 cm in the frame the sit ended, and his shield 49 cm) */
  armIn: 0.3,
  /** the way a resting hand's elbow points (out and back, the chest's frame; the left's, the right's mirrored) */
  pole: [1, -0.2, -1],
  /** sat on the floor: the pelvis rolled back (rad: a man's on the floor rolls back, and his hips upright bent 10
   *  degrees past their range), the knees apart (rad, each thigh out), and a wrist at rest on top of its knee (as
   *  `rest`, from the knee: along the shin, back up the thigh where less than 0; over it and out to its side), the hand
   *  palm down over the kneecap ("rest hands on knees, on top of knees"). Wrapped round the shin, the forearm crossed
   *  the knee's side 8 cm into the thigh; out 4 cm, the elbow was still inside the thigh's line */
  floor: [0.25, 0.22],
  knee: [-0.06, 0.03, 0.08],
  /** and the way its elbow points (the chest's frame, as `pole`): out to his side, outside the knee. The arm's IK keeps
   *  the forearm out of the thighs on the floor (`BodyShape.legs`), so this is only where it starts looking */
  floorPole: [1, -0.3, 0.3],
  /** and on the way down to the floor, the hands carried up and out over the rising knees (rig units, at its middle) */
  floorLift: [0.1, 0.25],
  /** and a hand that holds something, its wrist let hang over the knee (rad, the palm bent down to the forearm) */
  dangle: 0.6,
});

/** Whether a sit is on the floor (by a fire): hips too low for any seat. */
export const onFloor = (s: SitState): boolean => s.hip < SEAT.low;
/** how far a skirt's back swings in under a hero sat on the floor (rad: `Skirt.update`'s `tuck`) */
export const SKIRT_TUCK = 0.6;

/** How far `s` has him sat, eased (0 standing, 1 sat). */
export const satBy = (s: SitState | null | undefined): number => (s ? s.w * s.w * (3 - 2 * s.w) : 0);

/** How a hero's resting hands turn (`restHands`), the left's and the right's: about the forearm (rad, + turns the
 *  thumb out), and bent at the wrist (rad, + the palm down to the forearm). */
export interface RestTurn {
  roll: number[];
  bend: number[];
  /** how much further along the thigh a hand rests, each side (a share of the thigh, as `SIT_POSE.rest`; by a fire, from
   *  the knee: less than 0, back up the thigh) */
  along?: number[];
  /** how much higher over it a hand holding a weapon rests, each side (rig units): its handle's end clear of the thigh */
  over?: number[];
  /** how much higher on the floor a hand holding a weapon goes on its way to the knee (rig units): the handle's end
   *  over the thigh rising under it */
  arc?: number[];
  /** of the way down, how far a hand holding a weapon takes to come in, each side (0: as an empty hand's,
   *  `SIT_POSE.armIn`): the weapon's far end sweeps round with it */
  armIn?: number[];
  /** how much further out from the thigh or the knee a hand rests, each side (rig units) */
  out?: number[];
  /** how much lower than its knee a hand rests by a fire, each side (rig units): what's strapped on it down on the floor */
  low?: number[];
}

/** The leg chain's angles (rad): the thigh forward from straight down, the knee's bend, the ankle's. */
const _leg = { thigh: 0, knee: 0, ankle: 0 };
/** how far short of its ends (degrees) a resting hand's wrist is kept */
export const WRIST_INSIDE = 5;

/**
 * The pose sat as far as `s` has him, over the pose as it stands (call after the stance and the arms, before the look and
 * the leg IK); the leg IK's weight for the frame (none once he's sat: his legs are the seat's).
 */
export function sitPose(j: Joints, s: SitState | null | undefined, t: number): number {
  if (!s || s.w <= 0) return 1;
  const w = s.w, k = j.root.scale.x, P = j.P;
  const [roll, apart] = onFloor(s) ? SIT_POSE.floor : [0, SIT_POSE.apart];
  // (the thigh's pivot, 2 cm under the hips' joint, onto the seat)
  const pivot = P.hipY - 0.02, drop = s.hip / k - pivot;
  j.body.position.y += (drop - j.body.position.y) * w;
  j.body.position.x *= 1 - w;
  j.hips.rotation.y *= 1 - w;
  j.hips.rotation.z *= 1 - w;
  j.spine.rotation.z *= 1 - w;
  // (on the floor, square to the way he faces: a stance's twist kept, a two-hander's side-on, his hand reached across
  // to his knee and his shoulder went 7 degrees past its range)
  if (roll) {
    j.spine.rotation.y *= 1 - w;
    j.chest.rotation.y *= 1 - w;
  }
  j.spine.rotation.x += SIT_POSE.lean * 4 * w * (1 - w) + (SIT_POSE.slouch + roll) * w;
  if (roll) j.hips.rotation.x += (-roll - j.hips.rotation.x) * w;
  for (let side = 0; side < 2; side++) {
    legAngles(P, s, side, t, k);
    const thigh = side === 0 ? j.thighL : j.thighR, knee = side === 0 ? j.kneeL : j.kneeR;
    const ankle = side === 0 ? j.ankleL : j.ankleR;
    // (on the floor, its turn from the hips rolled back: its way in the world the same)
    thigh.rotation.x += (-_leg.thigh - (roll ? j.hips.rotation.x : 0) - thigh.rotation.x) * w;
    thigh.rotation.y *= 1 - w;
    thigh.rotation.z += ((side === 0 ? 1 : -1) * apart - thigh.rotation.z) * w;
    knee.rotation.x += (_leg.knee - knee.rotation.x) * w;
    ankle.rotation.x += (_leg.ankle - ankle.rotation.x) * w;
    ankle.rotation.z *= 1 - w;
  }
  return 1 - w;
}

/** Leg `side`'s angles sat (`_leg`): its foot flat on the floor `s.foot` ahead of the pivot if it reaches, else hanging. */
function legAngles(P: Joints['P'], s: SitState, side: number, t: number, k: number): void {
  const T = P.thighL, S = P.shinL;
  // (the ankle's joint over the sole: the foot's block under it)
  const ahead = s.foot / k, down = (s.hip / k) - P.shinR * 1.1;
  const reach = Math.hypot(ahead, down);
  if (reach <= (T + S) * SIT_POSE.reach) {
    // (two bones to the ankle, the knee ahead of the line from the hip to it, the foot flat)
    const toAnkle = Math.atan2(ahead, down);
    const atHip = Math.acos(clamp1((T * T + reach * reach - S * S) / (2 * T * reach)));
    const atKnee = Math.acos(clamp1((T * T + S * S - reach * reach) / (2 * T * S)));
    _leg.thigh = toAnkle + atHip;
    _leg.knee = Math.PI - atKnee;
    _leg.ankle = _leg.thigh - _leg.knee;
    return;
  }
  const [thigh, knee, ankle, swing, rate] = SIT_POSE.hang;
  _leg.thigh = thigh;
  _leg.knee = knee + swing * Math.sin(t * rate + side * Math.PI);
  _leg.ankle = ankle;
}

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));

const _foot = new THREE.Vector3(), _up = new THREE.Vector3(), _on = new THREE.Vector3(), _now = new THREE.Vector3();
const _pole = new THREE.Vector3(), _q = new THREE.Quaternion(), _bone = new THREE.Quaternion();
const _shoulderWas = new THREE.Quaternion(), _elbowWas = new THREE.Quaternion();

/**
 * The hands on `sides` (0 the left, 1 the right) brought to rest on their thighs as he sits, palms down, the elbows
 * out and back (hanging at his sides sat, the arms read as a man at attention; the warrior's weapon stood up before
 * his face). Call after `sitPose` and the look (before it, a glance carried the shoulders round and the hands with them,
 * 8 cm over the knee); the arms' IK (`fitArm`) keeps them within their ranges after. `lifted`: the sides lifted over
 * the rising thighs on a seat (all of them by default; not a hand that sets a weapon down after).
 * `floorLift` scales the arc for a hand already lowered beside the legs.
 */
export function restHands(
  j: Joints, s: SitState | null | undefined, sides: readonly number[], turn?: RestTurn, rise = 0, lifted = sides, floorLift = 1,
): void {
  if (!s || s.w <= 0) return;
  const floor = onFloor(s), [along, over, out] = floor ? SIT_POSE.knee : SIT_POSE.rest;
  const pole = floor ? SIT_POSE.floorPole : SIT_POSE.pole, P = j.P, w = satBy(s);
  j.root.updateMatrixWorld(true);
  for (const side of sides) {
    const left = side === 0, sign = left ? 1 : -1;
    const thigh = left ? j.thighL : j.thighR, hand = left ? j.handL : j.handR;
    // (on the floor, placed from the knee: along the thigh past it, the knees up, the hands were held in the air before
    // the chest)
    const further = turn?.along?.[side] ?? 0;
    if (floor) {
      const knee = left ? j.kneeL : j.kneeR;
      knee.localToWorld(_on.set(sign * (out + (turn?.out?.[side] ?? 0)), -P.shinL * along, P.shinR + over));
      _on.y -= (turn?.low?.[side] ?? 0) * j.root.scale.y;
      // (brought back along the thigh itself: back along the shin's line, a fist rose to his chest)
      thigh.getWorldPosition(_foot).sub(knee.getWorldPosition(_up));
      _on.addScaledVector(_foot, -further);
    }
    else thigh.localToWorld(_on.set(sign * (out + (turn?.out?.[side] ?? 0)), -P.thighL * (along + further), P.thighR + over + rise + (turn?.over?.[side] ?? 0)));
    j.chest.worldToLocal(_on);
    _pole.set(sign * pole[0], pole[1], pole[2]);
    j.chest.worldToLocal(hand.getWorldPosition(_now));
    _now.lerp(_on, w);
    // Lift the hands over the rising thighs before resting them, rather than sweeping through them.
    if (!floor) {
      if (lifted.includes(side)) _now.y += SIT_POSE.handLift * Math.sin(Math.PI * w);
    } else {
      // (out early: at the way's own pace, the thigh rose into a hand still hanging at his side, 7 cm, 16% down)
      const arc = Math.max(Math.sin(Math.PI * Math.sqrt(w)), Math.sin(Math.PI * w));
      _now.y += (SIT_POSE.floorLift[0] + (turn?.arc?.[side] ?? 0)) * arc * floorLift;
      _now.x += sign * SIT_POSE.floorLift[1] * arc * floorLift;
    }
    const shoulder = left ? j.shoulderL : j.shoulderR, elbow = left ? j.elbowL : j.elbowR;
    _shoulderWas.copy(shoulder.quaternion);
    _elbowWas.copy(elbow.quaternion);
    reachArm(shoulder, elbow, P.upperL, P.foreL, _now, _pole);
    const heldIn = turn?.armIn?.[side] ?? 0;
    const armIn = Math.min(1, w / (heldIn || SIT_POSE.armIn));
    if (armIn < 1) {
      shoulder.quaternion.copy(_shoulderWas.slerp(shoulder.quaternion, armIn));
      elbow.quaternion.copy(_elbowWas.slerp(elbow.quaternion, armIn));
    }
    if (turn && (turn.roll[side] || turn.bend[side] || turn.armIn?.[side])) {
      hand.rotation.y += sign * turn.roll[side] * w;
      hand.rotation.x += turn.bend[side] * w;
      if (floor) hand.rotation.x += SIT_POSE.dangle * w;
      continue;
    }
    // (an empty hand laid on the bone it rests on: its fingers along it, its palm onto it. Left with the arm's turn as
    // it hung, it stood beside the knee palm up, touching nothing)
    const bone = floor ? (left ? j.kneeL : j.kneeR) : thigh;
    bone.getWorldQuaternion(_bone);
    hand.parent!.updateWorldMatrix(true, false);
    hand.parent!.getWorldQuaternion(_q).invert().multiply(_bone);
    hand.quaternion.slerp(_q, w);
    // (and its wrist a little short of its ends: laid along the knee by a fire, it rested at the end of its bend and
    // to the little finger's side at once, an arm held at its stops all the while he sat; a turned hand holds what it
    // holds, which a clamp would turn in the world: the warrior's shield went 50 cm with no hand on it)
    clampWrist(hand.quaternion, left, hand.quaternion, undefined, WRIST_INSIDE);
  }
}

/** The floor's height under `object` in its own space, a centimetre up (for cloth kept over it: `Skirt.keepAbove`). */
export function floorUnder(object: THREE.Object3D): number {
  object.updateWorldMatrix(true, false);
  object.getWorldPosition(_foot);
  _foot.y = groundHeight(_foot.x, _foot.z) + 0.01;
  return object.worldToLocal(_foot).y;
}

/**
 * A handle held in the fist (`held`, a child of the hand, along its own y) slid through it, `k` of the way, until its
 * end below the fist (`foot`, along that y, less than 0) is on the floor, from over it as well as under it, but never
 * further than `most` along itself: a maul stood head up on the butt of its haft beside a seated hero (as
 * `footOutOfFloor`, whose staff went 18 to 78 cm past the floor slid by the world's rise). Says it's stood on the floor.
 */
export function footToFloor(held: THREE.Object3D, foot: number, k: number, most: number): void {
  held.updateWorldMatrix(true, false);
  held.localToWorld(_foot.set(0, foot, 0));
  const over = _foot.y - groundHeight(_foot.x, _foot.z);
  const rise = _up.set(0, 1, 0).transformDirection(held.matrixWorld).y;
  held.userData.stoodOn = k >= 1 && rise >= 0.3;
  if (rise < 0.3) return;
  const scale = _foot.setFromMatrixScale(held.parent!.matrixWorld).y;
  const slide = Math.min(most, over / (rise * scale)) * k;
  held.position.addScaledVector(_up.set(0, 1, 0).applyQuaternion(held.quaternion), -slide);
}

/**
 * A handle held in the fist (`held`, a child of the hand, along its own y) slid through it until its end hanging down
 * (`foot`, along that y: a staff's foot below the fist, a weapon's head above it held head down) is out of the floor:
 * sat low, his hand comes down with him, and the mage's staff stood where he held it went 40 cm into the floor. Call
 * once the hand holds it, before closing the fingers.
 */
export function footOutOfFloor(held: THREE.Object3D, foot: number): void {
  held.updateWorldMatrix(true, false);
  held.localToWorld(_foot.set(0, foot, 0));
  const under = groundHeight(_foot.x, _foot.z) - _foot.y;
  const rise = _up.set(0, -Math.sign(foot), 0).transformDirection(held.matrixWorld).y;
  // (a handle lying near level can't stand on its end: left as held; the lab reads what's stood on the floor by it)
  held.userData.stoodOn = under > 0 && rise >= 0.3;
  if (!held.userData.stoodOn) return;
  // (slid along itself in its parent's space, by its parent's scale: the world's rise read after the slide's way was
  // turned into that space, the staff went 18 to 78 cm past the floor and stood on air)
  const scale = _foot.setFromMatrixScale(held.parent!.matrixWorld).y;
  held.position.addScaledVector(_up.set(0, -Math.sign(foot), 0).applyQuaternion(held.quaternion), under / (rise * scale));
}
