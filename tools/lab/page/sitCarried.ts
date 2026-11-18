// What a hero carries, followed as he sits down and gets up (tools/lab `sit`): every rigid mesh of his model (a
// weapon's, a shield's, the staff's, the bow's, the book's), read frame by frame as drawn. A mesh moved by the pose
// (not carried along by the bone it hangs from) must be in a hand while it moves, or lie still: from play, "staff
// dropping in a weird way" (the mage let go of it at a fifth of the way down and it went on to the floor on its own),
// "he just summons the bow into his hand using jedi force", "when warrior sits on a log, weapons are being pulled
// around with jedi force too, on sit down, and on stand up". A mesh turned or thrown further in a frame than a hand
// moves it is a jump. And what he holds is held as before once he's up again: "staff rotated when he stands up". A
// piece held is turned by the hand that holds it, not in it: "warrior magically rotates the sword in his hand" (the
// greatsword swung half round in his fist as he lowered it, 2 degrees a frame, under the jumps' limit), nor slid
// through it: "ranger uses force pull to grab his bow from seated near fire, when standing up". A palm resting on a
// piece's end (on a pommel, as a greatsword is stood under it) holds it to the floor, not in a grip: it turns under
// the palm as it's pushed upright, and isn't counted as turned in the hand; nor does an open hand, its fingers let
// go for the blade to swing round in it as a swordsman regrips (the game's `Model.fists`).
import * as THREE from 'three';
import type { Fist } from '../../../src/types';
import type { Lab } from './lab';
import { FIST_OPEN } from './range';

/** a palm this near a piece holds it (m): the fingers round a handle, a strap's width */
const HELD_WITHIN = 0.06;
/** a forearm's line this near a piece strapped to it holds it (m): a strap's width from the arm's skin, 4 cm off its
 *  line */
const STRAPPED_WITHIN = HELD_WITHIN + 0.04;
/** where a palm's middle is in its hand's frame (rig units): down the hand from the wrist, onto its palm */
export const PALM_AT = new THREE.Vector3(0, -0.06, -0.02);
/** a palm within this share of a piece's length of either end rests on it (a greatsword's pommel: 0.03 to 0.06; its
 *  fist round its grip: 0.27). Judged by which way the palm faced, a fist round a grip read 0.76 along the blade, as
 *  much as a palm laid on a slanting pommel */
const END_SHARE = 0.1;
/** the hands in the order `palmsOf` gives their palms */
const HANDS = ['left', 'right'] as const;
/** a mesh moving less than this a frame is still (m) */
const STILL = 0.002;
/** a piece judged that went this far in all with no hand on it moved on its own (m) */
export const LOOSE_MOST = 0.03;
/** a mesh that went this far from where it hangs over the frames is moved by the pose, and judged (m): a quiver
 *  tipped as he sits moves a few centimetres on its strap; a staff or a book laid on the floor goes half a metre */
const MOVED_FROM = 0.15;
/** in a frame, a mesh turned more than this (degrees) or thrown further than this (m) jumped */
const TURN_MOST = 25;
const THROW_MOST = 0.12;
/** once he's up, what he held is held this near as before he sat (m at any corner, degrees) */
const REHELD_MOST = 0.03;
const RETURNED_MOST = 10;
/** how far a held piece may turn in the hand holding it while it's held (degrees), and slide in it (m): a loose
 *  grip's give */
export const IN_HAND_MOST = 20;
export const SLID_MOST = 0.05;
/** a frame's turn (degrees) or slide (m) in the hand under this is the grip's own fitting, and isn't counted: added
 *  up, a weapon held still in the hand read 830 degrees and 23 m over a walk to a log and a sit */
const IN_HAND_FROM = 0.5;
const SLID_FROM = 0.003;
/** cloth, followed as cloth elsewhere (`coat.ts`), never a rigid piece */
const CLOTHS = ['skirt', 'hood'];
const DEG = 180 / Math.PI;

/** A rigid mesh followed: the piece it belongs to (the object over it hung from a joint: a staff's shaft, rings and
 *  crystal are one), its name, that joint, whether a hand can hold it (it hangs from a hand), and its box's corners. */
interface Part {
  mesh: THREE.Mesh;
  group: THREE.Object3D;
  name: string;
  joint: THREE.Object3D;
  inHand: boolean;
  corners: THREE.Vector3[];
}

/** A jump: what it did, by how much of its limit, on which frame. */
interface Jump {
  by: string;
  size: number;
  at: string;
}

/** A held piece's middle, in the world and in its hand's frame (scaled as the world is). */
interface Origin {
  world: THREE.Vector3;
  onJoint: THREE.Vector3;
}

/** One mesh's frames: where its corners were (the world's and its joint's), and what it did. */
interface Followed {
  part: Part;
  world: THREE.Vector3[] | null;
  onJoint: THREE.Vector3[] | null;
  start: THREE.Vector3[] | null;
  quaternion: THREE.Quaternion | null;
  heldEver: boolean;
  movedFrom: number;
  loose: number;
  looseFrames: number;
  looseAt: string;
  jump: Jump | null;
  /** its turn in its joint's frame the frame before, while held, and how far it has turned in the hand since it was
   *  taken (degrees), the most it did and where */
  inHandWas: THREE.Quaternion | null;
  /** where the piece's own middle (its group's origin: a grip, a bow's handle) was the frame before, in the world and
   *  in its joint's frame (m), while held */
  originWas: Origin | null;
  inHand: number;
  slid: number;
  inHandFrom: string;
  turnedInHand: InHand | null;
  slidInHand: InHand | null;
}

/** How far a piece turned (degrees) or slid (m) in the hand holding it, from which frame to which. */
export interface InHand {
  by: number;
  from: string;
  to: string;
}

/** What a piece did, as `Carried.findings` says it: how far it went with no hand on it (m), on how many frames,
 *  from which, and its worst jump. */
export interface CarriedFinding {
  name: string;
  loose: number;
  looseFrames: number;
  looseAt: string;
  jump: Jump | null;
  turnedInHand: InHand | null;
  slidInHand: InHand | null;
}

/** Every rigid piece of the hero, followed frame by frame. */
export class Carried {
  private readonly followed: Followed[];
  /** the piece `trace` names, frame by frame: how far its meshes went and turned at most, held or not */
  readonly traced: string[] = [];
  /** each hand and elbow where it was the frame before, for the trace: whether a piece jumped with its hand or in it */
  private readonly handsWere = new Map<THREE.Object3D, HandAt>();

  /** `trace`: a piece to list frame by frame (`lab sit --trace`), by its name */
  constructor(private readonly lab: Lab, private readonly trace?: string) {
    this.followed = partsOf(lab).map((part) => ({
      part, world: null, onJoint: null, start: null, quaternion: null, heldEver: false, movedFrom: 0,
      loose: 0, looseFrames: 0, looseAt: '', jump: null,
      inHandWas: null, originWas: null, inHand: 0, slid: 0, inHandFrom: '',
      turnedInHand: null, slidInHand: null,
    }));
  }

  /** The frame read: each mesh shown, held or not, and how it moved since the last. `frame` names it. */
  observe(frame: string): void {
    const lab = this.lab;
    lab.model.root.updateMatrixWorld(true);
    const held = heldPieces(lab, this.followed.map((each) => each.part));
    const palms = palmsOf(lab);
    const k = lab.joints.root.scale.x;
    const frameOf: TraceFrame = { went: 0, turned: 0, held: false, seen: false };
    for (const each of this.followed) {
      const { part } = each;
      if (!shown(part.mesh)) {
        each.world = null;
        continue;
      }
      const world = part.corners.map((corner) => part.mesh.localToWorld(corner.clone()));
      const onJoint = world.map((point) => part.joint.worldToLocal(point.clone()).multiplyScalar(k));
      const quaternion = part.mesh.getWorldQuaternion(new THREE.Quaternion());
      const inHand = held.has(part.group);
      each.heldEver ||= inHand;
      each.start ??= onJoint;
      each.movedFrom = Math.max(each.movedFrom, farthest(onJoint, each.start));
      if (each.world && each.onJoint && each.quaternion) {
        const moved = farthest(world, each.world);
        if (!inHand && moved > STILL && farthest(onJoint, each.onJoint) > STILL) {
          each.loose += moved;
          each.looseFrames++;
          each.looseAt ||= `${meshName(part.mesh)}, from ${frame}`;
        }
        const turned = each.quaternion.angleTo(quaternion) * DEG;
        const mesh = meshName(part.mesh);
        if (part.name === this.trace) traceInto(frameOf, moved, turned, inHand);
        if (part.name === this.trace) frameOf.along = palms.map((palm) => alongPiece(part.group, palm));
        if (turned > TURN_MOST) {
          each.jump = worse(each.jump, `${mesh} turned ${turned.toFixed(0)}°`, turned / TURN_MOST, frame);
        }
        if (moved > THROW_MOST) {
          each.jump = worse(each.jump, `${mesh} went ${(moved * 100).toFixed(0)} cm`, moved / THROW_MOST, frame);
        }
      }
      const gripped = inHand && palms.some((palm, i) => gripsIt(part, palm, HANDS[i], lab.model.fists));
      followInHand(each, gripped, quaternion, frame);
      each.world = world;
      each.onJoint = onJoint;
      each.quaternion = quaternion;
    }
    if (frameOf.seen) this.traced.push(`${traceLine(frame, frameOf)}; ${this.inHandNow()}; ${this.handsMoved()}`);
  }

  /** How far the traced piece has turned and slid in its hand so far, the most of its meshes, and on which joint. */
  private inHandNow(): string {
    const traced = this.followed.filter((each) => each.part.name === this.trace);
    const turned = Math.max(0, ...traced.map((each) => each.inHand));
    const slid = Math.max(0, ...traced.map((each) => each.slid));
    const joint = traced[0]?.part.joint.name ?? '';
    return `in his ${joint} turned ${turned.toFixed(1)}°, slid ${(slid * 100).toFixed(1)} cm${this.fistsNow()}`;
  }

  /** How far each hand with a fist is curled, as a line's part: under `FIST_OPEN` it grips nothing. */
  private fistsNow(): string {
    const fists = this.lab.model.fists ?? [];
    return fists.map((fist) => {
      const across = THREE.MathUtils.radToDeg(fist.across ?? 0).toFixed(0);
      return `, ${fist.hand} fist curled ${fist.curl.toFixed(2)}, its handle ${across}° off across its palm`;
    }).join('');
  }

  /** How far each hand and elbow went and turned since the frame before, as a line's end. */
  private handsMoved(): string {
    const joints = this.lab.joints;
    const arms: [string, THREE.Object3D][] = [
      ['right hand', joints.handR], ['elbow', joints.elbowR], ['left hand', joints.handL], ['elbow', joints.elbowL],
    ];
    return arms.map(([name, joint]) => `${name} ${handMoved(joint, this.handsWere)}`).join(', ');
  }

  /** Each piece the pose moved (held at some frame, or taken from where it hangs), and what it did: its mesh that
   *  went furthest on its own, and its worst jump. A piece worn on a strap (`userData.worn` on it or over it: the
   *  ranger's quiver, tipped back off the floor as he sits) swings there with no hand on it, and is judged by its
   *  jumps alone. */
  findings(): CarriedFinding[] {
    const judged = this.followed.filter((each) => each.heldEver || each.movedFrom > MOVED_FROM);
    for (const each of judged) if (worn(each.part.mesh)) each.loose = 0;
    const byName = new Map<string, CarriedFinding>();
    for (const each of judged) {
      const was = byName.get(each.part.name);
      const jump = worse(was?.jump ?? null, each.jump?.by ?? '', each.jump?.size ?? 0, each.jump?.at ?? '');
      const turnedInHand = mostInHand(was?.turnedInHand ?? null, each.turnedInHand);
      const slidInHand = mostInHand(was?.slidInHand ?? null, each.slidInHand);
      const { name } = each.part;
      if (!was || each.loose > was.loose) {
        const { loose, looseFrames, looseAt } = each;
        byName.set(name, { name, loose, looseFrames, looseAt, jump, turnedInHand, slidInHand });
      } else {
        was.jump = jump;
        was.turnedInHand = turnedInHand;
        was.slidInHand = slidInHand;
      }
    }
    return [...byName.values()];
  }
}

/**
 * How far a held piece has turned and slid in its hand, followed a frame (`quaternion`: its turn in the world now; read
 * before `each` takes it). Each frame adds the lesser of its move in the world and its move in the hand's frame: a
 * piece moved with the hand moves in the world alone, and a palm moved over a piece that stands still moves in the
 * hand's frame alone (a palm going onto a pommel), but a piece turned or pulled through the fist does both. Its slide
 * is its own middle's (its group's origin): its corners' went round with its turn. Let go of, it's taken afresh. A piece
 * turning on its own mount (a staff's crystal, `userData.sitAnimated`) is passed over, and so is a two-hander tipped
 * upright on its far end on the ground as his hand turns round it (`userData.tipping`), the one turn in his hand there is.
 */
function followInHand(each: Followed, held: boolean, quaternion: THREE.Quaternion, frame: string): void {
  const { mesh, joint, group } = each.part;
  if (!held || mesh.userData.sitAnimated || mesh.parent?.userData.sitAnimated) {
    each.inHandWas = null;
    each.originWas = null;
    each.inHand = 0;
    each.slid = 0;
    return;
  }
  const inJoint = joint.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(quaternion);
  const world = group.getWorldPosition(new THREE.Vector3());
  const onJoint = joint.worldToLocal(world.clone()).multiply(joint.getWorldScale(new THREE.Vector3()));
  const origin = { world, onJoint };
  if (!each.inHandWas || !each.quaternion || !each.originWas) each.inHandFrom = frame;
  else {
    const inWorld = each.quaternion.angleTo(quaternion) * DEG;
    const turned = Math.min(inWorld, each.inHandWas.angleTo(inJoint) * DEG);
    const was = each.originWas;
    const slid = slidAcross(group, joint, origin, was);
    const tipping = isTipping(mesh);
    if (!tipping && turned >= IN_HAND_FROM) each.inHand += turned;
    if (!tipping && slid >= SLID_FROM) each.slid += slid;
    each.turnedInHand = further(each.turnedInHand, each.inHand, each.inHandFrom, frame);
    each.slidInHand = further(each.slidInHand, each.slid, each.inHandFrom, frame);
  }
  each.inHandWas = inJoint;
  each.originWas = origin;
}

/** How far a held piece's middle moved from `was` to `now`, the lesser of in the world and in the hand's frame; of a
 *  haft slid through the fist along its length on purpose (`userData.slidesAlong`: a maul stood head up, his fist going
 *  up it as its butt comes down onto the floor), only what's across that length. */
function slidAcross(group: THREE.Object3D, joint: THREE.Object3D, now: Origin, was: Origin): number {
  const world = now.world.clone().sub(was.world);
  const onJoint = now.onJoint.clone().sub(was.onJoint);
  const slider = slidingOf(group);
  if (slider) {
    const length = new THREE.Vector3(0, 1, 0).transformDirection(slider.matrixWorld);
    world.addScaledVector(length, -world.dot(length));
    const inJoint = length.clone().transformDirection(joint.matrixWorld.clone().invert());
    onJoint.addScaledVector(inJoint, -onJoint.dot(inJoint));
  }
  return Math.min(world.length(), onJoint.length());
}

/** What `object` is part of that slides through the fist along its own length (`userData.slidesAlong`), if anything. */
function slidingOf(object: THREE.Object3D): THREE.Object3D | null {
  for (let at: THREE.Object3D | null = object; at; at = at.parent) if (at.userData.slidesAlong) return at;
  return null;
}

/** Whether `object` is part of what's being tipped upright on its far end (`userData.tipping`). */
function isTipping(object: THREE.Object3D): boolean {
  for (let at: THREE.Object3D | null = object; at; at = at.parent) if (at.userData.tipping) return true;
  return false;
}

/** `was`, or a stretch of `by` from `from` to `to` if it went further. */
function further(was: InHand | null, by: number, from: string, to: string): InHand | null {
  return by > (was?.by ?? 0) ? { by, from, to } : was;
}

/** The more turned in its hand of two. */
function mostInHand(a: InHand | null, b: InHand | null): InHand | null {
  if (!a) return b;
  if (!b) return a;
  return b.by > a.by ? b : a;
}

/** A traced piece's frame: the most any of its meshes went (m) and turned (degrees), and whether a hand held it. */
interface TraceFrame {
  went: number;
  turned: number;
  held: boolean;
  seen: boolean;
  /** each palm's place along the piece (0 to 1 from one end to the other) */
  along?: number[];
}

/** One of the traced piece's meshes read into its frame. */
function traceInto(frame: TraceFrame, went: number, turned: number, held: boolean): void {
  frame.went = Math.max(frame.went, went);
  frame.turned = Math.max(frame.turned, turned);
  frame.held ||= held;
  frame.seen = true;
}

/** A hand's place and turn in the world at a frame. */
interface HandAt {
  at: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

/** How far a hand went and turned since it was last read, `were` keeping where it was. */
function handMoved(hand: THREE.Object3D, were: Map<THREE.Object3D, HandAt>): string {
  const at = hand.getWorldPosition(new THREE.Vector3());
  const now = { at, quaternion: hand.getWorldQuaternion(new THREE.Quaternion()) };
  const was = were.get(hand);
  were.set(hand, now);
  if (!was) return 'first seen';
  const went = (now.at.distanceTo(was.at) * 100).toFixed(1);
  return `${went} cm, ${(now.quaternion.angleTo(was.quaternion) * DEG).toFixed(1)}°`;
}

/** The traced piece's frame as a line. */
function traceLine(at: string, frame: TraceFrame): string {
  const went = `${(frame.went * 100).toFixed(1)} cm`;
  const palms = frame.along ? `, palms along it ${frame.along.map((share) => share.toFixed(2)).join(' ')}` : '';
  return `${at}: went ${went}, turned ${frame.turned.toFixed(1)}°${frame.held ? '' : ', no hand on it'}${palms}`;
}

/** The worse of a jump and one of `size` (none of size 0). */
function worse(jump: Jump | null, by: string, size: number, at: string): Jump | null {
  if (size <= 0 || (jump && jump.size >= size)) return jump;
  return { by, size, at };
}

/** Where each mesh of what he holds now is in its joint's frame (m), and how it's turned on it: by piece. */
export type HeldNow = Map<string, { onJoint: THREE.Vector3[]; quaternion: THREE.Quaternion }[]>;

/** What he holds now, mesh by mesh in its joint's frame, to compare with what he holds later (`heldApart`). */
export function heldNow(lab: Lab): HeldNow {
  lab.model.root.updateMatrixWorld(true);
  const parts = partsOf(lab);
  const held = heldPieces(lab, parts);
  const k = lab.joints.root.scale.x;
  const now: HeldNow = new Map();
  for (const part of parts) {
    if (!held.has(part.group) || !shown(part.mesh)) continue;
    // A staff's crystal and rings turn continuously on their mount. Compare the mount and their scale, not the
    // time-dependent spin and bob; their actual movement is still followed frame by frame by Carried.observe.
    const animated = part.mesh.userData.sitAnimated && part.mesh.parent;
    const onJoint = part.corners.map((corner) => {
      const point = corner.clone();
      if (animated) animated.localToWorld(point.multiply(part.mesh.scale));
      else part.mesh.localToWorld(point);
      return part.joint.worldToLocal(point).multiplyScalar(k);
    });
    const quaternion = part.joint.getWorldQuaternion(new THREE.Quaternion()).invert()
      .multiply((animated || part.mesh).getWorldQuaternion(new THREE.Quaternion()));
    const meshes = now.get(part.name) ?? [];
    meshes.push({ onJoint, quaternion });
    now.set(part.name, meshes);
  }
  return now;
}

/** A piece no longer held as before: how far a corner is off (m), how turned (degrees), or gone from the hand. */
export interface HeldApart {
  name: string;
  off: number;
  turned: number;
  gone: boolean;
}

/** What was held before and isn't held as it was now: off over `offMost` (m) on its joint or turned over
 *  `turnedMost` (degrees). */
export function heldApart(
  before: HeldNow, after: HeldNow, offMost = REHELD_MOST, turnedMost = RETURNED_MOST,
): HeldApart[] {
  const apart: HeldApart[] = [];
  for (const [name, was] of before) {
    const now = after.get(name);
    if (!now || now.length !== was.length) {
      apart.push({ name, off: 0, turned: 0, gone: true });
      continue;
    }
    const off = Math.max(...was.map((mesh, i) => farthest(now[i].onJoint, mesh.onJoint)));
    const turned = Math.max(...was.map((mesh, i) => now[i].quaternion.angleTo(mesh.quaternion) * DEG));
    if (off > offMost || turned > turnedMost) apart.push({ name, off, turned, gone: false });
  }
  return apart;
}

/** The canary: the first piece a palm grips now turned by `angle` (rad) in his hand; undone by what's returned (none
 *  if no palm grips one: a palm resting on a pommel holds nothing in its grip). */
export function turnHeld(lab: Lab, angle: number): (() => void) | null {
  lab.model.root.updateMatrixWorld(true);
  const parts = partsOf(lab);
  const palms = palmsOf(lab);
  const grips = (part: Part) => palms.some((palm, i) => gripsIt(part, palm, HANDS[i], lab.model.fists));
  const part = parts.find((each) => shown(each.mesh) && each.inHand && grips(each));
  if (!part) return null;
  part.group.rotateX(angle);
  return () => part.group.rotateX(-angle);
}

/** Each palm's middle in the world now. */
function palmsOf(lab: Lab): THREE.Vector3[] {
  return [lab.joints.handL, lab.joints.handR].map((hand) => hand.localToWorld(PALM_AT.clone()));
}

/** each piece's box in its own frame, every mesh of it */
const piecesBoxes = new WeakMap<THREE.Object3D, THREE.Box3>();

/** Whether a hand (its palm at `palm`) grips a piece: on it, round it rather than resting on its end, and, on a game
 *  that tells its fists (`fists`), with a fist for that hand curled `FIST_OPEN` or more. (A hand with no fist told
 *  read as gripping: the ranger's opening off his bow laid on the floor "slid" 20 cm through it.) */
function gripsIt(part: Part, palm: THREE.Vector3, hand: Fist['hand'], fists?: readonly Fist[]): boolean {
  if (palmOn(part.mesh, palm) >= HELD_WITHIN || onItsEnd(part.group, palm)) return false;
  if (!fists) return true;
  const fist = fists.find((each) => each.hand === hand);
  return !!fist && fist.curl >= FIST_OPEN;
}

/** Whether a palm rests on a piece's end, as on a pommel's top: within `END_SHARE` of either end of its length. */
function onItsEnd(group: THREE.Object3D, palm: THREE.Vector3): boolean {
  const along = alongPiece(group, palm);
  return along < END_SHARE || along > 1 - END_SHARE;
}

/** Where `palm` is along a piece's length: 0 at one end, 1 at the other. */
function alongPiece(group: THREE.Object3D, palm: THREE.Vector3): number {
  const box = pieceBox(group);
  const local = group.worldToLocal(palm.clone());
  const axis = lengthAxis(box);
  const size = box.getSize(new THREE.Vector3());
  return (local.getComponent(axis) - box.min.getComponent(axis)) / size.getComponent(axis);
}

/** Which of a box's sides is its longest (0, 1 or 2: x, y, z). */
function lengthAxis(box: THREE.Box3): number {
  const size = box.getSize(new THREE.Vector3());
  if (size.x >= size.y && size.x >= size.z) return 0;
  return size.y >= size.z ? 1 : 2;
}

/** A piece's box in its own frame, every mesh of it, made once. */
function pieceBox(group: THREE.Object3D): THREE.Box3 {
  const made = piecesBoxes.get(group);
  if (made) return made;
  group.updateMatrixWorld(true);
  const toPiece = group.matrixWorld.clone().invert();
  const box = new THREE.Box3();
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const inPiece = mesh.matrixWorld.clone().premultiply(toPiece);
    box.union(mesh.geometry.boundingBox!.clone().applyMatrix4(inPiece));
  });
  piecesBoxes.set(group, box);
  return box;
}

/** The pieces a palm is on now: of those hung from a hand, any whose mesh a palm is within `HELD_WITHIN` of; a piece
 *  strapped to the forearm (`userData.strapped`, a shield) the wrist or the forearm's middle too. (A shield on a forearm
 *  resting on his knee, the palm turned down off it, read "moved 50 cm with no hand on it", following the arm.) */
function heldPieces(lab: Lab, parts: Part[]): Set<THREE.Object3D> {
  const palms = palmsOf(lab);
  const arms = forearmsOf(lab);
  const held = new Set<THREE.Object3D>();
  for (const part of parts) {
    if (!part.inHand || held.has(part.group) || !shown(part.mesh)) continue;
    const onPalm = palms.some((palm) => palmOn(part.mesh, palm) < HELD_WITHIN);
    const onArm = part.group.userData.strapped && arms.some((arm) => palmOn(part.mesh, arm) < STRAPPED_WITHIN);
    if (onPalm || onArm) held.add(part.group);
  }
  return held;
}

/** Each wrist and each forearm's middle in the world now. */
function forearmsOf(lab: Lab): THREE.Vector3[] {
  const sides = [[lab.joints.handL, lab.joints.elbowL], [lab.joints.handR, lab.joints.elbowR]];
  return sides.flatMap(([hand, elbow]) => {
    const wrist = hand.getWorldPosition(new THREE.Vector3());
    const middle = elbow.getWorldPosition(new THREE.Vector3()).lerp(wrist, 0.5);
    return [wrist, middle];
  });
}

/** Every rigid mesh of his model that isn't cloth, with the piece it belongs to. */
function partsOf(lab: Lab): Part[] {
  const joints = new Map<THREE.Object3D, string>(Object.entries(lab.joints)
    .filter(([, joint]) => (joint as THREE.Object3D)?.isObject3D)
    .map(([name, joint]) => [joint as THREE.Object3D, name]));
  const hands = [lab.joints.handL, lab.joints.handR];
  const parts: Part[] = [];
  lab.model.root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh || CLOTHS.includes(mesh.geometry.name)) return;
    const hung = hungFrom(mesh, joints);
    if (!hung) return;
    const { group, joint } = hung;
    const inHand = hands.some((hand) => joint === hand || isUnder(joint, hand));
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const corners = cornersOf(mesh.geometry.boundingBox!);
    parts.push({ mesh, group, name: nameOver(group, joints), joint, inHand, corners });
  });
  return parts;
}

/** The object over `mesh` hung straight from a joint (the mesh itself if it is), and that joint. */
function hungFrom(
  mesh: THREE.Object3D, joints: Map<THREE.Object3D, string>,
): { group: THREE.Object3D; joint: THREE.Object3D } | null {
  for (let at: THREE.Object3D = mesh; at.parent; at = at.parent) {
    if (joints.has(at.parent)) return { group: at, joint: at.parent };
  }
  return null;
}

/** Whether `object` hangs anywhere under `over`. */
function isUnder(object: THREE.Object3D, over: THREE.Object3D): boolean {
  for (let at = object.parent; at; at = at.parent) if (at === over) return true;
  return false;
}

/** A piece's name: its own, the first named object under it (a grip's weapon), or the joint it hangs from. */
function nameOver(piece: THREE.Object3D, joints: Map<THREE.Object3D, string>): string {
  if (piece.name) return piece.name;
  let under = '';
  piece.traverseVisible((object) => {
    under ||= object.name;
  });
  return under || `piece on the ${joints.get(piece.parent!) ?? 'body'}`;
}

/** A mesh's own name, its geometry's, or its kind. */
function meshName(mesh: THREE.Mesh): string {
  return mesh.name || mesh.geometry.name || mesh.geometry.type.replace('Geometry', '').toLowerCase() || 'mesh';
}

/** A box's opposite corners and one across them: enough to see it slide and turn. */
function cornersOf(box: THREE.Box3): THREE.Vector3[] {
  return [box.min.clone(), box.max.clone(), new THREE.Vector3(box.min.x, box.max.y, box.min.z)];
}

const _local = new THREE.Vector3(), _scale = new THREE.Vector3();

/** How far `palm` is from `mesh`'s box (m). */
function palmOn(mesh: THREE.Mesh, palm: THREE.Vector3): number {
  mesh.worldToLocal(_local.copy(palm));
  // (a piece never drawn yet has no box: the ranger's built behind the lobby since, on main)
  const geometry = mesh.geometry;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  return geometry.boundingBox!.distanceToPoint(_local) * mesh.getWorldScale(_scale).x;
}

/** The farthest any point of `a` is from its own in `b`. */
function farthest(a: THREE.Vector3[], b: THREE.Vector3[]): number {
  return Math.max(...a.map((point, i) => point.distanceTo(b[i])));
}

/** Whether `object` is worn on a strap (`userData.worn` on it or over it). */
function worn(object: THREE.Object3D): boolean {
  for (let at: THREE.Object3D | null = object; at; at = at.parent) if (at.userData.worn) return true;
  return false;
}

/** Whether `object` is drawn: it and everything over it shown. */
function shown(object: THREE.Object3D): boolean {
  for (let at: THREE.Object3D | null = object; at; at = at.parent) if (!at.visible) return false;
  return true;
}
