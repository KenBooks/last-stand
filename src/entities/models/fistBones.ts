// The bones under a fighter's shut fist. His hand is one skin bent into its fist by its joints, and skin bent so folds
// in round curls: the knuckle row a soft ridge, each finger a hose rolled up (from play, of the fist from its sides:
// "this is not proper bend", and from behind: "this is not proper knuckles"). A real fist's skin is drawn taut over
// the ends of its bones: the four heads of the metacarpals standing in a row with a valley between each two, and the
// fingers' middle joints square corners under them. So the shut fist's skin is laid on those bone ends: where it lies
// near one, it's moved onto it. The skin's points are kept as the open hand is bound, so a point moved in the fist is
// taken back through its own bones' blend: the shut fist has points and normals of its own (`hands.ts` `shadeShut`),
// swapped in as it shuts, with the same bones, weights and program.
import * as THREE from 'three';
import { tunable } from '../../core/tuning';

/**
 * The bone ends a shut fist's skin is laid on: each finger's knuckle's head as a share of the finger's radius, index
 * first (`heads`: the index's and the middle finger's stand proudest, the row falls to the little finger's), its
 * middle joint's (`mids`), how far out of the back of the hand a head stands off its joint (`proud`, a share of its
 * radius), how near the skin must lie to an end to be laid on it (`band`, m), how much of the way it's moved (`pull`)
 * and how softly two ends run into each other (`blend`, m).
 */
const FIST_BONES = tunable('fistBones', {
  heads: [1.34, 1.4, 1.3, 1.18], mids: [1.14, 1.16, 1.12, 1.08], proud: 0.3, band: 0.009, pull: 0.85, blend: 0.004,
});

/** a skin as its bones pose it, in a frame of its own: each point, its normal, and the turn and move that took it */
export interface PosedSkin {
  at: Float32Array;
  out: Float32Array;
  turns: Float32Array;
  moves: Float32Array;
}

/** a bone end under the skin: a ball, the bones whose skin it shapes, the way it faces out of the hand (`face`), how
 *  far round from that way it still shapes the skin (`round`, the least cosine), and whether it only lifts the skin */
interface BoneEnd {
  at: THREE.Vector3;
  r: number;
  bones: readonly number[];
  face: THREE.Vector3;
  round: number;
  lifts: boolean;
}

const _turn = new THREE.Quaternion(), _pivot = new THREE.Quaternion(), _move = new THREE.Vector3();
const _scale = new THREE.Vector3(), _p = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Quaternion();

/**
 * `mesh`'s skin (`geometry`: its own, or one bound as it is) as its bones pose it now, blended as it's drawn (`dualQuaternion.ts`: each point's bones as turns
 * and moves, on the first one's side), `placed` each bone's place in the frame it's read in (`hands.ts` `placeIn`).
 */
export function posedSkin(mesh: THREE.SkinnedMesh, geometry: THREE.BufferGeometry, placed: readonly THREE.Matrix4[],
): PosedSkin {
  const position = geometry.attributes.position, normal = geometry.attributes.normal;
  const index = geometry.attributes.skinIndex, share = geometry.attributes.skinWeight, count = position.count;
  // each bone's turn and move of a point as it's bound
  const bones = placed.map((place, n) => {
    const whole = place.clone().multiply(mesh.skeleton.boneInverses[n]).multiply(mesh.bindMatrix);
    const turn = new THREE.Quaternion(), move = new THREE.Vector3();
    whole.decompose(move, turn, _scale);
    // (the move as the dual part: half the move times the turn)
    const dual = new THREE.Quaternion(move.x, move.y, move.z, 0).multiply(turn);
    return { turn, dual: [dual.x / 2, dual.y / 2, dual.z / 2, dual.w / 2] };
  });
  const posed: PosedSkin = {
    at: new Float32Array(count * 3), out: new Float32Array(count * 3),
    turns: new Float32Array(count * 4), moves: new Float32Array(count * 3),
  };
  for (let i = 0; i < count; i++) {
    let rx = 0, ry = 0, rz = 0, rw = 0, dx = 0, dy = 0, dz = 0, dw = 0, first = true;
    for (let k = 0; k < 4; k++) {
      const w = share.getComponent(i, k);
      if (w <= 0) continue;
      const bone = bones[index.getComponent(i, k)];
      if (first) _pivot.copy(bone.turn);
      first = false;
      const side = bone.turn.dot(_pivot) < 0 ? -w : w;
      rx += bone.turn.x * side; ry += bone.turn.y * side; rz += bone.turn.z * side; rw += bone.turn.w * side;
      dx += bone.dual[0] * side; dy += bone.dual[1] * side; dz += bone.dual[2] * side; dw += bone.dual[3] * side;
    }
    const size = Math.hypot(rx, ry, rz, rw) || 1;
    rx /= size; ry /= size; rz /= size; rw /= size; dx /= size; dy /= size; dz /= size; dw /= size;
    _turn.set(rx, ry, rz, rw);
    // (the move back out of the dual part: twice it times the turn's reverse)
    _move.set(
      2 * (rw * dx - dw * rx + ry * dz - rz * dy),
      2 * (rw * dy - dw * ry + rz * dx - rx * dz),
      2 * (rw * dz - dw * rz + rx * dy - ry * dx),
    );
    _p.fromBufferAttribute(position, i).applyQuaternion(_turn).add(_move);
    _n.fromBufferAttribute(normal, i).applyQuaternion(_turn);
    posed.at.set([_p.x, _p.y, _p.z], i * 3);
    posed.out.set([_n.x, _n.y, _n.z], i * 3);
    posed.turns.set([rx, ry, rz, rw], i * 4);
    posed.moves.set([_move.x, _move.y, _move.z], i * 3);
  }
  return posed;
}

/** a finger of a shut fist for its bone ends: its joints' places in the hand's frame (its knuckle first), its radius,
 *  and its bones' numbers in the skin's skeleton (its knuckle's first) */
export interface FistFinger {
  joints: readonly THREE.Vector3[];
  r: number;
  bones: readonly number[];
}

/** the bone ends under a shut fist's `fingers` (index first), `palm` the palm's bone's number */
function boneEnds(fingers: readonly FistFinger[], palm: number): BoneEnd[] {
  const ends: BoneEnd[] = [];
  fingers.forEach((finger, i) => {
    const head = finger.r * FIST_BONES.heads[i];
    // (a metacarpal's head stands past its joint down the hand and out of its back, the hand's frame: the corner of
    // the fist)
    // (and shapes the skin of the back and the striking face alone: round on the palm's side it drew the skin between
    // the fingers' roots in, and its inside showed from the fingertips' side)
    const out = new THREE.Vector3(0, -0.7, 0.7).normalize();
    ends.push({
      at: finger.joints[0].clone().addScaledVector(out, FIST_BONES.proud * head), r: head,
      bones: [palm, finger.bones[0]], face: out, round: 0, lifts: false,
    });
    // (a middle joint's end lifts the skin on the outside of its bend alone, the fold's corner: laid on all round, it
    // drew the fingers' sides in and they stood 1 mm further apart, `lab hands`' shaft gaps)
    const [knuckle, middle, last] = finger.joints;
    const outer = middle.clone().sub(knuckle).normalize().add(middle.clone().sub(last).normalize()).normalize();
    ends.push({
      at: middle.clone(), r: finger.r * FIST_BONES.mids[i], bones: [finger.bones[0], finger.bones[1]],
      face: outer, round: 0.35, lifts: true,
    });
  });
  return ends;
}

/** the bone a point of the skin keeps to most */
function mainBone(index: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  share: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number): number {
  let most = 0;
  for (let k = 1; k < 4; k++) if (share.getComponent(i, k) > share.getComponent(i, most)) most = k;
  return index.getComponent(i, most);
}

/**
 * `mesh`'s points and normals for its shut fist, as it's bound: `posed` (its skin in the fist, `posedSkin`) laid on
 * the bone ends under `fingers`, and taken back through each point's own blend.
 */
export function onBones(mesh: THREE.SkinnedMesh, posed: PosedSkin, fingers: readonly FistFinger[], palm: number,
): { position: THREE.BufferAttribute; normal: THREE.BufferAttribute } {
  const geometry = mesh.geometry, count = geometry.attributes.position.count;
  const index = geometry.attributes.skinIndex, share = geometry.attributes.skinWeight;
  const ends = boneEnds(fingers, palm), { band, pull, blend } = FIST_BONES;
  const at = posed.at.slice();
  for (let i = 0; i < count; i++) {
    const bone = mainBone(index, share, i);
    _p.fromArray(posed.at, i * 3);
    // the nearest two ends that shape this point's skin: how far outside each it lies (m, under 0 inside)
    let near = Infinity, next = Infinity, nearest: BoneEnd | null = null;
    for (const end of ends) {
      if (!end.bones.includes(bone)) continue;
      const off = _p.distanceTo(end.at) - end.r;
      if (end.lifts && off > 0) continue;
      if (_n.copy(_p).sub(end.at).normalize().dot(end.face) < end.round) continue;
      if (off < near) { next = near; near = off; nearest = end; } else if (off < next) next = off;
    }
    if (!nearest || Math.abs(near) >= band) continue;
    // (between two ends the skin runs from one to the other in a valley, not a crease)
    const valley = Math.max(0, blend - (next - near)) ** 2 / (4 * blend);
    const off = near - valley, weight = pull * (1 - (Math.abs(near) / band) ** 2);
    _n.copy(_p).sub(nearest.at).normalize();
    _p.addScaledVector(_n, -off * weight);
    at.set([_p.x, _p.y, _p.z], i * 3);
  }
  const out = normalsOf(at, geometry.index, posed.out);
  // back through each point's own blend, to where it's bound
  const position = new Float32Array(count * 3), normal = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    _q.fromArray(posed.turns, i * 4).invert();
    _p.fromArray(at, i * 3).sub(_move.fromArray(posed.moves, i * 3)).applyQuaternion(_q);
    _n.fromArray(out, i * 3).applyQuaternion(_q);
    position.set([_p.x, _p.y, _p.z], i * 3);
    normal.set([_n.x, _n.y, _n.z], i * 3);
  }
  return { position: new THREE.BufferAttribute(position, 3), normal: new THREE.BufferAttribute(normal, 3) };
}

/** each point's normal from the faces round it (`index` the faces' corners; `was` kept where a point has none) */
function normalsOf(at: Float32Array, index: THREE.BufferAttribute | null, was: Float32Array): Float32Array {
  const out = new Float32Array(at.length), corners = index ? index.count : at.length / 3;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let n = 0; n + 2 < corners; n += 3) {
    const ia = index ? index.getX(n) : n, ib = index ? index.getX(n + 1) : n + 1, ic = index ? index.getX(n + 2) : n + 2;
    a.fromArray(at, ia * 3); b.fromArray(at, ib * 3); c.fromArray(at, ic * 3);
    b.sub(a); c.sub(a); b.cross(c);
    for (const corner of [ia, ib, ic]) {
      out[corner * 3] += b.x; out[corner * 3 + 1] += b.y; out[corner * 3 + 2] += b.z;
    }
  }
  for (let i = 0; i < at.length; i += 3) {
    const size = Math.hypot(out[i], out[i + 1], out[i + 2]);
    if (size > 0) { out[i] /= size; out[i + 1] /= size; out[i + 2] /= size; } else out.set(was.subarray(i, i + 3), i);
  }
  return out;
}
