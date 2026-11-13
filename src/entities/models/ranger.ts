// A woodland archer in a fitted green trailcoat, leather bracers and boots, with a recurved bow (models/bow.ts). His shot
// is an archer's, every joint within a body's ranges (armIK.ts): the string taken with the bow brought in before the
// chest, then the bow up and the string back, side-on to the target with his head turned to it, the bow arm straight
// along the arrow's line and the string drawn to an anchor at the side of his jaw, the draw elbow round behind his head,
// so his draw length is what his own arms reach. Loosed, the draw hand follows through out from the neck and the bow
// tips forward in the loose fist; then the hand takes the next arrow from the quiver over his right shoulder and nocks
// it. Between shots he carries the bow in his fist at his side, an arrow nocked, his draw hand free; a fan of arrows is
// shot with the bow laid over flat, the arrows lying across its top.
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { leather, oiled, wool as woolMaps, felt as feltMaps, wood, bowWood as bowWoodMaps, pbrMaterialMaps } from '../../core/textures';
import { buildHumanoid, joint, part, resetPose, walkCycle, idle, deathFall, groundFeet, disposeGeometries, updateJoints } from './rig';
import { Sculpt, stripRig, limb, lathe } from './shapes';
import { belt, buckle, strap, plate, edgeTube, taperTube, stitches, Skirt, SkirtLimbs, armOffThigh, lod, type JointPoint } from './armor';
import { onTunic, tunicFront, tunicBack, tunicCutSteps, armholeEdge, SetInShoulders, ARMHOLE, WAIST, type ArmBlend } from './tunic';
import { headSteps, HERO_HEADS, buildNeck, toGroup, handSkin, HEAD_MM, showHair, type Head } from './head';
import { EYE } from './face';
import { buildHand, hold, fistReach, fistTurn, SLANT, type Hand } from './hands';
import { LegIK } from './ik';
import { fitArm, solveArm } from './armIK';
import { bodyShape } from './anatomy';
import { buildFlask, drink, holdFlask } from './flask';
import { buildBoot } from './boot';
import { Bow, pullAt, arrowGeometry, arrowPieces, fanHold, ARROW, FAN_PITCH, REST_Y, GRIP, GRIP_R } from './bow';
import { fromEyes, dirFromEyes, toEyes } from '../viewModel';
import { angleDamp, clamp, damp, lerp, smooth, TAU } from '../../util';
import type { AnimState, Model } from '../../types';
import { built, type ModelSteps } from './steps';
import { Dye } from './dye';
import { ItemGlows, drawnIn } from './itemGlow';

/** the broadhead's middle, back from the arrow's point (m) */
const HEAD_MIDDLE = 0.035;

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** the felt hat (the face's mm, from his reference sheet): the band's foot and top over the eyes, the crown's top over
 *  them, how far the crown stands off the skull at the band (the hair under it), the brim's width and how far its edge is
 *  turned down, each at the front, the sides and the back, and the leather's thickness */
const HAT = { band: [30, 57], top: 155, gap: 20, brim: [60, 46, 40], droop: [14, 6, 6], thick: 5 };
/** the coat's belt on the spine (m): belted high, at the lower ribs */
const BELT_Y = 0.12;
/** how much higher the collar stands at the back than in front (m) */
const COLLAR_RISE = 0.02;
/** how much looser the collar is than it was cut round the neck (m): the neck swings 8 mm aside in it as he looks to a
 *  side (the rig turns it about joints in front of its middle), and came 3.6 mm out through it */
const COLLAR_EASE = 0.006;
const UP = V(0, 1, 0), FWD = V(0, 0, 1);
const DRINK = { wrist: V(-0.07, -0.16, 0.14), tipped: V(-0.08, 0.08, 0.19), pole: V(-0.35, -1, 0.5), tippedPole: V(-0.6, -0.4, 1) };
/** where the nock comes to at full draw (the head's mm): at the side of the jaw, low along it, below and in front of the ear, the string
 *  a finger's width off the face, so the arrow and its fletching lie beside the cheek and the beard (on the jaw's skin, the
 *  arrow's last 9 cm went through them), and the string's lower half passes in front of the coat over the bow shoulder
 *  (1.2 cm nearer the face, it ran 6 to 8 cm through it at every full draw). (Under the corner of the mouth no arm could
 *  reach it as an archer's does: the only one within a body's ranges folded forward across the chest, and reaching it
 *  with the elbow behind put the hand through the head; 4.5 cm higher, at the jaw's corner, the draw shoulder lay 22 cm
 *  under the arrow's line and the upper arm climbed 47 degrees to an elbow over the head, a pose with no pull in it; that
 *  low, 2 cm nearer the face, the string's lower half ran 4 cm into the coat at every full draw) */
const ANCHOR = toGroup(-112, -35, 10);
/** how far round the body turns side-on to the target (rad), the share of it the hips take standing, and moving */
const SIDE = 1.35, HIP_SIDE = 0.68, HIP_SIDE_MOVING = 0.2;
/** when the draw hand sets off for the string and when it has it, of the body's way onto the shot (as the bow comes in
 *  before the chest: sooner, it reached across for the bow still at the hip) */
const TAKE = [0.25, 0.72];
/** of the body's way onto the shot, when the bow has come in from the side */
const BOW_IN = 0.7;
/** how far the chest is open from side-on as the draw starts (rad), closing as the string comes back; and how fast it may
 *  open or close at most (1/s) */
const OPEN = 0.5, CLOSE_V = 8;
/** the bow's cant at full draw (rad: its top tipped over to the right): a little to the left, its string's lower half
 *  swung out off the chest and its upper half kept off the face (tipped right, the lower half came back into the coat at
 *  the bow shoulder; further left, the upper half met the cheek); a fan is shot with it laid flat, its top to the left
 *  (the forearm turned palm down: tipped to the right it turned palm up, past its range) */
const CANT = -0.06, FLAT = -Math.PI / 2;
/** how far out from the face the fan's anchor is (m): its string lies across the face, its near half in front of the jaw
 *  and the beard (1.5 cm out, it went 5 cm into them) */
const FAN_OUT = 0.04;
/** carried in a neutral carry: the arm hanging straight down (out from the side `CARRY_RAISE`, the elbow bent `CARRY_BEND`),
 *  the bow level in the fist, its top limb forward (`CARRY_TOP`, the hero's frame), the grip square to the forearm as a
 *  hanging fist holds it, and the nocked arrow pointing down at the ground beside the foot, a little out and forward
 *  (`CARRY_ARROW`): the string inside the forearm, so the bow arm's elbow is on the side of the bow it's on at the shot.
 *  Its frame is the standing one; it swings with the forearm from `CARRY_REST`, how far that hangs forward at rest, by
 *  `CARRY_FOLLOW` of its swing, the wrist keeping it near level as the arm swings in a walk (all of it: upright at each step). (Held
 *  upright beside the leg with the elbow bent, the arm tired as a real one would; with the string outside the forearm, the
 *  elbow crossed the bow's plane on its way to the shot and the forearm went through the string, 12 cm into the bracer on
 *  three frames of every draw; and held out from the side with the arrow sticking out sideways it looked nothing like a
 *  carry) */
const CARRY_ARROW = V(0.36, -0.9, 0.25).normalize(), CARRY_TOP = V(0, 0, 1), CARRY_REST = 0.22, CARRY_FOLLOW = 0.35, CARRY_RAISE = 0.12, CARRY_BEND = 0.08;
/** how far out to the side the bow swings between the carry and the shot (m), and how far it turns about its length on the way (rad) */
const CARRY_SWING = 0.16, CARRY_SWING_TURN = 0.5;
/** the share of the draw, from when the hand has the string, over which the bow comes up onto the line (so a tap's is on it) */
const RAISE = 0.35;
/** after the release (0..1 of what follows it): the follow-through ends (a quick recoil), the next arrow is nocked; the
 *  hand's way between (to the quiver, the arrow drawn out of it and over the shoulder) is timed by its length, so it
 *  goes at an even pace; and when it takes the arrow and lays it on the string, by that */
const FOLLOW = 0.12, NOCKED = 0.92;
/** the bow arm's reach at full draw, of its length: nearly straight (a locked elbow is no archer's) */
const REACH = 0.99;
/** where the draw elbow would rather be: in line behind the hand along the arrow, this far above it (m), so in front of
 *  the shoulder as the draw starts and round behind, level with the arrow and the forearm along it, at full draw, as an
 *  archer's is (never above the nose: the forearm and upper arm folded flat behind the line pull along it; the solver keeps
 *  it within a body's ranges and out of the head, armIK.ts). (Sent one way, out and up, the elbow stood straight up over
 *  the shoulder while the string was still out in front, and the forearm hung down from it through the head) */
const ELBOW_UP = -0.08;
/** the draw shoulder at full draw (the girdle's raise and forward turn, degrees, anatomy.ts `GIRDLE`): raised towards the
 *  arrow's line and drawn back, the shoulder blade set as an archer's back sets it (at rest, the shoulder lay so far under
 *  the line that no elbow in line with it was level); and how fast it goes back after the loose (1/s: let go at once, the
 *  elbow jumped 38 cm in a frame as the follow-through ended) */
const DRAW_GIRDLE: [number, number] = [35, -25], GIRDLE_BACK = 6;
/** how much the draw arm's elbow keeps to where it's sent (armIK.ts `keep`: degrees of the ranges; under the 1 a cm it
 *  costs to move it, it stayed where it was until that went out of range, then jumped round) */
const DRAW_KEEP = 150;
/** how quickly the draw arm stops pumping at a run as its hand takes up a task, and starts again after (1/s) */
const DRAW_PUMP_RATE = 12;
/** an arrow is put back once the draw arm pumps less than this (started with the hand up before the chest, the elbow
 *  swung up and out level with it for six frames) */
const STOW_PUMP = 0.05;
/** how far the hand hooked on the string is rolled about the arrow at full draw, and how far it may rock about the string,
 *  across its knuckles, for its wrist (rad; with `DRAW_WRIST`: held as posed, the wrist bent 25 degrees in at full draw,
 *  where an archer's lies flat behind the hand):
 *  in line behind the arrow at its height, the elbow needs 57 degrees (rolled up to 34, every elbow in line left the
 *  forearm's turn 6 to 10 degrees past its end) */
const HOOK_TILT = -1, HOOK_ROLL = 0.4;
/** the roll's room fades from all of it to none between these shares of the hand's way onto the string: all or nothing
 *  at half way, the hand's turn and the elbow with it jumped as the hand left the string for the quiver (the elbow
 *  14 cm in a frame, `lab hall`) */
const ROLL_FADE = [0.5, 0.8];
/** what each degree of the draw wrist's bend costs, once the draw has begun (armIK's `wristW`; a misplaced bracket
 *  there counted it as 1, whatever it was set to, and the draw was tuned so) */
const DRAW_WRIST = 1;
/** how late in the draw the hand rolls on the string (the power of the draw's share it rolls by: rolled as the string
 *  came back, the forearm was at its turn's end mid-draw and the shoulder rose past its range to keep the elbow in line) */
const TILT_POW = 3;
/** how fast the draw elbow may move as the string is drawn (the rig's units a second): round into the anchor it swings,
 *  not jumps (only then: the reload is quicker) */
const ELBOW_V = 3;
/** and to the quiver and back, for an arrow and to put one back, and on the way from the loose to the next arrow (each
 *  past it as far as the ranges need: the solver's `maxMove`): free, as the hand swung up over the shoulder its elbow
 *  whipped round 23 cm in a frame, and at a walking shot's follow-through it flipped round its circle for a frame, 42 cm */
const FETCH_V = 8, RELOAD_V = 6;
/** how fast the bow arm comes back in at its shoulder once the string is clear of the thigh (rad a second) */
const OFF_THIGH_BACK = 2;
/** and how fast that speed may change (the rig's units a second, a second: 5 cm a frame, a frame, at 60): capped by
 *  its speed alone, the elbow swung round its circle at the cap, turning its way by up to 17 cm a frame, or stopped
 *  dead from it (`lab hall`). No more: at 230 and 290 it went past its ranges' slack mid-swing and was thrown on, 16 cm
 *  a frame; at this it lags the hand going over the shoulder by a frame, the forearm upright beside the head */
const ELBOW_ACC = 180;
/** where the draw elbow goes with the string taken before the chest (the chest's frame): out to the right, a little up
 *  and forward */
const SET_POLE = V(-1, 0.15, 0.2).normalize();
/** how far in front of the chest the draw hand's way to the string bows out, at its middle (m) */
const BOW_OUT = 0.22;
/** where the next arrow is nocked (the chest's frame): before the chest, a little left of its middle, out far enough that
 *  the string behind the bow stays in front of the coat */
const NOCK_AT = V(0.06, 0.28, 0.42);
/** the bow there: its arrow tipped down (rad) and its top canted over to the right (rad), so its limbs keep off the body
 *  (tipped further down, the top limb leant back into the chest; canted 0.85, side-on to the shot as the body is, the
 *  lower limb and the string swung back through the coat's left side at every shot, half the frames of a run of taps) */
const SET_TIP = [0.25, 0.1];
/** where the hand draws the next arrow out of the quiver to (the chest's frame, from the shoulder at rest): up and forward
 *  over the right shoulder, the arm near its full stretch, as far from the quiver's mouth as it reaches, before it comes
 *  down to the string (an arrow as long as the draw is most of a metre deep in the quiver: drawn out to just above the
 *  shoulder, it came forward through the shoulder and the neck) */
const PULL = V(-0.04, 0.4, 0.3);
/** on its way there, where the hand draws the arrow up out of the quiver first (the chest's frame, from the shoulder at
 *  rest): above the shoulder and out beside the head (brought forward at once, the arrow between the hand and the quiver's
 *  mouth cut through the shoulder; behind the shoulder, the arm rose in a plane 57 degrees behind the body, past its range) */
const RISE = V(-0.13, 0.4, -0.02);
/** where the hand passes from hanging at the side on its way up to the quiver (the chest's frame, from the shoulder at
 *  rest): out to the side and forward at the chest's height, the elbow coming up (straight up from the hip to over the
 *  shoulder, the elbow folded shut and the forearm went through the chest) */
const SIDE_UP = V(-0.24, -0.08, 0.16);
/** the quiver (along its axis, from its joint): where the hand takes an arrow by its nock, and its mouth */
const QUIVER_NOCK = 0.42, QUIVER_MOUTH = 0.16;
/** how long putting the arrow back in the quiver takes (s); and the share of a fetch at which the arrow is on the string */
const STOW = 1.5, FETCHED = 0.92;
/** how far out to the right the arrow in the hand swings as it turns over the top, from pointing into the quiver (a share
 *  of a turn's direction) */
const TURN_OUT = 0.6;
/** of putting it back, the share over which the bow comes up before the chest first, the hand waiting (setting off at once,
 *  it reached for the bow wherever it was, behind the back after a swing or another skill's pose) */
const STOW_UP = 0.2;
/** how far along its way the hand is, `k` of the way through putting the arrow back */
const stowWay = (k: number): number => smooth(clamp((k - STOW_UP) / (1 - STOW_UP), 0, 1));
/** where the hand passes over the right shoulder on its way back to the quiver (the chest's frame, from the shoulder at rest):
 *  out past the hat's brim (by the shoulder, it went through the brim's back) */
const LIFT = V(-0.07, 0.22, -0.04);
/** how long the body takes to come round onto a shot and back off it (s) */
const AIM_IN = 0.3, AIM_OUT = 0.5;
/** how far the arrow's line may lie off the way the body faces (rad: the shot from the bow beside the body closing on a near
 *  target); a new target turns the body, and the line with it */
const YAW_OFF = 0.15;
/** how fast the bow fist's turn about the grip and its slant on it follow what the arm finds best (1/s: the solver's
 *  `glide`): chosen afresh each frame from a few, they stepped between them, and the bow carried in the fist jumped
 *  between two or three places as the walk moved the elbow */
const GLIDE = 10;
/** how far the bow fist may slant on the grip the way that lifts the back of the fist (rad; `SLANT` the other way): up to
 *  `SLANT` there, looking down through the eyes as Hailfletch's volleys were drawn, the fist rose 2 cm into the arrow over
 *  the shelf from 0.27 */
const BOW_SLANT = 0.2;
/** first person (the eyes' frame, viewModel.ts: x right, y up, -z ahead, m). At full draw the bow's grip is held still
 *  below the crosshair, a little left, and the arrow lies along the shot's own line from it, so it points where the shot
 *  will fly (anchored in the view, under its lower right, the arrow ran across the view 35 degrees left of the shot and
 *  the hand filled a third of its middle); the bow's top tipped to the left (`FP_CANT`, rad), so its upper limb passes
 *  clear of the middle. A fan's flat bow is held a little to the right (`FP_FAN`), so its arrows, side by side up the bow
 *  from the rest (to the left of the grip), lie along the line under the eyes. The line is low enough that the nock, and
 *  the draw hand on it, stay below the frame from nocking to the loose, as
 *  an archer never sees his draw hand (half in view at the nock, it popped in from below and out past the camera at every
 *  shot, a jerk between two places). In for the next arrow the bow dips a little (`FP_SET` from the grip's place, its
 *  arrow tipped `FP_SET_TIP` down). Between shots the bow is carried low on the left, nearly upright, the fist round its
 *  grip in view and its arrow pointing ahead (`FP_REST`: its grip off the view's edge and laid across it, it read as a
 *  stick). The hand's way for the next arrow goes down out of the view and back up (the quiver is behind the eyes:
 *  reaching for it, the arm swept across the view) */
const FP_GRIP = V(-0.06, -0.28, -0.62), FP_CANT = -0.45, FP_FAN = V(0.02, -0.28, -0.62);
const FP_SET = V(0, -0.02, 0.02), FP_SET_TIP = 0.06;
const FP_REST = V(-0.29, -0.27, -0.55), FP_REST_DIR = V(0.1, -0.2, -1), FP_REST_CANT = 0.12;
const FP_LOW = V(0.22, -0.5, 0), FP_UP = V(0.12, -0.38, -0.25), EYE_UP = V(0, 1, 0);
/** how far above the view's axis the arrow on the string may point through the eyes, least and most (rad): looking down
 *  at the floor or up at the sky the shot still goes level, at chest height, and along it the bow tipped over and the
 *  arrow lay across the view; pointing below the axis, its nock rose to the eyes and the hand drawing it passed just
 *  before them, filling the view's lower left (looking level it's 0.11; Hailfletch's volleys are drawn 20 degrees up) */
const FP_PITCH = [0.08, 0.4];
/** a volley lofted high (Hailfletch) aims up through the eyes: the whole bow pose tipped up about them by this much (rad)
 *  as its angle comes in (at its own 26 degrees, held under the view's limit, it read as a shot straight ahead; the grip
 *  raised and moved left in the view instead, the forearm turned half its range off the fist's and the wrist bent 60
 *  degrees back, and the hand looked broken) */
const FP_LOB = 0.4;
/** how fast that comes and goes (1/s: following the volley's angle, the bow dropped 50 px in a frame as the channel ended) */
const FP_LOB_EASE = 8;
/** how fast a cut-off shot's angle eases back level (1/s) */
const PITCH_BACK = 10;
/** through the eyes, what each degree of the bow wrist's bend costs its elbow (armIK's `wristW`): turned as posed whatever
 *  its ranges, the fist took whatever bend the elbow left it, 45 to 66 degrees back, and the hand looked broken off */
const FP_WRIST = 1;
/** through the eyes, how far the bow sways with the stride at a run (m across and up the view, rad about it): across once a
 *  stride, up and down with each step, rolling with it; eased in and out with the pace (`FP_SWAY_EASE`, 1/s), and a
 *  `FP_SWAY_DRAWN` share of it while it's drawn (held still in the view as he walked, it read as stuck to it) */
const FP_SWAY = [0.007, 0.005, 0.025], FP_SWAY_EASE = 5, FP_SWAY_DRAWN = 0.3;
/** how long the last shot's arrows stay on the string after it ends (s), and how fast the bow is laid out for a fan or
 *  back through the eyes (1/s) */
const KEEP_SHOT = 0.15, FAN_EASE = 12;
/** how long a drawn string takes to be let down when the shot ends without its loose (s), setting off and arriving at rest
 *  (eased off exponentially, the arrow on it turned from coming back 4 px a frame to going forward 21) */
const LET_DOWN = 0.35;
/** how far the string has come back (0..1) after `k` of the draw from when the hand has it: setting off gently and
 *  slowing into the anchor (the bow's own `pullAt`, quick at first, brought half the string back in a few frames) */
const drawnAt = (k: number): number => (pullAt(k) + smooth(clamp(k, 0, 1))) / 2;

/** the coat's share of the arm round each armhole (`ArmBlend`; less above `topY`, under the baldric) */
const ARM_K: ArmBlend = { seam: 0.5, reach: 0.09, top: 0.05, topY: 0.235, join: 0.1, joinIn: 0.05, around: 96, bulk: 0.35 };

/**
 * `share` of the turn `q` from rest into `out`, taken the way round that is nearer `middle` (the middle of the turns
 * it takes). Taken the shorter way (a slerp from rest), a turn near half round went one way and then the other as it
 * crossed it, and the joints blended through it jumped between two places: the bow hand is turned 90 to 180 degrees
 * on its forearm (through the eyes 140 to 180, and past it), and its cuff flickered between two shapes with the hand still (#161).
 * Measured from the middle, the way round flips only half a turn from it, where the hand never goes.
 */
function blendTurn(out: THREE.Quaternion, q: THREE.Quaternion, share: number, middle: THREE.Quaternion): THREE.Quaternion {
  // (q and -q are one turn, each the other way round: the one nearer the middle)
  const sign = q.dot(middle) < 0 ? -1 : 1;
  const w = THREE.MathUtils.clamp(q.w * sign, -1, 1), half = Math.acos(w), s = Math.sin(half);
  if (s < 1e-6) return out.identity();
  const k = Math.sin(half * share) / s * sign;
  return out.set(q.x * k, q.y * k, q.z * k, Math.cos(half * share));
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const _u = new THREE.Vector3(), _left = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _x = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _s = new THREE.Vector3();
const _ra = new THREE.Vector3(), _gq = new THREE.Quaternion(), _rx = new THREE.Vector3(), _qt = new THREE.Quaternion();
/** the right hand's turn on its forearm as it hangs (the forearm turned neither over nor back: the thumb up) */
const HANG_R = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);

/** a pose of the bow in the world: its grip's pivot and its frame */
interface BowPose { p: THREE.Vector3; q: THREE.Quaternion }
const pose = (): BowPose => ({ p: new THREE.Vector3(), q: new THREE.Quaternion() });
/** the bow's frame with its back along `z` and its limbs `up`, canted `cant` over to the right */
function frame(z: THREE.Vector3, cant: number, out: THREE.Quaternion, up = UP): THREE.Quaternion {
  _left.crossVectors(up, z).normalize();
  _y.crossVectors(z, _left).normalize().multiplyScalar(Math.cos(cant)).addScaledVector(_left, -Math.sin(cant)).normalize();
  _x.crossVectors(_y, z).normalize();
  return out.setFromRotationMatrix(_m.makeBasis(_x, _y, _z.copy(z)));
}

/** the draw hand's fingers: index, middle and ring hooked round the string at their last joints, the little finger and the
 *  thumb tucked under (`k` 1), or relaxed open (0); `pinch` closes the thumb on the index, holding an arrow by its nock */
/** a tube round the forearm joint's bone (along -y, its space), flattened: rings of [y, half across, half through] from
 *  the bottom up (the wrist wider across the back of the hand than through it, as the forearm is towards it) */
function ovalTube(rings: [number, number, number][], segs: number): THREE.BufferGeometry {
  const g = lathe(rings.map(([y, rx]) => [rx, y] as [number, number]), segs), p = g.attributes.position;
  if (!p) return g;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i); let k = 0;
    while (k < rings.length - 2 && y > rings[k + 1][0]) k++;
    const [y0, x0, z0] = rings[k], [y1, x1, z1] = rings[k + 1], t = clamp((y - y0) / (y1 - y0), 0, 1);
    p.setZ(i, p.getZ(i) * (z0 + (z1 - z0) * t) / (x0 + (x1 - x0) * t));
  }
  g.computeVertexNormals();
  return g;
}

function hook(h: Hand, k: number, pinch: number): void {
  h.vis.position.set(0, 0, 0); h.vis.quaternion.identity();
  const s = h.s;
  h.f.forEach((f, i) => {
    const tuck = i === 3 ? 1 : 0, p = i === 0 ? pinch : 0;
    f.j[0].rotation.set(lerp(0.25, lerp(0.22, 1.2, tuck), k) + p * 0.35, 0, s * (i - 1.5) * 0.04);
    f.j[1].rotation.set(lerp(0.35, lerp(1.3, 1.4, tuck), k) + p * 0.3, 0, 0);
    f.j[2].rotation.set(lerp(0.25, lerp(0.6, 0.9, tuck), k), 0, 0);
  });
  h.thumb.j[0].rotation.set(lerp(0.35, 0.7, k) + pinch * 0.2, s * lerp(0.35, 0.75, Math.max(k, pinch)), -s * lerp(0.6, 0.25, k));
  h.thumb.j[1].rotation.set(lerp(0.2, 0.45, k), 0, 0);
  h.thumb.j[2].rotation.set(lerp(0.2, 0.4, k), 0, 0);
}

/** a point on a Catmull-Rom curve through `pts` reached at the times `ts` (0..1, rising), at `t` */
/** the times (0..`end`) at the points of a way through `pts`, by its length: an even pace */
function lengthTimes(pts: THREE.Vector3[], end: number): number[] {
  const ts = [0]; let total = 0;
  for (let i = 1; i < pts.length; i++) ts.push(total += pts[i].distanceTo(pts[i - 1]));
  return ts.map((x) => x / (total || 1) * end);
}

/** the direction `t` of the way round from `a` to `b` (unit vectors), into `out` */
const _sq = new THREE.Quaternion(), _sq2 = new THREE.Quaternion();
function slerpDir(a: THREE.Vector3, b: THREE.Vector3, t: number, out: THREE.Vector3): THREE.Vector3 {
  _sq.setFromUnitVectors(a, b); _sq2.identity().slerp(_sq, t);
  return out.copy(a).applyQuaternion(_sq2);
}

const _m0 = new THREE.Vector3(), _m1 = new THREE.Vector3();
function through(pts: THREE.Vector3[], ts: number[], t: number, out: THREE.Vector3): THREE.Vector3 {
  let i = 0;
  while (i < ts.length - 2 && t > ts[i + 1]) i++;
  // (each point's tangent in time, from its neighbours and their times: with one curve per segment however long it takes,
  // the speed jumped at every point by the ratio of the times either side, and the elbow with it)
  const h = Math.max(1e-6, ts[i + 1] - ts[i]), f = clamp((t - ts[i]) / h, 0, 1);
  const tangent = (k: number, o: THREE.Vector3) => { const a = Math.max(0, k - 1), b = Math.min(pts.length - 1, k + 1); return o.subVectors(pts[b], pts[a]).multiplyScalar(h / Math.max(1e-6, ts[b] - ts[a])); };
  tangent(i, _m0); tangent(i + 1, _m1);
  const f2 = f * f, f3 = f2 * f;
  return out.copy(pts[i]).multiplyScalar(2 * f3 - 3 * f2 + 1).addScaledVector(_m0, f3 - 2 * f2 + f)
    .addScaledVector(pts[i + 1], -2 * f3 + 3 * f2).addScaledVector(_m1, f3 - f2);
}

/** The felt hat on `cap` (the head group's frame): a crown rising from a leather band round the head, its sides near
 *  upright and its top a dome, and a wide leather brim turned down to a stitched edge. The hair stays on under it and shows
 *  below the band, as short hair does. */
function buildHat(head: Head, cap: THREE.Object3D, felt: THREE.Material, leather: THREE.Material, edge: THREE.Material): void {
  const N = 48, yB = toGroup(0, EYE.y + HAT.band[0], 0).y, mm = HEAD_MM;
  // the skull's section at the band's foot (each way round, the ray's elevation that meets it found by bisection)
  let x0 = 1, x1 = -1, z0 = 1, z1 = -1;
  for (let i = 0; i < N; i++) {
    let lo = -0.5, hi = 1.4;
    for (let k = 0; k < 20; k++) { const m = (lo + hi) / 2; if (head.surface(i / N * TAU, m).y < yB) lo = m; else hi = m; }
    const q = head.surface(i / N * TAU, lo);
    x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z);
  }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, A = (x1 - x0) / 2 + HAT.gap * mm, B = (z1 - z0) / 2 + HAT.gap * mm, H = (HAT.top - HAT.band[0]) * mm;
  /** round the crown's foot towards `a` (0 the front, +x the left), `k` its share of the way out (a superellipse, squarer
   *  than an ellipse, as a felt crown is) */
  const foot = (a: number, k: number, out: THREE.Vector3) => { const s = Math.sin(a), c = Math.cos(a); return out.set(cx + Math.sign(s) * Math.abs(s) ** 0.85 * A * k, yB, cz + Math.sign(c) * Math.abs(c) ** 0.85 * B * k); };
  // (a superellipse's quarter up the crown: its sides rise near upright from the band, its top a full dome)
  const crown = (u: number, v: number, out: THREE.Vector3) => { const f = v * Math.PI / 2; foot(u * TAU + Math.PI, Math.cos(f) ** (2 / 2.6), out); out.y = yB + H * Math.sin(f) ** (2 / 2.6); return out; };
  const inside = new THREE.Vector3(cx, yB + H * 0.4, cz);
  part(plate(crown, N, 14, 0, undefined, inside), felt, cap);
  const band = (u: number, v: number, out: THREE.Vector3) => { foot(u * TAU + Math.PI, 1.03, out); out.y = yB + v * (HAT.band[1] - HAT.band[0]) * mm; return out; };
  part(plate(band, N, 2, 0.003, undefined, inside), leather, cap);
  // the brim: out from the band's foot, widest in front, turned down most at the back (the ends blended through the sides)
  const by3 = (v3: number[], a: number) => { const c = Math.cos(a); return c >= 0 ? lerp(v3[1], v3[0], c) : lerp(v3[1], v3[2], -c); };
  const _f = new THREE.Vector3();
  const brim = (u: number, v: number, out: THREE.Vector3) => {
    // (u from the back: its seam behind)
    const a = u * TAU + Math.PI; foot(a, 1.02, out); _f.set(out.x - cx, 0, out.z - cz).normalize();
    out.addScaledVector(_f, by3(HAT.brim, a) * mm * v); out.y = yB - by3(HAT.droop, a) * mm * v ** 1.6; return out;
  };
  part(plate(brim, N, 5, HAT.thick * mm, undefined, new THREE.Vector3(cx, yB + 0.2, cz)), leather, cap);
  part(edgeTube(brim, 'v1', 2.6 * mm, N), edge, cap);
}

export const buildRanger = (): Model => built(rangerSteps());

/** buildRanger's pieces one at a time (`ModelSteps`): built behind the lobby, a piece a frame. */
export function* rangerSteps(): ModelSteps {
  const kit = createKit(0xc9d993);
  yield;
  // (the colours his reference sheet's, measured in a studio render against it)
  const coat = kit.rim({ color: 0x5a654c, roughness: 1, ...pbrMaterialMaps(woolMaps(), 1) }, 0x71835a, 0.25);
  yield;
  // (the coat's hem turned up inside it, a shade darker)
  const coatHem = kit.rim({ color: 0x4c5641, roughness: 1, ...pbrMaterialMaps(woolMaps(), 1) }, 0x71835a, 0.25);
  const felt = kit.rim({ color: 0x4a5a40, roughness: 1, ...pbrMaterialMaps(feltMaps(), 1) }, 0x71835a, 0.2);
  const wool = kit.std({ color: 0x656151, roughness: 1, ...pbrMaterialMaps(woolMaps(), 1) });
  const dark = kit.std({ color: 0x292d24, roughness: 1, ...pbrMaterialMaps(woolMaps(), 1) });
  yield;
  // (the coat's seams sewn in a lighter thread, as the sheet's are)
  const thread = kit.std({ color: 0x9a8a5c, roughness: 0.9 });
  const hide = kit.std({ color: 0x936848, roughness: 1, ...pbrMaterialMaps(leather(), 1) });
  const boot = kit.std({ color: 0x93684a, roughness: 1, ...pbrMaterialMaps(oiled(), 1) });
  const strapLeather = kit.std({ color: 0x6e4a33, roughness: 1, ...pbrMaterialMaps(oiled(), 2) });
  const soleLeather = kit.std({ color: 0x2e2219, roughness: 1, ...pbrMaterialMaps(oiled(), 2) });
  const bowWood = kit.std({ color: 0x956f3d, roughness: 0.85, ...pbrMaterialMaps(wood(), 1) });
  yield;
  // the bow: lacquered limbs coloured along them (bow.ts), a walnut riser, polished horn tips, a bright brass for its
  // fittings and a gilt vine inlaid down the limbs, a dark linen serving and silencers of the coat's green wool on the string
  // (a little light at its edges: seen from the archer's side the belly is mostly in its own shadow, and the curve was lost)
  const limbWood = kit.rim({ color: 0xffffff, vertexColors: true, roughness: 1, ...pbrMaterialMaps(bowWoodMaps(), 1, 0.5) }, 0x5a3a22, 0.3);
  const riserWood = kit.std({ color: 0x6a4630, roughness: 1, ...pbrMaterialMaps(bowWoodMaps(), 1, 0.5) });
  const horn = kit.std({ color: 0xd8c9a8, roughness: 0.32 });
  const bowBrass = kit.std({ color: 0xc8a25a, metalness: 1, roughness: 0.38 });
  const inlay = kit.std({ color: 0xe0b866, metalness: 0.55, roughness: 0.32 });
  const serving = kit.std({ color: 0x2c2620, roughness: 0.9 });
  const yarn = kit.std({ color: 0x5c7342, roughness: 1, ...pbrMaterialMaps(woolMaps(), 4) });
  const brass = kit.std({ color: 0xa58a50, metalness: 0.8, roughness: 0.65 });
  const skin = handSkin(kit, 'ranger');
  const cord = kit.std({ color: 0xe0d6bc, roughness: 0.85 });
  yield;
  // (double-sided: the feathers are single sheets)
  const fletched = kit.std({ vertexColors: true, roughness: 0.75, metalness: 0.1, side: THREE.DoubleSide });
  const j = buildHumanoid({ skin: coat }, { chestW: 0.17, chestD: 0.14, shoulderW: 0.2, shoulderY: 0.45, upperR: 0.06, foreR: 0.05, shinL: 0.41 });
  stripRig(j.root);
  const S = new Sculpt();
  yield;
  // the coat cut as the mage's tunic is, over the shoulders as a man's are and meeting the neck at its base (a round barrel of a body ending in a shelf at the shoulders left a long neck standing out of it)
  // (an armhole cut round each shoulder and the sleeve set into it, `tunicCut`, `setInSleeve`, the cloth round the seam
  // blended from the chest to the arm through joints turned a quarter, half and three quarters as far as it, `delts`: the
  // coat round the armhole goes some way up with a raised arm and the sleeve comes out of it. A sleeve's tube stood in a
  // whole coat: raised, it came out of the cloth over the shoulder as a tube stuck into the body, and with the coat over the
  // deltoid blended straight from the chest to the arm, the cloth between folded in on the joint in a lip round it)
  const sets = new SetInShoulders(j, ARM_K, lod(ARM_K.around, 48)), around = sets.around;
  const chainOf = (s: number) => sets.chainOf(s), withArm = (g: THREE.BufferGeometry, s: number) => sets.withArm(g, s);
  yield;
  {
    const [L, R] = yield* tunicCutSteps(around, lod(22, 12));
    yield;
    S.skinChain(withArm(R, -1), coat, j.chest, chainOf(-1));
    yield;
    S.skinChain(withArm(L, 1), coat, j.chest, chainOf(1));
  }
  yield;
  // (a standing collar round the neckline, as the sheet's coat has, open down the front in a short slit closed by two buttons;
  // higher behind, up the back of the neck to under the hair: level, it left a long bare neck from behind)
  const collarUp = (x: number, y: number, z: number) => y + COLLAR_RISE * smooth(clamp((-0.1 - z / (Math.hypot(x, z) || 1)) / 0.65, 0, 1)) * clamp((y - 0.289) / 0.039, 0, 1);
  {
    const g = lathe(([[0.0795, 0.289], [0.0795, 0.31], [0.0785, 0.326], [0.0757, 0.328], [0.0757, 0.3]] as [number, number][]).map(([r, y]) => [r + COLLAR_EASE, y]), 28).scale(1, 1, 0.935).translate(0, 0, -0.0125), q = g.attributes.position;
    for (let i = 0; i < q.count; i++) q.setY(i, collarUp(q.getX(i), q.getY(i), q.getZ(i) + 0.0125));
    g.computeVertexNormals();
    S.add(g, coat, j.chest);
  }
  for (const sx of [1, -1]) S.add(taperTube([0.326, 0.27, 0.235].map((y) => y > 0.3 ? V(sx * 0.005, y, 0.0635 + COLLAR_EASE * 0.935) : tunicFront(sx * 0.005, y, 0.001)), () => 0.0022, 8, 5), dark, j.chest);
  for (const y of [0.29, 0.258]) S.add(new THREE.SphereGeometry(0.0055, 8, 6), brass, j.chest, tunicFront(0, y, 0.003).toArray());
  yield;
  // the seams, stitched in a lighter thread: round the collar's top and foot, down both sides of the slit and on down the
  // front, over each shoulder from the neck to the sleeve, and down each side
  const ring = (rx: number, rz: number, y: number) => Array.from({ length: 32 }, (_, i) => { const a = i / 32 * TAU; return V(Math.sin(a) * rx, collarUp(Math.sin(a), y, Math.cos(a)), Math.cos(a) * rz * 0.935 - 0.0125); });
  const stitched = 0.0812 + COLLAR_EASE;
  S.add(stitches(ring(stitched, stitched, 0.32), 0.004, 0.0028, 0.0009, true), thread, j.chest);
  S.add(stitches(ring(stitched, stitched, 0.295), 0.004, 0.0028, 0.0009, true), thread, j.chest);
  for (const sx of [1, -1]) S.add(stitches([0.318, 0.29, 0.26, 0.24].map((y) => y > 0.3 ? V(sx * 0.011, y, 0.065 + COLLAR_EASE * 0.935) : tunicFront(sx * 0.011, y, 0.0018))), thread, j.chest);
  S.add(stitches([0.234, 0.2, 0.15, 0.1, 0.05, 0, -0.05, -0.1].map((y) => tunicFront(0, y, 0.0015))), thread, j.chest);
  yield;
  for (const sa of [1, -1]) {
    // (moving with the cloth they're sewn into; round the armhole, the sleeve's seam)
    const top = ARMHOLE.y + ARMHOLE.B, pit = ARMHOLE.y - ARMHOLE.B;
    S.skinChain(withArm(stitches([0.294, 0.285, 0.272, 0.262, top].map((y) => onTunic(sa * Math.PI / 2, y, 0.0016))), sa), thread, j.chest, chainOf(sa));
    S.skinChain(withArm(stitches([pit, 0.12, 0.06, 0, -0.06, -0.11].map((y) => onTunic(sa * Math.PI / 2, y, 0.0016))), sa), thread, j.chest, chainOf(sa));
    S.skinChain(withArm(stitches(armholeEdge(sa, 48, 0.0016), 0.004, 0.0028, 0.0009, true), sa), thread, j.chest, chainOf(sa));
    yield;
  }
  yield;
  // (gathered under the belt a little fuller than the mage's tunic)
  {
    // (gathered under the belt in soft folds, and bloused a little over it)
    const g = lathe([[0.148, -0.05], [0.149, 0.0], [0.15, 0.06], [0.151, 0.1], [0.152, 0.14], [0.153, 0.2], [0.155, 0.26]], 48), q = g.attributes.position;
    for (let i = 0; i < q.count; i++) {
      const x = q.getX(i), y = q.getY(i), z = q.getZ(i), a = Math.atan2(x, z);
      const under = clamp((BELT_Y - 0.01 - y) / 0.09, 0, 1) * clamp((y + 0.05) / 0.04, 0, 1), over = Math.exp(-(((y - BELT_Y - 0.035) / 0.025) ** 2));
      const k = 1 + under * (0.035 * Math.sin(a * 14 + 0.6 * Math.sin(a * 3)) + 0.012 * Math.sin(a * 23)) + over * 0.02 * (1 + Math.sin(a * 9));
      q.setXYZ(i, x * k, y, z * k);
    }
    g.computeVertexNormals();
    S.add(g, coat, j.spine, [0, 0, 0], [0, 0, 0], [1.08, 1, 0.9]);
  }
  yield;
  // (hanging straight from the belt to mid-thigh as the sheet's does: flared like a bell, it stood out half as deep again)
  // (slit at the sides, as the sheet's: the hem rising to the slit's top there; the back a little shorter)
  // (from under the belt, falling straight as the sheet's does: hung from the hips it narrowed to a waist under the belt and
  // flared out below it)
  const tunic = new Skirt({ r0: 0.16, r1: 0.25, len: 0.375, depth: 0.68, folds: 13, foldAmp: 0.028, push: 1.25, flare: 0.5, rows: 10, radial: 64, trim: 0.035,
    hem: (a) => -0.12 * Math.max(0, -Math.cos(a)) - 0.4 * Math.exp(-(((Math.abs(Math.sin(a)) - 1) / 0.006) ** 2)) });
  const hem = new THREE.Mesh(tunic.geo, [coat, coatHem]); hem.castShadow = hem.receiveShadow = true; j.hips.add(hem); hem.position.y = 0.06 + BELT_Y - 0.025;
  hem.name = 'tunic hem';
  yield;
  // a broad belt of oiled leather, stitched along both edges, its brass buckle square and its tail through a keeper
  S.add(belt(0.172, 0.146, BELT_Y, 0.05, 0.009, 0, 40), strapLeather, j.spine);
  for (const dy of [-0.021, 0.021]) S.add(stitches(Array.from({ length: 40 }, (_, i) => { const a = i / 40 * TAU; return V(Math.sin(a) * 0.1775, BELT_Y + dy, Math.cos(a) * 0.1515); }), 0.004, 0.003, 0.0009, true), thread, j.spine);
  S.add(buckle(0.05, 0.05, 0.008), brass, j.spine, [0, BELT_Y, 0.16]);
  S.add(new THREE.BoxGeometry(0.012, 0.056, 0.012), strapLeather, j.spine, [0.06, BELT_Y, 0.152], [0, 0.38, 0]);
  yield;
  // the baldric the quiver hangs from: over the right shoulder, across the chest and the back to the left hip, buckled on
  // the chest
  // (its ends under the belt, as the sheet's runs on past it to the hip)
  const run = [0, 0.2, 0.4, 0.6, 0.8, 1], across = (t: number) => lerp(-0.13, 0.155, t), down = (t: number) => lerp(0.24, -0.11, t);
  S.add(strap([...run.map((t) => tunicFront(across(t), down(t), 0.006)), onTunic(Math.PI / 2, -0.115, 0.006), ...[...run].reverse().map((t) => tunicBack(across(t), down(t), 0.006)), V(-0.135, 0.29, -0.012)], 0.048, 0.008, true), strapLeather, j.chest);
  S.add(buckle(0.042, 0.05, 0.007), brass, j.chest, tunicFront(-0.075, 0.18, 0.014).toArray(), [0, 0, -0.85]);
  yield;
  // each wrist's part-turned joints: a quarter, half and three quarters of the hand's turn on the forearm (`bendWrists`)
  /** the middle of each hand's turns on its forearm, about its length (`blendTurn`: the bow hand's -180 to -90 degrees,
   *  past -180 through the eyes, the draw hand's 0 to 185, standing, walking, strafing and shooting, in third person and
   *  through the eyes). A middle is a way round too: given as 225, the bow hand's, the cuff twisted the long way round
   *  its wrist and pinched in under the bracer */
  const wristMiddles = [[j.handL, -135], [j.handR, 135]].map(([hand, deg]) =>
    new THREE.Quaternion().setFromAxisAngle((hand as THREE.Object3D).position.clone().normalize(), (deg as number) * Math.PI / 180));
  const wrists = [j.handL, j.handR].map((h) => [1, 2, 3].map((q) => { const d = joint(h.parent!, ...(h.position.toArray() as [number, number, number])); d.name = (h === j.handL ? 'wristL' : 'wristR') + q; return d; }));
  for (const [sh, el, hand] of [[j.shoulderL, j.elbowL, j.handL], [j.shoulderR, j.elbowR, j.handR]]) {
    // (set into the armhole: from its edge over the deltoid onto the arm, the arm's wholly from a little way down it, and over
    // the elbow onto the forearm)
    const sa = sh === j.shoulderL ? 1 : -1;
    S.skinChain(sets.sleeve(sa, { len: 0.38, r0: 0.06, r1: 0.056, bulge: 0.04, at: 0.24, cap: lod(10, 6), tube: lod(14, 8) }), coat, sh, [...chainOf(sa), el]);
    // (the sleeve on down the forearm into a bracer from the wrist, a brass band round the bracer's top)
    S.add(lathe([[0.052, -0.12], [0.055, -0.04], [0.056, 0]], 14), coat, el);
    // (tapering down the forearm as one does, to the wrist's flattened oval: round and as wide at the wrist as below the
    // elbow, 30 cm round where a wrist is 17, it stood out from the hand as a pipe)
    S.add(ovalTube([[-0.25, 0.04, 0.029], [-0.2, 0.043, 0.035], [-0.16, 0.048, 0.043], [-0.13, 0.055, 0.054], [-0.095, 0.058, 0.058]], 18), hide, el);
    // (and under its end a leather cuff over the wrist onto the heel of the hand, bending with it: the bracer a rigid tube to
    // the wrist and the palm a box from it, a bent wrist swung the palm out of the tube's end, and the hand looked broken
    // off; pinched in under the bracer's end, it read as a doll's joint)
    // (bent through joints turned a quarter, half and three quarters as far as the hand, `wrists`, over 6 cm: blended
    // straight from the forearm to the hand over 3.5, the cuff kinked at the wrist and its inside collapsed)
    const cuff = ovalTube([[-0.3, 0.04, 0.02], [-0.288, 0.04, 0.021], [-0.274, 0.038, 0.023], [-0.258, 0.038, 0.026], [-0.235, 0.039, 0.028]], 18), cp = cuff.attributes.position;
    if (cp) cuff.setAttribute('skinK', new THREE.BufferAttribute(Float32Array.from({ length: cp.count }, (_, i) => smooth(clamp((-cp.getY(i) - (j.P.foreL - 0.03)) / 0.058, 0, 1))), 1));
    S.skinChain(cuff, hide, el, [el, ...wrists[hand === j.handL ? 0 : 1], hand]);
    S.add(belt(0.059, 0.059, -0.1, 0.012, 0.004), brass, el);
    yield;
  }
  for (const [th, kn, an] of [[j.thighL, j.kneeL, j.ankleL], [j.thighR, j.kneeR, j.ankleR]]) {
    // wool trousers, loose (round in section, as deep as wide), into the boots below the knee
    S.add(limb(0.46, 0.088, 0.084, 0.02, 0.28, 12), wool, th);
    S.add(lathe([[0.068, -0.1], [0.076, -0.03], [0.08, 0.02]], 12), wool, kn);
    // tall riding boots to just below the knee (boot.ts)
    buildBoot(S, { leather: boot, sole: soleLeather, strap: strapLeather, metal: brass }, kn, an, th === j.thighL ? 1 : -1);
    yield;
  }
  yield;
  // the shared anatomical head, with his own face (face.ts FACES.ranger)
  const head = yield* headSteps(j.head, kit, HERO_HEADS.ranger.who, HERO_HEADS.ranger);
  buildNeck(j.neck, kit, 'ranger', j.P.neckL, j.head);
  yield;
  // (on the lips, under the moustache: at the others' height he drank at his nose)
  const mouth = new THREE.Object3D(); mouth.name = 'mouth'; head.group.add(mouth); toGroup(0, 44, 112, mouth.position);
  const anchor = new THREE.Object3D(); anchor.name = 'anchor'; head.group.add(anchor); anchor.position.copy(ANCHOR);
  const cap = joint(head.group); cap.name = 'cap'; cap.visible = false;
  buildHat(head, cap, felt, boot, strapLeather);
  const handL = buildHand(j.handL, 1, hide, skin), handR = buildHand(j.handR, -1, hide, skin);
  const body = bodyShape(j, { L: handL.vis, R: handR.vis });
  yield;
  // A leather quiver over the right shoulder blade, slung from the right shoulder to the left hip, its arrows' nocks and
  // fletching standing out of its mouth above the shoulder, where the hand reaches up over it. (Leaning in, its mouth was
  // behind the head, and the arm reaching for it went 113 degrees past its range)
  // (long and narrow as the sheet's, down to the belt, three bands round it and a cap on its foot)
  // (as deep as the arrows are long, less the 28 cm standing out of it)
  // (the feathers in the quiver, grey goose rather than the string's pale cord: a card of that held up beside a fire took
  // past the bloom's threshold, a ball of light at his shoulder, "arrows still blinding reflection near fire";
  // \`lab village --class ranger --only heroBesideFire\`)
  const stowedVane = kit.std({ color: 0x5f5a50, roughness: 0.95, metalness: 0 });
  const quiver = joint(j.chest, -0.13, 0.04, -0.19); quiver.rotation.z = 0.35; quiver.name = 'quiver';
  S.add(lathe([[0.02, -0.52], [0.05, -0.5], [0.052, 0.14], [0.057, 0.16]], 18), boot, quiver);
  S.add(lathe([[0.045, -0.525], [0.055, -0.51], [0.056, -0.45]], 18), strapLeather, quiver);
  for (const y of [-0.36, -0.08, 0.12]) { S.add(belt(0.056, 0.056, y, 0.02, 0.005), strapLeather, quiver); for (const a of [0.6, 1.8, 3, 4.2]) S.add(new THREE.SphereGeometry(0.004, 6, 4), brass, quiver, [Math.sin(a) * 0.061, y, Math.cos(a) * 0.061]); }
  for (let i = 0; i < 6; i++) {
    const x = Math.sin(i * 2.4) * 0.042, z = Math.cos(i * 2.4) * 0.042;
    S.add(new THREE.CylinderGeometry(0.004, 0.004, 0.5, 5), bowWood, quiver, [x, 0.19, z]);
    S.add(new THREE.BoxGeometry(0.026, 0.09, 0.004), stowedVane, quiver, [x, 0.385, z]);
    yield;
  }
  S.build();
  yield;
  // the bow, in the left hand; the arrow the right hand carries from the quiver to the string
  const bow = new Bow({ riser: riserWood, limb: limbWood, grip: hide, string: cord, arrow: fletched, horn, brass: bowBrass, serving, yarn, inlay });
  bow.group.userData.bow = bow;   // (the lab's handle on it: tools/lab carry)
  // each item's parts glowing in its rarity's colour (itemGlow.ts): the bow, the cap, the trailcoat (every piece of
  // the coat's cloth), the bracers and cuffs, and the gloves (the hands' own copies kept)
  const glows = new ItemGlows(kit.mats)
    .add('weapon', [bow.group])
    .add('head', [cap])
    .add('chest', [j.root], { only: (m) => drawnIn(m, [coat, coatHem]) })
    .add('hands', [j.elbowL, j.elbowR], { only: (m) => drawnIn(m, [hide]) })
    .add('hands', [handL.glove, handR.glove], { inPlace: true });
  // (the carried bow's frame in the hero's, standing: its arrow along CARRY_ARROW, its top limb CARRY_TOP made square to it)
  const carryTop = CARRY_TOP.clone().addScaledVector(CARRY_ARROW, -CARRY_TOP.dot(CARRY_ARROW)).normalize();
  const carryQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(0, 0, 0).crossVectors(carryTop, CARRY_ARROW), carryTop, CARRY_ARROW));
  yield;
  // what the coat's skirt is draped over, in its own space: the trousers' thighs and the boots' shafts from inside, the hands,
  // the forearms' cuffs and the bow's string and lower limb from outside, with the cloth's gap (swung by the thighs alone, it
  // let the carried bow's string through its front over the stepping thigh at every stride, and the nock into it as the bow
  // came in before the chest)
  const legBodies = new SkirtLimbs(), handBodies = new SkirtLimbs(), bowBodies = new SkirtLimbs(), GAP = 0.018, HAND_GAP = 0.012, O = () => new THREE.Vector3();
  for (const [th, kn, an] of [[j.thighL, j.kneeL, j.ankleL], [j.thighR, j.kneeR, j.ankleR]] as const) {
    legBodies.add([th, O()], [kn, O()], 0.09 + GAP, 0.084 + GAP);
    legBodies.add([kn, O()], [an, O()], 0.085 + GAP, 0.06 + GAP);
    yield;
  }
  for (const hd of [j.handL, j.handR]) handBodies.add([hd, O()], [hd, new THREE.Vector3(0, -0.09, 0)], 0.045 + HAND_GAP);
  for (const [el, hd] of [[j.elbowL, j.handL], [j.elbowR, j.handR]] as const) handBodies.add([el, new THREE.Vector3(0, -0.5 * j.P.foreL, 0)], [hd, O()], 0.06 + HAND_GAP, 0.05 + HAND_GAP);
  for (const tip of [bow.tipL, bow.tipU]) bowBodies.add([bow.group, bow.nock], [bow.group, tip], 0.006 + HAND_GAP);
  bowBodies.add([bow.group, bow.lowerLimb[0]], [bow.group, bow.lowerLimb[1]], 0.02 + HAND_GAP, 0.016 + HAND_GAP);
  bowBodies.add([bow.group, bow.lowerLimb[1]], [bow.group, bow.lowerLimb[2]], 0.016 + HAND_GAP, 0.01 + HAND_GAP);
  const outside = [...handBodies.list, ...bowBodies.list];
  yield;
  // (and the arrow on the string, pointing down past the hem in the carry: draped behind the string alone, the cloth lay over
  // the arrow's upper half and it went in under the coat on a third of a walk's frames)
  const arrowBodies = new SkirtLimbs();
  arrowBodies.add([bow.arrows[0], new THREE.Vector3(0, 0, -ARROW / 2)], [bow.arrows[0], new THREE.Vector3(0, 0, ARROW / 2)], 0.005 + HAND_GAP);
  const outsideNocked = [...outside, ...arrowBodies.list];
  yield;
  // (the bow arm swung out at the shoulder just enough to keep the string off the thigh and the coat over it, as an archer
  // holds it off his coat: armOffThigh, by points along the string; the skirt between them was draped in behind the string
  // and out again by the thigh, which has the last word, and the string ran through the coat's side by up to 15 cm on most
  // frames of a walk; the points a few cm apart: 13 cm apart, each lay just clear while the string between them didn't)
  const STRING_PTS = 16, stringPts = Array.from({ length: STRING_PTS * 2 + 1 }, (): [JointPoint, number] => [[bow.group, new THREE.Vector3()], 0.006]);
  yield;
  // (and the nocked arrow's, pointing down past the hem: kept off the thigh by the string alone, it went through the thigh
  // and into the coat's hem once a stride, the arm swinging against its leg)
  const ARROW_PTS = 8, arrowPts = Array.from({ length: ARROW_PTS + 1 }, (_, i): [JointPoint, number] => [[bow.arrows[0], new THREE.Vector3(0, 0, (i / ARROW_PTS - 0.5) * ARROW)], 0.005]);
  yield;
  // (and the lower limb's, as it swings past the thigh setting off)
  const LIMB_PTS = 6, limbPts = Array.from({ length: LIMB_PTS * 2 + 1 }, (_, i): [JointPoint, number] => {
    const [a, b] = i <= LIMB_PTS ? [bow.lowerLimb[0], bow.lowerLimb[1]] : [bow.lowerLimb[1], bow.lowerLimb[2]];
    return [[bow.group, new THREE.Vector3().lerpVectors(a, b, i <= LIMB_PTS ? i / LIMB_PTS : i / LIMB_PTS - 1)], 0.018];
  });
  const stringAndArrowPts = [...stringPts, ...arrowPts, ...limbPts], stringAndLimbPts = [...stringPts, ...limbPts];
  /** how far the bow arm is swung out at its shoulder to keep the string off the thigh, as last held (rad) */
  let offThigh = 0;
  const stringOffThigh = () => {
    stringPts.forEach(([[, p]], i) => (i <= STRING_PTS ? p.lerpVectors(bow.tipU, bow.nock, i / STRING_PTS) : p.lerpVectors(bow.nock, bow.tipL, i / STRING_PTS - 1)));
    const posed = j.shoulderL.rotation.z;
    armOffThigh(hem, j.shoulderL, 1, legBodies.list[0], HAND_GAP, bow.arrows[0].visible ? stringAndArrowPts : stringAndLimbPts);
    // (swung out as far as it needs at once, and let back no faster than `OFF_THIGH_BACK`: let go as the bow coming
    // in for a shot cleared the thigh, the arm it had held 10 cm out jumped onto its place in a frame, the bow's tip 24 cm)
    const need = j.shoulderL.rotation.z - posed;
    offThigh = Math.max(need, offThigh - OFF_THIGH_BACK * dtNow);
    if (offThigh > need) { j.shoulderL.rotation.z = posed + offThigh; j.shoulderL.updateMatrixWorld(true); }
  };
  j.handL.add(bow.group);
  yield;
  // (in pieces: only what's out of the quiver shows as it's drawn out, the rest still in it; drawn whole, an arrow as long
  // as the draw pivoting at the quiver's mouth swung its head out through the quiver's side into the hips). As many as a
  // fan lacks on the string are taken out together, side by side between the fingers as they'll lie on it
  const held = new THREE.Group(); held.visible = false; held.name = 'heldArrow'; j.handR.add(held);
  const pieces = arrowPieces(), heldArrows = [0, 1, 2, 3, 4].map(() => {
    const g = new THREE.Group(), shaft = new THREE.Mesh(pieces.shaft, fletched), head = new THREE.Mesh(pieces.head, fletched);
    for (const m of [new THREE.Mesh(pieces.rear, fletched), shaft, head]) { m.castShadow = false; g.add(m); }
    held.add(g);
    return { g, shaft, head };
  });
  yield;
  // (where the shot leaves: the nocked arrow's middle; and its head, where a full draw glints)
  const tip = joint(bow.group), palm = joint(j.handR, 0, -0.07, 0.03), arrowHead = joint(bow.group);
  // (the bow's upper limb's tip, as it bends: the weapon's own, for what follows the weapon and not the shot)
  const limbTip = joint(bow.group);
  const flask = buildFlask(kit); flask.name = 'flask'; j.handR.add(flask);
  const drinkRig = { ...j, shoulderL: j.shoulderR, elbowL: j.elbowR, handL: j.handR };
  const legs = new LegIK(j), root = j.root;
  root.scale.setScalar(1.08);
  yield;
  // where the string sits in the hooked fingers (the hand's frame): between the index and the middle finger's last joints
  hook(handR, 1, 0); root.updateMatrixWorld(true);
  const stringAt = j.handR.worldToLocal(handR.f[0].j[2].getWorldPosition(new THREE.Vector3()).add(handR.f[1].j[2].getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5));
  /** when the hand reaches the quiver and has the arrow out of it, this frame (see FOLLOW) */
  let QUIVER = 0.5, OUT = 0.7;
  let yawOff = 0;
  /** the last shot's arrows, kept a moment after it ends (`KEEP_SHOT` s): the next shot queued after a fan's starts a
   *  frame later, and for the frame between them the bow flicked over to a single arrow's pose and back */
  let lastArrows = 1, sinceShot = 1;
  /** how far the bow is laid out for a fan (0..1), eased: from one kind of shot to the other it jumped; and the last fan's
   *  arrows, which the fingers hold side by side on the string (`Bow.hold`) */
  let fanK = 0, fanN = 5;
  /** through the eyes, how much the bow sways with the stride (0..1, eased with the pace), and the stride's phase it sways
   *  by: on only, at the gait's pace (the gait's own turns back as the way he goes turns round, and the bow hitched) */
  let swayK = 0, swayPhase = 0, lastPhase = 0;
  let fp = false, hasBow = true, aimT = 0, raise = 0, free = 0, flaskOut = 0, lastLoosed = -1;
  /** how far the draw arm pumps at a run: only while its hand is free (eased, from last frame's tasks) */
  let drawPump = 1;
  /** how many arrows are on the string, as the pose has it, and how many were when the hand went to the quiver for more */
  let strung = 1, fetchFrom = -1;
  /** how far the draw shoulder is set (`DRAW_GIRDLE`, 0..1) */
  let drawK = 0;
  /** how far the bow is lofted through the eyes (`FP_LOB`, 0..1) */
  let fpLob = 0;
  /** the shot's angle as last posed */
  let lastPitch = 0;
  /** where the draw hand was last frame (the chest's frame: its wrist, and where `drawHand` was asked to put it, its string
   *  point when on the string) and how far onto the string (`drawHand`'s `w`), and the same when it set off for the quiver:
   *  a fan queued behind a shot takes the rest of its arrows from there, the hand on the string (set off from where the arm
   *  hangs, it jumped there from the string, 137 px in a frame; from the wrist with the hand on the string, a fan queued
   *  behind a fan jumped 15 cm. Off the string, the wrist where it ended up: through the eyes the arm is posed again after) */
  const lastHandC = new THREE.Vector3(), lastAtC = new THREE.Vector3(), fetchAtC = new THREE.Vector3();
  let lastOnW = 0, fetchOn0 = 0;
  /** up for the draw hand on the string: the world's, or through the eyes the view's (the world's tilts in the view as the
   *  eyes look up or down, and the hand turned with it) */
  const handUp = UP.clone();
  /** putting the arrow back in the quiver: the seconds since it began (-1: not), and when on its way the hand has it off the string */
  let stowT = -1, stowTake = 0.3;
  /** how far the draw had gone (0..1 of its time) when the draw hand took the string, this shot (-1: not yet) */
  let kHook = -1, raiseLoose = 1, lastTilt = 0;
  /** how closed the chest was last frame, and when the string was let go (see OPEN): loosed, it goes on from there, and
   *  between shots it stays as it was, the opening fading with the body's turn off the shot (from closed, a tap's chest,
   *  loosed at its least draw, turned 0.2 rad in a frame, and closed as the shot ended, 0.5 rad) */
  let lastClosed = 1, closeLoose = 1;
  /** how far the string is drawn back (m past brace), as last set; and letting it down, from how far and for how long so far */
  let pullNow = 0, letFrom = -1, letT = 0;
  /** where the string was in the fingers last frame, and at the release (the head's frame, taken while it's posed: here at
   *  the top of `animate` the head is back at rest, and worldToLocal brings its matrix up to that): the follow-through starts there */
  const lastNock = new THREE.Vector3(), loosedAt = new THREE.Vector3();
  const ready = pose(), set = pose(), line = pose(), shown = pose(), nockW = new THREE.Vector3(), anchorW = new THREE.Vector3();
  const sc = () => root.scale.x;

  /** the bow placed at `bp` (world), in the left hand, its grip in the fist, the elbow towards `elbowTo` (world): the arm
   *  within a body's ranges (armIK.ts), the fist turning about the grip as far as it needs (the knuckles angled, as an
   *  archer holds a bow) and holding it diagonally if the wrist needs; `bp` becomes where the bow went */
  let dtNow = 0;
  const placeBow = (bp: BowPose, elbowTo: THREE.Vector3) => {
    const s = sc();
    _y.set(0, 1, 0).applyQuaternion(bp.q);
    // the wrist where the fist round the grip has it, the hand's length running back towards the shoulder
    _c.copy(GRIP).multiplyScalar(s).applyQuaternion(bp.q).add(bp.p);
    j.shoulderL.getWorldPosition(_d);
    _e.copy(_d).sub(_c).normalize();
    fistReach(handL, _y, _e, GRIP_R, _a);
    fistTurn(handL, _y, _e, _gq);
    const fit = solveArm(j, true, { wrist: _b.copy(_c).sub(_a), hand: _gq, pole: elbowTo, keep: 20, body, roll: { axis: _y, range: 0.6, at: _c }, slant: [-SLANT, BOW_SLANT], glide: 1 - Math.exp(-GLIDE * dtNow), free: fp, wristW: fp ? FP_WRIST : 0,
      // (the bow arm's elbow swung, not jumped, as the bow comes in from the side: free, it went 17 cm in a frame)
      maxMove: dtNow ? FETCH_V * dtNow : undefined, maxJerk: dtNow ? ELBOW_ACC * dtNow * dtNow : undefined });
    updateJoints(root);
    // the bow where the fist has it: turned as far as the wrist and the forearm turned the hand (the hand joint against
    // the turn asked of it, its turn about the grip aside), its grip where the fist closes (a slanted fist closes a
    // little further along it). (Placed first and the hand fitted to it, the bow turned in a fist that couldn't follow)
    j.handL.getWorldQuaternion(_q).multiply(_q2.copy(_gq).premultiply(_q3.setFromAxisAngle(_y, fit.roll)).invert());
    bp.q.premultiply(_q);
    _y.set(0, 1, 0).applyQuaternion(bp.q);
    _e.set(0, 1, 0).applyQuaternion(j.handL.getWorldQuaternion(_q2));
    fistReach(handL, _y, _e, GRIP_R, _a, fit.slant);
    bp.p.copy(j.handL.getWorldPosition(_c)).add(_a).sub(_b.copy(GRIP).multiplyScalar(s).applyQuaternion(bp.q));
    hold(handL, _y, GRIP_R, _e, fit.slant);
    // the bow in the hand's frame
    j.handL.updateWorldMatrix(true, false);
    _m.compose(bp.p, bp.q, _s.setScalar(s));
    _m2.copy(j.handL.matrixWorld).invert().multiply(_m).decompose(bow.group.position, bow.group.quaternion, bow.group.scale);
  };
  /** the draw hand's turn hooked on the string of a bow posed `q` (world, into `out`): its fingers forward along the arrow
   *  and the string across them, the palm to the face, the index finger on top, the hand coming down a little to it from
   *  the elbow above */
  const stringTurn = (q: THREE.Quaternion, out: THREE.Quaternion) => {
    // (the hand's -y down its fingers, -z out of its palm)
    _y.set(0, 0, -1).applyQuaternion(q).addScaledVector(handUp, 0.3).normalize();
    _z.set(-1, 0, 0).applyQuaternion(q);
    _z.addScaledVector(_y, -_y.dot(_z)).normalize();
    _x.crossVectors(_y, _z);
    return out.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
  };
  /** the right hand on the string of a bow posed `q`, by `w`: on it (1) its string point at `at` (world) and its fingers
   *  hooked on it; off it (0) its wrist at `at` and the hand riding its forearm (turned neither over nor back); between,
   *  its turn eased from that onto the string's. Its elbow towards `pole`, the shoulder girdle drawn back if it needs: the
   *  arm within a body's ranges and out of the head (armIK.ts; reached for the hand by a pole alone, the elbow went behind
   *  the back and the hand into the head). (Eased on the forearm, whichever the elbow: eased towards the hanging arm's
   *  turn in the world, half a turn off a raised one's, the forearm flipped from one end of its turn to the other; towards
   *  last frame's forearm, the wrist moved with it and the arm shook) */
  const drawHand = (at: THREE.Vector3, q: THREE.Quaternion, w: number, pole: THREE.Vector3, dt = 0, tilt = 0, girdle = true, v = ELBOW_V) => {
    const s = sc();
    lastOnW = w; j.chest.worldToLocal(lastAtC.copy(at));
    stringTurn(q, _q2);
    // (`girdle`: whether the shoulder may move; drawing an upright bow it stays where it is: the girdle drew it back, and the
    // elbow with it, round behind the neck)
    // (hooked on the string, the hand rolled `tilt` about the arrow, the back of the hand angled up and out, as an archer's
    // is, and rolling a little more or less as its arm needs: held square to it, palm to the face, the forearm's turn ran
    // out with the elbow in line behind the arrow, and the elbow went round behind the neck instead; left to find the roll
    // itself, the solver looked only near where the elbow was)
    if (tilt) _q2.premultiply(_qt.setFromAxisAngle(_rx.set(0, -1, 0).applyQuaternion(_q2), tilt));
    solveArm(j, false, { wrist: _ra.copy(stringAt).multiplyScalar(s * w).applyQuaternion(_q2).negate().add(at), hand: _q2, ease: w < 1 ? { rest: HANG_R, w } : undefined, pole, keep: DRAW_KEEP, wristW: drawK > 0 ? DRAW_WRIST : 0, girdle, girdleSet: drawK > 0.01 ? [DRAW_GIRDLE[0] * drawK, DRAW_GIRDLE[1] * drawK] : undefined, body, maxMove: dt && v ? v * dt : undefined,
      roll: w > 0.5 && HOOK_ROLL ? { axis: _rx.set(1, 0, 0).applyQuaternion(_q2), range: HOOK_ROLL * smooth(clamp((w - ROLL_FADE[0]) / (ROLL_FADE[1] - ROLL_FADE[0]), 0, 1)), at } : undefined, glide: w > 0.5 && HOOK_ROLL ? 1 - Math.exp(-GLIDE * dtNow) : undefined,
      maxJerk: dt && v ? ELBOW_ACC * dt * dt : undefined });
    updateJoints(root);
  };

  /** the arrow in the draw hand's fingers by its nock: drawn up through the quiver's mouth (pointing back down into it, its
   *  head still in the quiver) until `w` frees it, then turned over the top, up, onto `toward` (world: the line it's laid on)
   *  as the hand brings it to the string (turned straight from the one to the other, half a turn, it swept through the head).
   *  `count` arrows from the string's `from`th up (a fan's): drawn out in a bunch, round the fingers' hold their sockets
   *  touching, and spread out as `w` brings them to the string, each to where it will lie on it, turned about its length
   *  as it lies there (in a row across the fingers all the way, the outer ones went through the forearm and the shoulder
   *  coming out of the quiver; turned any other way, the feathers flipped as they were laid on) */
  const _hx = new THREE.Vector3(), _hy = new THREE.Vector3(), _hm = new THREE.Matrix4();
  const holdArrow = (mouthW: THREE.Vector3, w: number, toward: THREE.Vector3, from = 0, count = 1) => {
    const s = sc();
    held.visible = hasBow;
    const nk = j.handR.localToWorld(_e.copy(stringAt));
    // (what's out of the quiver: the way from the fingers to its mouth, all of it once it's free)
    const d = nk.distanceTo(mouthW) / s, out = fp ? ARROW : Math.min(ARROW, d + smooth(Math.min(1, w * 5)) * ARROW);
    _a.copy(mouthW).sub(nk).normalize();
    const top = _c.copy(UP).addScaledVector(toward, 0.3).normalize().clone();
    // (from pointing into the quiver up over the top it swings out to the right, away from the head: turned straight up, its
    // back end swept through the side of the head)
    if (w < 0.5) { const k = smooth(w * 2); slerpDir(_a, top, k, _a).addScaledVector(_hy.set(-1, 0, 0).transformDirection(j.chest.matrixWorld), TURN_OUT * Math.sin(Math.PI * k)).normalize(); }
    else slerpDir(top, toward, smooth(w * 2 - 1), _a);
    // (through the eyes the quiver is out of view below them: the arrow comes up from there already along the line, its
    // head into the view first; turned over the top, a metre of it swept up across the whole view)
    if (fp) _a.copy(toward);
    j.handR.getWorldQuaternion(_q).invert();
    _a.applyQuaternion(_q);
    // (on the string the arrow's x is the bow's, which is out of the hooked hand's palm, and side by side they lie up the
    // string, across the fingers: the hand's own frame, square to the arrow)
    _hx.set(0, 0, -1).addScaledVector(_a, _a.z);
    if (_hx.lengthSq() < 1e-4) _hx.set(1, 0, 0).addScaledVector(_a, -_a.x);
    _hx.normalize(); _hy.crossVectors(_a, _hx);
    held.quaternion.setFromRotationMatrix(_hm.makeBasis(_hx, _hy, _a));
    held.position.copy(stringAt);
    const k = s / j.handR.getWorldScale(_s).x;
    held.scale.setScalar(k);
    const ring = count > 1 ? FAN_PITCH / (2 * Math.sin(Math.PI / count)) : 0, spread = smooth(w);
    heldArrows.forEach((h, i) => {
      h.g.visible = i >= from && i < from + count;
      const a = (i - from) / count * Math.PI * 2;
      h.g.position.set(ring * Math.cos(a) * (1 - spread), lerp(ring * Math.sin(a), i * FAN_PITCH - bow.hold, spread), 0);
      h.shaft.position.z = 0.01; h.shaft.scale.set(1, 1, Math.max(0.001, out - 0.07));
      h.head.visible = out >= ARROW - 0.005; h.head.position.z = ARROW;
    });
    held.userData.len = out * s;
  };

  function animate(st: AnimState): void {
    const dt = st.dt, a = st.action, s = sc();
    dtNow = dt;
    resetPose(j); idle(j, st.t, 1 - st.move * 0.5);
    // (the draw arm pumps at a run as a runner's does while its hand is free: its ways to the string and the quiver set
    // off from a hanging arm, and set off from one pumping before the chest, the elbow swung up and out level with the
    // hand as it turned for the string, the forearm hanging; the bow arm carries the bow at its side, swinging as at a
    // walk)
    // (an arrow to put back counts from as soon as the hero has it so: the stow waits for the arm to stop pumping)
    const stowWanted = !a && (st.nocked ?? 1) <= 0 && strung > 0;
    const drawBusy = Boolean(a) || stowT >= 0 || stowWanted || free > 0.01;
    drawPump = damp(drawPump, drawBusy ? 0 : 1, DRAW_PUMP_RATE, dt);
    walkCycle(j, st.phase, st.move, { run: true, arm: 0.25, stride: 0.5, dir: st.moveDir ?? 1, pump: drawPump, pumpL: 0 });
    const shooting = a?.name === 'bow' && a.draw !== undefined, loosed = shooting && a.loosed !== undefined;
    // what follows a release (0..1), the draw (0..1 of its time) and how far that pulls the string
    const after = loosed ? clamp((a.t - 0.55) / 0.45, 0, 1) : -1, k = shooting ? a.draw! : 0;
    if (loosed && lastLoosed < 0) { strung = 0; loosedAt.copy(lastNock); raiseLoose = raise; closeLoose = lastClosed; }
    lastLoosed = loosed ? a.loosed! : -1;
    if (after >= NOCKED) strung = Math.max(strung, 1);
    // (a shot with fewer on the string than it looses: the hand takes the rest from the quiver first; they're on the string
    // once laid on it)
    const fetchE = shooting && !loosed && a.fetch !== undefined ? a.fetch : -1;
    if (fetchE >= 0 && fetchFrom < 0) { fetchFrom = Math.min(strung, (a!.arrows ?? 1) - 1); fetchAtC.lerpVectors(lastHandC, lastAtC, lastOnW); fetchOn0 = lastOnW; }
    if (fetchE < 0) fetchFrom = -1;
    else strung = fetchE >= FETCHED ? a!.arrows ?? 1 : fetchFrom;
    // between shots, as the hero has it (`AnimState.nocked`): stood a while without a shot, he puts it back in the quiver
    // (only with nothing else on: the other skills' gestures take the draw hand)
    if (shooting || a) stowT = -1;
    else if ((st.nocked ?? 1) > 0) { strung = Math.max(strung, 1); stowT = -1; }
    else if (stowT < 0 && strung > 0 && drawPump < STOW_PUMP) stowT = 0;
    if (stowT >= 0) { stowT += dt; if (stowWay(stowT / STOW) >= stowTake) strung = 0; if (stowT >= STOW) stowT = -1; }
    const stowE = stowT >= 0 ? stowT / STOW : -1;
    // (eased both ways: the bow comes up and goes down from a standstill)
    aimT = clamp(aimT + (shooting ? dt / AIM_IN : -dt / AIM_OUT), 0, 1);
    const aim = smooth(aimT);
    // (the hand takes the string with the bow brought in before the chest, as the arrow is nocked; only then does the bow come up
    // and the string come back: drawn as the hand came for it, the string met the hand at the throat, the arm folded tight,
    // and the elbow went up over the head to come round)
    // (with an arrow taken from the quiver for this shot, the hand laid it on the string: it's there already)
    const onW = loosed || (shooting && a.fetch !== undefined) ? 1 : smooth(clamp((aimT - TAKE[0]) / (TAKE[1] - TAKE[0]), 0, 1));
    if (!shooting) kHook = -1;
    // (loosed, the hand lays the next arrow on the string itself: a channel's next volley is drawn from there)
    else if (loosed) kHook = 0;
    else if (kHook < 0 && onW > 0.999) kHook = Math.min(k, 0.6);
    const kv = loosed ? k : kHook < 0 ? 0 : clamp((k - kHook) / (1 - kHook), 0, 1);
    // (loosed, from as far up as it had come: from the line, a quick tap's bow jumped up onto it)
    raise = shooting ? (loosed ? raiseLoose * (1 - smooth(clamp((after - FOLLOW) / (QUIVER - FOLLOW), 0, 1))) : smooth(clamp(kv / RAISE, 0, 1))) : damp(raise, 0, 6, dt);
    // side-on to the target: the hips turn (less when moving: the legs walk along them), the trunk the rest, the head back to the target
    // (the chest open towards the target as the draw starts and closing as the string comes back, so the draw elbow goes round
    // behind with the shoulder: side-on from the start, the hand reaching the string out front took the arm across the
    // chest past its range, and the elbow went over the head to come round)
    const closedTo = !shooting ? lastClosed : loosed ? closeLoose * (1 - smooth(clamp((after - FOLLOW) / (NOCKED - FOLLOW), 0, 1))) : drawnAt(kv) * Math.min(1, aimT * 1.5);
    // (and never quicker than `CLOSE_V`: a shot cut short and another begun)
    const closed = lastClosed = lastClosed + clamp(closedTo - lastClosed, -CLOSE_V * dt, CLOSE_V * dt);
    const side = aim * SIDE, hip = side * lerp(HIP_SIDE, HIP_SIDE_MOVING, st.move), open = aim * OPEN * (1 - closed);
    j.hips.rotation.y -= hip; j.spine.rotation.y -= (side - hip - open) * 0.45; j.chest.rotation.y -= (side - hip - open) * 0.55;
    j.neck.rotation.y += side * 0.4; j.head.rotation.y += side * 0.6;
    // (the shoulders' line tilts with the shot's angle: the trunk bends at the waist, not the arms at the shoulders)
    // (eased back level when the shot is cut off, a channel let go mid-volley: dropped at once, the arrow through the eyes
    // jumped 37 px in a frame)
    const pitch = lastPitch = shooting ? a.pitch ?? 0 : damp(lastPitch, 0, PITCH_BACK, dt);
    j.chest.rotation.z += pitch * 0.6 * aim; j.spine.rotation.z += pitch * 0.25 * aim;
    // (the trunk a little forward over the stride, the head held up against it: at 0.1, with the whole body leant into the
    // speed by the leg IK, the trunk leant 16 degrees at a run, a runner's 12)
    j.spine.rotation.x += st.move * 0.06; j.neck.rotation.x -= st.move * 0.06;
    // the other skills' gestures with the draw hand off the string, and the draught
    const gesture = a?.name === 'cast' || a?.name === 'buff' || a?.name === 'slam', drinking = a?.name === 'drink';
    if (gesture) {
      j.shoulderR.rotation.x = -0.6 - Math.sin(a.t * Math.PI) * 0.9; j.elbowR.rotation.x = -0.5;
      if (a.name === 'slam') j.body.position.y -= Math.sin(a.t * Math.PI) * 0.12;
    }
    free = damp(free, gesture || drinking ? 1 : 0, 14, dt);
    // carrying the bow: the arm a little out from the side and the elbow a little bent (the walk swings it)
    j.shoulderL.rotation.z += CARRY_RAISE; j.elbowL.rotation.x -= CARRY_BEND;
    hook(handR, 0, 0);
    const drinkOut = drinking ? drink(drinkRig, a.t, mouth, DRINK, handR, flask) : 0;
    flaskOut = damp(flaskOut, drinkOut, 16, dt); flask.visible = flaskOut > 0.02; flask.scale.setScalar(Math.max(0.02, flaskOut));
    st.look?.(aim < 0.5 ? 1 : 0);
    if (st.dead >= 0) { deathFall(j, st.dead); legs.reset(); }
    else {
      if (!fp) legs.captureArms();
      // (each foot on its own side of the pelvis's middle as the leg IK sees it: across it, it was moved back out and stepped again, over and over)
      if (aim > 0.4) { legs.stance(0, 0.07, 0.2, -1.1); legs.stance(1, -0.07, -0.22, -1.45); }
      else { legs.stance(0, 0.13, 0.06, 0.2); legs.stance(1, -0.13, -0.04, -0.3); }
      legs.update(dt, st.phase, st.dead, 1, fp ? 0 : 1); groundFeet(j, 0.07);
      if (!fp) legs.holdArms();
    }
    updateJoints(root);
    if (st.dead >= 0) { root.updateMatrixWorld(true); tunic.update(-j.thighL.rotation.x, -j.thighR.rotation.x, st.move, st.t, dt); bendShoulders(); return; }

    // the arrow's line: the heading the shot flies and its angle above level
    const facing = Math.atan2(_a.set(0, 0, 1).transformDirection(root.matrixWorld).x, _a.z);
    yawOff = angleDamp(yawOff, shooting && a.yaw !== undefined ? clamp(Math.atan2(Math.sin(a.yaw - facing), Math.cos(a.yaw - facing)), -YAW_OFF, YAW_OFF) : 0, 20, dt);
    const yaw = facing + yawOff;
    _u.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const u = _u.clone();
    if (aim > 0.01) {
      // the face onto the target whatever the legs did to the trunk: turned to it and looking along the arrow
      j.head.getWorldDirection(_a);
      const dy = Math.atan2(Math.sin(yaw - Math.atan2(_a.x, _a.z)), Math.cos(yaw - Math.atan2(_a.x, _a.z)));
      j.neck.rotation.y += dy * 0.4 * aim; j.head.rotation.y += dy * 0.6 * aim; j.head.rotation.x -= pitch * 0.5 * aim;
      updateJoints(root);
    }
    anchor.getWorldPosition(anchorW);
    // full draw: the bow arm reaching along the line from the anchor, its fist round the grip; how far that is, is the draw length
    if (shooting) { lastArrows = a.arrows ?? 1; sinceShot = 0; } else sinceShot += dt;
    const arrows = shooting ? a.arrows ?? 1 : sinceShot < KEEP_SHOT ? lastArrows : 1;
    const fan = arrows > 1;
    fanK = damp(fanK, fan ? 1 : 0, FAN_EASE, dt);
    if (fan) fanN = arrows;
    // (a fan's arrows side by side up the bow from the rest, the line through their middle)
    bow.hold = fanHold(fanN) * fanK;
    const restY = REST_Y + bow.hold;
    // (the fan's string lies across, hooked palm down: the hand's width across the jaw, so it's anchored that much out from the face)
    if (fan && !fp) anchorW.addScaledVector(_e.crossVectors(UP, u).normalize(), -FAN_OUT * s);
    frame(u, fan ? FLAT : CANT, line.q);
    _y.set(0, 1, 0).applyQuaternion(line.q);
    j.shoulderL.getWorldPosition(_d);
    fistReach(handL, _y, _e.copy(u).negate(), GRIP_R, _c);
    // (the wrist, as the rest lies on the line at D from the anchor: B + u D)
    _b.copy(anchorW).addScaledVector(_y, (GRIP.y - restY) * s).addScaledVector(u, GRIP.z * s).sub(_c).sub(_d);
    const L = (j.P.upperL + j.P.foreL) * s * REACH, ub = u.dot(_b);
    const D = -ub + Math.sqrt(Math.max(0, ub * ub - _b.lengthSq() + L * L));
    line.p.copy(anchorW).addScaledVector(u, D).addScaledVector(_y, -restY * s);
    // (through the eyes: the grip still in the view and the shot's line through it, upright as the view is, the nock the
    // draw length back along it; the model is placed in view after the pose, so the line is posed as the eyes see it)
    const eyeUp = fp ? dirFromEyes(root, EYE_UP, new THREE.Vector3()) : UP;
    handUp.copy(eyeUp);
    const uEye = fp ? toEyes(u, new THREE.Vector3()) : _a;
    if (fp) {
      const el = Math.atan2(uEye.y, Math.hypot(uEye.x, uEye.z)), cl = clamp(el, FP_PITCH[0], FP_PITCH[1]), h = Math.hypot(uEye.x, uEye.z) || 1;
      if (cl !== el) uEye.set(uEye.x / h * Math.cos(cl), Math.sin(cl), uEye.z / h * Math.cos(cl));
      // (a volley lofted over the area aims up through the eyes too: the whole bow tipped up about the eyes, as the bow arm
      // raises it, so the fist keeps its turn on the forearm)
      fpLob = damp(fpLob, smooth(clamp((pitch - 0.2) / 0.25, 0, 1)), FP_LOB_EASE, dtNow);
      const lobQ = _qt.setFromAxisAngle(_rx.set(1, 0, 0), fpLob * FP_LOB);
      uEye.applyQuaternion(lobQ);
      dirFromEyes(root, uEye, _a);
      const upL = dirFromEyes(root, _d.copy(EYE_UP).applyQuaternion(lobQ), new THREE.Vector3());
      frame(_a, lerp(FP_CANT, FLAT, fanK), line.q, upL); _y.set(0, 1, 0).applyQuaternion(line.q);
      _e.lerpVectors(FP_GRIP, FP_FAN, fanK).applyQuaternion(lobQ);
      fromEyes(root, j.neck, _e, line.p);
      anchorW.copy(line.p).addScaledVector(_y, restY * s).addScaledVector(_a, -D);
      // (and the rest of the pose, the draw elbow's way round included, along the line as it's posed: along the shot's own,
      // the elbow went round another way as the eyes looked up, and the hand turned up into the view)
      u.copy(_a);
    }
    const pullMax = Math.max(0.05, line.p.distanceTo(anchorW) / s - bow.brace);
    // between shots, the bow arm brings the bow in before the chest, the arrow pointing down the shot, its nock where the
    // draw hand lays the next arrow on it with its elbow bent (out along the shot, the nock was 37 cm across the body
    // and the arm reached straight out across the face for it)
    _a.copy(u).applyAxisAngle(_left.crossVectors(UP, u).normalize(), SET_TIP[0]);
    frame(_a, SET_TIP[1], set.q);
    j.chest.localToWorld(set.p.copy(NOCK_AT)).sub(_e.set(0, restY, -bow.brace).multiplyScalar(s).applyQuaternion(set.q));
    // carried: in the fist at the side, held as the hand holds it whichever way the arm swings (its top forward and out, an arrow nocked along it)
    const wristFK = j.handL.getWorldPosition(new THREE.Vector3()), elbowFK = j.elbowL.getWorldPosition(new THREE.Vector3());
    const elbowPoleFK = elbowFK.clone().sub(j.shoulderL.getWorldPosition(_d));
    root.getWorldQuaternion(_q3);
    _a.copy(wristFK).sub(elbowFK).applyQuaternion(_q2.copy(_q3).invert());
    const swing = Math.atan2(_a.z, -_a.y);
    ready.q.copy(_q3).multiply(_q2.setFromAxisAngle(_x.set(1, 0, 0), (CARRY_REST - swing) * CARRY_FOLLOW)).multiply(carryQ);
    _y.set(0, 1, 0).applyQuaternion(ready.q);
    fistReach(handL, _y, _e.copy(elbowFK).sub(wristFK).normalize(), GRIP_R, _c);
    ready.p.copy(wristFK).add(_c).sub(_b.copy(GRIP).multiplyScalar(s).applyQuaternion(ready.q));
    // (through the eyes the bow stays in the view, low on the left, and comes in for the next arrow below the line)
    if (fp) {
      fromEyes(root, j.neck, FP_REST, ready.p); frame(dirFromEyes(root, _a.copy(FP_REST_DIR).normalize(), _e), FP_REST_CANT, ready.q, eyeUp);
      fromEyes(root, j.neck, _a.lerpVectors(FP_GRIP, FP_FAN, fanK).add(FP_SET), set.p);
      // (a fan's laid flat already: turned over as it came up, its arrows swung up across the view)
      frame(dirFromEyes(root, _a.copy(uEye).applyAxisAngle(_b.set(1, 0, 0), -FP_SET_TIP), _e), lerp(FP_CANT, FLAT, fanK), set.q, eyeUp);
    }
    // the bow where it is: on the line as it draws, in for the next arrow, and at rest between shots
    shown.p.lerpVectors(set.p, line.p, raise); shown.q.slerpQuaternions(set.q, line.q, raise);
    // loosed, the bow tips forward in the loose fist and is caught
    // (only out on the line: tipped as it came in, its lower limb swung back into the body)
    const drop = loosed ? Math.sin(clamp(after / 0.5, 0, 1) * Math.PI) * 0.5 * (a.draw ?? 1) * raise * raise : 0;
    if (drop) shown.q.multiply(_q2.setFromAxisAngle(_x.set(1, 0, 0), drop));
    // (it comes in from the side quicker than the body turns, so the hand takes the string on it before it comes up)
    // (and putting the arrow back, the bow comes up before the chest for the hand to take it off the string, then goes down
    // again: reached for at the side, the bow swung back with the walk and the hand went behind the back for it)
    const stowIn = stowE < 0 ? 0 : smooth(clamp(stowE / STOW_UP, 0, 1)) * (1 - smooth(clamp((stowE - 0.45) / 0.2, 0, 1)));
    const bowIn = Math.max(smooth(clamp(aimT / BOW_IN, 0, 1)), stowIn);
    shown.p.lerpVectors(ready.p, shown.p, bowIn); _q.copy(shown.q); shown.q.copy(ready.q).slerp(_q, bowIn);
    // (turned about its length on the way, so the bow arm's elbow stays on its side of the bow: turned straight from the level
    // carry to the upright bow before the chest, the elbow crossed the bow's plane halfway and back, the string through the sleeve)
    if (!fp) shown.q.multiply(_q.setFromAxisAngle(UP, CARRY_SWING_TURN * Math.sin(bowIn * Math.PI)));
    // (out to the left and up on its way from the side to the shot and back, so the lower limb passes outside the thigh, not through it)
    // (through the eyes it comes straight in: swung out, it went off the view's edge and back)
    if (!fp) shown.p.addScaledVector(_e.crossVectors(UP, u).normalize(), CARRY_SWING * s * Math.sin(bowIn * Math.PI)).addScaledVector(UP, 0.08 * s * Math.sin(bowIn * Math.PI));
    // (through the eyes it sways with the stride, about its grip)
    swayK = damp(swayK, fp ? st.move : 0, FP_SWAY_EASE, dt);
    swayPhase += Math.min(Math.abs(Math.atan2(Math.sin(st.phase - lastPhase), Math.cos(st.phase - lastPhase))), 20 * dt); lastPhase = st.phase;
    if (fp && swayK > 1e-3) {
      const k = swayK * lerp(1, FP_SWAY_DRAWN, aim), sp = Math.sin(swayPhase);
      shown.p.add(fromEyes(root, j.neck, _e.set(FP_SWAY[0] * sp * k, FP_SWAY[1] * Math.cos(2 * swayPhase) * k, 0), _a).sub(fromEyes(root, j.neck, _e.set(0, 0, 0), _b)));
      shown.q.premultiply(_q.setFromAxisAngle(dirFromEyes(root, _e.set(0, 0, -1), _a), FP_SWAY[2] * sp * k));
    }
    // the string: drawn as the bow comes up; loosed, it springs back past rest and rings out
    // (a shot ended without its loose, Hailfletch let go mid-volley, lets the string down: set back at once, the arrow on it
    // shot forward 45 to 120 px in a frame through the eyes)
    if (loosed) { pullNow = 0; letFrom = -1; bow.set(0, -0.35 * (a.draw ?? 1) * Math.exp(-a.loosed! / 0.06) * Math.cos(a.loosed! * Math.PI * 2 * 9)); }
    else {
      const to = drawnAt(kv) * pullMax * Math.min(1, aim * 1.5);
      if (to >= pullNow) { pullNow = to; letFrom = -1; }
      else { if (letFrom < 0) { letFrom = pullNow; letT = 0; } letT += dt; pullNow = Math.max(to, letFrom * (1 - smooth(clamp(letT / LET_DOWN, 0, 1)))); }
      bow.set(pullNow);
    }
    // (the bow arm's elbow carried as it hangs, and on the shot turned out and a little down: its crease upright, the string
    // clears the forearm; and so too with the bow brought up before the chest to put the arrow back: by the shot's ease alone,
    // nothing then, it stayed where it hangs as the bow came up)
    const elbowTo = _x.set(1, 0, 0).applyQuaternion(shown.q).addScaledVector(UP, -0.35).normalize().lerp(elbowPoleFK.normalize(), 1 - Math.max(aim, stowIn)).clone();
    if (hasBow) placeBow(shown, elbowTo);
    // the arrows on the string (a fan side by side in the flat bow's window), and where the shot leaves (the nocked arrow's middle)
    const n = arrows;
    bow.nockArrows(hasBow ? Math.min(strung, n) : 0);
    const nocked = bow.arrows[Math.floor((Math.max(1, n) - 1) / 2)];
    tip.position.copy(nocked.position);
    limbTip.position.copy(bow.tipU);
    arrowHead.position.set(0, 0, ARROW / 2 - HEAD_MIDDLE).applyQuaternion(nocked.quaternion).add(nocked.position);
    updateJoints(root);
    nockW.copy(bow.nock); bow.group.localToWorld(nockW);

    // the draw hand: on the string at the nock, or following through and fetching the next arrow (the other skills'
    // gestures and the draught blend back over it, as posed above)
    const fk = [j.shoulderR.quaternion.clone(), j.elbowR.quaternion.clone(), j.handR.quaternion.clone()];
    // (carried, the draw hand hangs free: it takes the string as the bow comes up)
    const loose = free;
    // (where the pose has the wrist: taking the string, the hand goes from there to it, the arm solved within a body's
    // ranges all the way; blending the joints between the two poses put the hand through the head)
    const fkAt = j.handR.getWorldPosition(new THREE.Vector3());
    const fkPole = j.elbowR.getWorldPosition(new THREE.Vector3()).sub(j.shoulderR.getWorldPosition(_d));
    // (the archer's left across the shot, level: the bow's own left is up when it's laid flat for a fan)
    _left.crossVectors(UP, u).normalize();
    // the draw elbow at full draw: in line behind the hand along the arrow from above, a little over it, so behind the head,
    // the upper arm rising from the shoulder away from the target (sent out towards the archer's back, the elbow came
    // round behind the body and the hand through the head)
    const fullPole = nockW.clone().addScaledVector(u, -(j.P.foreL * s + 0.09 * s)).addScaledVector(UP, ELBOW_UP * s).sub(j.shoulderR.getWorldPosition(_d)).normalize();
    // with the string taken before the chest, out to the right at the shoulder's height; between, as far round from there as
    // the string has come back, so it stays out to the side. (In line behind the hand all the way, the elbow stood straight
    // up over the head with the arrow pointing down before the chest, and with the hand at the face; sent forward while the
    // string came back, it jumped round behind as the hand reached the anchor)
    const setPole = _b.copy(SET_POLE).transformDirection(j.chest.matrixWorld).clone();
    const drawn = loosed ? 0 : Math.min(1, pullNow / pullMax);
    // (the shoulder set as the string comes back, and easing back after the loose)
    drawK = fan ? 0 : Math.max(smooth(drawn), drawK * Math.exp(-GIRDLE_BACK * dtNow));
    const linePole = setPole.clone().lerp(fullPole, drawn).normalize();
    // (the hand rolled on the string late in the draw, `TILT_POW`; the fan's string lies across, hooked palm down already)
    const tilt = fan ? 0 : HOOK_TILT * smooth(drawn) ** TILT_POW;
    // (the hand's turn on the string: as on the line; followed the bow pitched down on its way up, the fingers pointed 40
    // degrees down and the wrist rose into the cheek)
    const onString = line.q.clone();
    held.visible = false;
    let e = -1, hk = 1 - loose, pinch = 0;
    // the quiver: where the hand takes an arrow by its nock and its mouth; how far up and forward over the shoulder the hand
    // draws it out (the arm at full stretch), and where it passes over the shoulder on its way to it
    const mouthW = quiver.localToWorld(_e.set(0, QUIVER_MOUTH, 0)).clone(), q0 = quiver.localToWorld(_e.set(0, QUIVER_NOCK, 0)).clone();
    const shoulderRest = j.shoulderR.userData.rest ?? j.shoulderR.position;
    const pull = j.chest.localToWorld(_e.copy(shoulderRest).add(PULL)).clone(), rise = j.chest.localToWorld(_e.copy(shoulderRest).add(RISE)).clone();
    const sideUp = j.chest.localToWorld(_e.copy(shoulderRest).add(SIDE_UP)).clone();
    // (up over the shoulder on the way to the quiver: across just above it, the arm folded past its range)
    const lift = j.chest.localToWorld(_e.copy(shoulderRest).add(LIFT)).clone();
    // (through the eyes the quiver is behind them: the arrow comes up from below)
    if (fp) {
      fromEyes(root, j.neck, FP_LOW, q0); fromEyes(root, j.neck, FP_LOW, rise); rise.addScaledVector(eyeUp, 0.05 * s); fromEyes(root, j.neck, FP_UP, pull); mouthW.copy(q0).addScaledVector(eyeUp, -s);
      // (and the way up to it and back from the shot below the view too: over the shoulder, the arm came up through its edge)
      fromEyes(root, j.neck, _e.copy(FP_LOW).add(_b.set(0.08, -0.05, 0.08)), sideUp); fromEyes(root, j.neck, _e.copy(FP_LOW).add(_b.set(0.04, -0.02, 0.04)), lift);
    }
    // (reaching up over the shoulder for it, the elbow raised and out to the side: raised and back, the upper arm lay along
    // the arrow running from the hand down to the quiver's mouth, and the arrow went through it as it came out)
    const reloadPole = _b.copy(UP).multiplyScalar(0.7).addScaledVector(u, 0.1).addScaledVector(_left, -0.7).normalize().clone();
    // (and letting it down into the quiver, further out: the arrow from the hand down to the quiver's mouth went through the
    // upper arm)
    const stowPole = _b.copy(UP).multiplyScalar(0.5).addScaledVector(u, 0.2).addScaledVector(_left, -0.85).normalize().clone();
    // (the line the arrow lies on, nocked: from the nock forward through the rest)
    const lineDir = _a.copy(nockW).sub(bow.group.localToWorld(_e.set(0, restY, 0))).negate().normalize().clone();
    if (fetchE >= 0 && hasBow && fetchE < 1) {
      // a shot with none on the string: from the side up over the shoulder to the quiver, the arrow drawn up out of it
      // to the arm's full stretch, then down in front of the chest to the string where the bow waits, in one sweep
      // (from where the hand was as it set off: at the side, or on the string for a fan's other arrows, coming off it)
      const pts = [j.chest.localToWorld(fetchAtC.clone()), sideUp, lift, q0, rise, pull, nockW], ts = lengthTimes(pts, FETCHED);
      e = FETCHED * smooth(clamp(fetchE / FETCHED, 0, 1));
      const at = through(pts, ts, e, new THREE.Vector3());
      const on = Math.max(fetchOn0 * (1 - smooth(clamp(e / ts[1], 0, 1))), smooth(clamp((e - ts[5]) / (FETCHED - ts[5]), 0, 1)));
      drawHand(at, onString, on, setPole.clone().lerp(reloadPole, 1 - on), dt, 0, true, FETCH_V);
      if (e >= ts[3] && fetchE < FETCHED) { holdArrow(mouthW, smooth(clamp((e - ts[5]) / (FETCHED - ts[5]), 0, 1)), lineDir, fetchFrom, n - fetchFrom); pinch = 1; hk = 0.2; }
      else if (fetchE >= FETCHED) hk = 1;
    }
    else if (stowE >= 0 && hasBow && !shooting) {
      // stood a while without a shot: the hand takes the arrow off the string of the bow at his side, lifts it up over the
      // shoulder and lets it down into the quiver, and comes back down to hang
      // (letting it down into the quiver from above the quiver's top: it slides in the rest of the way; reaching down to
      // the top behind the shoulder, the raised arm went 20 degrees past its range)
      const drop = mouthW.clone().lerp(q0, 1.4);
      const pts = [fkAt.clone(), nockW, pull, rise, drop, lift, sideUp, fkAt.clone()], ts = lengthTimes(pts, 1);
      stowTake = ts[1];
      e = stowWay(stowE);
      const at = through(pts, ts, e, new THREE.Vector3());
      const on = e < ts[1] ? smooth(clamp(e / ts[1], 0, 1)) : 1 - smooth(clamp((e - ts[1]) / (ts[2] - ts[1]), 0, 1));
      drawHand(at, onString, on, setPole.clone().lerp(stowPole, 1 - on), dt, 0, true, FETCH_V);
      // (turned up over the top as the hand goes up and forward with it, and down into the quiver only as the hand comes
      // back over it: pointed at its mouth from up and forward, the arrow went through the raised upper arm)
      const wS = e < ts[2] ? 1 - 0.5 * smooth(clamp((e - ts[1]) / (ts[2] - ts[1]), 0, 1)) : 0.5 - 0.5 * smooth(clamp((e - ts[2]) / (ts[3] - ts[2]), 0, 1));
      if (e >= ts[1] && e < ts[4]) { holdArrow(mouthW, wS, lineDir); pinch = 1; hk = 0.2; }
      else hk = e < ts[1] ? smooth(clamp(e / ts[1], 0, 1)) * 0.5 : 0;
    }
    else if (!loosed || after >= NOCKED || !hasBow) {
      // (its way up from the side bows out in front of the chest: straight there, it cut through the belly and the chest)
      // (the hand turns onto the string as it nears it)
      // (the elbow out and forward from where it hangs, then up behind: kept down by the side, the forearm crossed the chest
      // and the elbow swung up over the shoulder in a frame)
      // (the hand free, no shot under way: the arm fitted as it swings, as any free arm is: held turned as for the string,
      // a runner's hand before the chest took the shoulder's turn to its end and the elbow flipped up and out level with
      // it, the forearm hanging)
      if (onW === 0 && !shooting) {
        if (!fp) fitArm(j, false, undefined, body);
      } else if (onW < 1) {
        const pole = fkPole.normalize().lerp(linePole, onW);
        // (the hand rides its forearm until the elbow is up and out, then turns onto the string: turned onto it with the
        // elbow still low in front, the wrist met both its ends and the elbow jumped up; its elbow free of the draw's speed
        // cap, which held it back as a walking shot started and it swung round 40 degrees in a frame to catch up)
        drawHand(_c.lerpVectors(fkAt, nockW, onW).addScaledVector(_a.set(0, 0, 1).transformDirection(j.chest.matrixWorld), BOW_OUT * s * Math.sin(onW * Math.PI)), onString, smooth(clamp((onW - 0.7) / 0.3, 0, 1)), pole.clone(), 0, tilt, fan || !shooting || loosed);
      }
      else drawHand(nockW, onString, 1, linePole, shooting && !loosed ? dt : 0, tilt, fan || !shooting || loosed);
      lastTilt = tilt;
      j.head.worldToLocal(lastNock.copy(nockW));
    }
    else {
      // back along the jaw and down the neck from where the string left the fingers; up to the quiver's mouth over the
      // right shoulder; the arrow drawn up out of it to the arm's full stretch over the shoulder, then down in front of the
      // chest to the string, in one sweep. (The head, turned to the target, is between the quiver and the bow: carried
      // straight from one to the other, the arrow went over the head and the arm through it)
      const from = j.head.localToWorld(_d.copy(loosedAt));
      // (a little back and out from the neck, level: the shoulder is under the anchor, and back or down towards it the elbow
      // folded past its range)
      const follow = from.clone().addScaledVector(u, -0.04 * s).addScaledVector(_left, -0.08 * s).addScaledVector(UP, 0.01 * s);
      const pts = [from.clone(), follow, lift, q0, rise, pull, nockW], ts = [0, FOLLOW];
      let total = 0; const lens = [0];
      for (let i = 2; i < pts.length; i++) lens.push(total += pts[i].distanceTo(pts[i - 1]));
      for (let i = 1; i < lens.length; i++) ts.push(FOLLOW + (NOCKED - FOLLOW) * lens[i] / total);
      QUIVER = ts[3]; OUT = ts[5];
      // (one ease over the way from the follow-through to the string: it sets off and arrives at rest, never stopping between)
      e = after < FOLLOW ? after : FOLLOW + (NOCKED - FOLLOW) * smooth((after - FOLLOW) / (NOCKED - FOLLOW));
      const at = through(pts, ts, Math.min(e, NOCKED), new THREE.Vector3());
      // (the string's turn eased off as the hand leaves it and back on as it lays the arrow on it; the elbow likewise)
      const on = Math.max(1 - smooth(clamp((after - 0.06) / 0.3, 0, 1)), smooth(clamp((e - OUT) / (NOCKED - OUT), 0, 1)));
      // (from where the shot left it to there, and from there to before the shoulder, where the next draw starts)
      const onA = 1 - smooth(clamp((after - 0.06) / 0.3, 0, 1));
      drawHand(at, onString, on, (on === onA ? fullPole : setPole).clone().lerp(reloadPole, 1 - on), dt, on === onA ? lastTilt * onA : 0, true, RELOAD_V);
      // the arrow in the fingers from the quiver to the string
      if (e >= QUIVER) { holdArrow(mouthW, smooth(clamp((e - OUT) / (NOCKED - OUT), 0, 1)), lineDir); pinch = 1; }
      hk = after < FOLLOW ? 1 - smooth(after / FOLLOW) : 0.2;
    }
    if (loose > 0.001) {
      j.shoulderR.quaternion.slerp(fk[0], loose); j.elbowR.quaternion.slerp(fk[1], loose); j.handR.quaternion.slerp(fk[2], loose);
      // (the gestures' and the draught's arm brought within its ranges, the hand where they put it)
      if (!fp) { updateJoints(root); fitArm(j, false, undefined, body); }
    }
    hook(handR, hk, pinch);
    // (the draught's fist over the hook: the draw hand has let go of the string)
    if (flaskOut > 0.01) holdFlask(handR, flask, flaskOut);
    j.chest.worldToLocal(j.handR.getWorldPosition(lastHandC));
    // the coat's skirt last: over the legs, and behind the hands and the bow where they are now (through the eyes neither shows)
    // (all of him, the meshes too: what reads them next, this frame's, finds them where they were always found)
    root.updateMatrixWorld(true);
    legBodies.place(hem);
    if (!fp) { if (hasBow) stringOffThigh(); handBodies.place(hem); bowBodies.place(hem); arrowBodies.place(hem); }
    const outer = fp ? [] : !hasBow ? handBodies.list : bow.arrows[0].visible ? outsideNocked : outside;
    // (through the eyes the body isn't drawn, nor its shadow, a layer the camera and the lights don't see: the coat swings
    // undraped, a tenth of the cost)
    tunic.update(-j.thighL.rotation.x, -j.thighR.rotation.x, st.move, st.t, dt, fp ? undefined : legBodies.list, outer);
    bendShoulders();
  }
  /** each shoulder's part-turned joints (`SetInShoulders.bend`), and each wrist's (`blendTurn`) */
  function bendShoulders(): void {
    for (let i = 0; i < 2; i++) {
      const h = i ? j.handR : j.handL;
      wrists[i].forEach((d, q) => { blendTurn(d.quaternion, h.quaternion, (q + 1) / 4, wristMiddles[i]); d.position.copy(h.position); });
    }
    sets.bend();
  }
  return {
    root, kit, joints: j, hands: { L: handL, R: handR }, animate, tip, weaponTip: limbTip, palm, arrowHead, height: 2,
    // (the coat, its hem and the hat's felt: his green)
    dye: new Dye('green').cloth(coat, coatHem, felt),
    firstPerson(on) { fp = on; }, reset() { legs.reset(); aimT = 0; raise = 0; strung = 0; fetchFrom = -1; kHook = -1; stowT = -1; },
    setGear(gear) { hasBow = !!gear.weapon; bow.group.visible = hasBow; cap.visible = gear.helm; showHair(head.hair.slice(1), !gear.helm); glows.set(gear); },
    dispose() { kit.dispose(); disposeGeometries(root, arrowGeometry()); },
  };
}
