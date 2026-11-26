// A healing draught's flask, and the move that drinks it: taken from the belt by the free hand, held by its neck,
// the round body under the fist and the mouth over the thumb, lifted to the lips by arm IK (the flask's mouth to a point at the mouth on
// the head), the head tipping back to drink, then put away. Shared by the heroes; each model hangs the flask on its
// free hand's joint, closes the fist round it (`holdFlask`) and puts a mouth point on its head.
// The tavern's ale is drunk by the same move with beats of its own (`ALE_KEYS`: the mug taken off the bar, three long
// swallows, lowered to the chest through a contented breath), from a stave mug held round its body in the flask's place
// (`buildMug`, in the flask's group: shown in its stead while the drink is the ale).
import * as THREE from 'three';
import type { Joints } from './rig';
import { curve, type Keys } from './motion';
import { hold, fistReach, fistTurn, seatHeld, SLANT, type Hand } from './hands';
import { solveArm } from './armIK';
import { GRIPPED_FLEXION, wristTurn, type BodyShape } from './anatomy';
import { tunable } from '../../core/tuning';
import { dirFromEyes, fromEyes } from '../viewModel';
import type { MaterialKit } from '../../types';

const _t = new THREE.Vector3(), _f = new THREE.Vector3(), _m = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3();
const _p = new THREE.Vector3(), _up = new THREE.Vector3(), _a = new THREE.Vector3(), _t0 = new THREE.Vector3(), _f0 = new THREE.Vector3(), _p0 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _r = new THREE.Quaternion(), _e = new THREE.Quaternion(), _fist = new THREE.Quaternion(), _sl = new THREE.Quaternion();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

/**
 * How the heroes drink, the left hand's (a right hand's mirrored), as a man drinks from a flask held by its neck (the
 * owner's reference photographs: the bulb some 35 degrees below the lips at the first sip, some 40 up and forward of
 * them as it's drunk).
 * - `sip`, `tipped`: where the flask's base is from the mouth (the head's frame: x left, y up, z forward; m: its neck
 *   points from there at the lips), as it comes up and as it drinks: above and before the mouth, so the neck points
 *   down into the lips and the bottom is tipped up.
 * - `pole`, `tippedPole`: where the elbow would rather point (the chest's frame). At the sip out to the side and up,
 *   the forearm coming in across to the mouth: a fist holds a neck across its palm, so a neck that points up at the
 *   lips needs the forearm square to it, and the only such places an elbow can be are out to the side (the other is
 *   inside the chest). Straight down before the chest, the forearm ran up along the neck: the wrist was bent 100 to
 *   150 degrees round it and the forearm turned 60 to 75 past its end, #464. As it drinks, up and forward, the upper
 *   arm about level.
 * - `keep`: what the pole is worth against the ranges (armIK.ts `ArmGoal.keep`), `roll`: how far the fist may turn
 *   about the neck from the way the pole has it (rad).
 * - `carry`: the wrist as the fist carries the flask at the hip, out of the pouch and back to it (degrees: the
 *   forearm's turn, the wrist's flexion and its bend to the thumb's side), and `carrySlant` the neck's slant across
 *   that palm (rad), so the neck stands up out of the fist. (Stood up by the wrist alone, it was bent 28 to 44 degrees
 *   to the thumb's side, past its 20.)
 * - `arc`: how far the flask's way from the hip to the lips bows out before the chest (m), `take`: the share of the
 *   lift over which the arm goes from the hip's pose to the one solved for the flask on that way.
 */
const DRINK = tunable('drink', {
  sip: [0.07, -0.16, 0.14], tipped: [0.08, 0.08, 0.19], pole: [1, -0.2, 0.5], tippedPole: [0.6, -0.4, 1], keep: 120, roll: 1.2,
  carry: [30, 0, 10], carrySlant: 0.35, arc: 0.04, take: 0.25,
});

/** the neck's radius where the fist closes round it, and how far the flask's mouth is from there, up its length */
const NECK_R = 0.019, MOUTH_UP = 0.047;
/** the ale's mug: its radius where the fist closes round its body, how far its rim is above there, its rim's radius,
 *  and how far down its foot is (m: a stave mug a hand tall, held a little above its middle) */
export const MUG = { gripR: 0.036, up: 0.05, rimR: 0.039, foot: 0.085 } as const;
/** the ale through the eyes (`drink`'s `eyes`): where the mug's near rim is in the view as it's held up (camera space,
 *  m: across towards the hand's side, down, ahead), how much higher and nearer it comes tipped at a swallow, and its
 *  tilt as a share of the one seen from beside him (tipped as far towards the camera, it showed its foot) */
export const ALE_EYES = { rim: [0.05, -0.12, -0.36], tipped: [0.04, 0.08], tilt: 0.7 } as const;
/** through the eyes, how far up in the view the mug is held whatever the lift (shares of the drink: up by 0.12, held
 *  until its setting down begins at 0.92; set down on the bar below a level gaze, it leaves the frame's foot) */
const ALE_EYES_HELD = (k: number): number => Math.min(smooth((k - 0.02) / 0.1), 1 - smooth((k - 0.92) / 0.06));

/** where the flask's body's middle is from where the fist holds the neck, the glass's radius and the draught's (inside
 *  it), and how high the draught stands over the body's middle (m: three-quarters full) */
const BODY_Y = -0.085, GLASS_R = 0.05, DRAUGHT_R = 0.046, FILL = 0.024;
/** the bubbles in the draught, from its middle (m), and how big each is */
const BUBBLES: readonly (readonly [number, number, number, number])[] = [
  // (few and small: five, up to 8 mm across, read as polka dots)
  [0.014, -0.012, 0.008, 0.0024], [-0.012, 0.004, -0.012, 0.0018], [0.004, -0.026, 0.014, 0.002],
];

/** a round-bottomed glass flask, two-thirds full of a glowing red draught (its surface kept level by `holdFlask`, a
 *  hot core glowing through it, a few bubbles), its brass-wrapped neck lipped and collared in brass, a cork tied down
 *  with twine; its origin on the neck (where the fist holds it, as a flask is held), its mouth up its +y. Hung on the hand's joint: `holdFlask` seats it in the fist. (Held
 *  by its base, the body out past the fingers, no fist could close round it, and the hand turned to aim the neck at
 *  the lips drank with its palm out; held round its body, the fingers stood up beside the ball. A solid glowing ball,
 *  it read as a red light, not a potion.) */
export function buildFlask(kit: MaterialKit): THREE.Group {
  // (its own bright brass and a pale cork: in the heroes' own metal and leather, the neck read dark brown)
  const cap = kit.std({ color: 0xc8963c, metalness: 1, roughness: 0.32 });
  const stopper = kit.std({ color: 0xa47c52, roughness: 0.85 });
  const twine = kit.std({ color: 0xd2c29a, roughness: 0.9 });
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, y: number, to: THREE.Object3D = g) => {
    const o = new THREE.Mesh(geo, m);
    o.position.y = y;
    to.add(o);
    return o;
  };
  // the draught: the lower part of a ball to its level, a flat surface over it, in a group of its own about the body's
  // middle that `holdFlask` turns to keep that surface level as the flask tips
  const draught = new THREE.Group();
  draught.name = 'draught';
  draught.position.y = BODY_Y;
  g.add(draught);
  const top = Math.asin(FILL / DRAUGHT_R), steps = 12;
  const outline = Array.from({ length: steps + 1 }, (_, i) => {
    const a = -Math.PI / 2 + (top + Math.PI / 2) * i / steps;
    return new THREE.Vector2(DRAUGHT_R * Math.cos(a), DRAUGHT_R * Math.sin(a));
  });
  outline.push(new THREE.Vector2(0, FILL));
  // (solid: seen through, it went a pale salmon over the forest behind)
  const deep = kit.std({ color: 0x420006, emissive: 0x7a0008, emissiveIntensity: 0.45, roughness: 0.06 });
  add(new THREE.LatheGeometry(outline, 20), deep, 0, draught);
  // (its surface lit, as light pools under a liquid's skin; a hot core lit through it read as a ball in a ball)
  const skin = kit.glow(0xb0141a, 0.8, false);
  add(new THREE.CircleGeometry(Math.sqrt(DRAUGHT_R * DRAUGHT_R - FILL * FILL) * 0.98, 20).rotateX(-Math.PI / 2), skin, FILL + 0.0005, draught);
  const fizz = kit.glow(0xff6050, 1.2, false);
  for (const [x, y, z, r] of BUBBLES) add(new THREE.SphereGeometry(r, 6, 4), fizz, y, draught).position.set(x, y, z);
  // the glass round it: a dark tint carrying its highlights and a rim of light round its edge, the draught seen
  // through it (pale, it laid a milky white over the draught, which read pink; without the rim its empty dome
  // vanished against the sky, the flask a red goblet)
  const glass = kit.rim({ color: 0x000000, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.3, depthWrite: false }, 0xffffff, 1.4);
  add(new THREE.SphereGeometry(GLASS_R, 24, 16), glass, BODY_Y).renderOrder = 1;
  // the neck, wrapped in brass where the fist holds it, a little longer than the fist so it shows between the thumb
  // and the lips (as long as the fist, the fist covered the mouth), collared where it leaves the body and lipped at
  // its mouth
  add(new THREE.CylinderGeometry(0.016, 0.021, 0.085, 14), cap, 0.0025);
  add(new THREE.TorusGeometry(0.022, 0.0035, 6, 18).rotateX(Math.PI / 2), cap, -0.036);
  add(new THREE.TorusGeometry(0.0172, 0.003, 6, 18).rotateX(Math.PI / 2), cap, 0.044);
  // the cork, and the twine tying it down over its top: off while it's drunk (`holdFlask`)
  const cork = new THREE.Group();
  cork.name = 'cork';
  g.add(cork);
  add(new THREE.CylinderGeometry(0.0145, 0.0125, 0.024, 10), stopper, 0.055, cork);
  add(new THREE.TorusGeometry(0.0128, 0.0016, 4, 14).rotateX(Math.PI / 2), twine, 0.049, cork);
  for (const a of [0, Math.PI / 2]) add(new THREE.TorusGeometry(0.0145, 0.0012, 4, 12, Math.PI).rotateY(a), twine, 0.055, cork);
  // the ale's mug, shown in the flask's place while the drink is the ale (`holdFlask`)
  const mug = buildMug(kit);
  mug.visible = false;
  g.add(mug);
  g.userData.mug = mug;
  g.userData.flaskParts = g.children.filter((o) => o !== mug);
  g.userData.slant = 0;
  g.userData.lift = 0;
  g.userData.lifted = 0;
  g.userData.wrist = new THREE.Vector3();
  g.userData.grip = new THREE.Vector3();
  g.userData.draught = draught;
  // (the flask's mouth, which `drink` puts at the lips: the lab measures how far off them it lands)
  const lip = new THREE.Object3D();
  lip.name = 'flaskLip';
  lip.position.y = MOUTH_UP;
  g.add(lip);
  g.userData.cork = cork;
  g.visible = false;
  return g;
}

/**
 * A stave mug of ale, its origin where a fist holds it round its body (as the flask's on its neck), its rim up its +y:
 * oak staves bound with two iron hoops, its ale capped with foam standing a little over the rim (tavern's mugs too:
 * world/rooms.ts stands them on the bar, models/keeper.ts fills one).
 */
export function buildMug(kit: MaterialKit): THREE.Group {
  const wood = kit.std({ color: 0x7a4a26, roughness: 0.8, side: THREE.DoubleSide });
  const iron = kit.std({ color: 0x3a3836, metalness: 0.8, roughness: 0.45 });
  const foam = kit.std({ color: 0xf4ead6, roughness: 0.95 });
  const g = new THREE.Group();
  g.name = 'mug';
  const put = (geo: THREE.BufferGeometry, m: THREE.Material, y: number): THREE.Mesh => {
    const o = new THREE.Mesh(geo, m);
    o.position.y = y;
    o.castShadow = false;
    g.add(o);
    return o;
  };
  const tall = MUG.up + MUG.foot;
  // (its staves: a ring of flats round it, a little wider at the rim, open at the top; a foot under it)
  const staves = new THREE.CylinderGeometry(MUG.rimR, MUG.gripR - 0.001, tall, 14, 1, true);
  put(staves, wood, (MUG.up - MUG.foot) / 2);
  put(new THREE.CircleGeometry(MUG.gripR - 0.002, 14).rotateX(Math.PI / 2), wood, -MUG.foot + 0.004);
  for (const y of [-MUG.foot + 0.018, MUG.up - 0.014]) {
    put(new THREE.TorusGeometry(MUG.gripR + 0.002 + (y > 0 ? 0.0025 : 0), 0.003, 5, 20).rotateX(Math.PI / 2), iron, y);
  }
  // (the ale in it: its surface, which `setMugFill` raises and lowers, and its foam, a disc and a soft dome standing
  // over the rim when it's full; an empty mug shows its dark inside)
  const ale = kit.std({ color: 0xb06a14, roughness: 0.25 });
  const surface = put(new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2), ale, 0);
  surface.name = 'ale';
  const head = new THREE.Group();
  head.name = 'foam';
  head.position.y = MUG.up - 0.006;
  g.add(head);
  head.add(new THREE.Mesh(new THREE.CircleGeometry(MUG.rimR - 0.002, 16).rotateX(-Math.PI / 2), foam));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(MUG.rimR * 0.95, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.28, 1), foam);
  dome.position.y = 0.002;
  head.add(dome);
  setMugFill(g, 1);
  return g;
}

/** how much ale `mug` (`buildMug`'s) holds, 0 empty to 1 full: its surface up its staves, its foam over the rim only
 *  near full, both at no size when there's none (drawn so, never hidden: a warm-up draws them) */
export function setMugFill(mug: THREE.Object3D, full: number): void {
  const surface = mug.getObjectByName('ale'), head = mug.getObjectByName('foam');
  if (!surface || !head) return;
  const k = Math.max(0, Math.min(1, full)), floor = -MUG.foot + 0.008, top = MUG.up - 0.008;
  surface.position.y = floor + (top - floor) * k;
  // (the staves widen from the foot to the rim: the surface as wide as they are where it stands)
  const r = (MUG.gripR - 0.003) + (MUG.rimR - MUG.gripR) * ((surface.position.y + MUG.foot) / (MUG.up + MUG.foot));
  surface.scale.setScalar(k > 0.02 ? r : 0.0001);
  head.scale.setScalar(Math.max(0.0001, Math.min(1, (k - 0.85) / 0.15)));
}

/** how full the hero's mug is at `k` of the drink: full till the first swallow, emptied over the three, dregs after */
export const aleLeft = (k: number): number => (k < 0.26 ? 1 : k > 0.68 ? 0.03 : 1 - 0.97 * (k - 0.26) / 0.42);

/** the drink's beats over the cast (k): the off-hand weapon goes onto the hip, the flask comes out, up to the lips, drunk (the heal lands at 0.5), lowered and stowed, the weapon drawn again */
export const DRINK_SHEATHED: readonly [number, number] = [0.12, 0.88];
// (smooth keyed curves: every beat eases in and out, so the arm never starts or stops at speed)
/** the hand at the left hip (the weapon hung there and the flask taken, then stowed and the weapon drawn) */
const HIP: Keys = [[0, 0], [0.12, 1], [0.15, 1], [0.25, 0], [0.72, 0], [0.85, 1], [0.89, 1], [1, 0]];
/** up at the lips */
const LIFT: Keys = [[0, 0], [0.13, 0], [0.33, 1], [0.6, 1], [0.86, 0]];
/** the flask tipped up, drinking (a sip at the lips before it: tipped as it reached them, it came up level) */
const TIP: Keys = [[0, 0], [0.36, 0], [0.45, 1], [0.54, 1], [0.66, 0]];
/** the flask out of the pouch */
const OUT: Keys = [[0, 0], [0.13, 0], [0.18, 1], [0.81, 1], [0.86, 0]];

/** the hand in the fist that carries the flask (0: its own pose's turn), over the cast: turned to it as it goes to the belt, and back as it leaves it */
const FIST: Keys = [[0, 0], [0.12, 1], [0.89, 1], [1, 0]];

/** One drink's beats: `hip` the hand to its hip (the draught's pouch) or `reach` out before him (the ale's mug off the
 *  bar), `lift` up at the lips, `tip` tipped up drinking, `out` the vessel in hand, `fist` the carrying fist's turn. */
interface DrinkKeys { hip: Keys; reach: Keys; lift: Keys; tip: Keys; out: Keys; fist: Keys }
const NONE: Keys = [[0, 0], [1, 0]];
const DRAUGHT_KEYS: DrinkKeys = { hip: HIP, reach: NONE, lift: LIFT, tip: TIP, out: OUT, fist: FIST };
/**
 * How the ale is drunk from its mug, beside the beats (`ALE_KEYS`):
 * - `tilts`: how far the mug is tipped from upright (degrees, in the world) at its lips before a swallow, and at each of
 *   the three swallows' height: as far as the ale left in it needs, never past 65 (a full mug spills at the lip near
 *   40; tipped as the flask is, its foot over the lips, it read as drunk upside down).
 * - `lowerLip`: how far under the head's `mouth` point the rim's near edge rests (m: on the lower lip).
 * - `headBack`: the share of the draught's tip of the head back (a little, not thrown back).
 * - `pole`, `tippedPole`: where the elbow would rather point (the chest's frame), as the mug comes to the lips and at a
 *   swallow's height: out to his side, rising as it tips.
 */
const ALE_DRINK = tunable('aleDrink', {
  tilts: [22, 42, 53, 64], lowerLip: 0.006, headBack: 0.35, pole: [1, -0.1, 0.45], tippedPole: [0.9, 0.3, 0.5],
});

/** the mug's tilt from upright (rad) at `k` of the drink with the swallow's tip at `tip`: from its tilt at the lips to the
 *  swallow under way's */
function aleTilt(k: number, tip: number): number {
  const [lips, ...swallows] = ALE_DRINK.tilts, at = k < 0.38 ? 0 : k < 0.54 ? 1 : 2;
  return (lips + (swallows[at] - lips) * tip) * Math.PI / 180;
}

/** the ale's, over its 5 s (data/tavern.ts `ALE_BEATS`): the hand out to the bar and the mug taken off it, up to the
 *  lips, three long swallows tipped up with a breath between (each gulp heard at its middle), lowered to the chest
 *  and held there through a contented breath (the skill's sigh), and the mug set down out of sight. (A wipe of the
 *  mouth with the mug's hand pushed the mug into the face, and was left out.) */
const ALE_KEYS: DrinkKeys = {
  hip: NONE,
  reach: [[0, 0], [0.06, 1], [0.1, 1], [0.2, 0], [0.86, 0], [0.93, 1], [0.97, 1], [1, 0]],
  lift: [[0, 0], [0.1, 0], [0.24, 1], [0.7, 1], [0.78, 0.45], [0.84, 0.42], [0.91, 0]],
  tip: [[0, 0], [0.24, 0], [0.27, 1], [0.34, 1], [0.38, 0.3], [0.42, 1], [0.5, 1], [0.54, 0.3], [0.58, 1], [0.66, 1], [0.7, 0]],
  out: [[0, 0], [0.075, 0], [0.09, 1], [0.95, 1], [0.955, 0]],
  fist: [[0, 0], [0.06, 1], [0.95, 1], [1, 0]],
};

/**
 * The drinking move on the free arm (`h`'s; `k` 0..1 of the cast) over the pose so far: the hand to its hip (to hang a
 * weapon there and take the flask from the pouch), up to the lips, the head tipping back as it drinks, down to the hip
 * again (the flask stowed, a weapon drawn). `mouth` is a point just before the lips on the head, `h` the hand that
 * holds `flask`, `body` the body the arm keeps out of (none through the eyes). Returns how far the flask is out
 * (0..1) for the model to show it.
 *
 * The arm at the lips is solved within a body's ranges (armIK.ts) for the fist it ends in: the flask's neck is a
 * handle fixed at the lips, the fist free to turn about it and to hold it diagonally across the palm, as a two-hander's
 * lower hand is solved. The hand joint is given the fist's turn (so the model's own fitting of the arm after it keeps
 * it), which `holdFlask` draws. (Reached with a pole alone and the fist turned round the neck after, nothing held the
 * forearm's turn or the wrist to their ranges, #464.)
 */
export function drink(j: Joints, k: number, mouth: THREE.Object3D, h: Hand, flask: THREE.Object3D, body?: BodyShape, ale = false, eyes = false): number {
  const left = h.s > 0, sh = left ? j.shoulderL : j.shoulderR, el = left ? j.elbowL : j.elbowR, hd = left ? j.handL : j.handR;
  const K = ale ? ALE_KEYS : DRAUGHT_KEYS, gripR = ale ? MUG.gripR : NECK_R, mouthUp = ale ? MUG.up : MOUTH_UP;
  flask.userData.ale = ale;
  flask.userData.mugFill = aleLeft(k);
  const hip = curve(K.hip, k), reach = curve(K.reach, k), e = curve(K.lift, k), tip = curve(K.tip, k);
  // to the belt on the hip, or out before him to the bar
  sh.rotation.x += 0.35 * hip - 0.75 * reach; sh.rotation.z += 0.12 * hip; el.rotation.x += -0.6 * hip - 0.35 * reach;
  // the head and shoulders tip back as it drinks
  // the head and shoulders tip back as it drinks (a mug's ale is drunk with the head tipped back a little, not
  // thrown back: the mug tips, not the man)
  const back = ale ? ALE_DRINK.headBack : 1;
  j.neck.rotation.x += -0.3 * tip * back; j.head.rotation.x += -0.2 * tip * back; j.spine.rotation.x += -0.08 * tip * back;
  flask.userData.lift = e;
  // (kept for the lab: `lift` is spent by `holdFlask` each frame)
  flask.userData.lifted = e;
  // the fist as it carries the flask by the hip: the forearm half turned, the wrist near straight, the neck slanted
  // across the palm to stand up out of it; the hand turned to it as it goes to the belt, and back as it leaves it
  const [pron, flex, rad] = DRINK.carry, fist = curve(K.fist, k);
  hd.quaternion.slerp(wristTurn(pron, flex, rad, left, _fist), fist);
  let slant = h.s * DRINK.carrySlant * fist;
  if (e > 0) {
    const sc = j.root.scale.x;
    j.root.updateMatrixWorld(true);
    // from the hip: where that fist has the neck, the way it points, and where the elbow is
    hd.getWorldQuaternion(_q).multiply(_sl.setFromAxisAngle(Z, -slant));
    _f0.set(-h.s, 0, 0).applyQuaternion(_q);
    fistReach(h, _f0, _up.set(0, 1, 0).applyQuaternion(_q), gripR, _d, slant);
    hd.getWorldPosition(_t0).add(_d);
    el.getWorldPosition(_p0).sub(sh.getWorldPosition(_a)).normalize();
    // to the lips: the flask's base where it's held from, below them as it comes up and over them as it drinks, its
    // neck pointing from there at the lips and its mouth on them
    mouth.getWorldPosition(_m);
    j.head.getWorldQuaternion(_q);
    if (ale && eyes) {
      // through the eyes, the mug held up into the view's lower middle and tipped towards the camera at each swallow,
      // its rim coming to the frame's foot, never through the camera (to the lips, as it is seen from beside him, it
      // was out of view or inside the camera, from Victor's review: "no mug in 1st person", `lab tavern`)
      const tilt = aleTilt(k, tip) * ALE_EYES.tilt, s = h.s;
      _f.set(0, Math.cos(tilt), Math.sin(tilt));
      _w.set(0, Math.sin(tilt), -Math.cos(tilt));
      const [x, y, z] = ALE_EYES.rim, [ty, tz] = ALE_EYES.tipped;
      _v.set(-x * s, y + ty * tip, z + tz * tip).addScaledVector(_w, MUG.rimR).addScaledVector(_f, -mouthUp);
      fromEyes(j.root, j.neck, _v, _t);
      dirFromEyes(j.root, _v.copy(_f), _f).normalize();
      dirFromEyes(j.root, _v.copy(_w), _w).normalize();
      _p.fromArray(ALE_DRINK.pole).lerp(_v2.fromArray(ALE_DRINK.tippedPole), tip);
    } else if (ale) {
      // a mug as a man drinks from it: its rim's near edge on his lower lip, the mug before his face tipped from
      // upright towards him only as far as the ale left in it needs (more each swallow, `ALE_DRINK.tilts`, in the
      // world, whatever his head does), its middle a rim's radius up and out from that edge (tipped by the flask's
      // aim, its foot over the lips, the mug stood upside down out past his brow, its rim off his mouth: from play,
      // "tilting cup too much upwards, and cup not even close to face")
      const tilt = aleTilt(k, tip);
      _v.set(0, 0, 1).applyQuaternion(_q).setY(0).normalize();
      _f.set(0, Math.cos(tilt), 0).addScaledVector(_v, -Math.sin(tilt)).normalize();
      _w.set(0, Math.sin(tilt), 0).addScaledVector(_v, Math.cos(tilt)).normalize();
      _m.addScaledVector(_v2.set(0, -1, 0).applyQuaternion(_q), ALE_DRINK.lowerLip * sc);
      _t.copy(_m).addScaledVector(_w, MUG.rimR * sc).addScaledVector(_f, -mouthUp * sc);
      // (the elbow out to his side and rising as the mug tips, the forearm coming in to the mouth)
      _p.fromArray(ALE_DRINK.pole).lerp(_w.fromArray(ALE_DRINK.tippedPole), tip);
    } else {
      _w.fromArray(DRINK.sip).lerp(_p.fromArray(DRINK.tipped), tip);
      _w.x *= h.s;
      _f.copy(_w).negate().applyQuaternion(_q).normalize();
      _t.copy(_m).addScaledVector(_f, -mouthUp * sc);
      _p.fromArray(DRINK.pole).lerp(_w.fromArray(DRINK.tippedPole), tip);
    }
    _p.x *= h.s;
    j.chest.getWorldQuaternion(_q);
    _p.applyQuaternion(_q).normalize();
    // the hand leads the flask up a line from the one to the other, bowed out before the chest, the neck turning
    // from the one way to the other and the elbow following it out (the arm turned joint by joint from the hip's to
    // the lips', the elbow went up and out first and the hand hung from it)
    // (through the eyes the mug stays up in the view from its lift to its setting down: lowered to the chest after the
    // last swallow as seen from beside him, it left the view, `lab tavern`)
    const up = ale && eyes ? Math.max(e, ALE_EYES_HELD(k)) : e;
    _t.lerpVectors(_t0, _t, up).addScaledVector(_w.set(0, 0, 1).applyQuaternion(_q), DRINK.arc * sc * Math.sin(Math.PI * up));
    _f.lerpVectors(_f0, _f, up).normalize();
    _p.lerpVectors(_p0, _p, up).normalize();
    // the fist round the neck there with the hand's length towards where the elbow would rather be, and the arm that
    // holds it so within its ranges
    _up.copy(_a).addScaledVector(_p, j.P.upperL * sc).sub(_t).normalize();
    fistReach(h, _f, _up, gripR, _d);
    fistTurn(h, _f, _up, _q);
    _r.copy(sh.quaternion); _e.copy(el.quaternion); _fist.copy(hd.quaternion);
    const fit = solveArm(j, left, { wrist: _w.copy(_t).sub(_d), hand: _q, roll: { axis: _f, range: DRINK.roll, at: _t }, pole: _p, keep: DRINK.keep, body, slant: SLANT, slantOnHandle: true, glide: 1, flexion: GRIPPED_FLEXION });
    // (where it has the wrist and the grip, world: the lab reads how far from them they land)
    j.root.updateMatrixWorld(true);
    hd.getWorldPosition(flask.userData.wrist as THREE.Vector3);
    (flask.userData.grip as THREE.Vector3).copy(_t);
    // (taken up from the hip's arm and fist over the lift's first part: the solver holds the neck its own way of the
    // ranges' many. It leaves the hand joint under the slanted fist: the fist's own turn here)
    const w = smooth(e / DRINK.take);
    sh.quaternion.copy(_r.slerp(sh.quaternion, w));
    el.quaternion.copy(_e.slerp(el.quaternion, w));
    hd.quaternion.copy(_fist.slerp(hd.quaternion.multiply(_sl.setFromAxisAngle(Z, fit.slant)), w));
    slant += (fit.slant - slant) * w;
  }
  flask.userData.slant = slant;
  return curve(K.out, k);
}
const smooth = (x: number): number => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

/**
 * The fist closed round the flask's neck (`out` how far it's out, its scale), as the hand joint is turned (`drink`
 * turns it: the neck across the palm, slanted on it by as much as the drink has it), the mouth over the thumb. Call
 * while the flask is out, after the arm is posed, in place of the hand's own pose.
 */
export function holdFlask(h: Hand, flask: THREE.Object3D, out: number): void {
  const joint = h.vis.parent!, slant = flask.userData.slant as number, ale = !!flask.userData.ale;
  (flask.userData.mug as THREE.Object3D).visible = ale;
  if (ale) setMugFill(flask.userData.mug as THREE.Object3D, (flask.userData.mugFill as number | undefined) ?? 1);
  for (const o of flask.userData.flaskParts as THREE.Object3D[]) o.visible = !ale;
  joint.updateWorldMatrix(true, false);
  joint.getWorldQuaternion(_q);
  // (the neck and the hand's length from the joint's turn, the slant taken back out of it: `hold` turns the fist by it)
  _r.copy(_q).multiply(_sl.setFromAxisAngle(Z, -slant));
  _d.set(-h.s, 0, 0).applyQuaternion(_r);
  _a.set(0, 1, 0).applyQuaternion(_r);
  const r = (ale ? MUG.gripR : NECK_R) * out;
  hold(h, _d, r, _a, slant);
  seatHeld(h, flask, r);
  flask.quaternion.setFromUnitVectors(Y, _d.applyQuaternion(_q.invert()));
  // (the draught's surface level, however the flask is tipped: the draught turned back from the flask's own turn)
  flask.updateWorldMatrix(true, false);
  (flask.userData.draught as THREE.Object3D).quaternion.copy(flask.getWorldQuaternion(_q).invert());
  // (the cork out as it reaches the lips: drunk through, it read as a stoppered bottle pressed to the mouth)
  (flask.userData.cork as THREE.Object3D).visible = !ale && (flask.userData.lift as number) < 0.95;
  // (a drink not posed this frame leaves the fist the hand joint's own way, the neck square across it)
  flask.userData.slant = 0; flask.userData.lift = 0;
}

/** how far the flask is up at the lips (0..1) at `k`: a model eases what it moves out of the way by it */
export const drinkUp = (k: number, ale = false): number => curve((ale ? ALE_KEYS : DRAUGHT_KEYS).lift, k);
