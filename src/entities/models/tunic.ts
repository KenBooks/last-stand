// A man's plain tunic over the rig's chest (the mage's under his robe, the ranger's coat): its shape round the chest and
// over the shoulders, the neckline round the neck and its rolled hem there, and the waist below it. Shared by the heroes
// built on the same frame, so each meets the neck as a man's does.
import * as THREE from 'three';
import { belt, TILE } from './armor';
import { curve, type Keys } from './motion';
import { clamp } from '../../util';
import { joint } from './rig';
import { built } from './steps';

/** chest joint space (m): at each height its half-width and half-depth, and how square its section is. Over the shoulders
 *  it is as broad as the arms' tops and thin front to back, the trapezius sloping down from the neck and a deltoid
 *  rounding over each shoulder joint down into the armpit (a round barrel of a body, with the arms' tubes stood beside it
 *  under their own round tops, read as a coat hanger) */
const TUNIC_W: Keys = [[-0.12, 0.143], [-0.02, 0.152], [0.1, 0.162], [0.15, 0.18], [0.19, 0.232], [0.215, 0.248], [0.238, 0.24], [0.256, 0.2], [0.274, 0.14], [0.289, 0.098], [0.3, 0.0765]];
const TUNIC_D: Keys = [[-0.12, 0.125], [-0.02, 0.133], [0.1, 0.142], [0.16, 0.138], [0.21, 0.118], [0.25, 0.094], [0.275, 0.08], [0.3, 0.0715]];
const TUNIC_P: Keys = [[-0.12, 2], [0.12, 2], [0.2, 2.6], [0.26, 2.6], [0.3, 2]];
/** how far back the neckline sits (m): round the neck, which rises from the back of the chest (its middle a centimetre
 *  behind the chest's: centred on the chest, the collar was tight at the back and a man's neck came through it; a few mm
 *  loose all round, as the neck leans back in it at a run and turns in it) */
export const NECKLINE_BACK = 0.0125;
/** how far back a neckline is at height `y` on the chest joint (m): none on the chest, `NECKLINE_BACK` round the neck */
export const necklineBack = (y: number) => { const t = clamp((y - 0.26) / 0.04, 0, 1); return -NECKLINE_BACK * t * t * (3 - 2 * t); };
/** the tunic's height range on the chest joint (m): from below the chest's joint up to the neckline */
export const TUNIC_Y: [number, number] = [-0.12, 0.3];
/** below it, round the spine joint (m): half-width at each height, the depth 0.86 of it */
export const WAIST: [number, number][] = [[0.148, -0.05], [0.15, 0.08], [0.152, 0.2], [0.155, 0.26]];

/** a point on the tunic towards `a` round it (0 the front, +x his left) at height y, `lift` above it */
export function onTunic(a: number, y: number, lift: number, out = new THREE.Vector3()): THREE.Vector3 {
  const X = curve(TUNIC_W, y) + lift, Z = curve(TUNIC_D, y) + lift, e = 2 / curve(TUNIC_P, y), s = Math.sin(a), c = Math.cos(a);
  return out.set(Math.sign(s) * Math.abs(s) ** e * X, y, Math.sign(c) * Math.abs(c) ** e * Z + necklineBack(y));
}
/** how far inside the tunic lifted `lift` off it a point (chest joint space) is: under 1 inside, 1 on it */
function within(x: number, y: number, z: number, lift: number): number {
  const X = curve(TUNIC_W, y) + lift, Z = curve(TUNIC_D, y) + lift, e = curve(TUNIC_P, y);
  return Math.abs(x / X) ** e + Math.abs((z - necklineBack(y)) / Z) ** e;
}
/** the step `outOfTunic` reads the way out by (m) */
const OUT_STEP = 0.002;

/** the way out of the tunic lifted `lift` off it at `p`: `within`'s gradient (unnormalised) */
function outward(p: THREE.Vector3, lift: number, out: THREE.Vector3): THREE.Vector3 {
  const d = 2 * OUT_STEP;
  return out.set(
    (within(p.x + OUT_STEP, p.y, p.z, lift) - within(p.x - OUT_STEP, p.y, p.z, lift)) / d,
    (within(p.x, p.y + OUT_STEP, p.z, lift) - within(p.x, p.y - OUT_STEP, p.z, lift)) / d,
    (within(p.x, p.y, p.z + OUT_STEP, lift) - within(p.x, p.y, p.z - OUT_STEP, lift)) / d,
  );
}
const _g = new THREE.Vector3();

/** the tunic's normal near `p` (chest joint space): what lies on it faces this way (a strap) */
export const tunicNormal = (p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 => outward(p, 0, out).normalize();

/** `p` (chest joint space) put out of the tunic lifted `lift` off it if it's inside, by Newton's steps along the way out
 *  of its surface (over the shoulders that's up their slope: put out across, cloth laid there slid off them); whether it
 *  was inside */
export function outOfTunic(p: THREE.Vector3, lift: number): boolean {
  if (p.y < TUNIC_Y[0] || p.y > TUNIC_Y[1]) return false;
  let v = within(p.x, p.y, p.z, lift);
  if (v >= 1) return false;
  for (let k = 0; k < 3 && v < 1; k++) {
    const g2 = outward(p, lift, _g).lengthSq();
    if (g2 < 1e-9) break;
    p.addScaledVector(_g, (1 - v) / g2);
    v = within(p.x, p.y, p.z, lift);
  }
  return true;
}
/** the point on the tunic's front `x` across */
export const tunicFront = (x: number, y: number, lift: number) => onTunic(Math.asin(clamp(Math.sign(x) * Math.abs(x / curve(TUNIC_W, y)) ** (curve(TUNIC_P, y) / 2), -1, 1)), y, lift);
/** the point on the tunic's back `x` across (+x his left) */
export const tunicBack = (x: number, y: number, lift: number) => onTunic(Math.PI - Math.asin(clamp(Math.sign(x) * Math.abs(x / curve(TUNIC_W, y)) ** (curve(TUNIC_P, y) / 2), -1, 1)), y, lift);
/** the rolled hem round the neckline */
export const neckHem = () => belt(0.0765, 0.0715, 0.297, 0.012, 0.006, 0, 28).translate(0, 0, necklineBack(0.297));

/** the armhole cut round each shoulder, in the tunic's own terms: its middle's height up the side (`y`), its half-width round
 *  the tunic (`A`, rad) and its half-height (`B`), from the shoulder's top over the joint down to the armpit, where the
 *  sleeve is set in (a sleeve's tube stood in a whole tunic: raised, it came out of the cloth over the shoulder as a tube
 *  stuck into the body) */
export const ARMHOLE = { y: 0.196, A: 0.4, B: 0.056 };
const H_TAU = Math.PI * 2;
/** side s's armhole (+1 his left) at `t` round it (0 its top, π/2 its front, π the armpit), as the tunic's angle round and
 *  height (`onTunic`'s) */
export const armholeAt = (s: number, t: number): [number, number] => [s * (Math.PI / 2 - ARMHOLE.A * Math.sin(t)), ARMHOLE.y + ARMHOLE.B * Math.cos(t)];
/** `n` points round side s's armhole on the tunic, `lift` off it */
export const armholeEdge = (s: number, n: number, lift = 0) => Array.from({ length: n }, (_, i) => onTunic(...armholeAt(s, i / n * H_TAU), lift));

/**
 * The tunic over the chest with each armhole cut out, as its left and right halves (split down the middle front and back):
 * each a grid laid out from its armhole, `around` points round the hole's edge (the sleeve's own, `setInSleeve` with as
 * many) and `rows` out from there to the half's edges (its middle front and back, the neckline and the foot), so the edge
 * it shares with the sleeve is the same points. Shaded with the surface's own normals (the same on both halves where they
 * meet). Its uvs run in metres / TILE, the right half's from the back's middle round to the front's, the left's on from
 * there. (A grid round the body with its points inside the hole moved out onto its edge folded its triangles over along
 * the seam, and the sleeve's top met it between their points: a jagged seam, with gaps)
 */
export function tunicCut(around: number, rows: number): [THREE.BufferGeometry, THREE.BufferGeometry] {
  return built(tunicCutSteps(around, rows));
}

/** `tunicCut` a piece at a time (models/steps.ts): its tables, then each half (the right first, as it was), the
 *  largest single call of a hero's build otherwise, 10 to 38 ms behind the lobby (`lab behind`). */
export function* tunicCutSteps(
  around: number, rows: number,
): Generator<void, [THREE.BufferGeometry, THREE.BufferGeometry], undefined> {
  // (laid out in the half's own terms with the angle round in metres at about the chest's width, about the hole's middle)
  const RW = 0.18, X = Math.PI / 2 * RW, Y0 = TUNIC_Y[0] - ARMHOLE.y, Y1 = TUNIC_Y[1] - ARMHOLE.y;
  const p = new THREE.Vector3(), q = new THREE.Vector3(), da = new THREE.Vector3(), dy = new THREE.Vector3();
  // uvs: arc length round the chest at the hole's height and up the front's middle, read at each point's place
  const NS = 128, su = [0], sv = [0], ys = Array.from({ length: NS + 1 }, (_, j) => TUNIC_Y[0] + (TUNIC_Y[1] - TUNIC_Y[0]) * j / NS);
  for (let i = 1; i <= NS; i++) su.push(su[i - 1] + onTunic(-Math.PI + i / NS * H_TAU, ARMHOLE.y, 0, p).distanceTo(onTunic(-Math.PI + (i - 1) / NS * H_TAU, ARMHOLE.y, 0, q)) / TILE);
  for (let j = 1; j <= NS; j++) sv.push(sv[j - 1] + onTunic(0, ys[j], 0, p).distanceTo(onTunic(0, ys[j - 1], 0, q)) / TILE);
  const at = (tab: number[], x: number) => { const i = Math.min(NS - 1, Math.max(0, Math.floor(x))); return tab[i] + (tab[i + 1] - tab[i]) * (x - i); };
  const uAt = (a: number) => at(su, (a + Math.PI) / H_TAU * NS), vAt = (y: number) => at(sv, (y - TUNIC_Y[0]) / (TUNIC_Y[1] - TUNIC_Y[0]) * NS);
  const half = (s: number): THREE.BufferGeometry => {
    // each column from the hole's edge straight out (in those terms) to where that line leaves the half
    const P: THREE.Vector3[][] = [], A: [number, number][][] = [];
    for (let i = 0; i < around; i++) {
      const [a0, y0] = armholeAt(s, i / around * H_TAU), ex = (s * a0 - Math.PI / 2) * RW, ey = y0 - ARMHOLE.y, l = Math.hypot(ex, ey), dx = ex / l, dyy = ey / l;
      const t = Math.min(dx > 1e-9 ? X / dx : dx < -1e-9 ? -X / dx : Infinity, dyy > 1e-9 ? Y1 / dyy : dyy < -1e-9 ? Y0 / dyy : Infinity);
      const col: THREE.Vector3[] = [], ac: [number, number][] = [];
      for (let k = 0; k <= rows; k++) {
        const f = (k / rows) ** 1.4, mx = ex + (dx * t - ex) * f, my = ey + (dyy * t - ey) * f;
        const a = s * (Math.PI / 2 + mx / RW), y = ARMHOLE.y + my;
        col.push(onTunic(a, y, 0)); ac.push([a, y]);
      }
      P.push(col); A.push(ac);
    }
    // the surface's own normal at each point, facing out
    const N = A.map((col, i) => col.map(([a, y], k) => {
      onTunic(a + 1e-3, y, 0, p); onTunic(a - 1e-3, y, 0, q); da.subVectors(p, q);
      onTunic(a, y + 1e-3, 0, p); onTunic(a, y - 1e-3, 0, q); dy.subVectors(p, q);
      const n = new THREE.Vector3().crossVectors(da, dy).normalize(), c = P[i][k];
      return n.dot(q.set(c.x, c.y - 0.1, c.z)) < 0 ? n.negate() : n;
    }));
    const pos: number[] = [], nrm: number[] = [], uv: number[] = [];
    const put = (i: number, k: number) => { const c = P[i % around][k], n = N[i % around][k], [a, y] = A[i % around][k]; pos.push(c.x, c.y, c.z); nrm.push(n.x, n.y, n.z); uv.push(uAt(a), vAt(y)); };
    for (let i = 0; i < around; i++) for (let k = 0; k < rows; k++) {
      // (wound to face the way its normals do)
      const c = P[i][k], e1 = q.subVectors(P[(i + 1) % around][k], c), e2 = da.subVectors(P[i][k + 1], c), out = dy.crossVectors(e1, e2).dot(N[i][k]) > 0;
      const quad: [number, number][] = out ? [[i, k], [i + 1, k], [i, k + 1], [i + 1, k], [i + 1, k + 1], [i, k + 1]] : [[i, k], [i, k + 1], [i + 1, k], [i + 1, k], [i, k + 1], [i + 1, k + 1]];
      for (const [ii, kk] of quad) put(ii, kk);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return g;
  };
  yield;
  const right = half(1);
  yield;
  return [right, half(-1)];
}

/**
 * A sleeve set into side s's armhole: its top the armhole's edge on the tunic, over the shoulder from there (carrying on the
 * tunic's own slope across the seam outside, straight in under the arm) onto a tube round the arm `join` below the shoulder
 * joint `S` (the chest's frame), and on down as `limb` is (`len`, radius `r0` to `r1`, a `bulge` at `at`, a rounded end).
 * `shape`: the arm in the sleeve, the tube's radius at `t` down it (0 the joint, 1 its end) and `phi` round it (0 its
 * outside, a quarter turn its front) as a share of the round one's (none: round). In the chest's frame, smooth-shaded all round; `capT` per vertex: 0 on the armhole's edge, 1 from the tube on; `seamY`:
 * the height of the point of the armhole's edge its column of the cap leaves from (the body's own point there).
 */
export function setInSleeve(s: number, S: THREE.Vector3, o: { len: number; r0: number; r1: number; bulge: number; at: number; join: number; joinIn?: number; full?: number; fullIn?: number; around?: number; cap?: number; tube?: number; shape?: (t: number, phi: number) => number }): THREE.BufferGeometry {
  const M = o.around ?? 32, NC = o.cap ?? 8, NT = o.tube ?? 14, NE = 4, full = o.full ?? 1.4;
  // (the tube's top ring lower under the arm, `joinIn` more: cut level, the cap's underside was a short flap folded in
  // under the armpit, stretched three times its length when the arm went up)
  const hj = (t: number) => o.join + (o.joinIn ?? 0) * (1 - Math.cos(t)) / 2;
  const rad = (h: number, phi = 0) => { const t = h / o.len; return (o.r0 + (o.r1 - o.r0) * t) * (1 + o.bulge * Math.exp(-(((t - o.at) / 0.28) ** 2))) * (o.shape?.(t, phi) ?? 1); };
  const rows: THREE.Vector3[][] = [], capT: number[] = [];
  const P0 = new THREE.Vector3(), P2 = new THREE.Vector3(), R = new THREE.Vector3(), m0 = new THREE.Vector3(), chord = new THREE.Vector3();
  const around = (h: number, phi: number, r: number) => new THREE.Vector3(S.x + s * Math.cos(phi) * r, S.y - h, S.z + Math.sin(phi) * r);
  // the cap: from the armhole's edge to the tube's top ring, a cubic leaving the edge along the tunic and reaching the ring going down
  const caps: THREE.Vector3[][] = [];
  for (let i = 0; i < M; i++) {
    const t = i / M * H_TAU, [a, y] = armholeAt(s, t);
    onTunic(a, y, 0, P0); onTunic(s * Math.PI / 2 + (a - s * Math.PI / 2) * 0.9, ARMHOLE.y + (y - ARMHOLE.y) * 0.9, 0, P2);
    R.copy(around(hj(t), t, rad(hj(t), t)));
    chord.subVectors(R, P0); const c = chord.length(); chord.divideScalar(c);
    // (all round on as the tunic runs, and under the arm turned over in the cap's first few centimetres down onto the arm: the
    // seam moves with the arm as the cloth either side of it does, so a fold at the seam stays one whatever the arm does,
    // and turned at the seam under the arm, raised it kept a crease there)
    const w = (1 + Math.cos(t)) / 2, fi = o.fullIn ?? full;
    m0.subVectors(P2, P0).normalize().multiplyScalar(c * (fi + (full - fi) * w));
    const col: THREE.Vector3[] = [];
    for (let k = 0; k <= NC; k++) {
      const u = k / NC, h00 = 2 * u ** 3 - 3 * u * u + 1, h10 = u ** 3 - 2 * u * u + u, h01 = -2 * u ** 3 + 3 * u * u, h11 = u ** 3 - u * u;
      col.push(new THREE.Vector3().addScaledVector(P0, h00).addScaledVector(m0, h10).addScaledVector(R, h01).add(new THREE.Vector3(0, -c, 0).multiplyScalar(h11)));
    }
    caps.push(col);
  }
  for (let k = 0; k <= NC; k++) { rows.push(caps.map((col) => col[k])); capT.push(k / NC); }
  // (the tube below the cap with a third as many points round it: only the seam needs the armhole's)
  const MT = Math.max(8, Math.round(M / 3));
  for (let r = 1; r <= NT; r++) { rows.push(Array.from({ length: MT }, (_, i) => { const t = i / MT * H_TAU, h = hj(t) + (o.len - hj(t)) * r / NT; return around(h, t, rad(h, t)); })); capT.push(1); }
  for (let e = 1; e <= NE; e++) { const q = e / NE * Math.PI / 2; rows.push(Array.from({ length: MT }, (_, i) => around(o.len + Math.sin(q) * o.r1 * 0.8, i / MT * H_TAU, Math.max(1e-4, Math.cos(q) * o.r1)))); capT.push(1); }
  // smooth normals round it (closed round), each row to the next as quads, or zipped where their counts differ
  const nr = rows.length, start: number[] = [], flat: number[] = [], frac: number[] = [], rowOf: number[] = [];
  for (let k = 0; k < nr; k++) { start.push(flat.length / 3); rows[k].forEach((v, i) => { flat.push(v.x, v.y, v.z); frac.push(i / rows[k].length); rowOf.push(k); }); }
  const tris: number[] = [];
  for (let k = 0; k + 1 < nr; k++) {
    const na = rows[k].length, nb = rows[k + 1].length, A = (i: number) => start[k] + (i % na), B = (j: number) => start[k + 1] + (j % nb);
    let i = 0, j = 0;
    while (i < na || j < nb) {
      if (j >= nb || (i < na && (i + 1) / na <= (j + 1) / nb)) { tris.push(A(i), B(j), A(i + 1)); i++; }
      else { tris.push(A(i), B(j), B(j + 1)); j++; }
    }
  }
  const g0 = new THREE.BufferGeometry();
  g0.setAttribute('position', new THREE.Float32BufferAttribute(flat, 3)); g0.setIndex(tris); g0.computeVertexNormals();
  const N = g0.attributes.normal;
  let facing = 0;
  for (let v = 0; v < N.count; v++) facing += N.getX(v) * (flat[v * 3] - S.x) + N.getZ(v) * (flat[v * 3 + 2] - S.z);
  const flip = facing < 0;
  // uvs: round the tube's top ring, and down the cap's columns' own lengths, then on down the tube
  const ring = 2 * Math.PI * rad(o.join) / TILE, down: number[][] = [];
  for (let i = 0; i < M; i++) { const col = [0]; for (let k = 1; k <= NC; k++) col.push(col[k - 1] + caps[i][k].distanceTo(caps[i][k - 1]) / TILE); down.push(col); }
  const vAt = (v: number) => {
    const k = rowOf[v], f = frac[v];
    if (k <= NC) return down[Math.round(f * M) % M][k];
    const i = f * M, i0 = Math.floor(i) % M, i1 = (i0 + 1) % M, end = down[i0][NC] + (down[i1][NC] - down[i0][NC]) * (i - Math.floor(i));
    return end + rows[k][Math.round(f * rows[k].length) % rows[k].length].distanceTo(rows[NC][Math.round(f * M) % M]) / TILE;
  };
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], ct: number[] = [], sy: number[] = [];
  for (let t = 0; t < tris.length; t += 3) {
    const vs = flip ? [tris[t], tris[t + 2], tris[t + 1]] : [tris[t], tris[t + 1], tris[t + 2]];
    // (a triangle across the seam round the back: its points past it counted on round from there)
    const fs = vs.map((v) => frac[v]), wrap = Math.max(...fs) - Math.min(...fs) > 0.5;
    vs.forEach((v, q) => {
      const f = flip ? -1 : 1;
      pos.push(flat[v * 3], flat[v * 3 + 1], flat[v * 3 + 2]); nrm.push(N.getX(v) * f, N.getY(v) * f, N.getZ(v) * f);
      uv.push((wrap && fs[q] < 0.5 ? fs[q] + 1 : fs[q]) * ring, vAt(v)); ct.push(capT[rowOf[v]]);
      sy.push(rowOf[v] <= NC ? caps[Math.round(frac[v] * M) % M][0].y : S.y);
    });
  }
  g0.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('capT', new THREE.Float32BufferAttribute(ct, 1));
  g.setAttribute('seamY', new THREE.Float32BufferAttribute(sy, 1));
  return g;
}

/** the cloth's share of the arm round each armhole (`share`, m in the chest's frame): `seam` on the armhole's edge, falling
 *  off to none `reach` from it (`top` above `topY`, under a strap over the shoulder), and the sleeve's rising from it to the
 *  whole arm's at its tube, `join` below the joint (`joinIn` more under the arm); `around` points round the armhole, the
 *  body's and the sleeve's the same; `bulk`, how much the cloth between swells with the arm raised level (a share of its
 *  size about the joint, none hanging); `over`, the seam's share cut above the joint too (`keep` of it lost, from `from`
 *  above the joint, wholly `depth` on): the top of the shoulder stays the chest's and a raised arm leaves it whole */
export type ArmBlend = { seam: number; reach: number; top: number; topY: number; join: number; joinIn: number; around: number; bulk?: number; over?: { keep: number; from: number; depth: number } };
const DOWN = new THREE.Vector3(0, -1, 0), _sw = new THREE.Vector3(), _tw = new THREE.Quaternion(), _tq = new THREE.Quaternion(), _p = new THREE.Vector3();
const smooth = (t: number) => t * t * (3 - 2 * t);
/** the cloth round the armhole under the shoulder joint: how much of the arm's share it keeps from going, wholly this far
 *  (m) below the joint */
const UNDER = { keep: 0.7, depth: 0.08 };

/**
 * A tunic's shoulders with the sleeves set in (`tunicCut`, `setInSleeve`): the cloth round each seam blended from the chest
 * to the arm through joints turned a quarter, half and three quarters as far as it (`delts`), so the body round the armhole
 * goes some way up with a raised arm and the sleeve comes out of it. A sleeve's tube stood in a whole coat: raised, it came
 * out of the cloth over the shoulder as a tube stuck into the body, and with the cloth over the deltoid blended straight
 * from the chest to the arm, the cloth between folded in on the joint in a lip round it. `bend()` each frame after the arms
 * are posed.
 */
export class SetInShoulders {
  /** each side's part-turned joints on the chest (+1 his left first) */
  readonly delts: THREE.Group[][];
  /** points round each armhole's edge, as many as the sleeve's top */
  readonly around: number;
  private readonly holes: THREE.Vector3[][];
  private readonly swings = [new THREE.Quaternion(), new THREE.Quaternion()];

  constructor(private readonly j: { chest: THREE.Object3D; shoulderL: THREE.Object3D; shoulderR: THREE.Object3D }, readonly K: ArmBlend, around: number) {
    this.delts = [j.shoulderL, j.shoulderR].map((sh) => [1, 2, 3].map((q) => {
      const d = joint(j.chest, ...(sh.position.toArray() as [number, number, number]));
      d.name = (sh === j.shoulderL ? 'deltL' : 'deltR') + q;
      return d;
    }));
    this.around = around;
    this.holes = [1, -1].map((s) => armholeEdge(s, around));
  }

  private shoulder(s: number): THREE.Object3D { return s > 0 ? this.j.shoulderL : this.j.shoulderR; }
  /** side s's shoulder joint at rest, in the chest's frame */
  restOf(s: number): THREE.Vector3 { return this.shoulder(s).userData.rest as THREE.Vector3; }
  /** the joints side s's cloth is blended along, from the chest to the shoulder (`Sculpt.skinChain`'s) */
  chainOf(s: number): THREE.Object3D[] { return [this.j.chest, ...this.delts[s > 0 ? 0 : 1], this.shoulder(s)]; }

  /** how far the cloth at `p` (the chest's frame, at rest) goes with the arm on side `s`, 0 to 1: less under the joint
   *  (`UNDER`), where the cloth stays with the chest as the arm rises (going with it half way, the cloth before the armpit
   *  swung out with a raised arm into a mound, a breast under it) */
  share(p: THREE.Vector3, s: number): number {
    let d = Infinity;
    for (const q of this.holes[s > 0 ? 0 : 1]) d = Math.min(d, p.distanceToSquared(q));
    const reach = this.K.reach + (this.K.top - this.K.reach) * smooth(clamp((p.y - this.K.topY) / 0.03, 0, 1));
    return this.seamShare(p.y, s) * (1 - smooth(clamp(Math.sqrt(d) / reach, 0, 1)));
  }

  /** the share of side s's arm the seam itself has at height `y` on the armhole's edge (the chest's frame). The body's
   *  cloth there and the sleeve's top are the same points, so both take it from here. (The body's alone was cut under the
   *  joint, `UNDER`, and the sleeve's top kept the whole of it: with an arm raised the sleeve's underside went up with it
   *  further than the armhole it's sewn into, and the seam opened round the armpit and behind the shoulder, the forest
   *  seen through the coat at every draw) */
  private seamShare(y: number, s: number): number {
    const o = this.K.over, dy = y - this.restOf(s).y;
    return this.K.seam * (1 - UNDER.keep * smooth(clamp(-dy / UNDER.depth, 0, 1))) * (o ? 1 - o.keep * smooth(clamp((dy - o.from) / o.depth, 0, 1)) : 1);
  }

  /** `g` (the chest's frame) given its vertices' shares of side s's arm as `skinK` */
  withArm(g: THREE.BufferGeometry, s: number): THREE.BufferGeometry {
    const p = g.attributes.position, k = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) k[i] = this.share(_p.fromBufferAttribute(p, i), s);
    g.setAttribute('skinK', new THREE.BufferAttribute(k, 1));
    return g;
  }

  /** side s's sleeve (`setInSleeve`, in the shoulder's frame), its `skinK` along the chain on to the elbow: from the
   *  seam's share at its edge (`seamShare`, the body's there) to the arm's wholly a little way down it, and over the elbow
   *  onto the forearm */
  sleeve(s: number, o: { len: number; r0: number; r1: number; bulge: number; at: number; full?: number; fullIn?: number; cap?: number; tube?: number; shape?: (t: number, phi: number) => number }): THREE.BufferGeometry {
    const at = this.restOf(s);
    const g = setInSleeve(s, at, { ...o, join: this.K.join, joinIn: this.K.joinIn, around: this.around }).translate(-at.x, -at.y, -at.z);
    const p = g.attributes.position, c = g.attributes.capT, y = g.attributes.seamY, k = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) {
      const e = smooth(clamp((-p.getY(i) - 0.2) / 0.13, 0, 1)), seam = this.seamShare(y.getX(i), s);
      k[i] = (seam + (1 - seam) * smooth(c.getX(i))) * 4 / 5 + e / 5;
    }
    g.setAttribute('skinK', new THREE.BufferAttribute(k, 1));
    return g;
  }

  /** each shoulder's part-turned joints: a quarter, half and three quarters of the arm's swing from hanging and of the
   *  girdle's move, and less of its turn about its own length (the square of that share: the cloth round the armhole
   *  barely turns with it), swelled by `bulk` as the arm rises, most at the middle one, as a deltoid bunches (the
   *  armhole, a tall oval, lay along an arm raised forward: the cloth where the sleeve left the coat went thin, the
   *  shoulder squashed). Near straight up the swing's axis is anyone's, so it's kept as it was */
  bend(): void {
    for (let i = 0; i < 2; i++) {
      const sh = this.shoulder(i ? -1 : 1), swing = this.swings[i];
      _sw.set(0, -1, 0).applyQuaternion(sh.quaternion);
      if (_sw.dot(DOWN) > -0.995) swing.setFromUnitVectors(DOWN, _sw);
      // (what's left of its turn once swung: about its own length)
      _tw.copy(swing).invert().multiply(sh.quaternion);
      _tw.x = 0;
      _tw.z = 0;
      _tw.normalize();
      // (how far up the arm is: none hanging, whole level and above)
      const up = Math.min(1, (1 + _sw.y) ** 2), bulk = this.K.bulk ?? 0;
      this.delts[i].forEach((d, q) => {
        const f = (q + 1) / 4;
        d.quaternion.identity().slerp(swing, f).multiply(_tq.identity().slerp(_tw, f * f));
        d.position.lerpVectors(sh.userData.rest, sh.position, f);
        d.scale.setScalar(1 + bulk * up * 4 * f * (1 - f));
      });
    }
  }
}
