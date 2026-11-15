// The warrior's poses with both hands empty (no weapon, no shield): his guard, and the fists' skills, Bare Knuckles'
// punches ('punch'), Heave's grab and throw ('heave') and Groundbreaker's blow ('pound'). Each poses the trunk as a
// fighter's body moves, then places each fist by where it is before the body (`place`), the arm reaching it: a fist
// goes to a place, and an arm posed joint by joint lands it wherever the trunk's turn carries it.
//
// As a person does it. The guard: side-on, the left side leading, both fists up before the chin, the lead one further
// out, the elbows down before the ribs. A jab: the lead fist straight out from the guard and back, the lead shoulder
// behind it, the rear fist kept at the jaw. A cross: the rear fist driven straight through the middle by the hips and
// the trunk turning, the lead fist drawn back to the jaw. A heave: bent in low with both hands out to take hold, then
// the legs and back straightening, the arms thrown up and forward after what they let go. The ground blow: both fists
// together overhead, the back arched, then down onto the floor ahead, the knees folding under him.
import * as THREE from 'three';
import { reachArm, ramp, type Joints } from './rig';
import { lerp, smooth } from '../../util';

/** a closed fist's curl and its fingers' spread (models/hands.ts `poseHand`) */
export const FIST = { curl: 1.7, spread: 0.02 };

/** where each fist is held in the guard, from the point between the shoulders, in the body's frame (m: to his left,
 *  up, ahead): the lead (left) further out, both before the chin; and through the eyes, low in the view */
const GUARD = { lead: [0.15, 0.01, 0.25], rear: [-0.16, -0.01, 0.17] }, GUARD_EYES = { lead: [0.2, -0.06, 0.44], rear: [-0.22, -0.04, 0.4] };
/** where a punch lands, as the guard's places are given: on his middle line at the chin's height, further than the
 *  arm reaches (it goes out straight at it); through the eyes at the aim, under the view's middle */
const PUNCH_AT = [0, -0.06, 1.2], PUNCH_EYES = [0, -0.04, 1.2];
/** through the eyes a punch is aimed this far across his middle line (m, at `PUNCH_EYES`' distance): thrown from a
 *  shoulder beside the camera straight ahead, the fist stayed at the view's side, off the aim */
const ACROSS_EYES = 0.3;
/** how much of its length an arm thrown out in a punch keeps short of straight (a locked elbow reads as a stick) */
const PUNCH_REACH = 0.96;
/** the elbows' way in the chest's frame: down and a little out in the guard, further out behind a punch */
const POLE_L = new THREE.Vector3(0.3, -1, 0), POLE_R = new THREE.Vector3(-0.3, -1, 0);

/** how far each forearm is turned in the guard, the palm in towards the other fist (rad); a punch turns it over,
 *  palm down, as it goes out */
const TURN = 1.3;

const _mid = new THREE.Vector3(), _at = new THREE.Vector3(), _sh = new THREE.Vector3(), _far = new THREE.Vector3();
const _sq = new THREE.Quaternion(), _eq = new THREE.Quaternion();

/** The point between the shoulders in the body's frame, the trunk posed as it is. */
function between(j: Joints, out: THREE.Vector3): THREE.Vector3 {
  j.root.updateMatrixWorld(true);
  j.shoulderL.getWorldPosition(out).add(j.shoulderR.getWorldPosition(_sh)).multiplyScalar(0.5);
  return j.body.worldToLocal(out);
}

/** An arm reaching `at` (the body's frame) by `w` of the way from the pose's own, its elbow towards its pole. */
function place(j: Joints, left: boolean, at: THREE.Vector3, w: number): void {
  if (w <= 0) return;
  const shoulder = left ? j.shoulderL : j.shoulderR, elbow = left ? j.elbowL : j.elbowR;
  _sq.copy(shoulder.quaternion); _eq.copy(elbow.quaternion);
  j.chest.worldToLocal(j.body.localToWorld(_at.copy(at)));
  reachArm(shoulder, elbow, j.P.upperL, j.P.foreL, _at, left ? POLE_L : POLE_R);
  // (each from the pose's own towards the reach: `slerpQuaternions` into one of its own ends copies over it first)
  if (w < 1) { shoulder.quaternion.copy(_sq.slerp(shoulder.quaternion, w)); elbow.quaternion.copy(_eq.slerp(elbow.quaternion, w)); }
}

/** `mid` moved by `off` (to his left, up, ahead). */
const from = (mid: THREE.Vector3, off: readonly number[], out: THREE.Vector3): THREE.Vector3 => out.set(mid.x + off[0], mid.y + off[1], mid.z + off[2]);

/** The guard by `w` of the way from the pose's own arms: both fists up before him, breathing with `t`. */
export function fistGuard(j: Joints, w: number, t: number, eyes: boolean): void {
  if (w <= 0) return;
  const G = eyes ? GUARD_EYES : GUARD, breath = 0.008 * Math.sin(t * 1.8);
  between(j, _mid); _mid.y += breath;
  place(j, true, from(_mid, G.lead, _far), w);
  place(j, false, from(_mid, G.rear, _far), w);
  // (the wrists straight behind the knuckles, the forearms turned so the palms face each other: unturned, the palms
  // faced ahead and from the front the fists read as open claws)
  j.handL.rotation.set(lerp(j.handL.rotation.x, 0, w), TURN * w, 0); j.handR.rotation.set(lerp(j.handR.rotation.x, 0, w), -TURN * w, 0);
}

/** How far a punch is out at `k` of its cast: thrown out fast, landed at its middle, drawn back to the guard. */
const thrown = (k: number): number => smooth(ramp(k, 0.06, 0.46)) * (1 - smooth(ramp(k, 0.6, 1)));

/**
 * A punch at `k` of its cast: the lead hand's jab (`lead`) or the rear hand's cross, over the guard. `still`: how far
 * he stands (moving, the legs are stepping and the weight stays over them).
 */
export function fistPunch(j: Joints, k: number, lead: boolean, still: number, t: number, eyes: boolean): void {
  const out = thrown(k), ws = out * (0.4 + 0.6 * still);
  // the trunk behind the fist: a jab's lead shoulder sent after it; a cross turned through from the hips, the weight
  // onto the front foot; the head stays on the foe
  const turn = lead ? -0.22 : 0.5;
  if (!eyes) {
    j.hips.rotation.y += 0.45 * turn * out; j.spine.rotation.y += 0.2 * turn * out; j.chest.rotation.y += 0.55 * turn * out;
    j.neck.rotation.y -= 0.85 * turn * out;
    j.spine.rotation.x += (lead ? 0.05 : 0.12) * out;
    j.body.position.z += (lead ? 0.03 : 0.07) * ws; j.body.position.y += (lead ? -0.01 : -0.03) * ws;
  }
  fistGuard(j, 1, t, eyes);
  // the fist straight out at the middle line from where the guard held it, the arm a little short of locked
  const shoulder = lead ? j.shoulderL : j.shoulderR;
  between(j, _mid);
  from(_mid, eyes ? PUNCH_EYES : PUNCH_AT, _far);
  if (eyes) _far.x += lead ? -ACROSS_EYES : ACROSS_EYES;
  j.body.worldToLocal(shoulder.getWorldPosition(_sh));
  _far.sub(_sh).setLength((j.P.upperL + j.P.foreL) * PUNCH_REACH).add(_sh);
  place(j, lead, _far, out);
  (lead ? j.handL : j.handR).rotation.y *= 1 - out;
  // (the other fist drawn in to the jaw as this one goes)
  const other = lead ? j.elbowR : j.elbowL;
  if (!eyes) other.rotation.x += -0.12 * out;
}

/**
 * Heave at `k` of its step and its follow-through (`step`: the step's share of that): bent in with both hands out
 * to take hold, then straightened up and thrown, the arms going up and on after what they let go. `lunges`: the legs
 * its own for the step. Returns how far the pose owns the legs.
 */
export function fistHeave(j: Joints, k: number, step: number, lunges: boolean, eyes: boolean): number {
  const w = ramp(k, 0, 0.1) * (1 - ramp(k, 0.88, 1));
  const low = smooth(ramp(k, 0, step * 0.8)) * (1 - smooth(ramp(k, step, step + 0.22))), up = smooth(ramp(k, step, step + 0.22)) * (1 - smooth(ramp(k, 0.72, 1)));
  if (!eyes) {
    j.spine.rotation.x += 0.42 * low - 0.16 * up; j.chest.rotation.x += 0.1 * low - 0.08 * up; j.neck.rotation.x += -0.3 * low + 0.05 * up;
    j.body.position.y += -0.16 * low + 0.02 * up; j.body.position.z += 0.05 * low;
    if (lunges) {
      j.thighL.rotation.x += -0.6 * low; j.kneeL.rotation.x += 0.65 * low;
      j.thighR.rotation.x += 0.42 * low; j.kneeR.rotation.x += 0.18 * low;
    }
  }
  // the hands: out low to take hold at the waist's height, then up and forward over the head's height
  between(j, _mid);
  const y = eyes ? lerp(-0.34, -0.02, up) : lerp(-0.3, 0.3, up), z = eyes ? lerp(0.5, 0.62, up) : lerp(0.5, 0.55, up);
  place(j, true, _far.set(_mid.x + 0.15, _mid.y + y, _mid.z + z), w);
  place(j, false, _far.set(_mid.x - 0.15, _mid.y + y, _mid.z + z), w);
  return lunges && !eyes ? ramp(k, 0, 0.1) * (1 - ramp(k, step, step + 0.08)) : 0;
}

/** when the fists land, of the cast (the skill's `fireAt`), and how long they take to fall */
const POUND = { lands: 0.62, falls: 0.2 };

/**
 * Groundbreaker at `k` of its cast: both fists raised together overhead, the back arched, then brought down onto the
 * floor ahead, the knees folding (the leg IK bends them under the dropped body), held there to the cast's end.
 */
export function fistPound(j: Joints, k: number, eyes: boolean): void {
  const down = smooth(ramp(k, POUND.lands - POUND.falls, POUND.lands)), up = smooth(ramp(k, 0, 0.36)) * (1 - down);
  if (!eyes) {
    j.spine.rotation.x += -0.22 * up + 0.7 * down; j.chest.rotation.x += -0.1 * up + 0.2 * down; j.neck.rotation.x += -0.15 * up - 0.45 * down;
    // (square on to the blow: the hips turned out of the stance's side-on)
    j.hips.rotation.y += 0.12 * Math.max(up, down); j.chest.rotation.y += -0.08 * Math.max(up, down);
    j.body.position.y += 0.03 * up - 0.5 * down; j.body.position.z += 0.1 * down;
  }
  between(j, _mid);
  // (together overhead; then on the floor ahead of the knees, a little apart)
  const y = eyes ? lerp(0.2, -0.5, down) : lerp(0.48, -0.75, down), z = eyes ? lerp(0.45, 0.6, down) : lerp(0.2, 0.42, down), x = lerp(0.1, 0.12, down);
  const w = smooth(ramp(k, 0, 0.3));
  place(j, true, _far.set(_mid.x + x, _mid.y + y, _mid.z + z), w);
  place(j, false, _far.set(_mid.x - x, _mid.y + y, _mid.z + z), w);
}

/**
 * Living Flail: both arms out before him at the hips' height, the hands together round what they swing (or reaching
 * for it), the trunk leaning back against its weight as a hammer thrower's does. The body's turn and the legs under
 * it are the model's own (Steel Tempest's pivot).
 */
export function fistWhirl(j: Joints, k: number, eyes: boolean): void {
  const w = smooth(ramp(k, 0, 1));
  if (!eyes) { j.spine.rotation.x += -0.2 * w; j.chest.rotation.x += -0.06 * w; j.neck.rotation.x += 0.12 * w; }
  between(j, _mid);
  const y = eyes ? -0.3 : -0.22, z = eyes ? 0.55 : 0.52;
  place(j, true, _far.set(_mid.x + 0.07, _mid.y + y, _mid.z + z), w);
  place(j, false, _far.set(_mid.x - 0.07, _mid.y + y, _mid.z + z), w);
}
