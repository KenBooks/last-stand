// The warrior's poses with both hands empty (no weapon, no shield; #400): a berserker's guard and his fists' skills,
// Savage Fists' punches ('punch'), Rampage's flurry as he walks ('rampage'), Pounce's leap and the blows
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
import { tunable } from '../../core/tuning';

/** a hand closing: its curl and its fingers' spread on the way (models/hands.ts `poseHand`), and from how far closed
 *  it takes the closed fist's pose (`closeFist`) */
export const FIST = tunable('fist', {
  curl: 1.7, spread: 0.02, from: 0.6,
  /** share of the arm's reach at impact: about 20 degrees of elbow bend */
  reach: 0.985, eyesReach: 0.93,
});

/** where each fist is held in the guard, from the point between the shoulders, in the body's frame (m: to his left,
 *  up, ahead): the lead (left) further out, both at the chin and out before it, the elbows in by the ribs */
// (at the chin, a little out before it, the forearms sloping forward from the elbows: 0.3 and 0.2 ahead with the
// knuckle line upright the forearms stood upright and the knuckles faced the sky; 0.42 and 0.34 the fists were held out
// before the face, the elbows up at the chest, two adversarial reviews; 5 cm higher, at the eyes from the side, a third)
const GUARD = tunable('fistGuard', { lead: [0.13, 0.03, 0.34], rear: [-0.12, 0.01, 0.27] });
/** through the eyes, the guard's places on the screen (`fromScreen`: across and up from the middle to the frame's
 *  edges, and metres ahead): as a fighter sees his own guard (Codex's reference photographs, `.tmp/refs/fpguard`, the
 *  close-up and the side view an adversarial review passed), each fist big, low either side of the middle with the
 *  view clear between them, 0.40 to 0.42 m ahead, with the forearms rising forward from elbows down
 *  by the ribs, the lead (left) a little higher and further in, reached from his own shoulders as the ranger's hands
 *  are (`fistsLens`); a little lower out of a fight. At 0.3 m the forearms stood upright under the fists, the
 *  knuckles to the sky ("nobody can strike from how you drew it"); 0.46 to 0.52 m ahead out towards the corners,
 *  they were small fists far off (from play: "1st person looked terrible"); in the corners from shoulders under the
 *  eyes, they were huge blobs at the view's foot */
const GUARD_EYES = tunable('fistsEyes', {
  lead: [-0.32, -0.45, 0.36], rear: [0.36, -0.5, 0.34],
  /** The index end up and a little in: the fists turned in towards his body, the palms facing each other and the
   *  thumbs on top towards his own face, as a boxer holds his guard, a quarter turn from the palm down a punch lands
   *  with. Index end out, the palms towards his face and the thumbs on the fists' outer sides, was the top of a
   *  curl, from play: "fists are rotated in a way that makes it anatomically difficult to have strength in a strike,
   *  so it looks fake, you need to rotate fists towards the body ... in guard pose" (his earlier "thumbs are facing
   *  outward... and face looking at inside palms" said what was wrong, and was read as what he wanted). */
  line: [-0.55, 0.85, 0],
  /** The elbows down by the ribs so the palm can turn inward without winding the forearms past their range. */
  pole: 0.4,
}), EASY_EYES = -0.22;
/** where a punch lands: on his middle line at the chin's height, further than the arm reaches (it goes out straight
 *  at it, a little short of locked); through the eyes under the crosshair, a little to the fist's own side, where
 *  the screen's line there meets the arm's reach (aimed further, the arm pointed at it from the shoulder under the
 *  view and the fist stopped short, low and near at the view's foot, its fingers seen from above as an open hand) */
const PUNCH_AT = [0, -0.04, 1.2];
/** the elbows' way in the chest's frame: down and a little out in the guard */
const POLE_L = new THREE.Vector3(0.15, -1, -0.1), POLE_R = new THREE.Vector3(-0.15, -1, -0.1);
/** through the eyes: down and out, so the forearm rises from the frame's bottom corner (camera space, for each side) */

/**
 * A punch through the eyes, the jab's and the cross's (both land on `STRIKE`): the most of the arm's reach its wrist
 * goes to (short of straight: at 0.93 and 0.97 the fist was a speck at the
 * crosshair behind its own sleeve, the sleeve the largest thing in the view, an adversarial review's "sleeve thrust"); how far its elbow comes up and out as the fist turns over (`flare`,
 * 0 down by the ribs, 1 level with the fist); how far its shoulder is sent after it (`shoulder`: in, up, ahead, m: up
 * to the chin and in under the eyes, so the arm runs from the view's foot to its middle, foreshortened, and not in
 * from a corner as a thin stick); and where the other fist goes meanwhile, off its guard (`other`: out to its own
 * side and up on the screen, and ahead, m: drawn back to the jaw as the body turns behind the blow).
 */
/** through the eyes, the one point both fists' knuckles land on: on the screen (across, up: the knuckles on the
 *  crosshair's line, the fist's body under it) and ahead of the eyes
 *  (m), how far a fist's knuckles are on from its wrist (m), and how its knuckle line lies as it lands (rad up from
 *  across, the thumb in: nearly palm down) */
const STRIKE = tunable('strikeEyes', { at: [0, -0.04], ahead: 0.56, hand: 0.1, lands: 0.12, past: 0.03 });
const PUNCH_EYES = {
  jab: tunable('jabEyes', {
    reach: 0.97, flare: 0.7, shoulder: [0.03, 0.02, 0.08], other: [0.12, -0.12, 0],
  }),
  cross: tunable('crossEyes', {
    reach: 0.97, flare: 0.8, shoulder: [0.06, 0.02, 0.12], other: [0.22, -0.22, -0.04],
  }),
};

/** a boxer's stance, the fists up (third person): the trunk bladed, the lead side to the foe (the hips' and the
 *  chest's turn, rad), leant a little over the lead knee, the chin down behind the lead shoulder, sunk into the knees
 *  (m). Square and upright with the fists up he stood as a man waiting for a bus (from play: "current is very lame") */
const BOX = tunable('boxStance', { hips: -0.3, chest: -0.14, lean: 0.14, chin: 0.12, sink: 0.015, ahead: 0.03 });

/**
 * The body behind each punch (third person), over the stance: how far the hips, the spine and the chest turn into it
 * (rad: a jab snaps the lead shoulder out a little further; a cross turns the hips through from bladed to past
 * square, the chest further, the rear shoulder ending where the lead one was; the feet kept where they stand
 * meanwhile, `LegIK.rooted`), how far the weight goes forward, down
 * and across onto the lead leg (m), how far the trunk leans into it (rad), and how far the shoulder is sent after the
 * fist (ahead and up, m).
 */
const BODY = {
  jab: tunable('jabBody', {
    hips: -0.12, spine: -0.1, chest: -0.4, ahead: 0.07, down: 0.02, across: 0, lean: 0.02, shoulder: [0.12, 0.06],
  }),
  cross: tunable('crossBody', {
    hips: 0.6, spine: 0.4, chest: 0.4, ahead: 0.08, down: 0.05, across: 0.03, lean: 0.05, shoulder: [0.09, 0.04],
  }),
};

/** a punch over its cast: how far the fist is out (a hair drawn back first, out fast, held on the blow as the skill
 *  lands at 0.5, back to the guard), and the hips' and the chest's turn led a little ahead of it */
const PUNCH_OUT: Keys = [[0, 0], [0.1, -0.06], [0.42, 0.96], [0.52, 1], [0.6, 0.97], [0.88, 0.08], [1, 0]];
/** the jab's and the cross's own: neither is wound up (a boxer doesn't tell his punch; the cross sits back onto the
 *  rear hip a hair as the hips start), the fist quickest as it lands, held on the blow a moment and brought back to
 *  the guard slower than it went. Eased in and out alike, it was a piston pushed out and pulled back. */
// (moving through nearly the whole cast, as a weapon's cut does: gathering from its start, quickest as it lands, and
// easing home until just before the next. Still for the first quarter and the last fifth, with the way out and back
// packed between, a row of punches was a stop and a start each, from play: "make the attacks smooth like our weapon
// attacks are smooth")
// (and the blow itself is short: gathered slowly over the cast's first third, drawn back a little as the weight
// loads, then thrown in about 45 ms, as it was at twice the pace, and brought home slowly. Spread evenly over the
// slower cast it was a push, from play: "we need to speed up the actual attack.... like the strike itself... so it
// looks natural like something with actual strike power")
const JAB_OUT: Keys = [
  [0, 0], [0.14, -0.05], [0.3, 0.03], [0.38, 0.18], [0.47, 0.94], [0.5, 1], [0.55, 1], [0.68, 0.6], [0.8, 0.25],
  [0.9, 0.06], [0.96, 0], [1, 0],
];
const CROSS_OUT: Keys = [
  [0, 0], [0.16, -0.1], [0.31, 0], [0.39, 0.16], [0.48, 0.94], [0.51, 1], [0.57, 1], [0.7, 0.6], [0.82, 0.25],
  [0.91, 0.06], [0.96, 0], [1, 0],
];
const LEAD = { hips: 0.09, chest: 0.045 };
/** through the eyes, how far the fist is turned over from its guard through a punch's cast */
// (both back by 0.8 of the cast, as the fist is: the next move takes the pose over from about 0.85, and what was
// left of the turn and of the way back then, a quarter and a twentieth, went in one frame, the jerk seen from play)
const TURN_OVER: Keys = [[0, 0], [0.3, 0], [0.47, 1], [0.57, 1], [0.92, 0], [1, 0]];
/** third person, the fist that isn't punching: how far it's drawn back to the cheek and up as the other lands (m) */
const FREE_IN = [0.13, 0.02];

/**
 * The line of each fist's knuckles this frame, in the body's frame (to his left, up, ahead; the model clears both
 * before it poses, and a fist with none keeps the hand's own): upright in the guard, the palms in towards each other,
 * and across in a punch, the palm turned down as it goes out. `closeFist` turns the visible hand about the forearm.
 * The wrist's joint is left alone: turned at the joint, the bare wrist's skin
 * was wrung flat into a ribbon standing off the arm.
 */
export const fistLine = { L: new THREE.Vector3(), R: new THREE.Vector3() };
/** the knuckles' line in the guard and in a punch, each hand's (in the body's frame): the way from the little
 *  finger's knuckle to the index's, as a handle runs up out of a fist (`hold`), so the left hand's punch is the
 *  right's mirrored (the same line for both turned the left palm up, its fingers curled at the eyes as a claw) */
// (in the guard ahead and across, the palm turned in by half: the knuckles face forward along the sloping forearm, the
// thumb across the fingers; a line mostly upward turned the fist against the forearm, the wrist bent back by `hold`)
const LINE = tunable('fistLines', { guard: [0.7, 0, 0.7], punch: [1, 0, 0] });
/** a knuckle line for the hand on that side: mirrored across his middle for the left */
const sided = (line: readonly number[], left: boolean): number[] => (left ? [-line[0], line[1], line[2]] : [...line]);

const _mid = new THREE.Vector3(), _at = new THREE.Vector3(), _sh = new THREE.Vector3(), _far = new THREE.Vector3();
const _cam = new THREE.Vector3(), _pole = new THREE.Vector3(), _near = new THREE.Vector3();
const _from = new THREE.Vector3();
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
 *  `EYES.fov`, 45 degrees against 66): a place on the world's screen shows this much further out on theirs. Bare
 *  fists are drawn at the world's lens (`fistsLens`), as the ranger's hands are, and a place shows where it is. */
const NARROW_LENS = Math.tan((45 * Math.PI) / 360) / Math.tan((66 * Math.PI) / 360);
let ARMS_LENS = NARROW_LENS;
/** Whether the fists through the eyes are drawn at the world's own lens this frame (both hands bare), or the arms'. */
export function fistsLens(world: boolean): void {
  ARMS_LENS = world ? 1 : NARROW_LENS;
}
/** A place on the arms' screen (as `fromScreen`'s, across and up to their frame's edges, and metres ahead) in the
 *  body's frame. */
const onScreen = (j: Joints, on: readonly number[], out: THREE.Vector3): THREE.Vector3 =>
  seen(j, fromScreen([on[0] * ARMS_LENS, on[1] * ARMS_LENS, on[2]], _cam), out);

/** An arm reaching `at` (the body's frame) by `w` of the way from the pose's own, its elbow towards its pole (through
 *  the eyes down and out from the arms' shoulders under the view). */
function place(j: Joints, left: boolean, at: THREE.Vector3, w: number, eyes = false, flare = 0): void {
  if (w <= 0) return;
  const shoulder = left ? j.shoulderL : j.shoulderR, elbow = left ? j.elbowL : j.elbowR;
  _sq.copy(shoulder.quaternion); _eq.copy(elbow.quaternion);
  j.chest.worldToLocal(j.body.localToWorld(_at.copy(at)));
  _pole.copy(left ? POLE_L : POLE_R);
  if (eyes) _pole.x *= GUARD_EYES.pole / POLE_L.x;
  // (the elbow up and out as a punch's fist turns over: `flare`, 1 level with the fist)
  if (flare > 0) { _pole.x = lerp(_pole.x, left ? 1 : -1, flare); _pole.y = lerp(_pole.y, -0.15, flare); }
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
    lineTo(fistLine.L, sided(eyes ? GUARD_EYES.line : LINE.guard, true), 1);
  }
  place(j, false, guardAt(j, false, eyes, easy, bob * 0.8, _far), w, eyes);
  lineTo(fistLine.R, eyes ? GUARD_EYES.line : LINE.guard, 1);
  // (the wrists straight behind the knuckles)
  j.handL.rotation.set(lerp(j.handL.rotation.x, 0, w), 0, 0);
  j.handR.rotation.set(lerp(j.handR.rotation.x, 0, w), 0, 0);
}

/** Where a punch lands, into `out` (the body's frame): straight out along the middle line from the shoulder, a little
 *  short of the arm's length; through the eyes just under the crosshair. */
function punchAt(j: Joints, left: boolean, eyes: boolean, out: THREE.Vector3): THREE.Vector3 {
  const shoulder = left ? j.shoulderL : j.shoulderR, seenAs = left ? PUNCH_EYES.jab : PUNCH_EYES.cross;
  const reach = (j.P.upperL + j.P.foreL) * (eyes ? seenAs.reach : FIST.reach);
  // (the middle line first: `between` works in `_sh` too, and read before it the punch was measured from the other
  // shoulder's place in the world, every punch thrown out to its arm's full length, the elbow locked straight)
  if (!eyes) from(between(j, _mid), PUNCH_AT, out);
  j.body.worldToLocal(shoulder.getWorldPosition(_sh));
  if (eyes) return strikeWrist(j, left, _sh, reach, out);
  return out.sub(_sh).setLength(reach).add(_sh);
}

/**
 * Through the eyes both fists land on one point, straight ahead under the crosshair (`STRIKE`): from play, "attack
 * point should be same, roughly in front... currently each fist is hitting its own target". Each wrist was sent to a
 * place of its own on the screen, and its knuckles, a hand's length on along its own forearm, landed either side of
 * the middle, a tenth of the view apart. Where the wrist goes (`out`, the body's frame) so the knuckles land on the
 * point: the hand's length back from it along the forearm as the arm reaches it (`shoulder` in the body's frame,
 * `reach` the furthest the wrist goes from it), found by reaching once and reading the forearm.
 */
function strikeWrist(j: Joints, left: boolean, shoulder: THREE.Vector3, reach: number, out: THREE.Vector3): THREE.Vector3 {
  // (each aimed a little past the middle: as read off the screen (the lab's live session, the knuckles a hand's
  // length on along the forearm) each landed 0.03 of the view short of it on its own side)
  const at = onScreen(j, [STRIKE.at[0] + (left ? STRIKE.past : -STRIKE.past), STRIKE.at[1], STRIKE.ahead], _strike);
  const back = (to: THREE.Vector3): THREE.Vector3 => {
    out.copy(at).addScaledVector(to, -STRIKE.hand);
    _reach.subVectors(out, shoulder);
    if (_reach.length() > reach) out.copy(shoulder).add(_reach.setLength(reach));
    return out;
  };
  back(_way.subVectors(at, shoulder).normalize());
  // (the forearm's way as the arm reaches that: the arm reached there and put back)
  const sh = left ? j.shoulderL : j.shoulderR, elbow = left ? j.elbowL : j.elbowR, hand = left ? j.handL : j.handR;
  _keepS.copy(sh.quaternion); _keepE.copy(elbow.quaternion);
  const flare = (left ? PUNCH_EYES.jab : PUNCH_EYES.cross).flare;
  place(j, left, _trial.copy(out), 1, true, flare);
  j.root.updateMatrixWorld(true);
  j.body.worldToLocal(hand.getWorldPosition(_way));
  j.body.worldToLocal(elbow.getWorldPosition(_reach));
  _way.sub(_reach).normalize();
  sh.quaternion.copy(_keepS); elbow.quaternion.copy(_keepE);
  // (`back` works in `_reach`: the way kept apart)
  return back(_trial.copy(_way));
}
const _strike = new THREE.Vector3(), _way = new THREE.Vector3(), _reach = new THREE.Vector3(), _trial = new THREE.Vector3();
const _keepS = new THREE.Quaternion(), _keepE = new THREE.Quaternion();

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
  const keys = lead ? JAB_OUT : CROSS_OUT;
  const hips = curve(keys, k + LEAD.hips), chest = curve(keys, k + LEAD.chest), out = curve(keys, k);
  const shoulder = lead ? j.shoulderL : j.shoulderR, side = lead ? -1 : 1;
  if (eyes) {
    // (the shoulder sent after the fist, up to the chin and in under the eyes)
    const [inward, up, ahead] = (lead ? PUNCH_EYES.jab : PUNCH_EYES.cross).shoulder;
    shoulder.position.x += side * inward * out; shoulder.position.y += up * out; shoulder.position.z += ahead * out;
    return;
  }
  const B = lead ? BODY.jab : BODY.cross, w = 0.45 + 0.55 * still;
  shoulder.position.z += B.shoulder[0] * out; shoulder.position.y += B.shoulder[1] * out;
  shoulder.position.x += side * 0.012 * out;
  fistStance(j, 1);
  j.hips.rotation.y += B.hips * hips * w;
  j.spine.rotation.y += B.spine * chest;
  j.chest.rotation.y += B.chest * chest;
  j.neck.rotation.y -= 0.9 * (B.hips * hips * w + (B.spine + B.chest) * chest);
  j.spine.rotation.x += B.lean * chest;
  j.neck.rotation.x -= 0.6 * B.lean * chest;
  j.body.position.z += B.ahead * hips * w;
  j.body.position.y -= B.down * hips * w;
  j.body.position.x += B.across * hips * w;
}

/** A boxer's stance by `w` (third person, `BOX`): the trunk bladed, leant in and sunk, the head kept on the foe. */
export function fistStance(j: Joints, w: number): void {
  if (w <= 0) return;
  j.hips.rotation.y += BOX.hips * w; j.chest.rotation.y += BOX.chest * w;
  j.neck.rotation.y -= 0.9 * (BOX.hips + BOX.chest) * w;
  j.spine.rotation.x += BOX.lean * w; j.neck.rotation.x += (BOX.chin - 0.5 * BOX.lean) * w;
  j.body.position.y -= BOX.sink * w; j.body.position.z += BOX.ahead * w;
}

/**
 * A punch at `k` of its cast: the lead hand's jab (`lead`) or the rear hand's cross, over the guard. `still`: how far
 * he stands; `shielded`: a shield on the left arm, which keeps its own pose (every punch is then the right hand's).
 */
export function fistPunch(j: Joints, k: number, lead: boolean, still: number, t: number, eyes: boolean, shielded = false): void {
  trunkBehind(j, k, lead, still, eyes);
  fistGuard(j, 1, t, eyes, shielded);
  const out = curve(lead ? JAB_OUT : CROSS_OUT, k), seenAs = lead ? PUNCH_EYES.jab : PUNCH_EYES.cross;
  // (the elbow comes up only as the fist turns over at the end of its reach, and folds down by the ribs on the way
  // back: up with the fist's whole way, it came back flared out at the shoulder's height, the fist swept across the
  // chest, an adversarial review)
  const over = smooth(Math.min(1, Math.max(0, (out - 0.55) / 0.45)));
  if (eyes) {
    // (through the eyes the fist itself is driven along the line from its guard to where it lands, drawn back along
    // it first: with the arm's joints eased from the guard's to the reach's, the fist swung out on whatever arc they
    // made and back down it, a piston with no path of its own, from play: "punches are hilarious", "where is punch
    // trajectory in 1st person? proper motion")
    guardAt(j, lead, true, 0, 0, _from).lerp(punchAt(j, lead, true, _far), out);
    // (taken from the guard's own pose over the first third of the way: over its first eighth, the fist on its way
    // home went from full speed to still in a frame, 21 mm then 1)
    place(j, lead, _from, smooth(Math.min(1, Math.abs(out) * (out < 0 ? 10 : 3))), true, seenAs.flare * over);
  } else place(j, lead, punchAt(j, lead, eyes, _far), Math.max(0, out), eyes, 0.6 * over);
  const turned = smooth(Math.min(1, Math.max(0, out) * 1.4)), line = lead ? fistLine.L : fistLine.R;
  if (eyes) {
    // (through the eyes the fist is turned over from its guard's line, the thumb up, to the punch's, the thumb in,
    // a quarter turn, as a forearm turns it: by the angle between them, never eased from one line to the other (with
    // an older guard, the thumb out, that went through nothing and the fist flipped over in a frame). And over the
    // cast's own time (`TURN_OVER`), not the fist's way out, which is three frames long and its way back two: over as
    // it lands, and back as the fist settles into its guard, from play: "on fist retraction from strike.... fist
    // position jerks at last moment")
    const [gx, gy] = GUARD_EYES.line, guarded = Math.atan2(gy, gx);
    const at = lerp(guarded, STRIKE.lands, curve(TURN_OVER, k));
    line.set((lead ? -1 : 1) * Math.cos(at), Math.sin(at), 0);
  } else lineTo(line, sided(LINE.punch, lead), turned);
  // (the other fist kept in its guard as this one goes, drawn in tight to the jaw; through the eyes where it was: drawn
  // down, out and 8 cm in there, it dropped from the guard and filled a quarter of the view)
  if (shielded) return;
  const back = Math.max(0, out);
  if (eyes) {
    // (and drawn back and down a little as the other goes out, the body's turn behind the blow: held dead still it
    // was a prop in the view's corner)
    const on = lead ? GUARD_EYES.rear : GUARD_EYES.lead, [aside, up, ahead] = seenAs.other;
    const to = [on[0] + Math.sign(on[0]) * aside * back, on[1] + up * back, on[2] + ahead * back];
    place(j, !lead, onScreen(j, to, _far), 1, eyes);
  } else {
    // (drawn in to the cheek, its elbow under it: left out in its guard it floated before the jaw, the same review)
    guardAt(j, !lead, false, 0, 0, _far);
    _far.z -= FREE_IN[0] * back; _far.y += FREE_IN[1] * back;
    place(j, !lead, _far, back);
  }
}

/** Rampage: the flurry at `beat` (the blows thrown so far and the share of the next): each blow a punch, the lead
 *  hand's and the rear's in turn, thrown over his walk (the legs his own). */
export function fistRampage(j: Joints, beat: number, still: number, t: number, eyes: boolean): void {
  const n = Math.floor(beat), k = beat - n;
  // (a blow's own time, a fifth of a second at its own pace: the same keys as a punch's cast)
  fistPunch(j, k, n % 2 === 0, still * 0.6, t, eyes);
  if (!eyes) j.spine.rotation.x += 0.06;
}

/** Pounce's leap through the eyes: where each fist is on the screen (across towards its own side, up, metres ahead)
 *  thrown up as he leaves the ground, and driven down as he lands */
const POUNCE_EYES = tunable('pounceEyes', { thrown: [0.56, 0.5, 0.62], driven: [0.1, -0.3, 0.56] });

/** Pounce's shares of its pose: the leap's, and the share `s` seconds after the landing (`POUNCE` in data/balance.ts) */
const pounceShares = () => {
  const total = POUNCE.leap + POUNCE.after;
  return { leap: POUNCE.leap / total, landed: (s: number) => (POUNCE.leap + s) / total };
};

/**
 * Pounce at `k` of its leap and its landing, as a body leaps at something: sunk into his knees, then sprung up and
 * forward at about 45 degrees, the lead fist reaching ahead and the rear one cocked by his ear, the knees driven up under
 * him; then the fists coming down ahead of him as he lands, a moment's give in the knees and up to his full height an
 * arm's length off what he lands on, his fists back in their guard for what he throws next. Returns how far the pose
 * owns the legs.
 */
export function fistPounce(j: Joints, k: number, t: number, eyes: boolean): number {
  const s = pounceShares(), p = k / s.leap;
  // (the leap's phases, each eased in and out: crouched to spring, launched, gathered, coming down; then standing on
  // the landing, at his full height an arm's length off what he lands on)
  const crouch = ramp(p, 0, 0.08) * (1 - ramp(p, 0.12, 0.22));
  const launch = ramp(p, 0.1, 0.2) * (1 - ramp(p, 0.28, 0.45));
  const tuck = ramp(p, 0.3, 0.5) * (1 - ramp(p, 0.72, 0.92));
  const fall = ramp(p, 0.7, 0.88) * (1 - ramp(k, s.landed(0.01), s.landed(0.05)));
  const air = Math.max(crouch, launch, tuck, fall);
  const low = ramp(k, s.landed(-0.025), s.landed(0.02)) * (1 - ramp(k, s.landed(0.035), s.landed(0.11)));
  if (!eyes) {
    // (sunk into his knees to spring; launched up and forward at about 45 degrees, the trunk upright over the hips and
    // the knees driven up, not dived flat; leaning into what he comes down on; a moment's give in the knees as he lands,
    // then tall. Pitched 26 to 34 degrees through the air and kept 12 cm down on the landing, he dived flat like a
    // swimmer and knelt into the foe: an adversarial review)
    j.body.position.y += -0.16 * crouch - 0.06 * low;
    j.body.rotation.x += 0.12 * crouch + 0.18 * launch + 0.15 * tuck + 0.2 * fall;
    j.spine.rotation.x += 0.18 * crouch + 0.05 * launch + 0.12 * tuck + 0.1 * fall + 0.06 * low;
    j.neck.rotation.x += -0.25 * crouch - 0.25 * launch - 0.25 * tuck - 0.25 * fall;
    // (crouched, both knees bent deep; launched, the lead knee driven up and the rear leg pushing off long behind;
    // tucked, both knees drawn up under him; coming down, the legs reaching for the floor)
    j.thighL.rotation.x += -0.75 * crouch - 1.2 * launch - 1.5 * tuck - 0.7 * fall;
    j.kneeL.rotation.x += 1.3 * crouch + 1.2 * launch + 1.9 * tuck + 0.7 * fall + 0.35 * low;
    j.thighR.rotation.x += -0.5 * crouch + 0.35 * launch - 1.2 * tuck - 0.4 * fall;
    j.kneeR.rotation.x += 1.1 * crouch + 0.3 * launch + 1.9 * tuck + 0.8 * fall + 0.35 * low;
  }
  fistGuard(j, 1, t, eyes);
  if (air > 0) {
    if (eyes) {
      // (through the eyes: both fists drawn down out of the view to spring, thrown up and out to its top corners as
      // he leaves the ground, as a man leaping onto something throws his arms up, then driven down together into
      // its middle as he lands on it. The lead fist held out in the middle and the rear one at its side all the way,
      // nothing in the view said he had left the ground, from play: "it really needs to feel like pounce")
      const [across, up, ahead] = POUNCE_EYES.thrown, [inAcross, inUp, inAhead] = POUNCE_EYES.driven;
      const fly = Math.max(launch, tuck);
      const x = lerp(lerp(0.3, across, fly), inAcross, fall), y = lerp(lerp(-0.75, up, fly), inUp, fall);
      const z = lerp(lerp(0.36, ahead, fly), inAhead, fall);
      place(j, true, onScreen(j, [-x, y, z], _far), air, eyes);
      place(j, false, onScreen(j, [x, y - 0.04, z], _far), air, eyes);
      // (the knuckles over as they come down)
      lineTo(fistLine.L, sided(LINE.punch, true), fall); lineTo(fistLine.R, LINE.punch, fall);
    } else {
      between(j, _mid);
      // (drawn back low by the hips to spring; in the air the lead fist reaching ahead at the shoulders' height and the
      // rear one cocked back by the ear, to come down on it; down ahead at the chest's height to land)
      const fly = Math.max(launch, tuck);
      const lead = lerp(lerp(-0.32, 0.02, fly), -0.1, fall), leadZ = lerp(lerp(0.05, 0.55, fly), 0.5, fall);
      const rear = lerp(lerp(-0.32, 0.12, fly), -0.06, fall), rearZ = lerp(lerp(-0.05, -0.02, fly), 0.42, fall);
      place(j, true, _far.set(_mid.x + 0.16, _mid.y + lead, _mid.z + leadZ), air);
      place(j, false, _far.set(_mid.x - 0.2, _mid.y + rear, _mid.z + rearZ), air);
    }
  }
  return eyes ? 0 : air;
}

/**
 * Bloodrush at `run` of its dash (0..1, the charge's legs under it: models/warrior.ts `chargeLegs`): low and shoulder
 * first, the lead forearm up across the face as a ram, the rear fist driven back by the hip, the head down behind them.
 */
export function fistRush(j: Joints, run: number, eyes: boolean): void {
  if (run <= 0) return;
  if (!eyes) {
    // (the lead shoulder turned square into the way, the trunk dropped over it and the chin tucked behind it)
    j.chest.rotation.y += -0.6 * run; j.spine.rotation.x += 0.38 * run; j.neck.rotation.y += 0.5 * run;
    j.neck.rotation.x += 0.12 * run; j.body.position.y += -0.06 * run;
    // (the whole body pitched into the dash over the feet driving it, not upright on them: with the spine's bend alone
    // he ran upright with a walking stride, an adversarial review)
    j.body.rotation.x += 0.22 * run;
  }
  if (eyes) {
    place(j, true, onScreen(j, [-0.12, -0.35, 0.36], _far), run, eyes);
    place(j, false, onScreen(j, [0.5, -0.9, 0.4], _far), run, eyes);
  } else {
    between(j, _mid);
    place(j, true, _far.set(_mid.x + 0.04, _mid.y - 0.04, _mid.z + 0.2), run);
    place(j, false, _far.set(_mid.x - 0.24, _mid.y - 0.42, _mid.z - 0.1), run);
  }
  lineTo(fistLine.L, [0, 1, 0], run);
}

/** Wrath's shares of its cast: it lands at 0.65 (its `fireAt`) */
const WRATH_LANDS = 0.65;
const HOOK_OUT: Keys = [[0, 0], [0.4, -0.25], [0.58, 0.9], [WRATH_LANDS, 1], [0.8, 0.9], [1, 0.6]];
const SLAM_UP: Keys = [[0, 0], [0.45, 1], [0.52, 1], [WRATH_LANDS, 0], [1, 0]];
const SLAM_DOWN: Keys = [[0, 0], [0.5, 0], [WRATH_LANDS, 1], [1, 1]];

/** Wrath's slam through the eyes, raised: where each fist goes on the screen (across, up, metres ahead), up past the
 *  view's top corners as arms raised overhead go up beside the head, the middle clear (held at the eyes' height, at
 *  arm's length, it read as reaching out, not raised; raised up the middle, the sleeves filled two thirds of the view,
 *  an adversarial review) */
const WRATH_EYES = tunable('wrathEyes', { raised: [0.8, 1.05, 0.3] });

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
    // (raised at arm's length to the eyes' height, then down through the view to the floor before him)
    const [across, high, near] = WRATH_EYES.raised;
    const y = lerp(lerp(-0.4, high, up), -0.75, down), ahead = lerp(lerp(0.64, near, up), 0.68, down);
    const x = lerp(lerp(0.11, across, up), 0.11, down);
    place(j, true, onScreen(j, [-x, y, ahead], _far), w, eyes);
    place(j, false, onScreen(j, [x, y, ahead], _far), w, eyes);
  } else {
    between(j, _mid);
    const y = lerp(lerp(0, 0.5, up), -0.8 * deep, down), z = lerp(lerp(0.25, 0.15, up), 0.5, down);
    place(j, true, _far.set(_mid.x + 0.08, _mid.y + y, _mid.z + z), w);
    place(j, false, _far.set(_mid.x - 0.08, _mid.y + y, _mid.z + z), w);
  }
  lineTo(fistLine.L, sided(LINE.punch, true), w); lineTo(fistLine.R, LINE.punch, w);
  return form === 2 ? 1 : 0.6;
}
