// The bones under a fighter's shut fist. His hand is one skin bent into its fist by its joints, and skin bent so folds
// in round curls: the knuckle row a soft ridge, each finger a hose rolled up (from play, of the fist from its sides:
// "this is not proper bend", and from behind: "this is not proper knuckles"; then: "finger/fist's ligaments anatomy,
// study it, then fix"). What a fist's anatomy shows through its skin, and what is made of it here:
// - its knuckles are the heads of the metacarpals, the skin drawn taut over them, each with its finger's extensor
//   tendon held over its top (by the sagittal bands) and running back up the hand to the wrist, and a valley between
//   each two heads: a smooth relief added to the skin (`relief`), a head, a tendon and a valley a finger;
// - the index's and the middle finger's metacarpals are fixed to the wrist and the ring's and the little finger's
//   are not: as a fist tightens those two drop towards the palm, so the knuckle row is an arch, not a line. The two
//   fingers' roots drop in `hands.ts` (`fistRoot`), and the palm's skin with them here (`descended`);
// - a finger bends at its joints alone, its bones straight between them, and on the outside of a bent middle joint
//   the head of the bone before it stands as a corner: a smaller rise there;
// - the back of the hand runs straight from the forearm to the knuckles (`straightBack`).
// The skin's points are kept as the open hand is bound, so a point moved in the fist is taken back through its own
// bones' blend: the shut fist has points and normals of its own (`hands.ts` `shadeShut`), swapped in as it shuts,
// with the same bones, weights and program.
import * as THREE from 'three';
import { tunable } from '../../core/tuning';

/** a skin as its bones pose it, in a frame of its own: each point, its normal, and the turn and move that took it */
export interface PosedSkin {
  at: Float32Array;
  out: Float32Array;
  turns: Float32Array;
  moves: Float32Array;
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
 *  its bones' numbers in the skin's skeleton (its knuckle's first), and how far its root has dropped towards the
 *  palm about the wrist's end of its metacarpal (`drop`, rad) */
export interface FistFinger {
  joints: readonly THREE.Vector3[];
  r: number;
  bones: readonly number[];
  drop: number;
}

/** where the outer metacarpals turn from as they drop: how far down the hand from its joint (y, m) and out of its
 *  middle (z, m), and how far below it the palm's skin has all of the drop (m) */
export interface FistDrop {
  y: number;
  z: number;
  eased: number;
}

/**
 * The palm's skin dropped with its outer knuckles, `at` its points as posed, changed in place: each point turned
 * about the metacarpals' wrist end by its place across the hand (none at the middle finger's knuckle and beyond it,
 * each outer finger's own at its knuckle) and by the palm's share of it (a point the finger's bone moves in part has
 * that part of the drop already).
 */
function descended(at: Float32Array, palmShare: (i: number) => number, fingers: readonly FistFinger[],
  drop: FistDrop): void {
  const across = fingers.map((finger) => ({ x: finger.joints[0].x, drop: finger.drop })).sort((a, b) => a.x - b.x);
  const dropAt = (x: number): number => {
    if (x <= across[0].x) return across[0].drop;
    for (let n = 1; n < across.length; n++) {
      if (x > across[n].x) continue;
      const share = (x - across[n - 1].x) / (across[n].x - across[n - 1].x);
      return across[n - 1].drop + (across[n].drop - across[n - 1].drop) * share;
    }
    return across[across.length - 1].drop;
  };
  for (let i = 0; i < at.length / 3; i++) {
    const palm = palmShare(i), below = (drop.y - at[i * 3 + 1]) / drop.eased;
    if (palm <= 0 || below <= 0) continue;
    const eased = below >= 1 ? 1 : below * below * (3 - 2 * below);
    const turn = dropAt(at[i * 3]) * palm * eased;
    if (turn === 0) continue;
    const dy = at[i * 3 + 1] - drop.y, dz = at[i * 3 + 2] - drop.z, c = Math.cos(turn), s = Math.sin(turn);
    at[i * 3 + 1] = drop.y + c * dy - s * dz;
    at[i * 3 + 2] = drop.z + s * dy + c * dz;
  }
}

/**
 * A shut fist's relief (m): each knuckle's head's height, index first (`heads`: the index's and the middle finger's
 * stand proudest) and how wide it spreads (`head`); how deep the valley between two heads is and how wide
 * (`valley`, `between`); each extensor tendon's height at its knuckle and at the wrist, its half-width, and how far
 * in towards the hand's middle it has run by the wrist (`tendon`, `cord`, `gathers`, a share of its knuckle's place
 * across); the rise on the outside of a bent middle joint and its spread (`mid`, `corner`); and the way out of the
 * fist's corner a head faces, the hand's frame (`out`).
 */
const FIST_RELIEF = tunable('fistRelief', {
  heads: [0.0018, 0.0022, 0.0015, 0.0011], head: 0.0075, valley: 0.0008, between: 0.004,
  tendon: [0.0004, 0.0001], cord: 0.004, gathers: 0.45, mid: 0.0005, corner: 0.0055, out: [0, -0.35, 0.94],
});

/** how far (x, y) lies from the line from (ax, ay) to (bx, by), and how far along it (0 to 1) */
function offLine(x: number, y: number, ax: number, ay: number, bx: number, by: number): [number, number] {
  const dx = bx - ax, dy = by - ay;
  const along = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return [Math.hypot(x - ax - dx * along, y - ay - dy * along), along];
}

/**
 * A shut fist's relief added to its skin, `at` its points as posed and `out` their normals, `at` changed in place:
 * each point moved along its normal by the heads, the valleys, the tendons and the middle joints' corners near it
 * (`FIST_RELIEF`), each a smooth rise that fades with distance. `shapes(i, finger)`: whether point `i` is skin a
 * finger's knuckle shapes (the palm's, or that finger's first segment's), `bends(i, finger)` its middle joint
 * (its first or second segment's); `wristY` where the tendons end up the hand.
 */
function relief(at: Float32Array, out: Float32Array, fingers: readonly FistFinger[], wristY: number,
  shapes: (i: number, finger: number) => boolean, bends: (i: number, finger: number) => boolean): void {
  const { heads, head, valley, between, tendon, cord, gathers, mid, corner } = FIST_RELIEF;
  const way = new THREE.Vector3(...FIST_RELIEF.out).normalize();
  const tops = fingers.map((finger) => finger.joints[0].clone().addScaledVector(way, finger.r));
  const corners = fingers.map((finger) => {
    const [knuckle, middle, last] = finger.joints;
    const outer = middle.clone().sub(knuckle).normalize().add(middle.clone().sub(last).normalize()).normalize();
    return middle.clone().addScaledVector(outer, finger.r * 0.9);
  });
  const fade = (distance: number, spread: number): number => Math.exp(-((distance / spread) ** 2));
  for (let i = 0; i < at.length / 3; i++) {
    _p.fromArray(at, i * 3);
    _n.fromArray(out, i * 3);
    // (the back's and the striking face's skin alone: what faces the palm is under the fingers)
    const faces = Math.min(1, Math.max(0, (_n.dot(way) + 0.2) / 0.5));
    let lift = 0;
    fingers.forEach((finger, f) => {
      if (shapes(i, f) && faces > 0) {
        lift += heads[f] * fade(_p.distanceTo(tops[f]), head) * faces;
        if (f + 1 < fingers.length) {
          lift -= valley * fade(_p.distanceTo(_move.copy(tops[f]).add(tops[f + 1]).multiplyScalar(0.5)), between) * faces;
        }
        // (its tendon, up the back from its knuckle towards the wrist's middle)
        if (_n.z > 0.3 && _p.y > tops[f].y) {
          const [off, along] = offLine(_p.x, _p.y, tops[f].x, tops[f].y, tops[f].x * gathers, wristY);
          lift += (tendon[0] + (tendon[1] - tendon[0]) * along) * fade(off, cord) * Math.min(1, (_n.z - 0.3) / 0.3);
        }
      }
      if (bends(i, f)) lift += mid * fade(_p.distanceTo(corners[f]), corner);
    });
    if (lift !== 0) at.set([_p.x + _n.x * lift, _p.y + _n.y * lift, _p.z + _n.z * lift], i * 3);
  }
}

/**
 * A shut fist's back closed over: how wide a band down the hand its outline across is read in (`band`, m), how far
 * past the knuckle joints, down the fingers, the closing has eased out to nothing (`over`, m), how high a point
 * must stand, as a share of the outline's height over it, to be raised to it (`stands`, from none to all of the
 * way), and how far under the outline the skin is left (`under`, m).
 */
const FIST_CLOSED = tunable('fistClosed', { band: 0.003, over: 0.011, stands: [0.1, 0.4], under: 0.0003 });

/** the upper outline of points (x, z), sorted by x: the corners of the hull over them, left to right */
function outlineOver(points: [number, number][]): [number, number][] {
  const hull: [number, number][] = [];
  for (const point of points) {
    while (hull.length >= 2) {
      const [ax, az] = hull[hull.length - 2], [bx, bz] = hull[hull.length - 1];
      // (the last corner lies under the line from the one before it to this point: not of the outline)
      if ((bx - ax) * (point[1] - az) - (bz - az) * (point[0] - ax) < 0) break;
      hull.pop();
    }
    hull.push(point);
  }
  return hull;
}

/** an outline's height at `x` (the end's beyond it) */
function outlineAt(hull: [number, number][], x: number): number {
  if (!hull.length) return -Infinity;
  if (x <= hull[0][0]) return hull[0][1];
  for (let n = 1; n < hull.length; n++) {
    if (x > hull[n][0]) continue;
    const share = (x - hull[n - 1][0]) / (hull[n][0] - hull[n - 1][0] || 1);
    return hull[n - 1][1] + (hull[n][1] - hull[n - 1][1]) * share;
  }
  return hull[hull.length - 1][1];
}

/**
 * A shut fist's back closed over, `at` its points as posed, changed in place: from the wrist to its knuckles the
 * back of the hand is one surface, each point raised to the outline across the hand over it. The hand's sculpt
 * stands a long rounded ridge up the back from each finger's knuckle, with a groove between each two that begins
 * 4 to 5 cm above the knuckle joints: an open hand's knuckles and tendons, but in a fist, seen from behind, each
 * ridge's end read as a finger's segment above the knuckle, the back of the hand, a lobe, then the finger (from play,
 * with photographs of his own fist: "human finger only has 2 bones, you drew 3 here", "we need to fix an extra finger
 * segment", "if you see 1st finger segment from fist side... then its not a fist at all"). A fist's back is smooth to
 * its knuckles, and its fingers part only below them: the closing eases out over the knuckles (`over`). How much
 * each point is of the closed back is given back (0 to 1): the sculpt's own shading, dark in its grooves and over
 * its knuckles' ridges, comes off there (`hands.ts` `shutSkin`). Left on, the grooves were still painted on the
 * smooth back; taken off only where a point was raised, the ridges' ends kept theirs and stood as a darker block
 * across the hand, still a segment above the knuckles.
 */
function closedBack(at: Float32Array, backOf: (i: number) => boolean, knuckleY: number): Float32Array {
  const { band, over, stands, under } = FIST_CLOSED;
  const count = at.length / 3, to = knuckleY - over, closed = new Float32Array(count);
  let from = -Infinity;
  for (let i = 0; i < count; i++) if (backOf(i)) from = Math.max(from, at[i * 3 + 1]);
  const bands = Math.max(1, Math.ceil((from - to) / band));
  const across: [number, number][][] = Array.from({ length: bands }, () => []);
  for (let i = 0; i < count; i++) {
    const y = at[i * 3 + 1];
    if (!backOf(i) || y < to || at[i * 3 + 2] <= 0) continue;
    across[Math.min(bands - 1, Math.floor((from - y) / band))].push([at[i * 3], at[i * 3 + 2]]);
  }
  const outlines = across.map((points) => outlineOver(points.sort((a, b) => a[0] - b[0])));
  for (let i = 0; i < count; i++) {
    const y = at[i * 3 + 1], z = at[i * 3 + 2];
    if (!backOf(i) || y < to || z <= 0) continue;
    // (its band's outline eased to the next band's by its place between their middles)
    const along = Math.min(bands - 1, Math.max(0, (from - y) / band - 0.5));
    const low = Math.floor(along), next = Math.min(bands - 1, low + 1);
    const a = outlineAt(outlines[low], at[i * 3]), b = outlineAt(outlines[next], at[i * 3]);
    const height = (b === -Infinity ? a : a === -Infinity ? b : a + (b - a) * (along - low)) - under;
    if (height === -Infinity) continue;
    const standing = Math.min(1, Math.max(0, (z / height - stands[0]) / (stands[1] - stands[0])));
    const past = Math.min(1, Math.max(0, (knuckleY - y) / over));
    const share = (1 - past * past * (3 - 2 * past)) * standing * standing * (3 - 2 * standing);
    closed[i] = share;
    if (height > z) at[i * 3 + 2] += (height - z) * share;
  }
  return closed;
}

/**
 * A shut fist's back closed along the hand too, `at` its points, changed in place: in each strip down the hand, from
 * the wrist to the knuckles, each point is raised to the outline along the hand over it. Closed across the hand
 * alone (`closedBack`, band by band), nothing evened the back from one band to the next, and where the sculpt's ridges
 * begin, 3 cm above the knuckles, the back dipped 1 to 2 mm and rose again to the knuckles: a groove across the hand,
 * lit along its edge (from play: "why is there a groove still ?"; read along each finger's line: the middle finger's
 * 21.3 mm, 20.1, then up to 23.4 at its knuckle, the ring finger's 18.1 to 16.0 in one step).
 */
function closedAlong(at: Float32Array, backOf: (i: number) => boolean, knuckleY: number): void {
  const { band, stands, under } = FIST_CLOSED;
  const count = at.length / 3;
  let left = Infinity, right = -Infinity;
  for (let i = 0; i < count; i++) {
    if (!backOf(i) || at[i * 3 + 1] < knuckleY || at[i * 3 + 2] <= 0) continue;
    left = Math.min(left, at[i * 3]);
    right = Math.max(right, at[i * 3]);
  }
  if (!(right > left)) return;
  const strips = Math.max(1, Math.ceil((right - left) / band));
  const down: [number, number][][] = Array.from({ length: strips }, () => []);
  const stripOf = (x: number): number => Math.min(strips - 1, Math.max(0, Math.floor((x - left) / band)));
  for (let i = 0; i < count; i++) {
    if (!backOf(i) || at[i * 3 + 1] < knuckleY || at[i * 3 + 2] <= 0) continue;
    down[stripOf(at[i * 3])].push([at[i * 3 + 1], at[i * 3 + 2]]);
  }
  const outlines = down.map((points) => outlineOver(points.sort((a, b) => a[0] - b[0])));
  for (let i = 0; i < count; i++) {
    const y = at[i * 3 + 1], z = at[i * 3 + 2];
    if (!backOf(i) || y < knuckleY || z <= 0) continue;
    // (its strip's outline eased to the next strip's by its place between their middles)
    const across = Math.min(strips - 1, Math.max(0, (at[i * 3] - left) / band - 0.5));
    const low = Math.floor(across), next = Math.min(strips - 1, low + 1);
    const a = outlineAt(outlines[low], y), b = outlineAt(outlines[next], y);
    const height = (b === -Infinity ? a : a === -Infinity ? b : a + (b - a) * (across - low)) - under;
    if (!(height > z)) continue;
    const standing = Math.min(1, Math.max(0, (z / height - stands[0]) / (stands[1] - stands[0])));
    at[i * 3 + 2] += (height - z) * standing * standing * (3 - 2 * standing);
  }
}

/**
 * The back of a shut fist's hand: how wide a band down the hand its height is read in (`band`, m), how far above the
 * knuckle joints its straight line ends (`short`, m), how much higher than at the wrist it may end at the knuckles
 * (`rise`, m), how high a point must stand, as a share of its band's height, to be raised with it (`stands`, from
 * none to all of the way), how far past the line's end, over the knuckles, the raise eases out (`over`, m), and how
 * near the knuckle joints what stands over the line is left standing (`heads`: from all of it left, m above the
 * joints, to none).
 */
const FIST_BACK = tunable('fistBack', {
  band: 0.004, short: 0.004, rise: 0.0015, stands: [0.1, 0.75], over: 0.014, heads: [0.001, 0.012],
});

/**
 * A shut fist's back laid straight, `at` its points as posed (the hand's frame: y down the hand from the wrist, z out
 * of its back), changed in place. The hand's sculpt has a waist between its wrist and its knuckle row: its back
 * stands 21 to 22 mm off the hand's middle at the wrist, 12 to 16 mm across the middle of the back and 24 mm at the
 * knuckles, so a fist seen from its side ran down from the forearm in a dip and then a bump (from play, of that
 * outline: "this should be a straight line, why is it not ?"), where a fist's back runs straight on from the forearm
 * to the knuckles, the skin drawn taut over the bones. Each point of the back is raised by what its band's highest
 * point lacks of the line from the wrist's height to the knuckles', so the tendons' relief across it is kept.
 */
function straightBack(at: Float32Array, posed: PosedSkin, palmOf: (i: number) => boolean,
  backOf: (i: number) => boolean, knuckleY: number): void {
  const { band, short, rise, stands, over, heads } = FIST_BACK;
  const count = at.length / 3, to = knuckleY + short;
  let from = -Infinity;
  for (let i = 0; i < count; i++) if (palmOf(i)) from = Math.max(from, at[i * 3 + 1]);
  const bands = Math.max(1, Math.ceil((from - to) / band));
  const bandOf = (y: number): number => Math.min(bands - 1, Math.max(0, Math.floor((from - y) / band)));
  const high = new Float32Array(bands).fill(-Infinity);
  for (let i = 0; i < count; i++) {
    const y = at[i * 3 + 1];
    if (!palmOf(i) || y < to || posed.out[i * 3 + 2] < 0.6) continue;
    high[bandOf(y)] = Math.max(high[bandOf(y)], at[i * 3 + 2]);
  }
  // (a band with no point of the back in it takes its neighbour's height)
  for (let n = 1; n < bands; n++) if (high[n] === -Infinity) high[n] = high[n - 1];
  // (and the bands' heights eased into each other, twice: read band by band, the back was raised in ripples)
  for (let pass = 0; pass < 2; pass++) {
    const was = high.slice();
    for (let n = 1; n + 1 < bands; n++) high[n] = (was[n - 1] + 2 * was[n] + was[n + 1]) / 4;
  }
  const wrist = high[0], knuckles = Math.min(high[bands - 1], wrist + rise);
  const lineAt = (y: number): number => wrist + (knuckles - wrist) * Math.min(1, Math.max(0, (from - y) / (from - to)));
  // each band's height read at its middle, eased to the next: by bands alone, the back was raised in steps
  const heightAt = (y: number): number => {
    const along = Math.min(bands - 1, Math.max(0, (from - y) / band - 0.5));
    const low = Math.floor(along), next = Math.min(bands - 1, low + 1);
    return high[low] + (high[next] - high[low]) * (along - low);
  };
  for (let i = 0; i < count; i++) {
    // (eased out over the knuckles, the palm's skin and the fingers' roots' alike: stopped at the line's end, the
    // raised back met the knuckles in a step, a lumpy band across the hand)
    const y = Math.max(to, at[i * 3 + 1]), past = (to - at[i * 3 + 1]) / over;
    if (!backOf(i) || past >= 1) continue;
    const eased = past <= 0 ? 1 : 1 - past * past * (3 - 2 * past);
    // (by how high it stands, not by which way it faces: by its normal, which the skin's wrinkles turn, the back's
    // edges were raised in blotches)
    const height = heightAt(y), standing = (at[i * 3 + 2] / height - stands[0]) / (stands[1] - stands[0]);
    const share = Math.min(1, Math.max(0, standing));
    const lacks = Math.max(0, lineAt(y) - height);
    at[i * 3 + 2] += lacks * eased * share * share * (3 - 2 * share);
    // (and what stands over the line brought down to it, but for the knuckles' heads at its end: the sculpt's ridge
    // up the back from each knuckle swelled the last 3 cm of the hand out of its back, and that swell, lit along its
    // top, was a block across the hand above the fingers: the extra segment, from play)
    const above = (at[i * 3 + 1] - knuckleY - heads[0]) / (heads[1] - heads[0]);
    const flat = Math.min(1, Math.max(0, above));
    const proud = at[i * 3 + 2] - lineAt(y);
    if (proud > 0) at[i * 3 + 2] -= proud * flat * flat * (3 - 2 * flat);
  }
}

/** the bone a point of the skin keeps to most */
function mainBone(index: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  share: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number): number {
  let most = 0;
  for (let k = 1; k < 4; k++) if (share.getComponent(i, k) > share.getComponent(i, most)) most = k;
  return index.getComponent(i, most);
}

/**
 * `mesh`'s points and normals for its shut fist, as it's bound: `posed` (its skin in the fist, `posedSkin`) with the
 * palm dropped with its outer knuckles (`drop`), its back laid straight, smoothed where those moved it, and the
 * fist's relief added; each point then taken back through its own blend.
 */
export function onBones(mesh: THREE.SkinnedMesh, posed: PosedSkin, fingers: readonly FistFinger[], palm: number,
  drop: FistDrop): { position: THREE.BufferAttribute; normal: THREE.BufferAttribute; closed: Float32Array } {
  const geometry = mesh.geometry, count = geometry.attributes.position.count;
  const index = geometry.attributes.skinIndex, share = geometry.attributes.skinWeight;
  const at = posed.at.slice();
  const knuckleY = Math.max(...fingers.slice(0, 2).map((finger) => finger.joints[0].y));
  const knuckles = new Set(fingers.map((finger) => finger.bones[0]));
  const main = Array.from({ length: count }, (_, i) => mainBone(index, share, i));
  const palmShare = (i: number): number => {
    let palms = 0;
    for (let k = 0; k < 4; k++) if (index.getComponent(i, k) === palm) palms += share.getComponent(i, k);
    return palms;
  };
  descended(at, palmShare, fingers, drop);
  const closed = closedBack(at, (i) => main[i] === palm || knuckles.has(main[i]), knuckleY);
  let wristY = -Infinity;
  for (let i = 0; i < count; i++) if (main[i] === palm) wristY = Math.max(wristY, at[i * 3 + 1]);
  straightBack(at, posed, (i) => main[i] === palm, (i) => main[i] === palm || knuckles.has(main[i]), knuckleY);
  closedAlong(at, (i) => main[i] === palm || knuckles.has(main[i]), knuckleY);
  smoothed(at, posed.at, geometry.index);
  relief(
    at, normalsOf(at, geometry.index, posed.out), fingers, wristY,
    (i, f) => main[i] === palm || main[i] === fingers[f].bones[0],
    (i, f) => main[i] === fingers[f].bones[0] || main[i] === fingers[f].bones[1],
  );
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
  return { position: new THREE.BufferAttribute(position, 3), normal: new THREE.BufferAttribute(normal, 3), closed };
}

/** how far a point of a shut fist's skin must have been moved to be smoothed with its neighbours (m), how many times
 *  over, and how far towards their middle each time */
const FIST_SMOOTH = tunable('fistSmooth', { moved: 0.0003, passes: 4, share: 0.5 });

/**
 * The skin smoothed where it was moved: each point `was` moved from, and each one joined to such a point, drawn
 * towards the middle of the points it's joined to, `passes` times. Its back raised, the skin over the knuckles was
 * left in small lumps where the raise met the sculpt's own knuckles (from play, of the straightened fist: "just need
 * to clean up the geometry a little"). The relief goes on after it: smooth of itself, and smoothed, it was lost.
 */
function smoothed(at: Float32Array, was: Float32Array, index: THREE.BufferAttribute | null): void {
  if (!index) return;
  const count = at.length / 3, joined: number[][] = Array.from({ length: count }, () => []);
  for (let n = 0; n + 2 < index.count; n += 3) {
    const corners = [index.getX(n), index.getX(n + 1), index.getX(n + 2)];
    for (const a of corners) for (const b of corners) if (a !== b && !joined[a].includes(b)) joined[a].push(b);
  }
  const moved = (i: number): boolean => Math.hypot(
    at[i * 3] - was[i * 3], at[i * 3 + 1] - was[i * 3 + 1], at[i * 3 + 2] - was[i * 3 + 2]) > FIST_SMOOTH.moved;
  const own = new Uint8Array(count);
  for (let i = 0; i < count; i++) if (moved(i)) own[i] = 1;
  const eased: number[] = [];
  for (let i = 0; i < count; i++) if (own[i] || joined[i].some((other) => own[other])) eased.push(i);
  for (let pass = 0; pass < FIST_SMOOTH.passes; pass++) {
    const from = at.slice();
    for (const i of eased) {
      if (!joined[i].length) continue;
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (const other of joined[i]) sum += from[other * 3 + c];
        at[i * 3 + c] += (sum / joined[i].length - from[i * 3 + c]) * FIST_SMOOTH.share;
      }
    }
  }
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
