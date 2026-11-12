// The Warrior: a bare-headed veteran in an engraved breastplate over layered leather, fur at the collar,
// cuffs and boot tops, crossed straps, a mail skirt between leather tassets, engraved knee cops and tall
// strapped boots. Carries the equipped weapon and shield, and wears only the armour
// equipped: without a chest item the quilted gambeson, trousers and boots under it, without a hands item
// bare hands below the gambeson's sleeves. Fully procedural.
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { leather as leatherMaps, mail as mailMaps, cloth as clothMaps, steel as steelMaps, fur as furMaps, wood as woodMaps, pbrMaterialMaps } from '../../core/textures';
import { engravedSteel, projectUV, steelRegion } from '../../core/engraving';
import { buildHumanoid, joint, resetPose, walkCycle, idle, deathFall, pulse, ramp, reachArm, groundFeet, runShareOf, disposeGeometries } from './rig';
import { Sculpt, stripRig, limb, lathe } from './shapes';
import { FurSway } from './furSway';
import { LegIK, IK } from './ik';
import { fitArm, solveArm, type ArmResult } from './armIK';
import { bodyShape, clampWrist, GRIPPED_FLEXION } from './anatomy';
import { curve, PoseFade, type Keys } from './motion';
import { buildFlask, drink, drinkUp, holdFlask, DRINK_SHEATHED, type DrinkHold } from './flask';
import { taperTube, twist, plate, edgeTube, strap, belt, buckle, stud, disc, furTufts, furTuftsSteps, Skirt, SkirtLimbs, armOffThigh, merge, scaleUV, lod, type SurfaceFn, type JointPoint } from './armor';
import { headSteps, HERO_HEADS, buildNeck, toGroup, handSkin, HEAD_MM } from './head';
import { NECKLINE_BACK } from './tunic';
import { buildHand, poseHand, hold, seat, fistReach, fistTurn, fistOn, gripTurn, bare, handCapsules, SLANT, fistLength } from './hands';
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
import {
  TWO_REST, TWO_FORE_CUT, TWO_FORE_ROW, TWO_BACK_CUT, TWO_OUTS, twoRestOf, ONE_FORE_CUT, ONE_FORE_ROW, ONE_BACK_CUT, ONE_BACK_OUT,
  CUT_TURN, TWO_CUT_TURN, DUAL_CUT, DUAL_CUT_TURN,
  ONE_POWER,
  TWO_SPINS, TWO_POWERS, TWO_SMITES,
} from './warriorEyes';
import type { ActionState, AnimState, Blade, Fist, Gear, KeyedArm, LowerGrip, Model, Struck } from '../../types';
import { built, type ModelSteps } from './steps';
import { Dye } from './dye';
import { ItemGlows } from './itemGlow';

const ZERO = new THREE.Vector3(), _v = new THREE.Vector3();
/** the actions that strike with the weapons (Rending Cleave, Power Strike, Thunder Crescent, Steel Tempest, Twin Fangs):
 *  their weapons leave a trail as they swing (`swung`); Bull Rush strikes with the body */
const STRIKES = new Set(['swing', 'chop', 'smite', 'spin', 'flurry']);
/** a held weapon: its tip along the grip, and where the left hand holds it (two-handers) */
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
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const sm = (a: number, b: number, x: number): number => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// --- the basic swing (third person), keyed over the cast. The tip goes round in units of half the arc
// (-1 wound to the start side, +1 at the far side): it winds, loads a little deeper, crosses the arc from
// the cast's landing (0.55) to 0.85 and carries on past it. The body leads it:
// the hips turn first, then the spine and chest, the arm and wrist come last.
/** where the feet stand (left x, z, turn, then right), rig units: at rest, fighting, Power Strike's step in, behind the shield */
/** a move's end held a moment after its cast is over (seconds), so a short cast's blow or throw is seen, then how long it takes to ease back to the stance */
const TAIL: Record<string, number> = { chop: 0.3, smite: 0.3, buff: 0.55, flurry: 0.15 }, TAIL_OUT: Record<string, number> = { chop: 0.55, smite: 0.5, buff: 0.6, flurry: 0.35 };
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
/** drinking: the elbow raised out to the side, the wrist out to the left of the chin (as from a horn: the shield on that forearm turns edge on beside the head, not over the face) */
const DRINK: DrinkHold = { wrist: new THREE.Vector3(0.07, -0.16, 0.14), tipped: new THREE.Vector3(0.08, 0.08, 0.19), pole: new THREE.Vector3(0.35, -1, 0.5), tippedPole: new THREE.Vector3(0.6, -0.4, 1) };
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
export function* warriorSteps(): ModelSteps {
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
  const cloth = kit.rim({ color: 0x323c56, roughness: 1, ...tex(clothMaps(), 1, 0.9) }, 0x3a4a70, 0.35);
  yield;
  // (the surcoat's cloth and the shield's paint: his blue)
  const dye = new Dye('blue').cloth(cloth);
  // Independent materials: dye the cuirass and trousers without colouring buckles, boots or weapons.
  const cuirass = kit.std({ color: 0xc4c8cf, metalness: 0.92, roughness: 1, map: E.map, normalMap: E.normalMap,
    roughnessMap: E.roughnessMap, normalScale: new THREE.Vector2(1.4, 1.4) });
  const cuirassBack = kit.std({ color: 0xa9adb5, metalness: 0.92, roughness: 1, ...tex(steelMaps(), 1, 0.8) });
  const trousers = kit.std({ color: 0x2c1d14, roughness: 1, ...tex(leatherMaps(), 1, 1.2), map: null });
  dye.tint(cuirass, cuirassBack, trousers);
  const mail = kit.std({ color: 0x8e949e, metalness: 0.85, roughness: 1, ...tex(mailMaps(), 1, 1.6) });
  const furM = kit.std({ color: 0x75644f, roughness: 1, map: pbrMaterialMaps(furMaps(), 1).map, normalMap: pbrMaterialMaps(furMaps(), 1).normalMap });
  const wood = kit.std({ color: 0x8a6446, roughness: 1, ...tex(woodMaps(), 1, 1) });
  // bare hands and wrists, and the fingertips his gloves leave bare (a paler skin of their own, they were another
  // man's fingers, #425)
  yield;
  const bareSkin = handSkin(kit, 'warrior');
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
  S.add(scaleUV(lathe([[0.14, -0.12], [0.152, -0.02], [0.165, 0.1], [0.162, 0.18], [0.14, 0.25], [0.08, 0.29]], 24), 3, 1.5), cloth, j.chest, [0, 0, 0], [0, 0, 0], [1, 1, 0.84]);
  S.add(scaleUV(lathe([[0.14, -0.05], [0.145, 0.08], [0.152, 0.2], [0.155, 0.26]], 24), 3, 1), leatherDark, j.spine, [0, 0, 0], [0, 0, 0], [1, 1, 0.86]);
  for (const [y, g] of [[0.19, 0.006], [0.125, 0]] as const) S.add(belt(0.16 + g, 0.137 + g, y, 0.06, 0.01), leather, j.spine);
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
    const a = rng() * Math.PI * 2, r = 0.55 + rng() * 0.45, sa = Math.sin(a), ca = Math.cos(a);
    o.p.set(sa * (0.09 + 0.1 * r), 0.24 + rng() * 0.04 - Math.abs(sa) * r * 0.02, ca * (0.09 + 0.045 * r));
    o.d.set(sa, 0.5 + rng() * 0.5, ca);
  }, 0.06, 0.011);
  S.add(collar, furM, j.chest);
  yield;
  // a high collar of the gambeson inside the fur, round the neck as the tunic's neckline is (centred on the chest, his
  // neck came out through it behind), and the neck
  S.add(new THREE.CylinderGeometry(0.075, 0.09, 0.06, 20, 1, true), cloth, j.chest, [0, 0.27, -NECKLINE_BACK]);

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
  for (const [s, sh, el, hd] of [[1, j.shoulderL, j.elbowL, j.handL], [-1, j.shoulderR, j.elbowR, j.handR]] as const) {
    // the sleeve, thigh and shin run on past their joints under the bracer, the knee cop and the boot, and follow the lower limb there
    S.skin(scaleUV(limb(0.38, 0.078, 0.064, 0.12, 0.24, 14), 2, 1), cloth, sh, el, 0.2, 0.32);
    for (const y of [-0.13, -0.21]) S.add(belt(0.078, 0.078, y, 0.024, 0.006, 0, 14), leather, sh);
    H.add(furTufts(rng, 40, (i, o) => { const a = (i / 40) * Math.PI * 2; o.p.set(Math.sin(a) * 0.06, -0.035, Math.cos(a) * 0.06); o.d.set(Math.sin(a), 0.6, Math.cos(a)); }, 0.035, 0.009), furM, el);
    H.add(scaleUV(lathe([[0.052, -0.26], [0.06, -0.2], [0.066, -0.1], [0.07, -0.05], [0.068, -0.035]], 16), 2, 1), leather, el);
    // its top closed under the elbow's fur (through the eyes, with the fur hidden, it would show open)
    H.add(new THREE.CircleGeometry(0.069, 16).rotateX(-Math.PI / 2), leather, el, [0, -0.037, 0]);
    const vb: SurfaceFn = (u, v, out) => { const a = (u - 0.5) * 1.8, y = lerp(-0.24, -0.06, v), r = 0.066 + 0.01 * sm(-0.24, -0.08, y) + 0.004; return out.set(s * Math.cos(a) * r, y, Math.sin(a) * r); };
    H.add(plate(vb, 10, 8, 0.005), plateM, el);
    for (const y of [-0.09, -0.2]) H.add(belt(0.072, 0.072, y, 0.018, 0.006, 0, 14), leatherDark, el);
    // the glove's cuff: from under the bracer down over the wrist into the palm, following the hand, so the hand joins the forearm (the bracer ends above the wrist)
    H.skin(scaleUV(lathe([[0.041, -0.315], [0.043, -0.29], [0.045, -0.265], [0.048, -0.235], [0.052, -0.2]], 16), 2, 1), leather, el, hd, 0.25, 0.29);
    // bare: the gambeson's sleeve on down the forearm (its top inside the upper sleeve's end, which follows the
    // forearm), a turned-back cuff at the wrist, and the wrist into the palm
    B.add(scaleUV(lathe([[0.05, -0.245], [0.052, -0.2], [0.057, -0.12], [0.061, -0.04], [0.06, 0]], 16), 2, 1), cloth, el);
    B.add(scaleUV(lathe([[0.049, -0.25], [0.056, -0.245], [0.058, -0.215], [0.055, -0.205]], 16), 2, 0.3), cloth, el);
    B.skin(lathe([[0.036, -0.315], [0.037, -0.29], [0.039, -0.265], [0.042, -0.235]], 16), bareSkin, el, hd, 0.25, 0.29);
    yield;
  }
  const handL = buildHand(j.handL, 1, leather, bareSkin, HAND_K, bareSkin), handR = buildHand(j.handR, -1, leather, bareSkin, HAND_K, bareSkin);
  const body = bodyShape(j, { L: handL.vis, R: handR.vis });

  yield;
  // --- legs: leather trousers, engraved knee cops, tall boots with fur tops, straps and a steel toe
  for (const [th, kn, an] of [[j.thighL, j.kneeL, j.ankleL], [j.thighR, j.kneeR, j.ankleR]] as const) {
    S.skin(scaleUV(limb(0.54, 0.108, 0.078, 0.14, 0.26, 14), 2, 1.5), trousers, th, kn, 0.32, 0.46);
    S.skin(scaleUV(limb(0.46, 0.076, 0.058, 0.1, 0.32, 12), 2, 1.5), trousers, kn, an, 0.3, 0.41);
    const cop: SurfaceFn = (u, v, out) => { const lon = (u - 0.5) * 2.5, lat = lerp(-0.95, 1.05, v); return out.set(Math.sin(lon) * Math.cos(lat) * 0.082, Math.sin(lat) * 0.085, Math.cos(lon) * Math.cos(lat) * 0.075 + 0.012); };
    const kg = plate(cop, 14, 12, 0.006);
    projectUV(kg, steelRegion('knee'), (x, y) => [(x / 0.082 + 1) / 2, (y / 0.085 + 1) / 2]);
    A.add(kg, engraved, kn, [0, -0.01, 0]);
    for (const y of [0.05, -0.075]) A.add(belt(0.082, 0.07, y, 0.02, 0.006, 0, 14), leather, kn);
    // the boot's shaft from below the knee to the ankle, and a fur cuff over its top
    S.add(scaleUV(lathe([[0.056, -0.42], [0.062, -0.37], [0.072, -0.27], [0.078, -0.16], [0.082, -0.11], [0.08, -0.1]], 18), 2, 1.5), leather, kn, [0, 0, 0.005], [0, 0, 0], [1, 1, 1.06]);
    S.add(furTufts(rng, 48, (i, o) => { const a = (i / 48) * Math.PI * 2; o.p.set(Math.sin(a) * 0.08, -0.105, Math.cos(a) * 0.085); o.d.set(Math.sin(a), 0.7, Math.cos(a)); }, 0.04, 0.01), furM, kn);
    for (const y of [-0.23, -0.34]) {
      const r = 0.08 + (y + 0.16) * 0.1;
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
    legBodies.add([th, O()], [kn, O()], 0.112 + GAP, 0.084 + GAP);
    legBodies.add([kn, O()], [an, O()], 0.115 + GAP, 0.065 + GAP);
    yield;
  }
  const capsL = handCapsules(handL);
  for (const [a, b, r] of [...capsL, ...handCapsules(handR)]) handBodies.add(a, b, r + HAND_GAP);
  const cuffR = () => (gloved ? [0.075, 0.055] : [0.058, 0.058]);
  const fores = ([[j.elbowL, j.handL], [j.elbowR, j.handR]] as const).map(([el, hd]) => handBodies.add([el, new THREE.Vector3(0, -0.5 * j.P.foreL, 0)], [hd, O()], 0));
  yield;
  // (a left hand with no weapon in it, empty or on the shield's grip, swung out just enough to rest on the mail rather than in it:
  // armOffThigh)
  const freePts = [...capsL.flatMap(([a, b, r]) => [[a, r], [b, r]] as [JointPoint, number][]), [[j.elbowL, new THREE.Vector3(0, -0.5 * j.P.foreL, 0)], 0], [[j.handL, O()], 0]] as [JointPoint, number][];
  const placeBodies = (free: boolean) => {
    const [ra, rb] = cuffR();
    for (const f of fores) { f.ra = ra + HAND_GAP; f.rb = rb + HAND_GAP; }
    legBodies.place(skirtMesh);
    if (free) { freePts[freePts.length - 2][1] = ra; freePts[freePts.length - 1][1] = rb; armOffThigh(skirtMesh, j.shoulderL, 1, legBodies.list[0], HAND_GAP, freePts); }
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
  const head = yield* headSteps(j.head, kit, HERO_HEADS.warrior.who, HERO_HEADS.warrior);
  yield;
  // (a point just before the lips, for the flask)
  const mouth = new THREE.Object3D(); mouth.name = 'mouth'; head.group.add(mouth); toGroup(0, 50, 112, mouth.position);
  buildNeck(j.neck, kit, 'warrior', j.P.neckL, j.head);
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
    helm.visible = gear.helm; for (const m of head.hair) m.visible = !gear.helm;
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
  /** the lower grip as the left hand held it this frame (`Model.lowerGrip`) */
  const grasp: LowerGrip = { held: false, free: false, short: 0, past: 0, into: 0 };
  /** each hand's slant on its handle this frame (rad, armIK.ts) */
  let slantR = 0, slantL = 0;
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

  /** The grip and the weapon's way as the arm holds them now, into `at` and `dir`, in the chest's frame (and with
   *  `pole`, where the elbow is from the shoulder): a way back leaves from the drawn ones and goes to the pose's. */
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
    twoHold.k = 0;
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
    const pump = fp || two ? 0 : held ? RUN_PUMP : 1, pumpL = fp ? 0 : two ? shouldered : shield.visible ? RUN_SHIELD_PUMP : offHeld ? RUN_PUMP : 1;
    // (a hand round a grip or a shield's is held steady by its wrist; a free one flops)
    const looseR = held ? 0 : 1, looseL = shield.visible || offHeld ? 0 : 1;
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
    else { j.shoulderR.rotation.x += -0.3 * (1 - runK); j.shoulderR.rotation.z += -0.1; j.elbowR.rotation.x += -0.8 * (1 - runK) - RUN_BEND * runK; }
    // shield carried low at the side, the arm held a little out so it clears the leg, and bent further at a run; a
    // second weapon held like the first, mirrored
    if (shield.visible) { j.shoulderL.rotation.z += 0.2; j.elbowL.rotation.x += -0.35 - RUN_SHIELD_BEND * runK; }
    else if (offHeld) { j.shoulderL.rotation.x += -0.3 * (1 - runK); j.shoulderL.rotation.z += 0.1; j.elbowL.rotation.x += -0.8 * (1 - runK) - RUN_BEND * runK; }
    // through the eyes the weapons are held higher and further out, or the hands sit below the frame
    if (fp) {
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
      else { j.shoulderR.rotation.x += (REST_ARM[0] + sway) * ia; j.shoulderR.rotation.z += 0.08 * ia; j.elbowR.rotation.x += REST_ARM[1] * ia; j.handR.rotation.x += REST_ARM[2] * ia; }
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
    if ((ended || began) && lastName === 'swing') swingEnd = t;
    if (began && raw.name === 'swing') {
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
    if (began) fade.cut(chain && raw.name === 'swing' ? 0.08 : shouldered > 0.5 ? OFF_SHOULDER : 0.14, legsFade);
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
        R.x = lerp(R.x, -1.7, w); R.z = lerp(R.z, -0.35, w); R.y = 0.2 * w;
        j.elbowR.rotation.x = lerp(j.elbowR.rotation.x, -1.2, w);
        j.handR.rotation.x += 0.5 * w;
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
        flaskWant = drink(j, k, mouth, DRINK, handL, flask); aw = 1; guard = 0; drinkLift = drinkUp(k);
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
      } else if (a.name === 'cast') {
        const w = pulse(k, 0, 1);
        aw = w;
        R.x += -1.2 * w; j.chest.rotation.y += 0.3 * w;
      }
    }
    // (a skill cast as the charge runs: the charge's legs under its arms, as they are under the charge's own, both
    // legs its own; posed by the skill alone, the legs stepped at a walk's pace as the body sped off at 26 m/s)
    if (a?.under?.name === 'charge') { legOwn = Math.max(legOwn, chargeLegs(a.under.t)); ownL = ownR = 0; }
    if (st.hit > 0) { j.spine.rotation.x += -0.2 * st.hit; j.neck.rotation.x += -0.15 * st.hit; }
    // a two-hander at a run, carried at high port
    // (out of a fight on the shoulder, at a run too; in one, at high port)
    const onShoulder = shouldered;
    leftOff = shouldered > 0 ? Math.max(shouldered, leftOff) : Math.max(0, leftOff - dt / TAKE_HOLD);
    const leftAway = shouldered > 0 ? shouldered : smooth(leftOff);
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
    st.look?.();
    if (st.dead >= 0) { deathFall(j, st.dead, -1); legs.reset(); }
    else {
      // the legs: planted feet, a pelvis that follows them (ik.ts); then a crouch bends the knees instead of sinking the feet
      if (!fp) legs.captureArms();
      _legW[0] = 1 - ownL; _legW[1] = 1 - ownR;
      // the feet: side-on, the left forward and the right back and turned out; fighting, the left steps further in
      const F = feet ?? (t - fightT < 1.6 ? FIGHT_FEET : REST_FEET);
      legs.stance(0, F[0], F[1], F[2]); legs.stance(1, F[3], F[4], F[5]);
      legs.update(dt, st.phase, st.dead, 1 - legOwn, fp ? 0 : 1, _legW);
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
    shieldHang = damp(shieldHang, drinkLift, 12, dt); drinkOn = damp(drinkOn, a?.name === 'drink' ? 1 : 0, 12, dt);
    regrip = drinkOn >= 0.5 ? TAKE_HOLD : Math.max(0, regrip - dt);
    if (shieldHang > 0.01 && shield.visible) {
      root.updateMatrixWorld(true);
      j.elbowL.getWorldPosition(_s1); j.handL.getWorldPosition(_s2);
      const a = _s3.subVectors(_s2, _s1).normalize(), n = _s4.set(0, 0, 1).transformDirection(root.matrixWorld);
      n.addScaledVector(a, -a.dot(n)).normalize();
      _sm.makeBasis(_s5.crossVectors(a, n), a, n);
      _sq.setFromRotationMatrix(_sm).premultiply(j.handL.getWorldQuaternion(_shq).invert());
      shield.quaternion.slerp(_sq, shieldHang);
      _s1.lerp(_s2, 0.3).addScaledVector(_s4.set(0, -1, 0), 0.26 * root.scale.x).addScaledVector(n, 0.07 * root.scale.x);
      shield.position.lerp(j.handL.worldToLocal(_s1), shieldHang);
    }

    // the weapon arm within a body's ranges, its hand where the pose put it (armIK.ts); first, as a two-hander's lower
    // grip goes wherever it takes the weapon. A two-hander's upper hand holds it square (slanted, it moved the lower
    // grip and that wrist bent further). (Not through the eyes, where the arms are placed where they're seen: fitted,
    // a two-hander held square couldn't point its blade ahead of the arms, where the eyes see it, and stood upright)
    slantR = 0; slantL = 0;
    if (aimDown > 0 && held && !fp && st.dead < 0) aimAtFloor(aimDown, bladeUp, fall * fall);
    if (!fp && st.dead < 0) slantR = fitArm(j, false, held ? gripTurn(handR, grip, _vr) : undefined, body, held && !two ? SLANT : undefined).slant;
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
    if (held) seat(handR, grip, held.r, slantR);
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
      if (k > 0) {
        _sq.copy(j.shoulderL.quaternion); _eq.copy(j.elbowL.quaternion); _wq.copy(j.handL.quaternion);
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
        const fit = solveArm(j, true, { wrist: _cur.negate().add(_gw), hand: _fq, roll: { axis: _hd, range: 1.1, at: _gw }, pole: _pw.copy(_pole).applyQuaternion(j.chest.getWorldQuaternion(_cq)), body: fp ? undefined : body, slant: SLANT, slantOnHandle: true, glide: 1, shoulder, flexion: GRIPPED_FLEXION });
        slantL = fit.slant;
        _up.applyAxisAngle(_hd, fit.roll);
        // (a grip out of reach for a frame or two is held through: a hand doesn't let go for 50 ms; and while the hand
        // comes onto it off the shoulder, it's taking hold, not failing to: counted so, it was still easing back after)
        twoGood = takingHold > 0 ? 1 : damp(twoGood, reach && fit.excess < 15 && fit.depth < 0.03 ? 1 : 0, 6, dt);
        twoHeld = reach && twoGood > 0.5;
        grasp.past = fit.excess; grasp.into = fit.depth;
        // (the arm eases back to the pose's own only once the hand has let go: easing it back while still holding bent the wrist)
        if (!twoHeld) k *= Math.min(1, 2 * twoGood);
        if (k < 1) { j.shoulderL.quaternion.slerp(_sq, 1 - k); j.elbowL.quaternion.slerp(_eq, 1 - k); j.handL.quaternion.slerp(_wq, 1 - k); }
      } else { grasp.past = 0; grasp.into = 0; }
      // (coming back onto it off the flask, it's taking hold too: counted as let go, the hand on its way back read as off
      // the grip for 4 frames after every draught)
      grasp.held = twoHeld; grasp.free = drinkOn >= 0.5 || onShoulder > 0 || ((takingHold > 0 || regrip > 0) && !twoHeld); grasp.short = out;
    }

    // the other arm within a body's ranges too, its hand where the pose put it
    if (!fp && st.dead < 0 && !twoHeld) { slantL = fitArm(j, true, offHeld && !sheathed ? gripTurn(handL, gripL, _vl) : undefined, body, offHeld && !sheathed ? SLANT : undefined).slant; }
    else if (fp && st.dead < 0 && offHeld && !sheathed) slantL = fitInView(true, gripL, gripTurn(handL, gripL, _vl), SLANT, holdL) + holdL * swingSlantL;
    if (fp && st.dead < 0 && offHeld && !sheathed) wristInGrip(true, gripTurn(handL, gripL, _vl, slantL));
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
    root.updateMatrixWorld(true);
    placeBodies(!fp && st.dead < 0 && !(offHeld && !sheathed) && !twoHeld);
    // (through the eyes the body isn't drawn, nor its shadow: the mail swings undraped)
    skirt.update(fL, fR, move, t, dt, fp ? undefined : legBodies.list, fp ? undefined : handBodies.list);

    // fists round whatever they hold; an empty hand hangs loosely curled
    const along = (g: THREE.Object3D) => _hd.set(0, 1, 0).transformDirection(g.matrixWorld);
    // (each handle diagonal across its palm by the slant the arm took, the weapon seated in that fist)
    if (held) hold(handR, along(grip), held.r, undefined, slantR);
    else poseHand(handR, 0.5 + Math.sin(t * 1.3) * 0.05, 0.1);
    if (offHeld && !sheathed) { seat(handL, gripL, offHeld.r, slantL); hold(handL, along(gripL), offHeld.r, undefined, slantL); }
    else if (twoHeld && held) hold(handL, along(grip), held.r, _up, slantL);
    else if (flaskOut > 0.01) holdFlask(handL, flask, flaskOut);
    else poseHand(handL, shield.visible ? 1.35 : 0.5 + Math.sin(t * 1.3 + 1) * 0.05, 0.08);
    // the flask comes out of the fist and is put away again
    flaskOut = damp(flaskOut, flaskWant, 16, dt); flask.visible = flaskOut > 0.02; flask.scale.setScalar(Math.max(0.02, flaskOut));

    if (dt > 0) for (const f of furs) f.update(dt);

    // the blade's fuller glows while a skill charges
    edge.emissiveIntensity = (st.charge || 0) * 1.5;
  }

  return {
    root, kit, joints: j, hands: { L: handL, R: handR }, animate, tip, palm, height: 2.05, setGear, dye,
    get swing() { return side; },
    swung: struck,
    get swingKeyed() { return keyed; },
    swingBones: (left: boolean) => ({ ...armBones(left ? offHeld : held) }),
    get offTip() { return offHeld ? tipL : null; },
    get lowerGrip() { return held?.off != null ? grasp : null; },
    get offGrip() { return held?.off != null ? offGrip : null; },
    get fists() {
      const fists: Fist[] = [];
      if (held) fists.push({ hand: 'right', ...fistOn(handR, grip, held.r) });
      if (offHeld && !sheathed) fists.push({ hand: 'left', ...fistOn(handL, gripL, offHeld.r) });
      else if (held?.off != null && grasp.held) fists.push({ hand: 'left', ...fistOn(handL, offGrip, held.r) });
      return fists;
    },
    reset: () => { legs.reset(); fade.reset(); },
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
