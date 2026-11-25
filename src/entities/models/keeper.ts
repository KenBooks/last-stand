// Bertram Tunwell, keeper of the Ember & Oak (world/tavern.ts stands him behind the tavern's bar; data/tavern.ts):
// an innkeeper of fifty, drawn to read as his own man beside the library's Brother Hollis (brown wool, a long white
// beard, a cap) and Odo the merchant (saffron and teal, a plumed hat, a dark beard). His own face (face.ts
// `FACES.keeper`, from the warrior's skull: older, a broad bulbous nose, fuller lips, flushed cheeks) with the head's
// own short crop and full beard in ginger going grey (`LOOKS.keeper`), made by the head workers as the heroes' are; a
// normal build; a cream shirt striped in bottle green, its placket buttoned and its sleeves rolled in cuffs above the
// elbow; a red neckerchief knotted at the throat; a long apron of oiled leather on straps, stitched round its edges, a
// pocket on its front; a striped linen towel over his left shoulder; grey-blue trousers and boots.
// His idle is a loop that never snaps (`KEEP_LOOP` long: every motion a pulse still at both its ends): he breathes,
// wipes the inside of a mug with a rag, polishes the bar in wide rounds, looks round his room; a hero coming near is
// looked up at, one talking to him held in his eye. His left fist closes round his mug and his right round his rag
// (hands.ts `hold`, `seatHeld`, as a hero's round a handle), each arm solved twice so the fist, not the wrist, lands
// where it's sent. Asked for ale (`serve`), he holds the mug under the cask's tap, his right hand on its handle, then
// sets it down and slides it across (`SERVE`): the room takes the mug as it leaves his hand (`served`).
// (His first form, from play: "Character is bad... make him thinner, work on hair, body, clothing detail. Work on his
// face, mouth, textures. What the hell is happening with his hands": a barrel of a man on the warrior's head, its
// hair taken off and cards stuck on a bare shell, claws for hands, a fist through his mug.)
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { cloth as clothMaps, oiled as oiledMaps, leather as leatherMaps, wool as woolMaps, pbrMaterialMaps } from '../../core/textures';
import { buildHumanoid, reachArm, resetPose, type Joints } from './rig';
import { footShape } from './ik';
import { walkCycle } from './rig';
import { gaitRate, legLength, LegIK } from './ik';
import { stripRig } from './shapes';
import { buildNeck, handSkin, headSteps, type Head, type HeadSpec } from './head';
import { built } from './steps';
import { buildHand, bare, hold, poseHand, seatHeld, type Hand } from './hands';
import { cord, oval, rowsSurface, sleeve } from './merchant';
import { foot as bootFoot, sole as bootSole } from './boot';
import { LegCloth } from './legCloth';
import { bodyShape, capsuleDepth, type Solid } from './anatomy';
import { clamp, damp, lerp, mulberry, smooth } from '../../util';

/** his head: his own face (face.ts `VARIANTS.keeper`), a short crop and a full beard; made by the head workers and
 *  its face painted by the maps' workers where the village is, asked for before he's seated (main.ts) */
export const KEEPER_HEAD: HeadSpec = { who: 'keeper', hair: 'short', crop: true };

/** the rag's radius where his fist closes round it bunched (m) */
const RAG_R = 0.022;

/** `at` moved towards `goal` a frame on a critically damped spring (`v` its speed, kept from frame to frame), lagging
 *  `HAND_LAG` and never faster than `HAND_MOST`: no overshoot, no snap. */
function follow(at: THREE.Vector3, goal: THREE.Vector3, v: THREE.Vector3, dt: number): void {
  if (dt <= 0) return;
  const omega = 2 / HAND_LAG, x = omega * dt, decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = _off.subVectors(at, goal);
  const most = HAND_MOST * HAND_LAG;
  if (change.length() > most) change.setLength(most);
  const temp = _tmpV.copy(v).addScaledVector(change, omega).multiplyScalar(dt);
  v.sub(_tmpV2.copy(temp).multiplyScalar(omega)).multiplyScalar(decay);
  const target = _aim.copy(at).sub(change);
  at.copy(target).add(change.add(temp).multiplyScalar(decay));
}
const _off = new THREE.Vector3(), _tmpV = new THREE.Vector3(), _tmpV2 = new THREE.Vector3(), _aim = new THREE.Vector3();
/** how far his arms hang out from his sides past his belly (rad, at the shoulder: their goals override it) */
const ARMS_PAST_BELLY = 0.06;
/** how long an arm takes to come to its goal from his walk's swing, or go back to it (s), eased in and out: eased
 *  by a rate, its first frame back from the tap's handle was its fastest, 17.6 cm (`lab tavern`) */
const ARM_BLEND = 0.4;
/** a hand follows its goal as a hand does, on a spring that never overshoots: how long it lags (s) and its most speed
 *  (m/s). Copied when near and eased when far, a goal moving past the line between flicked the hand from one to the
 *  other ("Hand glitching when wiping table": 87 cm in a frame, `lab tavern`) */
const HAND_LAG = 0.11, HAND_MOST = 1.3;
/** how far from his shoulder a hand reaches without his leaning in (m), how much he leans for each m past it, and the
 *  most; and how far under his hips' height a goal brings his knees down for each m (from play: he folded his neck to
 *  reach low, "that neck bending is too much") */
const REACH_EASY = 0.46, LEAN_PER = 1.8, LEAN_MOST = 0.6, KNEES_PER = 0.5;
/** how fast a hand turns to a new grip's turn (1/s: over about a fifth of a second) */
const WRIST_EASE = 10;
/** the most a hand turns on its wrist in a 60th of a second (rad: 7 degrees) */
const WRIST_TURN_MOST = 0.12;
/** for how long after a thing is taken up (s) its hand turns at a grasp's pace, and the most it turns a 60th then (rad) */
const GRASP_QUICK = 0.2, WRIST_GRASP_MOST = 0.35;
/** how fast a hand changing its hold eases from the last hold's wrist to the new one's (1/s), and how far ahead of his
 *  shoulder a reach starts to lift his elbow (m) and the most it lifts it (the pole's rise) */
const KIND_EASE = 8, ELBOW_UP_FROM = 0.3, ELBOW_UP_MOST = 0.9;
/** the most a hand moves in his body's frame in a 60th of a second (m: 1.3 m/s, a quick reach's, the hand's spring's most) */
const ARM_STEP_MOST = 0.02;
/** how long a thing just taken up takes to come into the fist (s) */
const SEAT_EASE = 0.2;
/** the most its move a frame changes from the last frame's (m: a hand speeds up and slows, never snaps) */
const ARM_SPEED_CHANGE_MOST = 0.008;
/** the most an elbow moves in his chest's frame in a 60th of a second (m), and bends (rad) */
const ELBOW_MOVE_MOST = 0.03, ELBOW_BEND_MOST = 0.2;
/** how fast an arm's elbow pole eases to a new one (1/s) */
const POLE_EASE = 6;
/** the speed his walk's cycle is at its fullest (m/s): he walks at about that pace (data/tavern.ts `WALK`) */
const WALK_FULL = 1.1;
/** how far each foot stands from his middle at rest (m: half his hips' width) */
const STANCE_HALF = 0.11;
/** how fast his hips come down for a crouch or a reach and back up (m/s) */
const HIPS_RATE = 0.3;
/** where his rag hangs tucked in his apron's tie at his right hip while his right hand needs no rag (the hips' frame,
 *  x to his left): in the pocket at his front's left, his right forearm crossed his belly to reach it, `lab tavern` */
export const RAG_TUCKED = new THREE.Vector3(-0.19, -0.05, 0.12);
const TUCKED = RAG_TUCKED;
/** the most his rag turns in his hand in a 60th of a second (rad) */
const RAG_TURN_MOST = 0.1;
/** how many times a thing laid to the floor is read and laid again (`HandGoal.floor`) */
const FLOOR_PASSES = 6;
/** his body's solids grown by what he wears over them (m: the shirt and the apron's bib on his chest, his belly and
 *  the apron over it), how far off them his arms keep, and the elbow's turns about the shoulder-to-wrist line tried
 *  for an arm clear of him (rad, nearest first) */
/** where the shirt's chest piece ends below the chest joint (its lowest row, `chestRows`) */
const CHEST_HEM = -0.1;
export const BODY_GROWN = { chest: [0.005, 0, 0.03], belly: [0.03, 0, 0.06] } as const;
/** whether his head and face are made (by their workers, as his room is first built: world/tavernKeeper.ts), so
 *  another of him can be built in slices with nothing to wait for (his talk card's portrait, ui/guide/folkPortraits.ts) */
export const KEEPER_MADE = { head: false };

/** whether his arms keep out of his body (`lab tavern --canary` turns it off, which its check must catch) */
export const KEEPER_ARMS = { offBody: true };
/** (a switch for `lab tavern --canary`: his walk with no lift and his hips not lowered, legs straight, which its knee
 *  check must catch) */
export const KEEPER_GAIT = { flat: false, cross: false };
const ARM_OFF_BODY = 0.012;
const ELBOW_TRIES = [0, 0.15, -0.15, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4];
/** the most an elbow turns about its line in a 60th of a second (rad: an elbow swung a whole try round in a frame
 *  read as a flick, 16 degrees, `lab tavern`) */
const ELBOW_TURN_MOST = 0.12;
/** how far his apron's skirt keeps from the middle of his thighs and his shins (m: his trousers' thickness and the
 *  leather's) */
const APRON_OFF = { thigh: 0.115, shin: 0.085 };

/** Where one of his hands goes for the frame. */
export interface HandGoal {
  /** where it goes (world): the grip's place for a hand that holds or grips, the palm's for an open one */
  at: THREE.Vector3;
  /** what it holds, a child of that hand (`Keeper.carry`): the fist closed round it, its axis along `dir` (world, up by
   *  default), `r` its radius there, the thing stood with its +y along `dir` */
  held?: THREE.Object3D; r?: number; dir?: THREE.Vector3;
  /** a fist closed round a handle it doesn't carry (the broom's foot hand, the tap's handle): along `dir`, `r` round */
  grip?: boolean;
  /** a fist closed round a thing the other hand holds, `along` m up its +y from that hand's grip (the broom's foot
   *  hand): `at` and `dir` read off it as the other hand left it */
  on?: { thing: THREE.Object3D; along: number };
  /** an open hand shaped to take what it reaches for, its fingers in a C (from play: "his hand is flat for a moment")
   *  rather than flat, as a hand pushing or resting is */
  cup?: boolean;
  /** what it holds laid so the point `reach` along it meets the floor at `level` (world y), its way across the floor
   *  `dir`'s, from where the fist is once the arm is placed (a broom swept: laid from where the fist was sent, it rose and
   *  sank 3 to 7 cm as the hand lagged its goal, `lab tavern`) */
  floor?: { reach: number; level: number; touch: boolean };
  /** what it holds turned about its axis (rad: a mug turned in the hand as it's washed) */
  spin?: number;
  /** carried: `at` (and `dir`) given in his chest's own frame (x to his left, y up, z ahead, from the chest joint), so
   *  his walk's lean, twist and bob take the hand along, as a hero's weapon is held, and the hand isn't eased after it.
   *  Sent to a place on the floor's frame, a carried mug chased his walking body: a hand 6 cm a frame, `lab tavern` */
  carried?: boolean;
}

/** His body for the frame, the brain's (world/tavern.ts): his root's place and turn are set by it beforehand. */
export interface KeeperPose {
  /** how fast he walks (m/s, along his facing): the legs' stride and the arms' swing where a hand has no goal */
  speed: number;
  /** how far he leans over (0 upright, 1 bent over a table), and how far he crouches (0 standing, 1 down on his heels) */
  bend: number; crouch: number;
  /** what he looks at (world), or ahead */
  look: THREE.Vector3 | null;
  /** the velocity the brain is taking him to (m/s, his room's x and z: 0 standing), told to his legs before they
   *  move as a hero's are told it by the controls (`LegIK.intend`): his first stride planned as he sets off and his
   *  last as he stops. Untold, his legs met his walk a frame late and a planted foot was left behind as he set off,
   *  12 cm, `lab tavern` */
  goal?: { x: number; z: number };
  left: HandGoal | null; right: HandGoal | null;
}

export interface Keeper {
  /** his root: the brain stands it on the floor and turns it */
  root: THREE.Group;
  /** his body posed for the frame */
  pose(dt: number, p: KeeperPose): void;
  /** a thing put in his hand (`side`), carried by it from now, or taken out of it and left in `to`'s frame where it is */
  carry(side: 'left' | 'right', thing: THREE.Object3D): void;
  drop(thing: THREE.Object3D, to: THREE.Object3D): void;
  /** his rag: in his right hand, or tucked in his apron's pocket (`tuckRag`) while that hand holds something else */
  readonly rag: THREE.Object3D;
  tuckRag(tucked: boolean): void;
  /** whether the rag is in his apron's pocket */
  readonly ragTucked: boolean;
  /** he was put somewhere at once (stood behind the bar as he's seated): his feet set under him again there */
  placed(): void;
  /** how many times he's been put somewhere at once (the lab: his feet set afresh then aren't sliding) */
  readonly placings: number;
  /** his ankles in the world (the lab reads them sliding), and whether the leg IK has each foot planted */
  feet(out: [THREE.Vector3, THREE.Vector3]): [boolean, boolean];
  /** his ankles, left and right (the lab reads his soles from them) */
  readonly ankles: readonly [THREE.Object3D, THREE.Object3D];
  /** his rig's joints (the lab reads his body against the counters, his elbows' bend) */
  readonly joints: Joints;
  /** where each hand's grip is in the world, the left's and the right's (the lab reads them against their goals) */
  hands(out: [THREE.Vector3, THREE.Vector3]): void;
  /** his meshes (the lab reads them) */
  readonly parts: THREE.Mesh[];
  /** the heroes' leg IK that walks him (the lab reads its feet as `lab feet` reads a hero's) */
  readonly legs: LegIK;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Stripes run down a cloth (u across it) on a ground, `repeat` times across a unit of its uv. */
function stripes(ground: string, stripe: string, bands: [number, number][], repeat: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 8;
  const cx = c.getContext('2d')!;
  cx.fillStyle = ground; cx.fillRect(0, 0, 64, 8);
  cx.fillStyle = stripe;
  for (const [x, w] of bands) cx.fillRect(x, 0, w, 8);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(repeat, 1);
  t.anisotropy = 4;
  return t;
}

type Add = (g: THREE.BufferGeometry, m: THREE.Material, on: THREE.Object3D, name: string, cast?: boolean) => THREE.Mesh;
interface Mats {
  shirt: THREE.Material; apron: THREE.Material; strap: THREE.Material; thread: THREE.Material; scarf: THREE.Material;
  towel: THREE.Material; arm: THREE.Material; brass: THREE.Material; bone: THREE.Material; trousers: THREE.Material;
  boot: THREE.Material; sole: THREE.Material;
}

/**
 * The keeper, built whole (the lab's set-ups): `keeperSteps` at once.
 */
export const buildKeeper = (): Keeper => built(keeperSteps());

/**
 * The keeper, built a piece at a time (models/steps.ts): his rig, his head, his hands, his clothes, each a step. His
 * head and hands are made as the heroes' are: build him once their workers have made them (`readyHead`, `readyFace`,
 * `preloadHands`), or they're sculpted here on the page.
 */
export function* keeperSteps(): Generator<void, Keeper, undefined> {
  const kit = createKit(0xffc27a);
  const tex = (maps: ReturnType<typeof woolMaps>, ns = 1) => {
    const m = pbrMaterialMaps(maps, 1, ns);
    return { map: m.map, normalMap: m.normalMap, roughnessMap: m.roughnessMap, normalScale: m.normalScale };
  };
  // (his palette is a tavern's: cream and bottle green, oiled brown leather, a red scarf; Hollis wears brown and
  // oxblood, Odo saffron and teal)
  // (laid once a repeat a unit of u: each part's UVs are set by his body, `STRIPES`)
  const shirtMap = stripes('#ece0c4', '#2c5236', [[0, 10], [17, 3]], 1);
  const shirt = kit.rim({ color: 0xffffff, roughness: 1, ...tex(clothMaps(), 0.9), map: shirtMap, side: THREE.DoubleSide }, 0xfff0d0, 0.3);
  const apron = kit.std({ color: 0x74503a, roughness: 0.78, ...tex(oiledMaps(), 0.45), side: THREE.DoubleSide });
  const strap = kit.std({ color: 0x3a2414, roughness: 0.5, ...tex(leatherMaps(), 0.7) });
  const thread = kit.std({ color: 0xc8b088, roughness: 0.9 });
  const scarf = kit.rim({ color: 0x9a2018, roughness: 0.95, ...tex(clothMaps(), 0.8), side: THREE.DoubleSide }, 0xd04030, 0.3);
  const towelMap = stripes('#e8decb', '#9a3a2a', [[6, 3], [11, 2]], 1);
  const towel = kit.rim({ color: 0xffffff, roughness: 1, ...tex(clothMaps(), 1.2), map: towelMap, side: THREE.DoubleSide }, 0xfff4e0, 0.25);
  const brass = kit.std({ color: 0xc89a48, metalness: 0.9, roughness: 0.35 });
  const bone = kit.std({ color: 0xe6dcc6, roughness: 0.5 });
  const trousers = kit.std({ color: 0x343c4a, roughness: 1, ...tex(woolMaps(), 1) });
  // (its leather's grain three times finer: a tile across the whole foot read as a coarse hide)
  const bootMaps = pbrMaterialMaps(leatherMaps(), 3, 0.6);
  const boot = kit.std({ color: 0x2a1a10, roughness: 0.6, map: bootMaps.map, normalMap: bootMaps.normalMap, roughnessMap: bootMaps.roughnessMap, normalScale: bootMaps.normalScale });
  const soleMat = kit.std({ color: 0x17100a, roughness: 0.8 });

  // --- the rig: a man of an ordinary build, a little thick at the waist; his legs planted by the leg IK as he walks ---
  // (his neck 2.5 cm shorter than the rig's: "slightly too long neck, just does not look right from some angles,
  // especially when he looks down")
  const j: Joints = buildHumanoid({ skin: shirt }, { chestW: 0.21, chestD: 0.14, waistW: 0.17, neckL: 0.075 });
  stripRig(j.root);
  for (const [name, o] of Object.entries(j)) if (o instanceof THREE.Object3D && !o.name) o.name = `keeper ${name}`;
  const P = j.P;
  const hipY = j.hips.position.y;

  // --- the head: his own face, short crop and full beard, all the head's own (face.ts, head.ts) ---
  yield;
  const head: Head = yield* headSteps(j.head, kit, KEEPER_HEAD.who, KEEPER_HEAD);
  buildNeck(j.neck, kit, 'keeper', P.neckL, j.head);

  // --- the hands: the heroes' own, bare, his forearms in his own skin ---
  const skin = handSkin(kit, 'keeper');
  yield;
  const handL = buildHand(j.handL, 1, skin, skin, 1.06, skin), handR = buildHand(j.handR, -1, skin, skin, 1.06, skin);
  bare(handL, true); bare(handR, true);
  const arm = kit.rim({ color: (skin as THREE.MeshStandardMaterial).color.clone().multiplyScalar(0.96), roughness: 0.7 }, 0xf0b0a0, 0.22);

  // --- his clothes ---
  const parts: THREE.Mesh[] = [];
  const add: Add = (geo, mat, on, name, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = `keeper ${name}`;
    m.castShadow = cast; m.receiveShadow = true;
    on.add(m);
    parts.push(m);
    return m;
  };
  yield;
  const apronSkirt = dressBody(j, add, { shirt, apron, strap, thread, scarf, towel, arm, brass, bone, trousers, boot, sole: soleMat });
  // (the apron's skirt pushed out by his thighs and shins as he walks and bends: legCloth.ts)
  const apronCloth = new LegCloth(apronSkirt.skirt, apronSkirt.cols, j.hips, [
    { from: j.thighL, to: j.kneeL, r: APRON_OFF.thigh }, { from: j.kneeL, to: j.ankleL, r: APRON_OFF.shin },
    { from: j.thighR, to: j.kneeR, r: APRON_OFF.thigh }, { from: j.kneeR, to: j.ankleR, r: APRON_OFF.shin },
  ]);
  for (const piece of apronSkirt.sewn) apronCloth.carry(piece);
  // (the chest's whole turn reached where the chest's piece of the shirt ends over the belly's, its lowest row)
  const bellyTwist = new ShirtTwist(apronSkirt.belly, j.chest, j.chest.position.y + CHEST_HEM);
  // (his body as the heroes' solids (anatomy.ts), grown by his clothes: what his arms keep out of)
  const body = bodyShape(j);
  for (const solid of body.solids) {
    const grown = solid.name === 'chest' ? BODY_GROWN.chest : solid.name === 'belly' ? BODY_GROWN.belly : null;
    if (grown) solid.r.add(new THREE.Vector3(...grown));
  }
  const trunk = body.solids.filter((solid) => ['chest', 'belly', 'neck', 'head'].includes(solid.name));
  yield;
  const rag = add(ragGeometry(), towel, j.handR, 'rag', false);
  /** the rag's turn in his hand at rest, each frame's own begun from (`easeWrist` turns what a hand holds by the frame's
   *  ease: begun from the last frame's, its turns added up and it spun round in his fist, "the wipe does a bunch of turns
   *  in his hand like 360s", Kenneth's round 4) */
  const ragRest = rag.quaternion.clone(), ragWas = rag.quaternion.clone();
  let ragSeen = false;
  // (his feet as his boots have them: the sole under the ankle, the toe ahead and the heel behind)
  j.root.updateMatrixWorld(true);
  const sole = footShape(j.ankleL, j.root);
  const legs = new LegIK(j);
  const legLong = legLength({ joints: j, root: j.root });
  const legsOf = [
    { thigh: j.thighL, knee: j.kneeL, ankle: j.ankleL, s: 1 },
    { thigh: j.thighR, knee: j.kneeR, ankle: j.ankleR, s: -1 },
  ] as const;
  let ragTucked = false;

  // --- his pose, a frame at a time ---
  let gaze = 0, bend = 0, crouch = 0, placings = 0, replant = true, phase = 0, walkSpeed = 0, hipsDrop = 0;
  const movedFrom = new THREE.Vector3(), intendV = new THREE.Vector3(), intendQ = new THREE.Quaternion();
  const footAt = new THREE.Vector3(), legPole = new THREE.Vector3(), roomQ = new THREE.Quaternion();
  const footQ = new THREE.Quaternion(), kneeQ = new THREE.Quaternion(), X_AXIS = V(1, 0, 0);
  /** each hand's goal eased towards where it's sent (a step's goal changes at once: the hand doesn't), and how far
   *  the arm is its goal's rather than his walk's swing */
  const eased = [new THREE.Vector3(), new THREE.Vector3()], easedSet = [false, false], weight = [0, 0], blendOf = [0, 0];
  /** each hand's last goal, its place in his chest's frame, followed on as the arm blends back to its swing */
  const letGo: (HandGoal | null)[] = [null, null], letGoAt = [new THREE.Vector3(), new THREE.Vector3()];
  const easeV = [new THREE.Vector3(), new THREE.Vector3()];
  /** each arm as last solved to its goal: what it eases back to the swing from once the goal's gone */
  const solved = [0, 1].map(() => ({ qs: new THREE.Quaternion(), qe: new THREE.Quaternion() }));
  /** how far he leans and how far his knees give to bring his hands to their goals (eased) */
  let lean = 0, knees = 0;
  const spinQ = new THREE.Quaternion();
  /** each arm's last wrist goal (world), the kind of hold it was for (0 open, 1 holding, 2 a grip), and what's left of
   *  the move between two kinds still to ease out */
  const lastWrist = [new THREE.Vector3(), new THREE.Vector3()], kindWas = [0, 0], wristSeen = [false, false];
  const kindOff = [new THREE.Vector3(), new THREE.Vector3()], solvedWrist = new THREE.Vector3(), armPole = new THREE.Vector3();
  const ragDir = new THREE.Vector3();
  /** each arm as last shown, and its hand's place in his body's frame (`capArmStep`) */
  const armWas = [0, 1].map(() => ({ qs: new THREE.Quaternion(), qe: new THREE.Quaternion(), hand: new THREE.Vector3(), v: new THREE.Vector3(), elbow: new THREE.Vector3(), bend: 0, seen: false }));
  const armElbow = new THREE.Vector3();
  const armHand = new THREE.Vector3(), armMove = new THREE.Vector3(), armChange = new THREE.Vector3(), armAllowed = new THREE.Vector3();
  const armToQs = new THREE.Quaternion(), armToQe = new THREE.Quaternion();
  /** a thing just taken up, where it stood, and how far into its easing into the fist (0 to 1) */
  let seating: { thing: THREE.Object3D; from: THREE.Vector3; t: number } | null = null;
  const seatAt = new THREE.Vector3();
  /** each hand's turn as last shown (`easeWrist`) */
  const wristWas = [new THREE.Quaternion(), new THREE.Quaternion()], wristSet = [false, false], wristQuick = [0, 0];
  const wristWant = new THREE.Quaternion(), wristBy = new THREE.Quaternion();
  const swing = { qs: new THREE.Quaternion(), qe: new THREE.Quaternion() };
  const lookYaw = { v: 0 }, lookPitch = { v: 0 };
  const tmp = new THREE.Vector3(), at = new THREE.Vector3(), headAt = new THREE.Vector3(), wrist = new THREE.Vector3();
  // (his elbows out to his sides and a little back, as a man's reaching over a counter: down and back, an arm reaching
  // to the bar's top took its elbow under it, `lab tavern`)
  const up = V(0, 1, 0);
  const turn = new THREE.Quaternion(), along = new THREE.Quaternion();
  const chestLocal = (v: THREE.Vector3) => j.chest.worldToLocal(v.clone());
  const handOf = (left: boolean): Hand => (left ? handL : handR);
  /** one arm to its goal: a fist seated round what it holds (solved twice, so the grip lands where it's sent), a fist
   *  round a handle, or an open hand, flat */
  /** each arm's last turn of its elbow about the line from its shoulder to its wrist (rad: `keepOffBody`) */
  const elbowTurn = [0, 0];
  /** each hand's held thing and the way it's stood (world), as the arm last seated it */
  const heldWay: ({ thing: THREE.Object3D; dir: THREE.Vector3; spin: number; floor?: { reach: number; level: number; touch: boolean } } | null)[] = [null, null];
  const floorAt = new THREE.Vector3(), turnInv = new THREE.Quaternion(), lowAt = new THREE.Vector3();
  /** the lowest of `thing`'s meshes' points (world y) */
  const lowestOf = (thing: THREE.Object3D): number => {
    thing.updateWorldMatrix(true, true);
    let lowest = Infinity;
    thing.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const pos = mesh.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) lowest = Math.min(lowest, lowAt.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).y);
    });
    return lowest;
  };
  const heldDir = [new THREE.Vector3(), new THREE.Vector3()];
  /** each arm's elbow pole, eased (`POLE_EASE`), and the frame's time it's eased by */
  const poleEased = [new THREE.Vector3(), new THREE.Vector3()], poleSet = [false, false];
  let frameDt = 0;
  const freeWrist = new THREE.Vector3(), freePole = new THREE.Vector3();
  const carryAt = new THREE.Vector3(), carryDir = new THREE.Vector3(), carryQ = new THREE.Quaternion();
  const goalLocal = new THREE.Vector3(), handWorld = new THREE.Vector3();
  const axisL = new THREE.Vector3(), poleTry = new THREE.Vector3(), elbowW = new THREE.Vector3(), wristW = new THREE.Vector3();
  const shoulderW = new THREE.Vector3(), tipW = new THREE.Vector3(), poleBest = new THREE.Vector3();
  /** How far the arm as solved now goes into his trunk or head (m, 0 clear): the forearm and hand into any of them, the
   *  upper arm into his head. */
  const armInBody = (left: boolean): number => {
    const [shoulder, elbow, hand] = left ? [j.shoulderL, j.elbowL, j.handL] : [j.shoulderR, j.elbowR, j.handR];
    shoulder.updateMatrixWorld(true);
    shoulder.getWorldPosition(shoulderW);
    elbow.getWorldPosition(elbowW);
    hand.getWorldPosition(wristW);
    tipW.subVectors(wristW, elbowW).setLength(0.1).add(wristW);
    let worst = 0;
    for (const solid of trunk) {
      worst = Math.max(worst, capsuleDepth(elbowW, wristW, P.foreR + ARM_OFF_BODY, solid), capsuleDepth(wristW, tipW, 0.04 + ARM_OFF_BODY, solid));
      if (solid.name === 'head') worst = Math.max(worst, capsuleDepth(shoulderW, elbowW, P.upperR, solid));
    }
    return worst;
  };
  /** An arm's elbow turned about the line from its shoulder to `wrist` (chest frame: `pole` changed in place) to where
   *  the arm keeps out of his body, the turn nearest last frame's that does; and where none does, `wrist` (world)
   *  pushed out of his chest and belly. A goal at his side or across him took his forearm through his chest and apron
   *  (from play: "in many many animations his arm goes through his body"). */
  const keepOffBody = (left: boolean, wrist: THREE.Vector3, pole: THREE.Vector3): void => {
    const i = left ? 0 : 1, [shoulder, elbow] = left ? [j.shoulderL, j.elbowL] : [j.shoulderR, j.elbowR];
    pushOutOf(wrist, P.foreR + ARM_OFF_BODY);
    const target = chestLocal(wrist);
    axisL.subVectors(target, shoulder.position).normalize();
    let best = Infinity, bestTurn = elbowTurn[i];
    for (const offset of ELBOW_TRIES) {
      const angle = elbowTurn[i] + offset;
      poleTry.copy(pole).applyAxisAngle(axisL, angle);
      reachArm(shoulder, elbow, P.upperL, P.foreL, target, poleTry, 1, 0.08);
      const depth = armInBody(left), cost = depth + Math.abs(offset) * 0.002;
      if (cost < best) { best = cost; bestTurn = angle; poleBest.copy(poleTry); }
      if (depth <= 0) break;
    }
    // (eased towards the clear turn, never swung round in a frame; and back to his natural elbow when clear of himself)
    const wanted = Math.abs(bestTurn) > 0.02 && best <= 0.003 ? bestTurn * 0.97 : bestTurn;
    elbowTurn[i] += clamp(wanted - elbowTurn[i], -ELBOW_TURN_MOST, ELBOW_TURN_MOST);
    pole.applyAxisAngle(axisL, elbowTurn[i]);
    void poleBest;
  };
  /** `point` (world) moved out of his chest and belly, grown by `r` round it */
  const pushOutOf = (point: THREE.Vector3, r: number): void => {
    for (const solid of trunk) {
      if (solid.name !== 'chest' && solid.name !== 'belly') continue;
      outOfSolid(point, solid, r);
    }
  };
  const reach = (left: boolean, g: HandGoal) => {
    const [shoulder, elbow] = left ? [j.shoulderL, j.elbowL] : [j.shoulderR, j.elbowR];
    const h = handOf(left), i = left ? 0 : 1;
    // (his elbow out to his side, and lifted as his hand reaches far ahead over a counter: the arm sagged at the elbow
    // onto the bar's top reaching across it, `lab tavern`)
    shoulder.getWorldPosition(tmp);
    const far = clamp((Math.hypot(g.at.x - tmp.x, g.at.z - tmp.z) - ELBOW_UP_FROM) / 0.3, 0, 1);
    // (carrying, his elbow hangs down by his side, as a man's carrying a mug: sent out and back as for a reach over a
    // counter, it stood 39 cm out from his middle and met the bar walking behind it, `lab tavern`)
    // (carried, the elbow hangs down by his side, a little out: out 0.35, his elbow caught the back counter walking
    // the aisle behind the bar, `lab tavern`)
    const wantPole = g.carried ? armPole.set(left ? 0.1 : -0.1, -1, -0.35).normalize() : armPole.set(left ? 1 : -1, 0.05 + far * ELBOW_UP_MOST, -0.5).normalize();
    // (eased from one to the other: switched at once between a carry and a reach, the elbow flipped and the hand
    // jumped 10 cm in a frame)
    if (poleSet[i]) poleEased[i].lerp(wantPole, 1 - Math.exp(-POLE_EASE * frameDt)).normalize(); else poleEased[i].copy(wantPole);
    poleSet[i] = true;
    const pole = armPole.copy(poleEased[i]);
    if (g.on) {
      j.root.updateMatrixWorld(true);
      g = { ...g, at: g.on.thing.localToWorld(new THREE.Vector3(0, g.on.along, 0)), dir: new THREE.Vector3(0, 1, 0).applyQuaternion(g.on.thing.getWorldQuaternion(turn)), grip: true };
    }
    const dir = g.dir ?? up;
    // (the wrist guessed a hand's length back towards him from the grip, then moved by how far the grip landed off)
    j.root.getWorldQuaternion(turn);
    wrist.copy(g.at).add(tmp.set(left ? 0.02 : -0.02, 0.06, -0.07).applyQuaternion(turn));
    // (each pass moves the wrist by how far the grip landed off, the hand's turn changing with the arm's: with two the
    // right fist was left 1 to 9 cm off what it held, with four it lands on it)
    const passes = g.held || g.grip ? 4 : 1;
    if (KEEPER_ARMS.offBody) keepOffBody(left, wrist, pole);
    const seat = () => {
      if (g.held) {
        heldWay[i] = { thing: g.held, dir: heldDir[i].copy(dir), spin: g.spin ?? 0, floor: g.floor };
        hold(h, dir, g.r ?? 0.02);
        seatHeld(h, g.held, g.r ?? 0.02);
        // (the thing stood along its axis in the world, whatever the hand's turn)
        g.held.parent!.getWorldQuaternion(turn).invert();
        g.held.quaternion.copy(turn.multiply(along.setFromUnitVectors(up, dir)).multiply(spinQ.setFromAxisAngle(up, g.spin ?? 0)));
        j.root.updateMatrixWorld(true);
        g.held.getWorldPosition(at);
      } else if (g.grip) {
        hold(h, dir, g.r ?? 0.015);
        h.vis.updateWorldMatrix(true, false);
        h.vis.localToWorld(at.set(0, -0.085, 0.03));
      } else poseHand(h, g.cup ? 0.5 : 0.18, g.cup ? 0.14 : 0.08, 0, 0, 0);
    };
    for (let pass = 0; pass < passes; pass++) {
      reachArm(shoulder, elbow, P.upperL, P.foreL, chestLocal(wrist), pole, 1, 0.08);
      j.root.updateMatrixWorld(true);
      solvedWrist.copy(wrist);
      seat();
      if (g.held || g.grip) wrist.add(tmp.subVectors(g.at, at));
    }
    // (a hand changing how it holds, a fist round the mug opened to push it: its wrist carried from where it was and
    // eased onto the new hold's, not moved the grip's length in a frame, 17.6 cm, `lab tavern`)
    const kind = g.held ? 1 : g.grip ? 2 : 0;
    if (kind !== kindWas[i] && wristSeen[i]) kindOff[i].subVectors(lastWrist[i], solvedWrist);
    kindWas[i] = kind;
    if (kindOff[i].lengthSq() > 1e-8) {
      solvedWrist.add(kindOff[i]);
      reachArm(shoulder, elbow, P.upperL, P.foreL, chestLocal(solvedWrist), pole, 1, 0.08);
      j.root.updateMatrixWorld(true);
      seat();
    }
    lastWrist[i].copy(solvedWrist);
    wristSeen[i] = true;
  };



  /** How far he must lean in and bend his knees for his hands to reach their goals from his shoulders as they stand. */
  const reachAsked = (p: KeeperPose): { lean: number; knees: number } => {
    let far = 0, low = 0;
    j.root.updateMatrixWorld(true);
    for (const [goal, shoulder] of [[p.left, j.shoulderL], [p.right, j.shoulderR]] as const) {
      if (!goal || goal.on || goal.carried) continue;
      shoulder.getWorldPosition(tmp);
      far = Math.max(far, tmp.distanceTo(goal.at) - REACH_EASY);
      j.root.worldToLocal(at.copy(goal.at));
      low = Math.max(low, 0.8 - at.y);
    }
    return { lean: clamp(far * LEAN_PER, 0, LEAN_MOST), knees: clamp(low * KNEES_PER, 0, 0.35) };
  };

  function pose(dt: number, p: KeeperPose): void {
    resetPose(j);
    frameDt = dt;
    if (seating) {
      seating.t += dt / SEAT_EASE;
      if (seating.t >= 1) seating = null;
    }
    // --- his legs: the heroes' own walk (rig.ts `walkCycle` and ik.ts `LegIK`, as a hero's and every walking foe's),
    // its cycle moved on by how fast the brain walks him; his feet set afresh where he's been put at once (this frame,
    // not the frame he was moved: `placings` counts it here). From play: "reuse player characters for walking
    // animations, just use that one": his own heel-to-toe walker (walker.ts, Odo's) read as a robot's walk ---
    if (replant) {
      legs.reset();
      // (settled there at once in one long step, its weight full and his feet planted under him: the gait eases its
      // weight in over a third of a second from a restart, a hero's from his first frame in the game, and his first
      // steps as the tavern opened were the walk cycle's feet blended into the IK's, 27 cm a frame, `lab tavern`)
      j.root.updateMatrixWorld(true);
      legs.update(1, phase, -1);
      replant = false;
      placings++;
      movedFrom.copy(j.root.position);
    }
    // (by how far his root moved this frame, as a foe's cycle is: eased into a task's place, a few cm a frame, the
    // brain called him still, his cycle stood, his planted feet were left behind and the leg IK dropped his pelvis
    // through the floor to reach them, `lab tavern`)
    const moved = dt > 0 ? Math.hypot(j.root.position.x - movedFrom.x, j.root.position.z - movedFrom.z) / dt : 0;
    movedFrom.copy(j.root.position);
    walkSpeed = damp(walkSpeed, Math.max(moved, p.speed), 12, dt);
    const speed = walkSpeed;
    phase += dt * speed * gaitRate(Math.max(speed, 0.05), legLong) * legs.cadence;
    // (his lean and his crouch eased, never snapped: a step's end drops both at once)
    bend = damp(bend, p.bend, 5, dt);
    crouch = damp(crouch, p.crouch, 4, dt);
    // (leaning in and bending his knees as far as his hands' goals ask, from his hips and not his neck)
    const asked = reachAsked(p);
    lean = damp(lean, asked.lean, 4, dt);
    knees = damp(knees, asked.knees, 4, dt);
    // (from their rest height each frame: the pose doesn't put the hips back, and lowered from where they were they
    // sank 14 m in a serve, `lab tavern`)
    j.hips.position.y = hipY;
    walkCycle(j, phase, Math.min(1, speed / WALK_FULL), { stride: 0.5, knee: 1, arm: 0.25, bob: 0.05 });
    // (his arms' swing held out past his belly, which an arm blending to or from a goal starts from: from the heroes'
    // walk, his right forearm brushed it 2.1 cm as he came up to the broom, `lab tavern`; set on the free arm alone, it
    // still did, his hand reaching for the broom from that swing)
    j.shoulderL.rotation.z += ARMS_PAST_BELLY;
    j.shoulderR.rotation.z -= ARMS_PAST_BELLY;
    // (lowered or raised no faster than his planted legs follow: stood up 11 cm at once as he walked off from the tub,
    // a planted foot fell short of its spot and slipped 10 cm, `lab tavern`)
    const dropWanted = (crouch + knees) * 0.32;
    hipsDrop += clamp(dropWanted - hipsDrop, -HIPS_RATE * dt, HIPS_RATE * dt);
    j.hips.position.y -= hipsDrop;
    j.root.updateMatrixWorld(true);
    // (the canary's: standing, his left foot planted where his right stands)
    // (standing, his feet given their places a hip's width either side of his middle, in his root's own frame as the
    // gait reads a stance, which it steps them to: turned on the spot, they were left 7.5 cm apart, `lab tavern`; the
    // canary's: his left foot's place across past his right's)
    const standing = walkSpeed < 0.2 && Math.hypot(p.goal?.x ?? 0, p.goal?.z ?? 0) < 0.2;
    if (KEEPER_GAIT.cross) {
      legs.stance(0, -STANCE_HALF - 0.14, 0.05, 0);
      legs.stance(1, -STANCE_HALF, 0, 0);
    } else if (standing) {
      legs.stance(0, STANCE_HALF, 0, 0);
      legs.stance(1, -STANCE_HALF, 0, 0);
    } else for (const i of [0, 1]) if (legs.feet[i].stand) legs.stance(i, null);
    if (p.goal) {
      const room = j.root.parent;
      intendV.set(p.goal.x, 0, p.goal.z);
      if (room) intendV.applyQuaternion(room.getWorldQuaternion(intendQ));
      legs.intend(intendV, true);
    }
    legs.update(dt, phase, -1);
    // (the canary's straight legs: his knees locked after the gait has placed them)
    if (KEEPER_GAIT.flat && walkSpeed > 0.3) { j.kneeL.quaternion.identity(); j.kneeR.quaternion.identity(); }
    j.root.updateMatrixWorld(true);
    apronCloth.lay();
    // --- the body: leaning over his work, the head on what he looks at ---
    j.spine.rotation.x += 0.03 + (bend + lean) * 0.42 + (crouch + knees) * 0.2;
    j.chest.rotation.x += (bend + lean) * 0.18;
    j.root.updateMatrixWorld(true);
    gaze = damp(gaze, p.look ? 1 : 0, 4, dt);
    if (p.look) {
      j.neck.getWorldPosition(headAt);
      tmp.copy(p.look);
      j.root.worldToLocal(tmp);
      j.root.worldToLocal(headAt);
      tmp.sub(headAt);
      const yaw = clamp(Math.atan2(tmp.x, tmp.z), -1.1, 1.1), pitch = clamp(Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z)) + (bend + lean) * 0.5, -0.6, 0.5);
      lookYaw.v = damp(lookYaw.v, yaw, 6, dt);
      lookPitch.v = damp(lookPitch.v, pitch, 6, dt);
    }
    j.chest.rotation.y += lookYaw.v * 0.2 * gaze;
    // (his eyes do some of the looking down: his neck and head bend a little of it, never folded to his chest)
    j.neck.rotation.set(-lookPitch.v * 0.18 * gaze, lookYaw.v * 0.15 * gaze, 0);
    j.head.rotation.set(-lookPitch.v * 0.4 * gaze, lookYaw.v * 0.6 * gaze, 0);
    for (const e of head.eyes) e.rotation.set(0.05 - Math.min(0, lookPitch.v) * 0.25 * gaze, 0, 0);
    // (his shirt's belly turned with his chest's twist from his waist up, so its stripes meet the chest's: shirt twist)
    bellyTwist.lay();
    j.root.updateMatrixWorld(true);
    // --- the arms: each to its goal, eased there, or swinging with his walk; between the two blended ---
    for (const left of [true, false]) {
      const i = left ? 0 : 1;
      let goal = left ? p.left : p.right;
      blendOf[i] = clamp(blendOf[i] + (goal ? dt : -dt) / ARM_BLEND, 0, 1);
      weight[i] = smooth(blendOf[i]);
      // (a goal let go: the hand still eases on to where it went, in his chest's frame, as the arm blends back to its
      // swing; posed from where the arm last was instead, a hand on its way stopped dead and its speed snapped, 6 to 7
      // cm a frame, `lab tavern`)
      if (goal) {
        letGo[i] = { at: j.chest.worldToLocal(letGoAt[i].copy(goal.carried ? j.chest.localToWorld(carryAt.copy(goal.at)) : goal.at)), r: goal.r, dir: undefined, grip: goal.grip, cup: goal.cup };
      } else if (weight[i] > 0.001 && letGo[i]) {
        goal = { ...letGo[i]!, at: j.chest.localToWorld(handWorld.copy(letGo[i]!.at)) };
      } else letGo[i] = null;
      const [shoulder, elbow] = left ? [j.shoulderL, j.elbowL] : [j.shoulderR, j.elbowR];
      if (!goal) {
        wristSeen[i] = false;
        kindOff[i].set(0, 0, 0);
        // (gone back to his swing from where the arm last was, not dropped there in a frame)
        if (weight[i] > 0.001) {
          shoulder.quaternion.slerp(solved[i].qs, weight[i]);
          elbow.quaternion.slerp(solved[i].qe, weight[i]);
        } else easedSet[i] = false;
        // (an arm easing back from a goal, or swinging, kept out of him too: eased from a reach before him to his side,
        // it swung through his chest, `lab tavern`)
        if (KEEPER_ARMS.offBody && weight[i] > 0.001 && armInBody(left) > 0.004) {
          (left ? j.handL : j.handR).getWorldPosition(freeWrist);
          freePole.set(left ? 1 : -1, 0.05, -0.5).normalize();
          keepOffBody(left, freeWrist, freePole);
          reachArm(shoulder, elbow, P.upperL, P.foreL, chestLocal(freeWrist), freePole, 1, 0.08);
          j.root.updateMatrixWorld(true);
        }
        continue;
      }
      // (carried, its place on his chest made the world's now, his body's moves taking it along)
      if (goal.carried) {
        j.root.updateMatrixWorld(true);
        const chestQ = j.chest.getWorldQuaternion(carryQ);
        goal = { ...goal, at: j.chest.localToWorld(carryAt.copy(goal.at)), ...(goal.dir ? { dir: carryDir.copy(goal.dir).applyQuaternion(chestQ) } : {}) };
      }
      // (the hand sets off from where it is, and follows its goal on a spring in his chest's own frame: his walk, lean
      // and turn carry it along, and a goal changed between his chest's frame and the room's is eased to, never jumped
      // to. Eased in the room's, a hand chased its goal 6 cm a frame as he walked, `lab tavern`)
      j.root.updateMatrixWorld(true);
      if (!easedSet[i]) {
        j.chest.worldToLocal(handOf(left).vis.localToWorld(eased[i].set(0, -0.085, 0.03)));
        easeV[i].set(0, 0, 0);
        easedSet[i] = true;
      }
      follow(eased[i], j.chest.worldToLocal(goalLocal.copy(goal.at)), easeV[i], dt);
      const handAt = j.chest.localToWorld(handWorld.copy(eased[i]));
      // (a goal inside him is met where his body lets the hand come: on him, not through him)
      if (KEEPER_ARMS.offBody) pushOutOf(handAt, 0.05);
      kindOff[i].multiplyScalar(Math.exp(-KIND_EASE * dt));
      swing.qs.copy(shoulder.quaternion); swing.qe.copy(elbow.quaternion);
      reach(left, { ...goal, at: handAt });
      solved[i].qs.copy(shoulder.quaternion);
      solved[i].qe.copy(elbow.quaternion);
      if (weight[i] < 0.999) { shoulder.quaternion.slerpQuaternions(swing.qs, shoulder.quaternion.clone(), weight[i]); elbow.quaternion.slerpQuaternions(swing.qe, elbow.quaternion.clone(), weight[i]); }
    }
    if (!p.left) poseHand(handL, 0.3, 0.05, 0, 0, 0);
    if (p.right) { /* posed by its goal */ }
    else if (!ragTucked) {
      // (his rag in his hanging right hand: the fist closed round it along the hand's own length as it swings; held
      // upright in the world, the fist turned over as the arm swung past straight down, 90 degrees in four frames)
      j.root.updateMatrixWorld(true);
      j.handR.getWorldQuaternion(turn);
      hold(handR, ragDir.set(0, -1, 0.35).normalize().applyQuaternion(turn), RAG_R);
      rag.quaternion.copy(ragRest);
      seatHeld(handR, rag, RAG_R);
    } else poseHand(handR, 0.3, 0.05, 0, 0, 0);
    // (no hand moved further than a hand moves in a frame, whatever asked it to)
    for (const left of [true, false]) capArmStep(left, dt);
    // (each hand's turn eased from the last frame's, what it holds turned with it: a grip changed for another, the
    // poker's for the rag's, turned the wrist over in a frame)
    for (const [i, h] of [handL, handR].entries()) easeWrist(h, i, dt);
    // (his rag's turn in his hand eased from the last frame's, never more than `RAG_TURN_MOST` a frame: from the free
    // hand's hold to the wipe's and back it was set at once, a half turn in a frame, `lab tavern`)
    if (rag.parent === j.handR && ragSeen) {
      const turned = ragWas.angleTo(rag.quaternion), most = RAG_TURN_MOST * Math.min(1, dt * 60);
      if (turned > most) rag.quaternion.copy(ragWas.slerp(rag.quaternion, most / turned));
    }
    ragSeen = rag.parent === j.handR;
    ragWas.copy(rag.quaternion);
    // (a thing just taken up eased from where it stood into the fist closing round it, before what each hand holds is
    // stood along its way (laid to the floor from its place eased, it went into the floor as it eased after), after all
    // that moves the hand: seated at once, it jumped the fist's 13 cm off its handle in a frame, `lab tavern`)
    if (seating && seating.t < 1 && seating.thing.parent) {
      j.root.updateMatrixWorld(true);
      seating.thing.getWorldPosition(seatAt);
      seatAt.lerp(seating.from, 1 - smooth(seating.t));
      seating.thing.parent.worldToLocal(seatAt);
      seating.thing.position.copy(seatAt);
    }
    // (what each hand holds stood along its way again, after the arm's and the wrist's limits turned the hand back part
    // of the way: turned with it, a broom just taken up pointed back through his legs and a sweeping broom up past his
    // shoulder, `lab tavern`)
    for (const [i, held] of heldWay.entries()) {
      const goal = i === 0 ? p.left : p.right;
      if (!held || !goal?.held || held.thing.parent === null) { heldWay[i] = null; continue; }
      j.root.updateMatrixWorld(true);
      held.thing.parent.getWorldQuaternion(turn).invert();
      const stand = (way: THREE.Vector3) => {
        held.thing.quaternion.copy(turnInv.copy(turn).multiply(along.setFromUnitVectors(up, way)).multiply(spinQ.setFromAxisAngle(up, held.spin)));
      };
      if (!held.floor) {
        stand(held.dir);
        continue;
      }
      // (laid from the fist as it is now down to the floor along its way across it, then its lowest point read and the
      // lay corrected: its head rolls on the handle and its splayed tufts reach lower at one side, and laid by its length
      // alone it went 5 cm into the floor and swept 3 cm over it, `lab tavern`)
      const fist = held.thing.getWorldPosition(floorAt).y, level = held.floor.level, flat = held.dir.clone().setY(0).normalize();
      // (by its slope: the share of its length that goes down, from where its length alone puts the floor)
      const reach = held.floor.reach;
      let down = clamp((fist - level) / reach, 0.05, 1);
      for (let pass = 0; pass < FLOOR_PASSES; pass++) {
        stand(held.dir.copy(flat).multiplyScalar(Math.sqrt(1 - down * down)).add(floorAt.set(0, -down, 0)).normalize());
        const low = lowestOf(held.thing) - level;
        // (swept, its lowest point brought onto the floor; carried, only kept off it)
        if (held.floor.touch ? Math.abs(low) < 0.001 : low >= 0) break;
        down = clamp(down + low / reach, 0.05, 1);
      }
    }
    // (everything he holds placed where his hands are now: the leg IK's working leaves world matrices of its own, and
    // read after it his hands stood 13 m under the floor with the mug in them, `lab tavern`)
    j.root.updateMatrixWorld(true);
  }

  /** One arm's move this frame held to `ARM_STEP_MOST` of its hand's travel in his chest's frame (his torso's own moves
   *  are eased apart): past it, the arm goes
   *  as far towards its new pose as that allows, from where it was. A goal, a hold or a blend changed between frames
   *  left one of his hands 10 to 17 cm from the frame before, a twitch (`lab tavern`), each from a cause of its own. */
  function capArmStep(left: boolean, dt: number): void {
    const i = left ? 0 : 1, [shoulder, elbow] = left ? [j.shoulderL, j.elbowL] : [j.shoulderR, j.elbowR];
    const hand = left ? j.handL : j.handR;
    j.root.updateMatrixWorld(true);
    j.chest.worldToLocal(hand.getWorldPosition(armHand));
    const was = armWas[i];
    if (was.seen && dt > 0) {
      // (as far as its speed may change from the last frame's, and no further than its most a frame)
      const frames = Math.min(1, dt * 60), wanted = armMove.subVectors(armHand, was.hand);
      const change = armChange.subVectors(wanted, was.v), changeMost = ARM_SPEED_CHANGE_MOST * frames;
      if (change.length() > changeMost) change.setLength(changeMost);
      const allowed = armAllowed.copy(was.v).add(change);
      if (allowed.length() > ARM_STEP_MOST * frames) allowed.setLength(ARM_STEP_MOST * frames);
      const most = Math.max(allowed.length(), 1e-4);
      // (and its elbow no further a frame, nor bent more: an elbow swung round the line from the shoulder to a wrist
      // that stays read as a flick, 17 degrees in a frame, `lab tavern`)
      const elbowMost = ELBOW_MOVE_MOST * frames, bendMost = ELBOW_BEND_MOST * frames;
      const toQs = armToQs.copy(shoulder.quaternion), toQe = armToQe.copy(elbow.quaternion);
      /** how far over its most a frame the arm is at `t` of the way from the last pose to this one (1 at its most) */
      const over = (t: number) => {
        shoulder.quaternion.slerpQuaternions(was.qs, toQs, t);
        elbow.quaternion.slerpQuaternions(was.qe, toQe, t);
        j.root.updateMatrixWorld(true);
        const handMoved = j.chest.worldToLocal(hand.getWorldPosition(armHand)).distanceTo(was.hand);
        const elbowMoved = j.chest.worldToLocal(elbow.getWorldPosition(armElbow)).distanceTo(was.elbow);
        const bent = Math.abs(bendOf(elbow.quaternion) - was.bend);
        return Math.max(handMoved / most, elbowMoved / elbowMost, bent / bendMost);
      };
      if (over(1) > 1 + 1e-3) {
        // (the share of the way that keeps it within them, found by halving: an arm swings on arcs, so a share of the
        // turn isn't that share of the way, and a guess overshot it)
        let lo = 0, hi = 1;
        for (let k = 0; k < 7; k++) {
          const mid = (lo + hi) / 2;
          if (over(mid) <= 1) lo = mid; else hi = mid;
        }
        over(lo);
      }
    }
    j.chest.worldToLocal(elbow.getWorldPosition(was.elbow));
    was.bend = bendOf(elbow.quaternion);
    was.qs.copy(shoulder.quaternion);
    was.qe.copy(elbow.quaternion);
    if (was.seen) was.v.subVectors(armHand, was.hand); else was.v.set(0, 0, 0);
    was.hand.copy(armHand);
    was.seen = true;
  }

  /** `h`'s turn this frame (its `vis`) eased from the last, and whatever its hand holds turned by as much about it. */
  function easeWrist(h: Hand, i: number, dt: number): void {
    const want = wristWant.copy(h.vis.quaternion);
    if (!wristSet[i] || dt <= 0) {
      wristWas[i].copy(want);
      wristSet[i] = true;
      return;
    }
    // (and never more than `WRIST_TURN_MOST` a frame: a grip's turn going round fast as the elbow straightens)
    const apart = wristWas[i].angleTo(want), share = 1 - Math.exp(-WRIST_EASE * dt);
    const turnMost = wristQuick[i] > 0 ? WRIST_GRASP_MOST : WRIST_TURN_MOST;
    wristQuick[i] = Math.max(0, wristQuick[i] - dt);
    wristWas[i].slerp(want, apart > 1e-6 ? Math.min(wristQuick[i] > 0 ? 1 : share, (turnMost * Math.min(1, dt * 60)) / apart) : 1);
    h.vis.quaternion.copy(wristWas[i]);
    const by = wristBy.copy(wristWas[i]).multiply(want.invert());
    for (const thing of h.vis.parent!.children) {
      if (thing === h.vis) continue;
      thing.position.applyQuaternion(by);
      thing.quaternion.premultiply(by);
    }
  }

  pose(0, { speed: 0, bend: 0, crouch: 0, look: null, left: null, right: null });

  return {
    root: j.root,
    pose,
    carry(side, thing) {
      (side === 'left' ? j.handL : j.handR).attach(thing);
      // (the hand closing on it quickly, a grasp's turn: eased at an open hand's pace, the thing was turned back with it,
      // and a broom just taken up pointed back through his legs, `lab tavern`)
      wristQuick[side === 'left' ? 0 : 1] = GRASP_QUICK;
      seating = { thing, from: thing.getWorldPosition(new THREE.Vector3()), t: 0 };
    },
    drop(thing, to) { to.attach(thing); },
    rag,
    tuckRag(tucked) {
      if (tucked === ragTucked) return;
      ragTucked = tucked;
      if (tucked) {
        j.hips.add(rag);
        rag.position.copy(TUCKED);
        rag.quaternion.identity();
      } else j.handR.add(rag);
    },
    get ragTucked() { return ragTucked; },
    placed() { replant = true; easedSet[0] = easedSet[1] = false; weight[0] = weight[1] = blendOf[0] = blendOf[1] = 0; wristSet[0] = wristSet[1] = false; armWas[0].seen = armWas[1].seen = false; },
    get placings() { return placings; },
    hands(out) {
      for (const [i, h] of [handL, handR].entries()) {
        h.vis.updateWorldMatrix(true, false);
        h.vis.localToWorld(out[i].set(0, -0.085, 0.03));
      }
    },
    feet(out) {
      j.ankleL.getWorldPosition(out[0]);
      j.ankleR.getWorldPosition(out[1]);
      return [legs.feet[0].state === 'plant', legs.feet[1].state === 'plant'];
    },
    ankles: [j.ankleL, j.ankleR],
    joints: j,
    parts,
    legs,
  };
}

/** A rag bunched in a fist and hanging from it in soft folds, its hem uneven: its origin where the fist holds it,
 *  hanging down its -y. */
function ragGeometry(): THREE.BufferGeometry {
  const rng = mulberry(29), rows: THREE.Vector3[][] = [], N = 24, phase = rng() * 6;
  for (let k = 0; k <= 8; k++) {
    const s = k / 8, row: THREE.Vector3[] = [];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      // (gathered tight in the fist, opening as it falls; deep folds round it, flattened front to back)
      const r = lerp(0.012, 0.055, smooth(Math.min(1, s * 1.4))) * (1 + 0.28 * Math.sin(a * 5 + phase) * s);
      const hem = s * (0.13 + 0.03 * Math.sin(a * 3 + phase * 2) + 0.015 * Math.sin(a * 7));
      row.push(V(r * Math.cos(a), 0.012 - hem, r * Math.sin(a) * 0.55));
    }
    rows.push(row);
  }
  return rowsSurface(rows, 4);
}

/** His bare upper arm under the rolled sleeve, on its shoulder (hanging along -y): from inside the sleeve down to the
 *  cuff's foot, closed there in a dome, a little narrower than the cuff's ring so it never shows through the cloth. */
function upperArmGeometry(): THREE.BufferGeometry {
  return new THREE.LatheGeometry([
    [0.0005, -0.318], [0.022, -0.314], [0.04, -0.305], [0.052, -0.292], [0.058, -0.27], [0.06, -0.22], [0.062, -0.15],
  ].map(([r, y]) => new THREE.Vector2(r, y)), 20);
}

/** A bare forearm on its elbow (hanging along -y to the wrist at `fore`): fuller below the elbow where its muscles
 *  are, narrowing to the wrist, and flatter than round, wider across than deep, more so at the wrist; a little uneven.
 *  A round lathe tapered straight to the wrist read as "a featureless cone". */
function forearmGeometry(fore: number, seed: number): THREE.BufferGeometry {
  const ph = mulberry(seed)() * 6;
  const g = new THREE.LatheGeometry([
    [0.026, fore - 0.012], [0.029, fore + 0.02], [0.032, fore * 0.78], [0.04, fore * 0.55], [0.049, fore * 0.3], [0.053, -0.04],
    // (closed over the elbow in a dome inside a 6 cm round of its joint: open there, a bent arm showed the cone's hollow
    // end inside the cuff's ring, "Elbow has a hole when doing animations/tasks", Kenneth's round 4; reaching 12 cm up
    // past the joint, the dome swung out through the side of the rolled cuff as the elbow bent, skin through the cloth)
    [0.052, 0.02], [0.05, 0.034], [0.04, 0.046], [0.025, 0.055], [0.0005, 0.06],
  ].map(([r, y]) => new THREE.Vector2(r, y)), 24);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), a = Math.atan2(x, z), t = clamp((y - fore) / -fore, 0, 1);
    // (the muscles' belly a third down from the elbow, on its outer side; the wrist flat)
    const belly = 1 + 0.08 * Math.exp(-(((t - 0.72) / 0.16) ** 2)) * Math.max(0, Math.sin(a)) + 0.012 * Math.sin(3 * a + ph);
    pos.setXYZ(i, x * belly * lerp(1.12, 1.02, t), y, z * belly * lerp(0.74, 0.95, t));
  }
  g.computeVertexNormals();
  return g;
}

/** His clothes on the rig: the striped shirt, its placket buttoned, soft folds at the waist, its collar under a red
 *  neckerchief knotted at the throat; the long oiled-leather apron, a bib on his chest on straps over his shoulders
 *  and a skirt from his waist to below his knees, stitched round its edges, a pocket on its front; a striped linen
 *  towel over his left shoulder; sleeves rolled in a thick cuff above the elbow, bare forearms; trousers and boots. */
function dressBody(j: Joints, add: Add, M: Mats): { skirt: THREE.Mesh; cols: number; sewn: THREE.Mesh[]; belly: THREE.Mesh } {
  let skirt: THREE.Mesh | undefined, belly: THREE.Mesh | undefined;
  const sewn: THREE.Mesh[] = [];
  const N = 40;
  const ring = (y: number, w: number, d: number, fold: number, belly: number, seed: number) => {
    const row: THREE.Vector3[] = [];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const [x, z] = oval(a, w, d);
      const f = 1 + fold * (Math.sin(a * 7 + seed) * 0.6 + Math.sin(a * 13 + seed * 2) * 0.4) * (0.6 + 0.4 * Math.cos(a));
      row.push(new THREE.Vector3(x * f, y, z * f + belly * Math.max(0, Math.cos(a)) ** 2));
    }
    return row;
  };
  type Row = [number, number, number, number, number];
  // --- the shirt: chest, up over the shoulders to the collar ---
  const chestRows: Row[] = [
    [-0.1, 0.205, 0.165, 0.012, 0.04], [0.0, 0.208, 0.16, 0.01, 0.03], [0.08, 0.215, 0.152, 0.008, 0.015],
    [0.14, 0.222, 0.142, 0.006, 0], [0.185, 0.225, 0.13, 0.004, 0], [0.215, 0.208, 0.115, 0.002, 0],
    [0.238, 0.16, 0.096, 0, 0], [0.255, 0.105, 0.08, 0, 0], [0.285, 0.062, 0.064, 0, 0],
  ];
  // (gathered where it's tucked in at the waist: deeper folds low)
  const waistRows: Row[] = [
    [-0.12, 0.2, 0.17, 0.022, 0.03], [-0.06, 0.2, 0.172, 0.018, 0.05], [0.02, 0.198, 0.17, 0.014, 0.06],
    [0.1, 0.196, 0.165, 0.012, 0.05], [0.2, 0.196, 0.16, 0.01, 0.04],
  ];
  // (the chest's hem laid on the belly's own cloth where it overlaps it, its width, depth and folds the belly's there:
  // a centimetre wider, a stripe at the same angle round him stood a few mm further out below the hem, and seen from
  // behind or the side each stepped sideways at it, from PC Manager on Victor's review of #704)
  const hemOnSpine = j.chest.position.y + chestRows[0][0];
  const hemAt = waistRows.findIndex((r) => r[0] >= hemOnSpine), hemHi = waistRows[Math.max(0, hemAt)];
  const hemLo = waistRows[Math.max(0, hemAt - 1)], hemT = hemHi === hemLo ? 0 : (hemOnSpine - hemLo[0]) / (hemHi[0] - hemLo[0]);
  const [, hemW, hemD, hemF, hemB] = hemLo.map((v, k) => lerp(v, hemHi[k], hemT));
  const chestRings = chestRows.map(([y, w, d, f, b], k) => (k === 0 ? ring(y, hemW, hemD, hemF, hemB, 2.4) : ring(y, w, d, f, b, 1.1)));
  stripesRound(add(rowsSurface(chestRings, 1.2), M.shirt, j.chest, 'shirt chest'), N + 1);
  belly = add(rowsSurface(waistRows.map(([y, w, d, f, b]) => ring(y, w, d, f, b, 2.4)), 1.2), M.shirt, j.spine, 'shirt belly');
  stripesRound(belly, N + 1);
  const front = (rows: Row[], y: number) => {
    const at = rows.findIndex((r) => r[0] >= y), hi = rows[Math.max(0, at)], lo = rows[Math.max(0, at - 1)];
    const t = hi === lo ? 0 : (y - lo[0]) / (hi[0] - lo[0]);
    return { w: lerp(lo[1], hi[1], t), d: lerp(lo[2], hi[2], t), b: lerp(lo[4], hi[4], t) };
  };
  /** a point on the body's front at (x, y), `lift` off it */
  const onFront = (rows: Row[], x: number, y: number, lift: number) => {
    const { w, d, b } = front(rows, y), a = Math.asin(clamp(x / (w + 0.01), -1, 1)), [, z] = oval(a, w, d);
    return new THREE.Vector3(x, y, z + b * Math.cos(a) ** 2 + lift);
  };
  // --- the shirt's placket down his chest above the bib, two bone buttons on it ---
  {
    const rows: THREE.Vector3[][] = [];
    for (let k = 0; k <= 4; k++) {
      const y = lerp(0.2, 0.262, k / 4), row: THREE.Vector3[] = [];
      for (let i = 0; i <= 2; i++) row.push(onFront(chestRows, lerp(-0.012, 0.012, i / 2), y, 0.004));
      rows.push(row);
    }
    stripesByAngle(add(rowsSurface(rows, 3), M.shirt, j.chest, 'shirt placket'));
    for (const y of [0.21, 0.235]) {
      add(new THREE.CylinderGeometry(0.0055, 0.0055, 0.003, 10).rotateX(Math.PI / 2), M.bone, j.chest, 'shirt button', false)
        .position.copy(onFront(chestRows, 0, y, 0.007));
    }
  }
  // --- the shirt's collar standing up round his neck behind the neckerchief, highest at the back: with none, his
  // neck showed long and bare from the shirt's neckline to his hair, "slightly too long neck... especially when he
  // looks down" ---
  {
    const rows: THREE.Vector3[][] = [];
    // (outside his neck's base, about 6.6 cm round and set back under his skull: inside it, the collar showed nowhere at
    // his back, a loose flap at his throat's side)
    // (its foot on the shirt's shoulders, wider, so no skin shows under it)
    for (const [y, r, back] of [[0.236, 0.096, 0], [0.265, 0.083, 0.014], [0.293, 0.077, 0.03]] as const) {
      const row: THREE.Vector3[] = [];
      for (let i = 0; i <= 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        // (cut low at his throat, under the knot, standing at the back and sides)
        const front = Math.max(0, Math.cos(a)) ** 3;
        row.push(new THREE.Vector3(Math.sin(a) * r, y + back * (1 - front) - (y - 0.236) * front, Math.cos(a) * r * (Math.cos(a) < 0 ? 1.15 : 0.95) - 0.005));
      }
      rows.push(row);
    }
    stripesRound(add(rowsSurface(rows, 2), M.shirt, j.chest, 'shirt collar'), 25);
  }
  // --- the neckerchief: a red band round his neck, a knot at his throat, its two ends falling as flat cloth ---
  {
    const band: THREE.Vector3[] = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2, [x, z] = oval(a, 0.07, 0.07, 2);
      band.push(new THREE.Vector3(x, 0.275 - 0.012 * Math.cos(a), z));
    }
    add(cord(band, 0.013, true, 36), M.scarf, j.chest, 'neckerchief');
    const knot = add(new THREE.TorusKnotGeometry(0.011, 0.006, 36, 6, 2, 3), M.scarf, j.chest, 'neckerchief knot', false);
    knot.position.set(0, 0.252, 0.082);
    knot.rotation.set(0.3, 0, 0);
    // (each end a narrowing strip of the cloth, falling down his chest and a little out)
    for (const s of [1, -1]) {
      const rows: THREE.Vector3[][] = [];
      for (let k = 0; k <= 6; k++) {
        const q = k / 6, x = s * (0.006 + 0.03 * q), y = 0.248 - 0.085 * q, z = 0.09 + 0.022 * q - 0.012 * q * q;
        const w = lerp(0.016, 0.004, q);
        rows.push([new THREE.Vector3(x - w, y, z), new THREE.Vector3(x + w, y, z + 0.004 * Math.sin(q * 6))]);
      }
      add(rowsSurface(rows, 6), M.scarf, j.chest, 'neckerchief end', false);
    }
  }
  // --- the apron's bib: a panel on his chest, stitched round, on straps over his shoulders crossing his back ---
  const BIB = { from: -0.1, to: 0.19, half: [0.165, 0.11] as const };
  {
    const rows: THREE.Vector3[][] = [];
    for (let k = 0; k <= 8; k++) {
      const y = lerp(BIB.from, BIB.to, k / 8), half = lerp(BIB.half[0], BIB.half[1], k / 8), row: THREE.Vector3[] = [];
      for (let i = 0; i <= 8; i++) row.push(onFront(chestRows, lerp(-half, half, i / 8), y, 0.012));
      rows.push(row);
    }
    add(rowsSurface(rows, 2), M.apron, j.chest, 'apron bib');
    // (its stitching: a line of pale thread a centimetre in from its edges)
    const edge: THREE.Vector3[] = [];
    for (let k = 0; k <= 8; k++) edge.push(onFront(chestRows, -lerp(BIB.half[0], BIB.half[1], k / 8) + 0.01, lerp(BIB.from, BIB.to, k / 8) - 0.01, 0.0145));
    for (let i = 0; i <= 6; i++) edge.push(onFront(chestRows, lerp(-BIB.half[1] + 0.01, BIB.half[1] - 0.01, i / 6), BIB.to - 0.01, 0.0145));
    for (let k = 8; k >= 0; k--) edge.push(onFront(chestRows, lerp(BIB.half[0], BIB.half[1], k / 8) - 0.01, lerp(BIB.from, BIB.to, k / 8) - 0.01, 0.0145));
    add(cord(edge, 0.0012, false, 160), M.thread, j.chest, 'apron stitching', false);
    for (const s of [1, -1]) {
      const pts = [
        onFront(chestRows, s * 0.095, 0.185, 0.014), new THREE.Vector3(s * 0.11, 0.245, 0.06), new THREE.Vector3(s * 0.12, 0.258, -0.02),
        new THREE.Vector3(s * 0.1, 0.22, -0.11), new THREE.Vector3(-s * 0.04, 0.06, -0.17), new THREE.Vector3(-s * 0.13, -0.08, -0.165),
      ];
      add(cord(pts, 0.007, false, 30), M.strap, j.chest, 'apron strap');
      const ring = add(new THREE.TorusGeometry(0.011, 0.0028, 6, 14), M.brass, j.chest, 'apron buckle', false);
      ring.position.copy(onFront(chestRows, s * 0.095, 0.175, 0.016));
    }
  }
  // --- the apron's skirt: from his waist to below his knees round his front and sides, stitched at its hem, a pocket
  // on its front, a tie at the back ---
  {
    const at = (t: number, i: number) => {
      const y = lerp(-0.64, 0.06, t), w = lerp(0.24, 0.21, t), d = lerp(0.2, 0.18, t), half = lerp(0.23, 0.19, t);
      const x = lerp(-half, half, i / 10), a = Math.asin(clamp(x / (w + 0.01), -1, 1)), [, z] = oval(a, w, d);
      return new THREE.Vector3(x, y, z + lerp(0.015, 0.04, t) * Math.cos(a) ** 2 + 0.02 + 0.008 * Math.sin(i * 1.9 + t * 9) * (1 - t));
    };
    const lap: THREE.Vector3[][] = [];
    for (let k = 0; k <= 12; k++) {
      const row: THREE.Vector3[] = [];
      for (let i = 0; i <= 10; i++) row.push(at(k / 12, i));
      lap.push(row);
    }
    skirt = add(rowsSurface(lap, 2), M.apron, j.hips, 'apron skirt');
    const hem: THREE.Vector3[] = [];
    for (let i = 0; i <= 20; i++) hem.push(at(0.025, i / 2).add(new THREE.Vector3(0, 0, 0.003)));
    sewn.push(add(cord(hem, 0.0012, false, 80), M.thread, j.hips, 'apron hem stitching', false));
    // (a pocket: a patch of the leather over the skirt, its sides and foot stitched)
    const pocket: THREE.Vector3[][] = [];
    for (let k = 0; k <= 3; k++) {
      const row: THREE.Vector3[] = [];
      for (let i = 3; i <= 7; i++) row.push(at(lerp(0.45, 0.66, k / 3), i).add(new THREE.Vector3(0, 0, 0.005)));
      pocket.push(row);
    }
    sewn.push(add(rowsSurface(pocket, 2), M.apron, j.hips, 'apron pocket', false));
    const seam = [at(0.66, 3.1), at(0.45, 3.1), at(0.45, 6.9), at(0.66, 6.9)].map((p) => p.add(new THREE.Vector3(0, 0, 0.008)));
    sewn.push(add(cord(seam, 0.0012, false, 40), M.thread, j.hips, 'apron pocket stitching', false));
    add(rowsSurface([ring(-0.005, 0.212, 0.182, 0, 0.05, 0), ring(0.03, 0.21, 0.18, 0, 0.05, 0)], 2), M.strap, j.spine, 'apron tie');
  }
  // --- the towel over his left shoulder: down his chest a hand's length, over the shoulder and down his back, its
  // cloth folded in long creases along it ---
  {
    const path = [
      new THREE.Vector3(0.15, 0.0, 0.17), new THREE.Vector3(0.155, 0.12, 0.155), new THREE.Vector3(0.16, 0.215, 0.105),
      new THREE.Vector3(0.16, 0.25, 0.0), new THREE.Vector3(0.16, 0.215, -0.105), new THREE.Vector3(0.155, 0.1, -0.145),
      new THREE.Vector3(0.15, -0.02, -0.15),
    ];
    const curve = new THREE.CatmullRomCurve3(path), rows: THREE.Vector3[][] = [];
    for (let k = 0; k <= 20; k++) {
      const p = curve.getPointAt(k / 20), out = p.z > 0 ? 1 : -1, row: THREE.Vector3[] = [];
      for (let i = 0; i <= 8; i++) {
        const x = lerp(-0.05, 0.05, i / 8), crease = 0.006 * Math.sin(i * Math.PI * 0.9 + k * 0.4);
        row.push(new THREE.Vector3(p.x + x, p.y, p.z + out * (0.012 + crease)));
      }
      rows.push(row);
    }
    add(rowsSurface(rows, 4), M.towel, j.chest, 'towel');
  }
  // --- trousers from the hips to the boots ---
  add(rowsSurface([0, 1, 2, 3, 4].map((k) => ring(lerp(-0.1, 0.08, k / 4), lerp(0.215, 0.2, k / 4), 0.175, 0.012, lerp(0.02, 0.03, k / 4), 5.1)), 1.2),
    M.trousers, j.hips, 'trouser seat');
  // (his trousers fall straight over his boots to the instep, their hem flared a little; the boots' shafts ride his
  // shins inside them and their feet his ankles, so nothing of a boot's top shows. A cylinder on the ankle wider than
  // the trouser leg, its top open with the leg standing inside it, read "like some logs... not attached to his leg")
  const shin = j.P.shinL;
  for (const [thigh, knee, ankle, s] of [[j.thighL, j.kneeL, j.ankleL, 1], [j.thighR, j.kneeR, j.ankleR, -1]] as const) {
    add(sleeve([[0.08, -j.P.thighL - 0.02], [0.086, -0.3], [0.092, -0.15], [0.098, 0.02]], 0.04, 1 + s), M.trousers, thigh, 'trouser thigh');
    add(sleeve([[0.067, -shin + 0.022], [0.066, -shin + 0.05], [0.062, -0.32], [0.061, -0.24], [0.064, -0.15], [0.07, 0], [0.078, 0.06]], 0.035, 3 + s),
      M.trousers, knee, 'trouser');
    add(sleeve([[0.044, -shin - 0.035], [0.049, -shin - 0.01], [0.052, -shin + 0.04], [0.05, -shin + 0.1], [0.047, -shin + 0.14]], 0.01, 15 + s),
      M.boot, knee, 'boot shaft');
    add(bootFoot(), M.boot, ankle, 'boot foot');
    // (its sole up to the upper's foot and inside its edge: thin and wider than it, a gap between, it read as a
    // slab the shoe stood on)
    add(bootSole(-0.012, 0, 1, 0.02), M.sole, ankle, 'boot sole');
    add(bootSole(-0.014, 0, 0.3, 0.032), M.sole, ankle, 'boot heel');
  }
  // --- the sleeves: the shirt's, full, rolled above the elbow in a thick cuff of two turns; his forearms bare below ---
  for (const [shoulder, elbow, s] of [[j.shoulderL, j.elbowL, 1], [j.shoulderR, j.elbowR, -1]] as const) {
    // (closed at its top over the shoulder joint: open, the shirt's inside showed there as a hole, "small holes from
    // the top of his shoulder")
    stripesAlong(add(sleeve([[0.066, -0.26], [0.074, -0.2], [0.08, -0.1], [0.086, -0.03], [0.084, 0.03], [0.058, 0.075], [0.024, 0.09], [0.0005, 0.094]], 0.08, 5 + s),
      M.shirt, shoulder, 'sleeve'), STRIPES.sleeve);
    // (the cuff: two turns of the shirt rolled up, the lower one fatter)
    stripesAlong(add(sleeve([[0.064, -0.3], [0.076, -0.292], [0.079, -0.276], [0.074, -0.264], [0.07, -0.262]], 0.03, 7 + s), M.shirt, shoulder, 'sleeve cuff'), STRIPES.sleeve);
    stripesAlong(add(sleeve([[0.07, -0.265], [0.078, -0.258], [0.08, -0.247], [0.075, -0.238], [0.066, -0.235]], 0.03, 9 + s), M.shirt, shoulder, 'sleeve cuff'), STRIPES.sleeve);
    const fore = -j.P.foreL;
    add(forearmGeometry(fore, 13 + s), M.arm, elbow, 'forearm');
    // (his bare upper arm inside the rolled sleeve, closed at its foot: looking up into the cuff from below or behind,
    // the shirt's inside and the dark past it showed through, Kenneth's round 4)
    add(upperArmGeometry(), M.arm, shoulder, 'upper arm');
  }
  return { skirt: skirt!, cols: 11, sewn, belly: belly! };
}

const _solidInv = new THREE.Matrix4(), _inSolid = new THREE.Vector3();
/** `point` (world) moved out of `solid` grown by `r`, along the line from its middle, if it's inside */
function outOfSolid(point: THREE.Vector3, solid: Solid, r: number): void {
  solid.at.updateWorldMatrix(true, false);
  _solidInv.copy(solid.at.matrixWorld).invert();
  _inSolid.copy(point).applyMatrix4(_solidInv).sub(solid.c);
  const rx = solid.r.x + r, ry = solid.r.y + r, rz = solid.r.z + r;
  const k = Math.hypot(_inSolid.x / rx, _inSolid.y / ry, _inSolid.z / rz);
  if (k >= 1 || k < 1e-6) return;
  _inSolid.multiplyScalar(1 / k).add(solid.c).applyMatrix4(solid.at.matrixWorld);
  point.copy(_inSolid);
}

/** His shirt as one cloth (from Victor's review: "why stripes not matching /aligned"): its stripes laid by his body,
 *  never by each part's own UVs. Round his trunk a part's stripes are placed by the angle round him from his front, a
 *  whole number of repeats round, so they meet across every seam between the parts (the chest's, the belly's, the
 *  collar's, the placket's) and close on themselves at his spine; along each sleeve they run its length, as many round
 *  it as its girth holds at the trunk's spacing (about 9 cm a repeat). Laid by each part's own UVs, the stripes broke
 *  at every seam, met in a V down his back and ran at their own spacing on the sleeves. */
const STRIPES = { round: 14, sleeve: 6 };

/** a ring-made part (merchant.ts `rowsSurface`, rows of `n` points from his front round, closing on itself): each
 *  point's u by its true angle round him, unwrapped along its ring (by its place in the ring, the rings being ovals of
 *  their own widths, the same place was another angle at his sides, and the stripes stepped there) */
function stripesRound(mesh: THREE.Mesh, n: number): void {
  const uv = mesh.geometry.attributes.uv as THREE.BufferAttribute, pos = mesh.geometry.attributes.position;
  for (let row = 0; row * n < uv.count; row++) {
    let was = 0;
    for (let i = 0; i < n; i++) {
      const k = row * n + i;
      let a = Math.atan2(pos.getX(k), pos.getZ(k));
      // (round from his front: each point a little further round than the last, its last back at his front)
      while (a < was - Math.PI) a += Math.PI * 2;
      while (a > was + Math.PI) a -= Math.PI * 2;
      if (i === n - 1) a = Math.PI * 2 + Math.atan2(pos.getX(k), pos.getZ(k));
      was = a;
      uv.setX(k, (a / (Math.PI * 2)) * STRIPES.round);
    }
  }
  uv.needsUpdate = true;
}

/** a patch on his front (the placket): each point's u by its angle round him, as the rings' */
function stripesByAngle(mesh: THREE.Mesh): void {
  const uv = mesh.geometry.attributes.uv as THREE.BufferAttribute, pos = mesh.geometry.attributes.position;
  for (let k = 0; k < uv.count; k++) {
    // (from -half a turn to half: the placket is on his front, where a turn's wrap would cut it)
    const a = Math.atan2(pos.getX(k), pos.getZ(k));
    uv.setX(k, (a / (Math.PI * 2)) * STRIPES.round);
  }
  uv.needsUpdate = true;
}

/** a lathed sleeve's piece: its u round it (0 to 1) made `repeats` round, so its stripes run along it */
function stripesAlong(mesh: THREE.Mesh, repeats: number): void {
  const uv = mesh.geometry.attributes.uv as THREE.BufferAttribute;
  for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) * repeats);
  uv.needsUpdate = true;
}

/** The shirt's belly (on his spine) turned with his chest's twist on it, by none of it at the belly's foot and all of
 *  it at its top, under the chest's piece: the two pieces hang on two joints, and as his chest turned against his hips
 *  (his walk's swing, his looking round) their stripes stepped a stripe apart at the seam between them (Victor: "why
 *  stripes not matching /aligned"). */
class ShirtTwist {
  private readonly rest: Float32Array;
  private readonly low: number;
  private readonly high: number;
  private readonly qWas = new THREE.Quaternion(0, 0, 0, 0);

  /** `seam`: where on the spine the chest's piece ends (its whole turn reached there; at the belly's top it was 87% of it,
   *  and the stripes stepped half a stripe at the seam) */
  constructor(private readonly mesh: THREE.Mesh, private readonly chest: THREE.Object3D, seam: number) {
    const pos = mesh.geometry.attributes.position as THREE.BufferAttribute;
    this.rest = Float32Array.from(pos.array as Float32Array);
    let low = Infinity, high = -Infinity;
    for (let i = 1; i < this.rest.length; i += 3) { low = Math.min(low, this.rest[i]); high = Math.max(high, this.rest[i]); }
    this.low = low;
    this.high = Math.min(high, seam);
  }

  /** laid for the frame, the chest's turn on the spine as the pose left it, about the chest joint: its twist and its
   *  lean both (taken by its twist alone, the chest's lean over his walk still stepped the stripes at his sides) */
  lay(): void {
    const q = this.chest.quaternion;
    if (Math.abs(q.x - this.qWas.x) + Math.abs(q.y - this.qWas.y) + Math.abs(q.z - this.qWas.z) < 1e-5) return;
    this.qWas.copy(q);
    const pivot = this.chest.position;
    const pos = this.mesh.geometry.attributes.position as THREE.BufferAttribute, arr = pos.array as Float32Array, rest = this.rest;
    for (let i = 0; i < arr.length; i += 3) {
      const share = smooth(clamp((rest[i + 1] - this.low) / (this.high - this.low), 0, 1));
      _twistQ.identity().slerp(q, share);
      _twistP.set(rest[i] - pivot.x, rest[i + 1] - pivot.y, rest[i + 2] - pivot.z).applyQuaternion(_twistQ).add(pivot);
      arr[i] = _twistP.x;
      arr[i + 1] = _twistP.y;
      arr[i + 2] = _twistP.z;
    }
    pos.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
  }
}

const _twistQ = new THREE.Quaternion(), _twistP = new THREE.Vector3();

/** a hinge joint's bend (rad), from its turn */
const bendOf = (q: THREE.Quaternion): number => 2 * Math.acos(Math.min(1, Math.abs(q.w)));
