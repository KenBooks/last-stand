// The Warrior: a bare-headed veteran in an engraved breastplate over layered leather, fur at the collar,
// cuffs and boot tops, crossed straps, a mail skirt between leather tassets, engraved knee cops and tall
// strapped boots. Carries the equipped weapon and shield, and wears only the armour
// equipped: without a chest item the quilted gambeson, trousers and boots under it, without a hands item
// bare hands below the gambeson's sleeves. Fully procedural.
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { leather as leatherMaps, mail as mailMaps, cloth as clothMaps, steel as steelMaps, fur as furMaps, wood as woodMaps, pbrMaterialMaps } from '../../core/textures';
import { engravedSteel, projectUV, steelRegion } from '../../core/engraving';
import { footToFloor, onFloor, restHands, satBy, sitPose, type RestTurn } from './sit';
import { buildHumanoid, joint, resetPose, walkCycle, idle, deathFall, pulse, ramp, reachArm, groundFeet, runShareOf, disposeGeometries } from './rig';
import { Sculpt, stripRig, limb, lathe } from './shapes';
import { buildTrousers, type TrouserCut } from './trousers';
import { ovalTube, wristBent, wristOf } from './wrist';
import { FurSway } from './furSway';
import { LegIK, IK } from './ik';
import { fitArm, solveArm, type ArmResult, recall, remembered, type ArmMemory } from './armIK';
import { bodyShape, clampWrist, GRIPPED_FLEXION } from './anatomy';
import { curve, PoseFade, type Keys } from './motion';
import { buildFlask, drink, drinkUp, holdFlask, DRINK_SHEATHED } from './flask';
import { taperTube, twist, plate, edgeTube, strap, belt, buckle, stud, disc, furTufts, furTuftsSteps, Skirt, SkirtLimbs, armOffThigh, merge, scaleUV, lod, type SurfaceFn, type JointPoint } from './armor';
import { headSteps, headFor, buildNeck, toGroup, handSkin, HEAD_MM, type HeadSpec } from './head';
import { NECKLINE_BACK, onTunic, tunicCutSteps, SetInShoulders, type ArmBlend } from './tunic';
import { buildHand, poseHand, hold, loosen, seat, fistReach, fistTurn, fistOn, gripTurn, bare, handCapsules, SLANT, fistLength } from './hands';
import { axe, greataxe, greatsword, mace, maul, sword, STRIKES_WITH, type WeaponMaterials } from './weapons';
import { clamp, lerp, mulberry, damp } from '../../util';
import { groundHeight } from '../../world/ground';
import { propTopAt, wallTopAt } from '../../world/collision';
import {
  fromEyes, dirFromEyes, intoEyes, dirIntoEyes, fromScreen, turnTowards, ViewFade,
} from '../viewModel';
import {
  cutTurnAt, swingAt, swingHeldAt, swingShoulder, swingShoulderAt, turnWithTrunk, type ArmBones, type ViewSwing,
} from '../viewSwing';
import { tunable } from '../../core/tuning';
import { FANGS } from '../../data/balance';
import { FIST, fistGuard, fistPunch, fistHammer, fistRampage, fistPounce, fistRush, fistWrath, fistLine } from './warriorFists';
import {
  TWO_REST, TWO_FORE_CUT, TWO_FORE_ROW, TWO_BACK_CUT, TWO_OUTS, twoRestOf, ONE_FORE_CUT, ONE_FORE_ROW, ONE_BACK_CUT, ONE_BACK_OUT,
  CUT_TURN, TWO_CUT_TURN, DUAL_CUT, DUAL_CUT_TURN,
  ONE_POWER,
  TWO_SPINS, TWO_POWERS, TWO_SMITES,
} from './warriorEyes';
import { built, type ModelSteps } from './steps';
import { Dye } from './dye';
import { ItemGlows } from './itemGlow';
import type { ActionState, AnimState, Blade, Fist, Gear, KeyedArm, LowerGrip, Model, SitHands, SitTurn, Struck } from '../../types';

/** sat, how a hand that holds a weapon turns as it goes down to his thigh (`models/sit.ts`, `restHands`), the left's
 *  and the right's, the weapon pointing down to where it's stood; an empty hand rests palm down. The small rise keeps
 *  his shield-side forearm over the thigh. */
/**
 * The pick-up by a fire, keyed whole: getting up, he steps to stand alongside what he laid down, squats, takes it in
 * both hands, lifts it before him and puts it on his shoulder. Each row of `keys` is one moment of it, his whole body
 * and the weapon at once, posed by hand (`npm run lab -- live hold`) and eased between by a monotone cubic
 * (`motion.ts`), where it was made of a dozen ramps each timed apart, whose in-betweens nobody posed (from play: "weapon
 * manipulation is very awkward near campfire"). The weapon is placed as keyed and his arms reach it; `PICK_COLUMNS`
 * says what each number is.
 */
const PICK_COLUMNS = [
  // (of his hands' stage getting up, 0 to 1)
  'k',
  // (how far turned and stepped to where he stands to take it up: alongside it, facing across it, `pickStance`)
  'stepped',
  // (his body: down (m), his hips back (m), his trunk bent forward and turned to his left (rad))
  'drop', 'back', 'lean', 'twist',
  // (of the weapon: how much it still lies where he laid it, 1 lying; and how much it goes with his right fist, 1, or
  // stays where it's keyed, 0, as his hand slides along it to take it again higher up)
  'lies', 'held',
  // (its handle's butt from his feet (m: to his right, up, ahead) and the way it points from there to its head)
  'buttRight', 'buttUp', 'buttAhead', 'wayLeft', 'wayUp', 'wayAhead',
  // (each fist up its handle from the butt (m), and how far on it each hand is, 1 holding it)
  'rightAlong', 'leftAlong', 'rightOn', 'leftOn',
  // (how far it's on his shoulder, as he carries it standing, and how far his head looks down at it (rad))
  'carry', 'look',
] as const;
type PickColumn = typeof PICK_COLUMNS[number];
const PICK = tunable('warriorPick', {
  keys: [
    // (the body's numbers read off a real squat pick-up, CMU's clip 69_70: `npm run lab -- live mocap`. The hips drop
    // 0.62 m and go 10 cm back, the trunk leans 0.54 going down and 0.37 at the bottom: guessed, he folded over at 1.2
    // with his hips high. The clip's 0.8 s down, 0.4 at the bottom and 0.6 up, with a step before and the shoulder
    // after, don't fit the 2.6 s of his hands' stage: shared out so nothing is hurried most, the tip-up the longest)
    // k   step drop back  lean twist lies held butt: right up  ahead  way: left up   ahead  along: R   L    on: R L  carry look
    0,     0,   0,    0,    0,    0,    1,   0,   0.3,  0.03, 0.33,  1,    0,    0,     0.12, 0.5,  0,   0,   0,   0,
    0.15,  1,   0,    0.02, 0.25, 0,    1,   0,   0.3,  0.03, 0.33,  1,    0,    0,     0.12, 0.5,  0,   0,   0,   0.3,
    0.26,  1,   0.3,  0.11, 0.5,  0,    1,   0,   0.3,  0.03, 0.33,  1,    0,    0,     0.12, 0.5,  0.5, 0.2, 0,   0.15,
    // (the clip's chest up at the bottom, his hips lower to reach the floor: leaned over 0.75 to reach it, he folded
    // over his knees, his head down to them, from review; his right hand on it, then his left)
    0.37,  1,   0.66, 0.08, 0.55, 0,    1,   0,   0.3,  0.03, 0.33,  1,    0,    0,     0.15, 0.5,  1,   0.6, 0,   0.1,
    0.45,  1,   0.66, 0.08, 0.55, 0,    1,   0,   0.3,  0.03, 0.33,  1,    0,    0,     0.15, 0.5,  1,   1,   0,   0.1,
    // (its head tipped up off the floor, its butt left on it to turn about, as a heavy tool is taken up: leaning out
    // to his right, clear of his face, where it stood up before his face from ahead of him on 50 frames. Over a tenth
    // of the stage its head went 40 cm a frame)
    0.6,   1,   0.55, 0.08, 0.5,  0,    0,   1,   0.3,  0.03, 0.33,  -0.15, 0.95, 0.15,  0.3,  0.6,  1,   1,   0,   0.05,
    // (his legs drive him up, the haft upright at his right side, its butt by his knee)
    0.74,  1,   0.03, 0,    0.15, 0,    0,   1,   0.25, 0.45, 0.3,   -0.05, 1,    0.05,  0.3,  0.6,  1,   1,   0,   -0.05,
    // (held still by both hands while his right one slides up it at his side, never across his chest: on his shoulder
    // his right fist is 88 cm up it, near its head; slid up before his chest, his forearm went 22 cm into it)
    0.82,  1,   0,    0,    0.05, 0,    0,   0,   0.25, 0.45, 0.3,   -0.05, 1,    0.05,  0.85, 0.6,  1,   1,   0,   0,
    // (tipped back over his right shoulder over the rest, its butt coming forward, both hands on it until it's there:
    // tipped over a tenth, it swung from upright to over his shoulder at once, from review)
    0.91,  1,   0,    0,    0.03, 0,    0,   1,   0.15, 0.6,  0.45,  -0.12, 0.92, -0.25, 0.86, 0.6,  1,   1,   0.35, 0,
    1,     1,   0,    0,    0,    0,    0,   1,   0.03, 0.79, 0.89,  -0.26, 0.67, -0.7, 0.88, 0.5,  1,   0,   1,   0,
  ],
}, { keys: PICK_COLUMNS.length }, { keys: PICK_COLUMNS });
/** The value of one of the pick-up's columns at `k` of it, eased between its keys. */
const pickKeys = { from: [] as number[], columns: new Map<PickColumn, Keys>() };
function pickAt(column: PickColumn, k: number): number {
  const keys = PICK.keys, row = PICK_COLUMNS.length;
  // (made again when a number changes: tuned, the list is changed in place)
  if (keys.length !== pickKeys.from.length || keys.some((value, i) => value !== pickKeys.from[i])) {
    pickKeys.from = [...keys];
    pickKeys.columns.clear();
    PICK_COLUMNS.forEach((name, c) => {
      const pairs: [number, number][] = [];
      for (let r = 0; r + row <= keys.length; r += row) pairs.push([keys[r], keys[r + c]]);
      pickKeys.columns.set(name, pairs);
    });
  }
  return curve(pickKeys.columns.get(column)!, k);
}

const SIT_HANDS = tunable('warriorSit', { roll: [0, 0], rise: 0.005, slant: 0.1, along: 0.35, over: 0.09, armIn: 1, floorIn: 0.7, arc: 0.15, lapR: [0.85, -0.1, 0.5], fistBelow: 0.08, swordRest: [-0.03, -0.32, -0.5, 0.05, 0.3, 0.12, 0, 1.08, 0.2], maulRest: [0.05, 0.05, -0.58, 0.1, 0.25, 0.7, -0.4, 0.93, 0.32], axeRest: [-0.01, 0.13, -0.54, 0.1, 0.25, 0.5, -0.4, 0.95, 0.32], stuckIn: 0.32, plantX: -0.4, plantPole: [-0.5, -1, -0.6], flatEdge: [-1, 0, 0], frontAt: [-0.12, 1.34, 0.38], frontWay: [-0.05, 0.6, 0.8], leanTo: 0.12, regripOpen: 0.7, leanDraws: 0.4, flatSide: [1, 0, 0], lowHand: [-0.14, 0.54], lowEndX: -0.45, pathOut: 0.25, besideFrom: 0.6, besideBy: 0.35, handDownBy: 0.7, offOpen: 0.75, floorFrontAt: [-0.2, 1.05, 0.35], floorFrontWay: [-0.9, 0.35, 0.25], floorFlat: [0.25, 0.25, 0.9], floorLowHand: [-0.35, 0.25], floorLowY: 0.58, floorCrouch: [0.22, 0.08, 0.22], floorHaftAhead: 0.13, floorOut: [-0.6, 0.8], floorLowOut: [-0.8, 0.6], floorPathOut: 0, floorPathAhead: 0.18, floorGripY: 0.04, floorGripZ: 0.2, floorLaidFlat: [0, -1, 0], liftBy: 0.34, floorLiftBy: 0.42, floorTurnIn: 0.88, floorFistFromButt: 0.12, floorHandsApart: 0.38, floorStandOff: 0.27, floorPickFist: [0.15, 0.8, 0.3], floorPickTilt: [0.6, 0.55], floorHeadHeld: 0.25, floorShoulderAt: 0.2, floorTakeFrom: 0.9, floorTakeBy: 0.8, floorPickFrom: 0.75, floorPickCrouch: [0.22, 0.22, 0.85], floorPickDownFrom: 0.97, lowerBy: 0.72, helpFrom: 0.02, helpBy: 0.14, helpOff: 0.4, floorLetGo: 0.85, plantFrom: 0.15, plantBy: 0.8, lowerOver: 0.04, caneAhead: [0.1, -0.25, 1], seatHip: 0.86, sinkBy: 1, leftAbove: -0.13, beside: [-0.5, 0.09, 0.1], besidePole: [-1, -0.1, -0.2], besideAhead: 0.95, twoR: [0.8, -0.08, 0.6], twoL: [-0.8, -0.2, 0.6], twoAlong: [0, 0], twoOverL: 0.09, viaR: [-0.15, 0.2, 0.95], viaL: [0.15, 0.2, 0.95], viaAt: 0.45, floorBack: 0, viaFloorR: [-0.15, 0.5, 0.85], viaFloorL: [0.15, 0.5, 0.85], kneesR: [0.88, -0.2, 0.42], kneesL: [-0.7, -0.3, 0.65], turnFrom: 0.15, turnLate: 0.5, turnIn: 0.12, shieldOut: 0.09, upLeftAbove: 0.22, upLeftFrom: 0.42, upPlantFrom: 0.55, upPlantBy: 0.75, plantLetGo: 0.8, upWay: [-0.08, 0.99, 0.02], upRestAt: [-0.35, -0.15, 0.62], upLeanWay: [-0.1, 0.95, 0.25], upLeanFrom: 0.6, upSlipFrom: 0.25, upSlipBy: 0.6, upTurn: [0.3, -0.9, 0.2], upButt: 0.56, floorShieldOut: 0.12, floorShieldLow: 0.14, edgeDown: 0.2, });
const _sitTurn: RestTurn = { roll: [0, 0], bend: [0, 0], along: [0, 0], over: [0, 0], armIn: [0, 0], arc: [0, 0], out: [0, 0], low: [0, 0] };
const _lifted: number[] = [], _resting: number[] = [];

const ZERO = new THREE.Vector3(), _v = new THREE.Vector3(), _fa = new THREE.Vector3();
/** the actions that strike with the weapons (Rending Cleave, Power Strike, Thunder Crescent, Steel Tempest, Twin Fangs):
 *  their weapons leave a trail as they swing (`swung`); Bull Rush strikes with the body */
const STRIKES = new Set(['swing', 'chop', 'smite', 'spin', 'flurry']);
/** a held weapon: its tip along the grip, and where the left hand holds it (two-handers) */
/** his trousers' cut (models/trousers.ts): a fighter's hips and thighs under the hide, tucked into the boots under their fur */
const TROUSERS: TrouserCut = {
  top: 0.13, waistW: 0.132, waistD: 0.108, hipW: 0.204, front: 0.106, seat: 0.138, crotch: -0.115,
  thigh: 0.108, knee: 0.075, calf: 0.071, ankle: 0.045, tuck: 0.1, folds: 0.004,
};
interface Weapon { group: THREE.Group; len: number; off: number | null; /** the grip's radius, for the fingers */ r: number; /** its striking part along the grip, from and to (m: a blade from its lower third to its point, a head's ends), which a swing's trail follows */ edge: readonly [number, number]; /** worn on the belt: the point along it that sits in the frog, and whether it hangs blade down (a sword, from its guard) or head up (an axe or mace, its haft through the ring) */ hang?: { at: number; down: boolean } }
/** the grip turns the weapon's +Y forward and a little up out of the bent arm */
const GRIP = Math.PI / 2 + 0.7;
/** straightens the weapon along the arm, for swings that trace the damage arc */
const ALONG_ARM = Math.PI - GRIP;
/** how far a weapon arm swings at a run (rad), and the share of it the wrist turns back so the blade stays put */
const ARM_SWING = 0.4, WRIST = 0.8;
/** at a run (rig.ts `walkCycle`'s `pump`): how far a weapon arm pumps as a runner's free arm does, and a shield arm
 *  (the shield's weight and breadth: it is carried bent at the side); how much further each is bent at the elbow
 *  (rad), and the share of `WRIST` a weapon's wrist holds it against the forearm's swing with. A blade held thumb up
 *  tilts only as far as the wrist bends sideways: pumped as far as a free arm, low at the back of the swing, it
 *  pointed ahead at the hip and the arm's solve took the elbow forward to keep the wrist within its range, so the
 *  weapon hand is held higher, bent past a right angle, and pumps less */
const RUN_PUMP = 0.5, RUN_SHIELD_PUMP = 0.25, RUN_BEND = 0.85, RUN_SHIELD_BEND = 0.45, RUN_WRIST = 0.5;
/** and how much of the forearm's swing a weapon arm's elbow takes up at a run, the forearm kept near level so its
 *  blade stays up: swung with the arm, the blade pointed 45 degrees ahead at the back of the swing, and cocked back at
 *  the wrist instead, past the wrist's sideways range, the arm's solve held the arm forward */
const RUN_LEVEL = 0.7;
/** a two-hander carried at a run at high port, in the chest's own frame (rig units): the right hand's grip before the
 *  right of the chest, the weapon up past the right shoulder, tipped back and out, the right elbow down and out, the
 *  left hand on the lower grip below; the arms carried by the trunk's turn, not pumping. Held upright before the face
 *  in the right hand, as at a walk, the left let go of its grip out of reach and hung at the side */
const RUN_TWO_AT = new THREE.Vector3(-0.07, 0.14, 0.3), RUN_TWO_DIR = new THREE.Vector3(-0.15, 1, -0.28);
const RUN_TWO_POLE = new THREE.Vector3(-1, -1, -0.2);
/** a two-hander carried on the shoulder out of a fight, in the chest's own frame (rig units), as a person carries a
 *  heavy one: the upper arm hanging by the side, the forearm level ahead and rising a little, the weapon laid back
 *  from the fist up over the front of the shoulder, the wrist straight (the blade leaves a straight fist 130 degrees
 *  from the forearm, `GRIP`), the left hand let go of it and hanging. (Held before him in both hands at rest and
 *  walking, it was too heavy to carry so, #225; the fist before the shoulder bent the wrist back 60 degrees, and
 *  turned to lay the blade's flat on it, 84 sideways: a fist holds a flat along its palm.) Shouldered once he hasn't
 *  fought for `SHOULDER_AFTER` s, lifted onto it over `SHOULDER_LIFT` s, eased in and out (damped towards it, the lift
 *  set off at full speed: the axe's tip from still to 11 cm a frame); any move but a drink takes it off at once, the
 *  move's own fade bringing it down */
const SHOULDER_AT = new THREE.Vector3(-0.22, 0.14, 0.3), SHOULDER_DIR = new THREE.Vector3(0.06, 0.62, -0.78).normalize();
const SHOULDER_POLE = new THREE.Vector3(-0.2, -1, -0.3), SHOULDER_AFTER = 2, SHOULDER_LIFT = 0.6;
/** a move begun from the shoulder carry fades in over this long (s) */
const OFF_SHOULDER = 0.3;
const _backQ = new THREE.Quaternion(), _backDir = new THREE.Vector3(), _backFlat = new THREE.Vector3();
const _backPole = new THREE.Vector3();
/** Through the eyes (tuned live in a dev build, `--tune warriorEyes.shoulder=...`): the right arm's shoulder in the
 *  view (camera space, m: x right, y up, -z ahead; the left's mirrors it), low beside the camera, as a game's
 *  first-person arms come up from the screen's bottom corners; where a two-hander's right elbow points (`pole`, the
 *  chest's frame: its guard and its moves are swings, models/warriorEyes.ts);
 *  and a one-hander at rest (`oneOn`, its grip's place on the screen, `fromScreen`: across and up from the middle to
 *  the edges and metres ahead, its fist at the bottom right corner, mostly below the frame, as Vermintide 2's are;
 *  `oneDir`, its way, leaning out and away to the frame's right edge, its head a quarter of the way down it, as
 *  Vermintide 2's axe (`lab match --fit`; upright, its head ran out of the frame's top, 53% of an axe's and 32% of a
 *  mace's seen); a second blade's mirrors it), held from
 *  shoulders of their own (`oneShoulder`); and how far
 *  a fist may turn about its handle (rad, `roll`) for its arm to keep within a body's ranges, and what each degree of
 *  its wrist's bend costs it (armIK's `wristW`, `wrist`) (`fitInView`); a two-hander's right arm on a swing its hands
 *  place fitted as `fitHeld` says (`held`: how many degrees of excess its pole is worth, how far its elbow may move in
 *  a frame, the rig's units, none at 0, whether its shoulder girdle may move, and what each degree of the shoulder's
 *  excess and of the wrist's bend costs, armIK's `keep`, `maxMove`, `girdle`, `shoulderW`, `wristW`); and the field
 *  of view the arms and weapons
 *  are drawn with (`fov`, vertical degrees: a camera of their own, renderer.ts `drawArms`, narrower than the world's
 *  66 as a game's first-person weapon's), and how much larger the hands are drawn there (`hand`, times `HAND_K`: a
 *  first-person fist is drawn large, as Vermintide 2's are); and a one-hander held out through Steel Tempest's spin
 *  (`spinOn`, `spinDir`, `spinFlat`, as `oneOn`'s: out to the side at the hip, the blade out and down, its flat up
 *  so its edge leads the turn), carried round as the body turns (`carryRound`): under the frame as it comes past
 *  the eyes, its head glimpsed at the bottom edge (come round 2.4 times a second, held across the view, the steel lit
 *  the crypt's lower right 3 times a second, a flash hazard: lab cast) */
const EYES = tunable('warriorEyes', {
  shoulder: [0.22, -0.46, -0.25], pole: [-1, -0.3, 0.3],
  oneOn: [0.58, -1.3, 0.6], oneDir: [0.43, 0.5, -0.39], bladeOn: [0.6, -0.42, 0.8], bladeDir: [0.62, 1, -0.5],
  bladeFlat: [-0.45, 0, 0.9], oneFlat: [-1, 0, 0.2],
  spinOn: [0.75, -3.2, 0.42], spinDir: [0.9, -0.35, -0.3], spinFlat: [-0.35, 0.9, 0],
  oneShoulder: [0.3, -0.4, 0.08], roll: 1.2, wrist: 1, fov: 45, hand: 1.35, held: [8, 0, 1, 0, 0],
});
/** the hands' scale (`buildHand`'s `k`) */
const HAND_K = 1.08;
const _er = new THREE.Vector3(), _ed = new THREE.Vector3(), _ef = new THREE.Vector3(), _tf = new THREE.Vector3();
const _rf = new THREE.Vector3(), _lf = new THREE.Vector3();
/** the way a move through the eyes turns each one-hander's flat (the right's, the left's), and where a swing puts each
 *  elbow (the view's, from the shoulder: viewSwing.ts `swingAt`) */
const _mr = new THREE.Vector3(), _ml = new THREE.Vector3(), _pr = new THREE.Vector3(), _pl = new THREE.Vector3();
/** and a two-hander's guard's elbow (`TWO_REST`) */
const _pe = new THREE.Vector3();
const _bones: ArmBones = { upper: 0, fore: 0, hand: 0, strike: 0 }, _ti = new THREE.Matrix4();
/** where along a weapon its blow lands, a share of its length from the grip (a blade's centre of percussion, its tip's
 *  third): what a swing through the eyes lands on the aim */
const STRIKES_AT = 0.75;
/** each one's elbow as a reach's pole (`swingPole`), and the arm's joints as placed before a fit (`fitInView`) */
const _qr = new THREE.Vector3(), _ql = new THREE.Vector3(), _sr = new THREE.Vector3(), _sl = new THREE.Vector3();
/** where the chest turns under the eyes: the spine, between the shoulders (in the view, as far down and ahead as the
 *  shoulder `s` is) */
const _sp = new THREE.Vector3();
/** a two-hander's own right shoulder under a swing its hands place (`ViewSwing.holds`) */
const _so = new THREE.Vector3();
const spineUnder = (s: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 => out.set(0, s.y, s.z);
/** an ease in and out over 0..1 */
const smooth = (x: number): number => x * x * (3 - 2 * x);
const _fitQ = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
/** `to` turned over, if `w` strikes with either of its sides (a sword's two edges, a maul's two faces), onto the side
 *  of `from` it faces: a move's flat taken from a rest's goes the short way round, never through the handle's line
 *  (an axe's bit has one side, and keeps it) */
function sameSide(w: Weapon, from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3 {
  if (STRIKES_WITH[w.group.name] !== 'bit' && from.dot(to) < 0) to.negate();
  return to;
}
/** a one-hander's rest through the eyes, into `on`, `way` and the way its flat faces (`flat`), and returns how much of
 *  the way that turns it: a sword's (`bladeOn`, `bladeDir`: its hilt and the fist in the corner, the blade up to the
 *  top right, as Vermintide 2's sword; `bladeFlat`, turned on its length so it's seen narrow, as that one is: face on,
 *  it was twice as wide) or a hafted weapon's (`oneOn`, `oneDir`: the fist below the frame, the haft in over its bottom
 *  edge, the head at the right, as its axe; `oneFlat`, its head broadside, the bit towards the middle, as that one's:
 *  left to the fist's own turn, the axe's head was seen edge on, the haft alone) */
function oneRest(w: Weapon, on: THREE.Vector3, way: THREE.Vector3, flat: THREE.Vector3): number {
  const blade = !!w.hang?.down;
  fromScreen(blade ? EYES.bladeOn : EYES.oneOn, on);
  way.fromArray(blade ? EYES.bladeDir : EYES.oneDir).normalize();
  flat.fromArray(blade ? EYES.bladeFlat : EYES.oneFlat).normalize();
  return 1;
}
/** A one-hander's hold through Steel Tempest's spin, as `oneRest` (its place, way and flat in the view as the body
 *  faces ahead: carried round from there). */
function spinRest(_w: Weapon, on: THREE.Vector3, way: THREE.Vector3, flat: THREE.Vector3): number {
  fromScreen(EYES.spinOn, on);
  way.fromArray(EYES.spinDir).normalize();
  flat.fromArray(EYES.spinFlat).normalize();
  return 1;
}
const _fw = [0, 1, 2, 3, 4, 5].map(() => new THREE.Vector3()), _fwq = new THREE.Quaternion();
/** a held swing's fit blended back to the arm as posed (`fitHeld`): the elbows, the target, the hand joint's turns */
const _hb = [0, 1, 2].map(() => new THREE.Vector3()), _hbq = [new THREE.Quaternion(), new THREE.Quaternion()];
/** how long the left hand takes to come onto the lower grip as a two-hander comes off the shoulder (s): in 0.15 s,
 *  reaching for a haft already on its way up to Power Strike's raise, it went 28 cm in a frame */
const TAKE_HOLD = 0.35;
/** the way a shouldered weapon's flat faces, in the chest's frame: sideways, as a straight fist holds it, palm in and
 *  thumb up (left to the turn the weapon was in before, the wrist stopped at its range with the blade upright) */
const SHOULDER_FLAT = new THREE.Vector3(1, 0, 0);
/** a weapon's flat, in its grip's frame: every weapon is built with its blade's width along its own x, and mounted a
 *  quarter turn about the grip (`MOUNT`), so its flat lies along the palm */
const FLAT_IN_GRIP = new THREE.Vector3(1, 0, 0);
const _hp = new THREE.Vector3(), _hd = new THREE.Vector3();
const _grip = new THREE.Vector3(), _pole = new THREE.Vector3(1, -0.7, -0.6), _pw = new THREE.Vector3(), _fq = new THREE.Quaternion(), _cq = new THREE.Quaternion(), _eq = new THREE.Quaternion(), _wq = new THREE.Quaternion(), _vl = new THREE.Quaternion(), _vr = new THREE.Quaternion();
const _letW = new THREE.Vector3(), _letQ = new THREE.Quaternion(), _letP = new THREE.Vector3(), _letS = new THREE.Vector3();
const _gw = new THREE.Vector3(), _dw = new THREE.Vector3(), _cur = new THREE.Vector3(), _hq = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _sq = new THREE.Quaternion();
/** the legs' own blend over the pose this frame (left, right), see `legs.update` */
const _legW: [number, number] = [1, 1];
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const IDENT = new THREE.Quaternion(), _up = new THREE.Vector3();
const _ra = new THREE.Vector3(), _rd = new THREE.Vector3(), _la = new THREE.Vector3(), _ld = new THREE.Vector3();
const _gs1 = new THREE.Vector3(), _gs2 = new THREE.Vector3(), _gs3 = new THREE.Vector3(), _gsq = new THREE.Quaternion();
/** a weapon's points that can be its lowest, in its group's frame: each corner of its surface once */
const LOW_POINTS = new WeakMap<Weapon, THREE.Vector3[]>();

/** `w`'s points that can be its lowest (worked out the first time they're needed) */
function lowPoints(w: Weapon): THREE.Vector3[] {
  let points = LOW_POINTS.get(w);
  if (points) return points;
  points = [];
  const seen = new Set<string>(), into = new THREE.Matrix4(), p = new THREE.Vector3();
  w.group.updateWorldMatrix(true, true);
  const from = w.group.matrixWorld.clone().invert();
  w.group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    into.multiplyMatrices(from, mesh.matrixWorld);
    const at = mesh.geometry.attributes.position;
    for (let i = 0; i < at.count; i++) {
      p.fromBufferAttribute(at, i).applyMatrix4(into);
      // (to the millimetre: a surface's triangles share their corners)
      const key = `${Math.round(p.x * 1e3)},${Math.round(p.y * 1e3)},${Math.round(p.z * 1e3)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      points!.push(p.clone());
    }
  });
  LOW_POINTS.set(w, points);
  return points;
}
const _hw1 = new THREE.Vector3(), _hw2 = new THREE.Vector3(), _hw3 = new THREE.Vector3(), _hw4 = new THREE.Vector3();
/** `rollFlat`'s: the flat as it is and as it's wanted, across the weapon, their cross, and the roll between them */
const _fn = new THREE.Vector3(), _ft = new THREE.Vector3(), _fc = new THREE.Vector3(), _fr = new THREE.Quaternion();
const SHIELD_SIDE = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
const SHIELD_FRONT = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
const SIDE_POS = new THREE.Vector3(0.07, -0.02, 0), FRONT_POS = new THREE.Vector3(0, -0.1, 0);
const HALF_ROUND = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const sm = (a: number, b: number, x: number): number => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// --- the basic swing (third person), keyed over the cast. The tip goes round in units of half the arc
// (-1 wound to the start side, +1 at the far side): it winds, loads a little deeper, crosses the arc from
// the cast's landing (0.55) to 0.85 and carries on past it. The body leads it:
// the hips turn first, then the spine and chest, the arm and wrist come last.
/** where the feet stand (left x, z, turn, then right), rig units: at rest, fighting, Power Strike's step in, behind the shield */
/** a move's end held a moment after its cast is over (seconds), so a short cast's blow or throw is seen, then how long it takes to ease back to the stance */
const TAIL: Record<string, number> = { chop: 0.3, smite: 0.3, buff: 0.55, flurry: 0.15, wrath: 0.2 }, TAIL_OUT: Record<string, number> = { chop: 0.55, smite: 0.5, buff: 0.6, flurry: 0.35, wrath: 0.4 };
/** both hands empty (models/warriorFists.ts): how long after a move the fists stay up in their guard (s), and the
 *  moves that alternate hands, a weapon's cut and a punch */
const FISTS_UP = 4;
/** both hands empty, moving: how far the hands close (of a fist) and how far the wrists let them hang (rad) */
const WALK_FIST = 0.45, WALK_DROOP = 0.3;
/** and how much further the elbows bend as he moves (rad: to about 45 degrees, the owner's "bend elbows a tiny bit
 *  more, like 45 degress"; hanging at 20 to 30 they read as stiff) */
const WALK_BEND = 0.35;
/** both hands empty: how much of a runner's pump his arms have at a run (of 1: bent near a right angle) */
const BARE_PUMP = 0.12;
const alternates = (name: string | undefined): boolean => name === 'swing' || name === 'punch';
/** both hands empty: the moves with the hands shut as fists */
const FISTED = new Set(['punch', 'rampage', 'pounce', 'bloodrush', 'wrath', 'block']);
/** Through the eyes, a cut's end held this long (s) for another attack to follow it, the way back to rest after it
 *  (s), and a cut begun within the hold the next of a row: the other way round, from where the last left the blade;
 *  one after it, the first again (each turned the other way from the last, whatever the pause, an attack out of the
 *  rest swung left to right; and the arms went back to rest as each cut ended: "strikes feel fake and having no
 *  momentum") */
const SWING_HOLD = 0.7, SWING_OUT = 0.4;
/** Through the eyes, a two-hander's way back to its guard from where a cut's held end left it (s): keyed as a swing
 *  from there, its plane turned into the guard's (`TWO_OUTS`), then the guard faded in from its end (`OUT_REST`).
 *  (Faded straight there, the grip went straight across, the fist turned on its own, and the right wrist bent 11 to
 *  18 degrees past its range and the left shoulder 22.) And a one-hander's after its backhand, keyed so to where a
 *  forehand from rest starts (`ONE_BACK_OUT`) */
const TWO_OUT = 0.45, ONE_OUT = 0.3, OUT_REST = 0.2;
/** Through the eyes, how long a dual wielder's cut takes to come from where its hand was, and its other hand to go
 *  back to rest from where its own cut left it (s) */
const DUAL_BEGIN = 0.08, DUAL_BACK = 0.22;
/** Through the eyes, how long a one-hander takes back to its rest out of Steel Tempest's spin (s): a body settling out
 *  of a second's spin, slower than out of a cut (as fast, 0.3 s, its blade swept up through the view at 15 m/s, as
 *  fast as a blow and unlit, after the trail) */
const SPIN_BACK = 0.45;
/** and how long a two-hander takes from its guard into its hold through the spin (s, `TWO_SPINS`: down from upright
 *  as the body turns; as fast as a cut's fade, 0.14 s, it went at twice the spin's speed, its flat leading) */
const SPIN_INTO = 0.45;
/** Through the eyes, how far below its rest a one-handed weapon's hand going back to it from a cut aims as it starts
 *  (m, and how far its weapon is turned down, rad): a fade's straight line taken down under the frame, by as much
 *  less as it's come (a quarter of it halfway). Faded straight from where a dual wielder's cut left it, low on the far
 *  side, its blade stood up across the middle of the view as the other hand cut; its way alone turned down, off its
 *  flat, the fade flipped the blade over in a frame, 51 m/s */
const BACK_DIP = [0.6, 1.4] as const;
/** how much of Power Strike's way back is still to come as its hands rise out from under the frame: before, out to
 *  their rests and up at once, each blade rose tip first from the middle, and a dual wielder's left one, lit by the
 *  strike's own light, glinted where its hand had swept down and the ground had glowed: three flashes in a second
 *  there (lab `cast powerStrike --gear dual --views first`) */
const POWER_RISE = 0.5;
const _dipAxis = new THREE.Vector3();
/** A one-handed rest (`at`, the weapon's way `dir`, its flat `flat`) for a hand going back to it with `fading` of
 *  its last place still held: aimed below it by that much, the weapon turned down with its flat (`BACK_DIP`). */
function dipUnder(at: THREE.Vector3, dir: THREE.Vector3, flat: THREE.Vector3, fading: number): void {
  at.y -= BACK_DIP[0] * fading;
  _dipAxis.set(dir.z, 0, -dir.x);
  if (_dipAxis.lengthSq() < 1e-6) return;
  _dipAxis.normalize();
  dir.applyAxisAngle(_dipAxis, BACK_DIP[1] * fading);
  flat.applyAxisAngle(_dipAxis, BACK_DIP[1] * fading);
}
/** a blade's turn in the fist about its own length (third person): its flats along the palm, its edge (an axe's bit) out over the knuckles, as a real one is held */
const MOUNT = -Math.PI / 2;
const REST_FEET = [0.13, 0.09, 0.15, -0.14, -0.1, -0.55], FIGHT_FEET = [0.13, 0.22, 0.15, -0.14, -0.15, -0.55];
/** Twin Fangs as the skill times it (data/balance `FANGS`, as tuned): the shares of it that are the lunge and that its
 *  blades strike at, the right's and the left's (each cut's start; through the eyes, where it crosses the aim), and
 *  halfway between them, where the left takes over */
function fangShares(): { lunge: number; hits: [number, number]; between: number } {
  const all = FANGS.lunge + FANGS.hold, hits: [number, number] = [FANGS.first / all, (FANGS.first + FANGS.apart) / all];
  return { lunge: FANGS.lunge / all, hits, between: (hits[0] + hits[1]) / 2 };
}
/** the lunge stance after it, and how much of it each blade's cut down takes */
const FANG_FEET = [0.13, 0.34, 0.1, -0.15, -0.25, -0.5], FANG_DOWN = 0.22;
/** and through the eyes: how much of it each one's cut takes (`DUAL_CUT`, a dual wielder's), how much of it the first
 *  comes back to rest over as the second cuts, and how much of its cut each fades in over from rest (over 0.15 of it,
 *  with the strikes 0.15 s apart, an axe's and a mace's head jumped 21 cm in a frame as the right one began) */
const FANG_EYES = tunable('warriorFangs', { cut: 0.45, back: 0.18, in: 0.4 });
const BRACE_FEET = [0.13, 0.2, 0.1, -0.15, -0.3, -0.4], SKID_FEET = [0.18, 0.3, 0.2, -0.17, -0.12, -0.5];
/** a blocked blow's jolt: the share of it it's driven in over, and through the eyes how much of it the arm takes */
const JOLT_IN = 0.2, FP_JOLT = 0.4;
/** A blocked blow's jolt through the body and the shield arm, by how far through it is (`st.blockHit`: 1 as the blow
 *  lands, 0 a quarter second later): driven in over its first fifth and given back over the rest, and through the
 *  eyes, the shield a hand off them, `FP_JOLT` of it. (Taken in a frame, the shield jumped; and through the eyes its
 *  rim crossed a quarter of the view at each blow, with four foes at it three times a second in the forest, lab
 *  `cast raiseShield --gear shield --views first`.) */
function joltOf(blockHit: number, fp: boolean): number {
  const u = 1 - blockHit;
  return smooth(ramp(u, 0, JOLT_IN)) * (1 - smooth(ramp(u, JOLT_IN, 1))) * (fp ? FP_JOLT : 1);
}
const WIDE_FEET = [0.2, 0.08, 0.35, -0.2, -0.06, -0.45];
const CHOP_FEET = [0.12, 0.36, 0.1, -0.15, -0.2, -0.6], GUARD_FEET = [0.13, 0.26, 0.3, -0.13, -0.2, -0.7];
const SW_TIP: Keys = [[0, -1.3], [0.3, -1.25], [0.5, -1.35], [0.55, -1], [0.85, 1], [0.95, 1.3], [1, 1.35]];
/** the upper arm's pitch: raised as it winds, level through the blow, dropping as it carries on */
const SW_PITCH: Keys = [[0, -1.3], [0.45, -1.45], [0.58, -1.35], [0.72, -1.2], [0.88, -0.95], [1, -0.75]];
/** the elbow: cocked, thrown straight into the blow, giving a little after it */
const SW_ELBOW: Keys = [[0, -1.0], [0.45, -1.25], [0.62, -0.15], [0.8, -0.1], [1, -0.55]];
/** the wrist: cocked back, then snapped through so the blade leads the hand */
const SW_WRIST: Keys = [[0, 0.6], [0.48, 0.45], [0.62, 1], [1, 0.95]];
/** the pelvis: back onto the rear foot and loading as it winds, forward and down into the blow */
const SW_FWD: Keys = [[0, -0.02], [0.45, -0.05], [0.65, 0.06], [0.9, 0.08], [1, 0.06]];
const SW_DIP: Keys = [[0, -0.02], [0.45, -0.04], [0.66, -0.085], [1, -0.06]];
/** the trunk: drawn up as it winds, crunching over into the blow; the shoulders tipping from the high side to the low */
const SW_BEND: Keys = [[0, 0], [0.45, -0.06], [0.7, 0.16], [1, 0.18]];
/** the forearm's roll that leads a swing with the edge (rad): a forehand palm up, a backhand (share of it) palm down */
/** a one-hander at the ready (shoulder pitch, elbow, wrist, over the stance's arm): the forearm angled down and the
 *  wrist nearly straight, so the blade rises from the fist (the grip tips it forward of square to the hand, GRIP);
 *  a two-hander's (then the arm's turn in) held before the middle of the body, where the left hand reaches its lower grip */
const REST_ARM = [-0.35, 0.25, -0.5], REST_TWO = [-0.3, 0.2, -0.45, 0.4];
const SW_ROLL = Math.PI / 2, SW_BACK = 0.75, FANG_ROLL = -0.8;
/** a two-handed swing placed by the weapon in the chest's own frame, as a person swings one: both hands kept before
 *  the chest, round it by `SW2_ROUND` of the swing's turn (`SW_TIP`, rad), reaching out through the cut and drawn in
 *  at either end (`SW2_OUT`, `SW2_IN`, rig units: 38 cm out through it, the lower grip came 14 cm before the chest and
 *  the left arm let go of it), high by the shoulder at either end and low through the cut (`SW2_HIGH`, `SW2_LOW`);
 *  the blade leading them round (`SW2_LEAD` times their angle), rising `SW2_LEVEL` through the cut and `SW2_RISE`
 *  over the shoulder at either end (rad: a fist holds a blade near square to its forearm, so from the hands before
 *  the chest a level blade lay along the forearms, which no wrist bends to, and the arm's fit stood it upright and
 *  pulled the lower grip out of reach), the palm up on a forehand and down on a backhand so the edge leads; the
 *  trunk's turn sweeps it wide. (Keyed by the right arm's turns, the arm swung 90 degrees each way: the lower grip
 *  went out of the left arm's reach and back through the chest, and the left hand let go of it on every swing.) */
const SW2_ROUND = 0.75, SW2_OUT = 0.47, SW2_IN = 0.32, SW2_LOW = -0.12, SW2_HIGH = 0.15, SW2_LEAD = 2, SW2_LEVEL = 0.5, SW2_RISE = 0.9;
const SW2_POLE = new THREE.Vector3(-0.5, -1, -0.2);
/** the edge leads through the cut, and past it the wrists roll back over (the swing's turn, `SW_TIP`, rad: easing off
 *  from the first to none at the second). Led with the edge to the end of the follow-through, the forearm was asked to
 *  turn near the far side of its range, stopped at whichever end was nearer, and turned the hand over in a frame,
 *  178 degrees, as the swing ended */
const SW2_EDGE = [0.9, 1.3];
/** Steel Tempest with a two-hander, held as a person spins one, in the chest's frame: both hands low before the belly
 *  and a little to his right (trailing the hips, as the one-hander's arm), the arms reaching down and out, the blade
 *  out ahead and to his right, rising a little (a fist holds it near square to the forearm: see SW2_*), its edge
 *  leading the turn (he turns to his left: palm up, as a forehand's). (Spun in the right hand alone, the arms flung
 *  out to either side, the left hand let go of it.) */
const SPIN2_AT = new THREE.Vector3(-0.15, -0.2, 0.42), SPIN2_DIR = new THREE.Vector3(-0.5, 0.3, 0.8).normalize();
const SPIN2_FLAT = new THREE.Vector3(0, 1, 0);
const SW_TILT: Keys = [[0, 0.08], [0.45, 0.12], [0.7, -0.02], [1, -0.1]];

// --- Power Strike (third person), keyed over its 1.5s cast, the blow at 0.9 (the skill's fireAt): a step in
// as the weapon goes up, the body rising and arching back over the rear foot while the charge gathers (the
// knees loading), then everything thrown down onto the front foot, the trunk crunching over the blow
const PS_PITCH: Keys = [[0, -1.3], [0.25, -2.95], [0.86, -3.05], [0.9, -2.75], [0.95, -1.3], [0.975, -1.08], [1, -1.12]];
const PS_ELBOW: Keys = [[0, -0.35], [0.25, -0.55], [0.86, -0.7], [0.93, -0.15], [1, -0.12]];
const PS_BEND: Keys = [[0, 0], [0.25, -0.18], [0.86, -0.26], [0.9, -0.2], [0.95, 0.42], [0.975, 0.52], [1, 0.48]];
const PS_FWD: Keys = [[0, 0], [0.25, -0.05], [0.86, -0.08], [0.95, 0.13], [1, 0.14]];
const PS_DIP: Keys = [[0, 0], [0.25, 0.01], [0.86, -0.05], [0.9, -0.03], [0.96, -0.19], [0.98, -0.21], [1, -0.2]];
/** `PS_DIP`'s drop at the blow's end (m at a man's size) */
const PS_DIP_MOST = -0.2;
/** the hips open towards the weapon side as it rises and drive square into the blow */
const PS_HIPS: Keys = [[0, 0], [0.25, -0.15], [0.86, -0.22], [0.95, 0.1], [1, 0.08]];
/** a two-hander's Power Strike: the hands placed out before him as the blow lands (`holdAtFloor`) */
const PS_LAND = tunable('warriorPsLand', { from: 0.95, to: 0.99 });
/** a two-hander's way back to its guard keeps the weapon's turn as drawn longer than its grip's place: turned by
 *  `1 - (1 - e)^late` of the fade's weight `e` (`backToGuard`) */
const BACK_EASE = tunable('warriorBackEase', { late: 2.5 });
/** and stopped by what it meets from the top of its swing down (`groundStop`) */
const PS_FALL = [0.86, 0.88];

// --- Thunder Crescent (third person), keyed over its cast, the blow into the ground at 0.55 (the skill's fireAt): the
// great weapon swung up overhead as the weight goes back, a moment at the top, then driven down before him, the trunk
// crunching over it and the knees giving under it; the ground stops it (`groundStop`), and it stays there a moment
const SM_PITCH: Keys = [[0, -1.3], [0.34, -2.65], [0.42, -2.7], [0.5, -2], [0.55, -1.1], [0.62, -1.05], [1, -1.08]];
const SM_ELBOW: Keys = [[0, -0.55], [0.34, -0.65], [0.42, -0.65], [0.52, -0.3], [0.56, -0.2], [1, -0.25]];
const SM_BEND: Keys = [[0, 0], [0.34, -0.16], [0.42, -0.18], [0.5, 0.2], [0.56, 0.5], [0.64, 0.56], [1, 0.5]];
const SM_FWD: Keys = [[0, 0], [0.34, -0.05], [0.42, -0.06], [0.55, 0.12], [1, 0.13]];
const SM_DIP: Keys = [[0, 0], [0.34, 0.01], [0.42, 0], [0.55, -0.13], [0.62, -0.16], [1, -0.15]];
const SM_HIPS: Keys = [[0, 0], [0.34, -0.15], [0.42, -0.17], [0.55, 0.1], [1, 0.08]];
/** the weapon arm's turn in (a two-hander's): over the middle of the head as it's raised, less as it comes down before
 *  him (turned in as far, the arm swept across the body while still high, past what the shoulder allows there) */
const SM_YAW: Keys = [[0, 0.7], [0.42, 0.7], [0.5, 0.4], [1, 0.4]];
/** the blade in the upright plane ahead of him all through it (`aimAtFloor`), taken from the pose's own over the
 *  first of these shares of the cast: pointing this far up (rad over level ahead), up and back over his head as it's
 *  raised, then falling from there over these shares, faster as it comes, until it points at the floor */
const SM_TAKE = [0, 0.12], SM_FALL = [0.45, 0.55];
const SM_BLADE: Keys = [[0, 1.1], [0.34, 2], [0.42, 2.05]];
/** where the blow ends: from these shares of the cast the hands come to rest together before the middle of him */
const SM_LAND = [0.47, 0.55];
/** A blow driven into the ground ends standing, the hands before him, `ahead` of his feet, `side` to his right and
 *  `high` over the floor (m at a man's size), the elbows towards `pole` (chest's frame), and the weapon turned onto the
 *  floor in the fist (`aimAtFloor`), its blade upright and its head on the ground. (Bowed and crouched, with the
 *  elbows out and the fists slanted on the handle, the hands could tip it down themselves: the knees went past their
 *  ranges, the blade lay flat, 53 degrees off upright, and the left hand let go.) There, a little to his left, the
 *  elbows bent, the fist holds a weapon sloped onto the floor itself: at 0.6 ahead and 0.8 high the arm was near
 *  straight, the forearm along the weapon's way, the fist held it 55 cm over the floor and the floor's stop turned
 *  the arm down the rest, into the belly off a step; further out, the left hand let go of its grip. */
const GROUND = tunable('warriorGround', { ahead: 0.6, side: -0.08, high: 0.7, yaw: 0.3, pole: [-1, -0.6, -0.5] });
/** how far a one-hander's wrist turns its blade toward the arm as Power Strike lands (rad, of `ALONG_ARM`'s 50
 *  degrees): a fist gives 30 toward the little finger, and asked for the rest the forearm turned to its stop too,
 *  the elbow thrown out ("one handed weird elbow bent too"); the floor stop brings the blade down the rest */
const ONE_LAND_WRIST = 0.45;
const SM_POLE = new THREE.Vector3();
/** a blow's head swung down its arc (`landing`) in steps of this (rad), to straight down at the lowest, and the step
 *  it meets something in halved this many times */
const ARC_STEP = 0.05, ARC_LOWEST = -Math.PI / 2 + 0.02, ARC_HALVINGS = 5;
/** the floor's stop turned down only as far as leaves the weapon over the floor where it goes, found in this many
 *  halvings (`groundStop`), a point this far under it counted as on it (m) */
const STOP_ROUNDS = 8, STOP_TOUCH = 0.005;
/** the floor's stop lifts in steps of this (rad) for the least that leaves the weapon clear (`leastLift`) */
const LIFT_STEP = 0.08;
/** a blow lifted this far (rad) off something high before it reached the floor stops there (`chopStuck`) */
const STUCK_LIFT = 0.05;
/** how far back from its point a blow's head reaches along the floor (m), as `landing` meets what's under it */
const HEAD_BACK = 0.15;
/** a blow meeting something this high over his feet (m at a man's size) is held where the swing met it, not out
 *  before him, from the first to all of it from the second (`holdAtFloor`) */
const HIGH_ON = [0.5, 0.8];
/** a blow into the ground ends with its weapon at most `slope` under level (rad); over lower ground he squats until
 *  it lands there, by at most `most` (m at a man's size: `holdAtFloor`) */
const SQUAT = tunable('warriorSquat', { slope: 0.96, most: 0.3 });
/** a two-hander's Power Strike lands bowed `bend` at the spine (rad) and its hips `dip` down (m at a man's size) */
const LAND_BODY = tunable('warriorLandBody', { bend: 0.75, dip: -0.12 });
/** a two-hander's blow into the ground lands with the left foot `front` ahead of him and the right `back` (m at a
 *  man's size, `CHOP_FEET`'s otherwise) */
const LAND_FEET = tunable('warriorLandFeet', { front: 0, back: -0.15 });
const _landFeet = [0, 0, 0, 0, 0, 0];
/** how far a blow into the ground turns its blade edge first (`holdAtFloor`) */
const EDGE_ON = tunable('warriorEdge', { k: 1 });
/** A two-hander's Power Strike raised and brought down by the right arm's raise across him (rad, the shoulder's z),
 *  its grip over the middle of his head within the left hand's reach, not turned across the chest nor twisted at
 *  the hips: a heavy weapon swung hard keeps its line ("axe should go down in 1 line, without changing
 *  direction/turning", "keeping momentum"). Turned across (the shoulder's y 0.7) the arm swung down on a cone, and the
 *  tip strayed 39 to 49 cm off a straight line from above on its way down (`lab range`'s path), 11 to 12 now; with
 *  no raise across the left hand let go of it overhead, and at 0.2 the shoulder went past its range as it charged. */
const PS_ACROSS = 0.18;
const _land = new THREE.Vector2();
/** the overhead blows through the eyes: the weapon raised by `lift` of the cast, coming down from `from` to `to` (as
 *  their keys in models/warriorEyes.ts, landing where the skill fires), and how much it trembles as it's held up
 *  (Power Strike's charge) */
const OVERHEAD: Record<string, { lift: number; from: number; to: number; shake: number }> = {
  chop: { lift: 0.3, from: 0.8, to: 0.9, shake: 0.02 },
  smite: { lift: 0.3, from: 0.36, to: 0.55, shake: 0 },
};

// --- the breastplate: a torso-shaped shell over the gambeson, as broad as a strong man's chest (ANSUR
// II: 29 cm across, 25 deep, plus padding and steel), with a gentle keel and pectoral swell, its top
// dipping a little at the collar (chest joint space)
const bpRx = (y: number) => 0.148 + 0.034 * sm(-0.07, 0.12, y) - 0.024 * sm(0.17, 0.25, y);
const bpRz = (y: number) => 0.128 + 0.026 * sm(-0.07, 0.1, y) - 0.028 * sm(0.16, 0.25, y);
const BP_A = 1.75;
/** the gambeson's cloth round each armhole and its sleeve's top, shared between the chest and the arm (tunic.ts) */
const ARM_K: ArmBlend = { seam: 0.5, reach: 0.09, top: 0.05, topY: 0.235, join: 0.1, joinIn: 0.05, around: 96, bulk: 0.2, over: { keep: 1, from: -0.02, depth: 0.04 } };
const gauss = (x: number, at: number, wide: number): number => Math.exp(-(((x - at) / wide) ** 2));
/** A fighter's arm in the gambeson's sleeve: its radius at `t` down the sleeve (0 the shoulder joint, 0.79 the elbow,
 *  1 the sleeve's end on the forearm) and `phi` round it (0 the outside, a quarter turn the front), as a share of a
 *  round tube's. The deltoid full over the outside and ending in a hollow where it runs into the arm, the biceps ahead
 *  and the triceps behind, the arm narrowing above the elbow, the elbow's point behind and the forearm's muscle below
 *  it. (A round tube with one swell was a sausage: "arms" were what was left to do after the legs, #520.) */
function armShape(t: number, phi: number): number {
  const out = Math.cos(phi), fore = Math.sin(phi);
  // (no hollow under the deltoid: with one, the sleeve's top was a ball under a groove, "too many weird folds")
  const delt = 0.05 * gauss(t, 0.3, 0.16) * Math.max(0, out);
  const biceps = 0.11 * gauss(t, 0.44, 0.16) * Math.max(0, fore) ** 1.5, triceps = 0.1 * gauss(t, 0.36, 0.17) * Math.max(0, -fore) ** 1.5;
  const above = -0.1 * gauss(t, 0.7, 0.08) * (0.6 + 0.4 * Math.abs(out)), point = 0.07 * gauss(t, 0.79, 0.045) * Math.max(0, -fore) ** 2;
  const forearm = 0.08 * gauss(t, 0.93, 0.09) * (0.5 + 0.5 * Math.abs(out));
  return 1 + delt + biceps + triceps + above + point + forearm;
}
/** A fighter's shoulders are deeper front to back than the shared tunic's: a point of the gambeson or of a sleeve's top
 *  (the chest's frame, at rest) moved out ahead and behind over each shoulder, most over the joint and none by the neck,
 *  under the armpit or down the arm. Both pieces are moved by the same rule, so the seam between them stays sewn. (At
 *  the tunic's own depth, 10 cm where his sleeve is 15 across, the top of each shoulder was a thin ridge with a groove
 *  under it where it met the arm: "shoulder is too thin in parts".) */
const SHOULDER_DEPTH = 0.3, _dn = new THREE.Vector3();
function deepen(g: THREE.BufferGeometry, dx = 0, dy = 0, dz = 0): THREE.BufferGeometry {
  const q = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < q.count; i++) {
    const x = q.getX(i) + dx, y = q.getY(i) + dy, z = q.getZ(i) + dz;
    const k = 1 + SHOULDER_DEPTH * sm(0.1, 0.19, Math.abs(x)) * sm(0.08, 0.17, y) * (1 - sm(0.255, 0.295, y));
    q.setZ(i, z * k - dz);
    // (its normal as the stretched surface's, kept smooth: made again from the faces, the unindexed cloth was faceted)
    _dn.fromBufferAttribute(n, i); _dn.z /= k; _dn.normalize(); n.setXYZ(i, _dn.x, _dn.y, _dn.z);
  }
  return g;
}
/** the sleeve round that arm: its length from the shoulder joint over the elbow, and its radius at each end */
const SLEEVE = { len: 0.38, r0: 0.076, r1: 0.063 };
/** the sleeve's radius `h` below the shoulder joint, `phi` round the arm (m) */
const sleeveR = (h: number, phi: number): number => lerp(SLEEVE.r0, SLEEVE.r1, h / SLEEVE.len) * armShape(h / SLEEVE.len, phi);
/** the pauldrons' size against the shoulder */
const PAULDRON = 0.7;
const bpTop = (a: number) => 0.235 - 0.03 * Math.cos(a) ** 2;
function bpPoint(a: number, y: number, out: THREE.Vector3, lift = 0): THREE.Vector3 {
  const x = Math.sin(a) * (bpRx(y) + lift);
  const G = (dx: number, dy: number, s: number) => Math.exp(-(dx * dx + dy * dy) / (s * s));
  const pec = 0.012 * G(Math.abs(x) - 0.075, y - 0.12, 0.07) + 0.007 * Math.exp(-((x / 0.025) ** 2)) * sm(-0.07, 0.05, y);
  return out.set(x, y, Math.cos(a) * (bpRz(y) + lift) + (Math.cos(a) > 0 ? pec * Math.cos(a) : 0));
}
const breast: SurfaceFn = (u, v, out) => { const a = (u - 0.5) * 2 * BP_A; return bpPoint(a, lerp(-0.07, bpTop(a), v), out); };
const back: SurfaceFn = (u, v, out) => { const a = Math.PI + (u - 0.5) * 2 * 1.45; return bpPoint(a, lerp(-0.05, 0.21, v), out); };
/** a point on the breastplate's front at x, y, `lift` above it */
function onPlate(x: number, y: number, lift = 0.004): THREE.Vector3 {
  const a = Math.asin(clamp(x / bpRx(y), -1, 1));
  return bpPoint(a, y, new THREE.Vector3(), lift);
}

export const buildWarrior = (): Model => built(warriorSteps());

/** buildWarrior's pieces one at a time (`ModelSteps`): built behind the lobby, a piece a frame. */
/** `look`: his head (his look's face and hair; the one picked in the slot in play where none's given). */
export function* warriorSteps(look: HeadSpec = headFor('warrior')): ModelSteps {
  const kit = createKit(0xffa040);
  const rng = mulberry(11);
  const tex = (maps: ReturnType<typeof steelMaps>, rep: number, ns = 1) => { const m = pbrMaterialMaps(maps, rep, ns); return { map: m.map, normalMap: m.normalMap, roughnessMap: m.roughnessMap, normalScale: m.normalScale }; };
  const E = engravedSteel();
  const engraved = kit.std({ color: 0xc4c8cf, metalness: 0.92, roughness: 1, map: E.map, normalMap: E.normalMap, roughnessMap: E.roughnessMap, normalScale: new THREE.Vector2(1.4, 1.4) });
  const plateM = kit.std({ color: 0xa9adb5, metalness: 0.92, roughness: 1, ...tex(steelMaps(), 1, 0.8) });
  yield;
  // blades: a thin blade turned away from the lights only mirrors its surroundings, and the dark ground
  // and horizon of a night sky turn it black: a cool rim of light on its bevels keeps the steel readable
  const bladeM = kit.rim({ color: 0xa9adb5, metalness: 0.92, roughness: 1, ...tex(steelMaps(), 1, 0.8), roughnessMap: null }, 0x9aa8c0, 0.3);
  const darkSteel = kit.std({ color: 0x5b5f68, metalness: 0.9, roughness: 1, ...tex(steelMaps(), 1, 0.6) });
  const brass = kit.std({ color: 0xb08a4a, metalness: 1, roughness: 0.38 });
  const leather = kit.std({ color: 0x4e3222, roughness: 1, ...tex(leatherMaps(), 1, 1.2) });
  const leatherDark = kit.std({ color: 0x2c1d14, roughness: 1, ...tex(leatherMaps(), 1, 1.2) });
  // the trousers' hide: lighter than the straps over it and lit at its edges, so a leg's shape reads against the dark
  // (in the straps' own near-black a leg was a flat silhouette, #520)
  const hide = kit.rim({ color: 0x46342a, roughness: 1, ...tex(leatherMaps(), 1, 1.2) }, 0x6e5a48, 0.3);
  const cloth = kit.rim({ color: 0x323c56, roughness: 1, ...tex(clothMaps(), 1, 0.9) }, 0x3a4a70, 0.35);
  yield;
  // (the surcoat's cloth and the shield's paint: his blue)
  const dye = new Dye('blue').cloth(cloth);
  // Independent materials: tint the cuirass without colouring the lower body, fittings or weapons.
  const cuirass = kit.std({ color: 0xc4c8cf, metalness: 0.92, roughness: 1, map: E.map, normalMap: E.normalMap,
    roughnessMap: E.roughnessMap, normalScale: new THREE.Vector2(1.4, 1.4) });
  const cuirassBack = kit.std({ color: 0xa9adb5, metalness: 0.92, roughness: 1, ...tex(steelMaps(), 1, 0.8) });
  dye.tint(cuirass, cuirassBack);
  // Dye the torso wrap underneath its belts; the belts and legs keep their original leather.
  const torsoLeather = kit.std({ color: 0x2c1d14, roughness: 1, ...tex(leatherMaps(), 1, 1.2), map: null });
  dye.tintLike(cloth, torsoLeather);
  const mail = kit.std({ color: 0x8e949e, metalness: 0.85, roughness: 1, ...tex(mailMaps(), 1, 1.6) });
  const furM = kit.std({ color: 0x75644f, roughness: 1, map: pbrMaterialMaps(furMaps(), 1).map, normalMap: pbrMaterialMaps(furMaps(), 1).normalMap });
  const wood = kit.std({ color: 0x8a6446, roughness: 1, ...tex(woodMaps(), 1, 1) });
  // bare hands and wrists, and the fingertips his gloves leave bare (a paler skin of their own, they were another
  // man's fingers, #425)
  yield;
  const bareSkin = handSkin(kit, look.who);
  yield;
  // the fuller only glows while a skill charges
  const edge = kit.glow(0xffb070, 0, false);

  const j = buildHumanoid({ skin: leather }, {
    chestW: 0.18, chestD: 0.14, waistW: 0.16, shoulderW: 0.21, shoulderY: 0.45, upperR: 0.068, foreR: 0.058, handR: 0.058,
    thighR: 0.1, shinR: 0.078, headR: 0.125, shinL: 0.41,
  });
  stripRig(j.root);
  yield;
  // fur casts no shadow: hundreds of thin tufts would add much to the shadow pass for little
  const S = new Sculpt().glow(furM);
  yield;
  // the armour, on meshes of its own so it comes off (setGear): the chest item's (breastplate, pauldrons, mail skirt,
  // tassets, knee cops), the hands item's (bracers, gloves), and what shows without the latter (the forearm's sleeve)
  const A = new Sculpt().glow(furM), H = new Sculpt().glow(furM), B = new Sculpt();

  yield;
  // --- torso: a quilted gambeson under it all, layered leather at the waist, the breastplate on top
  // (cut as the other heroes' tunics are, over the shoulders as a man's are, an armhole round each and the sleeve set
  // into it, `SetInShoulders`: a round barrel with the arms' round-topped tubes stood beside it had no shoulders, and a
  // raised arm came out of it as a tube stuck into the body)
  const sets = new SetInShoulders(j, ARM_K, lod(ARM_K.around, 48));
  {
    const [L, R] = yield* tunicCutSteps(sets.around, lod(22, 12));
    // (its foot drawn in under the leather wrap round the waist, which is the spine's: hanging straight, it came out
    // through the wrap in teeth on the side he leant to)
    for (const g of [L, R]) {
      const q = g.attributes.position;
      for (let i = 0; i < q.count; i++) { const k = 1 - 0.3 * clamp((-0.02 - q.getY(i)) / 0.1, 0, 1) ** 2; q.setX(i, q.getX(i) * k); q.setZ(i, q.getZ(i) * k); }
    }
    yield;
    S.skinChain(deepen(sets.withArm(R, -1)), cloth, j.chest, sets.chainOf(-1));
    yield;
    S.skinChain(deepen(sets.withArm(L, 1)), cloth, j.chest, sets.chainOf(1));
  }
  yield;
  // (its top wider than the gambeson's foot inside it: as wide, the cloth came through it in teeth as the chest turned)
  S.add(scaleUV(lathe([[0.14, -0.05], [0.145, 0.08], [0.158, 0.2], [0.162, 0.26]], 24), 3, 1), torsoLeather, j.spine, [0, 0, 0], [0, 0, 0], [1, 1, 0.88]);
  for (const [y, g] of [[0.19, 0.006], [0.125, 0]] as const) S.add(belt(0.16 + g, 0.137 + g, y, 0.06, 0.01), leather, j.spine);
  // (a rolled edge round the wrap's top, standing off it: where the chest leans or turns on the spine the gambeson
  // crosses the wrap's top a few mm under its surface, and showed through it there as a row of teeth)
  S.add(belt(0.173, 0.153, 0.246, 0.032, 0.012), leather, j.spine);
  yield;
  // rivets along each band
  const studs: THREE.BufferGeometry[] = [];
  const studAt = (p: THREE.Vector3, n: THREE.Vector3, r: number) => {
    const g = stud(r), m = new THREE.Matrix4().lookAt(ZERO, n, V(0, 1, 0));
    // lookAt aims -Z at n: turn it round so the dome (+Z) faces out
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI)).applyMatrix4(m).translate(p.x, p.y, p.z);
    studs.push(g);
  };
  for (const [y, g] of [[0.19, 0.006], [0.125, 0]] as const) for (let k = 0; k < 14; k++) {
    const a = (k / 14 - 0.5) * 2.6;
    studAt(V(Math.sin(a) * (0.165 + g), y - 0.02, Math.cos(a) * (0.142 + g)), V(Math.sin(a), 0, Math.cos(a)), 0.005);
    yield;
  }
  S.add(merge(studs.splice(0)), brass, j.spine);
  yield;
  // the breastplate, engraved across the front (projected straight on), and a plain back plate
  const bp = plate(breast, 28, 14, 0.008);
  projectUV(bp, steelRegion('chest'), (x, y) => [(x + 0.22) / 0.44, (y + 0.12) / 0.42]);
  A.add(bp, cuirass, j.chest);
  A.add(plate(back, 20, 10, 0.008), cuirassBack, j.chest);
  A.add(edgeTube(breast, 'v1', 0.008, 28), plateM, j.chest);
  A.add(edgeTube(back, 'v1', 0.008, 20), plateM, j.chest);
  for (let k = 0; k <= 16; k++) {
    const a = (k / 16 - 0.5) * 2 * BP_A * 0.96, p = bpPoint(a, -0.05, new THREE.Vector3(), 0.008);
    studAt(p, V(Math.sin(a), 0, Math.cos(a)), 0.006);
    yield;
  }
  A.add(merge(studs.splice(0)), plateM, j.chest);
  yield;
  // side straps joining front and back plates under the arms
  for (const s of [1, -1]) for (const y of [0.02, 0.1]) A.add(strap([V(s * 0.155, y, 0.1), V(s * 0.188, y, 0), V(s * 0.155, y, -0.1)], 0.028, 0.006), leather, j.chest);
  yield;
  // crossed straps over the chest, each with a buckle; they run on over the shoulders
  for (const s of [1, -1]) {
    const pts: THREE.Vector3[] = [V(s * 0.1, 0.27, -0.1), V(s * 0.115, 0.29, -0.02), V(s * 0.105, 0.25, 0.09)];
    for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push(onPlate(lerp(s * 0.1, -s * 0.16, t), lerp(0.2, -0.04, t), 0.004)); }
    A.add(strap(pts, 0.04, 0.007), leather, j.chest);
    const mid = onPlate(s * -0.01, 0.1, 0.012);
    A.add(buckle(0.05, 0.05), plateM, j.chest, mid.toArray(), [0, 0, s * 0.62]);
    yield;
  }

  yield;
  // --- fur collar round the neck and over the shoulder tops
  const collar = yield* furTuftsSteps(rng, 280, (i, o) => {
    // (rooted on the gambeson's shoulders as they slope: on a ring round the old barrel's top, the tufts before and
    // behind the neck stood in the air off shoulders that are thin front to back)
    // (and only on cloth that stays with the chest: rooted where the cloth round an armhole goes up with a raised arm,
    // the cloth rose through the fur, "when he raises his arm the fur goes through")
    let a = 0;
    for (let tries = 0; tries < 12; tries++) {
      a = rng() * Math.PI * 2;
      onTunic(a, lerp(0.288, 0.243, rng()), 0.004, o.p);
      if (Math.max(sets.share(o.p, 1), sets.share(o.p, -1)) < 0.08) break;
      // (the last try nearer the neck, where none of it moves)
      if (tries === 10) { onTunic(a, 0.286, 0.004, o.p); break; }
    }
    const sa = Math.sin(a), ca = Math.cos(a);
    o.d.set(sa, 0.5 + rng() * 0.5, ca);
  }, 0.06, 0.011);
  S.add(collar, furM, j.chest);
  yield;
  // a high collar of the gambeson inside the fur, round the neck as the tunic's neckline is (centred on the chest, his
  // neck came out through it behind), and the neck; drawn in at its top's sides to the neck's own section, which is narrower
  // across than deep, with a rolled edge (round, it stood 17 mm off the sides of his neck, its edge cut flat: a hard line
  // round the neck over the fur)
  const COLLAR = { top: 0.075, foot: 0.09, high: 0.06, across: 0.93, rim: 0.006 };
  const collarAt = (g: THREE.BufferGeometry, y0: number) => {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * lerp(1, COLLAR.across, sm(-COLLAR.high / 2, COLLAR.high / 2, p.getY(i) + y0)));
    g.computeVertexNormals();
    return g;
  };
  S.add(collarAt(new THREE.CylinderGeometry(COLLAR.top, COLLAR.foot, COLLAR.high, 24, 3, true), 0), cloth, j.chest, [0, 0.27, -NECKLINE_BACK]);
  S.add(collarAt(new THREE.TorusGeometry(COLLAR.top, COLLAR.rim, 6, 24).rotateX(Math.PI / 2), COLLAR.high / 2), cloth, j.chest, [0, 0.27 + COLLAR.high / 2, -NECKLINE_BACK]);

  yield;
  // --- pauldrons: three steel lames over each shoulder with a rolled rim, an engraved medallion on the
  // top one, fur spilling out from under it
  for (const [s, joint0] of [[1, j.shoulderL], [-1, j.shoulderR]] as const) {
    // sized to sit over a man's deltoid (they were cut for a far broader frame)
    const sh = joint(joint0);
    sh.scale.setScalar(PAULDRON);
    const lame = (R: number, lat0: number, lat1: number, y: number): SurfaceFn => (u, v, out) => {
      const lon = (u - 0.5) * 3.3, lat = lerp(lat0, lat1, v);
      return out.set(s * Math.cos(lat) * Math.cos(lon) * R * 1.12 + s * 0.02, Math.sin(lat) * R * 0.78 + y, Math.cos(lat) * Math.sin(lon) * R);
    };
    const lames = [lame(0.14, -0.35, 0.0, -0.01), lame(0.135, -0.05, 0.45, 0), lame(0.13, 0.35, 1.45, 0.01)];
    for (const [i, L] of lames.entries()) {
      A.add(plate(L, 18, 6, 0.007), i === 2 ? plateM : darkSteel, sh);
      A.add(edgeTube(L, 'v0', 0.006, 18), plateM, sh);
    }
    const md = disc(0.04, 0.014);
    projectUV(md, steelRegion('disc'), (x, y) => [(x / 0.04 + 1) / 2, (y / 0.04 + 1) / 2]);
    A.add(md, engraved, sh, [s * 0.095, 0.07, 0.07], [-0.5, s * 0.75, 0]);
    A.add(furTufts(rng, 44, (i, o) => {
      const a = (rng() - 0.5) * 3; o.p.set(s * (0.1 + Math.cos(a) * 0.04), -0.06, Math.sin(a) * 0.1); o.d.set(s * 0.6, -0.8, Math.sin(a) * 0.5);
    }, 0.045, 0.009), furM, sh);
    yield;
  }

  yield;
  // --- arms: navy sleeves strapped at the upper arm, fur at the elbow, leather bracers with a steel
  // plate, fingerless gloves (the hands item: without it the sleeves run on to the wrist, the hands bare)
  const wrists = { L: wristOf(j.handL, true), R: wristOf(j.handR, false) };
  for (const [s, sh, el, wrist] of [[1, j.shoulderL, j.elbowL, wrists.L], [-1, j.shoulderR, j.elbowR, wrists.R]] as const) {
    // the sleeve, thigh and shin run on past their joints under the bracer, the knee cop and the boot, and follow the lower limb there
    // (set into its armhole, and shaped as the arm in it: `armShape`)
    { const at = sets.restOf(s); S.skinChain(deepen(sets.sleeve(s, { ...SLEEVE, bulge: 0, at: 0.24, cap: lod(10, 6), tube: lod(18, 9), shape: armShape }), at.x, at.y, at.z), cloth, sh, [...sets.chainOf(s), el]); }
    // (the straps lying on the arm as it's shaped there: round rings stood off it where it's hollow)
    for (const h of [0.13, 0.21]) S.add(strap(Array.from({ length: 16 }, (_, k) => { const phi = (k / 16) * Math.PI * 2, r = sleeveR(h, phi) + 0.001; return V(s * Math.cos(phi) * r, -h, Math.sin(phi) * r); }), 0.024, 0.006, true), leather, sh);
    H.add(furTufts(rng, 40, (i, o) => { const a = (i / 40) * Math.PI * 2; o.p.set(Math.sin(a) * 0.06, -0.035, Math.cos(a) * 0.06); o.d.set(Math.sin(a), 0.6, Math.cos(a)); }, 0.035, 0.009), furM, el);
    H.add(scaleUV(lathe([[0.052, -0.26], [0.06, -0.2], [0.066, -0.1], [0.07, -0.05], [0.068, -0.035]], 16), 2, 1), leather, el);
    // its top closed under the elbow's fur (through the eyes, with the fur hidden, it would show open)
    H.add(new THREE.CircleGeometry(0.069, 16).rotateX(-Math.PI / 2), leather, el, [0, -0.037, 0]);
    const vb: SurfaceFn = (u, v, out) => { const a = (u - 0.5) * 1.8, y = lerp(-0.24, -0.06, v), r = 0.066 + 0.01 * sm(-0.24, -0.08, y) + 0.004; return out.set(s * Math.cos(a) * r, y, Math.sin(a) * r); };
    H.add(plate(vb, 10, 8, 0.005), plateM, el);
    for (const y of [-0.09, -0.2]) H.add(belt(0.072, 0.072, y, 0.018, 0.006, 0, 14), leatherDark, el);
    // the glove's cuff: from under the bracer down over the wrist into the palm, following the hand, so the hand joins the forearm (the bracer ends above the wrist)
    // (flattened as the palm is, its end inside it: round, a 7 cm tube's rim stood out of a 3 cm palm)
    H.skinChain(wristBent(scaleUV(ovalTube([[-0.298, 0.034, 0.016], [-0.285, 0.04, 0.025], [-0.265, 0.043, 0.032], [-0.235, 0.047, 0.042], [-0.2, 0.052, 0.052]], 16), 2, 1), j.P.foreL), leather, el, wrist.chain);
    // bare: the gambeson's sleeve on down the forearm (its top inside the upper sleeve's end, which follows the
    // forearm), a turned-back cuff at the wrist, and the wrist into the palm
    B.add(scaleUV(lathe([[0.045, -0.245], [0.048, -0.2], [0.057, -0.12], [0.0655, -0.045], [0.064, 0]], 16), 2, 1), cloth, el);
    B.add(scaleUV(lathe([[0.044, -0.25], [0.051, -0.245], [0.053, -0.215], [0.05, -0.205]], 16), 2, 0.3), cloth, el);
    B.skinChain(wristBent(ovalTube([[-0.292, 0.029, 0.021], [-0.28, 0.03, 0.024], [-0.265, 0.033, 0.027], [-0.235, 0.038, 0.032], [-0.2, 0.042, 0.04]], 16), j.P.foreL), bareSkin, el, wrist.chain);
    yield;
  }
  const handL = buildHand(j.handL, 1, leather, bareSkin, HAND_K, bareSkin), handR = buildHand(j.handR, -1, leather, bareSkin, HAND_K, bareSkin);
  const body = bodyShape(j, { L: handL.vis, R: handR.vis });
  // His fuller thighs need a capsule to keep the seated forearms out all the way to the knees.
  body.legCapsules = true;

  yield;
  // --- legs: leather trousers, engraved knee cops, tall boots with fur tops, straps and a steel toe
  // (the trousers one piece a leg from the waist to the ankle, the seat and hips with them, models/trousers.ts: two
  // round-topped tubes from the hip joints had no pelvis between them, and bare of the mail the world showed there)
  buildTrousers(S, j, TROUSERS, hide, leatherDark);
  yield;
  for (const [kn, an] of [[j.kneeL, j.ankleL], [j.kneeR, j.ankleR]] as const) {
    const cop: SurfaceFn = (u, v, out) => { const lon = (u - 0.5) * 2.5, lat = lerp(-0.95, 1.05, v); return out.set(Math.sin(lon) * Math.cos(lat) * 0.082, Math.sin(lat) * 0.085, Math.cos(lon) * Math.cos(lat) * 0.075 + 0.012); };
    const kg = plate(cop, 14, 12, 0.006);
    projectUV(kg, steelRegion('knee'), (x, y) => [(x / 0.082 + 1) / 2, (y / 0.085 + 1) / 2]);
    A.add(kg, engraved, kn, [0, -0.01, 0]);
    for (const y of [0.05, -0.075]) A.add(belt(0.088, 0.086, y, 0.02, 0.006, 0, 14), leather, kn);
    // the boot's shaft from below the knee to the ankle, and a fur cuff over its top
    S.add(scaleUV(lathe([[0.056, -0.42], [0.064, -0.37], [0.077, -0.27], [0.085, -0.16], [0.088, -0.11], [0.086, -0.1]], 18), 2, 1.5), leather, kn, [0, 0, 0.005], [0, 0, 0], [1, 1, 1.06]);
    S.add(furTufts(rng, 48, (i, o) => { const a = (i / 48) * Math.PI * 2; o.p.set(Math.sin(a) * 0.086, -0.105, Math.cos(a) * 0.091); o.d.set(Math.sin(a), 0.7, Math.cos(a)); }, 0.04, 0.01), furM, kn);
    for (const y of [-0.23, -0.34]) {
      const r = 0.087 + (y + 0.16) * 0.12;
      S.add(belt(r, r * 1.06, y, 0.02, 0.006, 0, 16), leatherDark, kn);
      S.add(buckle(0.026, 0.026, 0.005), plateM, kn, [r + 0.006, y, 0], [0, Math.PI / 2, 0]);
    }
    // the foot: a rounded boot on a thick sole, a steel cap over the toe
    const foot = [V(0, -0.028, -0.05), V(0, -0.03, 0.04), V(0, -0.037, 0.14), V(0, -0.046, 0.21)];
    S.add(scaleUV(taperTube(foot, (t) => 0.05 - 0.02 * t * t, 12, 12), 1, 2), leather, an, [0, 0, 0], [0, 0, 0], [1.12, 0.82, 1]);
    S.add(taperTube(foot.map((p) => V(0, 0, p.z)), (t) => 0.056 - 0.02 * t * t, 12, 12), leatherDark, an, [0, -0.064, 0], [0, 0, 0], [1.15, 0.2, 1.04]);
    S.add(new THREE.SphereGeometry(0.047, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), plateM, an, [0, -0.042, 0.165], [0.5, 0, 0], [1.1, 0.9, 1.3]);
    yield;
  }

  yield;
  // --- below the belt: a mail skirt with leather tassets over it
  S.add(belt(0.168, 0.145, 0.01, 0.06, 0.012), leather, j.spine);
  const bk = disc(0.046, 0.016);
  projectUV(bk, steelRegion('disc'), (x, y) => [(x / 0.046 + 1) / 2, (y / 0.046 + 1) / 2]);
  S.add(bk, engraved, j.spine, [0, 0.01, 0.152]);
  yield;
  // a second belt slung lower across the hips, and a pouch on it
  S.add(strap(Array.from({ length: 18 }, (_, k) => { const a = (k / 18) * Math.PI * 2; return V(Math.sin(a) * 0.2, 0.02 - 0.05 * Math.sin(a + 0.8) - 0.02 * Math.cos(a), Math.cos(a) * 0.17); }), 0.04, 0.01, true), leather, j.hips);
  S.add(new THREE.BoxGeometry(0.08, 0.1, 0.045), leatherDark, j.hips, [-0.18, -0.05, 0.08], [0, -0.8, 0]);
  S.add(new THREE.BoxGeometry(0.086, 0.04, 0.05), leather, j.hips, [-0.18, -0.005, 0.08], [0, -0.8, 0]);
  yield;
  // (its top gathered under the waist belt, against the leather there: hung below the belt and wider than it, the ring between
  // the two was open, and the trousers' tops showed through it at the sides, standing too; the hips' flare is the drape's; seven
  // rows, as the hand on the shield's grip lay between two of six)
  const skirt = new Skirt({ r0: 0.145, r1: 0.25, len: 0.39, depth: 0.8, folds: 7, foldAmp: 0.03, flare: 0.7, rows: 7 });
  const skirtMesh = new THREE.Mesh(skirt.geo, mail);
  skirtMesh.position.y = 0.07; skirtMesh.castShadow = skirtMesh.receiveShadow = true;
  j.hips.add(skirtMesh);
  yield;
  // what it is draped over, in its own space: the trousers' thighs (they bulge to 11 cm) and the shins over the boots (their
  // fur cuffs stand 11 cm off the shin, over the knee cops) from inside, the hands and the forearms' lower halves (a bracer's
  // plate or the sleeve) from outside, with the cloth's gap. Swung by the thighs alone, the mail was narrower than the
  // trousers at its sides and they came through it in every frame, standing too.
  const legBodies = new SkirtLimbs(), handBodies = new SkirtLimbs(), GAP = 0.018, HAND_GAP = 0.012, O = () => new THREE.Vector3();
  for (const [th, kn, an] of [[j.thighL, j.kneeL, j.ankleL], [j.thighR, j.kneeR, j.ankleR]] as const) {
    legBodies.add([th, O()], [kn, O()], 0.122 + GAP, 0.09 + GAP);
    legBodies.add([kn, O()], [an, O()], 0.115 + GAP, 0.065 + GAP);
    yield;
  }
  // (and the seat between the thighs' tops: the mail hangs clear of it behind)
  legBodies.add([j.hips, new THREE.Vector3(0.06, -0.06, -0.03)], [j.hips, new THREE.Vector3(-0.06, -0.06, -0.03)], 0.108 + GAP);
  const capsL = handCapsules(handL);
  for (const [a, b, r] of [...capsL, ...handCapsules(handR)]) handBodies.add(a, b, r + HAND_GAP);
  const cuffR = () => (gloved ? [0.075, 0.055] : [0.058, 0.053]);
  const fores = ([[j.elbowL, j.handL], [j.elbowR, j.handR]] as const).map(([el, hd]) => handBodies.add([el, new THREE.Vector3(0, -0.5 * j.P.foreL, 0)], [hd, O()], 0));
  yield;
  // (a left hand with no weapon in it, empty or on the shield's grip, swung out just enough to rest on the mail rather than in it:
  // armOffThigh)
  const freePts = [...capsL.flatMap(([a, b, r]) => [[a, r], [b, r]] as [JointPoint, number][]), [[j.elbowL, new THREE.Vector3(0, -0.5 * j.P.foreL, 0)], 0], [[j.handL, O()], 0]] as [JointPoint, number][];
  const placeBodies = (free: number) => {
    const [ra, rb] = cuffR();
    for (const f of fores) { f.ra = ra + HAND_GAP; f.rb = rb + HAND_GAP; }
    legBodies.place(skirtMesh);
    if (free) { freePts[freePts.length - 2][1] = ra; freePts[freePts.length - 1][1] = rb; armOffThigh(skirtMesh, j.shoulderL, 1, legBodies.list[0], HAND_GAP, freePts, free); }
    handBodies.place(skirtMesh);
  };
  const tassets: { g: THREE.Group; s: number }[] = [];
  for (const s of [1, -1]) {
    for (const [k, off] of [[0, 0.55], [1, 1.05]] as const) {
      const g = joint(j.hips, s * Math.sin(off) * 0.2, 0.05, Math.cos(off) * 0.172);
      g.rotation.order = 'YXZ'; g.rotation.y = s * off;
      const tf: SurfaceFn = (u, v, out) => { const x = (u - 0.5) * 0.12, yb = -0.3 + k * 0.04 + 0.03 * (2 * u - 1) ** 2; return out.set(x, lerp(yb, 0, v), 0.012 * Math.sin(u * Math.PI)); };
      const ta = new Sculpt();
      ta.add(plate(tf, 6, 8, 0.008, undefined, V(0, -0.15, -0.1)), leather, g);
      ta.add(edgeTube(tf, 'v0', 0.004, 8, 0.02), leatherDark, g);
      for (let q = 0; q < 4; q++) { const p = tf(0.2 + q * 0.2, 0.85, new THREE.Vector3()); ta.add(stud(0.006), plateM, g, [p.x, p.y, p.z + 0.008]); }
      ta.build();
      tassets.push({ g, s });
    }
    yield;
  }

  yield;
  // --- the head, with shoulder-length wavy hair, and an open-faced helmet worn over it when a head item is
  // equipped: a steel skull with a low crest, bands riveted over it and round the brow, a nasal down the nose,
  // cheek guards over the ears and a mail curtain over the nape. It is shaped on the head itself (padded over
  // the scalp); the face stays bare.
  const head = yield* headSteps(j.head, kit, look.who, look);
  yield;
  // (a point just before the lips, for the flask)
  const mouth = new THREE.Object3D(); mouth.name = 'mouth'; head.group.add(mouth); toGroup(0, 50, 112, mouth.position);
  buildNeck(j.neck, kit, look.who, j.P.neckL, j.head);
  yield;
  // (worn only with a head item equipped: bareheaded, the hair shows; setGear)
  const helm = new THREE.Group(); helm.name = 'helm'; head.group.add(helm); helm.visible = false;
  {
    const h = new Sculpt(), C = toGroup(0, 128, -12), M = HEAD_MM;
    /** the shell towards `a` round the head (0 the face) and `el` up it, padded over the scalp, with a
     *  low crest along the middle; `lift` mm further out */
    const shell = (a: number, el: number, lift = 0, out = new THREE.Vector3()) => {
      const x = Math.sin(a) * Math.cos(el), y = Math.sin(el);
      return head.surface(a, el, 12 + lift + 4.5 * Math.exp(-((x / 0.12) ** 2)) * sm(0.1, 0.8, y), out);
    };
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    // the rim: just above the brows, over the ears at the sides, down to the nape behind
    const rimEl = (a: number) => Math.asin(lerp(0.36, -0.35, sm(0.5, 2.7, Math.abs(wrap(a)))));
    const out = (p: THREE.Vector3, o: THREE.Vector3) => o.subVectors(p, C).normalize();
    const dome = new THREE.SphereGeometry(1, lod(56, 28), lod(20, 10)), dp = dome.attributes.position, duv = dome.attributes.uv;
    for (let i = 0; i < dp.count; i++) {
      // round from the back (the sphere's seam) the same way the sphere winds, from the rim to the top
      const a = wrap(duv.getX(i) * Math.PI * 2 + Math.PI);
      shell(a, lerp(rimEl(a), Math.PI / 2, duv.getY(i)), 0, _v);
      dp.setXYZ(i, _v.x, _v.y, _v.z);
    }
    dome.computeVertexNormals();
    h.add(scaleUV(dome, 4, 1.5), plateM, helm);
    yield;
    const ring = (el: (a: number) => number, lift: number, n: number) => Array.from({ length: n }, (_, k) => { const a = (k / n) * Math.PI * 2 - Math.PI; return shell(a, el(a), lift); });
    // a rolled rim, the brow band over it, four bands meeting at the crown and a rivet on top
    const rim = ring(rimEl, 1, 48);
    h.add(taperTube([...rim, rim[0]], () => 0.0055, lod(96, 48), 6), plateM, helm);
    h.add(strap(ring((a) => rimEl(a) + 0.13, 0, 48), 0.032, 0.0035, true, out, 96), darkSteel, helm);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      h.add(strap(Array.from({ length: 10 }, (_, q) => shell(a, lerp(rimEl(a) + 0.26, Math.PI / 2 - 0.02, q / 9), 0)), 0.022, 0.003, false, out), darkSteel, helm);
      for (let q = 0; q < 3; q++) { const e = lerp(rimEl(a) + 0.4, 1.35, q / 2); studAt(shell(a, e, 3), out(shell(a, e), V(0, 0, 0)), 0.0038); }
    }
    for (let k = 0; k < 20; k++) { const a = (k / 20) * Math.PI * 2 - Math.PI, e = rimEl(a) + 0.13; studAt(shell(a, e, 3.5), out(shell(a, e), V(0, 0, 0)), 0.0036); }
    yield;
    const top = shell(0, Math.PI / 2, 3);
    h.add(new THREE.SphereGeometry(0.009, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), plateM, helm, top.toArray(), [0, 0, 0], [1, 0.7, 1]);
    // the nasal: a ridged bar from the brow band down the bridge of the nose, clear of it, narrowing to
    // a rounded end
    const nTop = shell(0, rimEl(0) + 0.22, 4.5), nTopY = nTop.y / M;
    const nasal: SurfaceFn = (u, v, o) => {
      const c = 2 * u - 1, w = lerp(5.5, 9, v) * Math.sqrt(1 - (1 - sm(0, 0.12, v)) ** 2 * 0.75), x = c * w;
      const y = lerp(100, nTopY, v), z = lerp(head.midZ(y) + 4, nTop.z / M + 5, sm(0.55, 1, v));
      return toGroup(x, y, z + 2.5 * (1 - c * c) - x * x * 0.04, o);
    };
    h.add(plate(nasal, 6, 12, 0.003, undefined, C), plateM, helm);
    studAt(nasal(0.5, 0.88, new THREE.Vector3()).add(V(0, 0, 0.002)), V(0, 0, 1), 0.0035);
    // cheek guards over the ears, their lower edge tucked in over the beard, their front edge clear of
    // the face
    for (const s of [1, -1]) {
      const guard: SurfaceFn = (u, v, o) => {
        const a = s * lerp(0.95, 2.0, u), e0 = lerp(-0.62, -0.3, u) - 0.1 * Math.sin(u * Math.PI), el = lerp(e0, rimEl(a) + 0.08, v);
        return shell(a, el, 1.2 - 3 * sm(-0.2, -0.6, Math.sin(el)), o);
      };
      h.add(plate(guard, lod(12, 6), lod(12, 6), 0.005, undefined, C), plateM, helm);
      h.add(edgeTube(guard, 'v0', 0.0035, 16), plateM, helm);
      h.add(edgeTube(guard, 'u0', 0.0035, 12), plateM, helm);
      for (const [u, v] of [[0.3, 0.82], [0.7, 0.82], [0.45, 0.25]]) { const p = guard(u, v, new THREE.Vector3()); studAt(p.addScaledVector(out(p, _v), 0.004), out(p, V(0, 0, 0)), 0.0035); }
    }
    // mail hanging from under the rim behind the cheek guards, over the nape
    const aventail: SurfaceFn = (u, v, o) => {
      const a = Math.PI + (u - 0.5) * 2.7, p = shell(a, rimEl(a) + 0.05, -2, o), r = V(p.x, 0, p.z - C.z).normalize();
      return p.addScaledVector(r, 0.03 * (1 - v)).add(V(0, -0.09 * (1 - v), 0));
    };
    yield;
    h.add(scaleUV(plate(aventail, lod(28, 12), 4, 0.003, undefined, C), 3, 3), mail, helm);
    h.add(merge(studs.splice(0)), plateM, helm);
    h.build();
  }

  yield;
  // --- weapons in the right hand, built along the grip's +Y (blade up); setGear shows the equipped one.
  // The grip turns +Y to point forward, slightly up, out of the bent arm.
  const grip = joint(j.handR, 0, -0.06, 0.01);
  grip.rotation.x = GRIP;
  const weapons = new Map<string, Weapon>();
  const add = (name: string, len: number, off: number | null, r: number, strikes: Weapon['edge'], build: (w: Sculpt, g: THREE.Group) => void, hang?: Weapon['hang']) => {
    const g = new THREE.Group();
    g.name = name;
    grip.add(g);
    const w = new Sculpt(`warrior-${name}`);
    build(w, g);
    w.glow(edge).build();
    g.visible = false;
    weapons.set(name, { group: g, len, off, r, edge: strikes, hang });
  };
  yield;
  // (each made as models/weapons.ts makes it, a sculpt of its own kind: a hero built again replays its pieces)
  const M: WeaponMaterials = {
    steel: plateM, dark: darkSteel, blade: bladeM, engraved, brass, wood, leather, leatherDark, glow: edge,
  };
  yield;
  // (the striking parts as models/weapons.ts builds them: the sword's blade from 0.12 to 1.06, the greatsword's from
  // 0.13 to 1.47, the axe's bit from its beard's toe at 0.4 to its top at 0.74, the mace's flanges from 0.56 to 0.74,
  // the greataxe's bits from 0.62 to 1.07 with the spike over them, the maul's head round 0.99)
  add('Sword', 1.12, null, 0.024, [0.4, 1.06], (w, g) => sword(w, g, M), { at: 0.115, down: true });
  add('Axe', 0.74, null, 0.024, [0.4, 0.74], (w, g) => axe(w, g, M), { at: 0.44, down: false });
  add('Mace', 0.72, null, 0.026, [0.55, 0.74], (w, g) => mace(w, g, M), { at: 0.52, down: false });
  add('Greatsword', 1.62, -0.24, 0.026, [0.6, 1.47], (w, g) => greatsword(w, g, M));
  add('Greataxe', 1.12, -0.3, 0.028, [0.62, 1.2], (w, g) => greataxe(w, g, M));
  add('Maul', 1.1, -0.28, 0.029, [0.88, 1.12], (w, g) => maul(w, g, M));
  const tip = joint(grip, 0, 1.12, 0);
  /** each hand's weapon's striking part, as a swing's trail follows it (`swung`; placed by `setGear`) */
  const bladeR = { from: joint(grip, 0, 0, 0), to: joint(grip, 0, 0, 0) };
  yield;
  // where the left hand holds a two-handed weapon
  const offGrip = joint(grip, 0, -0.24, 0);
  let held: Weapon | null = null;

  yield;
  // dual-wielding: a one-hander in the left fist too, the mirror image of the right grip (the
  // copies share geometry and materials)
  const gripL = joint(j.handL, 0, -0.06, 0.01);
  gripL.rotation.x = GRIP;
  gripL.scale.x = -1;
  const offWeapons = new Map<string, Weapon>();
  for (const [name, w] of weapons) {
    if (w.off != null) continue;   // two-handers
    const g = w.group.clone();
    gripL.add(g);
    offWeapons.set(name, { ...w, group: g });
    yield;
  }
  let offHeld: Weapon | null = null;
  const tipL = joint(gripL, 0, 1, 0);
  const bladeL = { from: joint(gripL, 0, 0, 0), to: joint(gripL, 0, 0, 0) };
  /** the weapons a strike swings this frame (`swung`): every one in a hand, none between strikes */
  const struck: Blade[] = [];
  /** Seen through its own eyes (entities/viewModel.ts) the weapons are posed to be seen but keep the middle
   *  of the view clear (measured on screen): at rest low in its corners, blades angled in (a two-hander,
   *  under the moves that don't place it in the view, low on the right, blade out) (added to shoulder
   *  pitch, elbow, wrist pitch, wrist roll, shoulder roll); the swings and the overhead blows are keyed in the view
   *  (models/warriorEyes.ts); the raised shield higher, its rim just under the crosshair (added to shoulder and
   *  elbow) */
  let fp = false;
  const FP_STANCE = [-0.6, 0, 0.7, 0, -0.2];
  const FP_STANCE_TWO = [-0.2, -0.2, 1.3, -1.0, -0.3];
  const FP_BLOCK = [-0.25, 0.05], NO_BLOCK = [0, 0];
  /** a two-hander at rest through the eyes, in both hands and both seen: where the left hand holds it in the
   *  view (camera space, metres; the right hand is further up the grip, however long), the weapon's
   *  direction there (up and out to the right, its head in the frame's corner), and where the right elbow points
   *  (down, so the forearm rises from the bottom of the view rather than lying across it). (Up and out at 45
   *  degrees, the handle ran along the left forearm, and a greataxe's and a maul's lower hand let go of it, the
   *  wrist 40 degrees past its range; upright it split the view, the heads out of the frame) */
  /** where a two-hander rests through the eyes, as the moves there are keyed (the lower grip's place in the view, the
   *  weapon's way: `EYES`, read each frame) */
  const FP_TWO_POLE = V(0, -1, 0);
  /** a blade's flat turned to the eyes (camera space): a cut seen broadside */
  const FACE_EYES = V(0, 0, 1);
  /** Bull Rush: the share of its pose that is the brace before it goes, and where the rush ends (skills/bullRush BRACE, RUN, HOLD); the rest is the follow-through */
  const BRACE = 0.16, RUSH = 0.58, STRIDES = 2.5;
  /** Bull Rush's charge at `k` of it: how far it is into the brace, the rush and the skid into the stop (0..1), and the
   *  strides' swing (the sine and cosine of their phase) */
  const chargeOf = (k: number) => {
    const brace = ramp(k, 0, BRACE * 0.7) * (1 - ramp(k, BRACE, BRACE + 0.04));
    const run = ramp(k, BRACE - 0.02, BRACE + 0.03) * (1 - ramp(k, RUSH - 0.02, RUSH + 0.03));
    const skid = ramp(k, RUSH - 0.03, RUSH) * (1 - ramp(k, 0.8, 1));
    const cp = clamp((k - BRACE) / (RUSH - BRACE), 0, 1) * STRIDES * Math.PI;
    return { brace, run, skid, sc: Math.sin(cp), cc: Math.cos(cp) };
  };
  /** where each elbow points while the arm is placed in the view (chest space: out to its side, down) */
  const POLE_VR = V(-0.6, -1, 0), POLE_VL = V(0.6, -1, 0);
  /** the share of an arm's length over which an arm placed in the view eases into its full reach (rig.ts `reachArm`),
   *  where no swing holds it (a swing's keys are reached as keyed: eased, Power Strike's elbow was drawn 6 cm off them) */
  const SOFT_REACH = 0.15;

  yield;
  // --- round shield on the left fist: planks behind a painted navy face, a steel rim with rivets and a
  // domed boss. At rest it hangs at the side facing outwards; raised (or charging) it swings round in
  // front of the fist, facing out of the hand. Its face is local +Z.
  const shield = joint(j.handL, 0, -0.1, 0);
  shield.userData.strapped = true;
  shield.name = 'shield';
  shield.visible = false;
  {
    const w = new Sculpt();
    // (the wood's grain in its relief alone, not its brown: under the wood's colour map the paint came out near brown
    // whatever its own, and the shield carried none of a player's colour)
    const { map: _woodColour, ...grain } = tex(woodMaps(), 1, 1.5);
    const paint = kit.std({ color: 0x2c3a58, roughness: 1, ...grain });
    dye.cloth(paint);
    w.add(scaleUV(new THREE.CylinderGeometry(0.33, 0.33, 0.03, 36), 2, 2), wood, shield, [0, 0, 0], [Math.PI / 2, 0, 0]);
    w.add(scaleUV(new THREE.CylinderGeometry(0.315, 0.315, 0.006, 36), 2, 2), paint, shield, [0, 0, 0.016], [Math.PI / 2, 0, 0]);
    // plank seams
    for (const x of [-0.2, -0.1, 0, 0.1, 0.2]) { const h = 2 * Math.sqrt(0.315 ** 2 - x * x); w.add(new THREE.BoxGeometry(0.004, h, 0.004), leatherDark, shield, [x + 0.05, 0, 0.019]); }
    w.add(new THREE.TorusGeometry(0.325, 0.02, 8, 40), plateM, shield, [0, 0, 0.01]);
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; w.add(stud(0.01), plateM, shield, [Math.cos(a) * 0.29, Math.sin(a) * 0.29, 0.018]); }
    w.add(lathe([[0.1, 0], [0.098, 0.015], [0.08, 0.035], [0.05, 0.055], [0.001, 0.065]], 20), plateM, shield, [0, 0, 0.015], [Math.PI / 2, 0, 0]);
    w.build();
    // four iron straps radiating from the boss
    const bars = new Sculpt();
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      bars.add(new THREE.BoxGeometry(0.035, 0.18, 0.008), darkSteel, shield, [Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0.021], [0, 0, a - Math.PI / 2]);
      bars.add(stud(0.008), plateM, shield, [Math.cos(a) * 0.14, Math.sin(a) * 0.14, 0.025]);
      bars.add(stud(0.008), plateM, shield, [Math.cos(a) * 0.26, Math.sin(a) * 0.26, 0.025]);
    }
    bars.build();
  }
  const palm = joint(shield, 0, 0, 0.1);

  yield;
  // the fur sways: a spring on each collar and cuff lags the joint's acceleration (furSway.ts)
  const legs = new LegIK(j);
  /** smooths every cut between poses: an action starting, restarting or ending */
  const fade = new PoseFade(j);
  yield;
  // (through the eyes the weapons are placed after the pose's fade, so they fade on their own: each hand's, a
  // two-hander's by its right)
  const eyesR = new ViewFade(), eyesL = new ViewFade();
  const clothes = S.build(), gloves = H.build(), sleeves = B.build(), plates = A.build();
  const harness: THREE.Object3D[] = [...plates, skirtMesh, ...tassets.map((t) => t.g)];
  const furs = [...clothes, ...plates, ...gloves].filter((m) => m.material === furM).map((m) => { m.userData.fur = true; return new FurSway(m, furM); });
  const elbowFur = [j.elbowL, j.elbowR].flatMap((e) => e.children.filter((c) => c.userData.fur));
  yield;
  // each item's parts glowing in its rarity's colour (itemGlow.ts): the weapon in each hand, the shield, the helm, the
  // armour, the bracers and gloves (the hands' own copies kept)
  const glows = new ItemGlows(kit.mats)
    .add('weapon', [...weapons.values()].map((w) => w.group))
    .add('offhand', [...[...offWeapons.values()].map((w) => w.group), shield])
    .add('head', [helm])
    .add('chest', harness)
    .add('hands', gloves)
    .add('hands', [handL.glove, handR.glove], { inPlace: true });
  /** a hands item worn (the elbows' fur is the bracers') */
  let gloved = true;

  const root = j.root;
  root.scale.setScalar(1.1);

  yield;
  // right-arm swings and chops yaw last, so the straight arm sweeps around the vertical axis
  // (with no yaw this order poses exactly like the default)
  j.shoulderR.rotation.order = 'YXZ';
  j.shoulderL.rotation.order = 'YXZ';

  yield;
  // swings in a row alternate forehand / backhand, a row begun again after a pause (`SWING_HOLD`) with the forehand;
  // a new swing starts when the action restarts. With a
  // weapon in each hand they alternate hands instead: the backhand side is the left hand's forehand
  let side = 1, lastK = 1, lastName = '', lastCharged = false;
  let tailName = '', tailT = 0;
  yield;
  // (whether the fade under way is a two-hander's way back to its guard out of a move, placed by the weapon)
  let backOut = false;
  yield;
  // (the foe an overhead blow comes down on this frame, `AnimState.strike`)
  let strikeOn: Struck | null = null;
  /** when a swing last ended, and whether this one follows straight on from it (it starts wound, where the last one
   *  finished); and whether it's the next of a row, begun while the last one's end was held (`SWING_HOLD`) */
  let swingEnd = -9, chain = false, inRow = false;
  /** through the eyes, how long a keyed way back after a cut's held end has to go, of how long (`TWO_OUT`,
   *  `ONE_OUT`) */
  let outT = 0, outLong = TWO_OUT;
  /** and how long a two-hander's way back to its guard out of Steel Tempest's spin has to go (of `SPIN_BACK`) */
  let spinOutT = 0;
  /** through the eyes, whether the right and left hands are going back to rest from their own cut's end
   *  (`dipUnder`) */
  let backR = false, backL = false;
  /** through the eyes, the arm the swing keyed this frame, if it keyed one (the lab's: `Model.swingKeyed`) */
  let keyed: KeyedArm | null = null;
  /** through the eyes, the trunk's turn a two-hander's last cut left (rad), faded out as its place is: let go of in a
   *  frame, the shoulders and the whole swing they carry jumped back under the eyes */
  let twoTurnHeld = 0;
  const keyedArm = { hand: 'right' as 'right' | 'left', shoulder: new THREE.Vector3(), elbow: new THREE.Vector3(), grip: new THREE.Vector3(), dir: new THREE.Vector3(), flat: new THREE.Vector3(), weight: 0, armShare: 1 };
  const keyArm = (hand: 'right' | 'left', shoulder: THREE.Vector3, elbow: THREE.Vector3, grip: THREE.Vector3, dir: THREE.Vector3, flat: THREE.Vector3, weight: number, armShare = 1): void => {
    keyedArm.hand = hand;
    keyedArm.weight = weight;
    keyedArm.armShare = armShare;
    keyedArm.shoulder.copy(shoulder);
    keyedArm.elbow.copy(shoulder).add(elbow);
    keyedArm.grip.copy(grip);
    keyedArm.dir.copy(dir).normalize();
    keyedArm.flat.copy(flat).normalize();
    keyed = keyedArm;
  };
  const unkey = (): void => {
    keyed = null;
  };
  /** when the last attack was: the feet keep the fighting stance a while after it */
  let fightT = -9;
  /** both hands empty: how far the fists are up in their guard */
  let fistsUp = 0;
  /** where an action puts the feet this frame (standing): the left foot's spot and turn, then the right's (LegIK.stance); null the fighting stance */
  let feet: readonly number[] | null = null;
  /** through the eyes, how far Power Strike's blow is still held after the cast (1 at the end, fading) */
  let chopTail = 0;
  /** a two-hander's way back to its guard out of a move, faded by the weapon (`backOut`), in the chest's frame: the
   *  grip, the weapon's turn (its way and its flat's) and the elbow as drawn last frame, where the way back left from,
   *  and where the pose holds them now. Each model's own: shared by every warrior, the hall of heroes' copy went back
   *  to its guard from where the lobby's hidden hero had drawn his weapon, and the axe's tip jumped 2.2 m in a frame */
  const DRAWN_AT = new THREE.Vector3(), DRAWN_TURN = new THREE.Quaternion(), DRAWN_POLE = new THREE.Vector3(0, -1, 0);
  const BACK_AT = new THREE.Vector3(), BACK_TURN = new THREE.Quaternion(), BACK_POLE = new THREE.Vector3();
  const GUARD_AT = new THREE.Vector3(), GUARD_TURN = new THREE.Quaternion(), GUARD_POLE = new THREE.Vector3();
  /** the foe a blow comes down on, kept through its end (`strikeOn`): each model's own too */
  const _strikeOn: Struck = { x: 0, z: 0, r: 0, top: 0 };
  /** the share of a two-hander's Power Strike its blow stopped at on something high (1: none, `STUCK_LIFT`) */
  let chopStuck = 1;
  /** and a two-hander's way back from it to its guard (`TWO_POWERS`, `TWO_SMITES`) */
  let chopBack: ViewSwing | null = null;

  /** `CHOP_FEET` taken `k` of the way to a two-hander's landing stance (`LAND_FEET`: the left foot's step in). */
  function landFeet(k: number): readonly number[] {
    for (let i = 0; i < 6; i++) _landFeet[i] = CHOP_FEET[i];
    _landFeet[1] = lerp(CHOP_FEET[1], LAND_FEET.front, k);
    _landFeet[4] = lerp(CHOP_FEET[4], LAND_FEET.back, k);
    return _landFeet;
  }

  function setGear(gear: Gear): void {
    for (const w of weapons.values()) w.group.visible = false;
    held = gear.weapon ? weapons.get(gear.weapon) ?? weapons.get('Sword')! : null;
    if (held) held.group.visible = true;
    if (held?.off != null) offGrip.position.y = held.off;
    shield.visible = gear.shield;
    // (a cropped look's tufts under the helm too)
    helm.visible = gear.helm; for (const m of [...head.hair, ...(head.crop ? [head.crop] : [])]) m.visible = !gear.helm;
    for (const o of harness) o.visible = gear.chest;
    gloved = gear.hands;
    for (const o of gloves) o.visible = gloved;
    for (const o of sleeves) o.visible = !gloved;
    for (const f of elbowFur) f.visible = gloved && !fp;
    bare(handL, !gloved); bare(handR, !gloved);
    for (const w of offWeapons.values()) { w.group.visible = false; gripL.add(w.group); w.group.position.set(0, 0, 0); }
    sheathed = false;
    offHeld = gear.offWeapon ? offWeapons.get(gear.offWeapon) ?? offWeapons.get('Sword')! : null;
    mountAll();
    frog.visible = !!offHeld; rings[0].visible = !!offHeld?.hang?.down; rings[1].visible = !!offHeld && !offHeld.hang?.down;
    if (offHeld) offHeld.group.visible = true;
    // each seated in its fist, the hand on its wrist
    if (held) seat(handR, grip, held.r);
    if (offHeld) { seat(handL, gripL, offHeld.r); tipL.position.y = offHeld.len; }
    tipOn(false);
    if (held) { bladeR.from.position.y = held.edge[0]; bladeR.to.position.y = held.edge[1]; }
    if (offHeld) { bladeL.from.position.y = offHeld.edge[0]; bladeL.to.position.y = offHeld.edge[1]; }
    glows.set(gear);
  }

  /** Where a blow coming down at (`x`, `z`) lands: the top of the foe it strikes (`AnimState.strike`) within its body,
   *  else the floor, a prop's top or the arena's wall's. */
  function landHeight(x: number, z: number): number {
    const on = strikeOn;
    const floor = Math.max(groundHeight(x, z), propTopAt(x, z), wallTopAt(x, z));
    if (on && Math.hypot(x - on.x, z - on.z) < on.r) return Math.max(on.top, floor);
    return floor;
  }

  /** Where a weapon `len` long, held at (`x`, `y`, `z`) and brought down straight ahead along (`fx`, `fz`), first
   *  meets something (into `_land`: how far ahead of the hands, and the height there): its head swung down from level
   *  along its arc until it meets the top of the foe it strikes or the floor, whatever their height (from play:
   *  "weapon should hit whatever target it hits, if dummy, then dummy, if enemy that enemy, adjust for height, if
   *  nothing, it should hit the floor"). Aimed at the floor 0.8 of its length ahead, on a plinth in the hall of
   *  heroes it was aimed at the stage below and came down on the plinth at his feet, and the floor's stop turned
   *  the arm 9 cm into his thigh and 16 into his belly to put it right. */
  function landing(x: number, z: number, fx: number, fz: number, len: number, y: number): THREE.Vector2 {
    let over = 0;
    let under = ARC_LOWEST;
    if (headUnder(x, z, fx, fz, len, y, under)) {
      // (the first angle down whose head is under what's there, then halved to it)
      for (let a = -ARC_STEP; a > ARC_LOWEST; a -= ARC_STEP) {
        if (headUnder(x, z, fx, fz, len, y, a)) {
          under = a;
          break;
        }
        over = a;
      }
      for (let i = 0; i < ARC_HALVINGS; i++) {
        const a = (over + under) / 2;
        if (headUnder(x, z, fx, fz, len, y, a)) under = a;
        else over = a;
      }
    }
    const ahead = len * Math.cos(under);
    return _land.set(ahead, y + len * Math.sin(under));
  }

  /** Whether a weapon's head, `angle` under level along its arc (as `landing` swings it), is under what's there. */
  function headUnder(x: number, z: number, fx: number, fz: number, len: number, y: number, angle: number): boolean {
    const ahead = len * Math.cos(angle);
    // (the head is broad: what lies under its back as well as its point, so it comes down on a step's edge and not
    // past it into the step's face)
    const back = ahead - HEAD_BACK * root.scale.x;
    const under = Math.max(landHeight(x + fx * ahead, z + fz * ahead), landHeight(x + fx * back, z + fz * back));
    return y + len * Math.sin(angle) <= under;
  }

  /** The weapon arm, `k` of the way, where a blow into the ground ends, placed from the weapon: its head on what it
   *  meets swung down straight ahead from the grip before the middle of him (`GROUND`), the foe it strikes, raised
   *  ground or the floor, at whatever height (from play: "weapon should hit whatever target it hits, if dummy, then
   *  dummy, if enemy that enemy, adjust for height, if nothing, it should hit the floor"), and the weapon no steeper
   *  than `SQUAT.slope`: where that leaves it over lower ground, he squats until it lands there, by at most
   *  `SQUAT.most`, and only past that does it point steeper ("to reach down, he might need to squat a little, not to
   *  lose balance"). (Placed by the hands, the arm then turned about the shoulder until the head was on the floor:
   *  off a step it swung into his belly, 11 to 13 cm, and the left hand let go. With the hands raised over a foe's
   *  top, the arms went up overhead after the blow had come down, the shoulder 119 degrees past its raise.) */
  function holdAtFloor(k: number): void {
    root.updateMatrixWorld(true);
    const s = root.scale.x, len = tip.position.y * s;
    const way = _hw2.set(0, 0, 1).transformDirection(root.matrixWorld), level = Math.hypot(way.x, way.z) || 1;
    const fx = way.x / level, fz = way.z / level;
    const feet = root.getWorldPosition(_hw1);
    // (his right is the way he faces turned a quarter round, -z for +x)
    const ax = feet.x + (fx * GROUND.ahead - fz * GROUND.side) * s, az = feet.z + (fz * GROUND.ahead + fx * GROUND.side) * s;
    // (over the ground he stands on: over the ground ahead, on a plinth in the hall of heroes the hands came down by
    // its height, the weapon stood straight down and the left hand let go of it, "holding it with just one hand")
    const base = groundHeight(feet.x, feet.z);
    let ay = base + GROUND.high * s;
    // (the weapon headed `GROUND.yaw` to his right of straight ahead, its butt out past his left hip)
    const turn = GROUND.yaw, wx = fx * Math.cos(turn) - fz * Math.sin(turn), wz = fz * Math.cos(turn) + fx * Math.sin(turn);
    let down = downTo(ax, az, wx, wz, len, ay);
    // (what stands high, a dummy's top, a pillar's face, is struck from the swing as it comes down and held there:
    // held out low before him onto a foe's top or a pillar, the arm went up and back past the shoulder's raise)
    k *= 1 - ramp(_land.y - base, HIGH_ON[0] * s, HIGH_ON[1] * s);
    if (k <= 0) return;
    if (down > SQUAT.slope) {
      // (what lies under the head at the slope, and how far he squats for the head to come down on it there)
      const ahead = len * Math.cos(SQUAT.slope);
      const under = landHeight(ax + wx * ahead, az + wz * ahead);
      const drop = clamp(ay - len * Math.sin(SQUAT.slope) - under, 0, SQUAT.most * s) * k;
      j.body.position.y -= drop / s;
      root.updateMatrixWorld(true);
      ay -= drop;
      down = downTo(ax, az, wx, wz, len, ay);
    }
    _hw1.set(ax, ay, az);
    _hw2.set(wx * Math.cos(down), -Math.sin(down), wz * Math.cos(down));
    // (its edge leading, its flat facing his sides: rolled as the arm was fitted, a greataxe's blade met the floor and
    // a dummy flat on, 48 degrees off the blow's line, "nobody hits like this")
    // (whichever side it faces already: rolled to one alone, it was turned half round as often as not)
    _hw3.set(-wz, 0, wx);
    if (_hw4.copy(FLAT_IN_GRIP).transformDirection(grip.matrixWorld).dot(_hw3) < 0) _hw3.negate();
    holdInWorld(ARM_R, _hw1, _hw2, SM_POLE.fromArray(GROUND.pole), k, _hw3, k * EDGE_ON.k);
  }

  /** How far under level (rad) a weapon `len` long held at (`x`, `y`, `z`) points as its head comes down on what it
   *  meets straight ahead along (`fx`, `fz`), `landing`'s arc. */
  function downTo(x: number, z: number, fx: number, fz: number, len: number, y: number): number {
    const land = landing(x, z, fx, fz, len, y);
    return Math.atan2(y - land.y, land.x);
  }

  /** The weapon turned in the fist, `k` of the way, to point in the upright plane straight ahead, `u` of the way down
   *  from pointing `up` (rad over level ahead) to the floor as far off as its length reaches: a blow driven into the
   *  ground ends with its tip on it, whatever the weapon's length (the arm is fitted within its ranges after). */
  function aimAtFloor(k: number, up: number, u: number): void {
    const from = grip.getWorldPosition(_gs1), len = tip.position.y * root.scale.x;
    // (straight ahead of the body, level)
    const way = _gs2.set(0, 0, 1).transformDirection(root.matrixWorld), level = Math.hypot(way.x, way.z) || 1;
    const fx = way.x / level, fz = way.z / level;
    const land = landing(from.x, from.z, fx, fz, len, from.y);
    const down = lerp(up, -Math.atan2(from.y - land.y, land.x), u);
    _gs2.set(fx * Math.cos(down), Math.sin(down), fz * Math.cos(down));
    _gs3.set(0, 1, 0).transformDirection(grip.matrixWorld);
    // (turned about the line square to both ways; nearly opposite, where that line is lost and a frame turned the
    // forearm round the other way, about the line across the body, through ahead of him)
    _gs1.crossVectors(_gs3, _gs2);
    if (_gs1.lengthSq() < 1e-4) _gs1.set(-fz, 0, fx);
    _gsq.setFromAxisAngle(_gs1.normalize(), _gs3.angleTo(_gs2) * k).multiply(j.handR.getWorldQuaternion(_pq));
    j.handR.quaternion.copy(j.elbowR.getWorldQuaternion(_hq).invert().multiply(_gsq));
  }

  /** The weapon arm turned up about its shoulder, `k` of the way, until no point of the weapon is under the floor:
   *  the floor stops a blow driven into it, and once it has `landed` it rests there (turned down onto it too, until
   *  a point of it touches); returns the turn it gave (rad, up). It turns in the upright plane through the shoulder and the tip, so the weapon comes up
   *  as it would on the ground, along the line the blow came down. (Stopped by its tip alone, an axe's or a maul's
   *  head went into the floor to its middle; by its lowest point, turned each its own way, the haft's end behind
   *  the hands was pulled down to the floor as the blow landed, and the lower hand let go.) */
  function groundStop(k: number, landed: boolean, downK = k): number {
    const at = tip.getWorldPosition(_gs1), sh = j.shoulderR.getWorldPosition(_gs2);
    const dx = at.x - sh.x, dz = at.z - sh.z, out = Math.hypot(dx, dz);
    if (out < 1e-3) return 0;
    let turn = floorTurn(sh, dx / out, dz / out);
    if (turn === null || (turn <= 0 && !landed)) return 0;
    // (lifted, as little as leaves it clear of what it went into, each point read where the lift takes it: lifted to
    // over what's there, it was raised up a pillar's whole height, and the shoulder went 111 degrees past)
    if (turn > 0) turn = leastLift(sh, dx / out, dz / out, turn);
    // (turned down, as far as it goes with every point still over the floor where the turn takes it: turned down by
    // the floor under each where it was, an axe's head out past a dais's edge came back over the step and down 17 cm
    // into it)
    if (turn < 0 && !clearAfter(sh, dx / out, dz / out, turn)) {
      let over = 0, under = turn;
      for (let i = 0; i < STOP_ROUNDS; i++) {
        const half = (over + under) / 2;
        if (clearAfter(sh, dx / out, dz / out, half)) over = half;
        else under = half;
      }
      turn = over;
    }
    // (about the level line across the way to the tip, turned into the shoulder's parent's space: a positive turn
    // lifts what's ahead of the shoulder)
    const parent = j.shoulderR.parent!.getWorldQuaternion(_gsq).invert();
    _gs3.set(-dz / out, 0, dx / out).applyQuaternion(parent);
    const by = turn < 0 ? downK : k;
    j.shoulderR.quaternion.premultiply(_gsq.setFromAxisAngle(_gs3, turn * by));
    return turn * by;
  }

  /** The least turn about the level line through the shoulder `sh` across the way (`wx`, `wz`) that leaves every
   *  point of the weapon ahead of the shoulder at or over the floor under it (rad, up; less than 0, down until
   *  the first touches), or none if no point of it can reach the floor. */
  function floorTurn(sh: THREE.Vector3, wx: number, wz: number): number | null {
    held!.group.updateWorldMatrix(true, false);
    let turn: number | null = null;
    for (const p of lowPoints(held!)) {
      _gs3.copy(p).applyMatrix4(held!.group.matrixWorld);
      // (in the upright plane across the line the turn is about: out along the way, and up)
      const along = (_gs3.x - sh.x) * wx + (_gs3.z - sh.z) * wz, up = _gs3.y - sh.y, r = Math.hypot(along, up);
      const floor = landHeight(_gs3.x, _gs3.z) - sh.y;
      // (a point behind the shoulder goes down as the weapon comes up; one nearer it than the floor never meets it:
      // counted as turned at most straight down, a maul's butt below the shoulder held the blow off the floor)
      if (along <= 0 || r < -floor) continue;
      const need = Math.asin(clamp(floor / r, -1, 1)) - Math.atan2(up, along);
      if (turn === null || need > turn) turn = need;
    }
    return turn;
  }

  /** The least turn up (rad) about the level line through the shoulder `sh` across the way (`wx`, `wz`) that leaves
   *  the weapon clear of what's under it (`clearAfter`), up to `most` (the floor's own turn up, `floorTurn`). */
  function leastLift(sh: THREE.Vector3, wx: number, wz: number, most: number): number {
    let into = 0;
    for (let lift = LIFT_STEP; lift < most; lift += LIFT_STEP) {
      if (!clearAfter(sh, wx, wz, lift)) {
        into = lift;
        continue;
      }
      let clear = lift;
      for (let i = 0; i < STOP_ROUNDS; i++) {
        const half = (into + clear) / 2;
        if (clearAfter(sh, wx, wz, half)) clear = half;
        else into = half;
      }
      return clear;
    }
    return most;
  }

  /** Whether every point of the weapon ahead of the shoulder `sh` would be at or over the floor turned `turn` (rad,
   *  up) about the level line through it across the way (`wx`, `wz`), as `groundStop` turns it: each round the
   *  shoulder in the upright plane along that way, its offset across it kept. */
  function clearAfter(sh: THREE.Vector3, wx: number, wz: number, turn: number): boolean {
    const cos = Math.cos(turn), sin = Math.sin(turn);
    for (const p of lowPoints(held!)) {
      _gs3.copy(p).applyMatrix4(held!.group.matrixWorld);
      const along = (_gs3.x - sh.x) * wx + (_gs3.z - sh.z) * wz, up = _gs3.y - sh.y;
      if (along <= 0) continue;
      const moved = cos * along - sin * up - along, y = sh.y + sin * along + cos * up;
      if (y < landHeight(_gs3.x + wx * moved, _gs3.z + wz * moved) - STOP_TOUCH) return false;
    }
    return true;
  }

  /** The tip the skills read (trail, cast point): the left weapon's during a left-hand swing. */
  function tipOn(left: boolean): void {
    const at = left && offHeld ? gripL : grip;
    if (tip.parent !== at) at.add(tip);
    tip.position.y = (left && offHeld ? offHeld : held)?.len ?? 0;
  }

  const shY = j.shoulderL.position.y;
  yield;
  // the healing draught, in the left fist while it is drunk
  const flask = buildFlask(kit); flask.name = 'flask'; j.handL.add(flask);
  let flaskOut = 0, shieldHang = 0, drinkOn = 0;
  /** which way the shield hangs as it eases off: out beside his leg from a sit, else before his chest from a draught
   *  (from which is the more now, it turned from out to ahead as the sit ended, eased 5% on, and went 50 cm) */
  let hangOut = false;
  /** how far a two-hander is on the shoulder (`SHOULDER_AT`), and how long the left hand has left to take its lower
   *  grip as it comes off (s: `TAKE_HOLD`) */
  let shouldered = 0, shoulderT = 0, takingHold = 0;
  /** how far the left hand is still off a two-hander's lower grip for the shoulder carry: up with the carry, down over
   *  `TAKE_HOLD` once it's off (with the carry's own share, cut at once for a move, the hand came from hanging onto the
   *  haft in a frame, 39 cm, as Power Strike began) */
  let leftOff = 0;
  /** how long the left hand has left to come back onto a two-hander's lower grip off the flask (s: `TAKE_HOLD`) */
  let regrip = 0;
  /** a two-handed move placed by the weapon this frame, in the chest's frame: its grip, its way, its flat's and how far
   *  it takes the arm (`holdInChest`, after the whole body is posed) */
  const twoHold = { at: new THREE.Vector3(), dir: new THREE.Vector3(), flat: new THREE.Vector3(), pole: SW2_POLE, k: 0, flatK: 0 };
  /** how surely the left hand holds a two-hander's lower grip: it lets go of one no turn of the hand keeps the arm within its ranges for */
  let twoGood = 1;
  // (his left arm faded over `LEFT_SWITCH` s from as it was drawn, as he sits or stands, when how it's placed changes:
  // its own pose fitted, eased towards a two-hander's lower grip, or on it. Solved each its own way, its elbow went 13 to
  // 25 cm in the frame it changed)
  const leftShown = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
  const leftFrom = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
  // (and each joint's turn over the frame before, carried on through the fade: faded from the arm frozen as drawn, his
  // hand stopped dead for a frame, 8 cm a frame to none)
  const leftWas = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
  const leftTurn = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
  const _turnNow = new THREE.Quaternion();
  let leftModeWas = -1, leftFadeW = 0;
  /** the lower grip as the left hand held it this frame (`Model.lowerGrip`) */
  const grasp: LowerGrip = { held: false, free: false, short: 0, past: 0, into: 0 };
  /** each hand's slant on its handle this frame (rad, armIK.ts) */
  let slantR = 0, slantL = 0;
  /** what the standing hold's solves remembered as each arm's sit began, for it to take up again (`recall`) */
  let standR: ArmMemory | null = null, standL: ArmMemory | null = null;
  /** the slant a swing through the eyes holds each fist's handle at (rad, `ViewSwing.slant`), kept while its hold fades */
  let swingSlantR = 0, swingSlantL = 0;
  yield;
  // a weapon in the left hand hangs on the belt while the hand is busy with the flask: in a leather frog at the
  // left hip, worn whenever there is a second weapon. A sword sits in it by its guard, the hilt forward and up
  // and the blade raked back along the outside of the thigh, flat to it; an axe or mace by its haft, head up.
  const frog = joint(j.hips, 0.212, -0.012, 0.03); frog.name = 'frog';
  const hangDown = joint(frog), hangUp = joint(frog);
  const basis = (o: THREE.Object3D, y: THREE.Vector3) => {
    const z = V(1, 0, 0).addScaledVector(y, -y.x).normalize(), x = new THREE.Vector3().crossVectors(y, z);
    o.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  };
  basis(hangDown, V(0.16, -0.72, -0.68).normalize()); basis(hangUp, V(0.06, 0.97, 0.22).normalize());
  const tab = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.07, 0.034), leather); tab.position.set(0.004, 0.012, 0); frog.add(tab);
  const ring = (o: THREE.Object3D, r: number, sx: number) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.007, 6, 14), leatherDark); m.rotation.x = Math.PI / 2; m.scale.set(sx, 1, 1); m.position.y = -0.01; o.add(m); return m; };
  const rings = [ring(hangDown, 0.034, 1.5), ring(hangUp, 0.03, 1)];
  for (const m of [tab, ...rings]) m.castShadow = false;
  frog.visible = false;
  let sheathed = false;
  const _s1 = new THREE.Vector3(), _s2 = new THREE.Vector3(), _s3 = new THREE.Vector3(), _s4 = new THREE.Vector3(), _s5 = new THREE.Vector3(), _sm = new THREE.Matrix4(), _shq = new THREE.Quaternion();
  /** seat every weapon in its fist the way a real one is held, through the eyes too (left as the poses there were
   *  keyed before, a blade's edge lay in the palm: turned narrow to the eyes at rest, the fist showed its palm and
   *  its fingers splayed past the hilt) */
  function mountAll(): void { for (const w of [...weapons.values(), ...offWeapons.values()]) w.group.rotation.y = w === offHeld && sheathed ? 0 : MOUNT; }
  /** turn a hand by `ang` about the length of the weapon in its grip */
  const edgeOn = (hand: THREE.Object3D, g: THREE.Object3D, ang: number): void => {
    _hd.set(0, 1, 0).applyQuaternion(g.quaternion);
    hand.quaternion.multiply(_hq.setFromAxisAngle(_hd, ang));
  };
  const ARM_R = { shoulder: j.shoulderR, elbow: j.elbowR, hand: j.handR, grip }, ARM_L = { shoulder: j.shoulderL, elbow: j.elbowL, hand: j.handL, grip: gripL };

  /** Through the eyes, a weapon held where it's seen: the arm reaches so its grip sits at `at` in the view
   *  (camera space) and the wrist turns the weapon onto `dir` (the least turn from the forearm, so the fist
   *  keeps its roll). `k` blends it in over the pose so far; `soft` eases its reach into its end (`reachArm`). */
  function holdInView(arm: typeof ARM_R, at: THREE.Vector3, dir: THREE.Vector3, pole: THREE.Vector3, k: number, flat?: THREE.Vector3, flatK = 0, soft = 0): void {
    const { shoulder, elbow, hand, grip: g } = arm;
    root.updateMatrixWorld(true);
    fromEyes(root, j.neck, at, _gw).lerp(g.getWorldPosition(_cur), 1 - k);
    dirFromEyes(root, dir, _dw).normalize().lerp(_cur.set(0, 1, 0).transformDirection(g.matrixWorld), 1 - k).normalize();
    const flatW = flat && flatK > 0 ? dirFromEyes(root, flat, _hw3).normalize() : null;
    hand.quaternion.slerp(IDENT, k);
    // (the grip sits a little off the wrist: a few rounds of reaching, then turning, settle it)
    for (let i = 0; i < 3; i++) {
      hand.getWorldPosition(_hp).add(_gw).sub(g.getWorldPosition(_cur));
      reachArm(shoulder, elbow, j.P.upperL, j.P.foreL, j.chest.worldToLocal(_hp), pole, 1, soft);
      shoulder.updateMatrixWorld(true);
      _cur.set(0, 1, 0).transformDirection(g.matrixWorld);
      _hq.setFromUnitVectors(_cur, _dw).multiply(hand.getWorldQuaternion(_pq));
      if (flatW) rollFlat(_hq, g, flatW, flatK);
      hand.quaternion.copy(elbow.getWorldQuaternion(_pq).invert().multiply(_hq));
      hand.updateMatrixWorld(true);
    }
  }

  const _dv = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  /** Where the weapon in grip `g` is drawn in the view (its grip's place, its way and its flat, as `holdInView` takes
   *  them), told to `fade` for its next cut to fade from. */
  function drawnInView(fade: ViewFade, g: THREE.Object3D): void {
    root.updateMatrixWorld(true);
    intoEyes(root, j.neck, g.getWorldPosition(_cur), _dv[0]);
    dirIntoEyes(root, _cur.set(0, 1, 0).transformDirection(g.matrixWorld), _dv[1]);
    dirIntoEyes(root, _cur.copy(FLAT_IN_GRIP).applyQuaternion(g.getWorldQuaternion(_pq)), _dv[2]);
    fade.shown(_dv[0], _dv[1], _dv[2]);
  }

  const _fwd = new THREE.Vector3(), _ax = new THREE.Vector3(), _pv = new THREE.Vector3();
  /** How far the body is turned about its own up (rad, as drawn: the pose's fade turns it back the short way). Steel
   *  Tempest's spin alone turns it. */
  function turnOfBody(): number {
    _fwd.set(0, 0, 1).applyQuaternion(j.body.quaternion);
    return Math.atan2(_fwd.x, _fwd.z);
  }
  /** Places in the view (`points`: a grip's, a shoulder's) and ways there (`ways`: a weapon's, its flat, an elbow's),
   *  in place, turned `angle` round the body's own up through it, as the body turned by that carries them. */
  function carryRound(angle: number, points: THREE.Vector3[], ways: THREE.Vector3[]): void {
    root.updateMatrixWorld(true);
    dirIntoEyes(root, _ax.set(0, 1, 0).transformDirection(root.matrixWorld), _ax).normalize();
    intoEyes(root, j.neck, j.body.getWorldPosition(_pv), _pv);
    for (const at of points) at.sub(_pv).applyAxisAngle(_ax, angle).add(_pv);
    for (const way of ways) way.applyAxisAngle(_ax, angle);
  }

  /** The arm's bones in the view (m), as a swing through the eyes reaches with them: the upper arm, the forearm, and
   *  the fist from its wrist to the handle (`fistLength`, the hand as drawn; the grip's place on the joint's line
   *  left the hand out of the arm, and the fist bent round the handle 96 degrees off the forearm). */
  const armBones = (weapon: Weapon | null): ArmBones => {
    _bones.upper = j.P.upperL * root.scale.x;
    _bones.fore = j.P.foreL * root.scale.x;
    _bones.hand = fistLength(handR) * root.scale.x;
    _bones.strike = STRIKES_AT * (weapon?.len ?? 0) * root.scale.x;
    return _bones;
  };
  /** how far a two-hander's upper grip is up the handle from its lower one (m, the view's) */
  /** Through the eyes, a shoulder moved `w` of the way from where `armsFromBelow` put it to `eyes` (the view's: a
   *  swing's, `swingShoulder`). */
  function shoulderTo(shoulder: THREE.Object3D, eyes: THREE.Vector3, w: number): void {
    root.updateMatrixWorld(true);
    shoulder.position.lerp(j.chest.worldToLocal(fromEyes(root, j.neck, eyes, _hw2)), w);
    shouldersMoved = true;
  }

  /** A swing's elbow (`swingAt`'s, the view's way from the shoulder) as a reach's pole in the chest's frame, `w` of
   *  the way from `rest`'s, into `out`. */
  function swingPole(eyes: THREE.Vector3, rest: THREE.Vector3, w: number, out: THREE.Vector3): THREE.Vector3 {
    root.updateMatrixWorld(true);
    dirFromEyes(root, eyes, out).transformDirection(_ti.copy(j.chest.matrixWorld).invert());
    return out.lerp(rest, 1 - w);
  }

  /** Through the eyes, an arm holding a weapon where it's seen brought within a body's ranges (armIK.ts), as third
   *  person's are (`fitArm`): the grip and the weapon's way kept, the fist turned about the handle up to `EYES.roll`
   *  and the handle slanted across the palm up to `slant`, and the elbow round to where neither the forearm's turn nor
   *  the wrist goes past its range. `vis`: the hand's turn on its joint (`gripTurn`). (Placed by the reach and the
   *  least turn of the weapon alone, the wrist bent 126 degrees towards the little finger over a one-hander at rest,
   *  96 past its range, the hand cocked like a hook). `hold`: how far a swing holds the arm as it placed it, its fist
   *  on its handle with the edge into the blow: the fit's arm blended back to that by it, its slant on the handle eased
   *  off (fitted, the fist rolled the edge off the way it moved, the blade stood still against the keys, and the fist
   *  jumped 60 degrees round its handle in a frame; fitted or not by turns, as a swing began and ended, the elbow
   *  jumped 35 cm and the blade 60 degrees in a frame). Returns the slant the fist holds its handle at. */
  function fitInView(left: boolean, g: THREE.Object3D, vis: THREE.Quaternion, slant?: number, hold = 0): number {
    const hd = left ? j.handL : j.handR, el = left ? j.elbowL : j.elbowR, sh = left ? j.shoulderL : j.shoulderR;
    if (hold >= 1) return 0;
    root.updateMatrixWorld(true);
    _fitQ[0].copy(sh.quaternion); _fitQ[1].copy(el.quaternion); _fitQ[2].copy(hd.quaternion);
    const wrist = hd.getWorldPosition(_fw[0]), hand = hd.getWorldQuaternion(_fwq).multiply(vis);
    const axis = _fw[1].set(0, 1, 0).transformDirection(g.matrixWorld), at = g.getWorldPosition(_fw[2]);
    const pole = el.getWorldPosition(_fw[3]).sub(sh.getWorldPosition(_fw[4]));
    const shoulder = _fw[5].copy(sh.position);
    const roll = { axis, range: EYES.roll, at };
    const fit = solveArm(j, left, { wrist, hand, vis, pole, slant, shoulder, roll, wristW: EYES.wrist, flexion: GRIPPED_FLEXION });
    if (hold > 0) {
      sh.quaternion.slerp(_fitQ[0], hold); el.quaternion.slerp(_fitQ[1], hold); hd.quaternion.slerp(_fitQ[2], hold);
    }
    return fit.slant * (1 - hold);
  }

  /** Through the eyes, a two-hander's right arm on a swing its hands place (viewSwing.ts `holds`, `w` of the arm the
   *  swing's: a backhand turned about the left shoulder) brought within a body's ranges: the hand joint and so the
   *  weapon kept exactly as placed (`free`), the fist slanted on the handle as far as `SLANT` (`vis`, its turn on the
   *  joint: `gripTurn`; no arm of the swing's own holds it, so its slant isn't the swing's), and the elbow round to where
   *  the forearm's turn and the wrist go least past theirs, the arm blended to it by `w`. Returns the slant the fist
   *  holds its handle at. (Reached towards where the swing lays out an arm from the left shoulder, the right elbow
   *  tucked low before the chest, the forearm turned 34 degrees past its range palm down, and 24 with the elbow fitted
   *  and the fist at the swing's slant; fitted as `fitInView` fits, rolled on its handle, the blade was drawn 21 to 31
   *  degrees off its keys) */
  function fitHeld(vis: THREE.Quaternion, w: number): number {
    const hd = j.handR, el = j.elbowR, sh = j.shoulderR;
    root.updateMatrixWorld(true);
    const wrist = hd.getWorldPosition(_fw[0]), hand = hd.getWorldQuaternion(_fwq).multiply(vis);
    const posed = el.getWorldPosition(_hb[0]);
    const pole = _fw[3].copy(posed).sub(sh.getWorldPosition(_fw[4]));
    const shoulder = _fw[5].copy(sh.position);
    hd.getWorldQuaternion(_hbq[0]);
    const [keep, maxMove, girdle, shoulderW, wristW] = EYES.held;
    const fit = solveArm(j, false, { wrist, hand, vis, pole, shoulder, slant: SLANT, free: true, keep, maxMove, girdle: girdle > 0, shoulderW, wristW, flexion: GRIPPED_FLEXION });
    // (blended back to the arm as posed by `w`: the shoulder where the girdle moved it, the elbow between the two, and
    // the arm reached to the wrist again, the hand joint between its two turns. Its joints' turns alone blended, the
    // shoulder was held 9 cm up as the way back to the guard ended and dropped there in a frame; and with the shoulder
    // blended too, the hand left its wrist and took the weapon 12 cm past the lower hand's reach)
    if (w < 1) {
      root.updateMatrixWorld(true);
      const elbow = el.getWorldPosition(_hb[1]).lerp(posed, 1 - w);
      hd.getWorldQuaternion(_hbq[1]).slerp(_hbq[0], 1 - w);
      sh.position.lerp(shoulder, 1 - w);
      const chest = sh.parent!;
      const toElbow = chest.worldToLocal(elbow).sub(sh.position);
      reachArm(sh, el, j.P.upperL, j.P.foreL, chest.worldToLocal(_hb[2].copy(wrist)), toElbow);
      root.updateMatrixWorld(true);
      hd.quaternion.copy(el.getWorldQuaternion(_fwq).invert().multiply(_hbq[1]));
    }
    return fit.slant;
  }

  /** Through the eyes, the hand joint turned on its wrist so the fist as it's drawn on it (`vis`, its turn on the joint:
   *  `gripTurn`) lies on the forearm within a gripping wrist's range (anatomy.ts `GRIPPED_FLEXION`), the weapon turning
   *  with it. A move's place blended into another's bent it past: out of one cut into the next the fist flexed 96
   *  degrees, and out of the rest into a cut it went 15 past to the thumb's side. */
  function wristInGrip(left: boolean, vis: THREE.Quaternion): void {
    const hd = left ? j.handL : j.handR;
    _wg[0].copy(hd.quaternion).multiply(vis);
    if (clampWrist(_wg[0], left, _wg[1], GRIPPED_FLEXION) === 0) return;
    hd.quaternion.copy(_wg[1]).multiply(_wg[2].copy(vis).invert());
    hd.updateMatrixWorld(true);
  }
  const _wg = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];

  /** The shoulders' own places on the chest, and whether the eyes have moved them (`armsFromBelow`). */
  const shoulderRest = [j.shoulderR.position.clone(), j.shoulderL.position.clone()];
  let shouldersMoved = false;
  /** Through the eyes, the arms' shoulders low beside and just behind the camera (`EYES.shoulder`), as a game's
   *  first-person arms come up from the screen's bottom corners: an arm bends to what it holds wherever the eyes see
   *  it, and its shoulder is never seen. Out of the eyes, back on the chest. (From the body's own shoulders, a weapon
   *  held to be seen was at arm's length, "physically impossible", and one held as a body holds it was out of the
   *  frame or a slab beside the face) */
  function armsFromBelow(eyes: boolean, two: boolean): void {
    if (!eyes) {
      if (shouldersMoved) { j.shoulderR.position.copy(shoulderRest[0]); j.shoulderL.position.copy(shoulderRest[1]); }
      shouldersMoved = false;
      return;
    }
    root.updateMatrixWorld(true);
    const [x, y, z] = two ? EYES.shoulder : EYES.oneShoulder;
    j.shoulderR.position.copy(j.chest.worldToLocal(fromEyes(root, j.neck, _hw1.set(x, y, z), _hw2)));
    j.shoulderL.position.copy(j.chest.worldToLocal(fromEyes(root, j.neck, _hw1.set(-x, y, z), _hw2)));
    shouldersMoved = true;
  }

  /** a model's hands with nothing to do as he sits */
  const NO_HANDS = { before: 0, after: 0 };
  /** a two-hander's lift to the port, before he goes down, and his way up with its weight (s) */
  const TWO_SIT_HANDS = { before: 2.6, after: 0, up: 1.4, last: true };
  /** a maul's or a greataxe's on a seat: off his shoulder to before him, head up, and down with him (no regrip) */
  const TWO_UP_HANDS = { before: 0, after: 2, up: 1.4 };
  // (by a fire he doesn't turn his hand round on it: held still for that time, he stood frozen, lowered. `after`: his hand
  // coming off it, once he's sat)
  /** how long his left arm's fade lasts as how it's placed changes, sitting or standing (s: `fadeLeftSwitch`) */
  const LEFT_SWITCH = 0.2;
  /** how many times faster that fade goes once his hand holds the grip */
  const LEFT_HELD_FASTER = 3;
  /** how far his left elbow may go in a frame as his hand eases on or off a two-hander far from its grip (m): free, from one
   *  side of a fire it went to its other side in a frame as he let go, his hand 41 cm */
  const EASE_ELBOW = 0.05;
  /** how far ahead of the straight way his left hand goes at most as it eases on or off a two-hander (rig units) */
  const EASE_AHEAD = 0.15;
  const TWO_FLOOR_HANDS = { before: 2.6, after: 0.6, up: 1.4, last: true };
  /** the length a two-hander is lifted off his shoulder by a fire in `floorLiftBy` (m): the maul's */
  const FLOOR_LIFT_LEN = 1.1;
  /** by a fire, of the lift by when his arm is placed by the weapon's path alone, the carry's joints eased off */
  const FLOOR_JOINTS_BY = 0.3;
  const _rightArm = [j.shoulderR, j.elbowR, j.handR];
  const _lapX = new THREE.Vector3(), _lapY = new THREE.Vector3(), _lapZ = new THREE.Vector3();
  const _lapWorld = new THREE.Matrix4(), _lapHand = new THREE.Matrix4();
  const _lapQ = new THREE.Quaternion(), _lapNow = new THREE.Quaternion();
  const _lapWas = new THREE.Quaternion(), _lapRoot = new THREE.Quaternion(), _lapVia = new THREE.Quaternion();
  const _lapFore = new THREE.Vector3(), _lapDown = new THREE.Vector3();
  const _lapFloor = new THREE.Vector3(0, -1, 0);
  /** how each hand's turned in his frame as he began to sit (the left's, the right's), once taken */
  const _lapStood = [new THREE.Quaternion(), new THREE.Quaternion()], _lapTaken = [false, false];
  /** A hand keeping its one-hander as he sits: its weapon turned by `w` to lie along `way` (the root's frame: out to
   *  his left, up, ahead), across his lap, and the back of the hand on from the forearm, as a man rests a weapon
   *  across his thighs. Said in those terms, as the arm's reach alone stood an axe up before his face. */
  function holdAcrossLap(left: boolean, handle: THREE.Object3D, way: readonly number[], w: number, from: number, st: NonNullable<AnimState["sit"]>, down = 0, edge?: readonly number[]): void {
    const hand = left ? j.handL : j.handR, elbow = left ? j.elbowL : j.elbowR;
    root.updateMatrixWorld(true);
    const fore = hand.getWorldPosition(_lapFore).sub(elbow.getWorldPosition(_lapZ));
    // (the handle's way in the hand's frame, and down the fingers, square to it)
    const inHand = _s1.set(0, 1, 0).applyQuaternion(handle.quaternion);
    const fingers = _s2.set(0, -1, 0);
    fingers.addScaledVector(inHand, -fingers.dot(inHand)).normalize();
    _lapHand.makeBasis(inHand, fingers, _s3.crossVectors(inHand, fingers)).invert();
    const turnAlong = (to: readonly number[], out: THREE.Quaternion, downBy = 0): void => {
      const along = _lapX.set(to[0], to[1], to[2]).transformDirection(root.matrixWorld);
      // (the way the hand's length lies, which is the way an axe's edge faces: off the forearm towards the floor by
      // `downBy`. Along a forearm held level by a fire, the axe lay flat with its edge ahead)
      _lapDown.copy(fore).normalize().lerp(_lapFloor, downBy);
      if (edge) _lapDown.set(edge[0], edge[1], edge[2]).transformDirection(root.matrixWorld);
      const square = _lapY.copy(_lapDown).addScaledVector(along, -_lapDown.dot(along)).normalize();
      _lapWorld.makeBasis(along, square, _lapZ.crossVectors(along, square));
      out.setFromRotationMatrix(_lapWorld.multiply(_lapHand));
    };
    turnAlong(way, _lapQ, down);
    // (low on a seat: higher, seen from ahead it stood across his face at two thirds of the way. Higher by a fire, whose
    // arm is out over his knee: low there, his forearm went 3 cm into his thigh and the blade 38 cm in a frame)
    const floorWay = left ? SIT_HANDS.viaFloorL : SIT_HANDS.viaFloorR;
    turnAlong(onFloor(st) ? floorWay : left ? SIT_HANDS.viaL : SIT_HANDS.viaR, _lapVia);
    // (once the hand is on its way down: turned from the start, the blade swept past his face; its pace the sit's own,
    // as eased again its tip went up to 19 cm a frame)
    // (from how it stood as he began, kept in his own frame until then: left in the hand as the arm came in, two blades
    // tipped across his face at a third of the way down)
    const side = left ? 0 : 1, stood = _lapStood[side];
    hand.getWorldQuaternion(_lapNow);
    root.getWorldQuaternion(_lapRoot);
    if (!_lapTaken[side]) {
      stood.copy(_lapRoot).invert().multiply(_lapNow);
      _lapTaken[side] = true;
    }
    // (tipped ahead of him first, then turned across: straight from upright to across his lap, it levered up over his
    // neck and two blades crossed on his face, at about half way)
    const across = ramp(w, from, 1);
    const via = Math.min(1, across / SIT_HANDS.viaAt), on = ramp(across, SIT_HANDS.viaAt, 1);
    _lapWas.copy(_lapRoot).multiply(stood).slerp(_lapVia, smooth(via)).slerp(_lapQ, smooth(on));
    // (and back onto the pose's own as he's nearly up, which it's come to at his last frame)
    _lapNow.slerp(_lapWas, smooth(ramp(w, 0, SIT_HANDS.turnIn)));
    hand.parent!.getWorldQuaternion(_lapQ).invert();
    hand.quaternion.copy(_lapQ).multiply(_lapNow);
  }
  /** Where the arm holds a two-hander as he sits: each joint as he stood with it (`from`, kept every frame he stands,
   *  as drawn) and as it'll rest (`rest`, found once as a sit begins, by posing him sat for a moment). */
  const twoSit = {
    taken: false,
    /** the weapon stood in the ground, where it stays as he sits (world): set as it's lowered */
    stood: false,
    /** how much lower his hips will be than on the seat its rest is set for (m) */
    lower: 0,
    /** how far his hand has turned round on the handle, from the fist that lowered it to the one that holds it upright:
     *  the weapon's head under his little finger, not past his thumb */
    turned: 0,
    standAt: new THREE.Vector3(),
    standQ: new THREE.Quaternion(),
    /** the weapon as it came down in his fist, slanted as his wrist lets it, and upright on its far end as he'll leave it */
    loweredAt: new THREE.Vector3(),
    loweredQ: new THREE.Quaternion(),
    uprightQ: new THREE.Quaternion(),
    endFrom: new THREE.Vector3(),
    endTo: new THREE.Vector3(),
    /** his hand as it held the sword going in, and as it holds it stood, turned round on the handle (world) */
    handFrom: new THREE.Quaternion(),
    handTo: new THREE.Quaternion(),
    /** the grip's turn in his hand as it went into the ground, which it's given back as it leaves it */
    gripWas: new THREE.Quaternion(),
    /** the weapon's way now, in his frame, as his hand takes it */
    wayNow: new THREE.Vector3(),
    from: [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()],
    fromAt: new THREE.Vector3(),
    fromSlant: 0,
    /** whether `from` was kept standing still at least once */
    fromStill: false,
    /** the path it comes down, in his frame: taken in both hands before him, then lowered till its far end is on the ground */
    frontAt: new THREE.Vector3(),
    frontWay: new THREE.Vector3(),
    frontSlant: 0,
    lowAt: new THREE.Vector3(),
    lowWay: new THREE.Vector3(),
    lowSlant: 0,
    /** the flat's way along the path (the palm's side, as his hand holds it) */
    flatFrom: new THREE.Vector3(),
    /** how far his hands come out from him as it passes level */
    pathOut: 0,
    /** of the way down by which it's out at the rest's side and ahead (0: at the path's own pace) */
    sideBy: 0,
    /** how far his hand goes out to his side as it passes level, by a fire */
    pathSide: 0,
    /** whether its way turns at one pace, by a fire: from head up to head down */
    turnsEvenly: false,
    /** by a fire, getting up from it laid on the floor: turned to face it and taken up head first before him, his left
     *  hand by its head (`floorPickAt`, `floorPickWay`, `SitHands.turn`) */
    pickingUp: false,
    /** taking it up keyed (`PICK`), from it laid until he's up */
    keyedUp: false,
    /** by a fire, the sit's own turn in the world, which its path is in whichever way he turns as he takes it up */
    sitQ: new THREE.Quaternion(),
    /** by a fire, the path's first key laying it down, kept as the one taking it up stands in for it */
    layAt: new THREE.Vector3(),
    layWay: new THREE.Vector3(),
    /** by a fire, the path's low key laying it down (`floorLowHand`, `floorLowOut`): getting up, it's where it lies */
    layLowAt: new THREE.Vector3(),
    layLowWay: new THREE.Vector3(),
    /** by a fire, whether he's getting up from it, his body rising */
    rising: false,
    /** by a fire, taking it up: where he stands to (world, on the floor), the way he faces then (rad), the weapon's way
     *  along the floor and how far its handle runs behind his fist where he fights with it (m) (`pickStance`) */
    pickAt: new THREE.Vector3(),
    pickYaw: 0,
    pickAlong: new THREE.Vector3(),
    pickBehind: 0,
    /** by a fire, how far the weapon was slid forward through his fist last frame (m), to be taken off before the path
     *  places it again (`floorPickSlide`) */
    slid: 0,
    /** by a fire, how far down the sit was last frame, and his hands' stage once sat */
    wWas: 0,
    afterWas: 0,
    /** by a fire, the grip's place and the weapon's way on his shoulder this frame, in his frame: it's lifted off from there
     *  along a path of its own (`weaponOnPath`'s `lifted`) */
    carryAt: new THREE.Vector3(),
    carryWay: new THREE.Vector3(),
    /** a maul or a greataxe stood head up on a seat this frame, its grip placed under his fist (`buttDown`) */
    upright: false,
    /** where it's stood head up between his feet and its way there, in his frame, before it's leant out to his right */
    uprightAt: new THREE.Vector3(),
    uprightWay: new THREE.Vector3(),
    /** his hands' stage sat last frame, and whether it's setting the weapon down (else taking it up) */
    handsWas: 0,
    settingDown: true,
    /** where it lies by a fire, in his frame */
    restGrip: new THREE.Vector3(),
    restWay: new THREE.Vector3(),
    /** by a fire, let go of: where it lies (world), and the grip's place and turn in his hand as he let it go */
    laid: false,
    laidAt: new THREE.Vector3(),
    laidQ: new THREE.Quaternion(),
    laidGrip: new THREE.Quaternion(),
    laidGripAt: new THREE.Vector3(),
    /** the arm as it holds what it's laid, by a fire: eased from it to his knee */
    holding: [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()],
  };
  const _allJoints = Object.values(j).filter((o): o is THREE.Object3D => o instanceof THREE.Object3D);
  const _jointsWere = _allJoints.map((o) => ({ at: new THREE.Vector3(), q: new THREE.Quaternion() }));
  const _standTurn = new THREE.Quaternion(), _gripHome = new THREE.Vector3(), _seatWas = new THREE.Vector3();
  const _noTurn = new THREE.Quaternion(), _restRight: number[] = [1];
  const _pathAt = new THREE.Vector3(), _pathWay = new THREE.Vector3(), _pathFlat = new THREE.Vector3(), _pathTurn = new THREE.Quaternion();
  const _liftTurn = new THREE.Quaternion();
  const _sitFrame = new THREE.Matrix4(), _sitFrameInverse = new THREE.Matrix4();
  const _frameAt = new THREE.Vector3(), _frameScale = new THREE.Vector3(), _frameQ = new THREE.Quaternion();
  /** by a fire, how far the weapon is slid forward through his fist this frame (m), his fist by its butt to take it up */
  let pickSlide = 0;
  /** by a fire, this frame is the keyed pick-up's (`PICK`), and how far into it (0 to 1) */
  let pickKeyed = false;
  let pickK = 0;
  const _pickOwn = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
  const _pickFrom = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
  const _pickReach = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
  const _pickButt = new THREE.Vector3(), _pickWay = new THREE.Vector3(), _pickQ = new THREE.Quaternion();
  const _carryButt = new THREE.Vector3(), _carryQ = new THREE.Quaternion(), _pickFist = new THREE.Vector3();
  const _pickPole = new THREE.Vector3(), _pickUp = new THREE.Vector3(0, 1, 0), _pickFeet = new THREE.Vector3();
  const _pickHeld = new THREE.Vector3(), _pickSeatedAt = new THREE.Vector3(), _pickSeatedQ = new THREE.Quaternion();
  /** how far the weapon is still eased from where the keyed pick-up left it in the world (1 to 0, over `PICK_OFF` s) */
  let pickOff = 0;
  /** his right arm as the standing pose has it this frame, its shoulder's place, and the slant its fit last took */
  const _standArm = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
  const _standAt = new THREE.Vector3();
  let _carrySlant = 0;
  /** by a fire, taking it up: his right hand sliding along it, and how far that hand is still open, off it */
  let pickSliding = false;
  let pickOpen = 0;
  const PICK_OFF = 0.3;
  const _pickLastAt = new THREE.Vector3(), _pickLastQ = new THREE.Quaternion();
  const _slideWay = new THREE.Vector3(), _slideScale = new THREE.Vector3();
  const _behind = new WeakMap<Weapon, number>();
  const _behindInverse = new THREE.Matrix4(), _behindBox = new THREE.Box3();
  const _stanceFacing = new THREE.Vector3(), _stanceLeft = new THREE.Vector3(), _stanceFloor = new THREE.Vector3();
  const _floorTurn: SitTurn = { angle: 0, inTo: 0, backFrom: 0, backTo: 0, yaw: 0, at: [0, 0] };
  // (taking it up by a fire his hands' stage is a real body's pick-up long: CMU's clip 69_70 squats and rises in about
  // 1.8 s, and there's a step before and the shoulder after. In 2.6 s its head swung up off the floor at 15 m/s, from
  // review "a snap, not a lift")
  const _floorHands: SitHands = { ...TWO_FLOOR_HANDS, before: 3.6, turn: _floorTurn };
  const _lean = new THREE.Vector3(), _leanWay = new THREE.Vector3();
  const _inverseRoot = new THREE.Matrix4();
  const _pathEnd = new THREE.Vector3(), _pathEnd2 = new THREE.Vector3(), _pathPole = new THREE.Vector3();
  const _fistWas = new THREE.Quaternion(), _fistNow = new THREE.Quaternion(), _rootTurn = new THREE.Quaternion();
  const _portHand = new THREE.Vector3(), _besideAt = new THREE.Vector3(), _besidePole = new THREE.Vector3();
  /** What a two-hander's own shape asks of its rest: how far its far end's line stands over the floor by a fire and when
   *  stood (a sword's point goes into the ground), how far out it lies by a fire, and how far his fist slides down the
   *  handle as he sits (a sword's stops at the guard: past it, he held the blade), how far ahead of him it stands, where its handle ends, how far it slants across his palm stood there, and how far out to his side it's lowered. */
  /** Whether `weapon` stands on a seat head up, on the butt of its haft (a maul's, a greataxe's): a sword stands on its point. */
  function headUp(weapon: Weapon): boolean {
    return floorRest(weapon) !== SIT_HANDS.swordRest;
  }
  /** Whether he sits with `weapon` stood head up beside him, as `sit` has it. */
  function standsUp(sit: NonNullable<AnimState['sit']>, weapon: Weapon): boolean {
    return !onFloor(sit) && headUp(weapon);
  }
  /** By a fire, of his hands' stage by when `weapon` is off his shoulder and out at his right side: `floorLiftBy` for a
   *  maul's length, longer for a longer one, as a pendulum's swing takes the root of its length (a greatsword's blade
   *  swept 13 cm a frame in the maul's time). */
  function floorLiftBy(weapon: Weapon): number {
    const lifting = SIT_HANDS.floorLiftBy - SIT_HANDS.helpBy;
    return SIT_HANDS.helpBy + lifting * Math.sqrt(weapon.len / FLOOR_LIFT_LEN);
  }
  function floorRest(weapon: Weapon): readonly number[] {
    const name = weapon.group.name;
    return name === 'Maul' ? SIT_HANDS.maulRest : name === 'Greataxe' ? SIT_HANDS.axeRest : SIT_HANDS.swordRest;
  }
  /** The sword as it's stood in the ground, where it stays, and his hand's turn round on the handle to hold it as a cane
   *  is held: the hand's length ahead of him along the forearm, its thumb up, the blade under his little finger. (Turned
   *  about the palm's normal instead, half round, the forearm's turn went 78 degrees past its range.) */
  function takeStood(weapon: Weapon, hip: number): void {
    twoSit.lower = Math.max(0, SIT_HANDS.seatHip - hip);
    root.updateMatrixWorld(true);
    root.updateMatrixWorld(true);
    // (all in his own frame: he goes back to the seat with it in his fist, and it stands where it's to in the frame he sits in)
    const turnedBy = root.getWorldQuaternion(_rootTurn).invert();
    root.worldToLocal(grip.getWorldPosition(twoSit.loweredAt));
    grip.getWorldQuaternion(twoSit.loweredQ).premultiply(turnedBy);
    twoSit.handFrom.copy(j.handR.quaternion);
    // (a wrist leaves the handle slanting as he stands: tipped upright as it goes into the ground, his hand turning round
    // it, or the weapon stands slanted for good)
    const way = _hd.set(0, 1, 0).applyQuaternion(twoSit.loweredQ);
    twoSit.endFrom.copy(twoSit.loweredAt).addScaledVector(way, weapon.len);
    const [, over, , , ez] = floorRest(weapon);
    // (a sword's handle is too short to slide down: on a lower seat it goes deeper, or his fist is over his shoulder)
    const deeper = floorRest(weapon) === SIT_HANDS.swordRest ? twoSit.lower * SIT_HANDS.sinkBy : 0;
    twoSit.endTo.set(SIT_HANDS.plantX, over - deeper, ez);
    twoSit.uprightQ.setFromUnitVectors(way, _s1.set(0, -1, 0)).multiply(twoSit.loweredQ);
    _gripHome.copy(grip.position);
    twoSit.gripWas.copy(grip.quaternion);
    // (the hand's own frame: along its length, and towards its thumb. Taken from the way the weapon leaves the fist, as it
    // was, a maul let down almost along his forearm left its palm off the handle: what was left of it across the hand
    // pointed anywhere)
    const length = _s2.set(0, -1, 0);
    const thumb = _s1.set(-handR.s, 0, 0);
    const side = _s3.crossVectors(length, thumb);
    _lapHand.makeBasis(length, thumb, side).invert();
    // (and where they go in his)
    const [ax, ay, az] = SIT_HANDS.caneAhead;
    const ahead = _lapX.set(ax, ay, az).normalize();
    const up = _lapY.set(0, 1, 0);
    up.addScaledVector(ahead, -up.dot(ahead)).normalize();
    _lapWorld.makeBasis(ahead, up, _lapZ.crossVectors(ahead, up));
    twoSit.handTo.setFromRotationMatrix(_lapWorld.multiply(_lapHand));
    twoSit.stood = true;
  }
  /** How far `weapon`'s handle runs behind his fist where he fights with it (m), read once from its meshes. */
  function behindFist(weapon: Weapon): number {
    const known = _behind.get(weapon);
    if (known !== undefined) return known;
    root.updateMatrixWorld(true);
    _behindInverse.copy(grip.matrixWorld).invert();
    let most = 0;
    weapon.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      mesh.geometry.computeBoundingBox();
      _behindBox.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld).applyMatrix4(_behindInverse);
      most = Math.min(most, _behindBox.min.y);
    });
    const behind = -most * _slideScale.setFromMatrixScale(grip.matrixWorld).y;
    _behind.set(weapon, behind);
    return behind;
  }
  /** Where he stands to take up what he laid by a fire, as a man takes up a long haft lying on the floor: alongside it,
   *  facing it across, its butt to his right, his right fist by the butt and his left half a metre along (`floorFistFromButt`,
   *  `floorHandsApart`), stood back from it (`floorStandOff`). From where it lies, whatever he laid. */
  function pickStance(weapon: Weapon): void {
    const along = twoSit.pickAlong.set(0, 1, 0).applyQuaternion(twoSit.laidQ).setY(0).normalize();
    twoSit.pickBehind = behindFist(weapon);
    // (his facing across it, its butt to his right: right is (-facing.z, facing.x) as the game turns him)
    const facing = _stanceFacing.set(-along.z, 0, along.x);
    twoSit.pickYaw = Math.atan2(facing.x, facing.z);
    const fistAlong = SIT_HANDS.floorFistFromButt + SIT_HANDS.floorHandsApart / 2 - twoSit.pickBehind;
    twoSit.pickAt.copy(twoSit.laidAt).addScaledVector(along, fistAlong).addScaledVector(facing, -SIT_HANDS.floorStandOff);
  }
  /** The first key taking it up, in the path's frame: his right fist before his belly and the haft head up, leaning to
   *  his left, as he faces now (`floorPickFist`: right, up, ahead of him; `floorPickTilt`: to his left, ahead). Off him
   *  as he stands and turns, not where he stood to take it: kept there as he turned back after lifting it, his arms
   *  stood out at his side holding it upright before his face */
  function pickKey(): void {
    root.updateMatrixWorld(true);
    const facing = root.getWorldDirection(_stanceFacing).setY(0).normalize();
    const left = _stanceLeft.set(facing.z, 0, -facing.x);
    const [right, up, ahead] = SIT_HANDS.floorPickFist;
    const [tiltLeft, tiltAhead] = SIT_HANDS.floorPickTilt;
    const stands = root.getWorldPosition(_stanceFloor);
    _sitFrameInverse.copy(pathFrame()).invert();
    twoSit.frontAt.copy(stands).setY(stands.y + up * root.scale.y).addScaledVector(left, -right)
      .addScaledVector(facing, ahead).applyMatrix4(_sitFrameInverse);
    twoSit.frontWay.set(0, 1, 0).addScaledVector(left, tiltLeft).addScaledVector(facing, tiltAhead).normalize()
      .transformDirection(_sitFrameInverse);
  }
  /** How far turned and stepped he is to take it up at his hands' stage `before` (`PICK`'s `stepped`). */
  function pickStepped(before: number): number {
    return pickAt('stepped', 1 - before);
  }
  /** A place given in his frame (m: to his right, up, ahead of his feet) in the world, into `out`. */
  function inHisFrame(out: THREE.Vector3, right: number, up: number, ahead: number): THREE.Vector3 {
    root.updateMatrixWorld(true);
    const facing = root.getWorldDirection(_stanceFacing).setY(0).normalize();
    const left = _stanceLeft.set(facing.z, 0, -facing.x);
    const scale = root.scale.y;
    return root.getWorldPosition(out).addScaledVector(left, -right * scale).addScaledVector(_pickUp, up * scale)
      .addScaledVector(facing, ahead * scale);
  }
  /** A way given in his frame (to his left, up, ahead) in the world, into `out`. */
  function wayInHisFrame(out: THREE.Vector3, left: number, up: number, ahead: number): THREE.Vector3 {
    const facing = root.getWorldDirection(_stanceFacing).setY(0).normalize();
    const leftWay = _stanceLeft.set(facing.z, 0, -facing.x);
    return out.set(0, 0, 0).addScaledVector(leftWay, left).addScaledVector(_pickUp, up).addScaledVector(facing, ahead)
      .normalize();
  }
  /** The pick-up by a fire at `k` of it (`PICK`): the weapon placed as keyed, between where it lies, where the keys
   *  hold it in his frame and on his shoulder as he carries it, and his right arm reaching it from its own pose. */
  function pickUpKeyed(weapon: Weapon, k: number): void {
    const behind = behindFist(weapon);
    // (his arm hanging at rest, which his hand reaches from: from the arm as other stages had left it, it stood straight
    // out at his side as he stepped to it)
    _rightArm.forEach((_joint, i) => _pickOwn[i].identity());
    // (on his shoulder as he'll carry it standing: his arm as this frame's pose has it, fitted as the game fits it once
    // he's up, the weapon seated in his fist by the slant that fit took. Ended on his arm as it was last kept standing,
    // the pick-up ended in another carry than the one he was drawn in once up, and the weapon went 192 cm in a frame)
    // (turned in his fist as he held it before he laid it down: `seat` puts it on the fist's axis and leaves its turn,
    // so the keys' last turn stayed in his hand for good, 95 degrees off how he held it before he sat)
    _rightArm.forEach((joint, i) => joint.quaternion.copy(_standArm[i]));
    j.shoulderR.position.copy(_standAt);
    grip.quaternion.copy(twoSit.laidGrip);
    seat(handR, grip, weapon.r, _carrySlant);
    root.updateMatrixWorld(true);
    _carrySlant = fitArm(j, false, gripTurn(handR, grip, _vr), body, undefined).slant;
    seat(handR, grip, weapon.r, _carrySlant);
    root.updateMatrixWorld(true);
    grip.getWorldQuaternion(_carryQ);
    _pickWay.set(0, 1, 0).applyQuaternion(_carryQ);
    grip.getWorldPosition(_carryButt).addScaledVector(_pickWay, -behind);
    _rightArm.forEach((joint, i) => _pickFrom[i].copy(joint.quaternion));
    // (as keyed in his frame, turned from as it lies by the least turn)
    inHisFrame(_pickButt, pickAt('buttRight', k), pickAt('buttUp', k), pickAt('buttAhead', k));
    wayInHisFrame(_pickWay, pickAt('wayLeft', k), pickAt('wayUp', k), pickAt('wayAhead', k));
    const laidWay = _s1.set(0, 1, 0).applyQuaternion(twoSit.laidQ);
    _pickQ.setFromUnitVectors(laidWay, _pickWay).multiply(twoSit.laidQ);
    // (from where it lies)
    const lies = pickAt('lies', k);
    _pickButt.lerp(_hw1.copy(twoSit.laidAt).addScaledVector(laidWay, -behind), lies);
    _pickQ.slerp(twoSit.laidQ, lies);
    // (onto his shoulder)
    const carry = pickAt('carry', k);
    _pickButt.lerp(_carryButt, carry);
    _pickQ.slerp(_carryQ, carry);
    _pickWay.set(0, 1, 0).applyQuaternion(_pickQ);
    // (his right fist up its handle, reached from his arm's own pose as far as his hand is on it)
    _pickFist.copy(_pickButt).addScaledVector(_pickWay, pickAt('rightAlong', k) * root.scale.y);
    _rightArm.forEach((joint, i) => joint.quaternion.copy(_pickOwn[i]));
    j.shoulderR.position.copy(_standAt);
    seat(handR, grip, weapon.r, _carrySlant);
    wayInHisFrame(_pickPole, -0.6, -0.7, -0.2);
    holdInWorld(ARM_R, _pickFist, _pickWay, _pickPole, 1);
    const on = pickAt('rightOn', k);
    // (blended from a copy of the arm reaching it: blended onto itself, three copies the first before reading the second)
    _rightArm.forEach((joint, i) => joint.quaternion.copy(_pickReach[i].copy(joint.quaternion)).slerpQuaternions(_pickOwn[i], _pickReach[i], on));
    _rightArm.forEach((joint, i) => joint.quaternion.slerp(_pickFrom[i], carry));
    // (the weapon where it's keyed while it lies or his hand isn't on it; taken up, in his fist wherever his hand
    // got to, the keys saying which way it points: pinned where keyed, his arm short of a key left it floating 10 to
    // 17 cm out of his fist as he rose. As a pick-up is made elsewhere: the hand reaches the object, then the object
    // goes with the hand)
    root.updateMatrixWorld(true);
    grip.quaternion.copy(twoSit.laidGrip);
    seat(handR, grip, weapon.r, _carrySlant);
    _pickSeatedAt.copy(grip.position);
    _pickSeatedQ.copy(grip.quaternion);
    grip.updateMatrixWorld(true);
    grip.getWorldPosition(_pickHeld).addScaledVector(_pickWay, behind - pickAt('rightAlong', k) * root.scale.y);
    _hw1.copy(_pickButt).addScaledVector(_pickWay, behind).lerp(_pickHeld, on * (1 - lies) * pickAt('held', k));
    j.handR.worldToLocal(_hw1);
    grip.position.copy(_hw1);
    grip.quaternion.copy(j.handR.getWorldQuaternion(_standTurn).invert().multiply(_pickQ));
    // (on his shoulder, seated in his fist as he carries it standing: kept where the keys had it up the handle, it went
    // 16 cm along his fist and turned 25 degrees in the frame he was up)
    grip.position.lerp(_pickSeatedAt, carry);
    grip.quaternion.slerp(_pickSeatedQ, carry);
    grip.updateMatrixWorld(true);
    grip.getWorldPosition(_pickLastAt);
    grip.getWorldQuaternion(_pickLastQ);
    weapon.group.userData.laid = lies >= 1;
    pickSliding = lies <= 0 && pickAt('held', k) < 1;
    pickOpen = 1 - on;
    // (where it lay is kept, `laidAt`, and his fist has it as the keys place it: not laid, so it's seated again once he's up)
    twoSit.laid = false;
    twoSit.keyedUp = true;
    // (his body, and his head down at it)
    j.neck.rotation.x += pickAt('look', k);
  }
  /** The weapon slid `by` (m) forward through his fist, along its handle (a negative `by` slides it back). */
  function slideGrip(by: number): void {
    if (by === 0) return;
    _slideWay.set(0, 1, 0).applyQuaternion(grip.quaternion);
    const scale = _slideScale.setFromMatrixScale(j.handR.matrixWorld).x;
    grip.position.addScaledVector(_slideWay, by / scale);
    grip.updateMatrixWorld(true);
  }
  /** Where a weapon lying let go of is to be held, `pickSlide` back along it from where it lies (its fist by its butt). */
  function laidHeldAt(out: THREE.Vector3): THREE.Vector3 {
    _slideWay.set(0, 1, 0).applyQuaternion(twoSit.laidQ);
    return out.copy(twoSit.laidAt).addScaledVector(_slideWay, -pickSlide);
  }
  /** The grip back in his fist, from where it was left for a weapon lying let go of. */
  function gripAsHeld(): void {
    if (!twoSit.laid) return;
    grip.quaternion.copy(twoSit.laidGrip);
    grip.position.copy(twoSit.laidGripAt);
    grip.updateMatrixWorld(true);
  }
  /** His left arm faded from as it was last drawn over `LEFT_SWITCH` s when `mode` (how it's placed, -1 not sitting)
   *  changes from one frame to the next, until his hand `holds` the grip, and its joints as drawn kept for the next. */
  function fadeLeftSwitch(mode: number, holds: boolean, dt: number): void {
    const arm = [j.shoulderL, j.elbowL, j.handL];
    if (mode >= 0 && leftModeWas >= 0 && mode !== leftModeWas) {
      for (let i = 0; i < arm.length; i++) {
        leftFrom[i].copy(leftShown[i]);
        leftTurn[i].copy(leftShown[i]).multiply(leftWas[i].invert());
      }
      leftFadeW = 1;
    }
    if (mode < 0) leftFadeW = 0;
    if (leftFadeW > 0) {
      // (and quicker once his hand holds the grip: faded on at its pace, the closed fist was dragged 4.6 cm off the
      // handle; ended there, his hand went 10 cm in a frame as it took hold)
      leftFadeW = Math.max(0, leftFadeW - (holds ? LEFT_HELD_FASTER : 1) * dt / LEFT_SWITCH);
      const eased = smooth(leftFadeW);
      for (let i = 0; i < arm.length; i++) {
        // (the old arm going on as it went, slowing as the fade goes)
        _turnNow.identity().slerp(leftTurn[i], leftFadeW);
        leftFrom[i].premultiply(_turnNow);
        arm[i].quaternion.slerp(leftFrom[i], eased);
      }
    }
    for (let i = 0; i < arm.length; i++) {
      leftWas[i].copy(leftShown[i]);
      leftShown[i].copy(arm[i].quaternion);
    }
    leftModeWas = mode;
  }

  /** By a fire, once he's sat: what he's laid stays on the floor, whatever his body does, and his hand comes off it to his
   *  knee ("he keeps it in hand and floating parallel to ground, also moving as he moves"). */
  function layDown(sit: NonNullable<AnimState['sit']>, weapon: Weapon, floor: boolean): void {
    // (getting up to take it up, it's left lying as he rises and turns to it, and taken again once he's crouched by it,
    // `floorTakeFrom` to `floorTakeBy` of his hands' stage: his fist kept on it, he couldn't reach it on the floor as he
    // stood, and lifted it in one hand as he rose, 54 cm)
    const takenUp = 1 - smooth(ramp(sit.before, SIT_HANDS.floorTakeFrom, SIT_HANDS.floorTakeBy));
    const off = !floor ? 0 : twoSit.rising ? Math.max(smooth(sit.after), takenUp) : smooth(sit.after);
    if (off <= 0) {
      twoSit.laid = false;
      weapon.group.userData.laid = false;
      return;
    }
    if (!twoSit.laid) {
      root.updateMatrixWorld(true);
      grip.getWorldPosition(twoSit.laidAt);
      grip.getWorldQuaternion(twoSit.laidQ);
      twoSit.laidGrip.copy(grip.quaternion);
      twoSit.laidGripAt.copy(grip.position);
      twoSit.laid = true;
    }
    weapon.group.userData.laid = off >= 1;
    _rightArm.forEach((joint, i) => twoSit.holding[i].copy(joint.quaternion));
    _restRight[0] = 1;
    restHands(j, sit, _restRight);
    _rightArm.forEach((joint, i) => joint.quaternion.slerp(twoSit.holding[i], 1 - off));
    root.updateMatrixWorld(true);
    j.handR.worldToLocal(laidHeldAt(grip.position));
    grip.quaternion.copy(j.handR.getWorldQuaternion(_standTurn).invert().multiply(twoSit.laidQ));
    grip.updateMatrixWorld(true);
  }
  /** Out of the ground, his fist has the weapon as it had it going in: left as the last frame in the ground had it, it came
   *  out upside down in his fist as he was up. */
  function leaveGround(): void {
    if (twoSit.stood) grip.quaternion.copy(twoSit.gripWas);
    twoSit.stood = false;
  }
  /** His hand on its forearm, `round` of the way from how it held the weapon lowered to its cane's hold: eased on the
   *  forearm, it stays within what a wrist and a forearm can do (eased in the world, it went 90 degrees past either way). */
  function handRound(round: number): void {
    // (his cane's hold is found for the weapon upright: leaning, the fist leans with it, or it closes off the handle)
    _standTurn.setFromUnitVectors(_s1.set(0, -1, 0), twoSit.wayNow).premultiply(_rootTurn).multiply(twoSit.handTo);
    j.elbowR.getWorldQuaternion(_pq).invert().multiply(_standTurn);
    j.handR.quaternion.slerpQuaternions(twoSit.handFrom, _pq, round);
    j.handR.updateMatrixWorld(true);
  }
  /** His arm to the weapon, in his frame where it's `tip` of the way from as he lowered it to upright and its far end `ends`
   *  of the way to where it stands in the ground, his hand `round` of the way round on its handle. */
  function standBy(tip: number, ends: number, round: number, slid: number, weapon: Weapon, slant: number): void {
    const r = weapon.r;
    root.updateMatrixWorld(true);
    root.getWorldQuaternion(_rootTurn);
    twoSit.standQ.slerpQuaternions(twoSit.loweredQ, twoSit.uprightQ, tip);
    const way = _hd.set(0, 1, 0).applyQuaternion(twoSit.standQ);
    twoSit.wayNow.copy(way);
    twoSit.standAt.lerpVectors(twoSit.endFrom, twoSit.endTo, ends).addScaledVector(way, -weapon.len);
    root.localToWorld(twoSit.standAt);
    twoSit.standQ.premultiply(_rootTurn);
    const [polX, polY, polZ] = SIT_HANDS.plantPole;
    // (the path's own pole: the elbow as it was lies almost along an arm so straight, and as a pole it twisted the arm half
    // round in a frame, the weapon 170 degrees in his fist)
    _besidePole.set(polX, polY, polZ);
    twoSit.turned = round;
    for (let i = 0; i < 3; i++) {
      handRound(round);
      // (where the fist has the handle, eased from the one to the other. The upright fist is seated the way that fist has
      // it: the usual way, a handle running under the little finger is read as a hand turned over, its palm away from it
      // and its fingers round nothing)
      grip.quaternion.copy(j.handR.getWorldQuaternion(_standTurn).invert().multiply(twoSit.standQ));
      seat(handR, grip, r, slant);
      _seatWas.copy(grip.position);
      grip.quaternion.multiply(_pq.setFromAxisAngle(_s1.set(1, 0, 0), Math.PI));
      seat(handR, grip, r, floorRest(weapon)[6]);
      grip.position.lerpVectors(_seatWas, grip.position, round);
      grip.updateMatrixWorld(true);
      j.handR.getWorldPosition(_hp).add(twoSit.standAt).sub(grip.getWorldPosition(_cur));
      _hp.y -= slid * root.scale.y;
      reachArm(j.shoulderR, j.elbowR, j.P.upperL, j.P.foreL, j.chest.worldToLocal(_hp), _besidePole);
      j.shoulderR.updateMatrixWorld(true);
    }
    handRound(round);
    grip.quaternion.copy(j.handR.getWorldQuaternion(_standTurn).invert().multiply(twoSit.standQ));
    // (the fist slid down the handle: the sword itself where it stands)
    j.handR.worldToLocal(grip.position.copy(twoSit.standAt));
    grip.updateMatrixWorld(true);
  }
  /** His fist on the weapon he has stood in the ground: eased round from the one he lowered it in, his left hand has it meanwhile, as a
   *  regrip is ("keep his hand on two handed weapon"). */
  function holdStood(weapon: Weapon, slant: number): void {
    hold(handR, along2(grip), weapon.r, undefined, slant);
    _fistWas.copy(handR.vis.quaternion);
    hold(handR, along2(grip).negate(), weapon.r, undefined, floorRest(weapon)[6]);
    _fistNow.copy(handR.vis.quaternion);
    // (through the hand as it lies on the wrist, open: from one fist straight to the other it went half round on the wrist)
    const round = twoSit.turned;
    if (round < 0.5) handR.vis.quaternion.copy(_fistWas).slerp(_noTurn, round * 2);
    else handR.vis.quaternion.copy(_noTurn).slerp(_fistNow, round * 2 - 1);
    // (no further than it must to go round: flat open, it read as a hand let go of the weapon)
    loosen(handR, SIT_HANDS.regripOpen * Math.min(1, 2 * Math.sin(Math.PI * round)));
  }
  /** The way a grip's weapon runs from the fist to its far end, in the world. */
  function along2(g: THREE.Object3D): THREE.Vector3 {
    return _hd.set(0, 1, 0).transformDirection(g.matrixWorld);
  }
  /** The frame the weapon's path is in: his own, and by a fire his own place with the sit's turn, so the path stays put
   *  as he turns to take it up (`twoSit.pickingUp`). */
  function pathFrame(): THREE.Matrix4 {
    root.updateMatrixWorld(true);
    if (!twoSit.turnsEvenly) return _sitFrame.copy(root.matrixWorld);
    root.matrixWorld.decompose(_frameAt, _frameQ, _frameScale);
    return _sitFrame.compose(_frameAt, twoSit.sitQ, _frameScale);
  }
  /** His arm to the weapon, `down` of the way along its path from before him to its far end on the ground, and by a fire
   *  `laid` of the way from there to lying beside him, its far end along the floor; by a fire, `lifted` of the way to
   *  the path's start from where it lay on his shoulder (`twoSit.carryAt`, `carryWay`). */
  function weaponOnPath(down: number, weapon: Weapon, laid = 0, lifted = 1): void {
    root.updateMatrixWorld(true);
    // (his hands out from him as it passes level: straight down, the butt of its handle came 21 cm into his chest)
    _pathAt.lerpVectors(twoSit.frontAt, twoSit.lowAt, down);
    _pathAt.z += twoSit.pathOut * Math.sin(Math.PI * down);
    // (a maul or an axe head up out at his side early on his way down and back before him only at the end of his way up:
    // out at the path's pace, it came back before him as he rose, its head through his face as he leant into the rise)
    if (twoSit.sideBy > 0) {
      const side = smooth(ramp(down, 0, twoSit.sideBy));
      _pathAt.x = lerp(twoSit.frontAt.x, twoSit.lowAt.x, side);
      _pathAt.z = lerp(twoSit.frontAt.z, twoSit.lowAt.z, side);
    }
    // (by a fire out to his side instead: ahead of him, his arm stood straight out with the blade level at the flames)
    _pathAt.x -= twoSit.pathSide * Math.sin(Math.PI * down);
    // (by a fire at one turning pace: its way eased in a straight line, nearly half a turn went by in a moment of the middle)
    // (and by a fire whatever its side: head up to head down, eased in a line, its head fell from his face to his belt in a
    // fifth of a second, through his arms)
    if (twoSit.pathSide > 0 || twoSit.turnsEvenly) {
      _pq.setFromUnitVectors(twoSit.frontWay, twoSit.lowWay);
      _pathWay.copy(twoSit.frontWay).applyQuaternion(_pathTurn.identity().slerp(_pq, down));
    }
    else _pathWay.lerpVectors(twoSit.frontWay, twoSit.lowWay, down).normalize();
    // (not just over nothing: his way back from `w` comes out at 5e-17 with him standing, and read as lying, this took the
    // weapon straight from his shoulder to low, past the port, 25 cm a frame through the flames)
    if (laid > 1e-6) {
      _pathEnd.copy(twoSit.lowAt).addScaledVector(twoSit.lowWay, weapon.len);
      _pathEnd2.copy(twoSit.restGrip).addScaledVector(twoSit.restWay, weapon.len);
      _pathEnd.lerp(_pathEnd2, laid);
      // (his hand out beside his hip first, his arm hanging: a fist points a blade down only with the forearm near hanging,
      // and held before him as his shoulder dropped, his wrist went 75 degrees past. Its far end stays on the floor)
      // (and down as his body goes down: let down at the sit's pace, his chest came down onto it, the handle's end 19 cm
      // into it)
      // (out to his side first and back to his hip last: in together, his body came down onto its handle's end, the
      // chest or the thigh by when)
      _pathAt.x = lerp(twoSit.lowAt.x, twoSit.restGrip.x, smooth(ramp(laid, 0, SIT_HANDS.besideBy)));
      _pathAt.z = lerp(twoSit.lowAt.z, twoSit.restGrip.z, smooth(ramp(laid, SIT_HANDS.besideFrom, 1)));
      _pathAt.y = lerp(twoSit.lowAt.y, twoSit.restGrip.y, smooth(ramp(laid, 0, SIT_HANDS.handDownBy)));
      const falls = THREE.MathUtils.clamp((_pathAt.y - _pathEnd.y) / weapon.len, -1, 1), level = Math.sqrt(1 - falls * falls);
      _pathWay.subVectors(_pathEnd, _pathAt).setY(0).normalize().multiplyScalar(level).setY(-falls);
    }
    // (off his shoulder by the weapon's own place and way, its head out past his shoulder to his right: with his arm's joints
    // eased from the carry to the path's start, the head came forward past his face and down before his belly)
    if (lifted < 1) {
      _pathAt.lerpVectors(twoSit.carryAt, _pathAt, lifted);
      _liftTurn.setFromUnitVectors(twoSit.carryWay, _pathWay.normalize());
      _pathWay.copy(twoSit.carryWay).applyQuaternion(_pathTurn.identity().slerp(_liftTurn, lifted));
    }
    const frame = pathFrame();
    _pathAt.applyMatrix4(frame);
    _pathWay.transformDirection(frame);
    const [laidX, laidY, laidZ] = SIT_HANDS.floorLaidFlat;
    _pathPole.set(laidX, laidY, laidZ);
    // (taken up from where it lies, it lies as laid until it's lifted: turned as it rose from the rest, its head stood up
    // on its edge on the floor beside him as he rose)
    const lies = twoSit.rising ? Math.max(laid, down) : laid;
    _pathFlat.copy(twoSit.flatFrom).lerp(_pathPole, lies).normalize().transformDirection(frame);
    const [polX, polY, polZ] = SIT_HANDS.plantPole;
    const [sidePolX, sidePolY, sidePolZ] = SIT_HANDS.besidePole;
    _besidePole.set(polX, polY, polZ).lerp(_pathPole.set(sidePolX, sidePolY, sidePolZ), lies);
    holdInWorld(ARM_R, _pathAt, _pathWay, _besidePole, 1, _pathFlat, lifted);
  }
  /** The hold he'll rest a two-hander in, found as a sit begins: the arm's search makes up its mind differently frame to
   *  frame on the way there (fitted every frame, the blade jumped 310 cm), and a hold known beforehand is one the arm can
   *  go to straight, joint by joint, its fist never turning on the handle. */
  function takeTwoRest(sit: NonNullable<AnimState['sit']>, t: number, weapon: Weapon): void {
    _allJoints.forEach((o, i) => {
      _jointsWere[i].at.copy(o.position);
      _jointsWere[i].q.copy(o.quaternion);
    });
    // (the path it comes down: the owner's "he should lower the sword down, then sit, then stick it into the ground, and
    // when standing up, same but reverse". In both hands before him, his arms low, and let down ahead of him till its far
    // end is on the ground, as a heavy weapon is held at rest; out to his right, its far end clear of his feet. A fist has a
    // blade leave past its thumb, so that's as far down as it points: straight under him, a greatsword held his fist at his
    // shoulder, one arm out stiff. Its arm's joints eased from key to key swung it round in one fist, and its way between
    // those keys went across his belly and over his head)
    // (by a fire, at his right side, out at 45 degrees: ahead of him, it went into the flames, and straight out to his right
    // a palm-down hand can't lay it, as a blade leaves past the thumb: his forearm went 90 degrees past)
    const toFloor = onFloor(sit);
    const over = SIT_HANDS.lowerOver;
    const [fx, fy, fz] = toFloor ? SIT_HANDS.floorFrontAt : SIT_HANDS.frontAt;
    const [wx, wy, wz] = toFloor ? SIT_HANDS.floorFrontWay : SIT_HANDS.frontWay;
    const [sx, sy, sz] = toFloor ? SIT_HANDS.floorFlat : SIT_HANDS.flatSide;
    twoSit.frontAt.set(fx, fy, fz);
    twoSit.frontWay.set(wx, wy, wz).normalize();
    twoSit.flatFrom.set(sx, sy, sz);
    // (in both hands by a fire too: close in, the handle lay against his belly, his left forearm in his side)
    twoSit.pathOut = toFloor ? SIT_HANDS.floorPathAhead : SIT_HANDS.pathOut;
    twoSit.sideBy = 0;
    twoSit.pathSide = toFloor ? SIT_HANDS.floorPathOut : 0;
    twoSit.turnsEvenly = toFloor;
    twoSit.pickingUp = false;
    root.getWorldQuaternion(twoSit.sitQ);
    twoSit.layAt.copy(twoSit.frontAt);
    twoSit.layWay.copy(twoSit.frontWay);
    // (by a fire at his hip, his arms near hanging: at the seat's height, his chest's, his arms stood straight out before him)
    // (and below his hip, near, as he crouches to it (`floorCrouch`): at its height, 42 cm ahead, standing straight, his
    // arms stood stiff and straight out and down for a second as he laid it, "jerky and lame", his right wrist 29 degrees
    // past its range)
    const lowY = toFloor ? SIT_HANDS.floorLowY : floorRest(weapon)[7];
    const [lowX, lowZ] = toFloor ? SIT_HANDS.floorLowHand : SIT_HANDS.lowHand;
    const falls = THREE.MathUtils.clamp((lowY - over) / weapon.len, 0, 1), level = Math.sqrt(1 - falls * falls);
    // (a maul's and an axe's haft runs further behind the fist than a sword's grip: held as near, its end went 11 cm into
    // his chest as he began to lay it)
    const longHaft = toFloor && floorRest(weapon) !== SIT_HANDS.swordRest ? SIT_HANDS.floorHaftAhead : 0;
    twoSit.lowAt.set(lowX, lowY, lowZ + longHaft);
    if (toFloor) {
      // (out to his right, his palm ahead: a blade leaves past the thumb, so from a hanging arm that's the way it points. At
      // the angle it will lie at, it went through his crouch ahead of him, towards the flames)
      const [outX, outZ] = SIT_HANDS.floorLowOut;
      twoSit.lowWay.set(outX * level, -falls, outZ * level);
      twoSit.layLowAt.copy(twoSit.lowAt);
      twoSit.layLowWay.copy(twoSit.lowWay);
      twoSit.rising = false;
      twoSit.wWas = sit.w;
      twoSit.afterWas = sit.after;
    }
    else {
      const outBy = THREE.MathUtils.clamp((SIT_HANDS.lowEndX - lowX) / (weapon.len * level), -1, 1);
      twoSit.lowWay.set(outBy * level, -falls, Math.sqrt(1 - outBy * outBy) * level);
    }
    // (lying on the floor beside him: its far end's height and his hand's are what its own shape lies on)
    const [endY, , gripX] = floorRest(weapon);
    const liesFall = (SIT_HANDS.floorGripY - endY) / weapon.len, liesLevel = Math.sqrt(1 - liesFall * liesFall);
    const [restX, restZ] = SIT_HANDS.floorOut;
    twoSit.restGrip.set(gripX, SIT_HANDS.floorGripY, SIT_HANDS.floorGripZ);
    twoSit.restWay.set(restX * liesLevel, -liesFall, restZ * liesLevel);
    if (standsUp(sit, weapon)) takeUpright(sit);
    // (each fitted afresh, and the arm left remembering what it did: fitted from whatever the arm last did, a sit by a fire
    // after one on a log took other slants, and its right wrist went 64 degrees past its range where alone it went 26)
    const armWas = remembered(j.shoulderR);
    recall(j.shoulderR, {});
    weaponOnPath(0, weapon);
    twoSit.frontSlant = fitArm(j, false, gripTurn(handR, grip, _vr), body, SLANT).slant;
    recall(j.shoulderR, {});
    weaponOnPath(1, weapon);
    twoSit.lowSlant = fitArm(j, false, gripTurn(handR, grip, _vr), body, SLANT).slant;
    recall(j.shoulderR, armWas);
    twoSit.taken = true;
    twoSit.stood = false;
    _allJoints.forEach((o, i) => {
      o.position.copy(_jointsWere[i].at);
      o.quaternion.copy(_jointsWere[i].q);
    });
    root.updateMatrixWorld(true);
  }
  /** A maul's or a greataxe's spot on a seat: stood head up between his feet once he's sat, his hands' stage all sat
   *  (`TWO_UP_HANDS`), so it's never stood on its butt by him standing, where its head was at his chin's height
   *  wherever it stood (before him, at his cheek from the front; out to his right, beyond his left hand's reach). The
   *  way never turned over (a fist holds a haft head up past the thumb, so no regrip). */
  function takeUpright(sit: NonNullable<AnimState['sit']>): void {
    const [wx, wy, wz] = SIT_HANDS.upWay;
    const [rx, ry, rz] = SIT_HANDS.upRestAt;
    twoSit.lowWay.set(wx, wy, wz).normalize();
    twoSit.lowAt.set(rx, sit.hip / root.scale.y + ry, rz);
    twoSit.frontAt.copy(twoSit.lowAt);
    twoSit.frontWay.copy(twoSit.lowWay);
    twoSit.pathOut = 0;
    twoSit.sideBy = 0;
    twoSit.uprightAt.copy(twoSit.lowAt);
    twoSit.uprightWay.copy(twoSit.lowWay);
  }
  /** A maul stood between his feet leant out to his right on its butt, `lean` of the way, his left hand off it: stood
   *  there, its head was before his face from the front, and stood out at his right knee his left hand couldn't reach it
   *  to lift it. Turned about its butt, which stays where it was stood (moved with his fist, it dragged on the floor). */
  function leanUpright(lean: number): void {
    const [lx, ly, lz] = SIT_HANDS.upLeanWay;
    const along = twoSit.uprightAt.y / twoSit.uprightWay.y;
    _lean.copy(twoSit.uprightAt).addScaledVector(twoSit.uprightWay, -along);
    _leanWay.set(lx, ly, lz).normalize();
    twoSit.lowWay.copy(twoSit.uprightWay).lerp(_leanWay, lean).normalize();
    twoSit.lowAt.copy(_lean).addScaledVector(twoSit.lowWay, along);
  }
  /** Its butt let down onto the ground as he's `sat` of the way down, his fist going up the haft (the grip moved along
   *  the weapon under the hand, as far as its handle goes). */
  function buttDown(weapon: Weapon, sat: number, before: number, slips: boolean): void {
    seat(handR, grip, weapon.r, slantR);
    root.updateMatrixWorld(true);
    const scale = _cur.setFromMatrixScale(grip.matrixWorld).y;
    const was = grip.position.clone();
    footToFloor(grip, -SIT_HANDS.upButt / scale, 1, (floorRest(weapon)[5] - 0.1) / scale);
    const stood = !!grip.userData.stoodOn;
    const full = was.distanceTo(grip.position);
    // (`sat` of the way from his fist's grip to where its butt is on the floor)
    grip.position.lerpVectors(was, grip.position, sat);
    grip.userData.stoodOn = stood && sat >= 1;
    // (his left hand on the haft over where his right fist has it once it's on the floor, and kept there on the haft: it's
    // what lets it down through his loosened right fist and lifts it back up through it. Kept by the right fist instead,
    // the haft slid through both of them with nothing lifting it, from play "maul slides up with jedi force, still")
    // (by his right fist as it comes off his shoulder, and up the haft only once it stands before him: up there from the
    // start, it reached for a spot by his face, his forearm into his head)
    const up = sat > 0 ? 1 : smooth(ramp(before, SIT_HANDS.upLeftFrom, SIT_HANDS.upPlantFrom));
    // (set down, let slip through both his loosened fists under its own weight, his left closed round it over his
    // right, where it stays: carried down by his left instead, it was first lifted overhead off his shoulder, his left
    // hand reaching up across his face, and in his fist as he carries it, his fist went past his reach sat. Taken up, it
    // can't rise through his fist by itself, so his left lifts it)
    offGrip.position.y = SIT_HANDS.upLeftAbove + full * (slips ? sat : up);
    grip.updateMatrixWorld(true);
    twoSit.upright = true;
  }
  function weaponNow(at: THREE.Vector3, turn: THREE.Quaternion, pole: THREE.Vector3): void {
    root.updateMatrixWorld(true);
    j.chest.worldToLocal(grip.getWorldPosition(at));
    turn.copy(j.chest.getWorldQuaternion(_backQ).invert()).multiply(grip.getWorldQuaternion(_pq));
    j.chest.worldToLocal(j.elbowR.getWorldPosition(pole)).sub(j.shoulderR.position);
  }

  /** A cut out of a two-handed move (third person): the way back to the guard leaves from the weapon as last drawn. */
  function backFrom(): void {
    BACK_AT.copy(DRAWN_AT); BACK_TURN.copy(DRAWN_TURN); BACK_POLE.copy(DRAWN_POLE);
    backOut = true;
  }

  /** The weapon on its way back to the guard, `e` of the way still where the move left it (the fade's weight): the grip
   *  along a line from where the move left it to where the pose holds it, the weapon turned between them (its flat
   *  too), the arm reaching both with its elbow between them. (With the guard's elbow and the hand turned the least
   *  way onto the weapon's way, the first frame back turned the shoulder 63 degrees and the hand 51 out of Thunder
   *  Crescent's end. Lifted, as a weapon is out of the ground, the grip rises sooner than it comes in and the weapon
   *  turns up later: turned and moved alike, out of a blow driven into the ground the end behind the hands swung down
   *  and back 9 cm through the left thigh.) */
  function backToGuard(e: number): void {
    _hw1.copy(GUARD_AT).lerp(BACK_AT, e);
    _hw1.y = THREE.MathUtils.lerp(GUARD_AT.y, BACK_AT.y, e * e);
    // (coming into the guard as the fade does: by the weight to a power, `e^0.4`, the weapon came into the guard at
    // full speed and stopped there in a frame in the hall of heroes, its tip 15 cm a frame to none)
    _backQ.copy(GUARD_TURN).slerp(BACK_TURN, 1 - Math.pow(1 - e, BACK_EASE.late));
    _backDir.set(0, 1, 0).applyQuaternion(_backQ);
    _backFlat.copy(FLAT_IN_GRIP).applyQuaternion(_backQ);
    _backPole.copy(GUARD_POLE).lerp(BACK_POLE, e);
    holdInChest(ARM_R, _hw1, _backDir, _backPole, 1, _backFlat);
  }

  /** The weapon arm placed by a point and a way in the chest's own frame, by `k` from the pose's own: the grip at `at`,
   *  the weapon along `dir` (its flat facing `flat`, if given, `flatK` of the way), the arm reaching by IK with its
   *  elbow towards `pole` (third person's `holdInView`). */
  function holdInChest(arm: typeof ARM_R, at: THREE.Vector3, dir: THREE.Vector3, pole: THREE.Vector3, k: number, flat?: THREE.Vector3, flatK = k): void {
    root.updateMatrixWorld(true);
    const flatW = flat && _hw3.copy(flat).transformDirection(j.chest.matrixWorld);
    holdInWorld(arm, j.chest.localToWorld(_hw1.copy(at)), _hw2.copy(dir).transformDirection(j.chest.matrixWorld), pole, k, flatW, flatK);
  }

  /** `holdInChest` with the grip's place, the weapon's way and its flat's in the world (the elbow's `pole` in the
   *  chest's frame). */
  function holdInWorld(arm: typeof ARM_R, at: THREE.Vector3, dir: THREE.Vector3, pole: THREE.Vector3, k: number, flat?: THREE.Vector3, flatK = k): void {
    const { shoulder, elbow, hand, grip: g } = arm;
    root.updateMatrixWorld(true);
    _gw.copy(at).lerp(g.getWorldPosition(_cur), 1 - k);
    _dw.copy(dir).lerp(_cur.set(0, 1, 0).transformDirection(g.matrixWorld), 1 - k).normalize();
    for (let i = 0; i < 3; i++) {
      hand.getWorldPosition(_hp).add(_gw).sub(g.getWorldPosition(_cur));
      reachArm(shoulder, elbow, j.P.upperL, j.P.foreL, j.chest.worldToLocal(_hp), pole);
      shoulder.updateMatrixWorld(true);
      _cur.set(0, 1, 0).transformDirection(g.matrixWorld);
      _hq.setFromUnitVectors(_cur, _dw).multiply(hand.getWorldQuaternion(_pq));
      if (flat) rollFlat(_hq, g, flat, flatK);
      hand.quaternion.copy(elbow.getWorldQuaternion(_pq).invert().multiply(_hq));
      hand.updateMatrixWorld(true);
    }
  }

  /** The hand's world turn `q` rolled about the weapon's way (`_dw`) by `k` of the way until its flat faces `flat`:
   *  that side of it, the palm's (either side, the least roll turned the palm out, past the forearm's turn). The
   *  grip's turn in the hand is its own, so the flat follows `q`. */
  function rollFlat(q: THREE.Quaternion, g: THREE.Object3D, flat: THREE.Vector3, k: number): void {
    // (the flat as `q` would have it: the grip's turn in the hand, then `q`)
    _fn.copy(FLAT_IN_GRIP).applyQuaternion(g.quaternion).applyQuaternion(q);
    _fn.addScaledVector(_dw, -_fn.dot(_dw)).normalize();
    _ft.copy(flat).addScaledVector(_dw, -flat.dot(_dw));
    if (_ft.lengthSq() < 1e-6) return;
    _ft.normalize();
    const angle = Math.atan2(_fc.crossVectors(_fn, _ft).dot(_dw), _fn.dot(_ft));
    q.premultiply(_fr.setFromAxisAngle(_dw, angle * k));
  }

  function animate(st: AnimState): void {
    const { t, dt } = st;
    resetPose(j);
    const move = st.move;
    const dir = st.moveDir ?? 1;
    const two = held?.off != null;
    // (both hands empty: no weapon, no shield; he fights with his fists, models/warriorFists.ts)
    const bare = !held && !offHeld && !shield.visible;
    // (and the sword hand empty, whatever the other holds: with a shield alone, his right arm hangs and swings free
    // and punches. Posed as a sword arm, its forearm stood out before him at the waist and its wrist was cocked,
    // gripping nothing: from play, "the hand looks weird with no sword ... wrist up and zombie like walking")
    const freeR = !held;
    fistLine.L.set(0, 0, 0); fistLine.R.set(0, 0, 0);
    twoHold.k = 0;
    // (what a sit chose kept until he's up)
    if (!st.sit) _lapTaken.fill(false);
    // (through the eyes the hands drawn larger, `EYES.hand`: the fists seat and close round their handles at that scale)
    const handK = HAND_K * (fp ? EYES.hand : 1);
    handL.vis.scale.setScalar(handK); handR.vis.scale.setScalar(handK);

    // base stance: weapon forward at the hip (a two-hander held across the body), shield up in front
    idle(j, t, 1 - move * 0.6);
    // a fighter's stance: side-on with the left side forward (the feet, below), the knees soft, the weight
    // settling from foot to foot and the body swaying over them, the chest and head turned back to the front
    if (!fp) {
      const amt = 1 - Math.min(1, move * 2), sway = Math.sin(t * 0.5) + 0.35 * Math.sin(t * 1.13 + 1), br = Math.sin(t * 1.8);
      j.hips.rotation.y += -0.3 * amt; j.spine.rotation.y += 0.1 * amt; j.chest.rotation.y += 0.12 * amt; j.neck.rotation.y += 0.08 * amt;
      j.body.position.x += 0.02 * sway * amt; j.hips.rotation.z += 0.045 * sway * amt; j.spine.rotation.z += -0.03 * sway * amt; j.neck.rotation.z += -0.02 * sway * amt;
      j.body.position.y += -0.035 * amt; j.spine.rotation.x += 0.05 * amt;
      // (the shoulders rise with each breath)
      j.shoulderL.position.y = j.shoulderR.position.y = shY + 0.006 * br * amt;
    }
    // (through the eyes the arms barely swing with the stride: a swinging arm sweeps a weapon across the view)
    const cy0 = j.chest.rotation.y, hy0 = j.hips.rotation.y, eL0 = j.elbowL.rotation.x, eR0 = j.elbowR.rotation.x;
    // the arms pump against the legs, the hands (and so the blades) held steady by the wrists: a weapon arm swings by 0.4 at a run, a shield arm less, a two-hander's hardly (the left hand is on its grip)
    const armR = fp ? 0.03 : two ? 0.12 : ARM_SWING, armL = fp ? 0.03 : two ? lerp(0.12, ARM_SWING, shouldered) : shield.visible ? 0.6 * ARM_SWING : ARM_SWING;
    // (and at a run a weapon arm pumps as a runner's arm does, a little less than a free one, the shield arm hardly)
    // (both hands empty, the arms hang and swing from the shoulders, nearly straight: pumped as a runner's, bent to a
    // right angle, from play, "the arms are at a 90 degree angle when walking, they should be relaxed, since he is not
    // holding anything")
    const pump = fp || two ? 0 : freeR ? BARE_PUMP : RUN_PUMP, pumpL = fp ? 0 : bare ? BARE_PUMP : two ? shouldered : shield.visible ? RUN_SHIELD_PUMP : offHeld ? RUN_PUMP : 1;
    // (a hand round a grip or a shield's is held steady by its wrist; a free one flops)
    // (both hands empty, they're loose fists held in line with the forearms: flopping open on the wrists as he ran,
    // from play, "his writs are not relaxed, they are up ... like a vampire walk")
    const looseR = 0, looseL = shield.visible || offHeld || bare ? 0 : 1;
    const swung = walkCycle(j, st.phase, move, { stride: 0.55, knee: 1.0, arm: armR, armL, bob: 0.08, dir, run: true, pump, pumpL, looseR, looseL });
    const runK = fp ? 0 : runShareOf(move);
    // (the wrists against each forearm's swing, the shoulder's and the elbow's together)
    const wrist = WRIST * (1 - (1 - RUN_WRIST) * runK), levelR = held && !two ? RUN_LEVEL * runK : 0, levelL = offHeld ? RUN_LEVEL * runK : 0;
    if (!fp) {
      j.elbowR.rotation.x += -swung.forearmR * levelR; j.elbowL.rotation.x += -swung.forearmL * levelL;
      j.handR.rotation.x += -swung.forearmR * (1 - levelR) * wrist;
      if (shield.visible || offHeld) j.handL.rotation.x += -swung.forearmL * (1 - levelL) * wrist;
    }
    if (fp) {
      const k = 0.2;
      j.chest.rotation.y = cy0 + (j.chest.rotation.y - cy0) * k; j.hips.rotation.y = hy0 + (j.hips.rotation.y - hy0) * k;
      j.elbowL.rotation.x = eL0 + (j.elbowL.rotation.x - eL0) * k; j.elbowR.rotation.x = eR0 + (j.elbowR.rotation.x - eR0) * k;
    }
    // (the body leans into its stride, models/ik.ts: the hands are held where this pose puts them through it, `holdArms`, so the weapon and shield keep their angle)
    if (two) { j.shoulderR.rotation.x += -0.5; j.shoulderR.rotation.z += 0.2; j.elbowR.rotation.x += -1.0; }
    // (at a run the arm's own pump bends it: held forward and bent too, it stood out before the body unmoving)
    else if (!freeR) { j.shoulderR.rotation.x += -0.3 * (1 - runK); j.shoulderR.rotation.z += -0.1; j.elbowR.rotation.x += -0.8 * (1 - runK) - RUN_BEND * runK; }
    // shield carried low at the side, the arm held a little out so it clears the leg, and bent further at a run; a
    // second weapon held like the first, mirrored
    if (shield.visible) { j.shoulderL.rotation.z += 0.2; j.elbowL.rotation.x += -0.35 - RUN_SHIELD_BEND * runK; }
    else if (offHeld) { j.shoulderL.rotation.x += -0.3 * (1 - runK); j.shoulderL.rotation.z += 0.1; j.elbowL.rotation.x += -0.8 * (1 - runK) - RUN_BEND * runK; }
    // through the eyes the weapons are held higher and further out, or the hands sit below the frame
    if (fp && !freeR) {
      // (a two-hander, held upright in both hands, would split the view: it rests low on the right, blade out)
      const S = two ? FP_STANCE_TWO : FP_STANCE;
      j.shoulderR.rotation.x += S[0]; j.elbowR.rotation.x += S[1]; j.handR.rotation.x += S[2]; j.handR.rotation.z += S[3]; j.shoulderR.rotation.z += S[4];
      if (offHeld) { j.shoulderL.rotation.x += S[0]; j.elbowL.rotation.x += S[1]; j.handL.rotation.x += S[2]; j.handL.rotation.z -= S[3]; j.shoulderL.rotation.z -= S[4]; }
    }
    let guard = 0;   // 0: shield at the side, 1: in front
    // standing, at the ready: the blade raised before the body, the shield half up, a second blade the mirror of the first, a two-hander across the body
    if (!fp) {
      const ia = 1 - Math.min(1, move * 2), sway = Math.sin(t * 0.7) * 0.03;
      if (two) { j.shoulderR.rotation.x += (REST_TWO[0] + sway) * ia; j.elbowR.rotation.x += REST_TWO[1] * ia; j.handR.rotation.x += REST_TWO[2] * ia; j.shoulderR.rotation.y += REST_TWO[3] * ia; }
      else if (!freeR) { j.shoulderR.rotation.x += (REST_ARM[0] + sway) * ia; j.shoulderR.rotation.z += 0.08 * ia; j.elbowR.rotation.x += REST_ARM[1] * ia; j.handR.rotation.x += REST_ARM[2] * ia; }
      if (shield.visible) { j.shoulderL.rotation.x += (-0.3 - sway) * ia; j.shoulderL.rotation.z += -0.12 * ia; j.elbowL.rotation.x += -0.95 * ia; guard = 0.45 * ia; }
      else if (offHeld) { j.shoulderL.rotation.x += (REST_ARM[0] - sway) * ia; j.shoulderL.rotation.z += -0.08 * ia; j.elbowL.rotation.x += REST_ARM[1] * ia; j.handL.rotation.x += REST_ARM[2] * ia; }
    }
    // (not through the eyes: the camera stays level, so a lean only tips the weapons into the middle of the view)
    j.spine.rotation.x += move * (fp ? 0 : IK ? 0.05 : 0.14) * dir; if (!fp && IK) j.neck.rotation.x -= move * 0.05 * dir;
    j.body.rotation.z += (st.lean || 0) * 0.12;
    j.kneeL.rotation.x += 0.1 * (1 - move); j.kneeR.rotation.x += 0.1 * (1 - move);

    const raw = st.action;
    // (the tail: the last move's end pose held a moment after it, unless the body moves off or another action starts;
    // through the eyes, a cut's alone, held as the hero walks on)
    const tailFor = (name: string) => (fp ? (name === 'swing' ? SWING_HOLD : 0) : TAIL[name] ?? 0);
    if (!raw && lastName !== '' && tailFor(lastName) > 0) { tailName = lastName; tailT = tailFor(lastName); }
    if (raw || (move > 0.3 && !fp)) { if (tailT > 0 && !raw) { fade.cut(0.25); if (!fp && two) backFrom(); } tailT = 0; }
    if (raw || !fp) outT = 0;
    let inTail = !raw && tailT > 0;
    // (the foe a blow comes down on, kept through its end held and its way back, which no action names: read only as
    // it was cast, the end held after it fell to the floor through the foe)
    if (st.strike) strikeOn = Object.assign(_strikeOn, st.strike);
    else if (raw || (!inTail && !backOut)) strikeOn = null;
    // (over on the frame its cut fades from it: held a frame longer, a blow turned to the floor and stopped by it
    // after the fade was turned and stopped again over the arms it had drawn, which the cut fades from, and the
    // arm's solve swung the elbow round 30 degrees in two frames, the greatsword's tip 52 cm)
    // (and through the eyes, the place in the view fades back as the pose does: a cut's end held, then let go of in a
    // frame, was back at rest in it)
    if (inTail) {
      tailT -= dt;
      if (tailT <= 0) {
        const out = fp ? SWING_OUT : TAIL_OUT[tailName] ?? 0.4;
        fade.cut(out); eyesL.cut(out);
        if (!fp && two) backFrom();
        // (a one-hander's forehand goes back to rest from where it left the blade out of the frame by way of under the
        // frame, as a dual wielder's hand does: `dipUnder`; its backhand keyed back to where a forehand starts,
        // `ONE_BACK_OUT`, and a two-hander's cut into its guard, `TWO_OUTS`)
        backR = !two && tailName === 'swing' && side > 0;
        backL = !!offHeld && tailName === 'swing' && side < 0;
        const keyedOut = fp && tailName === 'swing' && (two || (!offHeld && side < 0));
        if (keyedOut) outT = outLong = two ? TWO_OUT : ONE_OUT;
        else eyesR.cut(out);
        inTail = false;
      }
    }
    // (a keyed way back by its own share of it, `outP`; at its end, the rest faded in)
    const outing = !raw && outT > 0;
    if (outing) {
      outT = Math.max(0, outT - dt);
      if (outT === 0) eyesR.cut(OUT_REST);
    }
    const outP = outing ? 1 - outT / outLong : 0;
    const a: ActionState | null = raw ?? (inTail ? { name: tailName, t: 1 } : outing ? { name: 'swing', t: 1 } : null);
    // a two-hander through the eyes: how far a move posed in the hero's own space takes over from holding it
    // in the view
    let aw = 0;
    // and how far the view holds it, then: as far as the move leaves it, but in full through Steel Tempest's spin,
    // which carries the hold round (`carryRound`)
    let viewHold = 1;
    // and how far a move placed in the view turns each blade's flat to the eyes (the two-hander's, each hand's)
    let flatR = 0, flatL = 0;
    // a one-handed move placed in the view (through the eyes): how far it takes each arm over (to _ra, _rd / _la, _ld)
    let wR = 0, wL = 0;
    // and how far the trunk is turned into a swing through the eyes (rad, to its left), and whether a swing turned it
    // this frame
    let trunkTurn = 0, swingTurned = false;
    // and how much of a two-hander's right arm a swing its hands place has (`fitHeld`)
    let heldR = 0;
    unkey();
    // and the way it turns each one's flat (to the eyes unless it says), and how far it holds each fist's roll on
    // its handle as it has it (`fitInView`)
    _mr.copy(FACE_EYES); _ml.copy(FACE_EYES);
    let edgeR = 0, edgeL = 0, holdR = 0, holdL = 0;
    // and how far each hand's one-handed rest is dipped under the frame for a way back from a blow (`dipUnder`: Power
    // Strike's, Bull Rush's, each of Twin Fangs')
    let dipR = 0, dipL = 0;
    // how far the pose owns the legs (a lunge, a charge: the body leaves its feet behind at a dash's speed, so the leg IK would kneel): the pose's own legs show until the dash is over, and the feet start again under the hips
    let legOwn = 0;
    // how far a blow driven into the ground is stopped by it (groundStop), and its blade turned to the floor ahead
    // (aimAtFloor)
    let stop = 0, aimDown = 0, fall = 0, bladeUp = 0;
    // (how far the floor's stop turns the weapon down onto it, where that's less than its lift's share: `stop`)
    let settle = -1;
    // and how far it owns one leg (a step in, a lunge) while the other stands: standing only, moving the IK steps
    let ownL = 0, ownR = 0;
    const still = 1 - Math.min(1, move * 4);
    feet = null;
    let flaskWant = 0, drinkLift = 0;
    // (the off-hand weapon on the hip while drinking: hung there as the hand reaches the belt, drawn again as it comes back)
    const sheathe = !!offHeld && a?.name === 'drink' && !fp && a.t > DRINK_SHEATHED[0] && a.t < DRINK_SHEATHED[1];
    if (offHeld && sheathe !== sheathed) {
      sheathed = sheathe;
      const h = offHeld.hang ?? { at: 0.1, down: true };
      (sheathe ? (h.down ? hangDown : hangUp) : gripL).add(offHeld.group);
      offHeld.group.position.set(0, sheathe ? -h.at : 0, 0); offHeld.group.rotation.y = sheathe ? 0 : MOUNT;
    }
    // (the weapons in his hands are swung through a strike and its follow-through, for the trail they leave)
    struck.length = 0;
    if (a && STRIKES.has(a.name)) {
      if (held) struck.push(bladeR);
      if (offHeld) struck.push(bladeL);
    }
    if (chopTail > 0) chopTail = Math.max(0, chopTail - dt / 0.3);
    const began = !!raw && (raw.name !== lastName || raw.t < lastK - 0.2), ended = !raw && lastName !== '';
    if ((ended || began) && alternates(lastName)) swingEnd = t;
    if (began && alternates(raw.name)) {
      inRow = t - swingEnd < SWING_HOLD;
      side = inRow ? -side : 1;
      chain = t - swingEnd < 0.25;
    }
    // (a swing straight after a swing starts where that one ended: a short fade; out of an action back to the stance, a slow one)
    // (out of Steel Tempest's spin, the body settles out of its last turn as slowly as a weapon comes back from it: in
    // 0.3 s, back the short way round, it turned half as fast again as the spin, and through the eyes carried a
    // two-hander round with it at 19 m/s)
    // (the charge's legs run on through a cut between moves both over them: a skill cast as it runs, begun or ended)
    const charged = raw?.name === 'charge' || raw?.under?.name === 'charge', legsFade = !(charged && lastCharged);
    // (a move begun from the shoulder carry, `shouldered` still last frame's, fades in slower: in 0.14 s Power Strike
    // flicked the axe off the shoulder into its raise, its tip's way turning 37 cm in a frame)
    if (began) fade.cut(chain && alternates(raw.name) ? 0.08 : shouldered > 0.5 ? OFF_SHOULDER : 0.14, legsFade);
    else if (ended && !inTail) { fade.cut(lastName === 'spin' ? SPIN_BACK : 0.3, legsFade); if (!fp && two) backFrom(); }
    if (raw) backOut = false;
    // (through the eyes a move goes on from where the last ended, its hands seen the whole way; a dual wielder's cut,
    // a third of a second, from its rest sooner: faded in 0.14 s, it was still fading as the blow came, and an axe's
    // and a mace's arc kinked 35 degrees in a frame. Its other hand goes back to its rest from where its own cut left
    // it slower: as fast, its blade whipped across the middle of the view in four frames)
    if (began) {
      const dualCut = !!offHeld && raw.name === 'swing';
      const leftCuts = dualCut && side < 0;
      // (in a row, the other hand cut last: it goes back from there)
      backR = dualCut && leftCuts && inRow;
      backL = dualCut && !leftCuts && inRow;
      eyesR.cut(dualCut ? (leftCuts ? DUAL_BACK : DUAL_BEGIN) : 0.14);
      eyesL.cut(dualCut ? (leftCuts ? DUAL_BEGIN : DUAL_BACK) : 0.14);
    }
    else if (ended && !inTail) {
      // (out of Steel Tempest's spin a one-hander goes back to rest slower, by way of under the frame as from a cut; a
      // two-hander keyed back to its guard, `TWO_SPINS`)
      const spun = lastName === 'spin';
      if (spun && two && fp) spinOutT = SPIN_BACK;
      else eyesR.cut(spun ? SPIN_BACK : 0.3);
      eyesL.cut(spun ? SPIN_BACK : 0.3);
      if (spun && !two) { backR = true; backL = !!offHeld; }
      // (Twin Fangs' left blade held where its cut left it to the end, and back to rest from there under the frame)
      if (lastName === 'flurry' && offHeld) backL = true;
    }
    if (raw) spinOutT = 0;
    else spinOutT = Math.max(0, spinOutT - dt);
    if (a && a.name !== 'buff' && a.name !== 'cast' && a.name !== 'stagger' && a.name !== 'drink') fightT = t;
    // (a two-hander onto the shoulder out of a fight; off it at once for a move, which the move's fade brings down)
    const shoulderIt = two && !fp && (!a || a.name === 'drink') && t - fightT > SHOULDER_AFTER;
    if (!shoulderIt && shouldered > 0.5) takingHold = TAKE_HOLD;
    else takingHold = Math.max(0, takingHold - dt);
    shoulderT = shoulderIt ? Math.min(1, shoulderT + dt / SHOULDER_LIFT) : 0;
    shouldered = smooth(shoulderT);
    lastName = raw?.name ?? ''; lastK = raw?.t ?? 1; lastCharged = charged;
    armsFromBelow(fp && st.dead < 0, two);
    if (fp && two) FP_TWO_POLE.fromArray(EYES.pole);
    // Twin Fangs strikes right, then left (in step with the skill's strikes, `FANGS`)
    const fang = fangShares();
    const left = !!offHeld && ((a?.name === 'swing' && side < 0) || (a?.name === 'flurry' && a.t > fang.between));
    tipOn(left);
    // the swinging arm: the left one mirrors the right (the same pitch, the yaw and roll turned over)
    const R = left ? j.shoulderL.rotation : j.shoulderR.rotation;
    // Bull Rush's charge at `k` of it, from the feet to the hips: the brace, low and coiled with the weight on the
    // rear foot, the body leaning into the rush from the feet, bobbing over huge bounding strides, then a skid into
    // the stop, braced wide; how far it owns the legs (through the eyes, the charge's whole way, unseen)
    const chargeLegs = (k: number): number => {
      const { brace, run, skid, sc, cc } = chargeOf(k);
      if (fp) return Math.min(1, k * 10) * (1 - ramp(k, RUSH, RUSH + 0.03));
      j.body.position.y += -0.14 * brace; j.body.position.z += -0.07 * brace; j.hips.rotation.y += -0.25 * brace;
      if (brace > 0.3) feet = BRACE_FEET;
      j.body.rotation.x += 0.32 * run; j.body.position.y += (-0.08 + 0.06 * Math.abs(cc)) * run;
      const lerpX = (o: THREE.Object3D, v: number) => { o.rotation.x = lerp(o.rotation.x, v, run); };
      lerpX(j.thighL, -0.35 - 0.85 * sc); lerpX(j.thighR, -0.35 + 0.85 * sc);
      lerpX(j.kneeL, 0.35 + 1.2 * Math.max(0, cc)); lerpX(j.kneeR, 0.35 + 1.2 * Math.max(0, -cc));
      lerpX(j.ankleL, 0.25 * sc); lerpX(j.ankleR, -0.25 * sc);
      j.thighL.rotation.z = lerp(j.thighL.rotation.z, 0.06, run); j.thighR.rotation.z = lerp(j.thighR.rotation.z, -0.06, run);
      j.body.position.y += -0.12 * skid; j.body.position.z += -0.05 * skid;
      if (skid > 0.2) feet = SKID_FEET;
      return run;
    };
    // (a two-hander's Power Strike that met something high on its way down is held where it met it: `chopStuck`)
    if (a?.name !== 'chop') chopStuck = 1;
    if (a) {
      const k = a.name === 'chop' && two ? Math.min(a.t, chopStuck) : a.t;
      if (a.name === 'swing' && !fp) {
        // the arm and weapon sweep the damage arc, led by the body: see the keys (SW_*)
        const s = side, w = chain ? 1 : ramp(k, 0, 0.25), U = curve(SW_TIP, k), theta = s * 1.2 * U;
        // (a two-hander turns more with the body, keeping the grip before the chest in the left hand's reach)
        const share = two ? 1.3 : 1, hy = s * 0.3 * share * curve(SW_TIP, k + 0.07), sy = s * 0.14 * share * curve(SW_TIP, k + 0.04), cy = s * 0.26 * share * curve(SW_TIP, k + 0.02);
        j.hips.rotation.y += hy * w; j.spine.rotation.y += sy * w; j.chest.rotation.y += cy * w;
        const body = hy + sy + cy;
        if (two) {
          // (placed by the weapon, once the body is posed: see SW2_*)
          const up = Math.min(1, (U / 1.3) ** 2), round = s * U * SW2_ROUND, lead = round * SW2_LEAD, rise = lerp(SW2_LEVEL, SW2_RISE, up);
          const out = lerp(SW2_OUT, SW2_IN, up);
          twoHold.at.set(Math.sin(round) * out, lerp(SW2_LOW, SW2_HIGH, up), Math.cos(round) * out);
          twoHold.dir.set(Math.sin(lead) * Math.cos(rise), Math.sin(rise), Math.cos(lead) * Math.cos(rise));
          twoHold.flat.set(0, s, 0); twoHold.pole = SW2_POLE; twoHold.k = w; twoHold.flatK = w * (1 - ramp(Math.abs(U), SW2_EDGE[0], SW2_EDGE[1]));
        } else {
          R.x = lerp(R.x, curve(SW_PITCH, k), w); R.z = lerp(R.z, 0, w); R.y = (theta - body) * w;
          const elbow = left ? j.elbowL : j.elbowR, hand = left ? j.handL : j.handR;
          elbow.rotation.x = lerp(elbow.rotation.x, curve(SW_ELBOW, k), w);
          hand.rotation.x += ALONG_ARM * curve(SW_WRIST, k) * w;
          // (the forearm rolls the edge into the cut: palm up on a forehand, down on a backhand)
          edgeOn(hand, left ? gripL : grip, s * SW_ROLL * ((left ? s < 0 : s > 0) ? 1 : SW_BACK) * w);
        }
        // the weight: back onto the rear foot, then forward and down into the blow (less while moving: the legs are stepping)
        const ws = w * (0.4 + 0.6 * still), bend = curve(SW_BEND, k);
        j.body.position.z += curve(SW_FWD, k) * ws; j.body.position.y += curve(SW_DIP, k) * ws;
        j.spine.rotation.x += bend * w; j.chest.rotation.z += -s * curve(SW_TILT, k) * w;
        // the head stays on the foe through it all
        j.neck.rotation.y -= 0.7 * body * w; j.neck.rotation.x -= 0.5 * bend * w;
        // the other arm pulls back against the blow, and swings out of its way as a forehand carries across to it
        if (!two) {
          const O = left ? j.shoulderR.rotation : j.shoulderL.rotation, oe = left ? j.elbowR : j.elbowL, out = left ? -1 : 1, fore = left ? s < 0 : s > 0;
          // (a shield stays before the body as the blow winds up across it, dropping out of its way)
          if (shield.visible && !left) O.x += (U > 0 ? 0.25 * U : 0.15 * -U) * w; else { O.x += 0.25 * U * w; oe.rotation.x += -0.3 * Math.max(0, -U) * w; }
          O.z += out * (fore ? 0.4 * Math.max(0, U) : 0.15 * Math.max(0, -U)) * w;
        }
      } else if (a.name === 'swing') {
        // through the eyes: the weapon is placed in the view, keyed as the eyes see a cut, its flat to them through
        // the blow (models/warriorEyes.ts); the trunk turns into it, wound back to the starting side, then across as
        // the blade crosses the view. Every cut is carried round the spine by it as a body swings a weapon, held
        // through the cut's end (turned a little, a one-hander's arm went across a chest facing ahead, 42 degrees past
        // a shoulder's reach, and the turn let go of as the cut ended put it 40 past for the hold), the shoulders put
        // under the eyes again after it (turned in full, the far one came round in front of them)
        // (the leg's step and the trunk's turn let go of on a two-hander's way back to its guard)
        const w = outing ? 0 : ramp(k, 0, 0.3) * (1 - ramp(k, 0.9, 1));
        // (a cut in a row from where the last one turned it: wound from rest, the trunk jumped 0.35 rad back)
        // (a two-hander's carries the whole swing round the spine, eased in and out as its weight turns a body: turned
        // at an even rate, it started and stopped in a frame and jolted the weapon a third of its speed)
        // (a two-hander's in a row turned from further round, so begun earlier: as far round at the blow as from rest.
        // Begun as late, it was 15 degrees short of the view's middle there, and a greatsword's tip fell short of the
        // crosshair)
        // (a dual wielder's as a two-hander's, each hand's cut carried round by it: `DUAL_CUT`)
        const dual = !!offHeld;
        const turn = two ? TWO_CUT_TURN : dual ? DUAL_CUT_TURN : CUT_TURN;
        const across = turn[1];
        const theta = outing ? side * across * (1 - smooth(outP)) : cutTurnAt(turn, k, inRow, side);
        trunkTurn = theta;
        swingTurned = true;
        if (two) twoTurnHeld = theta;
        j.spine.rotation.y += 0.3 * theta;
        j.chest.rotation.y += 0.7 * theta;
        armsFromBelow(true, two);
        // (a one-handed blade taken from the arm as drawn, a swing straight after a swing too: the frames between them
        // place no hand to fade from, and it jumped to the next swing's start; a cut in a row taken over at once, its
        // fade from where the last left it: weighed in from rest, it bent back towards the rest and the blade went
        // 88 m/s between the cuts)
        const fw = inRow || outing ? 1 : ramp(k, 0, 0.12);
        // (each swung in a plane, its flat that plane's from the wind-up to the end, and the fist's roll on its handle
        // the swing's: turned to fit the arm, the edge came off the way it moved; a two-hander's by its upper hand, the
        // lower following on its grip)
        // (the mirrored fist slants its handle the other way round its palm: hands.ts `fist`)
        // (a backhand leaves the blade where a forehand in a row winds up from, so it goes on from there:
        // `TWO_FORE_ROW`, `ONE_FORE_ROW`. Its keys from rest, faded from there, a one-hander's blade turned 151 degrees
        // in the fade, 111 m/s)
        const fore = side > 0;
        if (left) {
          swingAt(DUAL_CUT, k, armBones(offHeld), _la, _ld, _ml, _pl, true); swingShoulder(DUAL_CUT, _sl, true);
          spineUnder(_sl, _sp);
          turnWithTrunk(theta, _sp, _la, _ld, _ml, _pl);
          _sl.sub(_sp).applyAxisAngle(Y_AXIS, theta).add(_sp);
          keyArm('left', _sl, _pl, _la, _ld, _ml, fw);
          wL = fw; flatL = 1; edgeL = fw; swingSlantL = -THREE.MathUtils.degToRad(DUAL_CUT.slant);
        } else {
          const twoFore = inRow && !outing ? TWO_FORE_ROW : TWO_FORE_CUT;
          const outs = TWO_OUTS.get(twoRestOf(held?.group.name ?? ''))!;
          const twoCut = outing ? (side > 0 ? outs.fore : outs.back) : fore ? twoFore : TWO_BACK_CUT;
          const oneCut = outing ? ONE_BACK_OUT : fore ? (inRow ? ONE_FORE_ROW : ONE_FORE_CUT) : ONE_BACK_CUT;
          const cut = two ? twoCut : dual ? DUAL_CUT : oneCut;
          const kk = outing ? outP : k;
          swingAt(cut, kk, armBones(held), _ra, _rd, _mr, _pr); swingShoulderAt(cut, kk, _sr);
          // (carried round the spine by the trunk's turn, the shoulder with it)
          spineUnder(_sr, _sp);
          turnWithTrunk(theta, _sp, _ra, _rd, _mr, _pr);
          _sr.sub(_sp).applyAxisAngle(Y_AXIS, theta).add(_sp);
          // (a two-hander's right arm drawn from its own shoulder, the guard's, turned as the trunk turns it, its elbow
          // towards where the swing lays one out: the same as the swing's for a cut turned about that shoulder, and a
          // backhand turned about the left (`holds`) placed by its hands, the elbow not its. Keyed from the left shoulder
          // and drawn towards that arm's elbow, the right elbow went out to the right and the wrist 107 degrees to the
          // little finger)
          const byHands = two ? swingHeldAt(cut, kk) : 0;
          heldR = byHands;
          if (two && held) {
            swingShoulder(twoRestOf(held.group.name), _so);
            _so.sub(_sp).applyAxisAngle(Y_AXIS, theta).add(_sp);
            _pr.add(_sr).sub(_so);
            _sr.copy(_so);
          }
          keyArm('right', _sr, _pr, _ra, _rd, _mr, fw, 1 - byHands);
          wR = fw; flatR = 1; edgeR = fw; swingSlantR = THREE.MathUtils.degToRad(cut.slant);
        }
        // the leg opposite the swinging arm steps in
        (left ? j.thighR : j.thighL).rotation.x += -0.3 * w; (left ? j.kneeL : j.kneeR).rotation.x += 0.3 * w;
        if (left) ownR = w * still; else ownL = w * still;
      } else if (a.name === 'flurry') {
        // Twin Fangs: a low lunge, each blade cutting down across the body from high on its own side,
        // right then left (the left arm mirrors the right: the same pitch, yaw turned over)
        const w = ramp(k, 0, 0.12) * (1 - ramp(k, 0.9, 1));
        // (cast as Bull Rush runs, its lunge rides on the charge: the legs and the drop are the charge's, `chargeLegs`
        // below; its own lunge's left the feet 21 cm off the charge's strides as it skidded to its stop)
        const lunges = a.under?.name !== 'charge';
        aw = w; legOwn = lunges ? ramp(k, 0, 0.1) : 0;
        j.spine.rotation.x += 0.3 * w; j.neck.rotation.x += -0.2 * w;
        if (lunges) {
          j.thighL.rotation.x += -0.55 * w; j.kneeL.rotation.x += 0.5 * w;
          j.thighR.rotation.x += 0.35 * w; j.kneeR.rotation.x += 0.5 * w;
          j.body.position.y += -0.12 * w;
        }
        const cut = (arm: THREE.Euler, elbow: THREE.Object3D, hand: THREE.Object3D, s: number, from: number, to: number): void => {
          const up = ramp(k, from - 0.15, from), down = ramp(k, from, to), aw = up * (1 - ramp(k, to + 0.05, to + 0.25));
          arm.x = lerp(arm.x, lerp(-2.4, -0.7, down), aw);
          arm.y = s * lerp(0.5, -0.7, down) * aw;
          arm.z = lerp(arm.z, 0, aw);
          elbow.rotation.x = lerp(elbow.rotation.x, -0.25, aw);
          hand.rotation.x += ALONG_ARM * aw;
          // (the forearm rolls the edge down into the cut, the palm turning down)
          if (!fp) edgeOn(hand, s > 0 ? grip : gripL, s * FANG_ROLL * aw);
          j.chest.rotation.y += s * lerp(0.35, -0.35, down) * aw;
        };
        const [rightAt, leftAt] = fang.hits;
        cut(j.shoulderR.rotation, j.elbowR, j.handR, 1, rightAt, rightAt + FANG_DOWN);
        cut(j.shoulderL.rotation, j.elbowL, j.handL, -1, leftAt, leftAt + FANG_DOWN);
        if (!fp) {
          // the body leads each cut: the hips turn into it a beat ahead, the trunk crunches over it and the body
          // drops into it; the lunge over, the feet are the leg IK's again, planted wide with the left forward
          for (const [s, from, to] of [[1, rightAt, rightAt + FANG_DOWN], [-1, leftAt, leftAt + FANG_DOWN]] as const) {
            const lead = ramp(k, from - 0.18, from - 0.02) * (1 - ramp(k, to + 0.1, to + 0.3)), d = ramp(k, from - 0.05, to - 0.06), hit = Math.sin(Math.PI * ramp(k, from, to + 0.06));
            j.hips.rotation.y += s * lerp(0.28, -0.32, d) * lead;
            j.spine.rotation.x += 0.16 * hit; j.neck.rotation.x += -0.1 * hit; if (lunges) j.body.position.y += -0.05 * hit;
            // (the other arm draws back as this one cuts)
            (s > 0 ? j.shoulderL : j.shoulderR).rotation.x += 0.35 * hit * (offHeld ? 0.4 : 1);
          }
          if (lunges) {
            legOwn = ramp(k, 0, 0.1) * (1 - ramp(k, fang.lunge, fang.lunge + 0.06));
            if (k > fang.lunge) feet = FANG_FEET;
          }
        }
        // (through the eyes each blade is swung as a dual wielder's cut is, `DUAL_CUT`: down across the view from high on
        // its own side, through the aim as its strike lands (`fangShares`), the left the right's mirror image, faded into
        // from rest; the right back to rest by way of under the frame as the left cuts (`dipUnder`), the left as the
        // cast's fade ends it. Placed between two places in the view, each blade's flat led its cut, 78 and 80 degrees
        // off its edge, the right's met the aim with its inner quarter and the left's never crossed it)
        if (fp && !two && held) {
          const cutOf = (hit: number) => clamp(DUAL_CUT.hit + (k - hit) / FANG_EYES.cut, 0, 1);
          const right = cutOf(rightAt), left = cutOf(leftAt);
          const rightEnd = rightAt + (1 - DUAL_CUT.hit) * FANG_EYES.cut;
          const back = smooth(ramp(k, rightEnd, rightEnd + FANG_EYES.back));
          swingAt(DUAL_CUT, right, armBones(held), _ra, _rd, _mr, _pr); swingShoulder(DUAL_CUT, _sr);
          wR = smooth(ramp(right, 0, FANG_EYES.in)) * (1 - back); flatR = 1; edgeR = wR;
          swingSlantR = THREE.MathUtils.degToRad(DUAL_CUT.slant);
          if (k > rightEnd) dipR = wR;
          if (offHeld) {
            swingAt(DUAL_CUT, left, armBones(offHeld), _la, _ld, _ml, _pl, true); swingShoulder(DUAL_CUT, _sl, true);
            wL = smooth(ramp(left, 0, FANG_EYES.in)); flatL = 1; edgeL = wL;
            swingSlantL = -THREE.MathUtils.degToRad(DUAL_CUT.slant);
          }
          // (the arm the lab holds to its keys: the one cutting)
          if (k < fang.between) keyArm('right', _sr, _pr, _ra, _rd, _mr, wR);
          else if (offHeld) keyArm('left', _sl, _pl, _la, _ld, _ml, wL);
        }
      } else if (a.name === 'chop' && !fp) {
        // Power Strike (PS_*): the arms raise the weapon overhead and tremble while the charge builds, then bring it down
        const w = ramp(k, 0, 0.1), blow = ramp(k, 0.9, 0.97), lift = ramp(k, 0, 0.3);
        const shake = (1 - blow) * lift * Math.sin(t * 45) * 0.02 * (0.5 + ramp(k, 0.3, 0.88));
        const pitch = curve(PS_PITCH, k) + shake, bend = curve(two ? [[0, -0.55], [1, -0.55]] : PS_ELBOW, k);
        R.x = lerp(R.x, pitch, w); R.z = lerp(R.z, two ? PS_ACROSS : 0, w); R.y = (two ? 0 : 0.25) * w;
        j.elbowR.rotation.x = lerp(j.elbowR.rotation.x, bend, w);
        // (the blade kept along the arm, so it's driven down into the ground before him, where the skill strikes:
        // with the wrists cocked back as it landed, a one-hander finished pointing ahead at the hips, its tip 1.2 m
        // over the floor, "warrior should hit the ground right?")
        // (a one-hander's wrist gives only so much as the blow lands, `ONE_LAND_WRIST`)
        const wr = lerp(ALONG_ARM, ONE_LAND_WRIST, two ? 0 : ramp(k, 0.9, 0.95)) * w;
        j.handR.rotation.x += wr;
        if (offHeld) {
          const L = j.shoulderL.rotation;
          L.x = lerp(L.x, pitch, w); L.z = lerp(L.z, 0, w); L.y = -0.25 * w;
          j.elbowL.rotation.x = lerp(j.elbowL.rotation.x, bend, w);
          j.handL.rotation.x += wr;
        } else if (shield.visible) {
          // the shield arm swings back and out as the body arches, and is thrown down and back with the blow
          j.shoulderL.rotation.x += (0.35 * lift - 0.1 * blow) * w; j.shoulderL.rotation.z += 0.3 * lift * w;
        }
        // (a two-hander's blow into the ground lands bowed from the hips, the knees soft, `LAND_BODY`, in place of
        // `PS_BEND`'s and `PS_DIP`'s last: crouched 0.2 m, its hands came down between the knees and the left fist went
        // into the left thigh)
        const bow = two && held ? w * ramp(k, PS_LAND.from, PS_LAND.to) : 0;
        const sb = lerp(curve(PS_BEND, k), LAND_BODY.bend, bow), ws = w * (0.4 + 0.6 * still);
        j.spine.rotation.x += sb * w; j.neck.rotation.x -= 0.55 * sb * w;
        // (a two-hander's hips not twisted into the blow, `PS_ACROSS`: twisted, its tip swung across its line)
        const hipsK = two ? 0 : 1;
        j.hips.rotation.y += curve(PS_HIPS, k) * w * hipsK; j.chest.rotation.y -= 0.6 * curve(PS_HIPS, k) * w * hipsK;
        j.body.position.z += curve(PS_FWD, k) * ws;
        // (a two-hander's whole drop as shallow as its landing's: dropped `PS_DIP`'s 0.2 on the way down, it was in a
        // squat as the head met the floor, the pelvis 25 to 35 cm under a chopper's)
        const dip = two && held ? curve(PS_DIP, k) * (LAND_BODY.dip / PS_DIP_MOST) : curve(PS_DIP, k);
        j.body.position.y += lerp(dip, LAND_BODY.dip, bow) * ws;
        // (a step in with the left foot as the weapon rises; the right stays back, turned out)
        feet = CHOP_FEET;
        // (a two-hander's blow lands with the feet squarer, `LAND_FEET`: stepped in, the left thigh stood where the
        // hands come down, and the left fist went 7 to 15 cm into it)
        if (two && held) feet = landFeet(1);
        // (a two-hander's blow ends as Thunder Crescent's does, the hands out before him and low, the elbows down: posed
        // by the shoulder's turn across, its upper arm lay level across the chest at shoulder height, the forearm
        // folded down to the left hip, "broken" to the owner)
        const end = two && held ? w * ramp(k, PS_LAND.from, PS_LAND.to) : 0;
        if (end > 0) holdAtFloor(end);
        // (and its weapon turned onto the floor in the fist and stopped by it, as Thunder Crescent's is: held as placed,
        // its head stopped 63 to 67 cm over the floor, "should land on the ground")
        if (end > 0) { aimDown = end; stop = end; fall = 1; }
        // (and stopped by what it meets on the way down, a pillar's face, a stone, a foe's top, from the top of the
        // swing: stopped only once it had come down, it went through a pillar and was pulled back out of it)
        if (two && held) stop = Math.max(stop, w * ramp(k, PS_FALL[0], PS_FALL[1]));
        // (but turned down onto the floor only as the blow lands: by the fall's share, the first frame of the landing
        // turned the arm 65 degrees down about the shoulder onto the stage under a plinth in the hall of heroes, and
        // the axe's tip jumped 2 m for a frame)
        if (two && held) settle = end;
        // (a one-hander's turned down onto the floor about the shoulder as it lands, and stopped by it)
        if (!two && held) { stop = w * ramp(k, PS_LAND.from, PS_LAND.to); fall = 1; }
      } else if (a.name === 'smite' && !fp) {
        // Thunder Crescent (SM_*): the great weapon raised overhead and driven down into the ground before him (a
        // two-hander raised over the middle of the head, within the left hand's reach, as Power Strike's is)
        const w = ramp(k, 0, 0.1);
        R.x = lerp(R.x, curve(SM_PITCH, k), w); R.z = lerp(R.z, 0, w); R.y = (two ? curve(SM_YAW, k) : 0.25) * w;
        j.elbowR.rotation.x = lerp(j.elbowR.rotation.x, curve(SM_ELBOW, k), w);
        j.handR.rotation.x += ALONG_ARM * w;
        const sb = curve(SM_BEND, k), ws = w * (0.4 + 0.6 * still);
        j.spine.rotation.x += sb * w; j.neck.rotation.x -= 0.55 * sb * w;
        j.hips.rotation.y += curve(SM_HIPS, k) * w; j.chest.rotation.y -= 0.6 * curve(SM_HIPS, k) * w;
        j.body.position.z += curve(SM_FWD, k) * ws; j.body.position.y += curve(SM_DIP, k) * ws;
        feet = CHOP_FEET;
        stop = w; aimDown = w * ramp(k, SM_TAKE[0], SM_TAKE[1]); fall = ramp(k, SM_FALL[0], SM_FALL[1]);
        bladeUp = curve(SM_BLADE, k);
        // (and from just before it lands, the hands out before him where a blow into the ground ends)
        const end = w * ramp(k, SM_LAND[0], SM_LAND[1]);
        if (end > 0 && held) holdAtFloor(end);
      } else if (a.name === 'chop' || a.name === 'smite') {
        // the overhead blows through the eyes (OVERHEAD; third person's are above), keyed in the view
        // (models/warriorEyes.ts): the weapon raised high, the fists seen at the top of the view, trembling while Power
        // Strike's charge builds, then over the top and down through it to the skill's fireAt, swung as a cut is, its
        // edge leading (`ONE_POWER`; a two-hander's from its guard, `TWO_POWERS`, Thunder Crescent's into the floor,
        // `TWO_SMITES`); after
        // the blow the blades stay down a moment (chopTail). (The trunk stays upright: bent into the blow, it took the
        // shoulders from under the hands the keys place)
        const o = OVERHEAD[a.name];
        const w = ramp(k, 0, 0.12);
        const lift = ramp(k, 0, o.lift), blow = ramp(k, o.from, o.to);
        const shake = (1 - blow) * lift * Math.sin(t * 45) * o.shake;
        const flat = ramp(k, o.from - 0.05, o.from);
        if (blow > 0) chopTail = 1;
        if (two && held) {
          // (a two-hander's from its guard, by its upper hand, the lower following on its grip)
          const power = (a.name === 'chop' ? TWO_POWERS : TWO_SMITES).get(twoRestOf(held.group.name))!;
          swingAt(power.blow, k, armBones(held), _ra, _rd, _mr, _pr); swingShoulderAt(power.blow, k, _sr);
          _ra.x += shake * 0.5; _ra.y += shake;
          keyArm('right', _sr, _pr, _ra, _rd, _mr, w);
          wR = w; flatR = 1; edgeR = w; swingSlantR = THREE.MathUtils.degToRad(power.blow.slant);
          chopBack = power.back;
        } else if (held) {
          // (one-handed, swung as a cut is, `ONE_POWER`: its flat the plane's, so its edge leads; two weapons both rise
          // and come down together, the left the mirror image of the right)
          swingAt(ONE_POWER, k, armBones(held), _ra, _rd, _mr, _pr); swingShoulder(ONE_POWER, _sr);
          _ra.x += shake * 0.5; _ra.y += shake;
          keyArm('right', _sr, _pr, _ra, _rd, _mr, w);
          wR = w; flatR = 1; edgeR = w; swingSlantR = THREE.MathUtils.degToRad(ONE_POWER.slant);
          if (offHeld) {
            swingAt(ONE_POWER, k, armBones(offHeld), _la, _ld, _ml, _pl, true); swingShoulder(ONE_POWER, _sl, true);
            _la.x -= shake * 0.5; _la.y += shake;
            wL = w; flatL = 1; edgeL = w; swingSlantL = -THREE.MathUtils.degToRad(ONE_POWER.slant);
          }
        }
        j.body.position.y += -0.16 * blow * w;
        j.kneeL.rotation.x += 0.55 * blow * w; j.kneeR.rotation.x += 0.4 * blow * w;
        j.thighL.rotation.x += -0.45 * blow * w;
        ownL = blow * w * still;
      } else if (a.name === 'spin') {
        // Steel Tempest: spin with the weapon held out, pivoting on both feet in a wide, low stance (the legs
        // turn with the body: feet can't step at this speed), the trunk leaning out over the blade and the
        // chest and arm trailing the hips so the weapon is dragged round
        // (spun as Bull Rush runs, it turns on the charge's strides, `chargeLegs` below: its own wide stance and drop
        // left the feet 23 to 27 cm off them)
        const pivots = a.under?.name !== 'charge';
        aw = 1; legOwn = pivots ? 1 : 0;
        j.body.rotation.y += a.turn ?? 0;
        if (two && !fp) {
          // (placed by the weapon, once the body is posed: see SPIN2_*; through the eyes, the arms' own keys)
          twoHold.at.copy(SPIN2_AT); twoHold.dir.copy(SPIN2_DIR); twoHold.flat.copy(SPIN2_FLAT);
          twoHold.pole = SW2_POLE; twoHold.k = 1; twoHold.flatK = 1;
        } else {
          R.x += -0.1; R.z += -1.35; R.y += -0.3; j.elbowR.rotation.x += 0.7;
          j.shoulderL.rotation.x += 0.2; j.shoulderL.rotation.z += 0.9;
          // (the other arm flung out, its elbow soft, never past straight: added to an empty hand's stance, it bent
          // back 20 degrees, 10 past an elbow's range)
          j.elbowL.rotation.x = Math.min(j.elbowL.rotation.x + 0.5, -0.1);
        }
        j.spine.rotation.x += 0.15; j.spine.rotation.z += -0.12; j.chest.rotation.y += -0.25; j.neck.rotation.y += 0.25; j.neck.rotation.z += 0.08;
        if (pivots) {
          j.thighL.rotation.set(-0.35, 0, 0.22); j.thighR.rotation.set(-0.35, 0, -0.22);
          j.kneeL.rotation.x = 0.6; j.kneeR.rotation.x = 0.6; j.ankleL.rotation.set(-0.25, 0, -0.2); j.ankleR.rotation.set(-0.25, 0, 0.2);
          j.body.position.y += -0.1 + 0.015 * Math.sin(t * 30);
        }
      } else if (a.name === 'block') {
        // Raise Shield: side-on behind the shield, left foot forward and low, the shield drawn in tight
        // before the chest and chin, the weapon cocked over it; a blocked blow jolts it all back
        const w = k, stance = w * (1 - move * 0.7), jolt = joltOf(st.blockHit ?? 0, fp);
        // (standing, the guard's own stance shows: left foot forward, right back; moving, the leg IK steps)
        guard = lerp(guard, 1, w); aw = w; legOwn = fp ? w * (1 - Math.min(1, move * 4)) : 0;
        if (w > 0.3) feet = GUARD_FEET;
        j.chest.rotation.y += -0.35 * w; j.spine.rotation.y += -0.15 * w;
        j.spine.rotation.x += (0.18 - 0.2 * jolt) * w; j.neck.rotation.x += (-0.2 + 0.1 * jolt) * w;
        // the forearm points forward so the shield (facing out of the fist) faces the foe; the yaw
        // undoes the chest's turn
        const L = j.shoulderL.rotation;
        // (seen through the eyes, raised higher: at its usual height it stays below the view)
        const bg = fp ? FP_BLOCK : NO_BLOCK;
        L.x = lerp(L.x, -0.35 + bg[0] + 0.25 * jolt, w); L.z = lerp(L.z, -0.3, w); L.y = 0.5 * w;
        j.elbowL.rotation.set(lerp(j.elbowL.rotation.x, -1.35 + bg[1] + 0.35 * jolt, w), 0, 0);
        // (no sword to cock over it: the free fist up at the chin behind the shield, as a guard)
        if (freeR) fistGuard(j, w, t, fp, true);
        else {
          R.x = lerp(R.x, -1.7, w); R.z = lerp(R.z, -0.35, w); R.y = 0.2 * w;
          j.elbowR.rotation.x = lerp(j.elbowR.rotation.x, -1.2, w);
          j.handR.rotation.x += 0.5 * w;
        }
        j.thighL.rotation.x += -0.4 * stance; j.kneeL.rotation.x += 0.5 * stance;
        j.thighR.rotation.x += 0.35 * stance; j.kneeR.rotation.x += 0.45 * stance;
        j.body.position.y += (-0.1 * stance - 0.03 * jolt);
        // (the hips turn side-on behind the shield, the weight back over the rear foot until a blow lands on it)
        if (!fp) { j.hips.rotation.y += -0.2 * w; j.body.position.z += -0.03 * stance; }
        j.body.position.z += -0.06 * jolt * w;
      } else if (a.name === 'charge') {
        // shoulder into the charge, weapon back, and braced through the landing (RUSH), the shield still up: the
        // stop strikes nothing, the foes it carried thrown on by it (skills/bullRush; the weapons cut across the front
        // there, crossing, the owner's "not supposed to hit at the end")
        // (third person: the charge's legs and body (`chargeLegs`), the shield shoulder leading, leaning back
        // against the stop in the skid)
        const { brace, run, skid, sc } = chargeOf(k);
        const w = fp ? Math.min(1, k * 6 / RUSH) * (1 - ramp(k, RUSH - 0.05, RUSH + 0.05)) : Math.max(brace, run);
        const hw = ramp(k, RUSH - 0.04, RUSH + 0.04) * (1 - ramp(k, 0.85, 1));
        // (through the eyes the weapons at rest in the view throughout, a two-hander in its guard)
        guard = shield.visible ? lerp(guard, 1, Math.max(w, hw)) : 0; aw = fp ? 0 : Math.max(w, hw); legOwn = chargeLegs(k);
        if (!fp) {
          j.chest.rotation.y += -0.2 * run; j.chest.rotation.z += -0.1 * run; j.neck.rotation.y += 0.45 * Math.max(brace, run); j.neck.rotation.x += -0.3 * run;
          // (an arm with no shield pumps with the strides; a shield is driven up before the leading shoulder)
          if (!shield.visible && !offHeld) { j.shoulderL.rotation.x += 0.5 * sc * run; }
          if (shield.visible) { j.shoulderL.rotation.x += -0.95 * run; j.elbowL.rotation.x += 0.3 * run; }
          j.spine.rotation.x += -0.2 * skid;
        }
        j.spine.rotation.x += 0.45 * w; j.neck.rotation.x += -0.3 * w;
        j.chest.rotation.y += -0.3 * w;
        const L = j.shoulderL.rotation;
        // (the shield stays up in front through the landing; through the eyes a little lower as the body
        // straightens, or it rises over half the view)
        if (shield.visible) { const sw = Math.max(w, hw), low = fp ? 0.45 * hw * (1 - w) : 0; L.x = lerp(L.x, -0.5 + low, sw); L.z = lerp(L.z, -0.2, sw); L.y = 0.4 * sw; j.elbowL.rotation.x = lerp(j.elbowL.rotation.x, -1.2, sw); }
        // (a second weapon trails the same as the first)
        else if (offHeld) { L.x += 0.6 * w; j.elbowL.rotation.x += 0.4 * w; }
        else { L.x += -0.7 * w; j.elbowL.rotation.x += 0.3 * w; }
        R.x += 0.6 * w; j.elbowR.rotation.x += 0.4 * w;
      } else if (a.name === 'drink' && !fp) {
        // the healing draught: the free hand takes the flask from the belt and drinks it (models/flask.ts); the shield
        // stays on its arm, a two-hander's left hand lets go of the grip (out of its reach)
        flaskWant = drink(j, k, mouth, handL, flask, fp ? undefined : body); aw = 1; guard = 0; drinkLift = drinkUp(k);
      } else if (a.name === 'buff') {
        // war cry: gathered in, hunched over the fists, then thrown open, chest out, arms flung wide and up,
        // head back in the roar (held as the cast ends: the fade out of it is slow)
        const g = ramp(k, 0, 0.3) * (1 - ramp(k, 0.4, 0.6)), r = ramp(k, 0.38, 0.62);
        aw = Math.max(g, r);
        j.shoulderL.rotation.x += -0.5 * g + 0.15 * r; R.x += -0.5 * g + 0.15 * r;
        j.shoulderL.rotation.z += -0.1 * g + 1.15 * r; R.z += 0.1 * g - 1.15 * r;
        j.elbowL.rotation.x += -1.1 * g - 0.25 * r; j.elbowR.rotation.x += -0.9 * g;
        j.spine.rotation.x += 0.25 * g - 0.1 * r; j.chest.rotation.x += -0.08 * r; j.neck.rotation.x += 0.15 * g - 0.3 * r;
        j.body.position.y += -0.07 * g + 0.02 * r; j.body.position.z += -0.03 * r;
        feet = WIDE_FEET;
      } else if (a.name === 'stagger') {
        // guard broken: thrown back with the arms flung open, then hunched and reeling until it passes
        const hit = 1 - ramp(k, 0, 0.3), reel = ramp(k, 0.1, 0.3) * (1 - ramp(k, 0.8, 1));
        const sway = Math.sin(t * 7) * reel;
        aw = Math.max(hit, reel);
        j.spine.rotation.x += -0.45 * hit + 0.3 * reel; j.neck.rotation.x += -0.35 * hit + 0.15 * reel;
        j.spine.rotation.z += 0.12 * sway; j.neck.rotation.z += -0.1 * sway;
        j.shoulderL.rotation.set(-0.2 * reel, 0, 0.9 * hit + 0.35 * reel); j.elbowL.rotation.set(-0.3 - 0.4 * reel, 0, 0);
        R.x += 0.4 * hit + 0.5 * reel; R.z += -0.6 * hit - 0.2 * reel; j.elbowR.rotation.x += 0.4 * hit;
        j.body.position.y += -0.05 * reel;
        j.kneeL.rotation.x += 0.35 * hit + 0.2 * reel; j.kneeR.rotation.x += 0.15 * hit + 0.2 * reel;
        j.thighR.rotation.x += 0.35 * hit;
      } else if (a.name === 'punch') {
        // Savage Fists: the lead hand's jab, then the rear hand's cross, over the guard; at full Frenzy every third a
        // two-fisted hammer (`form` 1). A shield on the other arm: every punch is the right hand's, the shield held
        aw = 1;
        if (a.form === 1 && !shield.visible) { fistHammer(j, k, fp); feet = WIDE_FEET; }
        else fistPunch(j, k, side > 0 && !shield.visible, still, t, fp, shield.visible);
      } else if (a.name === 'rampage') {
        // Rampage: a flurry of punches thrown as he walks on, the lead hand's and the rear's in turn
        aw = 1; fistRampage(j, a.beat ?? 0, still, t, fp);
      } else if (a.name === 'pounce') {
        // Pounce: the leap, knees drawn up and fists cocked, and the blows rained down on what he lands on
        aw = 1; legOwn = fistPounce(j, k, t, fp);
        if (k > 0.3) feet = WIDE_FEET;
      } else if (a.name === 'bloodrush') {
        // Bloodrush: Bull Rush's legs (its timing matches their shares), low and shoulder first, the lead forearm up
        const run = chargeLegs(k);
        aw = 1; legOwn = run;
        fistGuard(j, 1, t, fp);
        fistRush(j, Math.max(run, chargeOf(k).brace), fp);
      } else if (a.name === 'wrath') {
        // Wrath: a hook under 5 Frenzy, a two-fisted slam from 5, a quake from 10 (`form`)
        aw = 1;
        if (fistWrath(j, k, a.form ?? 0, t, fp) > 0) feet = WIDE_FEET;
      } else if (a.name === 'cast') {
        const w = pulse(k, 0, 1);
        aw = w;
        R.x += -1.2 * w; j.chest.rotation.y += 0.3 * w;
      }
    }
    // (a skill cast as the charge runs: the charge's legs under its arms, as they are under the charge's own, both
    // legs its own; posed by the skill alone, the legs stepped at a walk's pace as the body sped off at 26 m/s)
    if (a?.under?.name === 'charge') { legOwn = Math.max(legOwn, chargeLegs(a.under.t)); ownL = ownR = 0; }
    // both hands empty: the fists up in their guard for a while after a move (standing or walking: at a run the arms
    // pump), let down to hang once the fight has left him
    fistsUp = bare ? damp(fistsUp, t - fightT < FISTS_UP ? 1 : 0, 6, dt) : 0;
    // (through the eyes the fists are always up in the view, as a brawler's in a first-person game: lower out of a
    // fight; let down out of the view, the screen showed no hands at all)
    if (bare && !a && st.dead < 0) fistGuard(j, fp ? 1 : fistsUp * (1 - runK), t, fp, false, fp ? 1 - fistsUp : 0);
    const fisting = a && FISTED.has(a.name) ? 1 : a ? 0 : fp && bare ? 1 : Math.max(fistsUp, WALK_FIST * Math.min(1, move * 2));
    const fisted = bare ? fisting : 0, fistedR = freeR ? fisting : 0;
    // (and as he moves the wrists let the hands hang a little, the knuckles down)
    if (freeR && !a && !fp && st.dead < 0) {
      const going = Math.min(1, move * 2) * (1 - fistsUp), droop = WALK_DROOP * going;
      j.handR.rotation.x += droop; j.elbowR.rotation.x -= WALK_BEND * going;
      if (bare) { j.handL.rotation.x += droop; j.elbowL.rotation.x -= WALK_BEND * going; }
    }
    if (st.hit > 0) { j.spine.rotation.x += -0.2 * st.hit; j.neck.rotation.x += -0.15 * st.hit; }
    // a two-hander at a run, carried at high port
    // (out of a fight on the shoulder, at a run too; in one, at high port)
    const onShoulder = shouldered;
    leftOff = shouldered > 0 ? Math.max(shouldered, leftOff) : Math.max(0, leftOff - dt / TAKE_HOLD);
    // (and off the lower grip as he goes down, to rest on his thigh)
    const leftOffIt = Math.max(shouldered > 0 ? shouldered : smooth(leftOff), st.sit ? smooth(ramp(satBy(st.sit), 0, 0.25)) : 0);
    // (his left hand has a two-hander as his right goes round on it, hand over hand, and is gone as he sits)
    // (by a fire until its far end is on the floor, then let go as his right lays it down: from play, "as soon as sword
    // lifts off ground, he needs both hands to manipulate it", of it held out level in one fist)
    // (by a fire, once its far end is on the floor and before he goes down, `floorLetGo` on of his hands' stage: let go as
    // it came onto the floor, the arm went back across his belly; as he started down, his thighs rising into his arm
    // as his body dropped, the hand went 50 cm in 6 frames, the arm's solve flipping, 13 to 26 cm a frame)
    // (a maul head up on a seat, until it stands on its butt)
    const planted = st.sit && held && standsUp(st.sit, held);
    // (his hands' stage: a maul's once he's sat, `after`, every other two-hander's before he goes down)
    const handsAt = st.sit ? (planted ? st.sit.after : st.sit.before) : 0;
    // (taking it up, his left comes onto it as his right takes it again: on from `floorLetGo`, after his right, it closed
    // on the haft 13 cm in a frame)
    const letGoFrom = twoSit.pickingUp ? SIT_HANDS.floorTakeBy : SIT_HANDS.floorLetGo;
    const letGoTo = twoSit.pickingUp ? SIT_HANDS.floorTakeFrom : 1;
    const letGo = pickKeyed ? pickAt('leftOn', pickK)
      : st.sit && onFloor(st.sit) ? 1 - smooth(ramp(st.sit.before, letGoFrom, letGoTo))
      : planted ? 1 - smooth(ramp(handsAt, SIT_HANDS.plantLetGo, 1))
      : 1 - smooth(ramp(st.sit ? satBy(st.sit) : 0, 0, SIT_HANDS.helpOff));
    const leftHelps = st.sit && handsAt > 0 && held && two && !fp && st.dead < 0
      ? smooth(ramp(handsAt, SIT_HANDS.helpFrom, SIT_HANDS.helpBy)) * letGo : 0;
    // (by a fire, as far on it as it helps: eased off it by `leftOffIt` there, it stayed on till he was a quarter sat,
    // then went in a few frames, 13 to 17 cm a frame)
    const leftAway = leftHelps >= 1 ? 0 : st.sit && onFloor(st.sit) && handsAt > 0 ? 1 - leftHelps : Math.min(leftOffIt, 1 - leftHelps);
    // (right against his right hand on a long handle, his arm low: where it holds it to fight, his elbow stood level across
    // his chest)
    if (held?.off != null) {
      const near = leftHelps > 0 && floorRest(held) !== SIT_HANDS.swordRest;
      // (over his right fist on a haft held head up, as one lifts a maul)
      offGrip.position.y = planted ? SIT_HANDS.upLeftAbove : near ? SIT_HANDS.leftAbove : held.off;
      // (by a fire, taking it up off the floor, his left hand by its head, down the haft to his right once it's nearly
      // upright: with both fists at its butt, its head a metre out on the floor, no one lifts it, from play "he can put it
      // down with one hand, but he cannot lift it up with one hand", "one hand needs to be closer to head")
      if (near && pickKeyed) {
        const scale = _slideScale.setFromMatrixScale(grip.matrixWorld).y;
        // (his metres, scaled with him, from the butt, less how far it runs behind the grip in the world's)
        offGrip.position.y = (pickAt('leftAlong', pickK) * root.scale.y - behindFist(held!)) / scale;
      }
      else if (near && twoSit.pickingUp && st.sit) {
        const lift = floorLiftBy(held);
        const byHead = smooth(ramp(st.sit.before, lift, lift + SIT_HANDS.floorHeadHeld));
        const takeAt = SIT_HANDS.floorFistFromButt + SIT_HANDS.floorHandsApart - twoSit.pickBehind;
        offGrip.position.y = lerp(SIT_HANDS.floorShoulderAt, takeAt, byHead);
      }
    }
    if (!fp && two && !a && runK > 0 && st.dead < 0) holdInChest(ARM_R, RUN_TWO_AT, RUN_TWO_DIR, RUN_TWO_POLE, runK * (1 - onShoulder));
    if (!fp && two && onShoulder > 0 && st.dead < 0) holdInChest(ARM_R, SHOULDER_AT, SHOULDER_DIR, SHOULDER_POLE, onShoulder, SHOULDER_FLAT);
    // (a two-handed move placed by the weapon)
    if (!fp && two && twoHold.k > 0 && st.dead < 0) holdInChest(ARM_R, twoHold.at, twoHold.dir, twoHold.pole, twoHold.k, twoHold.flat, twoHold.flatK);
    // (a two-hander's way back to its guard out of a move, placed by the weapon: its grip and way eased from where the
    // move left them to where the pose holds them, the arm reaching them. Faded joint by joint, the greataxe swung up
    // through the face's way out of Power Strike's end, the right elbow flared: every joint within its range, the arm
    // "broken")
    const backing = backOut && !fp && two && !a && st.dead < 0;
    if (backing) weaponNow(GUARD_AT, GUARD_TURN, GUARD_POLE);
    if (st.dead < 0) fade.apply(dt); else fade.reset();
    if (backOut && fade.weight === 0) backOut = false;
    if (backing && backOut) {
      backToGuard(fade.weight);
      // (and lifted out of whatever it would swing into on the way, a pillar it stopped on: turned back to the guard
      // from there, its head went 55 cm into the pillar's side for a frame)
      stop = 1;
    }
    // (by a fire he crouches as he lays a two-hander down, and up again as he lifts it, his knees bent and his hips back,
    // so his shoulders come down to it: standing straight, his arms were held stiff and straight out to it for a second,
    // "jerky and lame". Before the sit's pose, which takes his body on from there as he goes down)
    // (taking it up, his body as the pick-up's keys pose it, `PICK`)
    if (!st.sit || st.sit.before <= 0 || twoSit.settingDown) twoSit.keyedUp = false;
    pickKeyed = !!st.sit && onFloor(st.sit) && st.sit.before > 0 && two && !fp && st.dead < 0 && !!held
      && twoSit.pickingUp && twoSit.rising && (twoSit.laid || twoSit.keyedUp) && st.sit.w <= 0;
    pickK = pickKeyed ? 1 - st.sit!.before : 0;
    if (pickKeyed) {
      const standing = 1 - smooth(st.sit!.w);
      j.body.position.y -= pickAt('drop', pickK) * standing;
      j.body.position.z -= pickAt('back', pickK) * standing;
      j.spine.rotation.x += pickAt('lean', pickK) * standing;
      j.spine.rotation.y += pickAt('twist', pickK) * standing;
    }
    else if (st.sit && onFloor(st.sit) && st.sit.before > 0 && two && !fp && st.dead < 0 && held && !standsUp(st.sit, held)) {
      const [drop, back, lean] = SIT_HANDS.floorCrouch;
      const crouch = smooth(ramp(st.sit.before, floorLiftBy(held), SIT_HANDS.lowerBy));
      const standing = 1 - smooth(st.sit.w);
      j.body.position.y -= drop * crouch;
      j.body.position.z -= back * crouch * standing;
      j.spine.rotation.x += lean * crouch * standing;
      // (and down low to take it up, turned to it, as one squats to lift a maul and stands with it: his left hand by its
      // head on the floor was out of reach of his crouch)
      if (twoSit.pickingUp) {
        const [pickDrop, pickBack, pickLean] = SIT_HANDS.floorPickCrouch;
        // (risen into from the floor, so his hand stays on it where it lies, and out as he lifts it: stood up first, his
        // hand couldn't reach it on the floor and lifted it in one fist as he rose, 54 cm; and come in all at once once
        // he was up, his body dropped 20 cm in a frame)
        // (and down only as he comes to stand by it: crouched from the first, he turned and stepped to it on his knees,
        // his left arm swept through his thigh)
        const arrive = 1 - smooth(ramp(st.sit.before, SIT_HANDS.floorTurnIn, SIT_HANDS.floorPickDownFrom));
        const low = smooth(ramp(st.sit.before, floorLiftBy(held), SIT_HANDS.floorTurnIn)) * arrive;
        j.body.position.y -= pickDrop * low * standing;
        j.body.position.z -= pickBack * low * standing;
        j.spine.rotation.x += pickLean * low * standing;
      }
    }
    const legW = sitPose(j, st.sit, t);
    // (and he leans into its weight as he lets it down: bolt upright, it was no weight at all)
    if (st.sit && st.sit.before > 0 && two && !fp && st.dead < 0 && !(held && standsUp(st.sit, held)) && !pickKeyed) {
      const liftBy = onFloor(st.sit) && held ? floorLiftBy(held) : SIT_HANDS.liftBy;
      j.spine.rotation.x += SIT_HANDS.leanTo * smooth(ramp(st.sit.before, liftBy, SIT_HANDS.lowerBy)) * (1 - smooth(st.sit.w));
    }
    // (a maul head up, sat: his shoulders turned and leant to his right while his hands work it beside his right knee,
    // as a man reaches for what's at his side. Square, his left hand reached a haft only near his middle, where its head
    // stood before his face from ahead, and tilted off it the butt went into a shin or his wrist 39 degrees past)
    if (st.sit && st.sit.w > 0 && two && !fp && st.dead < 0 && held && standsUp(st.sit, held)) {
      const h = st.sit.after;
      const turned = smooth(ramp(h, SIT_HANDS.helpBy, SIT_HANDS.upLeftFrom)) * (1 - smooth(ramp(h, SIT_HANDS.plantLetGo, 1)));
      const [ahead, round, aside] = SIT_HANDS.upTurn;
      j.spine.rotation.x += ahead * turned;
      j.spine.rotation.y += round * turned;
      j.spine.rotation.z += aside * turned;
    }
    // (a two-hander laid on the floor; a one-hander stays in his fist, over his thigh, as he sits anywhere)
    const floorSit = !!st.sit && onFloor(st.sit);
    _sitTurn.roll[0] = offHeld && !sheathed ? SIT_HANDS.roll[0] : 0;
    _sitTurn.roll[1] = held && !two ? SIT_HANDS.roll[1] : 0;
    const further = floorSit ? SIT_HANDS.floorBack : SIT_HANDS.along;
    // (two swords on a seat crossed, the left resting on the right: a fist lays its blade across his lap past its thumb,
    // so from each knee they cross, and at one height they went through each other, from play "this is messed up".
    // Side by side, one across his hips and one across his knees, they read from ahead as one bar)
    const dualSeat = !floorSit && !!offHeld && !sheathed && !!held && !two;
    _sitTurn.along![1] = held ? further + (dualSeat ? SIT_HANDS.twoAlong[1] : 0) : 0;
    _sitTurn.over![1] = held ? SIT_HANDS.over : 0;
    const heldIn = floorSit ? SIT_HANDS.floorIn : SIT_HANDS.armIn;
    _sitTurn.armIn![1] = held ? heldIn : 0;
    _sitTurn.arc![1] = held ? SIT_HANDS.arc : 0;
    _sitTurn.along![0] = offHeld && !sheathed ? further + (dualSeat ? SIT_HANDS.twoAlong[0] : 0) : 0;
    _sitTurn.over![0] = offHeld && !sheathed ? SIT_HANDS.over + (dualSeat ? SIT_HANDS.twoOverL : 0) : 0;
    _sitTurn.armIn![0] = offHeld && !sheathed ? heldIn : 0;
    _sitTurn.arc![0] = offHeld && !sheathed ? SIT_HANDS.arc : 0;
    // (the shield's arm outside the thigh, the shield clear of it: on the thigh, his knee came through it on a low seat)
    // (by a fire, down beside his knee, its rim on the floor: on the knee, it hung upright in the air beside him)
    _sitTurn.out![0] = shield.visible ? (floorSit ? SIT_HANDS.floorShieldOut : SIT_HANDS.shieldOut) : 0;
    _sitTurn.low![0] = shield.visible && floorSit ? SIT_HANDS.floorShieldLow : 0;
    st.look?.();
    _lifted.length = 0;
    _lifted.push(1);
    _lifted.push(0);
    _resting.length = 0;
    _resting.push(0);
    const twoSits = !!(st.sit && (st.sit.w > 0 || st.sit.before > 0) && held && two && !fp && st.dead < 0);
    if (!twoSits) _resting.push(1);
    if (!twoSits && held) {
      held.group.userData.stoodOn = false;
      grip.userData.slidesAlong = false;
      held.group.userData.tipping = false;
      held.group.userData.stuckIn = 0;
    }
    if (!twoSits) {
      gripAsHeld();
      twoSit.laid = false;
      if (held) held.group.userData.laid = false;
      leaveGround();
      twoSit.taken = false;
    }
    else if (!twoSit.taken) takeTwoRest(st.sit!, t, held!);
    // (his arm as the standing pose has it, before the sit places his hands: the carry the keyed pick-up ends on)
    _rightArm.forEach((joint, i) => _standArm[i].copy(joint.quaternion));
    _standAt.copy(j.shoulderR.position);
    restHands(j, st.sit, _resting, _sitTurn, SIT_HANDS.rise, _lifted);
    if (st.sit && !fp && st.dead < 0) {
      // (ahead over his far knee on a seat, down across his shins by a fire, as a palm on the knee holds it: straight
      // across his lap, an axe's haft went through his shield, a sword over his other hand and two swords made one bar;
      // level over his raised knees by a fire it floated, and down beside his shin the wrist was at its stops for as
      // long as he sat and the blade went 37 cm in a frame)
      // (turned once the hands are low by a fire: from the start, the blade lay flat at shin height from a hand hanging
      // straight down)
      const both = offHeld && !sheathed, lapR = both ? SIT_HANDS.twoR : SIT_HANDS.lapR;
      const from = floorSit ? SIT_HANDS.turnLate : SIT_HANDS.turnFrom;
      const edgeDown = floorSit ? SIT_HANDS.edgeDown : 0;
      // (a two-hander as a one-hander, lowered with his arm and its fist closed, its weight taken by his thighs. Stood
      // upright in the fist, "too heavy, this won't work"; on its point ahead, the blade ran along the forearm with the
      // arm at its stops; flipped point down in the fist, it spun in his hand)
      if (held && !two) holdAcrossLap(false, grip, floorSit ? SIT_HANDS.kneesR : lapR, satBy(st.sit), from, st.sit, edgeDown);
      if (both) holdAcrossLap(true, gripL, floorSit ? SIT_HANDS.kneesL : SIT_HANDS.twoL, satBy(st.sit), from, st.sit, edgeDown);
    }
    body.legs = floorSit ? satBy(st.sit) : 0;
    if (st.dead >= 0) { deathFall(j, st.dead, -1); legs.reset(); }
    else {
      // the legs: planted feet, a pelvis that follows them (ik.ts); then a crouch bends the knees instead of sinking the feet
      if (!fp) legs.captureArms();
      _legW[0] = 1 - ownL; _legW[1] = 1 - ownR;
      // the feet: side-on, the left forward and the right back and turned out; fighting, the left steps further in
      const F = feet ?? (t - fightT < 1.6 ? FIGHT_FEET : REST_FEET);
      legs.stance(0, F[0], F[1], F[2]); legs.stance(1, F[3], F[4], F[5]);
      legs.update(dt, st.phase, st.dead, (1 - legOwn) * legW, fp ? 0 : 1, _legW);
      groundFeet(j, 0.07);
      if (!fp) legs.holdArms();
    }
    // through the eyes a two-hander rests in both hands where both are seen (held out on the right, the
    // left hand on the lower grip), and the attacks take it from there
    // after an overhead blow the blades stay down a moment, then come back to rest (the cast ends right after it):
    // one-handed by a blend, a two-hander keyed back to its guard (`TWO_POWERS`, `TWO_SMITES`)
    if (fp && chopTail > 0 && a?.name !== 'chop' && a?.name !== 'smite') {
      const u = chopTail * chopTail * (3 - 2 * chopTail);
      if (two && held) {
        if (chopBack) {
          swingAt(chopBack, 1 - u, armBones(held), _ra, _rd, _mr, _pr); swingShoulderAt(chopBack, 1 - u, _sr);
          keyArm('right', _sr, _pr, _ra, _rd, _mr, 1);
          wR = 1; flatR = 1; edgeR = 1; swingSlantR = THREE.MathUtils.degToRad(chopBack.slant);
        }
      } else if (held) {
        // (held where its swing ended, `ONE_POWER`, and back to rest from there under the frame, `dipUnder`: blended
        // straight from the blade down ahead to it upright, the forearm turned over in a frame and the blade jumped
        // 133 cm)
        swingAt(ONE_POWER, 1, armBones(held), _ra, _rd, _mr, _pr); swingShoulder(ONE_POWER, _sr);
        wR = u; flatR = 1; edgeR = u; dipR = dipL = smooth(ramp(u, 0, POWER_RISE));
        if (offHeld) {
          swingAt(ONE_POWER, 1, armBones(offHeld), _la, _ld, _ml, _pl, true); swingShoulder(ONE_POWER, _sl, true);
          wL = u; flatL = 1; edgeL = u;
        }
      }
    }
    if (fp && two && st.dead < 0 && held) {
      // (at rest in its guard, keyed as a swing is, `TWO_REST`: its right hand the upper one, the left following on the
      // lower grip; a swing over it by its weight, as a one-hander's over its rest; the elbow towards `FP_TWO_POLE`,
      // the shoulder where `armsFromBelow` put it. Held from the shoulder
      // under the camera, its forearm rose up the view along the handle and the wrist was bent 126 degrees past its
      // range)
      // (a weapon with a head held lower, to be seen: `twoRestOf`)
      // (held low through Steel Tempest's spin instead, its edge leading, `TWO_SPIN`: swung into from the guard, and
      // back to it once the spin is over)
      const guard = twoRestOf(held.group.name), spinWays = TWO_SPINS.get(guard)!;
      const spins = a?.name === 'spin', spunOut = !a && spinOutT > 0;
      const rest = spins ? spinWays.into : spunOut ? spinWays.out : guard;
      const restK = spins ? ramp(a.time ?? 0, 0, SPIN_INTO) : spunOut ? 1 - spinOutT / SPIN_BACK : 0;
      swingAt(rest, smooth(restK), armBones(held), _er, _ed, _ef, _pe);
      if (wR === 0) {
        keyArm('right', swingShoulderAt(rest, smooth(restK), _sr), _pe, _er, _ed, _ef, 1);
        swingSlantR = THREE.MathUtils.degToRad(rest.slant);
      }
      _ra.lerpVectors(_er, _ra, wR); _rd.lerpVectors(_ed, _rd.normalize(), wR); _pr.lerpVectors(_pe, _pr, wR);
      turnTowards(_ef, _mr, wR, _mr);
      flatR = 1; edgeR = 1;
      // (held in its guard through Iron Bellow's roar, as a person roars with a two-hander held in both hands: let go
      // to the pose's own arms, flung wide and up, the lower hand let go of the grip 20 cm out of its reach, #198)
      const roars = a?.name === 'buff';
      if (keyed) keyedArm.weight *= 1 - (roars ? 0 : aw);
      _rf.copy(_mr);
      // (carried round with the body through Steel Tempest's spin, as a one-hander is, the shoulders with it: let go to
      // the pose's own arms, the lower hand let go of the grip each turn and its elbow bent 152 degrees past its range)
      const turned = turnOfBody();
      if (turned !== 0) carryRound(turned, [_ra], [_rd, _rf, _pr]);
      // (its keys with it, as the lab checks the arm against them: left where they were keyed, the way back out of the
      // spin read as drawn off them while the body settled)
      if (turned !== 0 && keyed) carryRound(turned, [keyedArm.shoulder, keyedArm.elbow, keyedArm.grip], [keyedArm.dir, keyedArm.flat]);
      viewHold = a?.name === 'spin' || roars ? 1 : 1 - aw;
      // (its elbow faded from the last swing's as its grip is: from a cut's end to the guard no hold lets go of it)
      holdR = eyesR.apply(_ra, _rd, dt, _rf, edgeR, _pr);
      if (keyed) keyedArm.weight *= 1 - eyesR.fading;
      // (the shoulders where the swing puts them, the left across the spine from the right, both turned round it by the
      // trunk's turn as a turned chest carries them; out of a cut, the turn it left faded out as its place is. Left
      // where it rested, under the camera 16 cm below the right, the left hand was 9 cm short of the lower grip on
      // the forehand's wind-up)
      if (!swingTurned) {
        trunkTurn = twoTurnHeld * eyesR.fading;
        if (eyesR.fading === 0) twoTurnHeld = 0;
      }
      const driver = swingShoulderAt(rest, smooth(restK), _sr);
      spineUnder(driver, _sp);
      _sl.set(-driver.x, driver.y, driver.z).sub(_sp).applyAxisAngle(Y_AXIS, trunkTurn).add(_sp);
      driver.sub(_sp).applyAxisAngle(Y_AXIS, trunkTurn).add(_sp);
      if (turned !== 0) carryRound(turned, [_sr, _sl], []);
      shoulderTo(j.shoulderR, _sr, 1);
      shoulderTo(j.shoulderL, _sl, 1);
      holdInView(ARM_R, _ra, _rd, swingPole(_pr, FP_TWO_POLE, holdR, _qr), viewHold, _rf, flatR, SOFT_REACH * (1 - holdR));
      wR = 1;
    }
    if (fp && !two && st.dead < 0) {
      // (at rest each blade is held low on its own side of the view, `oneRest`, a move's place over it by its weight:
      // left to the stance's own angles, the arms' shoulders moved under the camera put the hilts under the frame)
      // (and its flat turned as the rest has it, a move's to the eyes over it by the move's weight)
      // (held out through Steel Tempest's spin instead, `spinRest`)
      const restOf = a?.name === 'spin' ? spinRest : oneRest;
      if (held) {
        const k = restOf(held, _er, _ed, _ef);
        if (backR && wR === 0) dipUnder(_er, _ed, _ef, eyesR.fading);
        if (dipR > 0) dipUnder(_er, _ed, _ef, dipR);
        _ra.lerpVectors(_er, _ra, wR); _rd.lerpVectors(_ed, _rd.normalize(), wR);
        // (a swing's flat as it is: its knuckles lead, its forearm in its plane)
        turnTowards(_ef, edgeR > 0 ? _mr : sameSide(held, _ef, _mr), wR, _rf); flatR = lerp(k, flatR, wR); wR = 1;
      }
      if (offHeld) {
        // (mirrored across the view: its place and way flip in x, its flat, a cross of two ways, in y and z, as
        // `swingAt` mirrors one; flipped in x like a way, the fist turned over on the handle and the blade left the frame)
        const k = restOf(offHeld, _er, _ed, _ef); _er.x = -_er.x; _ed.x = -_ed.x; _ef.set(_ef.x, -_ef.y, -_ef.z);
        if (backL && wL === 0) dipUnder(_er, _ed, _ef, eyesL.fading);
        if (dipL > 0) dipUnder(_er, _ed, _ef, dipL);
        _la.lerpVectors(_er, _la, wL); _ld.lerpVectors(_ed, _ld.normalize(), wL);
        turnTowards(_ef, edgeL > 0 ? _ml : sameSide(offHeld, _ef, _ml), wL, _lf); flatL = lerp(k, flatL, wL); wL = 1;
      }
      // (carried round with the body as it turns under the camera, Steel Tempest's spin, as a person spinning holds the
      // weapon as he held it: held where the view had it as the shoulder came round, it went out of reach and the elbow
      // flipped over each turn, the blade a metre and more in a frame, #249; let go to the pose's own arm, the upper arm
      // swept across the eyes and filled a third of the view; the spin over, its way back isn't: carried round as the
      // pose's fade unwinds the body's last turn, the blade whipped up through the view at 20 m/s)
      const turned = a?.name === 'spin' ? turnOfBody() : 0;
      if (turned !== 0 && held) carryRound(turned, [_ra], [_rd, _rf]);
      if (turned !== 0 && offHeld) carryRound(turned, [_la], [_ld, _lf]);
      // (each faded from the last move's, a swing's hold on its fist too, and a swing's elbow where its arm's bones
      // meet in its plane, `swingAt`, by that hold: the last swing's as it fades)
      // (and its shoulder where the swing puts it, as long as that hold lasts)
      if (held && wR > 0) {
        holdR = eyesR.apply(_ra, _rd, dt, _rf, edgeR);
        if (keyed?.hand === 'right') keyedArm.weight *= 1 - eyesR.fading;
        if (holdR > 0) shoulderTo(j.shoulderR, _sr, holdR);
        const pole = holdR > 0 ? swingPole(_pr, POLE_VR, holdR, _qr) : POLE_VR;
        holdInView(ARM_R, _ra, _rd, pole, wR, _rf, flatR, SOFT_REACH * (1 - holdR));
      }
      if (offHeld && wL > 0) {
        holdL = eyesL.apply(_la, _ld, dt, _lf, edgeL);
        if (keyed?.hand === 'left') keyedArm.weight *= 1 - eyesL.fading;
        if (holdL > 0) shoulderTo(j.shoulderL, _sl, holdL);
        const pole = holdL > 0 ? swingPole(_pl, POLE_VL, holdL, _ql) : POLE_VL;
        holdInView(ARM_L, _la, _ld, pole, wL, _lf, flatL, SOFT_REACH * (1 - holdL));
      }
    }
    // (a hand not placed in the view this frame has no place there to fade from)
    if (!fp || st.dead >= 0 || !held || wR === 0) eyesR.reset();
    if (!fp || two || st.dead >= 0 || !offHeld || wL === 0) eyesL.reset();

    shield.quaternion.slerpQuaternions(SHIELD_SIDE, SHIELD_FRONT, guard);
    shield.position.lerpVectors(SIDE_POS, FRONT_POS, guard);
    // drinking, the forearm comes up across the face: the shield hangs from it before the chest instead, facing
    // ahead and shifted towards the elbow, the face and the flask clear above it
    // (and sat, from the forearm resting on his thigh, beside his leg facing out)
    const sat = st.sit?.w ?? 0;
    shieldHang = damp(shieldHang, Math.max(drinkLift, sat), 12, dt); drinkOn = damp(drinkOn, a?.name === 'drink' ? 1 : 0, 12, dt);
    regrip = drinkOn >= 0.5 ? TAKE_HOLD : Math.max(0, regrip - dt);
    // (eased off to nothing: cut off at 1%, the shield went 10 cm in that frame as he stood up)
    if (shieldHang > 1e-4 && shield.visible) {
      root.updateMatrixWorld(true);
      j.elbowL.getWorldPosition(_s1); j.handL.getWorldPosition(_s2);
      if (sat !== drinkLift) hangOut = sat > drinkLift;
      const out = hangOut ? 1 : 0;
      const a = _s3.subVectors(_s2, _s1).normalize(), n = _s4.set(out, 0, 1 - out).transformDirection(root.matrixWorld);
      n.addScaledVector(a, -a.dot(n)).normalize();
      _sm.makeBasis(_s5.crossVectors(a, n), a, n);
      _sq.setFromRotationMatrix(_sm).premultiply(j.handL.getWorldQuaternion(_shq).invert());
      // (a round shield, turned half round its face whichever is nearer how it's held: a half turn off, the way it
      // eased flipped as the hand turned, and it went 49 cm in a frame)
      _shq.copy(_sq).multiply(HALF_ROUND);
      if (_shq.angleTo(shield.quaternion) < _sq.angleTo(shield.quaternion)) _sq.copy(_shq);
      shield.quaternion.slerp(_sq, shieldHang);
      // (sat, round the fist that holds it, its face out: hung 26 cm down the forearm, it slid back up the arm as he
      // stood, and the fist came out through its face, "whats this hand clipping through shield ?")
      if (out) _s1.copy(_s2).addScaledVector(n, SIDE_POS.x * _s3.setFromMatrixScale(j.handL.matrixWorld).x);
      else _s1.lerp(_s2, 0.3).addScaledVector(_s4.set(0, -1, 0), 0.26 * root.scale.x);
      shield.position.lerp(j.handL.worldToLocal(_s1), shieldHang);
    }

    // the weapon arm within a body's ranges, its hand where the pose put it (armIK.ts); first, as a two-hander's lower
    // grip goes wherever it takes the weapon. A two-hander's upper hand holds it square (slanted, it moved the lower
    // grip and that wrist bent further). (Not through the eyes, where the arms are placed where they're seen: fitted,
    // a two-hander held square couldn't point its blade ahead of the arms, where the eyes see it, and stood upright)
    slantR = 0; slantL = 0;
    if (aimDown > 0 && held && !fp && st.dead < 0) aimAtFloor(aimDown, bladeUp, fall * fall);
    // (the hold he stood with remembered as he begins to sit, and taken up again once he's up: from where the carry's
    // solves left the arm, it came back on another slant, the weapon 4 to 7 cm along his fist)
    if (st.sit && st.sit.w > 0 && held && !fp) standR ??= remembered(j.shoulderR);
    else if (standR) {
      recall(j.shoulderR, standR);
      standR = null;
    }
    if (st.sit && st.sit.w > 0 && offHeld && !sheathed && !fp) standL ??= remembered(j.shoulderL);
    else if (standL) {
      recall(j.shoulderL, standL);
      standL = null;
    }
    const gripped = !!held;
    if (twoSits) {
      // (up to the port, then let down onto what takes its weight)
      // (lifted off his shoulder to the port before his body goes down, as a weight is, and let down as he sits: both in
      // the sit's own time, its tip went 29 cm a frame)
      // (and down over the first of his way, ahead of his thighs: over all of it, its butt met them rising, 11 cm in)
      // (let down at one pace over his way down and a moment more, `after`: eased on top of his own easing, in his
      // 1.1 s, it went 17 cm a frame at its fastest. `w` is `smooth` of his way: this is that way back.)
      const way = 0.5 - Math.sin(Math.asin(1 - 2 * st.sit!.w) / 3);
      const loweredBy = onFloor(st.sit!) ? 1 : SIT_HANDS.lowerBy;
      const upright = standsUp(st.sit!, held!);
      // (head up on a seat, his hands' stage is once he's sat, `after`: he sits with it on his shoulder, takes it off to
      // beside his knee and stands it there, and getting up shoulders it before he stands. Stood on its butt as he
      // stood, its head was at his chin's height wherever it stood, from play "the maul head is at his cheek")
      const before = upright ? st.sit!.after : st.sit!.before;
      // (by a fire, taken up with his fist by its butt: held where he fights with it, a greataxe's 78 cm of haft behind
      // his fist swept through his thighs toward the flames as he lifted it, from review "the haft goes into or under his
      // knee and shin", "the haft's butt sweeps over the ring of stones". Slid back up to where he fights with it as he
      // shoulders it. Taken off first, as the path places the weapon by his fist's own grip)
      slideGrip(-twoSit.slid);
      twoSit.slid = 0;
      if (twoSit.pickingUp && held && twoSit.laid && !twoSit.keyedUp) pickStance(held);
      const slideMost = Math.max(0, twoSit.pickBehind - SIT_HANDS.floorFistFromButt);
      pickSlide = twoSit.pickingUp && held && !pickKeyed
        ? slideMost * (1 - smooth(ramp(before, floorLiftBy(held), SIT_HANDS.helpBy))) : 0;
      // (and otherwise off it once his left hand has it: lifted as it came, it was up in one fist a moment)
      // (off his shoulder once his left hand has it: lifted as it came, it was up in one fist a moment)
      // (by a fire over longer: its head goes further, out past his shoulder to his right, and over his hands' stage to
      // `liftBy` its haft went 15 cm a frame)
      const floor = onFloor(st.sit!);
      const liftBy = floor ? floorLiftBy(held!) : SIT_HANDS.liftBy;
      const up = smooth(ramp(before, SIT_HANDS.helpBy, upright ? SIT_HANDS.upLeftFrom : liftBy));
      // (head up: setting it down as his hands' stage goes on, taking it up as it goes back; held where it is between)
      if (before > twoSit.handsWas) {
        twoSit.settingDown = true;
        twoSit.pickingUp = false;
      }
      else if (before < twoSit.handsWas) {
        // (only from it laid all the way down: taken back up from part way, it goes back the way it came)
        if (floor && twoSit.settingDown && twoSit.handsWas >= 1) twoSit.pickingUp = true;
        twoSit.settingDown = false;
      }
      twoSit.handsWas = before;
      // (getting up from it laid, it stays where it lies as he rises into a crouch beside it, his fist on its butt, and is
      // taken up from there in both hands: the low key is where it lies. Through the key he laid it down by, his fist
      // stood it on its head beside him as he rose, and swung it end over end up into his hands, one-handed, from review:
      // "it is then rotated end over end through horizontal", "never lifted head-up in front of him from where it lay".
      // Switched as his body starts up, while it lies at rest where that key doesn't count, and back as he starts laying
      // it down, while it's on his shoulder)
      if (floor) {
        if ((st.sit!.w < twoSit.wWas || st.sit!.after < twoSit.afterWas) && before >= 1) {
          twoSit.rising = true;
          twoSit.pickingUp = true;
        }
        if (twoSit.settingDown && !twoSit.pickingUp && before > 0 && before < 1 && st.sit!.w === 0) twoSit.rising = false;
        twoSit.wWas = st.sit!.w;
        twoSit.afterWas = st.sit!.after;
        // (where it truly lies, in the path's frame: its key for lying in his frame moved with him as his body slid
        // forward getting up, and his fist took it there, 46 cm off where it lay, in a frame)
        if (twoSit.rising && twoSit.laid) {
          _sitFrameInverse.copy(pathFrame()).invert();
          laidHeldAt(twoSit.lowAt).applyMatrix4(_sitFrameInverse);
          twoSit.lowWay.set(0, 1, 0).applyQuaternion(twoSit.laidQ).transformDirection(_sitFrameInverse);
        }
        else if (!twoSit.rising) {
          twoSit.lowAt.copy(twoSit.layLowAt);
          twoSit.lowWay.copy(twoSit.layLowWay);
        }
      }
      if (pickKeyed) pickUpKeyed(held!, pickK);
      // (taken up, the path's first key is it head up before him as he's turned to it: the same at its far end on the
      // floor, where the two meet)
      if (floor && !pickKeyed) {
        if (twoSit.pickingUp) pickKey();
        else {
          twoSit.frontAt.copy(twoSit.layAt);
          twoSit.frontWay.copy(twoSit.layWay);
        }
      }
      // (its butt onto the floor: let slip down as it comes off his shoulder, and lifted back up through his fist by his
      // left once that's on it)
      const planting = twoSit.settingDown ? smooth(ramp(before, SIT_HANDS.upSlipFrom, SIT_HANDS.upSlipBy))
        : smooth(ramp(before, SIT_HANDS.upPlantFrom, SIT_HANDS.upPlantBy));
      // (taken up, left on the floor till he's turned to it)
      const lowEnd = twoSit.pickingUp ? SIT_HANDS.floorPickFrom : loweredBy;
      const falling = upright ? 1 : smooth(ramp(before, liftBy, lowEnd));
      const down = floor ? smooth(way) : 0;
      // (the arm solved for the grip as his fist had it, not as the weapon lying let go of left it: it flipped as he took it up)
      if (!pickKeyed) gripAsHeld();
      // (head up, the arm solved for the grip seated in his fist, not as last frame's slide down the haft left it: solved
      // for that, his fist stood 60 cm over where it was asked, at his shoulder, and the butt off the floor)
      if (upright) seat(handR, grip, held!.r, slantR);
      if (upright) leanUpright(smooth(ramp(before, SIT_HANDS.upLeanFrom, 1)));
      // (placed by the weapon, off the arm as he carried it)
      if (!pickKeyed) _rightArm.forEach((joint, i) => joint.quaternion.copy(twoSit.from[i]));
      if (!pickKeyed) j.shoulderR.position.copy(twoSit.fromAt);
      if (floor && up < 1 && !pickKeyed) {
        _sitFrameInverse.copy(pathFrame()).invert();
        ARM_R.grip.getWorldPosition(twoSit.carryAt).applyMatrix4(_sitFrameInverse);
        twoSit.carryWay.set(0, 1, 0).transformDirection(ARM_R.grip.matrixWorld).transformDirection(_sitFrameInverse);
      }
      if (!pickKeyed) weaponOnPath(falling, held!, down, floor ? up : 1);
      // (by a fire the path already starts where it lay on his shoulder, so the carry's joints are eased off over the
      // lift's first part alone, as his elbow settles: over all of it, they held its head up by his face until late, and
      // it was made up at the end, from his face to his hip in a tenth of a second)
      const fromCarry = pickKeyed ? 0 : floor ? 1 - smooth(ramp(up, 0, FLOOR_JOINTS_BY)) : 1 - up;
      _rightArm.forEach((joint, i) => joint.quaternion.slerp(twoSit.from[i], fromCarry));
      // (his shoulder too, which the path's hold may have lowered: left there, a maul on his shoulder stood 5 cm off it
      // as he sat with it, and jumped 13 cm back as he came up)
      if (!pickKeyed) j.shoulderR.position.lerp(twoSit.fromAt, fromCarry);
      // (head up, from his shoulder's slant to the one it stands with by his knee as it comes off: at that one already, it
      // stood 5 cm off his shoulder and slid 7 cm in his fist as he walked to the seat)
      slantR = upright ? lerp(twoSit.fromSlant, twoSit.lowSlant, up)
        : lerp(lerp(twoSit.fromSlant, twoSit.frontSlant, up), twoSit.lowSlant, falling);
      // (once it's in the ground it stays there, whatever his body does: his hand turns round on it, and his arm follows
      // it as he sits, so it can't spin or jump)
      const inGround = !floor && !upright && before >= SIT_HANDS.lowerBy;
      if (inGround && !twoSit.stood) takeStood(held!, st.sit!.hip);
      if (!inGround) leaveGround();
      // (his right hand round on it as he stands, lowered, his left holding it; stood in the ground as his hips come down,
      // the owner's "he should lower the sword down, then sit, then stick it into the ground": the wrist can't hold it
      // upright with him stood, and at the seat's spot his arm wouldn't reach it)
      const round = smooth(ramp(before, SIT_HANDS.lowerBy, 1));
      const turned = smooth(ramp(way, SIT_HANDS.plantFrom, SIT_HANDS.plantBy));
      const [, , , slides, , handleEnd] = floorRest(held!);
      const slide = slides + (floorRest(held!) === SIT_HANDS.swordRest ? 0 : twoSit.lower);
      // (and leaning up, its far end drawn back a little along the ground, as his hand goes round: a cane's hold has it leave
      // under his little finger, so it can't lie as low as the fist that lowered it. Drawn back all the way his hands came in,
      // his left forearm 23 cm into his chest; not at all, his right went out of reach)
      const leans = lerp(round * floorRest(held!)[8], 1, turned);
      const drawn = lerp(round * floorRest(held!)[8] * SIT_HANDS.leanDraws, 1, turned);
      if (inGround) standBy(leans, drawn, round, Math.min(slide, handleEnd - 0.1) * smooth(way), held!, slantR);
      // (his fist loosened on it as it's tipped upright on its far end: the lab's `sit` passes this over, and no other turn)
      held!.group.userData.tipping = inGround && (round < 1 || turned < 1);
      held!.group.userData.handleTo = floorRest(held!)[5];
      held!.group.userData.stoodOn = (inGround && turned >= 1) || down >= 1 || (upright && planting >= 1);
      // (stood on its butt while he still stands, and planted there as long as his body moves, his fist going down the haft
      // as he sits and up it as he stands: let down with his hips and taken up with them as he rose, it slid up through his
      // fist on its own, from play "maul cannot slide up without jedi force he doesn't have")
      if (upright) buttDown(held!, planting, before, twoSit.settingDown);
      // (said on the grip, which `lab sit` follows as the piece hung from his hand)
      // (his hand sliding up it to take it again higher, the weapon held still by the keys: `held`)
      grip.userData.slidesAlong = upright || pickSliding;
      grip.userData.stoodOn = false;
      if (!pickKeyed) layDown(st.sit!, held!, floor);
      const stuck = inGround && turned > 0 && floorRest(held!) === SIT_HANDS.swordRest;
      held!.group.userData.stuckIn = stuck ? SIT_HANDS.stuckIn + twoSit.lower * SIT_HANDS.sinkBy : 0;
    }
    else if (!fp && st.dead < 0) {
      // (sat, kept near the slant he stood with: free, the weapon went 10 cm along his fist; held to it, the wrist went
      // 12 degrees past its range)
      const stood = st.sit ? standR?.slant : undefined;
      const slant: number | [number, number] = stood === undefined ? SLANT : [stood - SIT_HANDS.slant, stood + SIT_HANDS.slant];
      slantR = fitArm(j, false, gripped ? gripTurn(handR, grip, _vr) : undefined, body, gripped && (!two || st.sit) ? slant : undefined).slant;
      // (the arm as it's drawn standing still, which it's lifted from as he sits and carried in as he's taken it up
      // again: kept as he walked to the seat, his arm caught mid-swing, the pick-up ended on another carry than the one he
      // stood in once up, and the weapon turned a metre at its tip in a frame)
      // (and walking, until he has stood still once: `lab sit` walks him to the fire from his set-up, and no carry was
      // kept at all, so he ended the pick-up holding it upright at his side, his arm hanging)
      if (move < 0.05 || !twoSit.fromStill) {
        twoSit.fromStill ||= move < 0.05;
        _rightArm.forEach((joint, i) => twoSit.from[i].copy(joint.quaternion));
        twoSit.fromAt.copy(j.shoulderR.position);
        twoSit.fromSlant = slantR;
      }
    }
    // (a two-hander through the eyes is held as its swings key it: fitted so, its weapon turned off its place and the
    // lower grip went out of the left hand's reach)
    // (and a swing that holds its fist on the handle is held as it puts it, `fitInView`'s `hold`)
    // (its handle slanted across the palm as the swing holds it: square, the blade stood 25 degrees further off the forearm)
    // (a two-hander's upper fist as its swing holds it, keyed at rest too; on a swing its hands place, the backhand
    // turned about the left shoulder, fitted from its own shoulder, `fitHeld`)
    else if (fp && st.dead < 0 && held) {
      slantR = fitInView(false, grip, gripTurn(handR, grip, _vr), SLANT, holdR) + holdR * swingSlantR;
      if (two && heldR > 0) slantR = lerp(slantR, fitHeld(gripTurn(handR, grip, _vr), heldR), heldR);
    }
    // (the weapon seated in the fist as it holds it, its handle diagonal across the palm by that slant: before a lower grip is taken)
    // (a two-hander's too wherever the pose's own arm has a share of it, `viewHold`: thrown up out of the frame by
    // Iron Bellow's roar, the pose's turns, made for the arm fitted in third person, bent the wrist 27 degrees past
    // toward the little finger, and faded back into the view's place and way, 14 past; held in the view, its swings
    // keep it within, so the clamp has nothing left to do once the view's fade back from it is over)
    const posed = viewHold < 1 || eyesR.fading > 0;
    if (fp && st.dead < 0 && held && (!two || posed)) wristInGrip(false, gripTurn(handR, grip, _vr, slantR));
    if (held && !twoSit.stood && !twoSit.laid && !twoSit.upright && !pickKeyed) seat(handR, grip, held.r, slantR);
    // (taken up by the keys, eased from how they left it in his fist into how he holds it standing: his arm fitted
    // afresh once he's up picks its turn in his fist from the keyed arm, and it turned 25 degrees in a frame)
    // (eased in the world: his wrist turned as his arm was fitted, the weapon seated alike in his fist)
    if (pickKeyed) pickOff = 1;
    else if (held && pickOff > 0) {
      pickOff = Math.max(0, pickOff - dt / PICK_OFF);
      const ease = smooth(pickOff);
      // (from it seated as he holds it each frame: blended from last frame's blend, it never came back to his grip)
      grip.quaternion.copy(twoSit.laidGrip);
      seat(handR, grip, held.r, slantR);
      root.updateMatrixWorld(true);
      grip.getWorldPosition(_hw1).lerp(_pickLastAt, ease);
      grip.getWorldQuaternion(_pickSeatedQ).slerp(_pickLastQ, ease);
      grip.position.copy(j.handR.worldToLocal(_hw1));
      grip.quaternion.copy(j.handR.getWorldQuaternion(_standTurn).invert().multiply(_pickSeatedQ));
      grip.updateMatrixWorld(true);
    }
    twoSit.upright = false;
    // (by a fire, his fist by its butt to take it up: `pickSlide`)
    if (twoSits && pickSlide > 0) {
      slideGrip(pickSlide);
      twoSit.slid = pickSlide;
      grip.userData.slidesAlong = true;
    }
    else {
      pickSlide = 0;
      twoSit.slid = 0;
    }
    if (stop > 0 && held && st.dead < 0) {
      const lifted = groundStop(stop, fall >= 1, settle < 0 ? stop : settle);
      // (lifted off something standing high, a pillar's face, a stone, a foe's top, before the blow reached the floor
      // ahead: the swing stops there, as a blow does on what it hits, and holds that moment's pose. Lifted about the
      // shoulder alone from a pillar close before him, the shoulder went 83 to 111 degrees past its raise)
      const t = a?.t ?? 0;
      if (two && a?.name === 'chop' && chopStuck === 1 && t >= PS_FALL[0] && t < PS_LAND.from && lifted > STUCK_LIFT) {
        tip.getWorldPosition(_hw1);
        const feet = root.getWorldPosition(_hw2);
        if (_hw1.y - groundHeight(feet.x, feet.z) > HIGH_ON[0] * root.scale.x) chopStuck = t;
      }
    }

    // a two-hander: the left hand follows the grip wherever the right arm takes the weapon, and lets go
    // where it can't reach (a pose that flings the arms apart), the arm easing back to the pose's own
    let twoHeld = false;
    // (his left arm solved already for where his hand eases to on or off a two-hander, so not fitted again: solved twice
    // a frame, each from the other's last elbow, his hand went 15 to 20 cm one way and back in turn as it came on)
    let leftEased = false;
    // (how his left arm is placed this frame, sat or getting up: 0 its own pose, 1 eased from it a hand far off the grip,
    // 2 at the grip or held)
    let leftMode = 0;
    if (two) {
      root.updateMatrixWorld(true);
      offGrip.getWorldPosition(_grip);
      j.chest.worldToLocal(_grip);
      const fore = j.P.foreL + j.P.handR, out = _grip.distanceTo(j.shoulderL.position) - (j.P.upperL + fore);
      // (a few cm short doesn't show: the stances hold it at full stretch; drinking, it lets go halfway to the flask,
      // and the arm eases back from the grip after; and it lets go as the right hand lifts the weapon onto the
      // shoulder, easing back to hang on the way. Eased back while still holding, the hand slid off the grip and the
      // wrist bent 52 degrees; held halfway to the shoulder, the lower grip's turn bent it 30)
      let k = (1 - ramp(out, 0.07, 0.2)) * Math.min(1, 2 * (1 - drinkOn)) * (1 - leftAway);
      const reach = out < 0.07 && drinkOn < 0.5 && leftAway === 0;
      // (sat or getting up, coming onto it or letting go: his hand goes from where the pose has it to the grip, the arm
      // solved for each place on the way. Blended by the joints' turns between the two arms, his hand went 50 cm along
      // a crooked path in 6 frames as he let go by a fire, 13 to 17 cm a frame off its line)
      const easing = k > 0 && k < 1 && !!st.sit && leftHelps > 0;
      leftEased = easing;
      leftMode = easing ? (k < 0.5 ? 1 : 2) : k > 0 ? 2 : 0;
      if (k > 0) {
        _sq.copy(j.shoulderL.quaternion); _eq.copy(j.elbowL.quaternion); _wq.copy(j.handL.quaternion);
        if (easing) {
          // (from the pose's own arm as fitted, as it's drawn when his hand is off it: from the pose's own as posed,
          // the elbow went 25 cm in the ease's first frame. Fitted with no memory, or the grip's solve after it starts
          // from it, and the two take turns)
          j.handL.getWorldPosition(_letW); j.handL.getWorldQuaternion(_letQ);
          j.elbowL.getWorldPosition(_letP).sub(j.shoulderL.getWorldPosition(_letS));
          solveArm(j, true, { wrist: _letW, hand: _letQ, pole: _letP, body, remember: false });
          j.handL.getWorldPosition(_letW); j.handL.getWorldQuaternion(_letQ);
          j.elbowL.getWorldPosition(_letP).sub(j.shoulderL.getWorldPosition(_letS)).normalize();
          j.shoulderL.quaternion.copy(_sq); j.elbowL.quaternion.copy(_eq); j.handL.quaternion.copy(_wq);
        }
        // the wrist where the fist closes round the lower grip (a hand stays on its wrist), the hand's length along
        // the line to the shoulder, turned about the handle as far as the arm needs to stay within a body's ranges
        // (armIK.ts); a grip no turn makes possible, or one the arm reaches only through the body, it lets go of
        // (held turned to the shoulder, the wrist bent 130 degrees and the forearm went 17 cm into the chest)
        j.shoulderL.getWorldPosition(_up).sub(offGrip.getWorldPosition(_gw));
        _hd.set(0, 1, 0).transformDirection(grip.matrixWorld);
        fistReach(handL, _hd, _up, held!.r, _cur);
        fistTurn(handL, _hd, _up, _fq);
        // (the handle may run diagonally across the lower palm, as a person's lower hand holds one: held square, that
        // wrist bent 73 degrees sideways, 43 past its range, through the two-handed swing)
        // (through the eyes, from its shoulder under the camera, `armsFromBelow`, and clear of no body: the one the view
        // hides has its shoulders elsewhere and none of it is drawn, and an arm into it let go of the grip as Power
        // Strike and Thunder Crescent drove the weapon down before the belly, 15 cm deep in a chest no one sees, #198)
        // (its turn on the grip found between the few tried, `glide`: picked from them, the greataxe's left wrist jumped
        // 6 degrees in a frame, 2 past its range)
        const shoulder = fp ? _fw[5].copy(j.shoulderL.position) : undefined;
        _cur.negate().add(_gw);
        _pw.copy(_pole).applyQuaternion(j.chest.getWorldQuaternion(_cq));
        // (and its elbow from where the pose had it: from the grip's pole alone, the elbow went 20 cm in the first
        // frame of the ease, the hand still nearly where the pose had it)
        // (taking it up by a fire, its elbow's move capped a frame through the whole keyed pick-up: from the capped solve to
        // the free one halfway through the ease, it went over to its other side, 57 cm in a frame)
        // (its turn about the handle, about an axis through the grip, as far as the hand is on it: in full off it, the
        // hand went 15 to 20 cm round the grip in a frame as it began to ease)
        if (easing) {
          _cur.lerp(_letW, 1 - k); _fq.slerp(_letQ, 1 - k); _pw.normalize().lerp(_letP, 1 - k);
          // (round in front of him: straight from the grip at his right front to his left side, his forearm went 8 cm
          // into his chest, and its elbow went over to its other side in a frame, his hand 41 cm)
          _cur.add(_letS.set(0, 0, 1).transformDirection(root.matrixWorld).multiplyScalar(EASE_AHEAD * j.root.scale.x * Math.sin(Math.PI * k)));
        }
        const fit = easing && k < 0.5 ? solveArm(j, true, { wrist: _cur, hand: _fq, pole: _pw, body, maxMove: EASE_ELBOW / j.root.scale.x }) : solveArm(j, true, { wrist: _cur, hand: _fq, roll: { axis: _hd, range: easing ? 1.1 * k : 1.1, at: _gw }, pole: _pw, body: fp ? undefined : body, slant: SLANT, slantOnHandle: true, glide: 1, shoulder, flexion: GRIPPED_FLEXION, maxMove: pickKeyed ? EASE_ELBOW / j.root.scale.x : undefined });
        slantL = fit.slant;
        _up.applyAxisAngle(_hd, fit.roll);
        // (a grip out of reach for a frame or two is held through: a hand doesn't let go for 50 ms; and while the hand
        // comes onto it off the shoulder, it's taking hold, not failing to: counted so, it was still easing back after)
        // (nor does it let go while the right goes round: nothing else has the weapon then)
        // (and while his left comes onto it as he sits or stands, `leftHelps`, eased by it alone: counted as holding
        // only once fully on, it eased from nothing, and the arm went 37 cm onto the haft in a frame as it got there)
        twoGood = takingHold > 0 || leftHelps > 0 ? 1 : damp(twoGood, reach && fit.excess < 15 && fit.depth < 0.03 ? 1 : 0, 6, dt);
        twoHeld = reach && twoGood > 0.5;
        grasp.past = fit.excess; grasp.into = fit.depth;
        // (the arm eases back to the pose's own only once the hand has let go: easing it back while still holding bent the wrist)
        if (!twoHeld) k *= Math.min(1, 2 * twoGood);
        if (k < 1 && !easing) { j.shoulderL.quaternion.slerp(_sq, 1 - k); j.elbowL.quaternion.slerp(_eq, 1 - k); j.handL.quaternion.slerp(_wq, 1 - k); }
      } else { grasp.past = 0; grasp.into = 0; }
      // (coming back onto it off the flask, it's taking hold too: counted as let go, the hand on its way back read as off
      // the grip for 4 frames after every draught)
      grasp.held = twoHeld; grasp.free = drinkOn >= 0.5 || onShoulder > 0 || ((takingHold > 0 || regrip > 0) && !twoHeld); grasp.short = out;
    }

    // the other arm within a body's ranges too, its hand where the pose put it
    const grippedL = offHeld && !sheathed;
    if (!fp && st.dead < 0 && !twoHeld && !leftEased) {
      const stoodL = st.sit ? standL?.slant : undefined;
      const slantRange: number | [number, number] = stoodL === undefined ? SLANT : [stoodL - SIT_HANDS.slant, stoodL + SIT_HANDS.slant];
      slantL = fitArm(j, true, grippedL ? gripTurn(handL, gripL, _vl) : undefined, body, grippedL ? slantRange : undefined).slant;
    }
    else if (fp && st.dead < 0 && offHeld && !sheathed) slantL = fitInView(true, gripL, gripTurn(handL, gripL, _vl), SLANT, holdL) + holdL * swingSlantL;
    if (fp && st.dead < 0 && offHeld && !sheathed) wristInGrip(true, gripTurn(handL, gripL, _vl, slantL));
    fadeLeftSwitch(st.sit && !fp && st.dead < 0 && two ? leftMode : -1, twoHeld, dt);
    // (set down once the arm is fitted: the fit moved the hand, and the shield with it, 8 cm into the floor)
    // (on a seat it stays on his forearm, hung beside his leg: stood on its rim by his shin, its grip was lower than
    // his hand reaches sat, and it flew there off his arm, "weapons are being pulled around with jedi force")
    // (a cut out of a blow turned to the floor and stopped by it, after the fade, fades from the arms as drawn; every
    // other from the pose's own: from the arms as fitted, the cut into a two-handed swing blended two elbows, and the
    // lower grip went 9 cm out of the left arm's reach)
    if (!fp && st.dead < 0 && (aimDown > 0 || stop > 0)) fade.drawnArms();
    if (!fp && st.dead < 0 && two && held) weaponNow(DRAWN_AT, DRAWN_TURN, DRAWN_POLE);
    // (and through the eyes, where the arms are placed after the fade, from the arms as drawn: a one-handed swing over,
    // the arm was back in the stance in a frame)
    if (fp && st.dead < 0) fade.drawnArms();
    // (and a two-hander a move posed in the hero's own space took over from the view, where it was drawn, for the fade
    // back to the view's hold)
    if (fp && st.dead < 0 && two && held && viewHold < 1) drawnInView(eyesR, grip);

    // the mail skirt swings with the legs, draped over them and the hands; the tassets on each side ride their own thigh
    const fL = -j.thighL.rotation.x, fR = -j.thighR.rotation.x;
    for (const ta of tassets) ta.g.rotation.x = -(0.12 + Math.max(-0.05, ta.s > 0 ? fL : fR) * 0.75 + move * 0.05);
    // (the cloth round each armhole part of the way with its arm, as posed)
    sets.bend();
    root.updateMatrixWorld(true);
    // (sat, the free hand rests on the thigh)
    placeBodies(!fp && st.dead < 0 && !(offHeld && !sheathed) && !twoHeld ? 1 - satBy(st.sit) : 0);
    // (through the eyes the body isn't drawn, nor its shadow: the mail swings undraped)
    skirt.update(fL, fR, move, t, dt, fp ? undefined : legBodies.list, fp ? undefined : handBodies.list, satBy(st.sit));

    // the flask comes out of the fist and is put away again (before the fist closes round it: shown a frame before
    // it was first held, it lay the way the last drink left it, 70 degrees off, for that frame)
    flaskOut = damp(flaskOut, flaskWant, 16, dt); flask.visible = flaskOut > 0.02; flask.scale.setScalar(Math.max(0.02, flaskOut));
    // fists round whatever they hold; an empty hand hangs loosely curled
    const along = (g: THREE.Object3D) => _hd.set(0, 1, 0).transformDirection(g.matrixWorld);
    // (a fist's handle, the line of its knuckles: the one the pose gives it in the body's frame, `fistLine`, or the
    // hand's own grip's; square across its forearm, where a weapon's grip slants out of the hand (the fist shut on that
    // hung 38 degrees off the wrist, past its range, in a punch). The visible hand turns to it, the wrist's joint doesn't)
    const knuckles = (g: THREE.Object3D, hand: THREE.Object3D, line: THREE.Vector3) => {
      const dir = line.lengthSq() > 0 ? _hd.copy(line).transformDirection(j.body.matrixWorld) : along(g);
      _fa.set(0, 1, 0).transformDirection(hand.matrixWorld);
      return dir.addScaledVector(_fa, -dir.dot(_fa)).normalize();
    };
    // (each handle diagonal across its palm by the slant the arm took, the weapon seated in that fist)
    if (held && twoSits && twoSit.stood) holdStood(held, slantR);
    else if (held) {
      hold(handR, along(grip), held.r, undefined, slantR);
      // (reaching for it as it lies, his hand open until it's on it: closed, his fist was 90 cm off its handle)
      if (pickKeyed && pickOpen > 0) loosen(handR, SIT_HANDS.offOpen * smooth(pickOpen));
      // (off what he laid down, its hand as an empty one lies on his knee)
      if (twoSit.laid) {
        const off = smooth(st.sit?.after ?? 0);
        handR.vis.quaternion.slerp(_noTurn, off);
        loosen(handR, SIT_HANDS.offOpen * off);
      }
    }
    // (a fist is the hand closed as round a thin handle, the fingers into the palm and the thumb over them: curled
    // joint by joint it was a claw, from play, "fists need some work")
    else if (fistedR > FIST.from) hold(handR, knuckles(grip, j.handR, fistLine.R), FIST.r);
    else poseHand(handR, lerp(0.5 + Math.sin(t * 1.3) * 0.05, FIST.curl, fistedR), lerp(0.1, FIST.spread, fistedR));
    if (offHeld && !sheathed) { seat(handL, gripL, offHeld.r, slantL); hold(handL, along(gripL), offHeld.r, undefined, slantL); }
    else if (twoHeld && held) hold(handL, along(grip), held.r, _up, slantL);
    else if (flaskOut > 0.01) holdFlask(handL, flask, flaskOut);
    else if (fisted > FIST.from) hold(handL, knuckles(gripL, j.handL, fistLine.L), FIST.r);
    else poseHand(handL, shield.visible ? 1.35 : lerp(0.5 + Math.sin(t * 1.3 + 1) * 0.05, FIST.curl, fisted), lerp(0.08, FIST.spread, fisted));

    wrists.L.bend(handL.vis);
    wrists.R.bend(handR.vis);

    if (dt > 0) for (const f of furs) f.update(dt);

    // the blade's fuller glows while a skill charges
    edge.emissiveIntensity = (st.charge || 0) * 1.5;
  }

  return {
    root, kit, joints: j, hands: { L: handL, R: handR }, animate, tip, palm, height: 2.05, setGear, dye, setHair: head.setHair,
    get swing() { return side; },
    swung: struck,
    get swingKeyed() { return keyed; },
    swingBones: (left: boolean) => ({ ...armBones(left ? offHeld : held) }),
    get offTip() { return offHeld ? tipL : null; },
    get lowerGrip() { return held?.off != null ? grasp : null; },
    // (a two-hander lifted before he goes down, and its weight brought up slower: in the sit's own time, its
    // tip went 15 cm a frame coming off the shoulder)
    sitHandsUp: (floor) => (floor && held?.off != null ? _floorHands : NO_HANDS),
    sitHands: (floor) => {
      if (held?.off == null) return NO_HANDS;
      if (floor && !twoSit.pickingUp) return TWO_FLOOR_HANDS;
      if (floor) {
        // (turned and stepped to stand alongside it, facing it across, `pickStance`: from where he sat his hands
        // couldn't reach it on the floor short of folding him double, his left 16 cm short of its haft; turned 75 degrees
        // and stepped by set amounts, he crouched facing along it, its haft under his thigh)
        _floorTurn.yaw = twoSit.pickYaw;
        _floorTurn.at = [twoSit.pickAt.x, twoSit.pickAt.z];
        _floorTurn.by = pickStepped;
        _floorTurn.inTo = SIT_HANDS.floorTurnIn;
        // (and left facing the way he took it up, shouldering it there, as a man does: turned back to the seat's way
        // as he lifted it, its haft swung round upright before his face at arm's length, from review "the lift snaps
        // from horizontal to near-vertical in front of his face", "his arms lock straight out at shoulder height")
        _floorTurn.backFrom = 0;
        _floorTurn.backTo = -1;
        return _floorHands;
      }
      return headUp(held) ? TWO_UP_HANDS : TWO_SIT_HANDS;
    },
    get offGrip() { return held?.off != null ? offGrip : null; },
    get fists() {
      const fists: Fist[] = [];
      // (a weapon stood or laid down as he sits isn't held by its grip: his palm on its top, or his hand on a knee)
      if (held && !twoSit.laid && !(pickKeyed && pickOpen > 0.01)) fists.push({ hand: 'right', ...fistOn(handR, grip, held.r) });
      if (offHeld && !sheathed) fists.push({ hand: 'left', ...fistOn(handL, gripL, offHeld.r) });
      else if (held?.off != null && grasp.held) fists.push({ hand: 'left', ...fistOn(handL, offGrip, held.r) });
      return fists;
    },
    // (the fight forgotten too: a hall's hero chosen away from as his showcase's strike landed stood on its dais finishing
    // it, the end of the blow held on one bent knee, "warrior is dancing on one leg like irish dancer")
    reset: () => { legs.reset(); fade.reset(); fightT = -9; fistsUp = 0; lastName = ''; lastK = 1; tailT = 0; chopTail = 0; },
    // through the eyes the fur at the elbows passes right by the camera: a ring of spikes filling the view
    armsFov: () => EYES.fov,
    firstPerson: (on) => { fp = on; for (const f of elbowFur) f.visible = !on && gloved; },
    dispose() {
      kit.dispose();
      for (const f of furs) f.dispose();
      disposeGeometries(root);
    },
  };
}
