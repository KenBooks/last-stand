// tools/lab hands: the hero's right hand alone in the studio, as it's sculpted: laid flat, open, relaxed, strained (a
// caster's, `strainHand`), in a fist and closed round a handle, each from the back, the palm, the thumb's side, the little finger's, the fingertips and
// three-quarters, with its size against a man's and how many triangles it's drawn with. A hand is judged here as it's
// made, before it's seen holding anything: through the eyes the fist fills a corner of the frame, and close up its
// fingers were tubes with rounded ends round the grip.
import * as THREE from 'three';
import type { Lab, Fixture, Report, Pictured, Tile } from './lab';
import { backdropDrawn, cameraOn, countsOf, drawnPixels, shoot, studio, type Shot } from './studio';
import { marked, seenThrough } from './seeThrough';
import { canvasOf, opaqueRows } from './pixels';
import { meshesOf, wearLook, type Look } from './looks';
import * as handsCode from '../../../src/entities/models/hands';
import { clench, closeFist, hold, poseHand, seat, strainHand, type Hand } from '../../../src/entities/models/hands';
import { disposeGeometries, joint } from '../../../src/entities/models/rig';
import { fistLine } from '../../../src/entities/models/warriorFists';
import * as shapes from '../../../src/entities/models/shapes';
import type { ArmBuild } from '../../../src/entities/models/build';
import { fistContact, wristBend } from './fistContact';

/** The game's hand code as far as it goes: `--ab` runs this on main's game, whose hands may not be sculpted yet. */
const sculpting = handsCode as Partial<typeof handsCode>;

export interface HandsOptions {
  fixture: Fixture;
  /** the poses and the views pictured (all by default) */
  poses?: string[];
  views?: string[];
  /** how the pictures are drawn (lit, wire or faces: looks.ts) */
  look?: Look;
  /** the hand in its glove, or bare (false); as the hero's is unless said */
  glove?: boolean;
  /** the warrior's bare fist in its wrap, or without it (false), to set beside a reference of a bare fist */
  wrap?: boolean;
  /** canaries: an empty studio, where nothing may be found drawn, and the hand built larger, which must measure so */
  canary?: boolean;
}

/** A way the studio's camera looks at the hand: from where in its own frame (the wrist at its origin, the fingers
 *  down -y, the palm facing -z, the thumb towards `thumb` along x), and which way is up the picture (+y, the wrist) */
interface HandView {
  name: string;
  from: (thumb: number) => THREE.Vector3Tuple;
  up?: THREE.Vector3Tuple;
  /** the part of the hand framed, close up (all of it and what it holds by default) */
  framed?: (hand: Hand) => THREE.Box3;
}

const VIEWS: HandView[] = [
  { name: 'back', from: () => [0, 0, 1] },
  { name: 'palm', from: () => [0, 0, -1] },
  { name: 'thumb', from: (thumb) => [thumb, 0, 0] },
  { name: 'little', from: (thumb) => [-thumb, 0, 0] },
  { name: 'tips', from: () => [0, -1, 0.25], up: [0, 0, 1] },
  { name: 'quarter', from: (thumb) => [thumb * 0.7, -0.2, 1] },
  // (as its owner sees it held out before him, the palm away: from behind the wrist, the fingers up the picture)
  { name: 'caster', from: (thumb) => [thumb * 0.15, 0.6, 1], up: [0, -1, 0] },
];

/** how far round the joints a close-up frames (m, on a hand of the game's size), and round a digit's outer joints
 *  to take its tip in too */
const CLOSE_MARGIN = 0.012;
const TIP_MARGIN = 0.03;

/** Close-ups, pictured only when asked for: the glove's cuffs over the fingers from the back, the web between the
 *  thumb and the index from the thumb's side (where a bent thumb pressed the glove into the skin), and the fingers'
 *  joints from the little finger's side, a little behind (their knuckles and the bones between them, #425). */
const CLOSE_UPS: HandView[] = [
  {
    name: 'cuffs',
    from: () => [0, -0.3, 1],
    framed: (hand) => roundJoints(hand, hand.f.flatMap((d) => d.j.slice(0, 2))),
  },
  {
    name: 'web',
    from: (thumb) => [thumb, 0, 0.4],
    framed: (hand) => roundJoints(hand, [...hand.thumb.j, hand.f[0].j[0], hand.f[0].j[1]]),
  },
  {
    name: 'joints',
    from: (thumb) => [-thumb, -0.2, 0.7],
    framed: (hand) => roundJoints(hand, hand.f.flatMap((d) => d.j.slice(1))),
  },
  // (the fingers out of the glove, as their owner sees them and from the palm's side: from play, their joints
  // swollen, "a hand of 90 year old, with bones problems", unseen in pictures of the whole hand)
  {
    name: 'fingers',
    from: (thumb) => [thumb * 0.15, 0.6, 1],
    up: [0, -1, 0],
    framed: (hand) => roundJoints(hand, hand.f.flatMap((d) => d.j.slice(1)), TIP_MARGIN),
  },
  {
    name: 'pads',
    from: (thumb) => [thumb * 0.15, 0.3, -1],
    up: [0, -1, 0],
    framed: (hand) => roundJoints(hand, hand.f.flatMap((d) => d.j.slice(1)), TIP_MARGIN),
  },
  {
    name: 'thumbtip',
    from: (thumb) => [thumb * 0.5, 0.3, 1],
    up: [0, -1, 0],
    framed: (hand) => roundJoints(hand, hand.thumb.j.slice(1), TIP_MARGIN),
  },
];

/** A box round `joints`' places, `margin` wider each way at the hand's scale. */
function roundJoints(hand: Hand, joints: THREE.Object3D[], margin = CLOSE_MARGIN): THREE.Box3 {
  const box = new THREE.Box3();
  for (const at of joints) box.expandByPoint(at.getWorldPosition(new THREE.Vector3()));
  return box.expandByScalar(margin * hand.vis.getWorldScale(new THREE.Vector3()).x);
}

/** A pose: what it does to the hand on its wrist joint, and what it adds to the picture (a handle). */
type Pose = (hand: Hand, wrist: THREE.Object3D) => void;

const POSES: Record<string, Pose> = {
  flat: (hand) => poseHand(hand, 0, 0),
  open: (hand) => poseHand(hand, 0.3, 0.45),
  relaxed: (hand) => poseHand(hand, 0.75, 0.12),
  // (the mage's free hand held into Void Lance's portal, half way into its kick)
  strained: (hand) => strainHand(hand, 0.75, 0.65),
  fist: (hand) => poseHand(hand, 1.45, 0),
  // The warrior's bare fist, as the guard closes it.
  clenched: clenchedFist,
  handle: closedRound,
};

/** the handle closed round (m: about a sword's grip) and its length */
const HANDLE_RADIUS = 0.016;
const HANDLE_LENGTH = 0.22;
const HANDLE = new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.8 });
const UP = new THREE.Vector3(0, 1, 0);

/** A man's hand (the median adult man's, as anatomy's tables give it): its length a share of his height, its breadth
 *  across the knuckles a share of its length, its thickness at the palm a share of its breadth; and each finger's
 *  length from its knuckle joint, a share of the middle finger's (index, ring, little). */
const MAN = { length: 0.109, breadth: 0.46, thickness: 0.38, fingers: [0.89, 0.95, 0.75] };
/** how far from a line across the hand a point may be and count as on it (m, the hand's own) */
const BAND = 0.01;
/** the least share of a picture a hand must cover to count as drawn, and how much larger the canary's is built */
const LEAST_DRAWN = 0.001;
const CANARY_SCALE = 1.1;
/** how many times the sculpt is timed (the middle time is said) */
const SCULPT_TIMES = 3;
/** An isolated wrist has room for the same forearm winding as the warrior's 270 mm forearm. */
const STUDIO_FOREARM = 0.27;
/** The wrap costs one small skinned draw, including both the hand turn and the exposed edges. */
const WRAP_TRIANGLES = 400;

/** The hand closed round a handle across its palm, as a fist holds a sword's grip, the handle drawn through it. */
function closedRound(hand: Hand, wrist: THREE.Object3D): void {
  // (the handle runs across the palm, its end towards the thumb, as models/hands.ts `fist` takes it)
  const across = new THREE.Vector3(-hand.s, 0, 0);
  const grip = joint(wrist);
  grip.quaternion.setFromUnitVectors(UP, across);
  seat(hand, grip, HANDLE_RADIUS);
  wrist.updateMatrixWorld(true);
  hold(hand, across, HANDLE_RADIUS);
  grip.add(new THREE.Mesh(new THREE.CylinderGeometry(HANDLE_RADIUS, HANDLE_RADIUS, HANDLE_LENGTH, 24), HANDLE));
}

function clenchedFist(hand: Hand, wrist: THREE.Object3D): void {
  if (sculpting.closeFist) sculpting.closeFist(hand, new THREE.Vector3(-hand.s, 0, 0));
  else handleFist(hand, wrist);
}

/** Canary from 0ffdabdfe. The phantom handle left the thumb beside the index and a hole inside the curl. */
function handleFist(hand: Hand, wrist: THREE.Object3D, across = new THREE.Vector3(-hand.s, 0, 0)): void {
  wrist.updateMatrixWorld(true);
  hold(hand, across, 0.012);
  clench(hand, [2.05, 1.6, 0.8], 0);
}

/** Canary for fused fingers: the fist's fingers each turned 9 degrees at the knuckle towards the middle finger. */
function fuseFingers(hand: Hand): void {
  const toMiddle = [1, 0, -1, -1];
  hand.f.forEach((finger, i) => {
    // (about the hand's length, as `closedFistPose` fans them)
    const turn = new THREE.Quaternion().setFromAxisAngle(UP, THREE.MathUtils.degToRad(9 * toMiddle[i] * -hand.s));
    finger.j[0].quaternion.premultiply(turn);
  });
  hand.vis.updateWorldMatrix(true, true);
}

/** Check both hands in the guard the player actually gets after punching, with a real elbow to judge the wrist. */
async function guardContact(lab: Lab, fixture: Fixture, canary?: boolean) {
  await lab.setup({ ...fixture, view: 'third', gear: 'bare', weapon: undefined, wear: [] });
  await lab.step(200);
  const [punched] = await lab.step(1, () => ({ m0: true }), () => lab.player.casting?.skill.impl.anim === 'punch');
  await lab.step(50);
  const hands = lab.model.hands;
  if (!punched || lab.player.casting || !hands || fistLine.R.lengthSq() === 0 || fistLine.L.lengthSq() === 0) {
    throw new Error('hands: the warrior did not return to his bare guard after the punch');
  }
  const lines: string[] = [], problems: string[] = [];
  for (const [side, wrist, elbow] of [['R', lab.joints.handR, lab.joints.elbowR],
    ['L', lab.joints.handL, lab.joints.elbowL]] as const) {
    const hand = hands[side];
    if (!hand || hand.glove.visible) throw new Error(`hands: the warrior's ${side} hand was not bare`);
    const reading = fistContact(hand, wristBend(hand, elbow));
    lines.push(`guard ${side}: ${reading.line}`);
    problems.push(...reading.problems.map((problem) => `guard ${side}: ${problem}`));
    if (!canary) continue;
    const up = UP.clone().transformDirection(wrist.matrixWorld);
    const across = fistLine[side].clone().transformDirection(lab.joints.body.matrixWorld).projectOnPlane(up);
    handleFist(hand, wrist, across.normalize());
    const old = fistContact(hand, wristBend(hand, elbow));
    lines.push(`old hold + clench ${side}: ${old.line} (${old.problems.join(', ')})`);
    if (old.contacts.length === 0) problems.push(`guard ${side}: the old fist passed contact`);
    closeFist(hand, fistLine[side].clone().transformDirection(lab.joints.body.matrixWorld));
    fuseFingers(hand);
    const fused = fistContact(hand, wristBend(hand, elbow));
    lines.push(`fused ${side}: ${fused.line}`);
    if (!fused.contacts.includes('fingers sunk into each other')) {
      problems.push(`guard ${side}: the fused fingers passed contact`);
    }
  }
  return { lines, problems };
}

/** A point of the hand's surface where it's drawn (the world), and the joint it moves with. */
interface Point {
  at: THREE.Vector3;
  on: THREE.Object3D;
}

/** The joint a vertex of `mesh` moves with: the bone that weighs most on it, or a rigid mesh's own parent. */
function jointOf(mesh: THREE.Mesh, index: number): THREE.Object3D {
  const skinned = mesh as THREE.SkinnedMesh;
  if (!skinned.isSkinnedMesh) return mesh.parent!;
  const attributes = skinned.geometry.attributes as Record<string, THREE.BufferAttribute>;
  const weights = new THREE.Vector4().fromBufferAttribute(attributes.skinWeight, index);
  const bones = new THREE.Vector4().fromBufferAttribute(attributes.skinIndex, index);
  let most = 0;
  for (let i = 1; i < 4; i++) if (weights.getComponent(i) > weights.getComponent(most)) most = i;
  return skinned.skeleton.bones[bones.getComponent(most)];
}

/** Every point of the hand's visible surface, posed. */
function pointsOf(wrist: THREE.Object3D): Point[] {
  wrist.updateMatrixWorld(true);
  const points: Point[] = [];
  for (const mesh of meshesOf(wrist)) {
    const count = mesh.geometry.attributes.position.count;
    for (let i = 0; i < count; i++) {
      const at = mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
      points.push({ at, on: jointOf(mesh, i) });
    }
  }
  return points;
}

/** The spread of `points` along `axis` (x, y or z). */
function spread(points: Point[], axis: 'x' | 'y' | 'z'): number {
  const values = points.map((point) => point.at[axis]);
  return values.length ? Math.max(...values) - Math.min(...values) : 0;
}

/** The flat hand's size (m, its own frame): its length from the wrist, its breadth across the knuckles and its
 *  thickness halfway down the palm (the thumb left out of both), and each finger's length from its knuckle joint. */
interface Size {
  length: number;
  breadth: number;
  thickness: number;
  fingers: number[];
}

function sizeOf(hand: Hand, wrist: THREE.Object3D): Size {
  const points = pointsOf(wrist);
  const thumb = new Set<THREE.Object3D>(hand.thumb.j);
  const palmAndFingers = points.filter((point) => !thumb.has(point.on));
  const knuckleAt = (finger: number) => hand.f[finger].j[0].getWorldPosition(new THREE.Vector3()).y;
  const middle = knuckleAt(1);
  const near = (y: number) => palmAndFingers.filter((point) => Math.abs(point.at.y - y) < BAND);
  const fingers = hand.f.map((finger, i) => {
    const own = new Set<THREE.Object3D>(finger.j);
    const tip = Math.min(...points.filter((point) => own.has(point.on)).map((point) => point.at.y));
    return knuckleAt(i) - tip;
  });
  return {
    length: -Math.min(...points.map((point) => point.at.y)),
    breadth: spread(near(middle), 'x'),
    thickness: spread(near(middle / 2), 'z'),
    fingers,
  };
}

/** a finger's middle joint against the shafts either side of it: how much broader a man's is (about a tenth, by
 *  his finger's look: no table of it was found), and the least and most that pass. Under the least the finger is an
 *  even tube (from play: "fingers same thickness is lame"), over the most its joints are swollen ("a hand of 90
 *  year old, with bones problems") */
const KNOB = { man: 1.1, least: 1.04, most: 1.16 };
/** how far along a finger's first segment its shaft is read (clear of the glove's sleeve over its near half), and its second */
const SHAFT_AT = [0.8, 0.5];
/** how far along a finger from a station its points count as at it (m, the hand's own) */
const STATION = 0.002;

/** How broad `points` are across a finger at `along` down the frame of its joint `from` (m, the hand's own). */
function breadthAt(points: Point[], from: THREE.Object3D, along: number): number {
  const across: number[] = [];
  for (const point of points) {
    const local = from.worldToLocal(point.at.clone());
    if (Math.abs(local.y + along) < STATION) across.push(local.x);
  }
  return across.length ? Math.max(...across) - Math.min(...across) : 0;
}

/** Each finger's breadth at its middle joint over its shafts' either side of it (index to little), on a flat hand. */
function knobsOf(hand: Hand, wrist: THREE.Object3D): number[] {
  const points = pointsOf(wrist);
  return hand.f.map((finger) => {
    const own = new Set<THREE.Object3D>(finger.j);
    const its = points.filter((point) => own.has(point.on));
    const lengths = [finger.j[1].position.length(), finger.j[2].position.length()];
    const joint = breadthAt(its, finger.j[1], 0);
    const before = breadthAt(its, finger.j[0], lengths[0] * SHAFT_AT[0]);
    const after = breadthAt(its, finger.j[1], lengths[1] * SHAFT_AT[1]);
    return joint / ((before + after) / 2);
  });
}

/** The fingers' joints against their shafts, said, and those that read as tubes or as swollen. */
function knobNotes(knobs: number[]): { lines: string[]; problems: string[] } {
  const names = ['index', 'middle', 'ring', 'little'];
  const said = knobs.map((knob, i) => `${names[i]} ${knob.toFixed(2)}`).join(', ');
  const line = `its fingers' middle joints against their shafts: ${said} as broad (a man's about ${KNOB.man})`;
  const problems: string[] = [];
  knobs.forEach((knob, i) => {
    if (knob < KNOB.least) problems.push(`hands: the ${names[i]} finger is an even tube (${knob.toFixed(2)})`);
    if (knob > KNOB.most) problems.push(`hands: the ${names[i]} finger's joint is swollen (${knob.toFixed(2)})`);
  });
  return { lines: [line], problems };
}

const mm = (metres: number) => `${(metres * 1000).toFixed(0)} mm`;
const share = (value: number) => `${(value * 100).toFixed(0)}%`;

/** The flat hand's notes: its size at the hero's scale against a man's at his height. */
function sizeNotes(size: Size, scale: number, height: number): string[] {
  const [length, breadth, thickness] = [size.length, size.breadth, size.thickness].map((value) => value * scale);
  const middle = size.fingers[1];
  const others = [0, 2, 3].map((finger, i) => {
    const name = ['index', 'ring', 'little'][i];
    return `${name} ${(size.fingers[finger] / middle).toFixed(2)} (a man's ${MAN.fingers[i].toFixed(2)})`;
  });
  return [
    `${mm(length)} long, ${share(length / height)} of his height (a man's ${share(MAN.length)}); `
      + `${mm(breadth)} across the knuckles, ${share(breadth / length)} of its length (${share(MAN.breadth)}); `
      + `${mm(thickness)} thick at the palm, ${share(thickness / breadth)} of its breadth (${share(MAN.thickness)})`,
    `its fingers from the knuckle joint: the middle ${mm(middle * scale)}; as shares of it ${others.join(', ')}`,
  ];
}

/** How a copy of the hero's right hand is built on a wrist of its own, as the hero's was. */
type Copier = (wrist: THREE.Object3D) => Hand;

function copierOf(lab: Lab, glove?: boolean): Copier {
  const hero = lab.model.hands?.R;
  const like = sculpting.handLike;
  if (!hero || !like) return oldCopier(lab, glove);
  return (wrist) => {
    const copy = like(hero, wrist);
    if (glove !== undefined) handsCode.bare(copy, !glove);
    return copy;
  };
}

/** (A game whose hands aren't sculpted yet, main's for `--ab` until they are: its model has no hands, so its hand is
 *  built again from the materials its pieces were made in, `userData.own`, bare as the hero's is or as `glove` says;
 *  bare only if the hero's is, as only a bare hand's pieces show the skin it's bare in.) */
function oldCopier(lab: Lab, glove?: boolean): Copier {
  const made = (object: THREE.Object3D) => object.userData.own !== undefined;
  const vis = lab.joints.handR.children.find((child) => child.children.some(made));
  if (!vis) throw new Error(`lab: hands: no hand on the ${lab.player.cls.id}'s right wrist`);
  const pieces: THREE.Mesh[] = [];
  vis.traverse((object) => {
    if (made(object)) pieces.push(object as THREE.Mesh);
  });
  const own = (mesh: THREE.Mesh) => mesh.userData.own as THREE.Material;
  const [palm] = pieces;
  const tip = pieces[pieces.length - 1];
  const heroBare = palm.material === own(palm) ? null : (palm.material as THREE.Material);
  if (glove === false && !heroBare) {
    throw new Error('lab: hands: --glove=false: this game\'s gloved hero shows no bare skin');
  }
  const bareIn = glove ? null : heroBare;
  const bare = handsCode.bare as unknown as (hand: Hand, skin: THREE.Material | null) => void;
  return (wrist) => {
    const copy = handsCode.buildHand(wrist, -1, own(palm), own(tip), vis.scale.x);
    bare(copy, bareIn);
    return copy;
  };
}

/** A fresh copy of the hero's right hand, with the game wrap when the studio shows his bare fist. */
function posedCopy(copier: Copier, pose: Pose, scale = 1, wrap?: ArmBuild) {
  const wrist = new THREE.Group();
  const hand = copier(wrist);
  let root = wrist;
  let updateWrap: (() => void) | undefined;
  if (wrap) {
    const elbow = new THREE.Group();
    elbow.position.y = STUDIO_FOREARM;
    elbow.add(wrist);
    wrist.position.y = -STUDIO_FOREARM;
    const sculpt = new shapes.Sculpt();
    const skin = [hand.bareSkin ?? hand.skin];
    const poses = handsCode.wrapPoses?.(hand) ?? [];
    updateWrap = shapes.fighterWrap(sculpt, hand.made.glove, elbow, hand.vis, -hand.s, wrap, skin, poses);
    sculpt.build();
    root = elbow;
  }
  hand.vis.scale.multiplyScalar(scale);
  pose(hand, wrist);
  updateWrap?.();
  root.updateMatrixWorld(true);
  return { hand, wrist, root };
}

/** `wrist` (a hand on it) pictured from `views` as `look` draws it, and the least and most of a picture drawn; the
 *  studio framed on it but with nothing in it, `empty`. */
function pictureOf(lab: Lab, hand: Hand, wrist: THREE.Object3D, views: HandView[], look: Look, empty = false):
  { tiles: Tile[]; least: number; most: number } {
  const scene = studio();
  scene.add(wrist);
  const whole = new THREE.Box3().setFromObject(wrist, true);
  wrist.visible = !empty;
  const thumb = -hand.s;
  const shots: Shot[] = views.map((view) => {
    const box = view.framed?.(hand) ?? whole;
    return { name: view.name, camera: cameraOn(box, view.from(thumb), view.up) };
  });
  const worn = wearLook(look, meshesOf(wrist));
  try {
    return shoot(lab, scene, shots);
  } finally {
    worn();
    scene.remove(wrist);
  }
}

/** how much of a hand drawn, at most, may show through it from any of the studio's views: its skin seen from inside,
 *  and the backdrop seen through a hole it closes round (a share of the pixels it covers) */
const SEE_THROUGH = 0.001;

/** What `hand` (on `wrist`) shows through it from each of the studio's views and its close-ups' sides (every one,
 *  whatever is pictured, the hand framed whole with what's round it as drawn: under the little finger's curl the window
 *  is closed by the wrap's edge), drawn in the `faces` look: its skin
 *  seen from inside and the backdrop through a hole, each view's share of the hand's pixels, and a problem for each
 *  view past `SEE_THROUGH`. */
function seeThroughOf(lab: Lab, hand: Hand, wrist: THREE.Object3D, name: string):
  { line: string; problems: string[]; tiles: Tile[] } {
  const scene = studio();
  scene.add(wrist);
  const box = new THREE.Box3().setFromObject(hand.vis, true);
  const worn = wearLook('faces', meshesOf(hand.vis));
  const backdrop = backdropDrawn();
  const readings: string[] = [];
  const problems: string[] = [];
  const tiles: Tile[] = [];
  try {
    for (const view of [...VIEWS, ...CLOSE_UPS]) {
      const camera = cameraOn(box, view.from(-hand.s), view.up);
      const { pixels, width, height } = drawnPixels(lab, scene, { name: view.name, camera });
      const seen = seenThrough(pixels, width, height, backdrop.colour, backdrop.slack);
      const inside = seen.inside / Math.max(1, seen.drawn), holes = seen.holes / Math.max(1, seen.drawn);
      readings.push(`${view.name} ${pct(inside)}/${pct(holes)}`);
      if (inside > SEE_THROUGH) problems.push(`the ${name} hand's skin seen from inside from its ${view.name} side`);
      if (holes > SEE_THROUGH) problems.push(`the ${name} hand seen through from its ${view.name} side`);
      if (inside > SEE_THROUGH || holes > SEE_THROUGH) {
        const painted = marked(pixels, width, height, backdrop.colour, backdrop.slack);
        const png = canvasOf(opaqueRows(painted, width, height)).toDataURL('image/png');
        tiles.push({ view: `${view.name}, seen through`, png, width, height });
      }
    }
  } finally {
    worn();
    scene.remove(wrist);
  }
  const line = `${name}: seen through (inside/holes, % of the hand) ${readings.join(', ')}`;
  return { line, problems, tiles };
}

/** A share as a percentage to two places. */
const pct = (value: number) => (value * 100).toFixed(2);

/** A copy's geometry freed, but what every hand of its side shares (`userData.shared`). */
const freed = (wrist: THREE.Object3D) => disposeGeometries(wrist);

/** A kept sculpt's side by its key (`1`, `-1 heavy`...): left or right, and its build where it has one. */
function sideName(key: number | string): string {
  const [side, build] = String(key).split(' ');
  const name = side === '1' ? 'left' : 'right';
  return build ? `${build} ${name}` : name;
}

/** How the hands were sculpted: how long a side takes afresh on the page (ms, the browser's own clock: the middle of
 *  a few times), and whether both were sculpted by workers as the game loaded (a problem if not: on the page they held
 *  the boot up half a second). Nothing on a game whose hands aren't sculpted. */
function sculptNotes(copier: Copier): { lines: string[]; problems: string[] } {
  const afresh = sculpting.sculptAfresh;
  const by = sculpting.SCULPTED_BY;
  if (!afresh || !by) return { lines: [], problems: [] };
  const wrist = new THREE.Group();
  const hand = copier(wrist);
  const times: number[] = [];
  for (let i = 0; i < SCULPT_TIMES; i++) {
    const start = window.__labClock.realNow();
    const made = afresh(hand);
    times.push(window.__labClock.realNow() - start);
    for (const geometry of Object.values(made)) geometry.dispose();
  }
  freed(wrist);
  const time = times.sort((a, b) => a - b)[Math.floor(SCULPT_TIMES / 2)];
  // (kept by side, or by side and build where hands have builds: `handKey`)
  const onPage = [...by.entries()].filter(([, how]) => how !== 'worker').map(([key]) => sideName(key));
  const where = onPage.length ? `the ${onPage.join(' and ')} on the page` : 'every side by workers as the game loaded';
  const line = `a side sculpted in ${time.toFixed(0)} ms; ${where}`;
  return { lines: [line], problems: onPage.length ? [`hands: ${line}`] : [] };
}

function chosen<T extends { name: string }>(all: T[], names: string[] | undefined, what: string): T[] {
  if (!names) return all;
  return names.map((name) => {
    const found = all.find((item) => item.name === name);
    const names = all.map((item) => item.name).join(', ');
    if (!found) throw new Error(`lab: hands: no ${what} ${name} (the ${what}s: ${names})`);
    return found;
  });
}

/** The canaries' problems: an empty studio read as drawn, or the hand built larger not measured so. */
function canaries(lab: Lab, copier: Copier, views: HandView[], size: Size): { lines: string[]; problems: string[] } {
  const lines: string[] = [];
  const problems: string[] = [];
  const { hand, wrist } = posedCopy(copier, POSES.flat);
  const { most } = pictureOf(lab, hand, wrist, views, 'lit', true);
  const read = `the canary's empty studio read as ${share(most)} drawn`;
  if (most >= LEAST_DRAWN) problems.push(read);
  else lines.push(read);
  freed(wrist);
  const larger = posedCopy(copier, POSES.flat, CANARY_SCALE);
  const grown = sizeOf(larger.hand, larger.wrist).length / size.length;
  freed(larger.wrist);
  const measured = `the canary's hand built ${CANARY_SCALE}x measured ${grown.toFixed(3)}x as long`;
  if (Math.abs(grown - CANARY_SCALE) > 0.01) problems.push(measured);
  else lines.push(measured);
  return { lines, problems };
}

/** The hero's right hand pictured alone in each pose from each view, with its size and what it's drawn with. */
export async function hands(lab: Lab, options: HandsOptions): Promise<Report> {
  await lab.setup(options.fixture);
  const copier = copierOf(lab, options.glove);
  const views = chosen([...VIEWS, ...CLOSE_UPS], options.views ?? VIEWS.map((view) => view.name), 'view');
  const poses = chosen(Object.entries(POSES).map(([name, pose]) => ({ name, pose })), options.poses, 'pose');
  const look = options.look ?? 'lit';
  const scale = lab.joints.handR.getWorldScale(new THREE.Vector3()).x;
  const flat = posedCopy(copier, POSES.flat);
  const size = sizeOf(flat.hand, flat.wrist);
  const knobs = sculpting.handLike ? knobNotes(knobsOf(flat.hand, flat.wrist)) : { lines: [], problems: [] };
  freed(flat.wrist);
  const moments: Pictured[] = [];
  const sculpted = sculptNotes(copier);
  const problems = [...knobs.problems, ...sculpted.problems];
  const lines = [...sizeNotes(size, scale, lab.model.height), ...knobs.lines, ...sculpted.lines];
  for (const { name, pose } of poses) {
    const bareFist = name === 'clenched' && lab.player.cls.id === 'warrior' && options.glove !== true;
    const wrapped = bareFist && options.wrap !== false ? lab.model.arm : undefined;
    const { hand, root } = posedCopy(bareFist ? copierOf(lab, false) : copier, pose, 1, wrapped);
    const { tiles, least } = pictureOf(lab, hand, root, views, look);
    if (bareFist) {
      const seen = seeThroughOf(lab, hand, root, name);
      lines.push(seen.line);
      problems.push(...seen.problems);
      if (seen.tiles.length) moments.push({ label: `${name}: seen through, holes magenta`, tiles: seen.tiles, notes: [] });
    }
    const handCounts = countsOf(hand.vis);
    const { triangles, meshes } = wrapped ? countsOf(root) : handCounts;
    const notes = [`${triangles.toLocaleString('en')} triangles in ${meshes} meshes`];
    if (wrapped) {
      const strip = triangles - handCounts.triangles, draws = meshes - handCounts.meshes;
      const line = `wrap: ${strip} triangles in ${draws} mesh`;
      notes.push(line);
      lines.push(line);
      if (strip <= 0 || strip > WRAP_TRIANGLES || draws !== 1) problems.push(`hands: ${line} exceeds its budget`);
    }
    freed(root);
    if (least < LEAST_DRAWN) problems.push(`the ${name} hand covers ${share(least)} of a picture: not drawn`);
    moments.push({ label: name, tiles, notes: name === 'flat' ? [...lines, ...notes] : notes });
  }
  if (lab.player.cls.id === 'warrior' && sculpting.closeFist && poses.some(({ name }) => name === 'clenched')) {
    const contact = await guardContact(lab, options.fixture, options.canary);
    lines.push(...contact.lines);
    problems.push(...contact.problems);
  }
  if (options.canary) {
    const found = canaries(lab, copier, views, size);
    lines.push(...found.lines);
    problems.push(...found.problems);
  }
  return { text: lines.join('\n'), problems, moments };
}
