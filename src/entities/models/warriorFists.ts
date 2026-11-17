// The warrior's poses with both hands empty (no weapon, no shield; #400): a berserker's guard and his fists' skills,
// Savage Fists' punches and hammer ('punch'), Rampage's flurry as he walks ('rampage'), Pounce's leap and the blows
// he rains on what he lands on ('pounce'), Bloodrush's shoulder-first dash ('bloodrush') and Wrath's hook, slam and
// quake ('wrath'). Each poses the trunk as a fighter's body moves, then places each fist where it is before him
// (`place`), the arm reaching it; through the eyes each fist is placed where it's seen in the view (`seen`), from the
// arms' own shoulders low beside the camera (models/warrior.ts `armsFromBelow`).
//
// As a person does it. The guard: side-on, the left side leading, both fists up before the chin, the lead one further
// out, the elbows down before the ribs, the body loose and bobbing. A punch is thrown from the ground up and snapped
// back: the hips turn first, the chest after, the shoulder sent after the fist and the fist last, straight out along
// the middle line, the forearm turning it palm down so it lands on its two big knuckles with the wrist straight
// behind them, then drawn straight back to the guard faster than it went. The other fist stays at the jaw. The jab
// (the lead hand) is quick and light, the hips hardly turning; the cross (the rear hand) is driven through by the
// hips and the trunk turning, the rear heel lifting, the weight onto the front foot. Through the eyes the same: the
// fist comes from the bottom corner of the view, across to just under the crosshair, its shoulder sent in after it
// and the other fist drawn back down, so the view sees a whole arm thrown, not a hand poked out.
import * as THREE from 'three';
import { reachArm, ramp, type Joints } from './rig';
import { curve, type Keys } from './motion';
import { fromEyes, fromScreen } from '../viewModel';
import { lerp, smooth } from '../../util';
import { POUNCE } from '../../data/balance';

/** a hand closing: its curl and its fingers' spread on the way (models/hands.ts `poseHand`), and from how far closed
 *  it is a fist, the hand shut as round a handle this thin (m, `hold`) */
export const FIST = { curl: 1.7, spread: 0.02, from: 0.6, r: 0.012 };

/** where each fist is held in the guard, from the point between the shoulders, in the body's frame (m: to his left,
 *  up, ahead): the lead (left) further out, both before the chin */
const GUARD = { lead: [0.14, 0.02, 0.27], rear: [-0.15, 0, 0.17] };
/** through the eyes, the guard's places on the screen (`fromScreen`: across and up from the middle to the frame's
 *  edges, and metres ahead): each fist in its bottom corner, the lead (left) a little higher and further in, both
 *  wholly in the frame, as a first-person brawler's fists are held; a little lower out of a fight */
const GUARD_EYES = { lead: [-0.62, -0.55, 0.52], rear: [0.72, -0.7, 0.48] }, EASY_EYES = -0.22;
/** where a punch lands: on his middle line at the chin's height, further than the arm reaches (it goes out straight
 *  at it, a little short of locked); through the eyes under the crosshair, a little to the fist's own side, where
 *  the screen's line there meets the arm's reach (aimed further, the arm pointed at it from the shoulder under the
 *  view and the fist stopped short, low and near at the view's foot, its fingers seen from above as an open hand) */
const PUNCH_AT = [0, -0.04, 1.2], PUNCH_EYES = { across: 0.55, up: -0.42 };
/** how much of its length an arm thrown out in a punch keeps short of straight (a locked elbow reads as a stick) */
const PUNCH_REACH = 0.97;
/** the elbows' way in the chest's frame: down and a little out in the guard */
const POLE_L = new THREE.Vector3(0.35, -1, -0.1), POLE_R = new THREE.Vector3(-0.35, -1, -0.1);
/** through the eyes: down and out, so the forearm rises from the frame's bottom corner (camera space, for each side) */
const POLE_EYES = 0.7;

/** a punch over its cast: how far the fist is out (a hair drawn back first, out fast, held on the blow as the skill
 *  lands at 0.5, back to the guard), and the hips' and the chest's turn led a little ahead of it */
const PUNCH_OUT: Keys = [[0, 0], [0.1, -0.06], [0.42, 0.96], [0.52, 1], [0.6, 0.97], [0.88, 0.08], [1, 0]];
const LEAD = { hips: 0.07, chest: 0.035 };
/** a two-fisted hammer over its cast: the fists raised together, held up a moment, brought down to land at 0.5 */
const HAMMER_UP: Keys = [[0, 0], [0.22, 1], [0.32, 1], [0.48, 0], [1, 0]];
const HAMMER_DOWN: Keys = [[0, 0], [0.3, 0], [0.5, 1], [0.75, 1], [1, 0.2]];

/**
 * The line of each fist's knuckles this frame, in the body's frame (to his left, up, ahead; the model clears both
 * before it poses, and a fist with none keeps the hand's own): upright in the guard, the palms in towards each other,
 * and across in a punch, the palm turned down as it goes out. The visible hand is turned to it about the forearm, as a
 * fist is turned on a handle (`hold`), and the wrist's joint left straight: turned at the joint, the bare wrist's skin
 * was wrung flat into a ribbon standing off the arm.
 */
export const fistLine = { L: new THREE.Vector3(), R: new THREE.Vector3() };
/** the knuckles' line in the guard and in a punch, each hand's (in the body's frame): the way from the little
 *  finger's knuckle to the index's, as a handle runs up out of a fist (`hold`), so the left hand's punch is the
 *  right's mirrored (the same line for both turned the left palm up, its fingers curled at the eyes as a claw) */
const LINE = { guard: [0.6, 0.75, 0.25], punch: [1, 0, 0] };
/** a knuckle line for the hand on that side: mirrored across his middle for the left */
const sided = (line: readonly number[], left: boolean): number[] => (left ? [-line[0], line[1], line[2]] : [...line]);

const _mid = new THREE.Vector3(), _at = new THREE.Vector3(), _sh = new THREE.Vector3(), _far = new THREE.Vector3();
const _cam = new THREE.Vector3(), _pole = new THREE.Vector3(), _near = new THREE.Vector3();
const _sq = new THREE.Quaternion(), _eq = new THREE.Quaternion();

/** The point between the shoulders in the body's frame, the trunk posed as it is. */
function between(j: Joints, out: THREE.Vector3): THREE.Vector3 {
  j.root.updateMatrixWorld(true);
  j.shoulderL.getWorldPosition(out).add(j.shoulderR.getWorldPosition(_sh)).multiplyScalar(0.5);
  return j.body.worldToLocal(out);
}

/** Where a point of the eyes' view (camera space) is in the body's frame. */
function seen(j: Joints, cam: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  j.root.updateMatrixWorld(true);
  return j.body.worldToLocal(fromEyes(j.root, j.neck, cam, out));
}

/** The arms through the eyes are drawn by a camera of their own, narrower than the world's (models/warrior.ts
 *  `EYES.fov`, 45 degrees against 66): a place on the world's screen shows this much further out on theirs. */
const ARMS_LENS = Math.tan((45 * Math.PI) / 360) / Math.tan((66 * Math.PI) / 360);
/** A place on the arms' screen (as `fromScreen`'s, across and up to their frame's edges, and metres ahead) in the
 *  body's frame. */
const onScreen = (j: Joints, on: readonly number[], out: THREE.Vector3): THREE.Vector3 =>
  seen(j, fromScreen([on[0] * ARMS_LENS, on[1] * ARMS_LENS, on[2]], _cam), out);

/** An arm reaching `at` (the body's frame) by `w` of the way from the pose's own, its elbow towards its pole (through
 *  the eyes down and out from the arms' shoulders under the view). */
function place(j: Joints, left: boolean, at: THREE.Vector3, w: number, eyes = false): void {
  if (w <= 0) return;
  const shoulder = left ? j.shoulderL : j.shoulderR, elbow = left ? j.elbowL : j.elbowR;
  _sq.copy(shoulder.quaternion); _eq.copy(elbow.quaternion);
  j.chest.worldToLocal(j.body.localToWorld(_at.copy(at)));
  _pole.copy(left ? POLE_L : POLE_R);
  if (eyes) _pole.x *= POLE_EYES / 0.35;
  reachArm(shoulder, elbow, j.P.upperL, j.P.foreL, _at, _pole);
  // (each from the pose's own towards the reach: `slerpQuaternions` into one of its own ends copies over it first)
  if (w < 1) { shoulder.quaternion.copy(_sq.slerp(shoulder.quaternion, w)); elbow.quaternion.copy(_eq.slerp(elbow.quaternion, w)); }
}

/** `mid` moved by `off` (to his left, up, ahead). */
const from = (mid: THREE.Vector3, off: readonly number[], out: THREE.Vector3): THREE.Vector3 => out.set(mid.x + off[0], mid.y + off[1], mid.z + off[2]);

/** Each knuckle line `w` of the way to `to`. */
function lineTo(line: THREE.Vector3, to: readonly number[], w: number): void {
  line.set(lerp(line.x, to[0], w), lerp(line.y, to[1], w), lerp(line.z, to[2], w));
}

/** Where a fist is in the guard, into `out` (the body's frame): third person by the shoulders, through the eyes by its
 *  place on the screen (`easy`: out of a fight, held lower), with the breath's and the bob's lift (m). */
function guardAt(j: Joints, left: boolean, eyes: boolean, easy: number, lift: number, out: THREE.Vector3): THREE.Vector3 {
  if (eyes) {
    const on = left ? GUARD_EYES.lead : GUARD_EYES.rear;
    return onScreen(j, [on[0], on[1] + EASY_EYES * easy + lift * 2, on[2]], out);
  }
  between(j, _mid);
  return from(_mid, left ? GUARD.lead : GUARD.rear, out).setY(out.y + lift);
}

/**
 * The guard by `w` of the way from the pose's own arms: both fists up before him, loose, rising and falling with his
 * breath and a fighter's bounce (`t`); through the eyes lower out of a fight (`easy`, 0..1). `shielded`: the right
 * alone, the left arm left to the shield on it.
 */
export function fistGuard(j: Joints, w: number, t: number, eyes: boolean, shielded = false, easy = 0): void {
  if (w <= 0) return;
  const bob = 0.008 * Math.sin(t * 1.8) + 0.006 * (1 - easy) * Math.sin(t * 5.2);
  if (!shielded) {
    place(j, true, guardAt(j, true, eyes, easy, bob, _far), w, eyes);
    lineTo(fistLine.L, sided(LINE.guard, true), 1);
  }
  place(j, false, guardAt(j, false, eyes, easy, bob * 0.8, _far), w, eyes);
  lineTo(fistLine.R, LINE.guard, 1);
  // (the wrists straight behind the knuckles)
  j.handL.rotation.set(lerp(j.handL.rotation.x, 0, w), 0, 0);
  j.handR.rotation.set(lerp(j.handR.rotation.x, 0, w), 0, 0);
}

/** Where a punch lands, into `out` (the body's frame): straight out along the middle line from the shoulder, a little
 *  short of the arm's length; through the eyes just under the crosshair. */
function punchAt(j: Joints, left: boolean, eyes: boolean, out: THREE.Vector3): THREE.Vector3 {
  const shoulder = left ? j.shoulderL : j.shoulderR, reach = (j.P.upperL + j.P.foreL) * PUNCH_REACH;
  j.body.worldToLocal(shoulder.getWorldPosition(_sh));
  if (eyes) {
    const on = [left ? -PUNCH_EYES.across : PUNCH_EYES.across, PUNCH_EYES.up];
    if (onReach(onScreen(j, [on[0], on[1], 0.1], _near), onScreen(j, [on[0], on[1], 1.5], out), _sh, reach, out)) {
      return out;
    }
  } else from(between(j, _mid), PUNCH_AT, out);
  return out.sub(_sh).setLength(reach).add(_sh);
}

/** The point of the line from `near` to `far` that lies `reach` from `shoulder`, the further one, into `out`; false
 *  where the line passes beyond the reach. */
function onReach(near: THREE.Vector3, far: THREE.Vector3, shoulder: THREE.Vector3, reach: number, out: THREE.Vector3): boolean {
  const way = _cam.subVectors(far, near).normalize(), back = _at.subVectors(near, shoulder);
  const b = back.dot(way), c = back.lengthSq() - reach * reach, d = b * b - c;
  if (d < 0) return false;
  out.copy(near).addScaledVector(way, -b + Math.sqrt(d));
  return true;
}

/**
 * The trunk behind a punch at `k` of its cast, out `out` of the way (`lead`: the jab, else the cross): the hips first,
 * the chest after them, the shoulder sent after the fist; the head kept on the foe. Moving, the legs step and the
 * weight stays over them (`still`). Through the eyes the camera rides the head, so the shoulder alone goes.
 */
function trunkBehind(j: Joints, k: number, lead: boolean, still: number, eyes: boolean): void {
  const hips = curve(PUNCH_OUT, k + LEAD.hips), chest = curve(PUNCH_OUT, k + LEAD.chest), out = curve(PUNCH_OUT, k);
  const shoulder = lead ? j.shoulderL : j.shoulderR;
  // (the shoulder sent in after the fist: forward and in, as the collarbone carries it)
  shoulder.position.z += (eyes ? 0.14 : 0.04) * out;
  shoulder.position.x += (lead ? -1 : 1) * (eyes ? 0.03 : 0.012) * out;
  if (eyes) return;
  const turn = lead ? -0.16 : 0.5, w = 0.45 + 0.55 * still;
  j.hips.rotation.y += 0.5 * turn * hips * w;
  j.spine.rotation.y += 0.2 * turn * chest;
  j.chest.rotation.y += 0.5 * turn * chest;
  j.neck.rotation.y -= 0.9 * turn * (0.5 * hips * w + 0.7 * chest);
  j.spine.rotation.x += (lead ? 0.02 : 0.05) * chest;
  j.body.position.z += (lead ? 0.03 : 0.07) * hips * w;
  j.body.position.y += (lead ? -0.005 : -0.012) * hips * w;
}

/**
 * A punch at `k` of its cast: the lead hand's jab (`lead`) or the rear hand's cross, over the guard. `still`: how far
 * he stands; `shielded`: a shield on the left arm, which keeps its own pose (every punch is then the right hand's).
 */
export function fistPunch(j: Joints, k: number, lead: boolean, still: number, t: number, eyes: boolean, shielded = false): void {
  trunkBehind(j, k, lead, still, eyes);
  fistGuard(j, 1, t, eyes, shielded);
  const out = curve(PUNCH_OUT, k);
  place(j, lead, punchAt(j, lead, eyes, _far), Math.max(0, out), eyes);
  lineTo(lead ? fistLine.L : fistLine.R, sided(LINE.punch, lead), smooth(Math.min(1, Math.max(0, out) * 1.4)));
  // (the other fist drawn in tight to the jaw as this one goes: through the eyes down and back in the frame)
  if (shielded) return;
  if (eyes) {
    const on = lead ? GUARD_EYES.rear : GUARD_EYES.lead;
    place(j, !lead, onScreen(j, [on[0] * (1 + 0.2 * out), on[1] - 0.12 * out, on[2] - 0.08 * out], _far), 1, eyes);
  } else (lead ? j.elbowR : j.elbowL).rotation.x += -0.1 * out;
}

/**
 * A two-fisted hammer at `k` of its cast (Savage Fists' at full Frenzy): both fists raised together over his head,
 * the back arching, then brought down onto what's before him as the skill lands, the knees giving under it.
 */
export function fistHammer(j: Joints, k: number, eyes: boolean): void {
  const up = curve(HAMMER_UP, k), down = curve(HAMMER_DOWN, k);
  if (!eyes) {
    // (standing tall through it, the trunk over the hips: bent into it, 24 degrees at the spine and 12 cm down, he
    // ducked under his own blow, from play: "his two handed punch he ducks down as well, looks weird")
    j.spine.rotation.x += -0.12 * up + 0.05 * down; j.chest.rotation.x += -0.06 * up + 0.03 * down;
    j.neck.rotation.x += -0.06 * up - 0.12 * down;
    j.hips.rotation.y += 0.2 * Math.max(up, down);
    j.body.position.y += 0.02 * up; j.body.position.z += 0.03 * down;
  }
  const w = Math.max(up, down, ramp(k, 0, 0.15) * (1 - ramp(k, 0.85, 1)));
  if (eyes) {
    // (in the view: up into its top, then down through the middle to under the crosshair)
    const y = lerp(lerp(-0.3, 0.55, up), -0.35, down), ahead = lerp(0.5, 0.65, down);
    place(j, true, onScreen(j, [-0.05, y, ahead], _far), w, eyes);
    place(j, false, onScreen(j, [0.05, y, ahead], _far), w, eyes);
  } else {
    between(j, _mid);
    const y = lerp(lerp(0, 0.45, up), -0.28, down), z = lerp(lerp(0.3, 0.18, up), 0.55, down);
    place(j, true, _far.set(_mid.x + 0.07, _mid.y + y, _mid.z + z), w);
    place(j, false, _far.set(_mid.x - 0.07, _mid.y + y, _mid.z + z), w);
  }
  // (the fists side by side, knuckles out)
  lineTo(fistLine.L, sided(LINE.punch, true), w); lineTo(fistLine.R, LINE.punch, w);
}

/** Rampage: the flurry at `beat` (the blows thrown so far and the share of the next): each blow a punch, the lead
 *  hand's and the rear's in turn, thrown over his walk (the legs his own). */
export function fistRampage(j: Joints, beat: number, still: number, t: number, eyes: boolean): void {
  const n = Math.floor(beat), k = beat - n;
  // (a blow's own time, a fifth of a second at its own pace: the same keys as a punch's cast)
  fistPunch(j, k, n % 2 === 0, still * 0.6, t, eyes);
  if (!eyes) j.spine.rotation.x += 0.06;
}

/** Pounce's shares of its pose: the leap's, and each blow's middle after it (`POUNCE` in data/balance.ts) */
const pounceShares = () => {
  const total = POUNCE.leap + POUNCE.first + POUNCE.apart * (POUNCE.blows - 1) + POUNCE.after;
  return { leap: POUNCE.leap / total, blow: (i: number) => (POUNCE.leap + POUNCE.first + POUNCE.apart * i) / total, apart: POUNCE.apart / total };
};

/**
 * Pounce at `k` of its leap and its blows, as a body leaps at something: launched off the rear foot stretched long, the
 * body pitched forward and both arms flung ahead; then gathered in the air, the knees drawn up under him and both fists
 * raised behind his head; then the fists coming down ahead of him as he drops onto bent knees before what he lands on,
 * and each fist driven into it, a blow at each of the skill's (`POUNCE`). Returns how far the pose owns the legs.
 */
export function fistPounce(j: Joints, k: number, t: number, eyes: boolean): number {
  const s = pounceShares(), p = k / s.leap;
  // (the leap's phases, each eased in and out: launched, gathered, coming down; then low on the landing)
  const launch = ramp(p, 0, 0.12) * (1 - ramp(p, 0.2, 0.45));
  const tuck = ramp(p, 0.25, 0.5) * (1 - ramp(p, 0.75, 0.95));
  const fall = ramp(p, 0.7, 0.9) * (1 - ramp(k, s.leap + 0.02, s.leap + 0.08));
  const air = Math.max(launch, tuck, fall);
  const low = ramp(k, s.leap - 0.03, s.leap + 0.04) * (1 - ramp(k, 0.9, 1));
  if (!eyes) {
    // (pitched forward over the leap: long and low as he goes, rounded over his knees in the air)
    j.body.rotation.x += 0.45 * launch + 0.6 * tuck + 0.3 * fall;
    j.spine.rotation.x += 0.1 * launch + 0.35 * tuck + 0.2 * fall + 0.22 * low;
    j.neck.rotation.x += -0.45 * launch - 0.45 * tuck - 0.3 * fall - 0.15 * low;
    j.body.position.y += -0.12 * low; j.body.position.z += 0.06 * low;
    // (the lead leg driven up and the rear one pushing off long behind; tucked, both knees drawn up; coming down, the
    // legs reaching for the floor, knees bent to take him)
    j.thighL.rotation.x += -0.9 * launch - 1.4 * tuck - 0.7 * fall; j.kneeL.rotation.x += 0.9 * launch + 1.9 * tuck + 0.8 * fall;
    j.thighR.rotation.x += 0.45 * launch - 1.1 * tuck - 0.4 * fall; j.kneeR.rotation.x += 0.2 * launch + 1.9 * tuck + 0.9 * fall;
  }
  fistGuard(j, 1, t, eyes);
  if (air > 0) {
    if (eyes) {
      // (through the eyes: flung ahead out of the view's foot, raised over the view, then down into its middle)
      const y = lerp(lerp(-0.2, 0.6, tuck), -0.25, fall);
      place(j, true, onScreen(j, [-0.25, y, 0.45], _far), air, eyes);
      place(j, false, onScreen(j, [0.3, y, 0.45], _far), air, eyes);
    } else {
      between(j, _mid);
      // (flung ahead at the shoulders' height, raised behind the head, then down ahead at the chest's)
      const y = lerp(lerp(0.02, 0.38, tuck), -0.12, fall), z = lerp(lerp(0.5, -0.02, tuck), 0.5, fall);
      place(j, true, _far.set(_mid.x + 0.16, _mid.y + y, _mid.z + z), air);
      place(j, false, _far.set(_mid.x - 0.16, _mid.y + y, _mid.z + z), air);
    }
  }
  // on it: each blow a fist driven into its body, the lead hand first (a pinned foe still stands: driven down to
  // the floor, the blows went into its knees)
  for (let i = 0; i < POUNCE.blows; i++) {
    const at = s.blow(i), u = (k - at) / s.apart + 0.5;
    if (u <= 0 || u >= 1) continue;
    const out = curve(PUNCH_OUT, u), left = i % 2 === 0;
    if (!eyes) j.chest.rotation.y += (left ? -0.18 : 0.22) * out;
    if (eyes) place(j, left, onScreen(j, [left ? -0.08 : 0.08, -0.3, 0.55], _far), out, eyes);
    else {
      between(j, _mid);
      place(j, left, _far.set(_mid.x + (left ? 0.05 : -0.05), _mid.y - 0.18, _mid.z + 0.55), out);
    }
    lineTo(left ? fistLine.L : fistLine.R, sided(LINE.punch, left), out);
  }
  return eyes ? 0 : air;
}

/**
 * Bloodrush at `run` of its dash (0..1, the charge's legs under it: models/warrior.ts `chargeLegs`): low and shoulder
 * first, the lead forearm up across the face as a ram, the rear fist driven back by the hip, the head down behind them.
 */
export function fistRush(j: Joints, run: number, eyes: boolean): void {
  if (run <= 0) return;
  if (!eyes) { j.chest.rotation.y += -0.35 * run; j.spine.rotation.x += 0.2 * run; j.neck.rotation.y += 0.3 * run; }
  if (eyes) {
    place(j, true, onScreen(j, [-0.12, -0.35, 0.36], _far), run, eyes);
    place(j, false, onScreen(j, [0.5, -0.9, 0.4], _far), run, eyes);
  } else {
    between(j, _mid);
    place(j, true, _far.set(_mid.x - 0.02, _mid.y + 0.06, _mid.z + 0.3), run);
    place(j, false, _far.set(_mid.x - 0.24, _mid.y - 0.42, _mid.z - 0.1), run);
  }
  lineTo(fistLine.L, [0, 1, 0], run);
}

/** Wrath's shares of its cast: it lands at 0.65 (its `fireAt`) */
const WRATH_LANDS = 0.65;
const HOOK_OUT: Keys = [[0, 0], [0.4, -0.25], [0.58, 0.9], [WRATH_LANDS, 1], [0.8, 0.9], [1, 0.6]];
const SLAM_UP: Keys = [[0, 0], [0.45, 1], [0.52, 1], [WRATH_LANDS, 0], [1, 0]];
const SLAM_DOWN: Keys = [[0, 0], [0.5, 0], [WRATH_LANDS, 1], [1, 1]];

/**
 * Wrath at `k` of its cast, of `form` (0 a hook, 1 a slam, 2 a quake): the hook a rear-hand blow swung round from the
 * side, the hips and the trunk turning hard through it, the elbow up level with the fist; the slam both fists raised
 * high together, the back arched, then brought down onto the floor before him as he drops onto a knee's bend, a quake
 * deeper and wider. Returns the feet's spread it wants (0 none).
 */
export function fistWrath(j: Joints, k: number, form: number, t: number, eyes: boolean): number {
  if (form === 0) {
    const out = curve(HOOK_OUT, k), coil = Math.min(0, out), go = Math.max(0, out);
    if (!eyes) {
      // (wound up turned away to his right, then round to the left through the blow)
      j.hips.rotation.y += 0.25 * coil + 0.6 * go; j.chest.rotation.y += 0.3 * coil + 0.7 * go;
      j.neck.rotation.y -= 0.8 * (0.6 * go - 0.3 * -coil);
      j.body.position.y += -0.05 * (go - coil); j.spine.rotation.x += 0.08 * go;
    }
    fistGuard(j, 1, t, eyes);
    if (eyes) {
      // (swung in from the right edge, the forearm level across the view, into the crosshair)
      const across = lerp(0.75, 0.02, go), up = lerp(-0.45, -0.08, go);
      place(j, false, onScreen(j, [across - 0.2 * coil, up, lerp(0.42, 0.62, go)], _far), Math.max(go, -coil), eyes);
    } else {
      between(j, _mid);
      // (round from his right side, the elbow up: the fist sweeps in level at the chin to the middle line)
      const a = lerp(-1.2, 0.15, go) + 0.4 * coil;
      const r = 0.48;
      place(j, false, _far.set(_mid.x + Math.sin(a) * r, _mid.y + 0.0, _mid.z + Math.cos(a) * r), Math.max(go, -coil));
      j.shoulderR.rotation.z += -0.4 * go;
    }
    lineTo(fistLine.R, [0, 1, 0], go);
    return 0;
  }
  const up = curve(SLAM_UP, k), down = curve(SLAM_DOWN, k), deep = form === 2 ? 1.2 : 1;
  if (!eyes) {
    j.spine.rotation.x += -0.25 * up + 0.42 * down * deep; j.chest.rotation.x += -0.1 * up + 0.15 * down;
    j.neck.rotation.x += -0.15 * up - 0.4 * down;
    j.hips.rotation.y += 0.3 * Math.max(up, down); j.chest.rotation.y += -0.1 * Math.max(up, down);
    j.body.position.y += 0.03 * up - 0.28 * down * deep; j.body.position.z += 0.1 * down;
  }
  const w = Math.max(smooth(ramp(k, 0, 0.3)), down);
  if (eyes) {
    const y = lerp(lerp(-0.4, 0.75, up), -0.85, down), ahead = lerp(0.45, 0.7, down);
    place(j, true, onScreen(j, [-0.06, y, ahead], _far), w, eyes);
    place(j, false, onScreen(j, [0.06, y, ahead], _far), w, eyes);
  } else {
    between(j, _mid);
    const y = lerp(lerp(0, 0.5, up), -0.8 * deep, down), z = lerp(lerp(0.25, 0.15, up), 0.5, down);
    place(j, true, _far.set(_mid.x + 0.08, _mid.y + y, _mid.z + z), w);
    place(j, false, _far.set(_mid.x - 0.08, _mid.y + y, _mid.z + z), w);
  }
  lineTo(fistLine.L, sided(LINE.punch, true), w); lineTo(fistLine.R, LINE.punch, w);
  return form === 2 ? 1 : 0.6;
}
