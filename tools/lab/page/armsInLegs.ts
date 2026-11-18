// The arms against the legs (tools/lab `range`): how far each forearm and hand pass into a thigh or a shin, each a
// capsule round its bone at its drawn radius, as `weaponBody.ts` reads the weapon against them. `armsIn.ts` reads the
// arms against the trunk and head alone, so a pose that put the hands down by the thighs went by: two-handed Power
// Strike's end, crouched with both fists at his right hip (from play: "power strike ending pose makes hand go through
// body, its a regression, pls figure out how it went past our guards"). The canary reads a hand put at the left
// thigh's middle, which must read deep in it.
import * as THREE from 'three';
import type { Joints } from '../../../src/entities/models/rig';
import { capsuleDepth } from './bodyDepth';

/** into a leg by this much an arm counts (m): cloth and armour stand a little off the bones' capsules */
export const LEG_INTO_FROM = 0.01;
/** the canary's hand at the thigh's middle must read at least this deep (m) */
const CANARY_DEEP = 0.05;
/** the points read along a forearm, from the elbow to the wrist, and along a hand from the wrist */
const FOREARM_POINTS = 5;
const HAND_POINTS = 3;
/** a hand read as a capsule this thick (of the rig's hand radius: it is flat across the palm) */
const HAND_THICK = 0.65;

/** An arm's deepest part in a leg on a frame: its side, its part (forearm or hand), the leg's part, how deep (m). */
export interface ArmInLeg {
  side: 'L' | 'R';
  limb: 'forearm' | 'hand';
  leg: string;
  depth: number;
}

/** A leg's part: its name and its capsule, in the world. */
export interface LegPart {
  name: string;
  from: THREE.Vector3;
  to: THREE.Vector3;
  radius: number;
}

/** An arm's part to read: its name, the points along it in the world and its radius there (m). */
interface ArmPart {
  side: 'L' | 'R';
  limb: 'forearm' | 'hand';
  points: THREE.Vector3[];
  radius: number;
}

/** Each arm's deepest part in a leg now, past `LEG_INTO_FROM` (none for an arm clear of them). */
export function armsInLegs(joints: Joints): ArmInLeg[] {
  joints.root.updateMatrixWorld(true);
  const legs = legsOf(joints);
  const deepest = new Map<'L' | 'R', ArmInLeg>();
  for (const arm of armPartsOf(joints)) {
    const found = deepestIn(arm, legs);
    if (!found || found.depth < LEG_INTO_FROM) continue;
    const was = deepest.get(arm.side);
    if (!was || found.depth > was.depth) deepest.set(arm.side, found);
  }
  return [...deepest.values()];
}

/** The canary: a hand put at the left thigh's middle, read against the legs. As words, `caught ...` or `missed ...`. */
export function armsInLegsCanary(joints: Joints): string {
  joints.root.updateMatrixWorld(true);
  const legs = legsOf(joints);
  const thigh = legs.find((leg) => leg.name === 'left thigh')!;
  const middle = thigh.from.clone().lerp(thigh.to, 0.5);
  const hand: ArmPart = { side: 'L', limb: 'hand', points: [middle], radius: radiusOfHand(joints) };
  const depth = deepestIn(hand, legs)?.depth ?? 0;
  const read = `a hand at the left thigh's middle read ${(depth * 100).toFixed(1)} cm into it`;
  return `${depth >= CANARY_DEEP ? 'caught' : 'missed'}: ${read}`;
}

/** The arm part's deepest point in any leg, and which. */
function deepestIn(arm: ArmPart, legs: LegPart[]): ArmInLeg | null {
  let best: ArmInLeg | null = null;
  for (const point of arm.points) {
    for (const leg of legs) {
      const depth = capsuleDepth(point, leg.from, leg.to, leg.radius) + arm.radius;
      if (!best || depth > best.depth) best = { side: arm.side, limb: arm.limb, leg: leg.name, depth };
    }
  }
  return best;
}

/** The thighs and shins as capsules round their bones, at their drawn radii, in the world. */
export function legsOf(j: Joints): LegPart[] {
  const scale = j.root.scale.x;
  const legs: LegPart[] = [];
  for (const side of ['L', 'R'] as const) {
    const left = side === 'L' ? 'left' : 'right';
    const hip = j[`thigh${side}`].getWorldPosition(new THREE.Vector3());
    const knee = j[`knee${side}`].getWorldPosition(new THREE.Vector3());
    const ankle = j[`ankle${side}`].getWorldPosition(new THREE.Vector3());
    legs.push({ name: `${left} thigh`, from: hip, to: knee, radius: j.P.thighR * scale });
    legs.push({ name: `${left} shin`, from: knee, to: ankle, radius: j.P.shinR * scale });
  }
  return legs;
}

/** Each arm's forearm (elbow to wrist) and hand (from the wrist along its own length), as points and a radius. */
function armPartsOf(j: Joints): ArmPart[] {
  const scale = j.root.scale.x;
  const parts: ArmPart[] = [];
  for (const side of ['L', 'R'] as const) {
    const elbow = j[`elbow${side}`].getWorldPosition(new THREE.Vector3());
    const hand = j[`hand${side}`];
    const wrist = hand.getWorldPosition(new THREE.Vector3());
    const forearm = pointsAlong(elbow, wrist, FOREARM_POINTS);
    parts.push({ side, limb: 'forearm', points: forearm, radius: j.P.foreR * scale });
    const palm = hand.localToWorld(new THREE.Vector3(0, -j.P.handR * 1.8, 0));
    parts.push({ side, limb: 'hand', points: pointsAlong(wrist, palm, HAND_POINTS), radius: radiusOfHand(j) });
  }
  return parts;
}

/** A hand's radius as read (m). */
const radiusOfHand = (j: Joints) => j.P.handR * HAND_THICK * j.root.scale.x;

/** `count` points from `from` to `to`, both ends in. */
function pointsAlong(from: THREE.Vector3, to: THREE.Vector3, count: number): THREE.Vector3[] {
  return Array.from({ length: count }, (_, i) => from.clone().lerp(to, i / (count - 1)));
}
