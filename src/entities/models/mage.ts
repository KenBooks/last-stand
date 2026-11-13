// The Mage: a battle scholar, lean and clean-shaven, his dark hair cropped short, in a fitted oxblood longcoat with a
// high standing collar, split up the front over a charcoal waistcoat, brass-edged, a leather harness
// buckled in brass; his shirt's charcoal sleeves pushed up over forearms inked with runes, a grimoire chained at his hip,
// tall worn boots, and a gnarled staff cradling a floating crystal. The longcoat with its collar, shoulders, harness and
// skirts is the chest item's, the bracers the hands item's: without them the waistcoat and bare forearms. Fully procedural.
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { leather as leatherMaps, cloth as clothMaps, steel as steelMaps, wood as woodMaps, wool as woolMaps, oiled, pbrMaterialMaps, ctx2d } from '../../core/textures';
import { engravedSteel, embroidered, projectUV, steelRegion } from '../../core/engraving';
import { buildHumanoid, joint, part, resetPose, walkCycle, idle, deathFall, pulse, ramp, groundFeet, reachArm, runShareOf, disposeGeometries } from './rig';
import { Sculpt, stripRig, limb, lathe } from './shapes';
import { taperTube, lod, plate, edgeTube, strap, belt, buckle, stud, disc, stitches, gem as gemGeo, Skirt, SkirtLimbs, armOffThigh, scaleUV, type SurfaceFn, type JointPoint } from './armor';
import { headSteps, HERO_HEADS, buildNeck, toGroup, handSkin, HEAD_MM, showHair } from './head';
import { EYE } from './face';
import { buildHand, poseHand, strainHand, hold, seat, gripTurn, bare, handCapsules, glowOutline, SLANT } from './hands';
import { clamp, lerp, damp, TAU, mulberry, smooth } from '../../util';
import type { BellCloth } from './sleeve';
import { LegIK } from './ik';
import { buildBoot } from './boot';
import { fitArm } from './armIK';
import { bodyShape } from './anatomy';
import { curve, PoseFade, type Keys } from './motion';
import { onTunic, tunicFront, tunicCutSteps, armholeEdge, neckHem, necklineBack, outOfTunic, tunicNormal, SetInShoulders, ARMHOLE, WAIST, type ArmBlend } from './tunic';
import { buildFlask, drink, drinkUp, holdFlask, type DrinkHold } from './flask';
import { HoodCloth, evenly, spaced } from './hood';
import { Dye } from './dye';
import { ItemGlows } from './itemGlow';
import { SCHOOLS } from '../../data/schools';
import type { ActionState, AnimState, Gear, Model } from '../../types';
import { built, type ModelSteps } from './steps';

const WHITE = new THREE.Color(0xffffff);

const _hp = new THREE.Vector3(), _hd = new THREE.Vector3(), _fw = new THREE.Vector3(), _vr = new THREE.Quaternion();
/** a joint's length (its local y) */
const ALONG = new THREE.Vector3(0, 1, 0);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** the coat's and the waistcoat's share of the arm round each armhole (`ArmBlend`: as the ranger's coat, with nothing over
 *  the shoulder to keep it down) */
const ARM_K: ArmBlend = { seam: 0.5, reach: 0.09, top: 0.09, topY: 0.235, join: 0.1, joinIn: 0.05, around: 96, bulk: 0.35 };
/** how far the coat and the waistcoat stand off the tunic round the neckline (m) */
const NECK_LIFT = 0.008;
/** how far the slung belt and the book on it draw in round his hips without the coat (a share of their size over it:
 *  across, and from front to back, where it stood out behind his seat) */
const SLUNG_IN = 1, SLUNG_IN_BACK = 0.94;
/** where round the slung belt the book hangs (rad from ahead, towards his left): over the coat at the back of the
 *  hip, clear of the hanging arm; without it at the side of the hip, against the thigh, just behind the arm (at the
 *  back, without the coat, it lay glued to his seat); and how far it draws in along its face without the coat (m) */
const BOOK_AT = 2.3, BOOK_AT_BARE = 1.95, BOOK_IN = 0.02;
/** a point on the coat's front at x, y, `lift` above it: the tunic's (a round body of the coat's own, narrower over the
 *  shoulders with the arms' tubes stood beside it under caps, read as a bottle from behind) */
function onChest(x: number, y: number, lift: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.copy(tunicFront(x, y, lift));
}

/** the coat's front panels' embroidery: a column of diamonds, each with a smaller one inside (`embroidered`'s motif) */
function diamondColumn(c: CanvasRenderingContext2D, w: number, h: number): void {
  const m = w / 2;
  c.lineWidth = 4;
  const diamond = (y: number, r: number) => { c.beginPath(); c.moveTo(m, y - r); c.lineTo(m + r * 0.6, y); c.lineTo(m, y + r); c.lineTo(m - r * 0.6, y); c.closePath(); c.stroke(); };
  for (let y = h * 0.42; y < h - 80; y += 150) { diamond(y, 52); diamond(y, 22); }
}

/** The runes inked round a forearm (an alpha-tested texture: the ink opaque, the rest clear), wrapping the lathe's u round
 *  the arm and v along it: over the inner forearm a sigil, a seven-pointed star in a ring of written glyphs, a chain of
 *  small sealed glyphs from it towards the elbow with dots between, a line of glyphs down to the wrist, and a band round
 *  the arm at each end, as the sheet's; on the outer and back faces a column of large glyphs. Made once, shared by every build. (Its first, a few circles and spokes in thick
 *  lines, read as a target drawn in marker) */
let runes: THREE.CanvasTexture | undefined;
function forearmRunes(): THREE.CanvasTexture {
  if (runes) return runes;
  const N = 1024, cv = document.createElement('canvas');
  cv.width = N;
  cv.height = N;
  const c = ctx2d(cv);
  c.strokeStyle = '#000';
  c.fillStyle = '#000';
  c.lineCap = 'round';
  c.lineJoin = 'round';
  const rng = mulberry(11);
  // (each line twice as wide as drawn here: at the width of a pen's it greyed out a few metres off, and at a third
  // again it was gone at the game's distance)
  const stroke = (lw: number, path: () => void) => { c.lineWidth = lw * 2; c.beginPath(); path(); c.stroke(); };
  const ring = (x: number, y: number, r: number, lw: number) => stroke(lw, () => c.arc(x, y, r, 0, TAU));
  const line = (x0: number, y0: number, x1: number, y1: number, lw: number) => stroke(lw, () => { c.moveTo(x0, y0); c.lineTo(x1, y1); });
  const dot = (x: number, y: number, r: number) => { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); };
  /** a glyph w by h about (0, 0): a stem and two to three strokes between the points of a three by three grid */
  const glyph = (w: number, h: number, lw: number) => {
    const at = (k: number): [number, number] => [((k % 3) - 1) * w / 2, (Math.floor(k / 3) - 1) * h / 2];
    const stem = rng() < 0.5 ? [1, 7] : [rng() < 0.5 ? 0 : 2, rng() < 0.5 ? 6 : 8];
    const pairs = [stem];
    for (let n = 2 + Math.floor(rng() * 2); n > 0; n--) {
      const a = Math.floor(rng() * 9);
      let b = Math.floor(rng() * 9);
      if (b === a) b = (a + 4) % 9;
      pairs.push([a, b]);
    }
    for (const [a, b] of pairs) line(...at(a), ...at(b), lw);
    if (rng() < 0.4) dot(...at(Math.floor(rng() * 9)), lw * 0.9);
  };
  /** glyph at (x, y), turned by `a` */
  const glyphAt = (x: number, y: number, a: number, w: number, h: number, lw: number) => {
    c.save();
    c.translate(x, y);
    c.rotate(a);
    glyph(w, h, lw);
    c.restore();
  };

  // the bands round the arm (the canvas's top is the elbow's end): at the elbow a double line with diamonds and dots
  // between, at the wrist a double line with a row of triangles between
  for (const y of [52, 92]) line(0, y, N, y, 5);
  for (let x = 16; x < N; x += 32) {
    if ((x / 32) % 2 < 1) { c.beginPath(); c.moveTo(x, 60); c.lineTo(x + 9, 72); c.lineTo(x, 84); c.lineTo(x - 9, 72); c.closePath(); c.fill(); }
    else dot(x, 72, 3.5);
  }
  for (const y of [944, 990]) line(0, y, N, y, 5);
  for (let x = 0; x < N; x += 32) stroke(3.5, () => { c.moveTo(x, 984); c.lineTo(x + 16, 950); c.lineTo(x + 32, 984); });

  // (twice round the arm, at u = 0.25 and 0.75, so one faces out however the forearm turns)
  for (const cx of [256, 768]) {
    // the sigil: a ring of glyphs between two rings, ticks round it, a seven-pointed star, a crescent and a dot at its middle
    const cy = 640;
    ring(cx, cy, 164, 5);
    ring(cx, cy, 152, 2.5);
    ring(cx, cy, 116, 4);
    for (let k = 0; k < 48; k++) {
      const a = k / 48 * TAU, r0 = k % 4 ? 164 : 158;
      line(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * 176, cy + Math.sin(a) * 176, 2.5);
    }
    for (let k = 0; k < 20; k++) {
      const a = k / 20 * TAU;
      glyphAt(cx + Math.cos(a) * 134, cy + Math.sin(a) * 134, a + Math.PI / 2, 15, 20, 2.6);
    }
    stroke(3.5, () => {
      for (let k = 0; k <= 7; k++) {
        const a = -Math.PI / 2 + k * 3 / 7 * TAU, x = cx + Math.cos(a) * 112, y = cy + Math.sin(a) * 112;
        if (k) c.lineTo(x, y); else c.moveTo(x, y);
      }
    });
    for (let k = 0; k < 7; k++) {
      const a = -Math.PI / 2 + k / 7 * TAU;
      dot(cx + Math.cos(a) * 116, cy + Math.sin(a) * 116, 6);
    }
    ring(cx, cy, 44, 4);
    ring(cx, cy, 36, 2);
    stroke(4, () => { c.arc(cx, cy, 24, 0.35 * Math.PI, 1.65 * Math.PI); c.arc(cx + 9, cy, 18, 1.6 * Math.PI, 0.4 * Math.PI, true); });
    dot(cx + 6, cy, 4);

    // up towards the elbow: a stem through a chain of glyphs, each sealed in a small ring, dots between
    for (const [y, r] of [[420, 30], [312, 24], [216, 20], [140, 15]] as const) {
      c.save();
      c.globalCompositeOperation = 'destination-out';
      dot(cx, y, r + 3);
      c.restore();
      ring(cx, y, r, 3.5);
      glyphAt(cx, y, 0, r * 0.75, r * 1.05, 2.6);
      for (const sx of [-1, 1]) {
        line(cx + sx * (r + 8), y, cx + sx * (r + 34), y, 2.5);
        dot(cx + sx * (r + 44), y, 3.5);
      }
    }
    for (const d of [-1, 1]) dot(cx + d * 12, 468, 3);
    // down towards the wrist: a column of glyphs, with dots beside them
    for (let k = 0; k < 4; k++) {
      const y = 840 + k * 24;
      c.save();
      c.globalCompositeOperation = 'destination-out';
      c.fillRect(cx - 14, y - 11, 28, 22);
      c.restore();
      glyphAt(cx, y, 0, 14, 16, 2.4);
      dot(cx - 26, y, 2.5);
      dot(cx + 26, y, 2.5);
    }
  }
  // between the sigils, on the forearm's outer and back faces (u 0 and 0.5, the seam's drawn on both its edges), a
  // column of large glyphs between two lines from band to band: the face the game's camera sees from above and
  // behind, which held only the bands
  for (const cx of [0, 512, N]) {
    for (const sx of [-1, 1]) line(cx + sx * 34, 128, cx + sx * 34, 908, 3);
    for (let y = 170; y < 900; y += 70) glyphAt(cx, y, 0, 30, 40, 4);
  }
  runes = new THREE.CanvasTexture(cv);
  runes.colorSpace = THREE.SRGBColorSpace;
  runes.anisotropy = 4;
  return runes;
}

/** where the feet stand (left x, z, turn, then right), rig units: at rest, throwing a spell (the left steps in), slamming the ground, aiming the staff (the right forward), bracing for the lance */
/** a move's end held a moment after its cast is over (seconds), so a short cast's blow or throw is seen, then how long it takes to ease back to the stance */
/** the actions that pose the free hand; at every other time it hangs as a relaxed hand does, turned palm to the thigh and thumb
 *  forward (`HAND_HANG`, about its length): turned palm back, its width stood across the body and its thumb's side went into
 *  the hip and the skirt over it */
const FREE_HAND = new Set(['cast', 'summon', 'channel', 'slam', 'buff', 'drink']);
/** his free hand's outline: its green, how far it breathes either way and how fast (rad/s: well under the
 *  1.5 flashes a second a large glow may pulse at), and the share of it glowing over the whole hand */
const HAND_GLOW = { color: new THREE.Color(0x5dffa8).multiplyScalar(1.8), breathe: 0.3, rate: 2.2, body: 0.1, eyes: 0.35 };
const HAND_HANG = Math.PI / 2;
const TAIL: Record<string, number> = { cast: 0.35, summon: 0.35, slam: 0.4, buff: 0.5 }, TAIL_OUT: Record<string, number> = { cast: 0.45, summon: 0.45, slam: 0.6, buff: 0.5 };
/** drinking: the flask raised straight up before the chin, the elbow down and forward (the bell sleeve falls back off the forearm) */
const DRINK: DrinkHold = { wrist: new THREE.Vector3(0.07, -0.16, 0.14), tipped: new THREE.Vector3(0.08, 0.08, 0.19), pole: new THREE.Vector3(0.35, -1, 0.5), tippedPole: new THREE.Vector3(0.6, -0.4, 1) };
/** braced for Void Lance, how far the staff is slid up through the fist (rig units), its foot kept on the ground as
 *  he sinks into the stance: unslid, it stood 7 cm into the floor through the hold. (Turned upright in the fist as
 *  well, the fist closed round it another way and kept it after the cast, the staff 6 cm into the floor as he stood.) */
const LANCE_SLIDE = 0.2;
/** how long he takes to sink into the lance's brace once the portal is drawn (s) */
const BRACE_TIME = 0.35;
/** how long the free arm takes to drive its palm into the portal from where drawing it left the arm gathered (s): a
 *  thrust, but not one frame's (taken at once, the hand went 21 cm and the elbow 12 in a frame, `lab hall`) */
const THRUST_TIME = 0.1;
const REST_FEET = [0.14, 0.06, 0.22, -0.14, -0.05, -0.35], CAST_FEET = [0.13, 0.2, 0.15, -0.13, -0.1, -0.45];
const SLAM_FEET = [0.2, 0.06, 0.4, -0.2, -0.04, -0.4], AIM_FEET = [0.13, -0.04, 0.35, -0.12, 0.14, -0.05], LANCE_FEET = [0.15, 0.36, 0.05, -0.19, -0.3, -0.75],
  // (the lance from the right hand, with no staff: the same stride set on the other side)
  LANCE_FEET_R = [0.19, -0.3, 0.75, -0.15, 0.36, -0.05];

// --- a spell thrown from the free hand (cast: Starfall, Maelstrom), keyed over the cast, released at 0.55
// (the skill fires): the body coils away (the right shoulder forward, the weight back) as the hand gathers
// at the chest, then the hips and chest drive round and the arm throws the spell out, the weight forward
const CA_CHEST: Keys = [[0, 0], [0.4, 0.38], [0.5, 0.35], [0.62, -0.28], [0.8, -0.32], [1, -0.25]];
const CA_HIPS: Keys = [[0, 0], [0.38, 0.18], [0.48, 0.15], [0.58, -0.15], [1, -0.12]];
const CA_ARM_X: Keys = [[0, -0.2], [0.4, -0.75], [0.5, -0.8], [0.62, -1.5], [0.8, -1.45], [1, -1.3]];
const CA_ARM_Z: Keys = [[0, 0], [0.4, -0.45], [0.5, -0.45], [0.62, 0.12], [1, 0.08]];
const CA_ELBOW: Keys = [[0, -0.3], [0.4, -1.75], [0.5, -1.8], [0.62, -0.12], [0.8, -0.1], [1, -0.25]];
const CA_FWD: Keys = [[0, 0], [0.42, -0.05], [0.62, 0.06], [1, 0.05]];
const CA_BEND: Keys = [[0, 0], [0.42, -0.06], [0.62, 0.14], [1, 0.1]];

// --- Starfall (summon): the free hand reaches up into the sky, the head and chest lifting after it, the
// staff rising too, then at the release it is pulled down at the target, the body bending after it
const SU_ARM_X: Keys = [[0, -0.2], [0.42, -2.85], [0.5, -2.95], [0.6, -1.3], [0.7, -1.0], [1, -1.08]];
const SU_ARM_Z: Keys = [[0, 0], [0.42, 0.28], [0.5, 0.28], [0.62, 0.02], [1, 0]];
const SU_ELBOW: Keys = [[0, -0.3], [0.42, -0.12], [0.5, -0.35], [0.62, -0.05], [1, -0.1]];
const SU_BEND: Keys = [[0, 0], [0.42, -0.2], [0.5, -0.22], [0.62, 0.2], [1, 0.14]];
const SU_LOOK: Keys = [[0, 0], [0.4, -0.38], [0.5, -0.38], [0.62, 0.08], [1, 0.04]];
const SU_DIP: Keys = [[0, 0], [0.42, 0.03], [0.5, 0.03], [0.62, -0.06], [1, -0.045]];
const SU_FWD: Keys = [[0, 0], [0.42, -0.04], [0.62, 0.07], [1, 0.05]];

// --- Glacial Nova (slam): up on the toes with both arms raised, then driven down into a deep crouch, the
// hands slammed to the ground, held as the cast ends (the fade out of it is slow)
const SL_ARMS: Keys = [[0, -0.3], [0.4, -2.75], [0.5, -2.8], [0.62, -0.9], [0.7, -0.6], [1, -0.65]];
const SL_SPREAD: Keys = [[0, 0], [0.4, 0.3], [0.5, 0.32], [0.65, 0.15], [1, 0.2]];
const SL_DIP: Keys = [[0, 0], [0.4, 0.03], [0.5, 0.03], [0.64, -0.22], [0.72, -0.26], [1, -0.24]];
const SL_BEND: Keys = [[0, 0], [0.4, -0.18], [0.5, -0.18], [0.64, 0.45], [0.72, 0.52], [1, 0.48]];

export const buildMage = (): Model => built(mageSteps());

/** buildMage's pieces one at a time (`ModelSteps`): built behind the lobby, a piece a frame. */
export function* mageSteps(): ModelSteps {
  const kit = createKit(0x5dffa8);
  const rng = mulberry(5);
  const tex = (maps: ReturnType<typeof clothMaps>, rep: number, ns = 1) => { const m = pbrMaterialMaps(maps, rep, ns); return { map: m.map, normalMap: m.normalMap, roughnessMap: m.roughnessMap, normalScale: m.normalScale }; };
  yield;
  // the coat's felted wool: oxblood, its weave seen up close as the sheet's
  const coat = kit.rim({ color: 0x681c22, roughness: 1, ...tex(woolMaps(), 1, 1.2) }, 0x7a2a2a, 0.3);
  const coatD = kit.rim({ color: 0x681c22, roughness: 1, ...tex(woolMaps(), 1, 1.2), side: THREE.DoubleSide }, 0x7a2a2a, 0.3);
  yield;
  // the waistcoat's and the underskirts' charcoal wool, the shirt's darker red linen, the trousers' charcoal twill
  const charcoal = kit.rim({ color: 0x2b2a2e, roughness: 1, ...tex(woolMaps(), 1, 1.4), side: THREE.DoubleSide }, 0x3a3a44, 0.25);
  const shirt = kit.rim({ color: 0x3a1418, roughness: 1, ...tex(clothMaps(), 1, 0.9) }, 0x5a2a2a, 0.25);
  const sleeve = kit.rim({ color: 0x2e2d32, roughness: 1, ...tex(clothMaps(), 1, 1.1) }, 0x3a3a44, 0.25);
  const trousers = kit.rim({ color: 0x24232a, roughness: 1, ...tex(clothMaps(), 1, 1.2) }, 0x34343c, 0.2);
  yield;
  // brass, rubbed bright on its edges (the steel map's roughness: worn smooth where it is handled)
  const brass = kit.std({ color: 0xa47a40, metalness: 1, roughness: 0.6, roughnessMap: pbrMaterialMaps(steelMaps(), 1).roughnessMap });
  const gold = brass;
  yield;
  // the piping round the hood and the collar: a cord of burnished copper-gold a few millimetres thick, as the
  // reference's (half a mirror and twice as thick, it read as a bright yellow tube; as the brass, grey in the hood's
  // shadow, and round the collar a ring glowing as neon under the face in the staff's light; in a pale warm gold, a
  // bone-white cord)
  const piping = kit.std({ color: 0xc0803e, metalness: 0.35, roughness: 0.45 });
  const E = engravedSteel();
  const goldE = kit.std({ color: 0xc9a058, metalness: 1, roughness: 1, map: E.map, normalMap: E.normalMap, roughnessMap: E.roughnessMap });
  const blackLeather = kit.std({ color: 0x1a1614, roughness: 1, ...tex(leatherMaps(), 1, 1.2) });
  yield;
  // the belts' and the harness's brown leather, worn and creased
  const leather = kit.std({ color: 0x5a3820, roughness: 0.75, ...tex(leatherMaps(), 2, 1.8) });
  const beltLeather = kit.std({ color: 0x5c3418, roughness: 0.6, ...tex(leatherMaps(), 2, 2.2) });
  // the fingerless gloves: smooth oiled leather with long soft creases and a low sheen, as reference photographs of a
  // glove show it (#425: the belts' pebbled grain, laid across a hand, read as knit wool through the eyes; at a
  // roughness of 0.84 the studio's light ran down it as on wet bark, an adversarial review)
  const gloveLeather = kit.std({ color: 0x8a5a34, roughness: 0.95, ...tex(oiled(), 1, 1.4) });
  yield;
  // the grimoire: dark tooled leather over its boards, its pages old paper
  const tome = kit.std({ color: 0x4e2c18, roughness: 0.7, ...tex(leatherMaps(), 3, 2.4) });
  const paper = kit.std({ color: 0xb8a882, roughness: 1, ...tex(clothMaps(), 4, 0.6) });
  const linen = kit.rim({ color: 0x9a8e76, roughness: 1, ...tex(clothMaps(), 1, 0.7) }, 0x6a6050, 0.25);
  yield;
  // the boots: worn, oiled dark brown leather on darker soles, as the sheet's
  const boot = kit.std({ color: 0x4a2c1c, roughness: 1, ...pbrMaterialMaps(oiled(), 1) });
  const bootStrap = kit.std({ color: 0x3a2214, roughness: 1, ...pbrMaterialMaps(oiled(), 2) });
  const sole = kit.std({ color: 0x1e140c, roughness: 1, ...pbrMaterialMaps(oiled(), 2) });
  const wood = kit.std({ color: 0x7a5236, roughness: 0.9, ...tex(woodMaps(), 1, 2) });
  yield;
  // the coat's and the hood's dark lining
  const lining = kit.rim({ color: 0x3a1418, roughness: 1, ...tex(clothMaps(), 1, 0.9), side: THREE.BackSide }, 0x5a2a2a, 0.05);
  yield;
  // the staff's crystal and its rings in the colour of the bolts it shoots (Splintering Bolt's `color`, #197)
  const glow = kit.glow(0xff6fe0, 1.5);
  yield;
  // the staff's crystal: glowing softly, a little more while casting (animate() sets it each frame)
  // (its facets not mirrors, its coat thin and soft, its highlight weak: polished, as it spun a facet caught a light
  // white for a moment, the whole crystal flaring past the bloom, "staff still flickers at its brightest peak", 3.2
  // times its light, `lab hall --glow --lobby`; the hall's `HEAD` treats it more still)
  const GEM_GLOW = 0.4;
  yield;
  // (rough, its coat thin and rough, its highlight weak: polished, each facet as it turned mirrored a street lamp by night,
  // 4 times as bright as its glow for a frame or two, "mage's staff flickers too bright at times"; `lab village --only staffAtNight`)
  const gem = kit.phys({
    color: 0xff4fd8, emissive: 0xff4fd8, emissiveIntensity: GEM_GLOW, roughness: 0.7, metalness: 0,
    clearcoat: 0.1, clearcoatRoughness: 0.7, specularIntensity: 0.3, flatShading: true,
  });
  yield;
  // the grimoire's set stone: red, lit from within a little
  const stone = kit.phys({ color: 0x7a0f1a, emissive: 0xff2a3a, emissiveIntensity: 0.5, roughness: 0.08, metalness: 0, clearcoat: 1, flatShading: true });
  yield;
  // the coat's front panels: oxblood, a brass-thread border and a column of diamonds down each, as the sheet's
  const PW = 256, PH = 1024;
  const panelTex = embroidered(PW, PH, [[0, 0], [PW, 0], [PW, PH], [0, PH]], [0.36, 0.1, 0.12], [0.78, 0.6, 0.32], diamondColumn);
  const panel = kit.rim({ color: 0xffffff, roughness: 1, map: panelTex.map, normalMap: panelTex.normalMap, roughnessMap: panelTex.roughnessMap, side: THREE.DoubleSide }, 0x7a2a2a, 0.3);
  yield;
  // the runes inked on his forearms (an alpha-tested layer over the skin)
  // (blended, not cut out: cut at half, a line thinner than a texel of the smaller mip levels was dropped whole, and
  // at the game's distance the runes were gone; blended it fades to a grey that still shows. Drawn forward by a constant
  // offset alone: by the slope's too, at the forearm's outline it came forward through the coat's skirt the arm passed
  // behind, a dark shard below the bracer)
  const ink = kit.std({ color: 0x1a1c26, roughness: 0.6, map: forearmRunes(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: -4 });

  const j = buildHumanoid({ skin: coat }, {
    chestW: 0.17, chestD: 0.14, shoulderW: 0.2, shoulderY: 0.45, upperR: 0.06, foreR: 0.05, shinL: 0.41,
    // (a shorter neck than the rig's: at 0.1 it stood long and thin out of the collar, beside his sheet; at 0.085 the jaw
    // sat on the collar)
    neckL: 0.093,
  });
  stripRig(j.root);
  const S = new Sculpt();
  yield;
  // what comes off (setGear): the chest item's (the longcoat with its collar, shoulders, harness and skirts) and the
  // waistcoat shown without it, the hands item's (bracers over the forearms' runes)
  const A = new Sculpt(), T = new Sculpt(), H = new Sculpt();
  const bareSkin = handSkin(kit, 'mage');

  yield;
  // --- the longcoat's body: fitted, open down the front over the charcoal waistcoat and the shirt's red at the throat; cut
  // as the ranger's coat is, an armhole round each shoulder with the shirt's sleeve set into it (`SetInShoulders`)
  const sets = new SetInShoulders(j, ARM_K, lod(ARM_K.around, 48));
  yield;
  // (stood off the tunic round the neckline, up from over the armholes: his neck widens into the shoulders, `neckFlare`, and
  // at the tunic's own height it came through the cloth behind)
  // (a piece at a time: the cut and each side's sleeve set in, 16 ms whole)
  const cut = function* (into: Sculpt, mat: THREE.Material): Generator<void, void, undefined> {
    const [L, R] = yield* tunicCutSteps(sets.around, lod(22, 12));
    for (const g of [L, R]) {
      const p = g.attributes.position, n = g.attributes.normal;
      for (let i = 0; i < p.count; i++) {
        // (lower down on the back and front alone: at the sides it is the armhole's edge, which the sleeve's top keeps to)
        const y = p.getY(i), faces = clamp((Math.abs(n.getZ(i)) - 0.4) / 0.4, 0, 1);
        const lift = NECK_LIFT * Math.max(clamp((y - 0.252) / 0.035, 0, 1), clamp((y - 0.19) / 0.06, 0, 1) * faces);
        p.setXYZ(i, p.getX(i) + n.getX(i) * lift, p.getY(i) + n.getY(i) * lift, p.getZ(i) + n.getZ(i) * lift);
      }
    }
    yield;
    into.skinChain(sets.withArm(R, -1), mat, j.chest, sets.chainOf(-1));
    yield;
    into.skinChain(sets.withArm(L, 1), mat, j.chest, sets.chainOf(1));
  };
  yield* cut(A, coat);
  A.add(scaleUV(lathe(WAIST, 24), 3, 1), coat, j.spine, [0, 0, 0], [0, 0, 0], [1, 1, 0.86]);
  yield;
  // (carried on down inside the skirt's top, under the belt: the skirt hung from a step below the waist)
  A.add(scaleUV(lathe([[0.17, -0.1], [0.16, -0.075], [0.148, -0.05]], 24), 3, 1), coat, j.spine, [0, 0, 0], [0, 0, 0], [1, 1, 0.86]);
  /** the coat's front edge on each side (half-width from the middle) at height y: close at the collar, opening down to the waist */
  const edgeX = (y: number) => lerp(0.035, 0.085, clamp((0.27 - y) / 0.37, 0, 1));
  yield;
  // (stood off further down, over the coat's waist, which came through its foot in a jagged edge)
  const low = (y: number) => 0.012 * clamp((0.05 - y) / 0.12, 0, 1);
  const front: SurfaceFn = (u, v, out) => { const y = lerp(0.27, -0.12, v); return onChest((u - 0.5) * 2 * edgeX(y), y, 0.002 + low(y), out); };
  A.add(plate(front, 10, 12, 0.003, undefined, V(0, 0.1, 0)), charcoal, j.chest);
  yield;
  // (the shirt's red at the throat, between the collar's points)
  A.add(plate((u, v, out) => { const y = lerp(0.285, 0.2, v); return onChest((u - 0.5) * 2 * lerp(0.034, 0.012, v), y, 0.004, out); }, 6, 6, 0.002), shirt, j.chest);
  yield;
  // the waistcoat's brass buttons down its middle, and brass piping down the coat's front edges
  for (const y of [0.17, 0.1, 0.03, -0.04]) A.add(stud(0.0075), brass, j.chest, onChest(0, y, 0.006).toArray());
  for (const s of [1, -1]) {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 10; k++) { const y = lerp(0.275, -0.12, k / 10); pts.push(onChest(s * edgeX(y), y, 0.004 + low(y))); }
    // (in the engraved, duller gold: in the bright brass, where it lies up the shoulders' slope it faced the sky and glowed
    // in two rods under the collar)
    A.add(taperTube(pts, () => 0.005, 20, 6), goldE, j.chest);
    yield;
  }

  yield;
  // --- the collar: standing high round the neck, open at the throat, its points turned out as lapels, piped along its
  // edges (as the sheet's, higher behind than at its points in front; pinched in round the neck at its points too, and
  // the shirt's red filling the gap, it read as a ring under the chin), drawn in round the neck at its top as a
  // mandarin collar is (standing 4-5 cm off the neck and flared at its points, it read as a funnel in the hood's opening)
  {
    const PHI = 0.7;
    const collar: SurfaceFn = (u, v, out) => {
      const a = lerp(PHI, TAU - PHI, u), back = 0.5 - 0.5 * Math.cos(a);
      // (its foot run down into the coat's body and out under it: from the foot at 0.268 the coat's shoulders, squashed
      // front to back more than the collar, left a gap behind the neck that showed the skin and through it)
      const top = lerp(0.322, 0.372, back), y = lerp(0.235, top, v), flare = 0.01 * (1 - back) * v ** 1.6;
      const r = lerp(0.112, 0.086, v ** 0.6) - 0.012 * Math.sin(Math.PI * v ** 0.8) * back + flare;
      return out.set(Math.sin(a) * r, y, Math.cos(a) * r * 0.95 + necklineBack(y));
    };
    A.add(plate(collar, 36, 6, 0.006, undefined, V(0, 0.3, 0)), coatD, j.chest);
    // (piped round its top alone: down its points' edges too, the two caught the light in a pair of glowing rods)
    A.add(edgeTube(collar, 'v1', 0.003, 36), piping, j.chest);
  }

  yield;
  // --- the shoulders: the coat's seams stitched in a dark thread, over each shoulder from the collar to the sleeve and
  // round the armhole (moving with the cloth they're sewn into; in the linen's, the armhole's outlined each sleeve as a plug)
  for (const sa of [1, -1]) {
    const top = ARMHOLE.y + ARMHOLE.B;
    A.skinChain(sets.withArm(stitches([0.272, 0.262, top].map((y) => onTunic(sa * Math.PI / 2, y, 0.0016))), sa), shirt, j.chest, sets.chainOf(sa));
    // (the coat's armhole turned under in a rolled edge, over the sleeve's seam)
    const roll = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(armholeEdge(sa, 48, 0.004), true), lod(64, 32), 0.0055, 6, true);
    A.skinChain(sets.withArm(roll, sa), coat, j.chest, sets.chainOf(sa));
    A.skinChain(sets.withArm(stitches(armholeEdge(sa, 48, 0.011), 0.004, 0.0028, 0.0009, true), sa), shirt, j.chest, sets.chainOf(sa));
    yield;
  }

  yield;
  // --- the harness: a strap down the front from each shoulder to the belt, buckled at the chest, and crossed behind
  // (its lower half going with the waist, the coat under it there: on the chest alone, the coat's waist turned under it
  // walking and the strap's end stood out of the coat by the hip, a dark shard below the bracer). Each lies flat on the
  // coat (faced along its normal: along a radial from the chest's axis, each stood tilted, an edge 1.9 cm off the coat)
  const harness = (pts: THREE.Vector3[]) => {
    const g = strap(pts, 0.05, 0.008, false, tunicNormal), p = g.attributes.position, k = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) k[i] = smooth(clamp((0.06 - p.getY(i)) / 0.12, 0, 1));
    g.setAttribute('skinK', new THREE.BufferAttribute(k, 1));
    A.skinChain(g, leather, j.chest, [j.chest, j.spine]);
  };
  for (const s of [1, -1]) {
    // (from under the collar's foot: laid flat up the shoulders' slope above it, the straps' ends stood out of the coat)
    const down = [0.255, 0.2, 0.14, 0.06, -0.02, -0.1].map((y) => onChest(s * lerp(0.085, 0.1, (0.255 - y) / 0.355), y, 0.008));
    harness(down);
    // (its bar along the strap: across it, the buckle read as a letter E)
    A.add(buckle(0.034, 0.028, 0.005), brass, j.chest, onChest(s * 0.088, 0.15, 0.014).toArray(), [0, 0, Math.PI / 2]);
    const back = [0.255, 0.17, 0.08, -0.02, -0.11].map((y, k) => onChest(s * lerp(0.1, -0.11, k / 4), y, 0.008).multiply(V(1, 1, -1)));
    harness(back);
    yield;
  }
  A.add(disc(0.022, 0.008), brass, j.chest, onChest(0, 0.13, 0.012).multiply(V(1, 1, -1)).toArray(), [0, Math.PI, 0]);

  yield;
  // --- arms: the shirt's charcoal sleeves pushed up to the elbow in a thick roll, a strap round each upper arm, the forearms
  // bare and inked with runes; leather bracers buckled over them (the hands item's), fingerless gloves
  for (const [s, sh, el, hd] of [[1, j.shoulderL, j.elbowL, j.handL], [-1, j.shoulderR, j.elbowR, j.handR]] as const) {
    // (set into the armhole: from its edge over the deltoid onto the arm, and over the elbow under the roll)
    // (its top run on close over the deltoid, `full`: as full as the ranger's coat sleeve, the shirt's stood out of the coat's
    // armhole in a ball; its top as wide as the armhole's, the deltoid under it: narrower, it hung out of the coat's
    // shoulder as a thin tube under a shelf)
    S.skinChain(sets.sleeve(s, { len: 0.31, r0: 0.076, r1: 0.057, bulge: 0.09, at: 0.12, full: 1, fullIn: 0.9, cap: lod(10, 6), tube: lod(14, 8) }), sleeve, sh, [...sets.chainOf(s), el]);
    yield;
    // (the sleeve turned back on itself round the elbow: a band of the cloth a little proud of the sleeve, its folded
    // edges top and bottom, soft creases running round it; as two thick lumpy rings it read as a dark knot)
    {
      // (closed into a roll with its inside, back down within it: an open band showed its culled inside under it, the
      // world seen through the sleeve, when the elbow bent past a right angle)
      const cuff = lathe([[0.059, -0.03], [0.0635, -0.027], [0.065, -0.012], [0.065, 0.012], [0.0635, 0.024], [0.06, 0.027], [0.054, 0.026], [0.051, -0.028], [0.059, -0.03]], lod(40, 20));
      const p = cuff.attributes.position, phase = s > 0 ? 0 : 1.3;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), r = Math.hypot(x, z);
        // (looser at the back of the elbow, creased across in a few soft waves, its hem rising and falling a little)
        const k = (r + 0.0025 * Math.sin(a * 3 + phase) + 0.0012 * Math.sin(a * 7 + phase * 2)) / r;
        p.setXYZ(i, x * k, y + 0.003 * Math.sin(a * 2 + phase) * Math.sign(y), z * k);
      }
      cuff.computeVertexNormals();
      S.add(scaleUV(cuff, 4, 1), sleeve, el, [0, 0.004, 0]);
      for (const [y, r] of [[-0.026, 0.0615], [0.031, 0.0605]] as const) {
        S.add(new THREE.TorusGeometry(r, 0.004, lod(6, 4), lod(40, 20)).rotateX(Math.PI / 2), sleeve, el, [0, y, 0]);
      }
    }
    yield;
    S.add(belt(0.064, 0.064, -0.17, 0.022, 0.005, 0, 16), leather, sh);
    S.add(buckle(0.018, 0.022, 0.004), brass, sh, [s * 0.066, -0.17, 0], [0, s * Math.PI / 2, 0]);
    // the forearm, from under the roll to the wrist, and its runes over it
    const fore: [number, number][] = [[0.033, -0.3], [0.035, -0.27], [0.04, -0.2], [0.046, -0.12], [0.048, -0.06], [0.046, -0.02]];
    S.skin(lathe(fore, 18), bareSkin, el, hd, 0.25, 0.29);
    S.skin(lathe(fore.map(([r, y]) => [r + 0.0006, y]), 18), ink, el, hd, 0.25, 0.29);
    yield;
    // the bracer: leather round the lower forearm, two brass-buckled straps
    const bracer: [number, number][] = [[0.04, -0.27], [0.045, -0.22], [0.051, -0.15], [0.053, -0.12]];
    H.add(scaleUV(lathe(bracer, 16), 2, 1), leather, el);
    // (its top rolled over, so it ends in an edge rather than a cut)
    H.add(new THREE.TorusGeometry(0.0535, 0.0035, 5, 18).rotateX(Math.PI / 2), leather, el, [0, -0.122, 0]);
    // its straps drawn snug round it where they lie (sized as if it widened towards the wrist, the lower stood off it
    // as a loose ring)
    const bracerAt = (y: number) => {
      for (let k = 1; k < bracer.length; k++) {
        const [r0, y0] = bracer[k - 1], [r1, y1] = bracer[k];
        if (y <= y1) return lerp(r0, r1, (y - y0) / (y1 - y0));
      }
      return bracer[bracer.length - 1][0];
    };
    for (const y of [-0.16, -0.235]) {
      const r = bracerAt(y) + 0.003;
      H.add(belt(r, r, y, 0.012, 0.004, 0, 14), beltLeather, el);
      H.add(buckle(0.014, 0.016, 0.003), brass, el, [s * (r + 0.003), y, 0], [0, s * Math.PI / 2, 0]);
    }
    yield;
  }
  const handL = buildHand(j.handL, 1, gloveLeather, bareSkin, 1, bareSkin);
  const handR = buildHand(j.handR, -1, gloveLeather, bareSkin, 1, bareSkin);
  yield;
  // (his arcana: the free hand's outline lit green, breathing slowly: `HAND_GLOW`)
  const handGlow = new THREE.Color(), handBody = new THREE.Color();
  glowOutline(handL, handGlow, handBody);
  // (and the other hand's with no staff in it, #402: both hands lit say both are ready for the lance; black, no
  // glow, while it holds the staff)
  const handGlowR = new THREE.Color(0), handBodyR = new THREE.Color(0);
  glowOutline(handR, handGlowR, handBodyR);
  const body = bodyShape(j, { L: handL.vis, R: handR.vis });

  yield;
  // --- without the coat: the waistcoat over the shirt, buttoned in brass, the shirt's collar round the neck
  // (eased out over the shoulders' top and round the neckline: the neck, a man's girth widening into the shoulders,
  // came through it behind)
  yield* cut(T, charcoal);
  T.add(scaleUV(lathe(WAIST, 24), 3, 1), charcoal, j.spine, [0, 0, 0], [0, 0, 0], [1, 1, 0.86]);
  T.add(neckHem(), shirt, j.chest);
  T.add(plate((u, v, out) => out.copy(tunicFront((u - 0.5) * 2 * lerp(0.04, 0.012, v), lerp(0.29, 0.2, v), 0.003)), 6, 6, 0.002), shirt, j.chest);
  for (const y of [0.17, 0.1, 0.03, -0.04]) T.add(stud(0.0075), brass, j.chest, tunicFront(0, y, 0.005).toArray());

  yield;
  // --- legs: charcoal trousers into tall boots of worn brown leather (models/boot.ts, the ranger's last and sole)
  for (const [th, kn, an] of [[j.thighL, j.kneeL, j.ankleL], [j.thighR, j.kneeR, j.ankleR]] as const) {
    S.add(scaleUV(limb(0.46, 0.09, 0.07, 0.1, 0.3, 12), 2, 1.5), trousers, th);
    S.add(scaleUV(limb(0.12, 0.068, 0.064, 0.04, 0.35, 12), 2, 1.5), trousers, kn);
    buildBoot(S, { leather: boot, sole, strap: bootStrap, metal: brass }, kn, an, th === j.thighL ? 1 : -1);
    yield;
  }

  yield;
  // --- the belts: a broad one at the waist with a square brass buckle, a second slung across the hips, and the grimoire
  // hanging from it at his left hip on a brass chain
  S.add(belt(0.166, 0.143, 0.02, 0.06, 0.012), beltLeather, j.spine);
  for (const y of [-0.006, 0.046]) {
    const ring = Array.from({ length: 48 }, (_, k) => { const a = (k / 48) * TAU; return V(Math.sin(a) * 0.174, y, Math.cos(a) * 0.151); });
    S.add(stitches(ring, 0.006, 0.004, 0.0013, true), linen, j.spine);
    yield;
  }
  yield;
  // (its buckle a broad brass frame with a prong; the belt's end through it, held by a leather keeper, with its holes)
  S.add(buckle(0.076, 0.07, 0.01), brass, j.spine, [0, 0.02, 0.158]);
  S.add(new THREE.BoxGeometry(0.042, 0.006, 0.006), brass, j.spine, [-0.012, 0.02, 0.166]);
  const onWaist = (a: number, out: number, y = 0.02) => V(Math.sin(a) * (0.166 + out), y, Math.cos(a) * (0.143 + out));
  S.add(strap(Array.from({ length: 8 }, (_, k) => onWaist(0.04 + k * 0.08, 0.009)), 0.048, 0.007), beltLeather, j.spine);
  S.add(buckle(0.014, 0.066, 0.008), beltLeather, j.spine, onWaist(0.36, 0.016).toArray(), [0, 0.36, 0]);
  for (const a of [0.46, 0.52]) S.add(new THREE.CylinderGeometry(0.0035, 0.0035, 0.003, 8).rotateX(Math.PI / 2), sole, j.spine, onWaist(a, 0.0135).toArray(), [0, a, 0]);
  yield;
  // (the slung belt and the book on it in a group of their own on the hips: sized round the coat, without it they hung
  // in the air off the waistcoat, and the group draws in to it, `SLUNG_IN`)
  const sling = new THREE.Group();
  j.hips.add(sling);
  yield;
  // (drawn tight round the coat: a hand's width off it, it stood out from it as a hoop)
  const slung = (a: number, out = 0, dy = 0) =>
    V(Math.sin(a) * (0.185 + out), -0.01 - 0.05 * Math.sin(a + 0.6) - 0.02 * Math.cos(a) + dy, Math.cos(a) * (0.17 + out));
  const around = (out = 0, dy = 0) => Array.from({ length: 36 }, (_, k) => slung((k / 36) * TAU, out, dy));
  S.add(strap(around(), 0.05, 0.01, true), beltLeather, sling);
  for (const dy of [-0.02, 0.02]) S.add(stitches(around(0.006, dy), 0.005, 0.0035, 0.0011, true), linen, sling);
  S.add(buckle(0.06, 0.062, 0.009), brass, sling, slung(-0.35, 0.008).toArray(), [0, -0.35, -0.24]);
  const book = new THREE.Group();
  sling.add(book);
  {
    // (the book's boards and spine round its pages, brass corners, a brass boss with the stone, hung flat against the
    // back of the hip, its top just under the slung belt: at his side behind the hanging hand, off the coat on a long
    // chain, it floated beside him; in a group of its own with its chain, drawn in without the coat: `BOOK_IN`)
    const W = 0.15, Hh = 0.2, D = 0.06, ry = BOOK_AT;
    const seat = slung(BOOK_AT, D / 2 + 0.004);
    // (its top tucked behind the belt's lower edge: at that edge, a gap showed under the belt from behind)
    const at: [number, number, number] = [seat.x, seat.y - 0.014 - Hh / 2, seat.z];
    const place = (x: number, y: number, z: number): [number, number, number] =>
      [at[0] + Math.sin(ry) * z + Math.cos(ry) * x, at[1] + y, at[2] + Math.cos(ry) * z - Math.sin(ry) * x];
    S.add(new THREE.BoxGeometry(W - 0.006, Hh - 0.008, D - 0.012), paper, book, at, [0, ry, 0]);
    for (const z of [D / 2 - 0.004, -D / 2 + 0.004]) S.add(new THREE.BoxGeometry(W, Hh, 0.008), tome, book, place(0, 0, z), [0, ry, 0]);
    S.add(new THREE.BoxGeometry(0.01, Hh, D), tome, book, place(-W / 2, 0, 0), [0, ry, 0]);
    for (const cx of [1, -1]) for (const cy of [1, -1]) S.add(new THREE.BoxGeometry(0.022, 0.022, 0.01), brass, book, place(cx * (W / 2 - 0.009), cy * (Hh / 2 - 0.009), D / 2), [0, ry, 0]);
    S.add(disc(0.026, 0.006), goldE, book, place(0, 0, D / 2 + 0.003), [0, ry, 0]);
    S.add(gemGeo(0.012), stone, book, place(0, 0, D / 2 + 0.008), [0, ry, 0]);
    S.add(new THREE.OctahedronGeometry(0.016, 0), brass, book, place(W / 2 - 0.02, -Hh / 2 - 0.04, D / 2), [0, ry, 0], [0.7, 1.6, 0.7]);
    S.add(new THREE.CylinderGeometry(0.0015, 0.0015, 0.03, 4), brass, book, place(W / 2 - 0.02, -Hh / 2 - 0.012, D / 2), [0, ry, 0]);
    // the chain: a few links turned alternately, from the slung belt just above down to the book's top corner
    const a1 = V(...place(-W / 2 + 0.012, Hh / 2, D / 2));
    const a0 = slung(Math.atan2(a1.x / 0.205, a1.z / 0.19), 0.008);
    const n = 4;
    for (let k = 0; k <= n; k++) {
      const t = k / n, p = a0.clone().lerp(a1, t);
      p.y -= 0.006 * Math.sin(t * Math.PI);
      const link = new THREE.TorusGeometry(0.009, 0.0024, 5, 10).scale(1, 1.5, 1);
      S.add(link, brass, book, p.toArray(), [0, k % 2 ? Math.PI / 2 : 0, 0.3]);
    }
  }

  yield;
  // --- skirts: the coat to below the knee, its front edges hanging straight down from the belt and parting in a narrow
  // slit from the knee to the hem, rounded at its corners, brass at its hem, the charcoal underskirts showing in the slit
  // (as a long coat hangs: the owner's reference photos, `.tmp/references/coat-split`; cut in a pointed arch up to the
  // waist, it read as a tent's flap over a dark wedge)
  /** an angle round the skirt from its front, either way (its columns run 0 to 2π, the front at both ends) */
  const fromFront = (a: number) => (a > Math.PI ? a - TAU : a);
  yield;
  // (no underskirts under the closed coat: the breeches show in its slit; cut away at its front, they came through it
  // between the legs and showed their cut edges at its sides)
  // (the coat's slit its front seam parted, a few centimetres at the hem, its corners rounded a little: as the owner's
  // reference has it at rest; cut out of the hem it was a V notch)
  const slit = (a: number, deep: number, wide: number) => -deep * Math.exp(-((fromFront(a) / wide) ** 4));
  yield;
  // (from the coat's waist under the broad belt, hanging near straight to below the knee, in a few broad folds, as Codex
  // measured it against the reference photos: from 20 cm out, wider than the waist, its top stood proud of the body,
  // flared to 31 cm it read as a bell, and its fifteen folds and brass hem as a pleated skirt)
  const over = new Skirt({ r0: 0.162, r1: 0.255, len: 0.68, depth: 0.84, folds: 8, foldAmp: 0.03, rows: 12, trim: 0.03, radial: 72, flare: 0.6, slit: { from: 0.45, gap: 0.05 }, hem: (a) => slit(a, 0.02, 0.06) + 0.03 * (1 - Math.cos(a)) * 0.5 });
  const skirts: THREE.Mesh[] = [];
  for (const [sk, mats] of [[over, [coat, coat]], [over, [lining, lining]]] as const) {
    const m = new THREE.Mesh(sk.geo, mats.length > 1 ? [...mats] : mats[0]);
    m.position.y = 0.03; m.castShadow = m.receiveShadow = true;
    j.hips.add(m); skirts.push(m);
    yield;
  }
  yield;
  // (without the coat the waistcoat's skirt, short over the hips)
  const short = new Skirt({ r0: 0.19, r1: 0.215, len: 0.14, depth: 0.82, folds: 5, foldAmp: 0.02, rows: 4, hem: (a) => 0.04 * Math.max(0, Math.cos(a)) ** 3 });
  const tunicSkirt = new THREE.Mesh(short.geo, charcoal);
  tunicSkirt.position.y = 0.03; tunicSkirt.castShadow = tunicSkirt.receiveShadow = true;
  j.hips.add(tunicSkirt);
  const legs = new LegIK(j);
  /** smooths every cut between poses: an action starting, restarting or ending */
  const fade = new PoseFade(j);
  let lastName = '', lastK = 1;
  let tailName = '', tailT = 0;
  /** a staff shot's kick, 1 as it leaves, dying away */
  let recoil = 0;
  /** no cloth sleeves: the shirt's are rolled up */
  const cloths: BellCloth[] = [];
  yield;
  // what the skirts keep clear of, in their own space (all of them hang where the tunic's does): the thighs from the hip and
  // the shins over the boots from inside, the hands from outside; the breeches' and the boots' radii (the boot's cuff and its
  // stone stand 10 cm off the shin: sized to the breeches, the shin came through the robe there) and the cloth's gap (with a
  // little over for the flat triangles between its points)
  const legBodies = new SkirtLimbs(), handBodies = new SkirtLimbs(), GAP = 0.018, O = () => new THREE.Vector3();
  for (const [th, kn, an] of [[j.thighL, j.kneeL, j.ankleL], [j.thighR, j.kneeR, j.ankleR]] as const) {
    // (the full gap at the hip too: closer, 4 to 14 mm, the thigh came through the coat by the hip walking, a dark shard
    // under the belt; the seat stands in without the skirt's layer)
    legBodies.add([th, O()], [kn, O()], 0.09 + GAP, 0.07 + GAP);
    legBodies.add([kn, O()], [an, O()], 0.1 + GAP, 0.085 + GAP);
    yield;
  }
  yield;
  // (each hand as capsules from its own joints, with a little over for the cloth's flat triangles between its points)
  const segsL = handCapsules(handL), HAND_GAP = 0.012;
  for (const [a, b, r] of [...segsL, ...handCapsules(handR)]) handBodies.add(a, b, r + HAND_GAP);
  yield;
  // (and the free forearm's lower half, as wide as its bracer's cuff or its sleeve's at the wrist: it hangs by the hip)
  const fore = handBodies.add([j.elbowL, new THREE.Vector3(0, -0.5 * j.P.foreL, 0)], [j.handL, O()], 0), cuffR = () => (gloved ? 0.074 : 0.05);
  yield;
  // (the legs placed first: the free arm is kept off the thigh before the hands are)
  const placeBodies = () => {
    fore.ra = cuffR() - 0.012 + HAND_GAP; fore.rb = cuffR() + HAND_GAP;
    handBodies.place(tunicSkirt);
  };
  yield;
  // (the free arm swung out just enough to keep its hand and its cuff off the thigh and the cloth over it: armOffThigh)
  const handPts = [...segsL.flatMap(([a, b, r]) => [[a, r], [b, r]] as [JointPoint, number][]), [[j.elbowL, new THREE.Vector3(0, -0.5 * j.P.foreL, 0)], 0], [[j.handL, new THREE.Vector3()], 0]] as [JointPoint, number][];
  const clearThigh = () => {
    const n = handPts.length;
    handPts[n - 2][1] = cuffR() - 0.012; handPts[n - 1][1] = cuffR();
    armOffThigh(tunicSkirt, j.shoulderL, 1, legBodies.list[0], HAND_GAP + (robed ? 0.015 : 0), handPts);
  };
  const flaps: { g: THREE.Group; knee: THREE.Group; a: number; len: number; w: number }[] = [];
  const hang = (a: number, w: number, len: number, mat: THREE.Material, hemPx: number, texH: number, lift: number) => {
    const g = joint(j.hips, Math.sin(a) * (0.21 + lift), 0.04, Math.cos(a) * (0.175 + lift));
    g.rotation.order = 'YXZ'; g.rotation.y = a;
    // (bending halfway down, where a raised knee lifts the robe under it: the lower half hangs on from there)
    const knee = joint(g, 0, -len / 2, 0);
    const cut = len * (hemPx / texH);
    const pf: SurfaceFn = (u, v, out) => { const yb = -len + cut * Math.abs(2 * u - 1); return out.set((u - 0.5) * w, lerp(yb, 0, v), 0.012 * Math.sin(u * Math.PI)); };
    const f = new Sculpt();
    f.skin(plate(pf, 8, 14, 0, (u, v) => { const yb = -len + cut * Math.abs(2 * u - 1); return [u, 1 + lerp(yb, 0, v) / len]; }), mat, g, knee, len / 2 - 0.06, len / 2 + 0.06);
    f.build();
    flaps.push({ g, knee, a, len, w });
  };
  yield;
  // (each half of a panel swung out at least as far as the robe under it, a little clear of it: the robe lies over a raised
  // knee, and swung by the thighs' angles alone a panel hung behind it; in one piece, laid along the robe over a knee raised at
  // a run it stood straight out. `swing` its own swing, both halves' angles from straight down in its pivot's frame turned to
  // face out; the upper from a hand's breadth down it, as cloth bends over what is just under its top)
  const overRobe = (f: (typeof flaps)[number], swing: number): [number, number] => {
    const P = (over.geo.attributes.position as THREE.BufferAttribute).array as Float32Array, c = Math.cos(f.a), sn = Math.sin(f.a), hw = f.w / 2 + 0.02, o = f.g.position, h = f.len / 2;
    // (only the robe's columns round the panel's own angle: its seam at the front, the first column's angle 0)
    const C = over.cols, span = Math.ceil(((hw / 0.2) / TAU) * (C - 1)) + 1, i0 = Math.round((((f.a / TAU) % 1 + 1) % 1) * (C - 1));
    const fit = (ay: number, az: number, near: number, far: number, from: number): number => {
      let need = from;
      for (let di = -span; di <= span; di++) for (let k = (((i0 + di) % (C - 1)) + C - 1) % (C - 1) * 3; k < P.length; k += C * 3) {
        const dx = P[k] - o.x, dz = P[k + 2] - o.z, x = dx * c - dz * sn;
        const y = P[k + 1] + 0.03 - o.y - ay, z = dx * sn + dz * c - az, d = Math.sqrt(y * y + z * z);
        if (y > 0 || Math.abs(x) > hw || d > far || d < near) continue;
        need = Math.max(need, Math.atan2(z, -y) + 0.012 / Math.max(d, 0.05));
      }
      return need;
    };
    const up = Math.min(fit(0, 0, 0.15, h, swing), swing + 1);
    return [up, Math.min(fit(-h * Math.cos(up), h * Math.sin(up), 0, h, swing), swing + 1)];
  };
  void hang; void panel;

  yield;
  // --- the head: face, a full beard, hair, and a hood (worn with a head item equipped: setGear) in the coat's wool
  const head = yield* headSteps(j.head, kit, HERO_HEADS.mage.who, HERO_HEADS.mage);
  yield;
  // (a point just before the lips, for the flask)
  const mouth = new THREE.Object3D(); mouth.name = 'mouth'; head.group.add(mouth); toGroup(0, 50, 112, mouth.position);
  buildNeck(j.neck, kit, 'mage', j.P.neckL, j.head);
  const hat = new THREE.Group(); hat.name = 'hat'; head.group.add(hat); hat.visible = false;
  let hood: HoodCloth;
  /** how deep the hood's shade on the face (the forehead and the eyes; `Head.shade`) */
  const HOOD_SHADE = 0.78;
  /** how far the capelet lies off the coat's body at the least (m): over the harness's straps (their outer face 1.3-1.6
   *  cm off the coat; walking, their tops came through it behind at 1.8, and in front at 2 under the rim's foot drawn
   *  in round the collar), in front and crossing his back, bridging
   *  between them behind, over the crossing (two straps and the disc deep) and on the bare coat */
  const HOOD_OVER_COAT = 0.021, HOOD_OVER_BACK = 0.022, HOOD_OVER_BETWEEN = 0.016, HOOD_OVER_CROSSING = 0.026, HOOD_OVER_BARE = 0.008;
  /** how far from a strap's middle the capelet rides over it (m): its half width and a little more, and on out to the
   *  lift's foot; and how far round the crossing behind (held to the strap's edge alone, the cloth dropped onto it, and
   *  its top came 4 mm through the hood's front below the jaw: "cloth should not clip through hood") */
  const STRAP_HALF = 0.037, STRAP_FOOT = 0.022, CROSSING_HALF = 0.035;
  /** how far off the coat the capelet lies over the front of each shoulder (m), above the arm's collider, where the
   *  coat rises with the arm (raised with the staff, it came 2 mm out through the capelet there), and where (the chest's
   *  space, his left; how far round it that holds, then fading over `STRAP_FOOT`) */
  const HOOD_OVER_SHOULDER = 0.014, SHOULDER_FRONT = V(0.165, 0.255, 0.07), SHOULDER_HALF = 0.04;
  /** the distance from (x, y) to the segment from (ax, ay) to (bx, by) */
  const toSegment = (x: number, y: number, ax: number, ay: number, bx: number, by: number) => {
    const dx = bx - ax, dy = by - ay, t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
    return Math.hypot(x - ax - dx * t, y - ay - dy * t);
  };
  /** how far off the coat the capelet lies at `p` (the chest's space): over the harness's straps (as lines across the
   *  coat, as `harness` lays them: down his front from each shoulder, crossed behind, and the disc where they cross),
   *  across between them behind, above where they cross (the cloth bridging them: let down onto the coat between them,
   *  it lay in two lobes), over the front of each shoulder, and on the bare coat elsewhere */
  const capeletLift = (p: THREE.Vector3) => {
    let d = Infinity;
    for (const s of [1, -1]) {
      // (in front from the top of the shoulder, where it turns back over it, down to the waist)
      d = Math.min(d, p.z >= 0 ? toSegment(p.x, p.y, s * 0.085, 0.272, s * 0.1, -0.1) : toSegment(p.x, p.y, s * 0.1, 0.255, -s * 0.11, -0.11));
    }
    const over = lerp(HOOD_OVER_COAT, HOOD_OVER_BACK, smooth(clamp(-p.z / 0.08, 0, 1)));
    const straps = lerp(over, HOOD_OVER_BARE, smooth(clamp((d - STRAP_HALF) / STRAP_FOOT, 0, 1)));
    const shoulder = Math.hypot(Math.abs(p.x) - SHOULDER_FRONT.x, p.y - SHOULDER_FRONT.y, p.z - SHOULDER_FRONT.z);
    const raised = lerp(HOOD_OVER_SHOULDER, HOOD_OVER_BARE, smooth(clamp((shoulder - SHOULDER_HALF) / STRAP_FOOT, 0, 1)));
    if (p.z >= 0) return Math.max(straps, raised);
    // (the crossed straps' way out from the middle at this height, and the disc where they cross)
    const apart = 0.1 - (0.255 - p.y) * (0.21 / 0.365), crossing = Math.hypot(p.x, p.y - 0.13);
    const between = Math.abs(p.x) < apart ? HOOD_OVER_BETWEEN : HOOD_OVER_BARE;
    return Math.max(straps, between, lerp(HOOD_OVER_CROSSING, HOOD_OVER_BARE, smooth(clamp((crossing - CROSSING_HALF) / STRAP_FOOT, 0, 1))));
  };
  yield;
  // (lined in its own wool, as the reference's: turned back at the rim a finger wide and lit there, a deep red further
  // in. In the shirt's charcoal, opened wide round the face, it read as a grey hole in the studio and a flat black one
  // in the forest; in a dark brownish red, a grey void)
  const hoodLining = kit.rim({ color: 0x681c22, roughness: 1, ...tex(woolMaps(), 1, 1.2), side: THREE.BackSide, vertexColors: true }, 0x6a2228, 0.05);
  {
    // as the owner's reference has it (`.tmp/references/hood/chatgpt`): two panels sewn over the top of the head and down
    // the back, the hair hidden under it, close over the head with a soft point over the crown, its rim at the hairline
    // and down round the face a few centimetres off it, opening wide past the jaw onto the collar, its sides
    // falling onto the shoulders, and on below them into a capelet over the collar, the shoulders and the upper back
    // (`HoodCloth`). Laid as it's worn (`shape`), along lines set round the face at the reference's outline and sizes
    // (`lab hood`), and held there: the hood rides the head, the cloth below lies on the body. (Cut deep and wide, as
    // Codex's first reference had it, `.tmp/references/hood/mage`, it read as a sack: "our hood is terrible". Shaped by
    // hand as offsets over the head it read as a helmet, a superhero's mask, a sack, then a chimney; cut flat as a
    // tailor cuts one and settled by its weight, it drifted from where it was laid as no tuning converged on)
    const nu = lod(28, 16), nv = lod(16, 10), neckRow = Math.round(nv * 0.62), NECK = neckRow / nv, half = nu / 2;
    const mid = toGroup(0, 40, -25), u01 = (x: number) => clamp(x, 0, 1), V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    // a place by the face, in its unit `E` (the eye line to the chin) from the eyes: across, up, and ahead of the
    // eyeballs' middles, as `lab hood` reads the reference's outline (the head under it, there: its scalp 1.0 up, its
    // brow 0.33 ahead, its skull's back 1.64 behind, 0.5-0.66 wide either side)
    const eyes = toGroup(0, EYE.y, EYE.z), E = eyes.y - toGroup(0, 0, 0).y;
    const inE = (x: number, up: number, ahead: number) => V3(x * E, eyes.y + up * E, eyes.z + ahead * E);
    // a place on the coat (the chest's space, as the rig stands at rest) in the head's
    hat.updateWorldMatrix(true, false);
    j.chest.updateWorldMatrix(true, false);
    const chestToHead = new THREE.Matrix4().copy(hat.matrixWorld).invert().multiply(j.chest.matrixWorld);
    const chestAt = (x: number, y: number, z: number) => V3(x, y, z).applyMatrix4(chestToHead);
    // where it meets the capelet, round the neck on the shoulders' tops (a centimetre or two over the coat): at the
    // collar's sides in front, over the shoulders, standing off the nape behind, where its slack gathers in a roll on
    // the capelet (laid a centimetre off the nape, it was pulled in to the neck where the reference's hangs loose)
    const ring = [chestAt(0.088, 0.262, 0.102), chestAt(0.205, 0.255, 0.065), chestAt(0.235, 0.25, 0), chestAt(0.16, 0.24, -0.095),
      chestAt(0, 0.288, -0.123)];
    // the hood's lines down from its top seam to the ring: its rim, its front quarter, its side (where it's widest, as the
    // front sees it), its back quarter and the seam down the back; the top seam their tops, from the rim's top at the
    // hairline up over the head to the soft point over the crown and down behind it, as the reference's profile has it.
    // Its rim as the reference's piping runs (`lab hood`'s opening): its top corner over the brow, as low and as far
    // ahead of it as the reference's (laid higher, it jutted from the side as a beak), then out and back nearly level
    // to the temples, 2-4 cm off the face past the temples and the cheekbones, widest at the jaw, and in under the chin to the
    // collar's sides, closing round the throat; from the side as far behind the face it frames as the reference's is
    // behind its own (laid where the reference's runs from the eyes, it stood out over his flatter brow, a visor: "do
    // you see hood overhang in our case?"; laid a centimetre off the face, it was a tunnel; open under the chin, a
    // funnel). Its sides as the reference's outline: narrow at the point, a little outside the head over it, falling
    // wider to the jaw and in a little at the chin before the shoulders; roomy behind the head, its slack hanging lowest
    // at the nape ("do you see bagginess in the ref? where is ours?": pulled in to the neck, it read as a shell)
    const hoodLines = [
      [inE(0, 0.68, 0.52), inE(0.3, 0.6, 0.24), inE(0.51, 0.4, 0.01), inE(0.7, 0.2, -0.15), inE(0.865, 0, -0.31),
        inE(1, -0.2, -0.44), inE(1.15, -0.4, -0.53), inE(1.27, -0.6, -0.58), inE(1.27, -0.8, -0.58), inE(1.08, -1, -0.47),
        inE(0.86, -1.2, -0.32), inE(0.7, -1.45, -0.14), ring[0]],
      [inE(0, 1.06, -0.04), inE(0.33, 0.98, -0.18), inE(0.6, 0.76, -0.32), inE(0.8, 0.42, -0.42), inE(0.97, 0.02, -0.52),
        inE(1.18, -0.4, -0.66), inE(1.27, -0.72, -0.7), inE(1.12, -1.02, -0.64), inE(1.04, -1.32, -0.52), ring[1]],
      [inE(0, 1.27, -0.68), inE(0.22, 1.16, -0.68), inE(0.55, 0.96, -0.72), inE(0.68, 0.78, -0.74), inE(0.85, 0.4, -0.76),
        inE(1.02, 0, -0.78), inE(1.17, -0.4, -0.8), inE(1.21, -0.7, -0.82), inE(1.04, -1, -0.8), ring[2]],
      [inE(0, 1.16, -1.12), inE(0.35, 1, -1.27), inE(0.58, 0.75, -1.43), inE(0.72, 0.4, -1.58), inE(0.8, 0, -1.65),
        inE(0.87, -0.4, -1.7), inE(0.91, -0.75, -1.8), inE(0.9, -1.05, -1.85), ring[3]],
      [inE(0, 1.12, -1.25), inE(0, 0.8, -1.5), inE(0, 0.4, -1.76), inE(0, 0, -1.87), inE(0, -0.4, -1.92), inE(0, -0.8, -1.95),
        inE(0, -1.05, -1.92), ring[4]],
    ];
    // the capelet's, from the ring to its hem over the coat (its measured profile, the chest's space): a short mantle over
    // the shoulders, its front edge down from the collar's side to the hem's corner over the chest, its front quarter,
    // over the shoulder and down the deltoid, its back quarter, and down the middle of the back to 16-18 cm below the
    // nape (the reference's notes), its hem rising from the shoulders to the collar's sides in front
    const capeLines = [
      [ring[0], chestAt(0.13, 0.205, 0.123), chestAt(0.145, 0.175, 0.121)],
      [ring[1], chestAt(0.195, 0.218, 0.085), chestAt(0.185, 0.195, 0.086)],
      [ring[2], chestAt(0.26, 0.223, 0), chestAt(0.28, 0.205, 0), chestAt(0.292, 0.19, 0)],
      [ring[3], chestAt(0.185, 0.222, -0.1), chestAt(0.185, 0.195, -0.106)],
      [ring[4], chestAt(0, 0.21, -0.142), chestAt(0, 0.13, -0.166)],
    ];
    // each row through its five lines at its share of the way down them, from the rim (or the capelet's front edge) to
    // the seam behind, where it runs on into its mirror (its top seam on into the seam down the back)
    const reflect = (a: THREE.Vector3, b: THREE.Vector3) => a.clone().multiplyScalar(2).sub(b), LINE = 128;
    // (the rim's top round, its halves meeting level over the brow, as the reference's arch: run on straight past its top,
    // the arch came to a point)
    const roundTop = (line: THREE.Vector3[]) => V3(-line[1].x, line[1].y, line[1].z);
    const alongLines = (lines: THREE.Vector3[][], round = -1) => lines.map((line, k) => evenly(line, k === round ? roundTop(line) : reflect(line[0], line[1]), reflect(line[line.length - 1], line[line.length - 2]), LINE));
    const hoodAlong = alongLines(hoodLines, 0), capeAlong = alongLines(capeLines);
    const rows: THREE.Vector3[][] = [];
    for (let r = 0; r <= nv; r++) {
      const onHood = r <= neckRow, t = onHood ? r / neckRow : (r - neckRow) / (nv - neckRow);
      const at = (onHood ? hoodAlong : capeAlong).map((line) => line[Math.round(t * LINE)]);
      const post = r === 0 ? reflect(at[4], at[3]) : V3(-at[3].x, at[3].y, at[3].z);
      rows.push(evenly(at, reflect(at[0], at[1]), post, half));
    }
    const shape = (u: number, v: number, out: THREE.Vector3): THREE.Vector3 => {
      const left = u <= 0.5;
      out.copy(rows[Math.round(v * nv)][Math.round((left ? u : 1 - u) * nu)]);
      if (!left) out.x = -out.x;
      return out;
    };
    // its creases (m out along the cloth), after the references: soft shallow folds gathered round the nape where it
    // turns from the head onto the shoulders (two, round tops and soft valleys, the lower fuller, wavering a little,
    // fading round the sides of the neck, a few millimetres deep as the owner's reference's: two a centimetre deep read
    // as one thick roll, and the seam's piping, dipping into their valleys, jogged aside seen from above; squeezed into
    // two of the drawn rows, they read as a crack; 3 cm deep, as the first reference's, a sack's); faint long folds down
    // its sides from the temples back towards them; and the capelet's soft folds over the shoulders, fuller towards its
    // hem. All fade out at the face's edge. (Folds running straight down the hood, as ribs, read as a plane at right
    // angles to the references')
    const GATHER = 0.17, ROLLS = 2, ROLL_DEEP = 0.004;
    /** how wide the band of its wool turned back inside the rim is (a share of a row, from rim to rim: 1.4 cm) */
    const FACING = 0.025;
    const crease = (u: number, v: number) => {
      const side = Math.min(u, 1 - u), edge = smooth(u01(side / 0.08)), t = (v - NECK + GATHER) / GATHER;
      const wrap = smooth(u01((side - 0.16) / 0.2)), waver = 0.25 * Math.sin(u * TAU * 4);
      const gathers = t > 0 && t < 1 ? Math.abs(Math.sin(t * Math.PI * ROLLS + waver)) ** 0.8 * (0.7 + 0.3 * t) * wrap * ROLL_DEEP : 0;
      const sides = smooth(u01((v - 0.12) / 0.15)) * (1 - smooth(u01(t * 2.5))) * smooth(u01((side - 0.06) / 0.06)) * (1 - smooth(u01((side - 0.4) / 0.06)));
      // (heavier where the hood falls past the jaw to the shoulders, its weight hanging in them: a few millimetres all
      // the way down, the cloth read as a moulded shell)
      const heavy = 0.4 + 0.6 * smooth(u01((v - 0.3) / 0.25));
      const folds = sides * (Math.cos((side - 0.5 * v) * TAU * 7) * 0.5 + 0.5) ** 1.5 * 0.008 * heavy;
      // (the capelet's bunching out alone: their valleys in, they sank it onto the straps crossing his back)
      const capelet = v > NECK ? (0.5 + 0.5 * Math.cos(side * TAU * 7)) * 0.006 * smooth(u01((v - NECK) / (1 - NECK))) : 0;
      // (the seam down the back a groove between two welts once: the gold piping lies along it now. Its groove faded out
      // at its top, where the top seam turns back on itself and the normal has no way across: laid along it there, it
      // jerked 2 cm at idle)
      return edge * (gathers + folds + capelet);
    };
    // drawn twice as finely as its particles, and finer still where its creases are: across the seam down the back (an
    // even count of spaces, so a column runs down the seam itself, as its piping does), and down the gathers at the
    // nape, at least seven rows a roll (in two or three each they read as a crack); and down from its top seam, where the face's
    // arch turns round over the brow (in two or three rows it read as a point)
    const band = (x: number, from: number, to: number, ease: number) => smooth(u01((x - from + ease) / ease)) * (1 - smooth(u01((x - to) / ease)));
    const drawn = {
      across: spaced(nu * 2 + 6, (u) => 1 + 5 * Math.exp(-(((u - 0.5) / 0.015) ** 2))),
      down: spaced(nv * 2 + 16, (v) => 1 + 3.5 * band(v, NECK - GATHER, NECK, 0.03) + 3 * (1 - smooth(u01(v / 0.08)))),
    };
    // (the hood above the jaw riding the head wholly; below it, down to the ring, held less and less and carried by the
    // chest at the ring, its rim held more firmly, a hem; the capelet follows the shoulders while still yielding to them)
    const RIDE = 0.6;
    const below = (v: number) => Math.max(0, (v / NECK - RIDE) / (1 - RIDE));
    const hold = (u: number, v: number) => {
      if (v > NECK) return 0.3;
      if (v / NECK <= RIDE) return 1;
      const edge = Math.max(0, 1 - Math.min(u, 1 - u) / 0.04);
      return Math.max(lerp(0.45, 0.3, below(v)), edge * 0.5);
    };
    const share = (_u: number, v: number) => (v > NECK ? 1 : below(v));
    hood = new HoodCloth({
      // (the outside on both sides: where it folds over, wool)
      joint: hat, shape, body: { joint: j.chest, share }, capelet: NECK, nu, nv, hold, outer: coatD, lining: hoodLining, thick: 0.004,
      // (light reaches its lining through the opening alone: lit along the band turned back at the rim, darker a little
      // way in and under the capelet, the reference's shadow; lit evenly, it read as a pale grey hole round the face)
      shade: (u, v) => (v > NECK ? 0.5 : lerp(1, 0.4, smooth(u01((Math.min(u, 1 - u) - FACING) / 0.12)))),
      // (gold piping round the face and the capelet's hem, as the coat's collar is edged, along the front of the edge
      // rolled in on itself as the reference's, a roll of its wool a centimetre thick; and down the seam behind in two
      // cords, as the reference's)
      piping: { material: piping, radius: 0.003, from: 0, seam: true, apart: 0.007, roll: { material: coatD, radius: 0.005 } },
      drawn, crease, clear: 0.004,
      bodies: [
        // (the skull and the neck, for the cloth below the jaw)
        { joint: hat, y0: mid.y + 0.11, y1: mid.y, rx: 0.095, rz: 0.11, z: mid.z },
        { joint: j.neck, y0: 0.08, y1: -0.02, rx: 0.07, rz: 0.07 },
        // the coat under it: its standing collar, the surface its body is cut from (`outOfTunic`, the chest's space: its
        // shoulders' slope, its chest and its back) out over the harness's straps where they run, and the upper arms
        // (raised, they lift the cloth: at the shoulder as deep as the coat over it, 8 cm in front of the arm, where
        // raised with the staff it came 2 mm out through the capelet; down the arm fuller than the arm behind, as the
        // cloth lags it swinging back: the arm's own size, the sleeve came through the capelet as he walked; closer in
        // front, where as full it held the capelet off his shoulders).
        // (Ellipsoids fitted to its shoulders and its torso by hand held the capelet 2-5 cm over the shoulders' slope and
        // off the back: `lab hood`)
        { joint: j.chest, y0: 0.365, y1: 0.3, rx: 0.098, rz: 0.098, ry: 0.015 },
        { joint: j.chest, out: (p, clear) => outOfTunic(p, capeletLift(p) + clear) },
        ...[j.shoulderL, j.shoulderR].flatMap((joint) => [
          { joint, y0: 0.035, y1: 0, rx: 0.075, rz: 0.086, ry: 0.03 },
          { joint, y0: 0, y1: -0.14, rx: 0.075, rz: 0.086, ry: 0.045, z: -0.006 },
        ]),
      ],
    });
  }

  yield;
  // --- staff (right hand): a thick gnarled haft bound in engraved gold, its head two gold prongs curving up round a
  // floating crystal
  // turned in the fist so it stands up out of the forward-reaching forearm, the orb up and ahead.
  // Held GRIP up the haft from its foot (less its length below the hand): standing, its foot comes down to the floor
  // beside his right foot and the crystal rides over his head, as the sheet's (gripped higher, its foot stood 25 cm into
  // the floor); aimed, the crystal is level with a foe's chest, so the bolts fly at the foes, not over them.
  const staff = joint(j.handR, 0, -0.05, 0.02);
  const STAFF_PITCH = 1.25, STAFF_R = 0.026;
  staff.rotation.x = STAFF_PITCH;
  const GRIP = 0.44;
  {
    const w = new Sculpt(), pts: THREE.Vector3[] = [];
    // (the haft wandering a little and knotted along its length, its grain twisted round it)
    for (let k = 0; k <= 20; k++) { const y = -0.52 - GRIP + k * 0.088; pts.push(V(Math.sin(k * 0.9) * 0.003, y, Math.cos(k * 1.3) * 0.003)); }
    const knots = (t: number) => 1 + 0.1 * Math.sin(t * 46) + 0.12 * Math.exp(-(((t - 0.33) / 0.02) ** 2)) + 0.14 * Math.exp(-(((t - 0.71) / 0.025) ** 2));
    const haft = taperTube(pts, (t) => 0.033 * (1 - t * 0.15) * knots(t), lod(80, 30), lod(12, 8)), hq = haft.attributes.position;
    for (let i = 0; i < hq.count; i++) {
      const x = hq.getX(i), y = hq.getY(i), z = hq.getZ(i), a = Math.atan2(x, z);
      const k = 1 + 0.06 * Math.sin(a * 5 + y * 9) + 0.03 * Math.sin(a * 9 - y * 23);
      hq.setXYZ(i, x * k, y, z * k);
    }
    haft.computeVertexNormals();
    w.add(scaleUV(haft, 2, 8), wood, staff);
    // engraved gold bands, a pair at the hand and singles along it, a gold ferrule at the foot
    for (const y of [-0.47, 0.02, 0.1, 0.62, 0.96, 1.02]) {
      const ring = lathe([[0.036, -0.022], [0.04, -0.016], [0.04, 0.016], [0.036, 0.022]], lod(20, 12));
      projectUV(ring, steelRegion('chest'), (x, y, z) => [Math.atan2(x, z) / TAU + 0.5, 0.4 + (y + 0.022) / 0.044 * 0.2]);
      w.add(ring, goldE, staff, [0, y - GRIP, 0]);
    }
    w.add(lathe([[0.004, -0.13], [0.026, -0.1], [0.035, -0.03], [0.036, 0]], 12), gold, staff, [0, -0.52 - GRIP, 0]);
    // the head: a gold collar, then two prongs rising out of it, bowed out round the crystal and in again over it, the
    // one's tip curling past the other's (the sheet's; three thin curls read as wire)
    w.add(lathe([[0.034, 0], [0.046, 0.02], [0.042, 0.05], [0.03, 0.07]], 16), gold, staff, [0, 1.06 - GRIP, 0]);
    for (const p of [1, -1]) {
      const prong: THREE.Vector3[] = [];
      for (let q = 0; q <= 14; q++) {
        const t = q / 14, out = Math.sin(t * Math.PI) ** 0.85 * 0.1 + 0.018 * (1 - t) ** 2;
        prong.push(V(p * out, 1.11 - GRIP + t * 0.42, 0.012 * Math.sin(t * Math.PI) * p));
      }
      w.add(taperTube(prong, (t) => 0.028 * (1 - t * 0.8), 28, 10), gold, staff);
    }
    w.build();
  }
  const tip = joint(staff, 0, 1.36 - GRIP, 0);
  const crystal = part(new THREE.OctahedronGeometry(0.095, 0).scale(0.75, 1.6, 0.75), gem, tip);
  crystal.castShadow = false;
  const ringA = part(new THREE.TorusGeometry(0.14, 0.004, 4, 32), glow, tip);
  const ringB = part(new THREE.TorusGeometry(0.11, 0.004, 4, 32), glow, tip);
  ringA.castShadow = ringB.castShadow = false;

  yield;
  // offhand focus point (left palm)
  const palm = joint(j.handL, 0, -0.08, 0.03);
  S.build();
  const robeParts = A.build(), tunic = T.build(), bracers = H.build();
  yield;
  // (robed until setGear says otherwise)
  let robed = true, gloved = true;
  // (a staff in his right hand until setGear says there's none: both hands free then, #402)
  let armed = true;
  for (const o of [...tunic, tunicSkirt]) o.visible = false;
  yield;
  // each item's parts glowing in its rarity's colour (itemGlow.ts): the staff, the book at his hip (the off-hand's),
  // the hood, the longcoat, the bracers and gloves (the hands' own copies kept)
  const glows = new ItemGlows(kit.mats)
    .add('weapon', [staff])
    .add('offhand', [book])
    .add('head', [hat])
    .add('chest', [...robeParts, ...skirts, ...flaps.map((f) => f.g)])
    .add('hands', bracers)
    .add('hands', [handL.glove, handR.glove], { inPlace: true });

  /** set once a channel's opening completes, for the thrust into the portal */
  let openedAt = -1;
  /** the free arm as drawing the portal last left it (its shoulder, elbow and wrist), and whether this channel drew
   *  one: the thrust is eased in from it (`THRUST_TIME`) */
  const gathered = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];
  let wasGathered = false;
  /** how far the staff is slid up through the fist, and how far it's wanted */
  let staffSlide = 0, staffSlideWant = 0;
  /** staff shots: how far the staff is lowered at the target (0..1), and when the last shot was */
  let aim = 0, aimV = 0, aimedAt = -9;
  /** how long after a shot the staff stays down */
  const AIM_HOLD = 1.2;
  /** seen through its own eyes (entities/viewModel.ts); per gesture, how far the free hand moves (chest
   *  space: x left, y up, z forward) as the gesture plays */
  let fp = false;
  /** the staff arm through the eyes: added to its shoulder (pitch, roll, yaw), and pitch undone while casting */
  const FP_STAFF = [0.1, -0.3, -0.2, 0.6];
  const FP_POSE: Record<string, number[]> = { cast: [-0.2, 0.35, 0.12], summon: [-0.2, 0.35, 0.12], channel: [0.5, 0.12, -0.1], buff: [-0.25, 0.05, 0.15] };
  /** through the eyes, the free hand turned about its forearm as it holds Void Lance (rad: thumb up) */
  const FP_HAND_TURN = 0.9;
  /** where the free arm's elbow points when it reaches (out to the left, down and back) */
  const POLE_L = V(1, -0.7, -0.6), POLE_R = V(-1, -0.7, -0.6);
  /** the lance from both hands (no staff): how far out the hands are held, as a share of the arm's length; how far
   *  each is from the lance's line (m, rig units); how far under the shoulders, as seen and through the eyes; and
   *  how far the trunk leans in behind them (rad) */
  // (hands before the breastbone, elbows down by the ribs: 7 cm under the shoulders with the elbows out to the
  // sides, they were at his throat with the arms winged out, a second review's "chicken wing"; through the eyes
  // high enough that the wrists stay in the view)
  // (a fourth review: at 6.5 cm from the line the hands read as one clump, at a wrist bent back 1 rad as pushing a
  // wall, and the head bowed with the trunk, looking at the ground: the hands a gap apart, the wrists eased, the chin
  // lifted back by most of the lean)
  const BOTH = { reach: 0.86, apart: 0.11, eyesApart: 0.085, drop: -0.27, eyesDrop: -0.14, lean: 0.3, wrist: -0.75, chin: 0.75 };
  /** where the elbows point with both hands on the lance: down and a little out and back */
  const POLE_BOTH_L = V(0.45, -1, -0.5), POLE_BOTH_R = V(-0.45, -1, -0.5);
  const _across = V(0, 0, 0);
  /** the lance cast with no staff: from the right hand this frame (the pose is mirrored), and the hands it was
   *  last cast from (a change of hands eases across) */
  let mirrored = false, lanceHands = '';
  const _ql = new THREE.Quaternion(), _qr = new THREE.Quaternion();
  /** The arms' and hands' poses changed over, each mirrored across his middle (a turn about x kept, about y and z
   *  reversed), and the trunk's and head's turns with them: a cast posed for the left hand made the right's. The
   *  fingers are the hands' own: posed for the hand that casts by `castHand`. */
  const mirrorCast = (): void => {
    for (const [left, right] of [[j.shoulderL, j.shoulderR], [j.elbowL, j.elbowR], [j.handL, j.handR]] as const) {
      _ql.copy(left.quaternion); _qr.copy(right.quaternion);
      left.quaternion.set(_qr.x, -_qr.y, -_qr.z, _qr.w);
      right.quaternion.set(_ql.x, -_ql.y, -_ql.z, _ql.w);
    }
    for (const turned of [j.chest, j.hips, j.neck, j.spine]) { turned.rotation.y = -turned.rotation.y; turned.rotation.z = -turned.rotation.z; }
    j.body.position.x = -j.body.position.x;
  };
  /** Both hands held before the chest, `reach` of the arm's length out, either side of the lance's line. */
  const bothHands = (reach: number): void => {
    root.updateMatrixWorld(true);
    root.getWorldDirection(_fw).applyQuaternion(j.chest.getWorldQuaternion(_vr).invert());
    _across.subVectors(j.shoulderL.position, j.shoulderR.position).normalize();
    for (const side of [1, -1]) {
      _hp.addVectors(j.shoulderL.position, j.shoulderR.position).multiplyScalar(0.5)
        .addScaledVector(_fw, (j.P.upperL + j.P.foreL) * reach).addScaledVector(_across, side * (fp ? BOTH.eyesApart : BOTH.apart));
      _hp.y += fp ? BOTH.eyesDrop : BOTH.drop;
      if (side > 0) reachArm(j.shoulderL, j.elbowL, j.P.upperL, j.P.foreL, _hp, POLE_BOTH_L);
      // (both arms' lengths are `upperL` and `foreL`, L for length: `upperR` and `foreR` are their radii, and
      // reached with those the right elbow stood locked straight)
      else reachArm(j.shoulderR, j.elbowR, j.P.upperL, j.P.foreL, _hp, POLE_BOTH_R);
    }
  };
  /** the crystal's casting glow, eased: a held stream of casts keeps it up instead of flashing each one */
  let charged = 0;

  const root = j.root;
  root.scale.setScalar(1.08);

  const shY = j.shoulderL.position.y;
  yield;
  // the healing draught, in the free fist while it is drunk
  const flask = buildFlask(kit); flask.name = 'flask'; j.handL.add(flask);
  let flaskOut = 0;
  let feet: readonly number[] | null = null;

  function animate(st: AnimState): void {
    const { t, dt } = st;
    resetPose(j);
    const move = st.move;
    const dir = st.moveDir ?? 1;

    // base stance: staff held at the side, slightly forward
    idle(j, t, 1 - move * 0.6);
    // at rest: the weight on one leg, the other easy (the hips tipping and the shoulders answering them),
    // shifting slowly from foot to foot, leaning a little on the staff; the free arm hangs and the head wanders
    if (!fp) {
      const amt = 1 - Math.min(1, move * 2), sway = Math.sin(t * 0.45) + 0.3 * Math.sin(t * 1.07 + 2), br = Math.sin(t * 1.8);
      j.body.position.x += 0.025 * sway * amt; j.hips.rotation.z += 0.055 * sway * amt; j.spine.rotation.z += -0.035 * sway * amt - 0.03 * amt; j.neck.rotation.z += -0.025 * sway * amt;
      j.hips.rotation.y += -0.12 * amt; j.chest.rotation.y += 0.08 * amt;
      j.neck.rotation.y += 0.12 * Math.sin(t * 0.31) * amt; j.neck.rotation.x += 0.04 * Math.sin(t * 0.53 + 1) * amt;
      // (the free arm hanging at his side as the warrior's and the ranger's do, drifting a little: held out before him with
      // the elbow bent, it read as a pose struck)
      j.shoulderL.rotation.x += 0.03 * Math.sin(t * 0.6) * amt;
      j.shoulderL.position.y = j.shoulderR.position.y = shY + 0.006 * br * amt;
    }
    // (the free arm pumps at a run as a runner's does; the staff arm carries the staff, swinging less than at a walk: pumped,
    // the staff swung from upright to level behind him at every stride)
    // (its elbow held as it comes forward: bent more there, as a walk's is, it cancelled the shoulder's swing and the staff
    // bobbed 25 cm up and down at each stride)
    const staffSwing = 0.35 * (1 - 0.45 * runShareOf(move)), staffElbow = 1 - runShareOf(move);
    // (with no staff both arms swing and pump as the free one does)
    walkCycle(j, st.phase, move, { stride: 0.5, knee: 0.95, arm: armed ? staffSwing : 0.35, armL: 0.35, bob: 0.07, dir, run: true, pump: armed ? 0 : 1, pumpL: 1, elbowSwing: armed ? staffElbow : 1, elbowSwingL: 1 });
    // (and at a run bent further, the staff carried higher: hanging as at a walk, its foot met the ground behind him at
    // the back of each swing)
    const staffRun = fp ? 0 : runShareOf(move);
    if (armed) { j.shoulderR.rotation.x += -0.35 - 0.1 * staffRun; j.shoulderR.rotation.z += -0.12; j.elbowR.rotation.x += -0.55 - 0.45 * staffRun; }
    // (the trunk a little forward over the stride, the head held up against it: the leg IK leans the whole body into the
    // speed, and at 0.12 more the trunk leant 16 degrees at a run, a runner's 11, the face to the ground)
    j.spine.rotation.x += move * 0.06 * dir; j.neck.rotation.x -= move * 0.06 * dir;
    j.body.rotation.z += (st.lean || 0) * 0.12;

    // hands at rest: the free one loosely curled and breathing, the other gripping the staff
    poseHand(handL, 0.45 + Math.sin(t * 1.3) * 0.06, 0.12);
    if (!armed) poseHand(handR, 0.45 + Math.sin(t * 1.3 + 1.7) * 0.06, 0.12);
    // (through the eyes a share of it: at its full strength the fingertips, seen edge on, lit up as lamps)
    handGlow.copy(HAND_GLOW.color).multiplyScalar((fp ? HAND_GLOW.eyes : 1) * (1 + HAND_GLOW.breathe * Math.sin(t * HAND_GLOW.rate)));
    // (through the eyes the hand fills the view's corner, and its glow over all of it washed the glove's leather to one
    // flat mint, #425: there the outline alone)
    handBody.copy(handGlow).multiplyScalar(fp ? 0 : HAND_GLOW.body);
    if (armed) { handGlowR.setScalar(0); handBodyR.setScalar(0); } else { handGlowR.copy(handGlow); handBodyR.copy(handBody); }
    const raw = st.action;
    feet = null;
    let flaskWant = 0, drinkLift = 0;
    // (the tail: the last spell's end pose held a moment after it, unless the body moves off or another action starts)
    if (!raw && lastName !== '' && (TAIL[lastName] ?? 0) > 0 && !fp) { tailName = lastName; tailT = TAIL[lastName]; }
    if (raw || move > 0.3) { if (tailT > 0 && !raw) fade.cut(0.25); tailT = 0; }
    const inTail = !raw && tailT > 0;
    if (inTail) { tailT -= dt; if (tailT <= 0) fade.cut(TAIL_OUT[tailName] ?? 0.4); }
    const a: ActionState | null = raw ?? (inTail ? { name: tailName, t: 1 } : null);
    const began = !!raw && (raw.name !== lastName || raw.t < lastK - 0.2), ended = !raw && lastName !== '';
    if (began) fade.cut(raw.name === 'point' && lastName === 'point' ? 0.06 : 0.14); else if (ended && !inTail) fade.cut(lastName === 'point' ? 0.2 : 0.35);
    if (began && raw.name === 'point') recoil = 1;
    recoil = Math.max(0, recoil - dt * 6);
    lastName = raw?.name ?? ''; lastK = raw?.t ?? 1;
    if (!a || a.name !== 'channel') { openedAt = -1; wasGathered = false; }
    // staff shots: the staff swings down level with the target and stays there while the shots keep
    // coming (a held button, or clicks), so each bolt leaves the crystal at a foe's chest; it rises
    // once they stop for a while. A spring, so it starts and stops moving gently (an ease that starts
    // at full speed jerks the staff down at each first shot): quick to lower, slow to rise
    if (a?.name === 'point') aimedAt = t;
    const down = t - aimedAt < AIM_HOLD, w0 = down ? 14 : 5;
    aimV += (w0 * w0 * ((down ? 1 : 0) - aim) - 2 * w0 * aimV) * Math.min(dt, 0.05);
    aim = clamp(aim + aimV * Math.min(dt, 0.05), 0, 1);
    j.shoulderR.rotation.x += -0.3 * aim; j.elbowR.rotation.x += 0.15 * aim; j.spine.rotation.x += 0.12 * aim;
    // (the staff side turned to the foe, the weight forward behind it; each shot kicks the staff and the chest back)
    if (!fp) {
      const rc = recoil * recoil;
      j.hips.rotation.y += 0.18 * aim; j.chest.rotation.y += 0.22 * aim - 0.06 * rc; j.neck.rotation.y += -0.3 * aim;
      j.body.position.z += (0.03 * aim - 0.025 * rc) * (1 - move); j.spine.rotation.x += -0.07 * rc; j.shoulderR.rotation.x += -0.12 * rc;
      if (aim > 0.3) feet = AIM_FEET;
    }
    // (aimed straight along the shot: angled out to keep its haft out of the cape the heroes wore, it went 9 cm
    // through his own sleeve)
    // (braced for the lance it's slid through the fist at a pace, as last frame's pose asked, and back slower than
    // he rises)
    staffSlide = damp(staffSlide, staffSlideWant, staffSlideWant > staffSlide ? 10 : 3, dt); staffSlideWant = 0;
    staff.rotation.x = STAFF_PITCH + 1.75 * aim;
    // (the haft sits in the fist, the hand on its wrist)
    if (armed) seat(handR, staff, STAFF_R);
    if (a) {
      const k = a.t;
      if (a.name === 'cast' && !fp) {
        const w = ramp(k, 0, 0.2);
        j.shoulderL.rotation.x = lerp(j.shoulderL.rotation.x, curve(CA_ARM_X, k), w); j.shoulderL.rotation.z = lerp(j.shoulderL.rotation.z, curve(CA_ARM_Z, k), w);
        j.elbowL.rotation.x = lerp(j.elbowL.rotation.x, curve(CA_ELBOW, k), w);
        // the staff arm draws back against the throw
        j.shoulderR.rotation.x += (-0.25 * ramp(k, 0, 0.45) + 0.45 * ramp(k, 0.5, 0.65)) * w;
        const ch = curve(CA_CHEST, k), b = curve(CA_BEND, k);
        j.chest.rotation.y += ch * w; j.hips.rotation.y += curve(CA_HIPS, k) * w; j.neck.rotation.y -= 0.6 * ch * w;
        j.spine.rotation.x += b * w; j.neck.rotation.x -= 0.4 * b * w;
        j.body.position.z += curve(CA_FWD, k) * w * (1 - move * 0.6); j.body.position.y += -0.03 * ramp(k, 0.5, 0.65) * w;
        // the hand gathers into a claw, then flicks open as the spell leaves it
        const gather = pulse(k, 0, 0.55), release = ramp(k, 0.5, 0.62) * (1 - ramp(k, 0.85, 1) * 0.5);
        j.handL.rotation.x += -0.6 * gather - 0.9 * release;
        poseHand(handL, 0.35 + 0.6 * gather - 0.35 * release, 0.1 + 0.5 * release);
        feet = CAST_FEET;
      } else if (a.name === 'cast' || (a.name === 'summon' && fp)) {
        // (through the eyes: Starfall plays the cast's gesture, placed in the view)
        const w = pulse(k, 0, 1);
        j.shoulderR.rotation.x += -1.05 * w; j.elbowR.rotation.x += 0.45 * w;
        j.shoulderL.rotation.x += -1.2 * w; j.shoulderL.rotation.z += 0.25 * w; j.elbowL.rotation.x += -0.2 * w;
        j.chest.rotation.y += 0.35 * w; j.spine.rotation.x += 0.12 * w;
        // the hand gathers into a claw, then flicks open as the spell leaves it
        const gather = pulse(k, 0, 0.5), release = ramp(k, 0.4, 0.6) * (1 - ramp(k, 0.75, 1));
        j.handL.rotation.x += -0.5 * gather - 0.9 * release;
        poseHand(handL, 0.35 + 0.6 * gather - 0.35 * release, 0.1 + 0.5 * release);
      } else if (a.name === 'channel') {
        const open = a.open ?? 1, time = a.time ?? 0;
        const up = ramp(time, 0, 0.18);
        // (with no staff: from both hands, or from one as with a staff, the other arm free; the right hand's cast is
        // the left's posed here and mirrored once the pose is whole, `mirrorCast`)
        const both = !armed && a.hands === 'both';
        mirrored = !armed && a.hands === 'right';
        if (!armed && a.hands !== lanceHands) { if (lanceHands) fade.cut(0.18); lanceHands = a.hands ?? ''; }
        if (open < 1) {
          // drawing the portal: two fingers out, the hand traces the circle with its spark (one turn
          // by 0.7 of the opening), then draws back to gather for the thrust
          openedAt = -1;
          const trace = Math.min(1, open / 0.7), ang = trace * TAU, draw = 1 - ramp(open, 0.7, 0.85);
          const gather = ramp(open, 0.72, 1);
          j.shoulderL.rotation.x += (-1.2 - Math.cos(ang) * 0.3 * draw + 0.25 * gather) * up;
          j.shoulderL.rotation.z += (-Math.sin(ang) * 0.32 * draw - 0.12) * up;
          j.elbowL.rotation.x += (-0.35 - 0.7 * gather) * up;
          j.handL.rotation.x += (-0.4 + 0.3 * gather) * up;
          // (the fingers of the hand that casts: the right's when the pose is mirrored)
          poseHand(mirrored ? handR : handL, 0.15 + gather * 0.9, 0.05, draw * (1 - gather));
          // the free shoulder leads (a turn of the chest brings it forward)
          j.spine.rotation.x += 0.08 * up;
          j.neck.rotation.x += 0.1 * up;
          if (!both) {
            j.chest.rotation.y += -0.15 * up - 0.1 * gather;
            if (armed) { j.shoulderR.rotation.x += -0.5 * up; j.elbowR.rotation.x += -0.2 * up; }
            gathered[0].copy(j.shoulderL.quaternion); gathered[1].copy(j.elbowL.quaternion); gathered[2].copy(j.handL.quaternion);
            wasGathered = true;
          } else {
            // no staff: both hands before the chest from the start, as the thrust holds them, palms to the portal,
            // drawn back a little until it comes, the chest square and leaning in behind them. (One hand tracing
            // the ring as posed and the other raised beside it, the arms were at the height of his face and
            // straight out, a pose apart from the thrust's that snapped into it; through the eyes neither hand
            // was in the view. An adversarial review failed both.)
            j.handL.rotation.x = j.handR.rotation.x = BOTH.wrist * up;
            // (the hands as the thrust has them, turned thumb up through the eyes too: held another way until it
            // came, they changed shape as the lance burst out)
            if (fp) {
              j.handL.quaternion.premultiply(_vr.setFromAxisAngle(ALONG, FP_HAND_TURN));
              j.handR.quaternion.premultiply(_vr.setFromAxisAngle(ALONG, -FP_HAND_TURN));
            }
            strainHand(handL, 0.5, 0.15, t, 0.03); strainHand(handR, 0.5, 0.15, t + 0.37, 0.03);
            j.spine.rotation.x += BOTH.lean * up; j.neck.rotation.x += -BOTH.lean * BOTH.chin * up;
            if (!fp) { j.body.position.y += -0.04 * up; feet = LANCE_FEET; }
            // (through the eyes where the thrust holds them from the first: drawn back, they sank under the view)
            bothHands(BOTH.reach * (fp ? 1 : 0.86 + 0.1 * gather));
          }
        } else {
          // the thrust: palm driven into the portal, a recoil as the lance bursts out, then braced
          if (openedAt < 0) openedAt = time;
          const ft = time - openedAt, kick = Math.exp(-ft * 9) * ramp(ft, 0, 0.04), tr = Math.sin(t * 40) * 0.02;
          const sway = Math.sin(t * 2.3) * 0.04;
          j.shoulderL.rotation.x += -1.45 + tr + kick * 0.3 + sway * 0.5; j.shoulderL.rotation.z += -0.4 + sway * 0.4; j.elbowL.rotation.x += 0.05 - kick * 0.4;
          // the wrist bent back so the palm faces the portal, fingers splayed and straining against it, hooked as
          // it kicks (#425: spread straight and parallel, "this looks lame")
          j.handL.rotation.x += -1.25 + kick * 0.3;
          // (through the eyes the forearm turned thumb up a little, so the fingers' bend shows: seen square from behind,
          // they bend away from the eyes and read straight; turned about the forearm's length, as a forearm turns, the
          // wrist's bends kept: a turn of the hand after them bent the wrist 40 degrees sideways)
          if (fp && !both) j.handL.quaternion.premultiply(_vr.setFromAxisAngle(ALONG, FP_HAND_TURN));
          strainHand(mirrored ? handR : handL, 0.75, 0.3 + kick * 0.7, t, 0.04);
          if (!both) {
            if (fp && armed) { j.shoulderR.rotation.x += -0.9; j.elbowR.rotation.x += 0.2; }
            j.chest.rotation.y += -0.25;
          } else {
            // no staff: both palms driven into the portal, the chest square behind them
            j.shoulderR.rotation.x += -1.45 - tr + kick * 0.3 + sway * 0.5; j.shoulderR.rotation.z += 0.4 - sway * 0.4; j.elbowR.rotation.x += 0.05 - kick * 0.4;
            // (both wrists bent back less than the one hand's, the fingers spread and hooked less: at its strain two
            // hands read as claws)
            j.handL.rotation.x = j.handR.rotation.x = BOTH.wrist + kick * 0.2;
            if (fp) {
              j.handL.quaternion.premultiply(_vr.setFromAxisAngle(ALONG, FP_HAND_TURN));
              j.handR.quaternion.premultiply(_vr.setFromAxisAngle(ALONG, -FP_HAND_TURN));
            }
            strainHand(handL, 0.5, 0.15 + kick * 0.5, t, 0.03); strainHand(handR, 0.5, 0.15 + kick * 0.5, t + 0.37, 0.03);
          }
          j.spine.rotation.x += 0.15 - kick * 0.12;
          j.body.position.z += -kick * 0.05;
          // (braced as a man pushing against a weight: a long stride, the left foot and shoulder forward, sunk at
          // the knees, the weight leaning into the portal; the staff drawn back by the rear hip, its arm bent, out
          // of the cast's way, upright on the ground beside him; the head turned back over the leading shoulder to look down the arm. Upright on a
          // short stride, the staff held straight out beside the casting arm, a review read "a scarecrow". With no
          // staff the same stride and sink, the chest left square behind both hands and the head straight)
          if (!fp) {
            // (sunk into over a third of a second, from where drawing the portal left him: taken at once as the
            // dial closed, the staff's hand went 40 cm in a frame, the staff from upright to leaning; from play,
            // "a noticeable jump from vertical to leaning")
            const b0 = ramp(ft, 0, BRACE_TIME), b = b0 * b0 * (3 - 2 * b0);
            j.body.position.z += 0.13 * b; j.body.position.y += -0.1 * b; feet = mirrored ? LANCE_FEET_R : LANCE_FEET;
            if (!both) {
              j.hips.rotation.y += -0.3 * b; j.spine.rotation.x += 0.12 * b;
              j.chest.rotation.y += -0.3 * b;
              j.neck.rotation.y += 0.7 * b; j.neck.rotation.x += lerp(0.1, -0.05, b);
              // (the staff's arm drawn back with it; with none, the other arm left to hang)
              if (armed) {
                j.shoulderR.rotation.x += lerp(-0.5, 0.35, b); j.elbowR.rotation.x += lerp(-0.2, -0.95, b);
                staffSlideWant = LANCE_SLIDE * b;
              }
            } else {
              j.hips.rotation.y += -0.06 * b; j.spine.rotation.x += 0.06 * b;
            }
          }
          // (the arm straight out from its shoulder along the way he casts, square to the portal his fingers feed,
          // drawn back a little by the kick: swung in across the chest, to a portal that stood before his middle,
          // it met the dial at a slant; from play: "arm not perpendicular to dial, it should be, otherwise makes no
          // sense")
          if (!fp) {
            root.updateMatrixWorld(true);
            // (nearly its whole length: at 0.93 of it the elbow bent 61 degrees and stood 14 cm out to the side)
            const reach = (j.P.upperL + j.P.foreL) * (0.985 - kick * 0.1);
            // (the way he casts in the chest's own frame, the reach in its own units: laid out in the world's
            // metres, the model's scale left the arm 8% short of the reach asked, the elbow still bent 48 degrees)
            root.getWorldDirection(_fw).applyQuaternion(j.chest.getWorldQuaternion(_vr).invert());
            if (!both) reachArm(j.shoulderL, j.elbowL, j.P.upperL, j.P.foreL, _hp.copy(j.shoulderL.position).addScaledVector(_fw, reach), POLE_L);
          }
          // (the thrust eased in from the arm as it was gathered: none for a channel met already open, a partner's)
          if (wasGathered && !both && ft < THRUST_TIME) {
            const th0 = ft / THRUST_TIME, th = th0 * th0 * (3 - 2 * th0);
            j.shoulderL.quaternion.copy(_vr.copy(gathered[0]).slerp(j.shoulderL.quaternion, th));
            j.elbowL.quaternion.copy(_vr.copy(gathered[1]).slerp(j.elbowL.quaternion, th));
            j.handL.quaternion.copy(_vr.copy(gathered[2]).slerp(j.handL.quaternion, th));
          }
          // no staff: the two hands brought together before the chest, a hand's breadth either side of the lance's
          // line, the elbows bent and out, as a man shoves with both palms (each straight out from its own shoulder,
          // the arms stood out stiff and parallel, a sleepwalker's, and through the eyes the hands were at the view's
          // two edges, their strands across the whole of it)
          if (both) { j.spine.rotation.x += BOTH.lean; j.neck.rotation.x += -BOTH.lean * BOTH.chin; bothHands(BOTH.reach - kick * (fp ? 0.02 : 0.08)); }
        }
      } else if (a.name === 'drink' && !fp) {
        // the healing draught: taken from the belt and drunk (models/flask.ts)
        flaskWant = drink(j, k, mouth, DRINK, handL, flask); drinkLift = drinkUp(k);
      } else if (a.name === 'summon' && !fp) {
        const w = ramp(k, 0, 0.15), rise = ramp(k, 0, 0.45) * (1 - ramp(k, 0.5, 0.62)), pull = ramp(k, 0.5, 0.62);
        j.shoulderL.rotation.x = lerp(j.shoulderL.rotation.x, curve(SU_ARM_X, k), w); j.shoulderL.rotation.z = lerp(j.shoulderL.rotation.z, curve(SU_ARM_Z, k), w);
        j.elbowL.rotation.x = lerp(j.elbowL.rotation.x, curve(SU_ELBOW, k), w);
        // the staff rises with the reach, and comes down level as the stars are called
        j.shoulderR.rotation.x += (-0.5 * rise - 0.15 * pull) * w;
        const b = curve(SU_BEND, k);
        j.spine.rotation.x += b * w; j.neck.rotation.x += curve(SU_LOOK, k) * w; j.chest.rotation.y += (0.1 * rise - 0.2 * pull) * w;
        j.body.position.y += curve(SU_DIP, k) * w; j.body.position.z += curve(SU_FWD, k) * w * (1 - move * 0.6);
        // the palm open to the sky, then clawing the stars down
        j.handL.rotation.x += -0.4 * rise - 0.8 * pull;
        poseHand(handL, 0.15 + 0.7 * pull * (1 - ramp(k, 0.75, 1) * 0.6), 0.5 * rise + 0.2);
        feet = CAST_FEET;
      } else if (a.name === 'slam' && !fp) {
        const w = ramp(k, 0, 0.15), arms = curve(SL_ARMS, k), sp = curve(SL_SPREAD, k), b = curve(SL_BEND, k), down = ramp(k, 0.5, 0.64);
        j.shoulderL.rotation.x = lerp(j.shoulderL.rotation.x, arms, w); j.shoulderR.rotation.x = lerp(j.shoulderR.rotation.x, arms + 0.3 * (1 - down), w);
        j.shoulderL.rotation.z = lerp(j.shoulderL.rotation.z, sp, w); j.shoulderR.rotation.z = lerp(j.shoulderR.rotation.z, -sp, w);
        j.elbowL.rotation.x = lerp(j.elbowL.rotation.x, -0.25 - 0.3 * (1 - down), w); j.elbowR.rotation.x = lerp(j.elbowR.rotation.x, -0.35, w);
        j.spine.rotation.x += b * w; j.neck.rotation.x -= 0.45 * b * w; j.body.position.y += curve(SL_DIP, k) * w;
        // fists raised, then splayed hands driven down
        poseHand(handL, 0.45 + 0.95 * (1 - down) * ramp(k, 0, 0.4) - 0.4 * down, 0.12 + 0.5 * down);
        feet = SLAM_FEET;
      } else if (a.name === 'slam') {
        const up = ramp(k, 0, 0.45) * (1 - ramp(k, 0.5, 0.7));
        const down = ramp(k, 0.5, 0.7) * (1 - ramp(k, 0.8, 1));
        j.shoulderL.rotation.x += -2.7 * up - 0.6 * down; j.shoulderR.rotation.x += -2.4 * up - 0.6 * down;
        j.shoulderL.rotation.z += 0.3 * up; j.shoulderR.rotation.z += -0.3 * up;
        j.body.position.y += -0.16 * down; j.kneeL.rotation.x += 0.5 * down; j.kneeR.rotation.x += 0.5 * down;
        j.thighL.rotation.x += -0.35 * down; j.thighR.rotation.x += -0.35 * down;
        j.spine.rotation.x += 0.35 * down - 0.15 * up;
        // fists raised, then splayed hands driven down
        poseHand(handL, 0.45 + 0.95 * up - 0.4 * down, 0.12 + 0.5 * down);
      } else if (a.name === 'buff') {
        // (raised and held: the fade out of it is slow)
        const w = fp ? pulse(k, 0, 1) : Math.sin(Math.min(1, k * 1.4) * Math.PI / 2);
        if (!fp) { j.spine.rotation.x += -0.08 * w; j.chest.rotation.y += -0.15 * w; j.body.position.y += 0.015 * w; }
        j.shoulderL.rotation.x += -1.6 * w; j.shoulderL.rotation.z += 0.8 * w;
        j.shoulderR.rotation.x += -0.8 * w; j.shoulderR.rotation.z += -0.6 * w;
        j.neck.rotation.x += -0.3 * w;
        // palm up and open, fingers spread to the ward
        j.handL.rotation.x += -0.6 * w;
        poseHand(handL, 0.45 - 0.35 * w, 0.12 + 0.45 * w);
      }
    }
    // through the eyes the free hand's gestures play higher and to the left, where they're seen but leave
    // the middle of the view clear (as posed, they pass low in its corner or right through its middle):
    // the hand keeps its motion, shifted in the chest's space, and the arm reaches it
    // and the staff is held out to the right, its crystal clear of the middle; the cast's raise of the
    // staff arm is kept down
    if (fp && armed) {
      const S = FP_STAFF, c = a?.name === 'cast' || a?.name === 'summon' ? pulse(a.t, 0, 1) : 0;
      j.shoulderR.rotation.x += S[0] + S[3] * c; j.shoulderR.rotation.z += S[1]; j.shoulderR.rotation.y += S[2];
    }
    // (with no staff the lance's thrust places both hands itself, before the chest)
    const twoHanded = !armed && a?.name === 'channel' && a.hands === 'both';
    if (a?.name !== 'channel') { mirrored = false; lanceHands = ''; }
    const shift = fp && a && !twoHanded ? FP_POSE[a.name] : undefined;
    if (shift) {
      const w = a!.name === 'channel' ? ramp(a!.time ?? 0, 0, 0.18) : pulse(a!.t, 0, 1);
      root.updateMatrixWorld(true);
      j.chest.worldToLocal(j.handL.getWorldPosition(_hp));
      _hp.x += shift[0] * w; _hp.y += shift[1] * w; _hp.z += shift[2] * w;
      reachArm(j.shoulderL, j.elbowL, j.P.upperL, j.P.foreL, _hp, POLE_L);
    }
    if (!fp && !(a && FREE_HAND.has(a.name))) j.handL.rotation.y += HAND_HANG;
    if (!armed && !fp && !twoHanded) j.handR.rotation.y -= HAND_HANG;
    // the lance from the right hand: the left's cast, posed above, set on the other side of him
    if (mirrored) mirrorCast();
    if (st.hit > 0) { j.spine.rotation.x += -0.25 * st.hit; j.neck.rotation.x += -0.2 * st.hit; }
    if (st.dead < 0) fade.apply(dt); else fade.reset();
    st.look?.();
    if (st.dead >= 0) { deathFall(j, st.dead, -1); legs.reset(); }
    else {
      // the legs: planted feet, a pelvis that follows them (ik.ts); then a crouch bends the knees instead of sinking the feet
      if (!fp) legs.captureArms();
      const F = feet ?? REST_FEET;
      legs.stance(0, F[0], F[1], F[2]); legs.stance(1, F[3], F[4], F[5]);
      legs.update(dt, st.phase, st.dead, 1, fp ? 0 : 1);
      groundFeet(j, 0.07);
      if (!fp) legs.holdArms();
    }

    // the skirts swing with the legs; the panels hanging over them follow the leg on their side
    const fL = -j.thighL.rotation.x, fR = -j.thighR.rotation.x;
    root.updateMatrixWorld(true);
    legBodies.place(tunicSkirt);
    if (!fp && st.dead < 0) clearThigh();
    // every arm within a body's ranges, each hand where the pose put it (armIK.ts)
    let slant = 0;
    if (!fp && st.dead < 0) { fitArm(j, true, undefined, body); slant = armed ? fitArm(j, false, gripTurn(handR, staff, _vr), body, SLANT).slant : fitArm(j, false, undefined, body).slant; }
    // (the haft seated in the fist as the hand holds it, diagonal across the palm by the slant the arm took)
    if (armed) seat(handR, staff, STAFF_R, slant);
    sets.bend();
    placeBodies();
    // (the hands only against the outer skirt: pushed in, the inner one would come out over it)
    if (robed) { over.update(fL, fR, move, t + 0.4, dt, legBodies.list, handBodies.list); }
    else short.update(fL, fR, move, t, dt, legBodies.list, handBodies.list);
    for (const f of flaps) {
      const wl = clamp(0.5 + Math.sin(f.a) * 0.9, 0, 1);
      const out = Math.max(-0.05, (fL * wl + fR * (1 - wl)) * Math.cos(f.a)) * 0.85 + 0.26 + move * 0.08 + Math.sin(t * 3 + f.a * 3) * 0.015;
      const [up, low] = robed ? overRobe(f, out) : [out, out];
      f.g.rotation.x = -up; f.knee.rotation.x = up - low;
    }

    // the flask comes out of the fist and is put away again (the fist closed round it)
    // (slid along its own length, so it stays in the fist: placed by hand, the haft left the palm for the wrist)
    staff.position.addScaledVector(_fw.set(0, 1, 0).applyQuaternion(staff.quaternion), staffSlide);
    flaskOut = damp(flaskOut, flaskWant, 16, dt); flask.visible = flaskOut > 0.02; flask.scale.setScalar(Math.max(0.02, flaskOut));
    if (flaskOut > 0.01) holdFlask(handL, flask, flaskOut);
    void drinkLift;
    // the right hand closes round the staff wherever the arm has taken it
    root.updateMatrixWorld(true);
    if (armed) hold(handR, _hd.set(0, 1, 0).transformDirection(staff.matrixWorld), STAFF_R, undefined, slant);

    // cloth runs after the pose so it collides with this frame's skeleton
    if (dt > 0 && robed) for (const c of cloths) c.update(dt);
    if (dt > 0 && hat.visible) hood.update(dt);

    // staff crystal
    crystal.rotation.y = t * 2.2;
    crystal.position.y = Math.sin(t * 3) * 0.02;
    ringA.rotation.set(t * 1.7, t * 1.1, 0);
    ringB.rotation.set(-t * 1.3, 0, t * 2.1);
    charged = damp(charged, st.charge || 0, 4, dt);
    // (the crystal's own material: it draws a copy of `gem`, the item glow's, and `gem` set, it never pulsed)
    (crystal.material as THREE.MeshPhysicalMaterial).emissiveIntensity = GEM_GLOW * (1 + charged * 0.6 + Math.sin(t * 6) * 0.08);
  }

  return {
    root, kit, joints: j, hands: { L: handL, R: handR }, animate, tip, palm, height: 2.0,
    cloths,
    // (the longcoat, the shirt's red at the throat and the linings: his oxblood)
    dye: new Dye('red').cloth(coat, coatD, shirt, lining, hoodLining),
    setGear: (gear: Gear) => {
      if (gear.helm && !hat.visible) hood.reset();
      hat.visible = gear.helm;
      // (the face in the hood's shade: lit as bare, it sat pasted into the opening)
      head.shade(gear.helm ? HOOD_SHADE : 0);
      showHair([...head.hair, ...(head.crop ? [head.crop] : [])], !gear.helm);
      // the robe or the tunic: the bell sleeves (cloth, put back on the arms when the robe is), the skirts
      if (gear.chest !== robed) {
        robed = gear.chest;
        if (robed) for (const c of cloths) c.reset();
      }
      for (const o of [...robeParts, ...skirts, ...flaps.map((f) => f.g), ...cloths.flatMap((c) => c.meshes)]) o.visible = robed;
      for (const o of [...tunic, tunicSkirt]) o.visible = !robed;
      sling.scale.set(robed ? 1 : SLUNG_IN, 1, robed ? 1 : SLUNG_IN_BACK);
      // (swung round the belt to its place, a turn about the belt's middle)
      book.rotation.y = robed ? 0 : BOOK_AT_BARE - BOOK_AT;
      book.position.set(robed ? 0 : -BOOK_IN * Math.sin(BOOK_AT_BARE), 0, robed ? 0 : -BOOK_IN * Math.cos(BOOK_AT_BARE));
      gloved = gear.hands;
      for (const o of bracers) o.visible = gear.hands;
      bare(handL, !gear.hands); bare(handR, !gear.hands);
      glows.set(gear);
      // the staff: none without a weapon, its crystal and rings in its school's colour (the materials they draw, the
      // item glow's copies; a colour is a value, so it compiles nothing)
      staff.visible = armed = !!gear.weapon;
      const school = SCHOOLS[gear.school ?? 'arcane'].color;
      for (const lit of [crystal, ringA, ringB]) {
        const m = lit.material as THREE.MeshStandardMaterial;
        m.color.set(school); m.emissive.set(school);
        // (the rings a little paler than the crystal, as they were built)
        if (lit !== crystal) { m.color.lerp(WHITE, 0.14); m.emissive.lerp(WHITE, 0.14); }
      }
    },
    reset: () => { legs.reset(); fade.reset(); for (const c of cloths) c.reset(); hood.reset(); },
    firstPerson: (on) => { fp = on; },
    dispose() {
      kit.dispose();
      disposeGeometries(root);
    },
  };
}
