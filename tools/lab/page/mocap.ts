// tools/lab mocap: a hero posed as a motion-capture clip (BVH) has its person at a moment, to pose a move from a real
// body rather than by guess (`lab live mocap`). The clips are CMU's (mocap.cs.cmu.edu, "free for use in research and
// commercial projects"), as Bruce Hahne's BVH conversion gives them: kept out of the repo, read from where they lie.
// Each of the hero's joints is turned as its bone turned from its clip's rest, the rest's limbs first laid along the
// clip's (its legs splayed, its arms out as a T), and his hips set at the clip's height above its floor, by the ratio
// of his legs to its own. From the owner, of a pick-up posed by hand for days: "did you try digging? maybe others have
// already implemented it".

import * as THREE from 'three';
import { BVHLoader } from 'three/examples/jsm/loaders/BVHLoader.js';
import { resetPose, type Joints } from '../../../src/entities/models/rig';
import type { Lab, Tile } from './lab';
import { picture, type LivePicture } from './live';

/** One of the hero's joints as a clip's bone poses it: the bone, and the bone its length runs to in the clip's rest. */
interface Mapped {
  joint: keyof Joints;
  bone: string;
  /** the bone the joint's length runs to (the way it points at rest), or none for the hips, turned whole */
  toward?: string;
  /** the way the joint's own length runs at rest in its frame (down a limb, up the trunk, ahead along a foot) */
  rest: THREE.Vector3;
}

const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);
/** a foot from the ankle to its toes in the rig (`buildHumanoid`'s foot: forward and a little down) */
const ALONG_FOOT = new THREE.Vector3(0, -0.45, 1).normalize();

/** The hero's joints, parents first, as CMU's skeleton (in its BVH conversion's names) has them. */
const MAP: Mapped[] = [
  { joint: 'hips', bone: 'Hips', rest: UP },
  { joint: 'spine', bone: 'LowerBack', toward: 'Spine', rest: UP },
  { joint: 'chest', bone: 'Spine1', toward: 'Neck1', rest: UP },
  { joint: 'neck', bone: 'Neck1', toward: 'Head', rest: UP },
  { joint: 'head', bone: 'Head', toward: 'Head', rest: UP },
  ...limb('L', 'Left'),
  ...limb('R', 'Right'),
];

/** A side's leg and arm, as the hero's joints and the clip's bones name them. */
function limb(ours: 'L' | 'R', theirs: 'Left' | 'Right'): Mapped[] {
  return [
    { joint: `thigh${ours}`, bone: `${theirs}UpLeg`, toward: `${theirs}Leg`, rest: DOWN },
    { joint: `knee${ours}`, bone: `${theirs}Leg`, toward: `${theirs}Foot`, rest: DOWN },
    { joint: `ankle${ours}`, bone: `${theirs}Foot`, toward: `${theirs}ToeBase`, rest: ALONG_FOOT },
    { joint: `shoulder${ours}`, bone: `${theirs}Arm`, toward: `${theirs}ForeArm`, rest: DOWN },
    { joint: `elbow${ours}`, bone: `${theirs}ForeArm`, toward: `${theirs}Hand`, rest: DOWN },
    { joint: `hand${ours}`, bone: `${theirs}Hand`, toward: `${theirs}HandIndex1`, rest: DOWN },
  ] as Mapped[];
}

/** A clip read and made ready to sample: its bones under a holder, its mixer, its floor and its legs' length. */
export interface Clip {
  name: string;
  seconds: number;
  frames: number;
  holder: THREE.Group;
  mixer: THREE.AnimationMixer;
  bones: Map<string, THREE.Bone>;
  /** each mapped joint's turn that lays the rig's rest along the clip's (its world rest) */
  laid: Map<keyof Joints, THREE.Quaternion>;
  /** the clip's floor (its lowest toe over the clip) and its leg's length, in its own units */
  floor: number;
  leg: number;
  /** its hips' height over its toes standing at rest, in its own units */
  standing: number;
}

/** Clips read so far, by name: read once each. */
const clips = new Map<string, Clip>();

/** `text` read as a BVH clip named `name`, or the one read before by that name. */
export function clipOf(name: string, text?: string): Clip {
  const known = clips.get(name);
  if (known && !text) return known;
  if (!text) throw new Error(`mocap: no clip ${name} read yet`);
  const clip = readClip(name, text);
  clips.set(name, clip);
  return clip;
}

function readClip(name: string, text: string): Clip {
  const { skeleton, clip } = new BVHLoader().parse(text);
  const holder = new THREE.Group();
  holder.add(skeleton.bones[0]);
  const bones = new Map(skeleton.bones.map((bone) => [bone.name, bone]));
  holder.updateMatrixWorld(true);
  const laid = new Map<keyof Joints, THREE.Quaternion>();
  for (const mapped of MAP) laid.set(mapped.joint, layRest(mapped, bones));
  const standing = heightOf(bones, 'Hips') - heightOf(bones, 'LeftToeBase');
  const mixer = new THREE.AnimationMixer(holder);
  mixer.clipAction(clip).play();
  const frames = clip.tracks[0]?.times.length ?? 0;
  const leg = legOf(bones);
  const read: Clip = { name, seconds: clip.duration, frames, holder, mixer, bones, laid, floor: 0, leg, standing };
  read.floor = floorOf(read);
  return read;
}

/** The turn laying a joint's rest along its bone's in the clip's rest (all its bones unturned): the hips none. */
function layRest(mapped: Mapped, bones: Map<string, THREE.Bone>): THREE.Quaternion {
  if (!mapped.toward) return new THREE.Quaternion();
  const from = bones.get(mapped.bone);
  const to = mapped.toward === mapped.bone ? endOf(from) : bones.get(mapped.toward);
  if (!from || !to) throw new Error(`mocap: the clip has no ${mapped.bone} or ${mapped.toward}`);
  const way = to.getWorldPosition(new THREE.Vector3()).sub(from.getWorldPosition(new THREE.Vector3()));
  if (way.lengthSq() < 1e-12) return new THREE.Quaternion();
  return new THREE.Quaternion().setFromUnitVectors(mapped.rest, way.normalize());
}

/** A bone's first child (its end site, a head's top), to point it at. */
function endOf(bone: THREE.Bone | undefined): THREE.Bone | undefined {
  return bone?.children.find((child): child is THREE.Bone => (child as THREE.Bone).isBone);
}

/** A bone's height in the clip's world as it stands now. */
function heightOf(bones: Map<string, THREE.Bone>, name: string): number {
  return bones.get(name)!.getWorldPosition(new THREE.Vector3()).y;
}

/** The clip's leg from hip to ankle at rest, in its own units. */
function legOf(bones: Map<string, THREE.Bone>): number {
  const thigh = bones.get('LeftLeg')!.position.length();
  const shin = bones.get('LeftFoot')!.position.length();
  return thigh + shin;
}

/** The clip's floor: its lowest toe over the whole clip, sampled every tenth of a second. */
function floorOf(clip: Clip): number {
  let lowest = Infinity;
  const toe = new THREE.Vector3();
  for (let at = 0; at <= clip.seconds; at += 0.1) {
    sampleAt(clip, at);
    for (const name of ['LeftToeBase', 'RightToeBase']) {
      lowest = Math.min(lowest, clip.bones.get(name)!.getWorldPosition(toe).y);
    }
  }
  return lowest;
}

/** The clip's bones as they are at `seconds` into it. */
function sampleAt(clip: Clip, seconds: number): void {
  clip.mixer.setTime(Math.min(Math.max(0, seconds), clip.seconds));
  clip.holder.updateMatrixWorld(true);
}

const _facing = new THREE.Vector3();
const _turn = new THREE.Quaternion();
const _bone = new THREE.Quaternion();
const _parent = new THREE.Quaternion();
const _hips = new THREE.Vector3();

/** The turn from the clip's world to the hero's: its person's facing at this moment onto the hero's root. */
function clipToHero(clip: Clip, root: THREE.Object3D, out: THREE.Quaternion): THREE.Quaternion {
  const hips = clip.bones.get('Hips')!;
  hips.getWorldQuaternion(_bone);
  _facing.set(0, 0, 1).applyQuaternion(_bone).setY(0).normalize();
  const yaw = Math.atan2(_facing.x, _facing.z);
  root.getWorldQuaternion(out);
  return out.multiply(_turn.setFromAxisAngle(UP, -yaw));
}

/** The hero posed as `clip` has its person at `seconds`, standing where he stands, facing as he faces. */
export function poseAt(lab: Lab, clip: Clip, seconds: number): void {
  sampleAt(clip, seconds);
  const joints = lab.joints;
  resetPose(joints);
  const toHero = clipToHero(clip, joints.root, new THREE.Quaternion());
  for (const mapped of MAP) {
    const joint = joints[mapped.joint] as THREE.Object3D;
    clip.bones.get(mapped.bone)!.getWorldQuaternion(_bone);
    const world = toHero.clone().multiply(_bone).multiply(clip.laid.get(mapped.joint)!);
    joint.parent!.updateWorldMatrix(true, false);
    joint.parent!.getWorldQuaternion(_parent);
    joint.quaternion.copy(_parent.invert().multiply(world));
    joint.updateWorldMatrix(false, false);
  }
  // (his hips as high over the floor as its person's, by the ratio of his legs to its)
  const scale = (joints.P.thighL + joints.P.shinL) / clip.leg;
  clip.bones.get('Hips')!.getWorldPosition(_hips);
  joints.body.position.set(0, (_hips.y - clip.floor) * scale - joints.P.hipY, 0);
  joints.root.updateMatrixWorld(true);
}

/** What the pick-up's keys take from a body (`PICK` in `models/warrior.ts`), read off the clip at a moment in the
 *  hero's metres and its person's frame: the hips' drop from standing and how far back of the ankles they are, the
 *  trunk's lean forward from upright (hips to neck) and the head's (neck to head's top), each hand's height over the
 *  floor and how far ahead of the ankles. */
export interface BodyRead {
  drop: number;
  back: number;
  lean: number;
  head: number;
  hands: { height: number; ahead: number }[];
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _ankles = new THREE.Vector3();

/** The body as the clip has it now (sampled), as the pick-up's keys take it; `scale` the hero's metres a unit. */
function bodyRead(clip: Clip, scale: number): BodyRead {
  const at = (name: string, out: THREE.Vector3) => clip.bones.get(name)!.getWorldPosition(out);
  clip.bones.get('Hips')!.getWorldQuaternion(_bone);
  const ahead = _facing.set(0, 0, 1).applyQuaternion(_bone).setY(0).normalize().clone();
  at('LeftFoot', _ankles).add(at('RightFoot', _a)).multiplyScalar(0.5);
  const hips = at('Hips', new THREE.Vector3());
  const leanOf = (from: string, to: string) => {
    const way = at(to, _b).sub(at(from, _a));
    return Math.atan2(way.dot(ahead), way.y);
  };
  const hand = (name: string) => {
    const place = at(name, _a);
    return { height: (place.y - clip.floor) * scale, ahead: place.clone().sub(_ankles).dot(ahead) * scale };
  };
  return {
    drop: (clip.standing - (hips.y - clip.floor)) * scale,
    back: -hips.clone().sub(_ankles).dot(ahead) * scale,
    lean: leanOf('Hips', 'Neck1'),
    head: leanOf('Neck1', 'Head') - leanOf('Hips', 'Neck1'),
    hands: [hand('RightHand'), hand('LeftHand')],
  };
}

/** A body read as a note: metres to the centimetre, angles in radians as the keys take them. */
function describeBody(body: BodyRead): string {
  const cm = (metres: number) => (metres * 100).toFixed(0);
  const [right, left] = body.hands.map((hand) => `${cm(hand.height)} up ${cm(hand.ahead)} ahead`);
  return `drop ${body.drop.toFixed(2)} back ${body.back.toFixed(2)} lean ${body.lean.toFixed(2)} `
    + `head ${body.head.toFixed(2)}; hands (cm) R ${right}, L ${left}`;
}

/** A clip's length, as words. */
function describeClip(clip: Clip): string {
  return `${clip.name}: ${clip.seconds.toFixed(2)} s, ${clip.frames} frames`;
}

/** `lab live mocap`'s command: the clip (its text, the first time it's named) and the moments to picture. */
export interface LiveMocap {
  name: string;
  text?: string;
  times: number[];
  picture: LivePicture;
}

/** A moment of a clip, pictured: a row of a sheet. */
export interface MocapMoment {
  label: string;
  tiles: Tile[];
  notes: string[];
}

/** `lab live mocap`: the hero posed as the clip has its person at each of `times`, pictured at each; left posed at the
 *  last, for `live picture` to picture again in any look. */
export async function mocap(lab: Lab, command: LiveMocap): Promise<{ text: string; moments: MocapMoment[] }> {
  const clip = clipOf(command.name, command.text);
  const outside = command.times.filter((at) => at < 0 || at > clip.seconds);
  if (outside.length) throw new Error(`live mocap: ${outside.join(', ')} s is outside ${describeClip(clip)}`);
  const moments: MocapMoment[] = [];
  const lines = [describeClip(clip)];
  const scale = (lab.joints.P.thighL + lab.joints.P.shinL) / clip.leg;
  for (const at of command.times) {
    poseAt(lab, clip, at);
    const body = describeBody(bodyRead(clip, scale));
    lines.push(`${at.toFixed(2)} s: ${body}`);
    const tiles = command.picture.views?.length === 0 ? [] : (await picture(lab, command.picture)).tiles;
    moments.push({ label: `${clip.name} at ${at.toFixed(2)} s`, tiles, notes: [body] });
  }
  return { text: lines.join('\n'), moments };
}
