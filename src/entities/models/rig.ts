// Procedural humanoid rig: a hierarchy of joint Groups with primitive meshes,
// plus reusable procedural animation helpers. Forward is +Z, left is +X.
import * as THREE from 'three';
import { clampAnkle, clampAnkleRoll } from './anatomy';
import { groundHeight } from '../../world/ground';
import { wrappedFrom } from './palette';

export function part(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** Frees the geometry of everything under `root` (a model's dispose), but `keep` and what a build shares with the next
 *  one (`userData.shared`: a hero's head, a creature's sculpt). */
export function disposeGeometries(root: THREE.Object3D, keep?: THREE.BufferGeometry): void {
  root.traverse((o) => {
    const geo = (o as THREE.Mesh).geometry;
    // (a palette's wrap of `keep` holds its attributes: `palette.ts`)
    if (geo && wrappedFrom(geo) !== keep && !geo.userData.shared) geo.dispose();
  });
}

export function joint(parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, Math.max(0.001, len - r * 2), 4, 10);

export const DEFAULT_PROPORTIONS = {
  hipY: 0.95, hipW: 0.2,
  thighL: 0.46, shinL: 0.44, thighR: 0.085, shinR: 0.065,
  torsoL: 0.5, chestW: 0.2, chestD: 0.13, waistW: 0.15,
  shoulderW: 0.23, shoulderY: 0.36, upperL: 0.3, foreL: 0.27, upperR: 0.055, foreR: 0.045, handR: 0.05,
  neckL: 0.1, headR: 0.12,
};
export type Proportions = typeof DEFAULT_PROPORTIONS;

export type BodyPart = 'skin' | 'torso' | 'legs' | 'feet' | 'arms' | 'hands';

/** Named joints of a humanoid. L = +X (character's left), R = -X. */
export interface Joints {
  P: Proportions;
  root: THREE.Group; body: THREE.Group; hips: THREE.Group; spine: THREE.Group; chest: THREE.Group; chestMesh: THREE.Mesh;
  neck: THREE.Group; head: THREE.Group;
  thighL: THREE.Group; kneeL: THREE.Group; ankleL: THREE.Group;
  thighR: THREE.Group; kneeR: THREE.Group; ankleR: THREE.Group;
  shoulderL: THREE.Group; elbowL: THREE.Group; handL: THREE.Group;
  shoulderR: THREE.Group; elbowR: THREE.Group; handR: THREE.Group;
}

/**
 * Build a humanoid. `M` maps body parts to materials (missing entries fall back
 * to `skin`). `overrides` tweak the default proportions.
 */
export function buildHumanoid(M: Partial<Record<BodyPart, THREE.Material>> & { skin: THREE.Material }, overrides: Partial<Proportions> = {}): Joints {
  const P: Proportions = { ...DEFAULT_PROPORTIONS, ...overrides };
  const mat = (k: BodyPart) => M[k] ?? M.skin;
  const root = new THREE.Group();
  const body = joint(root);
  const hips = joint(body, 0, P.hipY, 0);
  part(new THREE.SphereGeometry(1, 16, 12).scale(P.hipW * 0.95, 0.12, P.chestD * 0.95), mat('legs'), hips, 0, 0.02, 0);

  const leg = (s: number) => {
    const thigh = joint(hips, s * P.hipW * 0.55, -0.02, 0);
    part(capsule(P.thighR, P.thighL), mat('legs'), thigh, 0, -P.thighL / 2, 0);
    const knee = joint(thigh, 0, -P.thighL, 0);
    part(capsule(P.shinR, P.shinL), mat('legs'), knee, 0, -P.shinL / 2, 0);
    const ankle = joint(knee, 0, -P.shinL, 0);
    part(new THREE.BoxGeometry(P.shinR * 1.9, P.shinR * 1.2, P.shinR * 4.2), mat('feet'), ankle, 0, -P.shinR * 0.5, P.shinR * 1.1);
    return { thigh, knee, ankle };
  };
  const legL = leg(1), legR = leg(-1);

  const spine = joint(hips, 0, 0.06, 0);
  part(new THREE.SphereGeometry(1, 16, 12).scale(P.waistW, P.torsoL * 0.35, P.chestD * 0.9), mat('torso'), spine, 0, P.torsoL * 0.2, 0);
  const chest = joint(spine, 0, P.torsoL * 0.45, 0);
  const chestMesh = part(new THREE.SphereGeometry(1, 20, 14).scale(P.chestW, P.torsoL * 0.42, P.chestD), mat('torso'), chest, 0, P.torsoL * 0.12, 0);
  const neck = joint(chest, 0, P.torsoL * 0.5, 0);
  part(capsule(P.headR * 0.42, P.neckL + 0.06), mat('skin'), neck, 0, P.neckL * 0.4, 0);
  const head = joint(neck, 0, P.neckL, 0);

  const arm = (s: number) => {
    const shoulder = joint(chest, s * P.shoulderW, P.torsoL * P.shoulderY, 0);
    // (where it sits with the shoulder girdle at rest: the girdle slides it, anatomy.ts `girdlePlace`)
    shoulder.userData.rest = shoulder.position.clone();
    part(new THREE.SphereGeometry(P.upperR * 1.35, 12, 10), mat('arms'), shoulder);
    part(capsule(P.upperR, P.upperL), mat('arms'), shoulder, 0, -P.upperL / 2, 0);
    const elbow = joint(shoulder, 0, -P.upperL, 0);
    part(capsule(P.foreR, P.foreL), mat('arms'), elbow, 0, -P.foreL / 2, 0);
    const hand = joint(elbow, 0, -P.foreL, 0);
    part(new THREE.SphereGeometry(P.handR, 10, 8).scale(0.9, 1.25, 0.65), mat('hands'), hand, 0, -P.handR * 0.9, 0);
    return { shoulder, elbow, hand };
  };
  const armL = arm(1), armR = arm(-1);

  return {
    P, root, body, hips, spine, chest, chestMesh, neck, head,
    thighL: legL.thigh, kneeL: legL.knee, ankleL: legL.ankle,
    thighR: legR.thigh, kneeR: legR.knee, ankleR: legR.ankle,
    shoulderL: armL.shoulder, elbowL: armL.elbow, handL: armL.hand,
    shoulderR: armR.shoulder, elbowR: armR.elbow, handR: armR.hand,
  };
}
// --- animation helpers -------------------------------------------------------

/** Reset all joint rotations so each frame builds its pose from scratch. */
export function resetPose(j: Joints): void {
  for (const k of ['body', 'hips', 'spine', 'chest', 'neck', 'head', 'thighL', 'thighR', 'kneeL', 'kneeR', 'ankleL', 'ankleR',
    'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'handL', 'handR'] as const) {
    if (j[k]) j[k].rotation.set(0, 0, 0);
  }
  j.body.position.set(0, 0, 0);
  for (const sh of [j.shoulderL, j.shoulderR]) if (sh.userData.rest) sh.position.copy(sh.userData.rest);
}

/**
 * Procedural walk/run cycle. `amt` 0..1 blends from standing to full stride.
 * `dir` is +1 forward / -1 backpedal.
 */
export interface WalkOpts { stride?: number; knee?: number; arm?: number; /** the left arm's swing where it differs from `arm` (a shield arm) */ armL?: number; bob?: number; dir?: number; /** a runner's body (see below), for a model whose full speed is a run */ run?: boolean;
  /** how far each arm pumps as a runner's does at a run (1, a free arm's; 0, held by what it carries, which the model
   *  poses itself), the right's and the left's */
  pump?: number; pumpL?: number;
  /** whether each pumping hand is free to flop on its wrist (1) or holds something steady (0), the left's and the
   *  right's */
  looseL?: number; looseR?: number;
  /** how much of a walk's bend of the elbow as the arm comes forward each arm keeps (1; a staff carried steady, less),
   *  the right's and the left's */
  elbowSwing?: number; elbowSwingL?: number }
const IK_ON = typeof location === 'undefined' || !/[?&]ik=0/.test(location.search);
/** What the walk cycle reads from a model's leg IK (`LegIK` in ik.ts): where the feet are in their strides and how
 *  far each thigh points forward. */
interface WalkingLegs { bodyPhase?(phase: number, side?: number): number; thighForward?(side: number): number }
/** A thigh pointing `forward` (rad) as the cycle's swing of it (its `sin`, the left's sign), for the arm on its side
 *  to swing against: the cycle swings a thigh `stride` either way, and an arm no further than it swings it (a carried
 *  bow's swing is tuned to that: further, its arrow swept into the coat's hem) */
const armSwing = (forward: number, stride: number): number => Math.max(-1, Math.min(1, forward / stride));
/** A runner's arm (Hinrichs 1987, and the lab's `form`): swung from the shoulder this far either way (rad) about a
 *  middle this far back, bent at the elbow near a right angle, more as it comes forward (the hand rising to the chest)
 *  and less as it goes back past the hip; and the thighs' swing apart at a run that swings it all the way (rad: by a
 *  walk's, the arms stood at their ends a quarter of the stride). Hanging nearly straight and swinging a walk's, a hero
 *  running at 6 m/s read as stiff-armed. */
const RUN_ARM = 0.62, RUN_ARM_BACK = 0.14, RUN_ELBOW = 1.5, RUN_ELBOW_SWING = 0.3, RUN_THIGHS = 0.68;
/** A loose arm whips: its forearm follows the upper arm this late (rad of the cycle), and a pumping arm's relaxed hand
 *  later still, flopping on its wrist this share of the forearm's swing (bent in step with the shoulder and the hand
 *  held still on the wrist, the arms pumped as a machine's) */
const RUN_FOREARM_LAG = 0.35, RUN_HAND_LAG = 0.8, RUN_HAND_LOOSE = 0.35;
/** a run's rise and fall a step, a share of the model's `bob` */
const RUN_BOB = 0.75;
/** Exported for the models posing a loaded arm at a run: how far it is through a runner's, from the walk cycle's
 *  `amt` (0 at a walk, 1 at a run). */
export const runShareOf = (amt: number): number => (IK_ON ? Math.min(1, Math.max(0, (amt - 0.45) / 0.35)) : 0);
/** What the walk cycle swung each arm by this frame: each forearm's turn back from the middle of its swing (rad, the
 *  shoulder's and the elbow's together), for a model holding what a hand carries steady against it. */
export interface ArmSwings { forearmL: number; forearmR: number }
export function walkCycle(j: Joints, cyclePhase: number, amt: number, o: WalkOpts = {}): ArmSwings {
  // (where the feet are in their strides, as the leg IK has them: the body swings with its legs, each arm and leg by
  // its own side's, not by the cycle's clock)
  const legs = IK_ON ? (j.root.userData.legs as WalkingLegs | undefined) : undefined;
  const phase = legs?.bodyPhase?.(cyclePhase) ?? cyclePhase;
  const phaseL = legs?.bodyPhase?.(cyclePhase, 0) ?? cyclePhase, phaseR = legs?.bodyPhase?.(cyclePhase, 1) ?? cyclePhase;
  const stride = o.stride ?? 0.55, knee = o.knee ?? 1.0, arm = o.arm ?? 0.45, armL = o.armL ?? arm, bob = o.bob ?? 0.06, dir = o.dir ?? 1;
  const s = Math.sin(phase) * dir, c = Math.cos(phase);
  const sL = Math.sin(phaseL) * dir, cL = Math.cos(phaseL), sR = Math.sin(phaseR) * dir, cR = Math.cos(phaseR);
  // (each arm against its own thigh as the legs were last placed, by the thighs' swing apart: crouched, both point
  // forward, and that held both arms back)
  const run = IK_ON && o.run ? runShareOf(amt) : 0;
  const thighL = legs?.thighForward?.(0), thighR = legs?.thighForward?.(1);
  const thighs = stride + (RUN_THIGHS - stride) * run;
  const apart = thighL === undefined || thighR === undefined ? undefined : armSwing((thighL - thighR) / 2, thighs);
  const armSL = apart ?? sL, armSR = apart ?? sR;
  j.thighL.rotation.x += -sL * stride * amt;
  j.thighR.rotation.x += sR * stride * amt;
  j.kneeL.rotation.x += (Math.max(0, cL * dir) * knee + 0.08) * amt;
  j.kneeR.rotation.x += (Math.max(0, -cR * dir) * knee + 0.08) * amt;
  j.ankleL.rotation.x += -j.thighL.rotation.x * 0.3 - j.kneeL.rotation.x * 0.4;
  j.ankleR.rotation.x += -j.thighR.rotation.x * 0.3 - j.kneeR.rotation.x * 0.4;
  // the arms: a walk's hang nearly straight and swing from the shoulder; a run's pump, bent near a right angle, as far
  // as what each carries lets it (a loaded arm the model poses itself). +x swings an arm back; armSL is the left's
  // share of its swing back, -armSR the right's
  const pumpL = (o.pumpL ?? o.pump ?? 1) * run, pumpR = (o.pump ?? 1) * run;
  // (what an arm doesn't pump of a runner's it swings as at a walk: a carried bow follows its arm's walking swing)
  const swingL = armL * (1 - pumpL) + RUN_ARM * pumpL, swingR = arm * (1 - pumpR) + RUN_ARM * pumpR;
  j.shoulderL.rotation.x += (armSL * swingL + RUN_ARM_BACK * pumpL) * amt;
  j.shoulderR.rotation.x += (-armSR * swingR + RUN_ARM_BACK * pumpR) * amt;
  // (and in a little towards the middle as it comes forward, out as it goes back)
  j.shoulderL.rotation.z += 0.08 * armSL * pumpL * amt;
  j.shoulderR.rotation.z += 0.08 * armSR * pumpR * amt;
  const bendL = o.elbowSwingL ?? o.elbowSwing ?? 1, bendR = o.elbowSwing ?? 1;
  const walkElbowL = 0.25 + Math.max(0, -armSL) * 0.4 * bendL, walkElbowR = 0.25 + Math.max(0, armSR) * 0.4 * bendR;
  // (the forearm a little late, by the cycle's own phase: the thighs' swing apart has none)
  const lateL = run ? Math.sin(phaseL - RUN_FOREARM_LAG) * dir : armSL;
  const lateR = run ? Math.sin(phaseR - RUN_FOREARM_LAG) * dir : armSR;
  const runElbowL = RUN_ELBOW - RUN_ELBOW_SWING * lateL, runElbowR = RUN_ELBOW + RUN_ELBOW_SWING * lateR;
  j.elbowL.rotation.x += -(walkElbowL + (runElbowL - walkElbowL) * pumpL) * amt;
  j.elbowR.rotation.x += -(walkElbowR + (runElbowR - walkElbowR) * pumpR) * amt;
  // (and a pumping arm's free hand flops on its wrist after it, back as the arm comes forward and forward as it goes
  // back; a loaded one's the model holds)
  const forearmSwing = (RUN_ARM + RUN_ELBOW_SWING) * RUN_HAND_LOOSE * amt;
  const flopL = (Math.sin(phaseL - RUN_HAND_LAG) - Math.sin(phaseL)) * dir;
  const flopR = (Math.sin(phaseR - RUN_HAND_LAG) - Math.sin(phaseR)) * dir;
  j.handL.rotation.x += flopL * forearmSwing * pumpL * (o.looseL ?? 1);
  j.handR.rotation.x += -flopR * forearmSwing * pumpR * (o.looseR ?? 1);
  // a walk is highest as the legs pass (the body vaulting over a straight leg); a run is lowest there (the leg
  // compressing under it) and highest in flight, smoothly at both (by |cos| its top came to a point in the air), and
  // further: a runner's hips rise and fall 6 cm a step (at half a walk's, 4)
  const walkBob = Math.abs(c) - 0.6, runBob = -0.5 * RUN_BOB * Math.cos(2 * phase);
  j.body.position.y += (walkBob + (runBob - walkBob) * run) * bob * amt;
  // the body's weight goes over the foot it stands on (the right at phase 0, the left at π, as `LegIK` times its steps), so the two legs read apart from behind and in front
  if (IK_ON) j.body.position.x += -c * 0.02 * run * amt;
  j.hips.rotation.y += s * 0.12 * amt;
  j.chest.rotation.y += -s * 0.16 * amt;
  j.hips.rotation.z += c * 0.04 * amt;
  return {
    forearmL: (armSL * swingL + RUN_ELBOW_SWING * lateL * pumpL) * amt,
    forearmR: (-armSR * swingR - RUN_ELBOW_SWING * lateR * pumpR) * amt,
  };
}

/** Breathing + subtle sway while standing. */
export function idle(j: Joints, t: number, amt = 1): void {
  const b = Math.sin(t * 1.8);
  j.chest.rotation.x += b * 0.025 * amt;
  j.neck.rotation.x += -b * 0.02 * amt;
  j.shoulderL.rotation.z += (0.08 + b * 0.02) * amt;
  j.shoulderR.rotation.z += -(0.08 + b * 0.02) * amt;
  j.elbowL.rotation.x += -0.15 * amt;
  j.elbowR.rotation.x += -0.15 * amt;
  j.body.position.y += b * 0.006 * amt;
}

/** Death fall; k: 0..1 */
export function deathFall(j: Joints, k: number, dirSign = -1): void {
  const e = 1 - (1 - Math.min(1, k * 1.6)) ** 3;
  j.body.rotation.x = dirSign * e * 1.45;
  j.body.position.y -= e * 0.1;
  j.kneeL.rotation.x += e * 0.6; j.kneeR.rotation.x += e * 0.3;
  j.shoulderL.rotation.z += e * 0.9; j.shoulderR.rotation.z -= e * 0.9;
}

/** Bell curve 0 → 1 → 0 over t in [a, b]. */
export const pulse = (t: number, a: number, b: number): number => (t <= a || t >= b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI));
/** Ramp 0 → 1 between a and b. */
export const ramp = (t: number, a: number, b: number): number => Math.min(1, Math.max(0, (t - a) / (b - a)));

const _t = new THREE.Vector3(), _h = new THREE.Vector3(), _e = new THREE.Vector3(), _p = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const X_AXIS = new THREE.Vector3(1, 0, 0), DOWN = new THREE.Vector3(0, -1, 0);

/** A reach of `d` toward an arm of `length` eased into its end over the last `soft` share of it: unchanged short of
 *  that, then nearing the full length without reaching it. */
function softReach(d: number, length: number, soft: number): number {
  const ease = soft * length, from = length - ease;
  return ease <= 0 || d <= from ? d : from + ease * (1 - Math.exp(-(d - from) / ease));
}

/**
 * Two-bone IK: pose an arm so its hand reaches `target` (in the shoulder's parent space, e.g. the
 * chest), with the elbow bending forward (the rig's elbows hinge on X) and turned towards `pole`.
 * Overwrites the shoulder and elbow rotations. Out of reach, the arm points straight at the target.
 * `hinge` -1 bends the other way: a leg, whose knee folds the shin backwards (+x) with the pole in front.
 * `soft` (a share of the arm's length) eases the reach into its end over that last share, the hand falling short of
 * the target by at most 0.37 of it: held to the end, the elbow swings out fastest as the arm leaves it (the last 3 cm
 * of a reach swing it 10), and a shoulder brought a centimetre nearer a grip held still in the view jumped the elbow
 * 7 cm in a frame (Bull Rush stopped by the wall, #294).
 */
export function reachArm(shoulder: THREE.Object3D, elbow: THREE.Object3D, upper: number, fore: number, target: THREE.Vector3, pole: THREE.Vector3, hinge = 1, soft = 0): void {
  _t.copy(target).sub(shoulder.position);
  const d = Math.min(Math.max(softReach(_t.length(), upper + fore, soft), 0.02), upper + fore - 1e-4);
  const cosE = (upper * upper + fore * fore - d * d) / (2 * upper * fore);
  const bend = Math.PI - Math.acos(Math.min(1, Math.max(-1, cosE)));
  elbow.rotation.set(-bend * hinge, 0, 0);
  // where the hand is with the shoulder unrotated, then turn that onto the target
  _h.set(0, -fore, 0).applyAxisAngle(X_AXIS, -bend * hinge).add(_e.set(0, -upper, 0)).normalize();
  _t.normalize();
  _q.setFromUnitVectors(_h, _t);
  // twist about the reach so the elbow points at the pole
  _e.copy(DOWN).multiplyScalar(upper).applyQuaternion(_q).projectOnPlane(_t);
  _p.copy(pole).projectOnPlane(_t);
  if (_e.lengthSq() > 1e-8 && _p.lengthSq() > 1e-8) {
    const ang = _e.angleTo(_p) * Math.sign(_t.dot(_h.crossVectors(_e, _p)));
    _q.premultiply(_q2.setFromAxisAngle(_t, ang));
  }
  shoulder.quaternion.copy(_q);
}

const _a = new THREE.Vector3(), _hip = new THREE.Vector3(), _k = new THREE.Quaternion(), _r = new THREE.Quaternion();
const _q0 = new THREE.Quaternion(), _fw = new THREE.Quaternion(), _toe = new THREE.Vector3();
const _level = new THREE.Quaternion(), _ahead = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
/** how far forward of the ankle the toes are (the rig's units) */
const TOE = 0.15;

/**
 * Leg IK against the ground (`groundHeight` under each foot): an ankle posed below `footH` (the foot would sink
 * into the floor, as when the body crouches for a slam or a block) is lifted back to it by bending the
 * hip and knee, the foot staying where it was over the ground; and a foot at or near the floor turns
 * flat on it. Runs after the pose, before anything reads the joints' world matrices. Not while dying.
 */
/** Turns `ankle` (by `share`, 0 to 1) so its foot lies level in the world, heading the way it points now, rolled no
 *  further than the ankle rolls (under a shin leaning out past that, it lies on its edge: laid flat, a running
 *  reversal's landing read 57 degrees at the ankle). */
function layFlat(knee: THREE.Object3D, ankle: THREE.Object3D, share: number, left: boolean): void {
  ankle.getWorldQuaternion(_k);
  _ahead.set(0, 0, 1).applyQuaternion(_k);
  _level.setFromAxisAngle(_up, Math.atan2(_ahead.x, _ahead.z));
  knee.getWorldQuaternion(_r);
  _level.premultiply(_r.invert());
  ankle.quaternion.slerp(_level, share);
  clampAnkleRoll(ankle.quaternion, left);
}

/** The world matrices of `root` and what's under it, its leaf meshes left out: what a pose reads between its steps is its
 *  joints, and a hero's meshes (most of what's under him) are made again as the scene is drawn, or as he ends his pose.
 *  Each whole walk took about 0.25 ms of a frame, up to 8 a frame as a ranger shoots. */
export function updateJoints(root: THREE.Object3D): void {
  if (root.matrixAutoUpdate) root.updateMatrix();
  if (root.parent) root.matrixWorld.multiplyMatrices(root.parent.matrixWorld, root.matrix);
  else root.matrixWorld.copy(root.matrix);
  root.matrixWorldNeedsUpdate = false;
  const kids = root.children;
  for (let i = 0; i < kids.length; i++) {
    const kid = kids[i];
    if (kid.children.length || !(kid as THREE.Mesh).isMesh) updateJoints(kid);
  }
}

export function groundFeet(j: Joints, footH: number): void {
  const root = j.root;
  root.updateMatrixWorld(true);
  for (const [thigh, knee, ankle] of [[j.thighL, j.kneeL, j.ankleL], [j.thighR, j.kneeR, j.ankleR]] as const) {
    // the floor under the foot, in the root's frame (the dais's step stands above the floor round it: measured from the
    // root, a foot planted on it was in the air, neither laid flat nor kept within the ankle's range)
    ankle.getWorldPosition(_a);
    const floor = root.worldToLocal(_a.set(_a.x, groundHeight(_a.x, _a.z), _a.z)).y;
    ankle.getWorldPosition(_a); root.worldToLocal(_a);
    const sink = floor + footH - _a.y;
    if (sink > 0) {
      // the target in the hip's parent (hips) space: the same spot, raised to the floor
      _a.y = floor + footH;
      root.localToWorld(_a); thigh.parent!.worldToLocal(_a);
      _hip.copy(thigh.position);
      const L1 = j.P.thighL, L2 = j.P.shinL;
      const dy = _a.y - _hip.y, dz = _a.z - _hip.z, d = Math.min(Math.hypot(dy, dz), L1 + L2 - 1e-4);
      // knee bend from the triangle, then the thigh pitched so the ankle lands on the target (the knee
      // forward); the thigh's own roll and yaw stay as posed
      const bend = Math.PI - Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2))));
      const toT = Math.atan2(dz, -dy), inner = Math.asin(Math.min(1, L2 * Math.sin(bend) / Math.max(d, 1e-4)));
      thigh.rotation.x = -(toT + inner);
      knee.rotation.x = bend;
      root.updateMatrixWorld(true);
    }
    // a foot within a few cm of the floor lies flat on it, turned the way it points (levelled by cancelling the knee's
    // pitch alone, a foot turned against its shin kept part of the shin's roll as a pitch: toe down 3 to 4 degrees, the
    // end of a boot 1 to 1.5 cm into the floor, and up to 3.3 cm in the side-on stance's spread)
    ankle.getWorldPosition(_a); root.worldToLocal(_a);
    const planted = 1 - Math.min(1, Math.max(0, (_a.y - floor - footH) / 0.05));
    if (planted > 0) layFlat(knee, ankle, planted, thigh === j.thighL);
    // (within the ankle's range: where the shin leans further over a foot on the floor than an ankle bends, the heel
    // lifts and the foot pivots on its toes, which stay where they lay, the leg reaching to the ankle raised round
    // them; laid flat under a deep knee the ankle bent 70 degrees)
    _toe.set(0, -footH, TOE).applyQuaternion(ankle.quaternion).add(ankle.position);
    knee.localToWorld(_toe); root.worldToLocal(_toe);
    if (_toe.y < floor + 0.03) {
      const left = thigh === j.thighL;
      _q0.copy(ankle.quaternion);
      if (clampAnkle(ankle.quaternion, left, true, true)) {
        knee.getWorldQuaternion(_k); _fw.copy(_k).multiply(ankle.quaternion);
        _toe.set(0, -footH, TOE);
        _a.copy(_toe).applyQuaternion(_q0).sub(_hip.copy(_toe).applyQuaternion(ankle.quaternion)).add(ankle.position);
        knee.localToWorld(_a); thigh.parent!.worldToLocal(_a);
        knee.getWorldPosition(_hip); thigh.parent!.worldToLocal(_hip).sub(thigh.position);
        reachArm(thigh, knee, j.P.thighL, j.P.shinL, _a, _hip, -1);
        thigh.updateWorldMatrix(false, true);
        ankle.quaternion.copy(knee.getWorldQuaternion(_k).invert().multiply(_fw));
        clampAnkle(ankle.quaternion, left, true, true);
      }
    }
  }
}
