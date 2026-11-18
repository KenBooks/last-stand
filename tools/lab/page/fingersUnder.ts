// tools/lab the hero's fingers against the floor (`sit`): each finger's and thumb's joints and its tip, as balls of
// the digit's own radius, against the ground under them, frame by frame. The hands are skinned, which the floor's
// check of the pieces he wears and holds never reads: laying the ranger's bow down by a fire, his open fingers hung a
// finger's length below the bow lying on the floor, through it, and no measure said so (from review).
import * as THREE from 'three';
import type { Lab } from './lab';
import type { Digit, Hand } from '../../../src/entities/models/hands';
import { groundHeight } from '../../../src/world/ground';

/** into the floor by this much a finger counts (m): a pad pressed onto it sinks a little */
export const FINGERS_UNDER_FROM = 0.01;
/** how far under the floor the canary puts the left hand (m) */
const CANARY_UNDER = 0.1;

/** A frame's deepest finger in the floor: how deep (m), whose, and the frame. */
interface Under {
  depth: number;
  finger: string;
  at: string;
}

const _point = new THREE.Vector3();
const _scale = new THREE.Vector3();
const FINGER_NAMES = ['index', 'middle', 'ring', 'little'];

/** The frames a finger was in the floor through a scenario, and the deepest. */
export class FingersUnder {
  private frames = 0;
  private deepest: Under | null = null;
  /** the nearest a finger came to the floor, in it or not */
  private nearest: Under | null = null;

  /** Notes how far into the floor the fingers are this frame (`frame`: the frame as the report names it). */
  observe(lab: Lab, frame: string): void {
    const under = deepestUnder(lab, frame);
    if (under && (!this.nearest || under.depth > this.nearest.depth)) this.nearest = under;
    if (!under || under.depth < FINGERS_UNDER_FROM) return;
    this.frames++;
    if (!this.deepest || under.depth > this.deepest.depth) this.deepest = under;
  }

  /** The nearest a finger came to the floor as words (how far over it, or into it), or none if he has no hands. */
  describeNearest(): string {
    const nearest = this.nearest;
    if (!nearest) return '';
    const over = (-nearest.depth * 100).toFixed(1);
    return `his fingers ${over} cm over the floor at their lowest (his ${nearest.finger}, ${nearest.at})`;
  }

  /** The frames in the floor as words, or none if no finger ever was. */
  describe(): string {
    const deepest = this.deepest;
    if (!deepest) return '';
    const depth = (deepest.depth * 100).toFixed(1);
    return `his ${deepest.finger} into the floor on ${this.frames} frames, the deepest ${depth} cm (${deepest.at})`;
  }
}

/** The canary: the left hand put `CANARY_UNDER` under the floor for one reading, and back. Returns how deep it read
 *  (m). */
export function fingersCanary(lab: Lab): number {
  const hand = lab.joints.handL;
  const was = hand.position.clone();
  const parent = hand.parent!;
  parent.updateWorldMatrix(true, false);
  hand.getWorldPosition(_point).y = groundHeight(_point.x, _point.z) - CANARY_UNDER;
  hand.position.copy(parent.worldToLocal(_point));
  const depth = deepestUnder(lab, 'canary')?.depth ?? 0;
  hand.position.copy(was);
  hand.updateWorldMatrix(true, true);
  return depth;
}

/** The finger deepest in the floor this frame, none if the model has no hands. */
function deepestUnder(lab: Lab, at: string): Under | null {
  const hands = lab.model.hands;
  if (!hands) return null;
  lab.model.root.updateMatrixWorld(true);
  let deepest: Under | null = null;
  for (const [side, hand] of [['left', hands.L], ['right', hands.R]] as const) {
    for (const [name, digit] of digitsOf(hand)) {
      const depth = digitDepth(digit);
      if (deepest && depth <= deepest.depth) continue;
      deepest = { depth, finger: `${side} ${name}`, at };
    }
  }
  return deepest;
}

/** A hand's fingers and thumb, each with its name. */
function digitsOf(hand: Hand): [string, Digit][] {
  const fingers = hand.f.map((digit, i): [string, Digit] => [`${FINGER_NAMES[i] ?? `finger ${i}`} finger`, digit]);
  return [...fingers, ['thumb', hand.thumb]];
}

/** How deep a digit's lowest ball (each joint and its tip, at its radius) is under the ground (m; less than 0 above). */
function digitDepth(digit: Digit): number {
  const joints = digit.j.map((joint) => ballDepth(joint, _tipAt.set(0, 0, 0), digit.r));
  const last = digit.j[digit.j.length - 1];
  const tip = ballDepth(last, _tipAt.set(0, -digit.len[digit.len.length - 1], 0), digit.r);
  return Math.max(tip, ...joints);
}

const _tipAt = new THREE.Vector3();

/** How deep a ball of `radius` (the joint's own units) at `local` on `joint` is under the ground (m). */
function ballDepth(joint: THREE.Object3D, local: THREE.Vector3, radius: number): number {
  joint.localToWorld(_point.copy(local));
  const lowest = _point.y - radius * joint.getWorldScale(_scale).x;
  return groundHeight(_point.x, _point.z) - lowest;
}
