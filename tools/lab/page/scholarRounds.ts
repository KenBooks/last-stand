// tools/lab `scholar`'s rounds: Brother Hollis let go from his table (src/world/scholarRounds.ts) and followed a frame at
// a time through a browse (to a case, a book taken off its shelf, looked over, read standing, put back, and back to
// his table), then a restock (a book kept on a stack first, then the top of a stack shelved in a gap). Each frame: his
// body clear of what stands in the room while he's up; a book in his hands always at one of them (never in the air);
// its shelf's book hidden while it's off the shelf, and the room's gaps none once he's back at his table, sat. A hero
// stood close as he browses must not stop him (his task goes on), and he glances up at him; talked to, he stops where
// he is and turns to the hero, and goes on once the talk ends. From play: "have him walking around... an actual book
// from a shelf that actually leaves the shelf... If player comes in does not mean he stops, only if he interacts".
// Then his other tasks, each back at his table at its end and clear of what stands in the room: a case dusted (his cloth
// in his right hand throughout, its dust let off), a row squared, the globe set turning. From play: "have him do more
// tasks like dusting and so on".
// Its canary holds the book he carries half a metre off his hands, which must be found.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import { G } from '../../../src/state';
import { faceCamera, saveCamera, settleCamera } from '../../../src/core/renderer';
import { objectNear } from '../../../src/game/village';
import { closeTalk, talkOpen } from '../../../src/ui/screens/talk/talk';
import type { Scholar } from '../../../src/entities/models/scholar';
import type { Rounds } from '../../../src/world/scholarRounds';
import { jointsOf, offHero } from './scholar';
import { HOOD, scholarPlant } from '../../../src/entities/models/scholar';
import { GRIP_SHUT, roundsPlant } from '../../../src/world/scholarRounds';
import { CASE_R, type LadderPart } from '../../../src/world/houses/library';
import type { Obstacle } from '../../../src/types';
import { CHAIR, TABLE_INTO_MOST, chairHandOff, chairRead, intoTable } from './scholarChair';
import { LINEN_OUT_MOST, MOUTH_MOST, linenOut as linenRead, mouthRead } from './scholarSleeves';

/** the canary's sleeves' tip down off the forearm (rad): the wide bell's hang as it was, fallen and tipped from a raised
 *  forearm (`SLEEVE_FALL` once: 0.3) and more, as Kenneth saw it hang apart from his arm */
const MOUTH_CANARY_TIP = 0.6;
import { GRAB, INTO_BOOK_MOST, PADS_MOST, PAGE_FACING, SLEEVES_INTO_BOOK_MOST, bookRead, fingerPoints, grabRead, intoBook, padsRead, pageFacing, printsOf, turnedRound } from './bookHold';

/** whether the open book read wrong to him at some frame (its least facing under `PAGE_FACING`) */
const pageWrong = (r: { pageAway: number; pageRight: number }) => r.pageAway < PAGE_FACING.away || r.pageRight < PAGE_FACING.right;

/** the most frames a round may take (a minute and a half at 60 a second), how far a book may be from his nearer hand
 *  (m), how near what stands in the room his middle may come (m past its circle), how far off the hero his face must
 *  come while the hero stands close (deg), and how still he must keep while talked to (m) */
const ROUND_FRAMES = 6000;
const HAND_MOST = 0.1;
const CLEAR_LEAST = 0.08;
const GLANCED = 40;
const STILL_MOST = 0.02;
/** how far his dusting cloth may be from his right palm (m), and how far the globe must turn once he's set it turning
 *  (rad) */
const CLOTH_MOST = 0.08;
/** the most any joint of him may turn in a frame over his rounds (deg: getting up, sitting down, walking, and where one
 *  beat hands on to the next; from play, "like he teleports a bit into these different poses"), the most his head may
 *  be turned off the way he walks (deg, while he walks: "looking sideways when walking forwards"), how fast he walks
 *  before that's read (m/s), and how far a shoe may come out through his robe above its hem (m: "they go through his
 *  clothing when walking") */
const JOINT_MOST = 8;
/** how near where he was put a hero put by him must stay (m): pushed further, he was put in a wall or a case */
const HERO_STAYS = 0.1;
/** how fast his hips' speed (m/s a second) and a joint's turning (deg/s a second) may change, a frame to the next, the
 *  frame of whatever length: a cut where one beat hands on to the next (a pose or a place jumped) changes them as no
 *  body moving does (from play: "it snaps, its not smooth (sitting down and standing up)") */
const HIPS_SPEEDS_MOST = 20, JOINT_SPEEDS_MOST = 25000;
/** how often the hood's edge is read (frames) */
const HOOD_EVERY = 30;
/** the frames' lengths (s) of a pass of uneven frames, in turn: a fast screen's, a slow one's, the game's, a hitch's */
const UNEVEN = [0.008, 0.033, 0.016, 0.05] as const;
const HEAD_OFF_MOST = 15;
const WALKING = 0.45;
/** how far his body may face off the way he goes (deg) for his walk to be read as straight */
const STRAIGHT = 8;
/** how near the hero may be (m) for his head to be read on his way */
const HERO_NEAR = 2.2;
const SHOE_OUT_MOST = 0.004;
/** his cowl against him (m): how far into his neck or his head a point of it may go, and how far its top may stand off
 *  his neck (from play: "the Librarian's hoodie is broken", a ring standing off his neck, his neck and back showing down
 *  inside it); his neck's radius at its foot and its top, and his head's round its middle over its joint */
export const COWL_INTO_MOST = 0.003;
export const COWL_GAP_MOST = 0.03;
const NECK_R = { foot: 0.064, top: 0.053 };
const HEAD = { up: 0.09, ahead: 0.01, r: 0.092 };

/** His cowl against his neck and head now: how far into his neck a point of it goes, how far its top (its last row of
 *  points) stands off his neck at most, and how far into his head a point goes (m). */
export function cowlClearance(s: Scholar): { intoNeck: number; gap: number; intoHead: number } {
  const cowl = s.root.getObjectByName('scholar cowl') as THREE.Mesh;
  const neck = s.root.getObjectByName('scholar neck')!, head = s.root.getObjectByName('scholar head')!;
  s.root.updateMatrixWorld(true);
  const a = neck.getWorldPosition(new THREE.Vector3()), b = head.getWorldPosition(new THREE.Vector3()), ab = b.clone().sub(a), len = ab.length();
  ab.normalize();
  const middle = head.localToWorld(new THREE.Vector3(0, HEAD.up, HEAD.ahead));
  const p = cowl.geometry.attributes.position, v = new THREE.Vector3(), round = 37;
  let intoNeck = 0, gap = 0, intoHead = 0;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).applyMatrix4(cowl.matrixWorld);
    const t = v.clone().sub(a).dot(ab), off = v.clone().sub(a).addScaledVector(ab, -t).length();
    const r = THREE.MathUtils.lerp(NECK_R.foot, NECK_R.top, THREE.MathUtils.clamp(t / len, 0, 1));
    if (t > 0 && t < len) intoNeck = Math.max(intoNeck, r - off);
    if (i >= p.count - round) gap = Math.max(gap, off - r);
    intoHead = Math.max(intoHead, HEAD.r - v.distanceTo(middle));
  }
  return { intoNeck, gap, intoHead };
}

/** how far the hood's edge may stand off what it lies on (m: the cowl's foot at its top, his back at its sides and
 *  point; from play, "Hoodie still does not connect. Connect it properly": a shell off his back, open at its edges) */
const HOOD_GAP_MOST = 0.008;

/** How far the hood's edge stands off his cowl and chest now (m, the furthest point of it from them), and where. */
export function hoodGap(s: Scholar): { gap: number; at: string } {
  s.root.updateMatrixWorld(true);
  // (meshes by name: his chest's joint has the chest's mesh's name)
  const meshes: THREE.Mesh[] = [];
  s.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  const hood = meshes.find((m) => m.name === 'scholar hood')!;
  const under = meshes.filter((m) => m.name === 'scholar chest' || m.name === 'scholar cowl');
  const pos = hood.geometry.attributes.position, n = HOOD.round + 1, rows = pos.count / n;
  const edge: { at: THREE.Vector3; what: string }[] = [];
  for (let k = 0; k < rows; k++) for (let i = 0; i < n; i++) {
    const what = k === 0 ? 'its top' : k === rows - 1 ? 'its point' : i === 0 || i === n - 1 ? 'its side' : '';
    if (what) edge.push({ at: new THREE.Vector3().fromBufferAttribute(pos, k * n + i).applyMatrix4(hood.matrixWorld), what });
  }
  // (each against the triangles near the hood: what it lies on)
  const centre = new THREE.Box3().setFromObject(hood).getCenter(new THREE.Vector3());
  const triangles: THREE.Triangle[] = [];
  for (const m of under) {
    const p = m.geometry.attributes.position, index = m.geometry.index!;
    for (let t = 0; t < index.count; t += 3) {
      const tri = new THREE.Triangle(...[0, 1, 2].map((c) => new THREE.Vector3().fromBufferAttribute(p, index.getX(t + c)).applyMatrix4(m.matrixWorld)) as [THREE.Vector3, THREE.Vector3, THREE.Vector3]);
      if (tri.getMidpoint(new THREE.Vector3()).distanceTo(centre) < 0.3) triangles.push(tri);
    }
  }
  let gap = 0, at = '';
  const near = new THREE.Vector3();
  for (const e of edge) {
    let least = Infinity;
    for (const tri of triangles) least = Math.min(least, tri.closestPointToPoint(e.at, near).distanceTo(e.at));
    if (least > gap) { gap = least; at = e.what; }
  }
  return { gap, at };
}

/** how far into the ladder's rails and rungs, and the margin kept off them, he may go (m: his body as rounds about his
 *  middle, his elbows in their sleeves as rounds, his palms and the books in his hands as points; from play, "should
 *  not go through the ladder when standing/walking", and "he often stands near the ladder, and book goes through the
 *  ladder, he should not stand there"), how wide the margin is, and how wide an elbow; and his body's rounds: where
 *  (m over his feet, or a joint's) and how wide */
const LADDER_INTO_MOST = 0.005, LADDER_MARGIN = 0.03, ELBOW_R = 0.07;
/** him as he stands at a spot, as rounds (m: ahead toward the case and up from his feet, to his left, and how wide):
 *  his body, his elbows out at his sides, the book he holds out to read */
const AT_A_SPOT: { ahead: number; up: number; left: number; r: number }[] = [
  { ahead: 0, up: 0.3, left: 0, r: 0.27 }, { ahead: 0, up: 0.75, left: 0, r: 0.22 }, { ahead: 0, up: 1.35, left: 0, r: 0.16 },
  { ahead: 0.05, up: 1.1, left: 0.25, r: ELBOW_R }, { ahead: 0.05, up: 1.1, left: -0.25, r: ELBOW_R }, { ahead: 0.3, up: 1.24, left: 0, r: 0.17 },
];
/** how many of the reachable spots the tasks of `lab scholar` take him to, at the least (each task's going to the one
 *  he's gone to least: a second time to one, while another's not been gone to, is the same two again) */
const SPOTS_LEAST = 5;

/** The spots at the cases he can walk to, each against the ladder as he'd stand there (`AT_A_SPOT`): the deepest into
 *  it and the margin, and where. */
export function spotsAgainstLadder(rounds: Rounds, room: THREE.Object3D): { into: number; at: string } {
  room.updateMatrixWorld(true);
  let into = 0, at = '';
  for (const spot of rounds.spots) {
    if (!spot.reachable) continue;
    const ahead = spot.out.clone().negate(), left = new THREE.Vector3(ahead.z, 0, -ahead.x);
    const points = AT_A_SPOT.map((p) => ({ r: p.r, at: new THREE.Vector3(spot.stand.x, p.up, spot.stand.y).addScaledVector(ahead, p.ahead).addScaledVector(left, p.left).applyMatrix4(room.matrixWorld) }));
    const depth = ladderDepth(points);
    if (depth > into) { into = depth; at = `the spot at ${spot.stand.x.toFixed(2)}, ${spot.stand.y.toFixed(2)}`; }
  }
  return { into, at };
}
const BODY_ROUNDS: { joint?: string; up: number; r: number }[] = [
  { up: 0.3, r: 0.27 }, { up: 0.75, r: 0.22 }, { joint: 'scholar chest', up: 0.12, r: 0.16 }, { joint: 'scholar head', up: 0.09, r: 0.1 },
];

/** how far his palms and the corners of the book in his hands may go into the room's other furniture (m past a circle
 *  of it, below its top: its tables, chairs, hearth and stands; not the cases he reaches into for their books, nor the
 *  globe he turns by hand) */
const FURNITURE_INTO_MOST = 0.01;
/** how far from his table's group's place its own circles (his table's and his chair's) lie, at most (m) */
const OWN_DESK = 1.2;

/** How far his palms and the book in his hands go into what stands in the room but its cases (m past its circle, below
 *  its top). */
export function intoFurniture(s: Scholar, obstacles: readonly Obstacle[]): number {
  s.root.updateMatrixWorld(true);
  const points = [...hands(s)];
  for (const name of ['library held book', 'library open held book']) {
    const book = G.scene.getObjectByName(name);
    if (!book?.visible) continue;
    const box = new THREE.Box3().setFromObject(book);
    for (let k = 0; k < 8; k++) points.push(new THREE.Vector3(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z));
  }
  let into = 0;
  const globe = G.scene.getObjectByName('library globe')!.getWorldPosition(new THREE.Vector3());
  // (his own table and chair aside: he handles his chair, drawing it out and pushing it in)
  const desk = s.root.parent!.getWorldPosition(new THREE.Vector3());
  for (const o of obstacles) {
    if (o.r === CASE_R || Math.hypot(o.x - globe.x, o.z - globe.z) < 0.1 || Math.hypot(o.x - desk.x, o.z - desk.z) < OWN_DESK) continue;
    for (const p of points) if (p.y < o.h - 0.01) into = Math.max(into, o.r - Math.hypot(p.x - o.x, p.z - o.z));
  }
  return into;
}

/** what keeps the ladder's parts (the library's room, found once) */
let ladderRoom: THREE.Object3D | undefined;
/** How far into the room's ladder, and the margin kept off it, he goes now (m): his body's rounds, his elbows', his palms
 *  and the corners of the book in his hands against each rail and rung (each a box, in its own frame). */
export function intoLadder(s: Scholar): number {
  s.root.updateMatrixWorld(true);
  const points: { at: THREE.Vector3; r: number }[] = [];
  const feet = s.root.getWorldPosition(new THREE.Vector3());
  for (const b of BODY_ROUNDS) {
    const at = b.joint ? s.root.getObjectByName(b.joint)!.localToWorld(new THREE.Vector3(0, b.up, 0)) : feet.clone().add(new THREE.Vector3(0, b.up, 0));
    points.push({ at, r: b.r });
  }
  for (const palm of hands(s)) points.push({ at: palm, r: 0 });
  for (const elbow of ['scholar elbowL', 'scholar elbowR']) points.push({ at: s.root.getObjectByName(elbow)!.getWorldPosition(new THREE.Vector3()), r: ELBOW_R });
  for (const name of ['library held book', 'library open held book']) {
    const book = G.scene.getObjectByName(name);
    if (!book?.visible) continue;
    const box = new THREE.Box3().setFromObject(book), c = new THREE.Vector3();
    for (let k = 0; k < 8; k++) points.push({ at: c.set(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z).clone(), r: 0 });
  }
  return ladderDepth(points);
}

/** the ladder's rails and rungs (each a box, in its own frame, with the world into it), kept by the room as it's built:
 *  its merge takes the ladder's meshes away */
function ladderParts(): { inverse: THREE.Matrix4; box: THREE.Box3 }[] {
  if (!ladderRoom?.parent) { ladderRoom = undefined; G.scene.traverse((o) => { if (o.userData.ladderParts) ladderRoom = o; }); }
  const room = ladderRoom;
  if (!room) throw new Error("the library keeps no ladder's parts");
  room.updateMatrixWorld(true);
  return (room.userData.ladderParts as LadderPart[]).map((p) => ({ inverse: room.matrixWorld.clone().multiply(p.matrix).invert(), box: p.box }));
}

/** How far `points` (world, each a round `r` wide, the margin added) go into the ladder's rails and rungs (m). */
function ladderDepth(points: { at: THREE.Vector3; r: number }[]): number {
  const parts = ladderParts();
  for (const p of points) p.r += LADDER_MARGIN;
  let into = 0;
  const local = new THREE.Vector3(), near = new THREE.Vector3();
  for (const p of points) {
    for (const part of parts) {
      local.copy(p.at).applyMatrix4(part.inverse);
      part.box.clampPoint(local, near);
      const inside = part.box.containsPoint(local) ? 0.001 : 0;
      into = Math.max(into, p.r - local.distanceTo(near) + inside);
    }
  }
  return into;
}

/** The book in his hands against the shelf's he took: why it isn't the very book (its model, its spine, its colour, its
 *  size, its gap on the shelf), or '' where it is. */
function notTheShelfBook(rounds: Rounds, held: THREE.Mesh): string {
  const out = rounds.out;
  if (!out) return '';
  const [cover] = held.material as THREE.MeshStandardMaterial[];
  const shelfCover = out.mesh.material as THREE.MeshStandardMaterial;
  if (held.geometry.attributes.position.count !== out.mesh.geometry.attributes.position.count + out.pages.geometry.attributes.position.count) return 'another model';
  if (cover.map !== shelfCover.map) return 'another spine';
  const colour = new THREE.Color();
  out.mesh.getColorAt(out.index, colour);
  if (Math.abs(colour.r - cover.color.r) + Math.abs(colour.g - cover.color.g) + Math.abs(colour.b - cover.color.b) > 0.01) return 'another colour';
  const size = new THREE.Vector3();
  out.matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), size);
  if (size.distanceTo(held.scale) > 0.001) return 'another size';
  const m = new THREE.Matrix4();
  out.mesh.getMatrixAt(out.index, m);
  if (!hiddenAt(m)) return 'its cover still on the shelf';
  out.pages.getMatrixAt(out.page, m);
  if (!hiddenAt(m)) return 'its pages still on the shelf';
  return '';
}

/** Whether an instance's matrix hides it (scaled to nothing: its columns none long; decomposed, three reads a scale of
 *  1 from it) */
const hiddenAt = (m: THREE.Matrix4) => Math.hypot(m.elements[0], m.elements[1], m.elements[2]) < 1e-6;
const GLOBE_TURNS = 1;

/** Where the middle of each of his palms is (world): 7 cm down the hand from its joint at the wrist, the way his fingers
 *  point (the hand's -y). Measured from the wrist, a hand holding a book's edge was 8 to 10 cm off it. */
function hands(s: Scholar): THREE.Vector3[] {
  return ['scholar handL', 'scholar handR'].map((n) => s.root.getObjectByName(n)!.localToWorld(new THREE.Vector3(0, -0.07, 0)));
}

/** How far `hand` is from the book `book` (m): from its box's surface, 0 inside it. Its box is its geometry's at its
 *  scale (a shelf's book is a unit box scaled to its size; a stack's its own size). Measured from its middle, a hand
 *  holding a book by its edge was its half's length off. */
function fromBook(book: THREE.Mesh, hand: THREE.Vector3): number {
  if (!book.geometry.boundingBox) book.geometry.computeBoundingBox();
  const local = book.worldToLocal(hand.clone()), box = book.geometry.boundingBox!;
  const inside = local.clone().clamp(box.min, box.max);
  return book.localToWorld(inside).distanceTo(hand);
}

/** how many frames the frame's cost is timed over, sat and walking */
const COST_FRAMES = 90;

/** The frame's mean time (ms, the browser's clock: a game frame drawn and a browser frame each) over `COST_FRAMES`. */
async function frameCost(lab: Lab): Promise<number> {
  const drawing = lab.drawing;
  lab.drawing = true;
  let total = 0;
  for (let i = 0; i < COST_FRAMES; i++) {
    const from = window.__labClock.realNow();
    await lab.step(1);
    await window.__labClock.realFrame();
    total += window.__labClock.realNow() - from;
  }
  lab.drawing = drawing;
  return total / COST_FRAMES;
}

/** how far back from upright the open book may be held to read (deg: a reader's 30 to 45, and some), how squarely its
 *  pages must face his eyes (deg off), and how far past its boards a palm may be (m) */
const READ_TILT = { least: 25, most: 42 };
const PAGES_OFF = 40;
const PAST_BOARDS = 0.03;
/** how far past the book's edges his fingertips may reach (m): over its pages' edges a thumb's length, no more (up past
 *  its edges, his fingers stood up like claws) */
const TIPS_PAST = 0.025;
/** how far behind the boards his fingertips may stand (m): fingers lying along them, a little curled */
const TIPS_OFF = 0.04;

/** The open book as he reads it standing: how far back from upright it's held (deg), how far its pages face off his
 *  eyes (deg), and how far each palm is from behind its boards (m past them: in front of the pages, or out past an
 *  edge; 0 where it's behind them within their outline). */
function readHold(s: Scholar): { tilt: number; off: number; palms: number[]; tips: number; tipsOff: number } | null {
  let book: THREE.Object3D | undefined;
  G.scene.traverse((o) => { if (o.name === 'library open held book' && o.visible) book = o; });
  if (!book) return null;
  book.updateMatrixWorld(true);
  const normal = new THREE.Vector3(0, 1, 0).transformDirection(book.matrixWorld);
  const at = book.getWorldPosition(new THREE.Vector3());
  const eyes = s.root.getObjectByName('scholar cap')!.parent!.getWorldPosition(new THREE.Vector3());
  const tilt = 90 - THREE.MathUtils.radToDeg(Math.asin(Math.min(1, normal.y)));
  const off = THREE.MathUtils.radToDeg(normal.angleTo(eyes.sub(at).normalize()));
  // (its boards' outline in its own frame: halves along x either side of the spine, z its height, its pages +y)
  const half = { x: 0.135, z: 0.095 };
  const palms = hands(s).map((h) => {
    const p = book!.worldToLocal(h.clone());
    const outside = Math.max(0, Math.abs(p.x) - half.x, Math.abs(p.z) - half.z);
    return Math.max(outside, p.y - 0.01);
  });
  // (each hand's fingertips, out past the book's outline in its own plane)
  let tips = 0, tipsOff = 0;
  // (each fingertip itself: read as a point a fixed way down the hand, a hand tipped back off the boards moved it)
  for (const p of fingerPoints(s)) {
    if (!p.what.endsWith("'s tip") || p.what.includes('thumb')) continue;
    const tip = book.worldToLocal(p.at.clone());
    tips = Math.max(tips, Math.abs(tip.x) - half.x, Math.abs(tip.z) - half.z);
    // (and out behind its boards: fingers standing up off them, as claws, not lying along them)
    tipsOff = Math.max(tipsOff, -tip.y);
  }
  return { tilt, off, palms, tips, tipsOff };
}

/** What a round did, frame by frame: also the most a joint turned in a frame (deg, which and in what beat), his head
 *  off his way as he walked (deg) and a shoe out through his robe above its hem (m). */
interface Followed {
  frames: number; beats: string[]; farthest: number; farAt: string; tightest: number; tightAt: string; gapsAtEnd: number; satAtEnd: number;
  turned: number; turnedAt: string; headOff: number; shoeOut: number; shoeAt: string;
  cowlInto: number; cowlGap: number; cowlAt: string; bookFrames: number; notBook: string; backInPlace: boolean;
  ladderInto: number; ladderAt: string; furnitureInto: number; furnitureAt: string;
  mouthOff: number; mouthAt: string; linenOut: number; linenAt: string;
  tableInto: number; tableAt: string; chairFloor: number; chairInto: number; chairAt: string; chairMoved: number; chairHand: number; chairHandAt: string;
  chairOutMost: number; chairOutAtEnd: number;
  hipsSpeeds: number; hipsAt: string; jointSpeeds: number; jointAt: string; hoodGap: number; hoodAt: string;
  bookFingers: number; bookSleeves: number; bookAt: string; pageAway: number; pageRight: number; pageAt: string;
  grabSide: number; grabAt: string; grabInto: number; grabIntoAt: string; grabFrames: number; padsOff: number; padsAt: string;
}

/** A part of him by name, or by its parents' where it has none. */
function partName(o: THREE.Object3D): string {
  const path: string[] = [];
  for (let p: THREE.Object3D | null = o; p && path.length < 4; p = p.parent) path.push(p.name || `(${p.type})`);
  return path.join(' < ');
}

/** His head's way (world, level) against `way`, the way he went this frame: how far apart (deg). */
function headOffWay(s: Scholar, way: THREE.Vector3): number {
  const head = s.root.getObjectByName('scholar head')!;
  const h = new THREE.Vector3(0, 0, 1).transformDirection(head.matrixWorld).setY(0).normalize();
  return THREE.MathUtils.radToDeg(h.angleTo(way.clone().setY(0).normalize()));
}

/** How far out through his robe a point of a shoe is, the furthest (m, 0 for none): a point above the robe's hem, out
 *  past its surface at its height and side, while he's on his feet (his habit drawn wholly as the robe). The robe's
 *  points are its rows round him (`dressRobe`: 31 rows of 41, its top first, each from his left round over his front,
 *  `ROBE_FROM_SKIRT`), as his legs have pushed them out this frame: the shape the habit's drawn morphed into. */
export function shoeThroughRobe(s: Scholar, where?: { at: THREE.Vector3; row: number }): number {
  const robe = s.root.getObjectByName('scholar robe') as THREE.Mesh | undefined;
  if (!robe || s.act.sit > 0) return 0;
  const pos = robe.geometry.attributes.position, N = 41, K = Math.round(pos.count / N);
  if (K * N !== pos.count) return 0;
  const hem = pos.getY((K - 1) * N);
  // (the robe's radius round its middle, at row k and column i)
  const radius = (k: number, i: number) => Math.hypot(pos.getX(k * N + i), pos.getZ(k * N + i) - 0.01);
  let worst = 0;
  const p = new THREE.Vector3(), toRobe = new THREE.Matrix4();
  robe.updateWorldMatrix(true, false);
  const inverse = robe.matrixWorld.clone().invert();
  s.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.name !== 'scholar shoe' || !m.visible) return;
    toRobe.multiplyMatrices(inverse, m.matrixWorld);
    const sp = m.geometry.attributes.position;
    for (let v = 0; v < sp.count; v++) {
      p.fromBufferAttribute(sp, v).applyMatrix4(toRobe);
      if (p.y <= hem + 0.004 || p.y >= pos.getY(0)) continue;
      // (the rows above and below its height, and the columns either side of its way round)
      let k = 0;
      while (k < K - 2 && pos.getY((k + 1) * N) > p.y) k++;
      const y0 = pos.getY(k * N), y1 = pos.getY((k + 1) * N), ty = THREE.MathUtils.clamp((y0 - p.y) / (y0 - y1 || 1), 0, 1);
      const u = (Math.PI / 2 - Math.atan2(p.x, p.z - 0.01)) / (Math.PI * 2), at = (u - Math.floor(u)) * (N - 1);
      const i = Math.min(N - 2, Math.floor(at)), ti = at - i;
      const r = THREE.MathUtils.lerp(THREE.MathUtils.lerp(radius(k, i), radius(k, i + 1), ti), THREE.MathUtils.lerp(radius(k + 1, i), radius(k + 1, i + 1), ti), ty);
      const out = Math.hypot(p.x, p.z - 0.01) - r;
      if (out > worst) { worst = out; if (where) { where.at.copy(p); where.row = k; } }
    }
  });
  return worst;
}

/** A round followed until he's back reading at his table: what he did, how far a book he held strayed from his hands,
 *  how near he came to what stands in the room. `each` runs every frame (a hero stood close, a talk). */
export async function follow(lab: Lab, s: Scholar, rounds: Rounds, canary: boolean, each?: (f: number) => Promise<void> | void,
  dts?: readonly number[]): Promise<Followed> {
  const beats: string[] = [];
  let farthest = 0, farAt = '', tightest = Infinity, tightAt = '', frames = 0;
  let turned = 0, turnedAt = '', headOff = 0, shoeOut = 0, shoeAt = '';
  let cowlInto = 0, cowlGap = 0, cowlAt = '', bookFrames = 0, notBook = '', lastOut = rounds.out, ladderInto = 0, ladderAt = '', furnitureInto = 0, furnitureAt = '';
  /** him against his table's top while he's sat or half sat, his chair on the floor and clear of what stands by it, and
   *  his hands on it while it moves (`scholarChair.ts`) */
  /** his forearms through their sleeves' mouths (`scholarSleeves.ts`), at their worst; the canary's: each sleeve tipped
   *  down as the wide bell hung, a frame as he looks a book over */
  let mouthOff = 0, mouthAt = '', linenOut = 0, linenAt = '';
  let tableInto = 0, tableAt = '', chairFloor = 0, chairInto = 0, chairAt = '', chairMoved = 0, chairHand = 0, chairHandAt = '', chairOutMost = 0, chairWas = -1;
  const cases = G.arena.obstacles.filter((o) => o.r === CASE_R);
  const held = G.scene.getObjectByName('library held book') as THREE.Mesh;
  const obstacles = G.arena.obstacles.filter((o) => o !== rounds.body);
  const joints = jointsOf(s), before = joints.map((o) => o.quaternion.clone());
  const at = s.root.getWorldPosition(new THREE.Vector3()), was = at.clone(), way = new THREE.Vector3();
  // (his hips' speed and each joint's turning speed, frame to frame; the frames of `dts`' lengths, where given)
  let hipsSpeeds = 0, hipsAt = '', jointSpeeds = 0, jointAt = '', dt = 1 / 60, dtWas = dt, fresh = 0, hoodWorst = 0, hoodAt = '';
  let bookFingers = 0, bookSleeves = 0, bookAt = '', pageAway = Infinity, pageRight = Infinity, pageAt = '';
  let grabSide = Infinity, grabAt = '', grabInto = 0, grabIntoAt = '', grabFrames = 0, padsOff = 0, padsAt = '';
  const hipsJoint = s.root.getObjectByName('scholar hips')!, hips = hipsJoint.getWorldPosition(new THREE.Vector3()), hipsWas = hips.clone();
  const speed = new THREE.Vector3(), speedWas = new THREE.Vector3(), turn = new THREE.Quaternion();
  const spins = joints.map(() => new THREE.Vector3()), spinsWas = joints.map(() => new THREE.Vector3());
  const update = rounds.update;
  // (put back after: a command's page is its own, and a failure ends it)
  if (dts) rounds.update = (_dt, ...rest) => update.call(rounds, dt, ...rest);
  for (; frames < ROUND_FRAMES; frames++) {
    const before0 = hipsJoint.getWorldPosition(new THREE.Vector3());
    await each?.(frames);
    // (a picture's frames stepped in `each` break the run of frames: the speeds are read again from here)
    if (hipsJoint.getWorldPosition(new THREE.Vector3()).distanceToSquared(before0) > 0) fresh = 0;
    dtWas = dt;
    dt = dts ? dts[frames % dts.length] : 1 / 60;
    // (read from here: what `each` stepped (a picture's frames) isn't this frame's turn)
    joints.forEach((o, i) => before[i].copy(o.quaternion));
    s.root.getWorldPosition(was);
    hipsJoint.getWorldPosition(hipsWas);
    await lab.step(1);
    // (his hips' velocity and each joint's spin this frame, against last frame's: how fast each changed)
    s.root.updateMatrixWorld(true);
    hipsJoint.getWorldPosition(hips);
    speedWas.copy(speed);
    speed.subVectors(hips, hipsWas).divideScalar(dt);
    const mid = (dt + dtWas) / 2;
    joints.forEach((o, i) => {
      spinsWas[i].copy(spins[i]);
      turn.copy(before[i]).invert().multiply(o.quaternion);
      if (turn.w < 0) turn.set(-turn.x, -turn.y, -turn.z, -turn.w);
      const angle = 2 * Math.acos(Math.min(1, turn.w)), sin = Math.sqrt(Math.max(0, 1 - turn.w * turn.w));
      spins[i].set(turn.x, turn.y, turn.z).multiplyScalar(sin > 1e-6 ? angle / sin / dt : 0);
    });
    if (++fresh >= 2) {
      const h = speed.distanceTo(speedWas) / mid;
      if (h > hipsSpeeds) { hipsSpeeds = h; hipsAt = `${rounds.doing} (sit ${s.act.sit.toFixed(2)}, walk ${s.act.walk.toFixed(2)})`; }
      joints.forEach((o, i) => {
        const a = THREE.MathUtils.radToDeg(spins[i].distanceTo(spinsWas[i]) / mid);
        if (a > jointSpeeds) { jointSpeeds = a; jointAt = `${partName(o)}, ${rounds.doing} (sit ${s.act.sit.toFixed(2)})`; }
      });
    }
    if (beats[beats.length - 1] !== rounds.doing) beats.push(rounds.doing);
    // (each joint's turn in the frame: getting up, sitting down, and where one beat hands on to the next)
    joints.forEach((o, i) => {
      const deg = THREE.MathUtils.radToDeg(before[i].angleTo(o.quaternion));
      if (deg > turned) { turned = deg; turnedAt = `${partName(o)}, ${rounds.doing} (sit ${s.act.sit.toFixed(2)})`; }
    });
    s.root.updateMatrixWorld(true);
    s.root.getWorldPosition(at);
    way.subVectors(at, was);
    // (but where the hero is near: he may look at whoever stands in his way)
    if (s.act.walk > WALKING && way.length() > 0.003 && G.player.pos.distanceTo(at) > HERO_NEAR) {
      const body = new THREE.Vector3(0, 0, 1).transformDirection(s.root.matrixWorld).setY(0).normalize();
      if (THREE.MathUtils.radToDeg(body.angleTo(way.clone().setY(0).normalize())) < STRAIGHT) headOff = Math.max(headOff, headOffWay(s, way));
    }
    if (s.act.sit < 0.5) {
      const out = shoeThroughRobe(s);
      if (out > shoeOut) { shoeOut = out; shoeAt = rounds.doing; }
    }
    // (his cowl against his neck and head, every frame; the book in his hands the shelf's own while it's out)
    const cowl = cowlClearance(s);
    if (Math.max(cowl.intoNeck, cowl.intoHead) > cowlInto || cowl.gap > cowlGap) cowlAt = `${rounds.doing} (into his neck ${(cowl.intoNeck * 100).toFixed(1)}, his head ${(cowl.intoHead * 100).toFixed(1)} cm)`;
    cowlInto = Math.max(cowlInto, cowl.intoNeck, cowl.intoHead);
    cowlGap = Math.max(cowlGap, cowl.gap);
    if (rounds.out && rounds.carried === held && held.visible) {
      bookFrames++;
      const why = notTheShelfBook(rounds, held);
      if (why && !notBook) notBook = `${why}, ${rounds.doing}`;
    }
    // (the canary: a stand set where the shelf's book he takes stood, his hands on it as he takes it)
    if (canary && rounds.out && !lastOut) {
      const stood = new THREE.Vector3().applyMatrix4(rounds.out.matrix).applyMatrix4(rounds.out.mesh.matrixWorld);
      obstacles.push({ x: stood.x, z: stood.z, r: 0.12, h: stood.y + 0.3 });
    }
    if (rounds.out) lastOut = rounds.out;
    // (the hood's edge on what it lies on, every so often: it rides his chest with it, and the cowl's foot under its top
    // doesn't follow his neck)
    // (his fingers and sleeves against the open book in his hands, as he opens it and reads; the canary's: the book
    // pushed 3 cm down onto his hands, a frame as he reads)
    const open = bookRead(s, true);
    if (open) {
      const pushed = canary && rounds.doing === 'reading a book standing';
      const back = open.position.clone();
      if (pushed) { open.position.add(new THREE.Vector3(0, -0.03, 0).applyQuaternion(open.quaternion)); open.updateMatrixWorld(true); }
      const into = intoBook(s, open);
      if (pushed) { open.position.copy(back); open.updateMatrixWorld(true); }
      if (into.fingers > bookFingers) { bookFingers = into.fingers; bookAt = `${into.fat}, ${rounds.doing}`; }
      bookSleeves = Math.max(bookSleeves, into.sleeves);
      // (its pages the right way up to him and reading left to right; the canary's: the book turned half round, a frame
      // as he reads)
      const prints = printsOf(open), frame = open.children[0];
      const facing = pushed ? turnedRound(frame, () => pageFacing(s, prints)) : pageFacing(s, prints);
      if (Math.min(facing.away - PAGE_FACING.away, facing.right - PAGE_FACING.right) < Math.min(pageAway - PAGE_FACING.away, pageRight - PAGE_FACING.right)) {
        pageAway = facing.away; pageRight = facing.right; pageAt = rounds.doing;
      }
    }
    // (his right hand on the shut book as he takes it off the shelf and puts it back: round its spine, his fingers on
    // its boards; the canary's: the book turned round, its spine away, a frame as he draws it out)
    const shut = G.scene.getObjectByName('library held book');
    if (shut?.visible && rounds.gripped) {
      const turned = canary && rounds.doing.startsWith('taking a book');
      if (turned) { shut.rotateY(Math.PI); shut.updateMatrixWorld(true); }
      const grab = grabRead(s, shut);
      if (turned) { shut.rotateY(Math.PI); shut.updateMatrixWorld(true); }
      grabFrames++;
      const pads = padsRead(s, shut);
      if (pads.off > padsOff) { padsOff = pads.off; padsAt = `${pads.at}, ${rounds.doing}`; }
      if (grab.side < grabSide) { grabSide = grab.side; grabAt = rounds.doing; }
      if (grab.into > grabInto) { grabInto = grab.into; grabIntoAt = `${grab.at}, ${rounds.doing}`; }
    }
    if (frames % HOOD_EVERY === 0) {
      const hood = hoodGap(s);
      if (hood.gap > hoodWorst) { hoodWorst = hood.gap; hoodAt = `${hood.at}, ${rounds.doing}`; }
    }
    // (his body, his hands and the book he holds against the ladder, while he's up)
    if (s.act.sit < 1) {
      const into = intoLadder(s);
      if (into > ladderInto) { ladderInto = into; ladderAt = rounds.doing; }
    }
    // (his forearms out through their sleeves' mouths, each frame)
    const mouth = mouthRead(s, canary && rounds.doing === 'looking a book over' ? MOUTH_CANARY_TIP : 0);
    if (mouth.off > mouthOff) { mouthOff = mouth.off; mouthAt = `his ${mouth.side} forearm, ${rounds.doing}`; }
    // (and his undersleeve's linen inside its sleeve above the cuff, a few frames apart)
    if (frames % 4 === 0) {
      const linen = linenRead(s);
      if (linen.out > linenOut) { linenOut = linen.out; linenAt = `his ${linen.side} undersleeve ${(linen.at * 100).toFixed(0)} cm above the mouth, ${rounds.doing}`; }
    }
    // (him against his table's top, sat or half sat, a few frames apart; his chair each frame)
    if (s.act.sit > 0 && frames % 3 === 0) {
      const table = intoTable(s);
      if (table.into > tableInto) { tableInto = table.into; tableAt = `${table.what}, ${rounds.doing} (sat ${s.act.sit.toFixed(2)})`; }
    }
    const chair = chairRead(s, cases);
    chairFloor = Math.max(chairFloor, chair.floor);
    if (chair.into > chairInto) { chairInto = chair.into; chairAt = `${chair.intoWhat}, ${rounds.doing}`; }
    chairOutMost = Math.max(chairOutMost, chair.out);
    if (chairWas >= 0 && Math.abs(chair.out - chairWas) > 1e-4) {
      chairMoved++;
      const off = chairHandOff(s);
      if (off > chairHand) { chairHand = off; chairHandAt = rounds.doing; }
    }
    chairWas = chair.out;
    // (his hands and that book against the rest, while he's up and clear of his own table and chair)
    if (s.act.sit <= 0) {
      const furniture = intoFurniture(s, obstacles);
      if (furniture > furnitureInto) { furnitureInto = furniture; furnitureAt = rounds.doing; }
    }
    if (frames > 30 && rounds.doing === 'reading at his table' && s.act.sit >= 1) break;
    // (the book he carries, but while he reads it open: the closed one waits hidden meanwhile)
    const carried = rounds.carried;
    if (carried?.visible) {
      if (canary) carried.position.y += 0.5;
      carried.updateMatrixWorld(true);
      const near = Math.min(...hands(s).map((h) => fromBook(carried as THREE.Mesh, h)));
      if (s.act.grip === GRIP_SHUT && near > farthest) {
        farthest = near;
        // (and where: the book's height, and how far it is from his shoulder, his reach)
        const book = carried.getWorldPosition(new THREE.Vector3()), shoulder = s.root.getObjectByName('scholar shoulderR')!.getWorldPosition(new THREE.Vector3());
        farAt = `${rounds.doing} (the book ${book.y.toFixed(2)} m up, ${book.distanceTo(shoulder).toFixed(2)} m from his right shoulder)`;
      }
      if (canary) carried.position.y -= 0.5;
    }
    // (his middle against what stands in the room, while he's up and clear of his own table)
    if (s.act.sit <= 0) {
      const me = rounds.body;
      for (const o of obstacles) {
        const room = Math.hypot(me.x - o.x, me.z - o.z) - o.r;
        if (room < tightest) { tightest = room; tightAt = rounds.doing; }
      }
    }
  }
  rounds.update = update;
  // (put back: the shelf's own book stood in its place again, as it stood; or, kept on his table, its gap left)
  let backInPlace = true;
  if (lastOut && !rounds.out) {
    const m = new THREE.Matrix4();
    lastOut.mesh.getMatrixAt(lastOut.index, m);
    // (as it stood to a hair: stored as single floats, an instance's matrix is never the same double for double)
    backInPlace = m.elements.every((e, i) => Math.abs(e - lastOut!.matrix.elements[i]) < 1e-5) || hiddenAt(m);
  }
  return { frames, beats, farthest, farAt, tightest, tightAt, gapsAtEnd: rounds.gaps, satAtEnd: s.act.sit, turned, turnedAt, headOff, shoeOut, shoeAt,
    cowlInto, cowlGap, cowlAt, bookFrames, notBook, backInPlace, ladderInto, ladderAt, furnitureInto, furnitureAt,
    mouthOff, mouthAt, linenOut, linenAt,
    tableInto, tableAt, chairFloor, chairInto, chairAt, chairMoved, chairHand, chairHandAt, chairOutMost, chairOutAtEnd: chairWas,
    hipsSpeeds, hipsAt, jointSpeeds, jointAt, hoodGap: hoodWorst, hoodAt, bookFingers, bookSleeves, bookAt, pageAway, pageRight, pageAt,
    grabSide, grabAt, grabInto, grabIntoAt, grabFrames, padsOff, padsAt };
}

/** What's wrong with a round. */
function problemsOf(name: string, r: Followed): string[] {
  const problems: string[] = [];
  if (r.frames >= ROUND_FRAMES) problems.push(`rounds (${name}): not back at his table in ${ROUND_FRAMES} frames (last: ${r.beats[r.beats.length - 1]})`);
  if (r.farthest > HAND_MOST) problems.push(`rounds (${name}): a book he held ${r.farthest.toFixed(2)} m from his nearer hand, ${r.farAt} (at most ${HAND_MOST})`);
  if (r.tightest < CLEAR_LEAST) problems.push(`rounds (${name}): his middle ${r.tightest.toFixed(2)} m past what stands in the room's circle, ${r.tightAt} (at least ${CLEAR_LEAST} clear)`);
  if (r.gapsAtEnd && name === 'browse') problems.push(`rounds (${name}): ${r.gapsAtEnd} books still off their shelves once he's back at his table`);
  if (r.satAtEnd < 1) problems.push(`rounds (${name}): not sat at his table at its end`);
  if (r.turned > JOINT_MOST) problems.push(`rounds (${name}): a joint turned ${r.turned.toFixed(1)}° in a frame (${r.turnedAt}; at most ${JOINT_MOST})`);
  if (r.headOff > HEAD_OFF_MOST) problems.push(`rounds (${name}): his head ${r.headOff.toFixed(0)}° off the way he walked (at most ${HEAD_OFF_MOST})`);
  if (r.cowlInto > COWL_INTO_MOST) problems.push(`rounds (${name}): his cowl ${(r.cowlInto * 100).toFixed(1)} cm into his neck or head, ${r.cowlAt} (at most ${COWL_INTO_MOST * 100})`);
  if (r.cowlGap > COWL_GAP_MOST) problems.push(`rounds (${name}): his cowl's top ${(r.cowlGap * 100).toFixed(1)} cm off his neck, ${r.cowlAt} (at most ${COWL_GAP_MOST * 100}: his neck and back seen down inside it)`);
  if (r.notBook) problems.push(`rounds (${name}): the book in his hands isn't the shelf's: ${r.notBook}`);
  problems.push(...jumpsOf(name, r));
  if (pageWrong(r)) problems.push(`rounds (${name}): the open book reads wrong to him, ${r.pageAt}: its pages' tops ${r.pageAway.toFixed(2)} along his forward (at least ${PAGE_FACING.away}), their lines ${r.pageRight.toFixed(2)} along his right (at least ${PAGE_FACING.right}: "Fix upside down book")`);
  if (r.bookFingers > INTO_BOOK_MOST) problems.push(`rounds (${name}): his fingers ${(r.bookFingers * 1000).toFixed(1)} mm into the open book, ${r.bookAt} (at most ${INTO_BOOK_MOST * 1000}: "fingers go through the book")`);
  if (r.bookSleeves > SLEEVES_INTO_BOOK_MOST) problems.push(`rounds (${name}): his sleeves ${(r.bookSleeves * 100).toFixed(1)} cm into the open book (at most ${SLEEVES_INTO_BOOK_MOST * 100})`);
  if (r.grabFrames && r.grabSide < GRAB.spine) problems.push(`rounds (${name}): his right hand ${r.grabSide.toFixed(2)} of the way to the spine of the book he grips, ${r.grabAt} (at least ${GRAB.spine}: "have him grab from other side of book")`);
  if (r.padsOff > PADS_MOST) problems.push(`rounds (${name}): his pad ${(r.padsOff * 1000).toFixed(1)} mm off the book he holds, ${r.padsAt} (at most ${PADS_MOST * 1000}: the book a thing in his hand)`);
  if (r.grabInto > GRAB.into) problems.push(`rounds (${name}): his fingers ${(r.grabInto * 1000).toFixed(1)} mm into the book he grips, ${r.grabIntoAt} (at most ${GRAB.into * 1000})`);
  if (r.hoodGap > HOOD_GAP_MOST) problems.push(`rounds (${name}): the hood's edge ${(r.hoodGap * 100).toFixed(1)} cm off what it lies on, ${r.hoodAt} (at most ${HOOD_GAP_MOST * 100})`);
  if (!r.backInPlace) problems.push(`rounds (${name}): the shelf's book not back in its place as it stood`);
  if (r.ladderInto > LADDER_INTO_MOST) problems.push(`rounds (${name}): he comes ${(r.ladderInto * 100).toFixed(1)} cm inside ${LADDER_MARGIN * 100} cm of the ladder, ${r.ladderAt} (at most ${LADDER_INTO_MOST * 100})`);
  if (r.mouthOff > MOUTH_MOST) problems.push(`rounds (${name}): ${r.mouthAt} crosses its sleeve's mouth ${r.mouthOff.toFixed(2)} of its radius from its middle (at most ${MOUTH_MOST}: "the arm/hand is outside of sleeve")`);
  if (r.linenOut > LINEN_OUT_MOST) problems.push(`rounds (${name}): ${r.linenAt} ${(r.linenOut * 1000).toFixed(0)} mm out through its sleeve above the cuff (at most ${LINEN_OUT_MOST * 1000}: "the arm/hand is outside of sleeve")`);
  if (r.tableInto > TABLE_INTO_MOST) problems.push(`rounds (${name}): ${(r.tableInto * 1000).toFixed(0)} mm of him into his table's top, ${r.tableAt} (at most ${TABLE_INTO_MOST * 1000}: "he overlaps the table lots")`);
  if (r.chairFloor > CHAIR.floor) problems.push(`rounds (${name}): his chair's feet ${(r.chairFloor * 1000).toFixed(0)} mm off the floor or into it (at most ${CHAIR.floor * 1000})`);
  if (r.chairInto > CHAIR.into) problems.push(`rounds (${name}): his chair ${(r.chairInto * 1000).toFixed(0)} mm into ${r.chairAt} (at most ${CHAIR.into * 1000})`);
  if (r.chairMoved && r.chairHand > CHAIR.hand) problems.push(`rounds (${name}): his chair moved with ${r.chairHand === Infinity ? 'no hand on it' : `his hand ${(r.chairHand * 100).toFixed(1)} cm off where it holds it`}, ${r.chairHandAt} (at most ${CHAIR.hand * 100})`);
  if (r.chairOutAtEnd > 0.01) problems.push(`rounds (${name}): his chair left ${(r.chairOutAtEnd * 100).toFixed(0)} cm out from his table at the end ("the chair is left pushed in")`);
  if (r.furnitureInto > FURNITURE_INTO_MOST) problems.push(`rounds (${name}): his hands or book ${(r.furnitureInto * 100).toFixed(1)} cm into the room's furniture, ${r.furnitureAt} (at most ${FURNITURE_INTO_MOST * 100})`);
  if (r.shoeOut > SHOE_OUT_MOST) problems.push(`rounds (${name}): a shoe ${(r.shoeOut * 100).toFixed(1)} cm out through his robe above its hem, ${r.shoeAt} (at most ${SHOE_OUT_MOST * 100})`);
  return problems;
}

const lineOf = (name: string, r: Followed) => `his rounds, ${name}: ${r.beats.join(' > ')}; ${r.frames} frames; a held book at most `
  + `${r.farthest.toFixed(2)} m from his nearer hand; his middle at least ${r.tightest.toFixed(2)} m clear of what stands in the room; `
  + `a joint at most ${r.turned.toFixed(1)}° in a frame (${r.turnedAt}); his head at most ${r.headOff.toFixed(0)}° off his way walking; `
  + `a shoe at most ${(r.shoeOut * 100).toFixed(1)} cm out through his robe; his cowl at most ${(r.cowlInto * 100).toFixed(1)} cm into his neck `
  + `or head and its top ${(r.cowlGap * 100).toFixed(1)} cm off his neck; the shelf's own book in his hands ${r.bookFrames} frames${r.notBook ? ` (not: ${r.notBook})` : ''}; `
  + `at most ${(r.ladderInto * 100).toFixed(1)} cm inside ${LADDER_MARGIN * 100} cm of the ladder, his hands and book ${(r.furnitureInto * 100).toFixed(1)} cm into the other furniture; `
  + `his forearms through their sleeves' mouths at most ${r.mouthOff.toFixed(2)} of their radius from the middle${r.mouthAt ? ` (${r.mouthAt})` : ''}, his undersleeves ${(r.linenOut * 1000).toFixed(0)} mm out through them; `
  + `${(r.tableInto * 1000).toFixed(0)} mm of him into his table's top at most${r.tableAt ? ` (${r.tableAt})` : ''}; his chair drawn out ${(r.chairOutMost * 100).toFixed(0)} cm (moved ${r.chairMoved} frames, his hand at most ${r.chairMoved ? (r.chairHand * 100).toFixed(1) : '-'} cm off it), its feet ${(r.chairFloor * 1000).toFixed(0)} mm off the floor, ${(r.chairInto * 1000).toFixed(0)} mm into what stands by it; `
  + `${continuity(r)}; his fingers at most ${(r.bookFingers * 1000).toFixed(1)} mm and his sleeves ${(r.bookSleeves * 100).toFixed(1)} cm into the open book; gripping a shut book (${r.grabFrames} frames) his right palm at least ${r.grabFrames ? r.grabSide.toFixed(2) : '-'} of the way to its spine, his fingers ${(r.grabInto * 1000).toFixed(1)} mm into it and his pads at most ${(r.padsOff * 1000).toFixed(1)} mm off it; the hood's edge at most ${(r.hoodGap * 1000).toFixed(1)} mm off what it lies on (${r.hoodAt})`;
/** how fast his hips' speed and a joint's turning changed, at most */
const continuity = (r: Followed) => `his hips' speed changing at most ${r.hipsSpeeds.toFixed(1)} m/s a second (${r.hipsAt}), a joint's `
  + `turning ${Math.round(r.jointSpeeds)}°/s a second (${r.jointAt})`;
/** What's wrong with how smoothly he moved in a round. */
function jumpsOf(name: string, r: Followed): string[] {
  const problems: string[] = [];
  if (r.hipsSpeeds > HIPS_SPEEDS_MOST) problems.push(`rounds (${name}): his hips' speed changed ${r.hipsSpeeds.toFixed(1)} m/s in a second, ${r.hipsAt} (at most ${HIPS_SPEEDS_MOST}: a cut)`);
  if (r.jointSpeeds > JOINT_SPEEDS_MOST) problems.push(`rounds (${name}): a joint's turning changed ${Math.round(r.jointSpeeds)}°/s in a second, ${r.jointAt} (at most ${JOINT_SPEEDS_MOST}: a cut)`);
  return problems;
}

/**
 * His rounds checked: a browse, with a hero stood close as he looks for a book (he glances up and goes on), then talked
 * to as he reads standing (he stops, turned to the hero, and goes on after); then a keep and a restock. Pictured from
 * the open room as he walks, takes a book and reads it.
 */
export async function roundsChecked(lab: Lab, s: Scholar, rounds: Rounds, canary: boolean): Promise<{ lines: string[]; problems: string[]; moments: Pictured[] }> {
  const lines: string[] = [], problems: string[] = [], moments: Pictured[] = [];
  const hero = G.player;
  // (in the room's front half, off the door and clear of his ways)
  const away = new THREE.Vector3(1.6, 0, 2.5);
  hero.place(away, Math.PI);
  const programs = G.renderer.info.programs!.length;
  const sat = await frameCost(lab);
  rounds.hold = false;
  rounds.begin('browse');
  // (the canary: one browse, a book he carries held off his hands, which must be found)
  if (canary) {
    const drawingC = lab.drawing;
    lab.drawing = false;
    scholarPlant.noSeatBlend = true;
    scholarPlant.cowlLoose = true;
    roundsPlant.otherBook = true;
    roundsPlant.underLadder = true;
    roundsPlant.cut = true;
    roundsPlant.ownPath = true;
    roundsPlant.chairStays = true;
    const planted = await follow(lab, s, rounds, true);
    roundsPlant.ownPath = false;
    roundsPlant.chairStays = false;
    roundsPlant.underLadder = false;
    roundsPlant.cut = false;
    scholarPlant.noSeatBlend = false;
    scholarPlant.cowlLoose = false;
    roundsPlant.otherBook = false;
    lab.drawing = drawingC;
    rounds.hold = true;
    const caught = planted.farthest > HAND_MOST, jumped = planted.turned > JOINT_MOST;
    lines.push(`canary: a book he carries held half a metre off his hands ${caught ? 'caught' : 'went unseen'} (${planted.farthest.toFixed(2)} m)`);
    lines.push(`canary: his pose jumped from sat to standing, not followed, ${jumped ? 'caught' : 'went unseen'} (${planted.turned.toFixed(1)}° in a frame, ${planted.turnedAt})`);
    if (!caught) problems.push('rounds: the canary\'s book off his hands went unseen');
    if (!jumped) problems.push('rounds: the canary\'s jump from sat to standing went unseen');
    const loose = planted.cowlGap > COWL_GAP_MOST, other = planted.notBook !== '';
    lines.push(`canary: his cowl's top opened off his neck ${loose ? 'caught' : 'went unseen'} (${(planted.cowlGap * 100).toFixed(1)} cm)`);
    lines.push(`canary: another book in his hands than the shelf's ${other ? `caught (${planted.notBook})` : 'went unseen'}`);
    if (!loose) problems.push('rounds: the canary\'s loose cowl went unseen');
    if (!other) problems.push('rounds: the canary\'s other book went unseen');
    const ladder = planted.ladderInto > LADDER_INTO_MOST;
    lines.push(`canary: his spot under the ladder ${ladder ? 'caught' : 'went unseen'} (${(planted.ladderInto * 100).toFixed(1)} cm into it, ${planted.ladderAt})`);
    if (!ladder) problems.push('rounds: the canary\'s spot under the ladder went unseen');
    const stand = planted.furnitureInto > FURNITURE_INTO_MOST;
    lines.push(`canary: a stand where the shelf's book stood, his hands on it ${stand ? 'caught' : 'went unseen'} (${(planted.furnitureInto * 100).toFixed(1)} cm into it, ${planted.furnitureAt})`);
    if (!stand) problems.push('rounds: the canary\'s stand by the shelf went unseen');
    const offHand = planted.padsOff > PADS_MOST;
    lines.push(`canary: the book he holds on its own path beside his hand ${offHand ? 'caught' : 'went unseen'} (his pads ${(planted.padsOff * 1000).toFixed(1)} mm off it, ${planted.padsAt})`);
    if (!offHand) problems.push('rounds: the canary\'s book on its own path went unseen');
    const wrongSide = planted.grabFrames > 0 && planted.grabSide < GRAB.spine;
    lines.push(`canary: the book he takes turned round, its spine away ${wrongSide ? 'caught' : 'went unseen'} (his palm ${planted.grabSide.toFixed(2)} of the way to its spine)`);
    if (!wrongSide) problems.push('rounds: the canary\'s book turned round in his hand went unseen');
    const outOfSleeve = planted.mouthOff > MOUTH_MOST;
    lines.push(`canary: his sleeves tipped down off his forearms as the wide bells hung ${outOfSleeve ? 'caught' : 'went unseen'} (${planted.mouthOff.toFixed(2)} of a mouth's radius, ${planted.mouthAt})`);
    if (!outOfSleeve) problems.push('rounds: the canary\'s sleeves tipped off his forearms went unseen');
    const overlapped = planted.tableInto > TABLE_INTO_MOST;
    lines.push(`canary: his chair left where it stands as he gets up and sits ${overlapped ? 'caught' : 'went unseen'} (${(planted.tableInto * 1000).toFixed(0)} mm of him into his table's top, ${planted.tableAt})`);
    if (!overlapped) problems.push('rounds: the canary\'s chair left where it stands went unseen');
    const upsideDown = pageWrong(planted);
    lines.push(`canary: the open book turned half round in his hands ${upsideDown ? 'caught' : 'went unseen'} (its pages' tops ${planted.pageAway.toFixed(2)} along his forward, their lines ${planted.pageRight.toFixed(2)} along his right)`);
    if (!upsideDown) problems.push('rounds: the canary\'s book turned round went unseen');
    const pushedIn = planted.bookFingers > INTO_BOOK_MOST;
    lines.push(`canary: the open book pushed 3 cm onto his hands ${pushedIn ? 'caught' : 'went unseen'} (${(planted.bookFingers * 1000).toFixed(1)} mm, ${planted.bookAt})`);
    if (!pushedIn) problems.push('rounds: the canary\'s open book on his hands went unseen');
    // (the hood lifted off his back, as it hung before)
    const hood = s.root.getObjectByName('scholar hood')!;
    hood.position.set(0, 0.02, -0.03);
    const lifted = hoodGap(s);
    hood.position.set(0, 0, 0);
    lines.push(`canary: the hood lifted 3 cm off his back ${lifted.gap > HOOD_GAP_MOST ? 'caught' : 'went unseen'} (${(lifted.gap * 100).toFixed(1)} cm off, ${lifted.at})`);
    if (lifted.gap <= HOOD_GAP_MOST) problems.push('rounds: the canary\'s hood lifted off his back went unseen');
    const cut = planted.hipsSpeeds > HIPS_SPEEDS_MOST || planted.jointSpeeds > JOINT_SPEEDS_MOST;
    lines.push(`canary: the end of his rise cut as he sets off ${cut ? 'caught' : 'went unseen'} (${continuity(planted)})`);
    if (!cut) problems.push('rounds: the canary\'s cut at the end of his rise went unseen');
    return { lines, problems, moments };
  }
  // (followed undrawn, a frame at a time: drawn, its 7000 frames took over three minutes; each picture draws its own)
  const drawing = lab.drawing;
  lab.drawing = false;
  /** him as a player sees him: the hero stood `off` m from him towards the room's middle, facing him, the game's own
   *  camera over his shoulder, a few frames drawn for it to settle; the hero put back after */
  const picture = async (label: string, note: string, off = 3) => {
    const at = s.root.getWorldPosition(new THREE.Vector3()), was = hero.pos.clone(), wasFacing = hero.facing, restore = saveCamera();
    const toMiddle = new THREE.Vector3(-at.x, 0, -at.z).normalize();
    const stood = at.clone().addScaledVector(toMiddle, off).setY(0);
    // (the camera turned to him, a little aside: it turns as the player turns it, not with the hero, and straight at him
    // the hero's own back stood in front of him)
    const facing = Math.atan2(at.x - stood.x, at.z - stood.z);
    hero.place(stood, facing);
    faceCamera(facing - 0.62);
    settleCamera(hero.pos);
    const drawing = lab.drawing;
    lab.drawing = true;
    await lab.step(20);
    moments.push(await lab.screen(label, [note]));
    lab.drawing = drawing;
    hero.place(was, wasFacing);
    restore();
  };
  let pictured = new Set<string>(), glance = 180, continued = false, stillFrom: THREE.Vector3 | null = null, moved = 0, faced = 180;
  let nearAtE = '', opened = false, readTilt = [Infinity, -Infinity], readOff = 0, palmPast = 0, readFrames = 0, tipsPast = 0, tipsOff = 0;
  let scanFrames = 0, talkFrames = 0, talked = false, walkFrames = 0, blockedAt: THREE.Vector3 | null = null, wentRound = false;
  let walking = 0;
  const browse = await follow(lab, s, rounds, canary, async (f) => {
    const doing = rounds.doing;
    // (the frame's cost as he walks, drawn)
    if (doing === 'walking to a case' && !walking && f > 100) walking = await frameCost(lab);
    for (const [beat, label, off] of [['walking to a case', 'rounds-walking', 3.4], ['taking a book', 'rounds-taking', 2.6],
      ['reading a book standing', 'rounds-reading', 2.6]] as const) {
      if (doing.startsWith(beat) && !pictured.has(label) && f % 45 === 44) { pictured.add(label); await picture(label, `as the player sees him ${doing}`, off); }
    }
    // (a hero stood a metre from him as he looks for a book: he goes on looking, and glances up)
    if (doing === 'looking for a book') {
      scanFrames++;
      const me = s.root.getWorldPosition(new THREE.Vector3());
      // (before him and off to his side, where he can turn his head to: behind him, his neck can't)
      // (and where he stays: put into a case or behind a wall at a corner, the hero was pushed out to his shoulder,
      // where he can't turn to)
      if (scanFrames === 1) {
        const q = s.root.getWorldQuaternion(new THREE.Quaternion());
        for (const turn of [1.1, -1.1, 0.8, -0.8]) {
          const spot = me.clone().add(new THREE.Vector3(0, 0, 1.1).applyAxisAngle(new THREE.Vector3(0, 1, 0), turn).applyQuaternion(q));
          hero.place(spot, 0);
          await lab.step(1);
          if (hero.pos.distanceTo(spot) < HERO_STAYS) break;
        }
      }
      glance = Math.min(glance, offHero(s));
      if (scanFrames === 75) {
        const drawing = lab.drawing, restore = saveCamera();
        faceCamera(Math.atan2(me.x - hero.pos.x, me.z - hero.pos.z) - 0.62);
        settleCamera(hero.pos);
        lab.drawing = true;
        await lab.step(1);
        moments.push(await lab.screen('rounds-looks-up', ['a hero come close as he looks for a book: he looks up at him, and goes on']));
        lab.drawing = drawing;
        restore();
      }
    } else if (scanFrames && !continued) { continued = true; hero.place(away, Math.PI); }
    // (the open book as he reads it: its pages to his face, tilted back as a reader's, his palms behind its boards)
    if (doing === 'reading a book standing') {
      const held = readHold(s);
      if (held) {
        readFrames++;
        readTilt = [Math.min(readTilt[0], held.tilt), Math.max(readTilt[1], held.tilt)];
        readOff = Math.max(readOff, held.off);
        palmPast = Math.max(palmPast, ...held.palms);
        tipsPast = Math.max(tipsPast, held.tips);
        tipsOff = Math.max(tipsOff, held.tipsOff);
      }
    }
    // (talked to as he reads standing: still, turned to the hero; let go after two seconds)
    if (doing === 'reading a book standing' && !talked) {
      talkFrames++;
      // (the hero walked up to him where he stands and pressed E, as a player talks to him: the spot he's talked at
      // follows him; Esc ends it)
      if (talkFrames === 30) {
        const me = s.root.getWorldPosition(new THREE.Vector3()), f = new THREE.Vector3(0, 0, 1).applyQuaternion(s.root.getWorldQuaternion(new THREE.Quaternion()));
        // (before him, else round him, where a player can stand: put before him into the case he reads at, the hero
        // was pushed out of it, too far off to talk to him)
        for (const turn of [0, 1, -1, 1.6, -1.6, 2.4, -2.4]) {
          const at = me.clone().addScaledVector(f.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), turn), 1.2);
          hero.place(at, Math.atan2(me.x - at.x, me.z - at.z));
          await lab.step(1);
          if (hero.pos.distanceTo(at) < HERO_STAYS && objectNear()?.id === 'scholar') break;
        }
        nearAtE = objectNear()?.id ?? 'nothing';
        await lab.step(1, () => ({ keys: ['e'] }));
        opened = talkOpen();
        stillFrom = me;
      }
      if (stillFrom && talkFrames < 150) moved = Math.max(moved, s.root.getWorldPosition(new THREE.Vector3()).distanceTo(stillFrom));
      if (talkFrames === 149) faced = offHero(s);
      if (talkFrames === 150) {
        await lab.step(1, () => ({ keys: ['escape'] }));
        talked = !talkOpen();
        hero.place(away, Math.PI);
      }
    }
  });
  if (talkOpen()) closeTalk();
  lines.push(lineOf('browse', browse));
  problems.push(...problemsOf('browse', browse));
  lines.push(`the open book as he read it (${readFrames} frames): ${readTilt[0].toFixed(0)} to ${readTilt[1].toFixed(0)}° back from upright, its pages at most `
    + `${readOff.toFixed(0)}° off his eyes, a palm at most ${(palmPast * 100).toFixed(1)} cm past its boards, a fingertip at most `
    + `${(tipsPast * 100).toFixed(1)} cm out past its edges and ${(tipsOff * 100).toFixed(1)} cm out behind its boards`);
  if (tipsOff > TIPS_OFF) problems.push(`rounds: a fingertip ${(tipsOff * 100).toFixed(1)} cm out behind the open book's boards (at most ${TIPS_OFF * 100}: his fingers standing up off it like claws)`);
  if (tipsPast > TIPS_PAST) problems.push(`rounds: a fingertip ${(tipsPast * 100).toFixed(1)} cm out past the open book's edges (at most ${TIPS_PAST * 100}: his fingers up past it like claws)`);
  if (!readFrames) problems.push('rounds: he never read a book standing (nothing measured)');
  if (readTilt[0] < READ_TILT.least || readTilt[1] > READ_TILT.most) problems.push(`rounds: the open book held ${readTilt[0].toFixed(0)} to ${readTilt[1].toFixed(0)}° from upright (a reader's ${READ_TILT.least} to ${READ_TILT.most})`);
  if (readOff > PAGES_OFF) problems.push(`rounds: the open book's pages ${readOff.toFixed(0)}° off his eyes (at most ${PAGES_OFF})`);
  if (palmPast > PAST_BOARDS) problems.push(`rounds: a palm ${(palmPast * 100).toFixed(1)} cm past the open book's boards (in front of its pages or out past an edge; at most ${PAST_BOARDS * 100})`);
  lines.push(`a hero stood a metre off as he looked for a book: ${continued ? 'he went on to take one' : 'he never went on'}, his face at least `
    + `${glance.toFixed(0)}° off the hero meanwhile`);
  if (!continued) problems.push('rounds: a hero stood close as he looked for a book, and he never went on');
  if (glance > GLANCED) problems.push(`rounds: a hero stood close and he never looked up at him (${glance.toFixed(0)}° off)`);
  lines.push(`walked up to as he read standing (the object near: ${nearAtE}) and E pressed: the talk ${opened ? 'opened' : 'never opened'}; `
    + `he moved ${moved.toFixed(3)} m, his face ${faced.toFixed(0)}° off the hero; Esc, ${talked ? 'the talk closed and he went on' : 'the talk stayed open'}`);
  if (!opened) problems.push(`rounds: E by him as he read standing opened no talk (the object near: ${nearAtE})`);
  if (!talked) problems.push('rounds: Esc left the talk with him open');
  if (moved > STILL_MOST) problems.push(`rounds: talked to, he moved ${moved.toFixed(2)} m (at most ${STILL_MOST})`);
  if (faced > GLANCED) problems.push(`rounds: talked to, his face ${faced.toFixed(0)}° off the hero`);
  pictured = new Set();
  // (a book kept on a stack, then one shelved from a stack in its gap. As he walks to a case for the keep, the hero steps
  // into his way and stands there: he waits a moment, then goes round, or waits on where there's no way round. Tried in
  // the browse, it used up his glance just before the hero stood close)
  rounds.begin('keep');
  const keep = await follow(lab, s, rounds, canary, () => {
    if (rounds.doing !== 'walking to a case') return;
    walkFrames++;
    const me = s.root.getWorldPosition(new THREE.Vector3());
    if (walkFrames === 40) {
      const ahead = new THREE.Vector3(0, 0, 0.85).applyQuaternion(s.root.getWorldQuaternion(new THREE.Quaternion()));
      blockedAt = me.clone().add(ahead);
      hero.place(blockedAt, 0);
    }
    if (blockedAt && walkFrames === 400) hero.place(away, Math.PI);
    if (blockedAt && walkFrames < 400 && me.distanceTo(blockedAt) > 1.3) wentRound = true;
  });
  lines.push(lineOf('keep', keep));
  problems.push(...problemsOf('keep', keep));
  // (round him where there's a way; where there's none, he waits, and goes on as the hero steps aside: either way, never
  // through what stands in the room, and never stood there for good)
  lines.push(`the hero stood in his way as he walked to a case for 6 s: ${!blockedAt ? 'never stood there' : wentRound ? 'he went round him' : 'no way round: he waited, and went on as the hero stepped aside'}`);
  if (!blockedAt) problems.push('rounds: the hero never stood in his way (nothing measured)');
  const gaps = rounds.gaps;
  rounds.begin('restock');
  const restock = await follow(lab, s, rounds, canary);
  lines.push(lineOf('restock', restock));
  problems.push(...problemsOf('restock', restock));
  lines.push(`books off their shelves: ${gaps} after he kept one, ${rounds.gaps} after he restocked`);
  // (his other tasks: a case dusted, a row squared, the globe set turning)
  const cloth = G.scene.getObjectByName('library dusting cloth')!, ball = G.scene.getObjectByName('library globe')!;
  let clothFar = 0, clothFrames = 0;
  rounds.begin('dust');
  const dust = await follow(lab, s, rounds, canary, () => {
    if (!cloth.visible || rounds.doing !== 'dusting a case') return;
    clothFrames++;
    const palm = hands(s)[1], at = cloth.getWorldPosition(new THREE.Vector3());
    clothFar = Math.max(clothFar, palm.distanceTo(at));
  });
  lines.push(lineOf('dust', dust), `his dusting cloth shown ${clothFrames} frames, at most ${clothFar.toFixed(2)} m from his right palm`);
  problems.push(...problemsOf('dust', dust));
  if (!clothFrames) problems.push('rounds: he dusted with no cloth shown');
  if (clothFar > CLOTH_MOST) problems.push(`rounds: his dusting cloth ${clothFar.toFixed(2)} m from his right palm (at most ${CLOTH_MOST})`);
  rounds.begin('tidy');
  const tidy = await follow(lab, s, rounds, canary);
  lines.push(lineOf('tidy', tidy));
  problems.push(...problemsOf('tidy', tidy));
  const last = ball.quaternion.clone();
  let turned = 0;
  rounds.begin('globe');
  const globe = await follow(lab, s, rounds, canary, () => { turned += last.angleTo(ball.quaternion); last.copy(ball.quaternion); });
  lines.push(lineOf('globe', globe), `the globe turned ${turned.toFixed(1)} rad in all`);
  problems.push(...problemsOf('globe', globe));
  if (turned < GLOBE_TURNS) problems.push(`rounds: the globe he set turning turned ${turned.toFixed(2)} rad (at least ${GLOBE_TURNS})`);
  // (and a browse on frames of uneven lengths, as a screen of another rate or a hitch gives them: no beat may hand on
  // to the next with a cut there either)
  rounds.begin('browse');
  const uneven = await follow(lab, s, rounds, false, undefined, UNEVEN);
  lines.push(`a browse on frames of ${UNEVEN.map((d) => d * 1000).join(', ')} ms in turn: ${continuity(uneven)}`);
  problems.push(...jumpsOf('browse, uneven frames', uneven));
  // (where he stands at the cases: many, round every case he can walk to, gone to in turn; none by the ladder)
  const spots = rounds.spots, reachable = spots.filter((sp) => sp.reachable), used = reachable.filter((sp) => sp.used > 0);
  const twice = reachable.some((sp) => sp.used > 1) && used.length < reachable.length;
  const near = spotsAgainstLadder(rounds, G.arena.rooms!.library!.group);
  lines.push(`spots at the cases: ${spots.length}, ${reachable.length} reachable from his table; he went to ${used.length} of them `
    + `(${used.map((sp) => sp.used).join(', ')} times)${twice ? ', one again before every one once' : ''}; standing at any, at most `
    + `${(near.into * 100).toFixed(1)} cm inside ${LADDER_MARGIN * 100} cm of the ladder`);
  if (reachable.length < SPOTS_LEAST) problems.push(`rounds: ${reachable.length} spots at the cases he can walk to (at least ${SPOTS_LEAST}: "add more spots for him to stand/pick books, not just two")`);
  if (used.length < Math.min(SPOTS_LEAST, reachable.length)) problems.push(`rounds: he went to ${used.length} spots at the cases (at least ${Math.min(SPOTS_LEAST, reachable.length)})`);
  if (twice) problems.push('rounds: he went to a spot again before every spot he can walk to once');
  if (near.into > LADDER_INTO_MOST) problems.push(`rounds: standing at ${near.at}, he'd come ${(near.into * 100).toFixed(1)} cm inside ${LADDER_MARGIN * 100} cm of the ladder ("he should not stand there")`);
  const compiled = G.renderer.info.programs!.length - programs;
  lines.push(`programs the game's renderer compiled over his rounds (pictured as he walks, takes and reads a book): ${compiled}`);
  if (compiled) problems.push(`rounds: the game's renderer compiled ${compiled} programs over his rounds (none may be)`);
  lines.push(`the frame (drawn, and the browser's): ${sat.toFixed(1)} ms as he sits reading, ${walking ? walking.toFixed(1) : '?'} ms as he walks`);
  if (gaps < 1) problems.push('rounds: he kept a book, and no shelf had a gap for it');
  if (rounds.gaps >= gaps) problems.push('rounds: he restocked, and no gap was filled');
  rounds.hold = true;
  lab.drawing = drawing;
  return { lines, problems, moments };
}

/**
 * His grip swept over every spot at the cases he can walk to, at its lowest book and its highest (`roundsPlant.takeAt`,
 * the browse cut short to the take, a look and the shelving): each followed a frame at a time as his rounds are, his pads
 * on the book he holds, his fingers out of it and his palm at its spine. From play: "have him grab from other side of
 * book" (at some shelves his hand hung off the book, at others it went into it).
 */
export async function gripsSwept(lab: Lab, s: Scholar, rounds: Rounds): Promise<{ lines: string[]; problems: string[] }> {
  const lines: string[] = [], problems: string[] = [];
  const reachable = rounds.spots.map((sp, i) => ({ sp, i })).filter(({ sp }) => sp.reachable);
  let takes = 0, pads = 0, padsAt = '', into = 0, intoAt = '', side = Infinity, sideAt = '', missed = 0;
  roundsPlant.quick = true;
  try {
    for (const { i } of reachable) {
      for (const high of [false, true]) {
        roundsPlant.takeAt = { spot: i, high };
        rounds.hold = false;
        rounds.begin('browse');
        const r = await follow(lab, s, rounds, false);
        const where = `spot ${i} ${high ? 'high' : 'low'}`;
        takes++;
        if (!r.grabFrames) { missed++; problems.push(`grips: at ${where} his pinch never closed on the book`); continue; }
        if (r.padsOff > pads) { pads = r.padsOff; padsAt = `${where}: ${r.padsAt}`; }
        if (r.grabInto > into) { into = r.grabInto; intoAt = `${where}: ${r.grabIntoAt}`; }
        if (r.grabSide < side) { side = r.grabSide; sideAt = `${where}: ${r.grabAt}`; }
      }
    }
  } finally {
    roundsPlant.quick = false;
    roundsPlant.takeAt = null;
  }
  lines.push(`grips swept: ${takes} takes at ${reachable.length} spots, each at its lowest and highest book; his pads at most `
    + `${(pads * 1000).toFixed(1)} mm off the book he holds (${padsAt}), his fingers ${(into * 1000).toFixed(1)} mm into it (${intoAt}), `
    + `his palm at least ${side.toFixed(2)} of the way to its spine (${sideAt})${missed ? `; his pinch never closed at ${missed}` : ''}`);
  if (pads > PADS_MOST) problems.push(`grips: his pad ${(pads * 1000).toFixed(1)} mm off the book he holds at ${padsAt} (at most ${PADS_MOST * 1000})`);
  if (into > GRAB.into) problems.push(`grips: his fingers ${(into * 1000).toFixed(1)} mm into the book he holds at ${intoAt} (at most ${GRAB.into * 1000})`);
  if (side < GRAB.spine) problems.push(`grips: his palm ${side.toFixed(2)} of the way to the spine at ${sideAt} (at least ${GRAB.spine})`);
  return { lines, problems };
}
