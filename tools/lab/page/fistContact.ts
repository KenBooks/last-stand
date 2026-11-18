// Contact readings for the warrior's closed fist, from the posed skin and the guard's forearm.
import * as THREE from 'three';
import type { Digit, Hand } from '../../../src/entities/models/hands';

// Contact limits in metres and degrees. Distances include the hand's scale on the hero.
// `sunk`: how far a finger may sink into the one beside it (pressed together, the skins meet; past this they
// fuse into one lump, as an adversarial review read the fist from the thumb's side)
const LIMIT = { tip: 0.006, gap: 0.003, thumb: 0.012, wrist: 10, sunk: 0.0015 };
// A fingertip is read near the axis of its cap, and shaft contact is read away from the joint blends.
const CAP_HALF_WIDTH = 0.004;
const SHAFT_END = 0.15;
// Only the palmar face of the middle crease can count as fingertip contact.
const CREASE = { top: -0.035, bottom: -0.086, face: -0.005 };

type Region = 'palm' | `base${number}` | `shaft${number}` | `end${number}` | `tip${number}`;
interface Sample { at: THREE.Vector3; region?: Region; along: number }

/** Vertices blended as in dualQuaternion.ts, including the scale of the hand and of the model. */
function skinSamples(hand: Hand): Sample[] {
  hand.vis.updateWorldMatrix(true, true);
  // (the skin drawn: a fighter's sculpted shut while his fist is, `shut` in hands.ts)
  const mesh = hand.shut?.on ? hand.shut.skin : hand.bareSkin ?? hand.skin;
  const { position, skinWeight, skinIndex } = mesh.geometry.attributes;
  const { bones, boneInverses } = mesh.skeleton;
  const restFrames = boneInverses.map((inverse) => inverse.clone().multiply(mesh.bindMatrix));
  const matrix = new THREE.Matrix4();
  const frames = bones.map((bone, i) => {
    const shift = new THREE.Vector3(), turn = new THREE.Quaternion(), scale = new THREE.Vector3();
    matrix.multiplyMatrices(bone.matrixWorld, boneInverses[i]).decompose(shift, turn, scale);
    const dual = new THREE.Quaternion(shift.x / 2, shift.y / 2, shift.z / 2, 0).multiply(turn);
    return { turn, dual, scale: scale.x };
  });
  const p = new THREE.Vector3(), local = new THREE.Vector3();
  const real = new THREE.Vector4(), dual = new THREE.Vector4(), part = new THREE.Vector4();
  const turn = new THREE.Quaternion(), shift = new THREE.Quaternion();
  return Array.from({ length: position.count }, (_, i) => {
    p.fromBufferAttribute(position, i);
    const pivot = frames[skinIndex.getX(i)].turn;
    real.set(0, 0, 0, 0); dual.set(0, 0, 0, 0);
    let scale = 0, total = 0, heaviest = 0, on = 0;
    for (let n = 0; n < 4; n++) {
      const weight = skinWeight.getComponent(i, n), bone = skinIndex.getComponent(i, n);
      if (weight <= 0) continue;
      const frame = frames[bone];
      const share = pivot.dot(frame.turn) < 0 ? -weight : weight;
      real.addScaledVector(part.set(frame.turn.x, frame.turn.y, frame.turn.z, frame.turn.w), share);
      dual.addScaledVector(part.set(frame.dual.x, frame.dual.y, frame.dual.z, frame.dual.w), share);
      scale += frame.scale * weight;
      total += weight;
      if (weight > heaviest) { heaviest = weight; on = bone; }
    }
    const unit = 1 / real.length();
    real.multiplyScalar(unit); dual.multiplyScalar(unit);
    turn.set(real.x, real.y, real.z, real.w);
    shift.set(dual.x, dual.y, dual.z, dual.w).multiply(turn.conjugate());
    const at = p.clone().applyMatrix4(mesh.bindMatrix).multiplyScalar(scale / total)
      .applyQuaternion(turn.conjugate()).addScaledVector(local.set(shift.x, shift.y, shift.z), 2);
    if (on === 0 || on === 13) {
      const crease = p.y > CREASE.bottom && p.y < CREASE.top && p.z < CREASE.face;
      return { at, region: crease ? 'palm' : undefined, along: 0 };
    }
    const digit = Math.floor((on - 1) / 3), link = (on - 1) % 3;
    local.copy(p).applyMatrix4(restFrames[on]);
    const along = -local.y;
    const d = digit < hand.f.length ? hand.f[digit] : hand.thumb;
    if (link === 2 && Math.abs(local.x) < CAP_HALF_WIDTH) return { at, region: `tip${digit}`, along };
    if (link === 1 && along > d.len[1] * SHAFT_END && along < d.len[1] * (1 - SHAFT_END)) {
      return { at, region: `shaft${digit}`, along };
    }
    if (link === 0 && along > d.len[0] * SHAFT_END && along < d.len[0] * (1 - SHAFT_END)) {
      return { at, region: `base${digit}`, along };
    }
    if (link === 2 && along > d.len[2] * SHAFT_END && along < d.len[2] * (1 - SHAFT_END)) {
      return { at, region: `end${digit}`, along };
    }
    return { at, along };
  });
}

function surface(hand: Hand, samples: Sample[], region: Region): THREE.Triangle[] {
  const index = (hand.bareSkin ?? hand.skin).geometry.index!;
  const triangles: THREE.Triangle[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const a = samples[index.getX(i)], b = samples[index.getX(i + 1)], c = samples[index.getX(i + 2)];
    if (a.region === region && b.region === region && c.region === region) {
      triangles.push(new THREE.Triangle(a.at, b.at, c.at));
    }
  }
  if (!triangles.length) throw new Error(`hands: the fist measure found no ${region} surface`);
  return triangles;
}

function clearance(points: THREE.Vector3[], triangles: THREE.Triangle[]): number {
  const near = new THREE.Vector3();
  let least = Infinity;
  for (const point of points) for (const triangle of triangles) {
    least = Math.min(least, triangle.closestPointToPoint(point, near).distanceToSquared(point));
  }
  return Math.sqrt(least);
}

/** Signed surface distance: the same contact limit catches both floating and burying the cap. */
function palmDistance(tip: THREE.Vector3, triangles: THREE.Triangle[]): number {
  const nearest = new THREE.Vector3(), delta = new THREE.Vector3(), normal = new THREE.Vector3();
  let least = Infinity, sign = 1;
  for (const triangle of triangles) {
    delta.subVectors(tip, triangle.closestPointToPoint(tip, nearest));
    if (delta.lengthSq() >= least) continue;
    least = delta.lengthSq();
    sign = delta.dot(triangle.getNormal(normal)) < 0 ? -1 : 1;
  }
  return sign * Math.sqrt(least);
}

/** How deep the deepest of `points` lies under `triangles`' surface (0 where none is under it). */
/** How deep the deepest of `points` lies inside a finger (0 where none is): under its nearest point of `triangles`,
 *  its skin, inside where the point is nearer the finger's bones than that point of its skin is (a patch of skin's
 *  own winding can't say which side is in: its edges' nearest triangles faced any way, and read 34 mm) */
function sunkInto(points: THREE.Vector3[], triangles: THREE.Triangle[], bones: THREE.Line3[]): number {
  const near = new THREE.Vector3(), best = new THREE.Vector3(), onBone = new THREE.Vector3();
  const axisDistance = (at: THREE.Vector3) => Math.min(...bones.map((bone) =>
    bone.closestPointToPoint(at, true, onBone).distanceTo(at)));
  let deepest = 0;
  for (const point of points) {
    let least = Infinity;
    for (const triangle of triangles) {
      const distance = triangle.closestPointToPoint(point, near).distanceToSquared(point);
      if (distance < least) { least = distance; best.copy(near); }
    }
    if (axisDistance(point) < axisDistance(best)) deepest = Math.max(deepest, Math.sqrt(least));
  }
  return deepest;
}

/** How deep each finger sinks into the next (both ways, the deeper), along its three bones: the skins of
 *  fingers pressed into each other, fused into a lump where a hand's are pressed side by side. */
function fingersSunk(hand: Hand, samples: Sample[]): number[] {
  const parts = (i: number): Region[] => [`base${i}`, `shaft${i}`, `end${i}`];
  const of = (i: number) => samples.filter(({ region }) => region !== undefined && parts(i).includes(region));
  const points = hand.f.map((_, i) => of(i).map(({ at }) => at));
  const fingerSurface = (i: number) => parts(i).flatMap((part) => surface(hand, samples, part));
  const surfaces = hand.f.map((_, i) => fingerSurface(i));
  const at = (joint: THREE.Object3D) => joint.getWorldPosition(new THREE.Vector3());
  const bones = hand.f.map((finger) => [new THREE.Line3(at(finger.j[0]), at(finger.j[1])),
    new THREE.Line3(at(finger.j[1]), at(finger.j[2])),
    new THREE.Line3(at(finger.j[2]), finger.j[2].localToWorld(new THREE.Vector3(0, -finger.len[2], 0)))]);
  return points.slice(1).map((next, i) => Math.max(sunkInto(points[i], surfaces[i + 1], bones[i + 1]),
    sunkInto(next, surfaces[i], bones[i])));
}

function tipOf(samples: Sample[], i: number): THREE.Vector3 | null {
  const tips = samples.filter(({ region }) => region === `tip${i}`).sort((a, b) => b.along - a.along);
  return tips.length ? tips[0].at : null;
}

/** A fingertip's distance from the palm: none where its tip has no skin of its own, buried in the flesh of a hand
 *  sculpted closed (`HandBuild.fist`), where a fist's tips are. */
function tipDistance(samples: Sample[], i: number, palm: THREE.Triangle[]): number {
  const tip = tipOf(samples, i);
  return tip ? palmDistance(tip, palm) : 0;
}

/** Total wrist bend, measured independently of the forearm's pronation. */
export function wristBend(hand: Hand, elbow: THREE.Object3D): number {
  const towardElbow = elbow.getWorldPosition(new THREE.Vector3()).sub(hand.vis.getWorldPosition(new THREE.Vector3()));
  const backOfHand = new THREE.Vector3(0, 1, 0).transformDirection(hand.vis.matrixWorld);
  return THREE.MathUtils.radToDeg(towardElbow.angleTo(backOfHand));
}

/** The same clearance and opposition checks judge the game pose and the old grip-based canary. */
export function fistContact(hand: Hand, wrist: number): { line: string; contacts: string[]; problems: string[] } {
  const samples = skinSamples(hand);
  const palm = surface(hand, samples, 'palm');
  const tips = hand.f.map((_, i) => tipDistance(samples, i, palm));
  const shafts = hand.f.map((_, i) => surface(hand, samples, `shaft${i}`));
  const points = hand.f.map((_, i) => samples.filter(({ region }) => region === `shaft${i}`).map(({ at }) => at));
  const gaps = points.slice(1).map((p, i) => Math.min(clearance(p, shafts[i]), clearance(points[i], shafts[i + 1])));
  const sunk = fingersSunk(hand, samples);
  const thumb = tipOf(samples, hand.f.length);
  if (!thumb) throw new Error('hands: the fist measure found no tip for the thumb');
  const opposed = clearance([thumb], shafts[1]);
  const middle = hand.f[1];
  const shaft = new THREE.Line3(middle.j[1].getWorldPosition(new THREE.Vector3()),
    middle.j[2].getWorldPosition(new THREE.Vector3()));
  const near = shaft.closestPointToPoint(thumb, true, new THREE.Vector3());
  const thumbInHand = hand.vis.worldToLocal(thumb.clone());
  const nearInHand = hand.vis.worldToLocal(near);
  const over = thumbInHand.z < nearInHand.z && Math.abs(thumbInHand.x - nearInHand.x) <= middle.r;
  const mm = (n: number) => (n * 1000).toFixed(1);
  const line = `tips ${tips.map(mm).join('/')} mm, shaft gaps ${gaps.map(mm).join('/')} mm, `
    + `sunk ${sunk.map(mm).join('/')} mm, `
    + `thumb ${mm(opposed)} mm (${over ? 'over middle' : 'off middle'}), wrist ${wrist.toFixed(1)}°`;
  const contacts: string[] = [];
  if (Math.max(...tips.map(Math.abs)) > LIMIT.tip) contacts.push('fingertip missed the palm');
  if (Math.max(...gaps) > LIMIT.gap) contacts.push('adjacent shafts separated');
  if (opposed > LIMIT.thumb || !over) contacts.push('thumb missed the middle shaft');
  if (Math.max(...sunk) > LIMIT.sunk) contacts.push('fingers sunk into each other');
  const problems = [...contacts];
  if (wrist >= LIMIT.wrist) problems.push('wrist bent 10° or more');
  if (!hand.f.every(inRange)) problems.push('finger joints out of range');
  return { line, contacts, problems };
}

function inRange(digit: Digit): boolean {
  const limits = [100, 110, 80];
  return digit.j.every((joint, i) => {
    const q = joint.quaternion;
    // A 96° knuckle bend is outside the principal range of an Euler decomposition with X in the middle.
    const bend = THREE.MathUtils.radToDeg(2 * Math.atan2(q.x, q.w));
    const sideways = THREE.MathUtils.radToDeg(2 * Math.asin(Math.hypot(q.y, q.z)));
    return bend >= -0.001 && bend <= limits[i] + 0.001 && sideways <= 10;
  });
}
