// A hero's trousers, shaped as the body in them: one surface a leg from the waist to the ankle, the seat and hips
// running into the thigh, the thigh tapering to the knee, a calf, and the cloth's own marks (folds round the knee, a
// roll where it's tucked into the boot, a welted seam down the outside). Skinned down the leg's chain, hips to ankle,
// so nothing opens at a joint. (Two round-topped tubes hung from the hip joints, with no pelvis between them, were
// "logs", and the world showed between their tops under the belt: #520, #346.)
import * as THREE from 'three';
import { strap, lod, heroDetail, TILE } from './armor';
import { curve, type Keys } from './motion';
import { clamp, lerp } from '../../util';
import type { Joints } from './rig';
import type { Sculpt } from './shapes';

/** A pair of trousers' cut (m), on a rig's own hips and legs. Heights `y` are in the hips' frame at rest. */
export interface TrouserCut {
  /** the top, inside what's worn over the waist, and its half-width and half-depth there */
  top: number; waistW: number; waistD: number;
  /** the hips' half-width at their widest (about the hip joints' height) */
  hipW: number;
  /** the body's depth ahead of the hips' middle, and behind it at the seat's fullest */
  front: number; seat: number;
  /** the crotch's height (under the hip joints: a man's is about 9 cm) */
  crotch: number;
  /** the thigh's radius at its middle, the knee's, the calf's at its fullest and the ankle's */
  thigh: number; knee: number; calf: number; ankle: number;
  /** below the knee, where the cloth goes into a boot (m under the knee; none: it hangs to the ankle) */
  tuck?: number;
  /** how deep the folds round the knee are, at most (0: none) */
  folds: number;
}

const smooth = (a: number, b: number, x: number): number => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const bump = (x: number, at: number, wide: number): number => Math.exp(-(((x - at) / wide) ** 2));
/** `|x|` to the power `p`, with x's sign: an ellipse squared off a little, as a pelvis is */
const spow = (x: number, p: number): number => Math.sign(x) * Math.abs(x) ** p;

/** A leg of the cut as a surface and how each point of it follows the chain hips, thigh, knee, ankle. */
class Leg {
  /** the hip joint in the hips' frame, the knee's and the ankle's heights there */
  readonly hx: number; readonly hy: number; readonly kneeY: number; readonly ankleY: number;
  private readonly hw: Keys; private readonly back: Keys; private readonly fore: Keys;
  private readonly rSide: Keys; private readonly rFront: Keys; private readonly rBack: Keys; private readonly cx: Keys;

  constructor(j: Joints, private readonly cut: TrouserCut, private readonly side: number) {
    this.hx = Math.abs(j.thighL.position.x); this.hy = j.thighL.position.y;
    this.kneeY = this.hy - j.P.thighL; this.ankleY = this.kneeY - j.P.shinL;
    const c = cut, hy = this.hy, k = this.kneeY, a = this.ankleY, mid = lerp(c.crotch, k, 0.42);
    // the pelvis from the waist down to the crotch: its half-width, and its depth behind (the seat) and ahead
    this.hw = [[c.crotch, c.hipW], [hy - 0.04, c.hipW], [hy + 0.03, lerp(c.waistW, c.hipW, 0.45)], [hy + 0.07, c.waistW], [c.top, c.waistW * 0.96]];
    this.back = [[c.crotch - 0.01, c.seat * 0.9], [hy - 0.05, c.seat], [hy + 0.01, lerp(c.waistD, c.seat, 0.7)], [hy + 0.07, c.waistD], [c.top, c.waistD * 0.96]];
    this.fore = [[c.crotch, c.front * 0.95], [hy, c.front], [hy + 0.07, c.waistD], [c.top, c.waistD * 0.96]];
    // the leg below it: its middle (the thigh's top reaches the body's middle, and leans out to the knee over the
    // rig's own upright leg), and its radius to the side, ahead (the thigh's muscle, the kneecap, the shin) and behind
    // (the hamstrings, the knee's hollow, the calf)
    const top = (c.hipW - 0.004) / 2, calfY = k - 0.13;
    this.cx = [[a, this.hx], [k, this.hx], [mid, lerp(top, this.hx, 0.75)], [c.crotch, top]];
    this.rSide = [[a, c.ankle], [k - 0.3, c.ankle * 1.08], [calfY, c.calf], [k - 0.045, c.knee * 0.97], [k, c.knee], [mid, c.thigh], [c.crotch, top + 0.004]];
    this.rFront = [[a, c.ankle * 1.05], [calfY, c.calf * 0.92], [k - 0.05, c.knee * 0.98], [k, c.knee * 1.06], [k + 0.07, c.knee * 1.04], [mid, c.thigh * 1.08], [c.crotch, c.front * 0.95]];
    this.rBack = [[a, c.ankle * 1.1], [k - 0.3, c.ankle * 1.2], [calfY, c.calf * 1.16], [k - 0.03, c.knee * 0.9], [k + 0.03, c.knee * 0.9], [mid, c.thigh * 1.02], [c.crotch - 0.01, c.seat * 0.9]];
  }

  /** The point at angle `a` round the leg (0 its outside, a quarter turn its front) and height `y`, `off` out of
   *  the surface, in the hips' frame. */
  at(a: number, y: number, out: THREE.Vector3, off = 0): THREE.Vector3 {
    const c = this.cut, ca = Math.cos(a), sa = Math.sin(a);
    // the leg's own section: an ellipse, deeper ahead or behind
    const r = (sa > 0 ? curve(this.rFront, y) : curve(this.rBack, y)) + this.cloth(a, y) + off, rs = curve(this.rSide, y) + this.cloth(a, y) + off;
    let x = curve(this.cx, y) + rs * ca, z = r * sa;
    // above the crotch the two legs are one body: this leg's outer half is its half of the pelvis's section, its
    // inner half the body's middle (a little past it, into the other leg's)
    const body = smooth(c.crotch - 0.05, c.crotch + 0.012, y);
    if (body > 0) {
      const hw = curve(this.hw, y) + off, fore = curve(this.fore, y) + off, back = curve(this.back, y) + off;
      let bx: number, bz: number;
      if (ca >= 0) {
        bx = hw * spow(ca, 0.8);
        // (the seat's cleft: shallower at the middle than under each side, below the hip joints)
        const cleft = 1 - 0.1 * bump(bx, 0, 0.035) * smooth(this.hy + 0.02, this.hy - 0.04, y);
        bz = sa > 0 ? fore * spow(sa, 0.8) : back * cleft * spow(sa, 0.8);
      } else { bx = 0.006 * ca; bz = sa > 0 ? fore * sa : back * 0.9 * sa; }
      x = lerp(x, bx, body); z = lerp(z, bz, body);
    }
    return out.set(this.side * x, y, z);
  }

  /** the cloth's own shape over the body at a point (m out of it): the folds round the knee, winding a little as
   *  they go round, deepest behind it, and the roll over a boot's top */
  private cloth(a: number, y: number): number {
    const c = this.cut, k = this.kneeY;
    let d = 0;
    if (c.folds > 0) {
      const round = 0.65 - 0.35 * Math.sin(a);
      d += c.folds * round * bump(y, k + 0.005, 0.07) * Math.sin(((y - k) / 0.044) * Math.PI * 2 + 1.2 * Math.sin(a + 0.6));
    }
    if (c.tuck !== undefined) d += 0.009 * bump(y, k - c.tuck + 0.035, 0.022) - 0.004 * smooth(k - c.tuck + 0.012, k - c.tuck - 0.01, y);
    return d;
  }

  /** How far down the chain a point follows (0 the hips, a third the thigh, two thirds the shin, 1 the foot). */
  share(x: number, y: number): number {
    const c = this.cut, ax = Math.abs(x);
    if (y > this.kneeY + 0.12) {
      // the hips into the thigh: by height, and above the crotch the body's middle keeps to the hips
      const inner = lerp(smooth(0.0, 0.085, ax), 1, smooth(c.crotch + 0.02, c.crotch - 0.07, y));
      return (smooth(this.hy + 0.05, c.crotch - 0.05, y) * inner) / 3;
    }
    if (y > this.kneeY - 0.14) return (1 + smooth(this.kneeY + 0.08, this.kneeY - 0.09, y)) / 3;
    return (2 + smooth(this.ankleY + 0.11, this.ankleY, y)) / 3;
  }

  /** `geo` (in the hips' frame, lying on the leg) given each point's share of the chain */
  weigh(geo: THREE.BufferGeometry): THREE.BufferGeometry {
    const p = geo.attributes.position, k = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) k[i] = this.share(p.getX(i), p.getY(i));
    geo.setAttribute('skinK', new THREE.BufferAttribute(k, 1));
    return geo;
  }

  /** the heights of the surface's rows, top to bottom: close together where the cloth folds */
  rows(): number[] {
    const c = this.cut, k = this.kneeY, fine = heroDetail() >= 0.5, ys: number[] = [];
    const run = (from: number, to: number, step: number) => { const n = Math.max(1, Math.round((from - to) / step)); for (let i = 0; i < n; i++) ys.push(lerp(from, to, i / n)); };
    run(c.top, c.crotch + 0.012, fine ? 0.035 : 0.06);
    run(c.crotch + 0.012, c.crotch - 0.06, fine ? 0.024 : 0.036);
    run(c.crotch - 0.06, k + 0.1, fine ? 0.05 : 0.09);
    const end = c.tuck === undefined ? k - 0.1 : k - c.tuck - 0.02;
    run(k + 0.1, end, fine && (c.folds > 0 || c.tuck !== undefined) ? 0.011 : 0.04);
    run(end, this.ankleY, fine ? 0.07 : 0.15);
    ys.push(this.ankleY);
    return ys;
  }

  /** the surface: a grid round the leg and down it, facing out, its seam down the inside */
  surface(): THREE.BufferGeometry {
    const segs = lod(20, 12), ys = this.rows(), nu = segs + 1, p = new THREE.Vector3();
    const pos = new Float32Array(nu * ys.length * 3), uv = new Float32Array(nu * ys.length * 2), index: number[] = [];
    for (let r = 0; r < ys.length; r++) for (let q = 0; q < nu; q++) {
      const i = r * nu + q;
      this.at(Math.PI + (q / segs) * Math.PI * 2, ys[r], p).toArray(pos, i * 3);
      uv[i * 2] = (q / segs) * 2; uv[i * 2 + 1] = ys[r] / TILE;
    }
    for (let r = 0; r + 1 < ys.length; r++) for (let q = 0; q < segs; q++) {
      const a = r * nu + q, b = a + 1, d = a + nu, e = d + 1;
      if (this.side > 0) index.push(a, b, d, b, e, d); else index.push(a, d, b, b, d, e);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(index);
    g.computeVertexNormals();
    // the grid's two edges are one line down the inside of the leg: one normal for both. And where the two legs
    // are one body, the line they meet on (the body's middle, ahead and behind) points straight ahead or back:
    // each half's own normal there leans in towards the other, a groove down the middle
    const n = g.attributes.normal as THREE.BufferAttribute, m = new THREE.Vector3(), o = new THREE.Vector3();
    const quarter = segs / 4;
    for (let r = 0; r < ys.length; r++) {
      const a = r * nu, b = a + segs;
      m.fromBufferAttribute(n, a).add(o.fromBufferAttribute(n, b)).normalize();
      n.setXYZ(a, m.x, m.y, m.z); n.setXYZ(b, m.x, m.y, m.z);
      const body = smooth(this.cut.crotch - 0.01, this.cut.crotch + 0.03, ys[r]);
      if (body > 0 && Number.isInteger(quarter)) for (const q of [quarter, segs - quarter]) {
        m.fromBufferAttribute(n, a + q); m.x = lerp(m.x, 0, body); m.normalize();
        n.setXYZ(a + q, m.x, m.y, m.z);
      }
    }
    return this.weigh(g);
  }

  /** a welted seam down the outside of the leg, from the hip to the knee's folds and on to the boot or the ankle */
  seam(): THREE.BufferGeometry {
    const c = this.cut, to = c.tuck === undefined ? this.ankleY + 0.04 : this.kneeY - c.tuck + 0.05, from = this.hy + 0.02, n = lod(22, 8);
    const pts = Array.from({ length: n + 1 }, (_, i) => this.at(-0.12, lerp(from, to, i / n), new THREE.Vector3(), -0.0012));
    const out = (_: THREE.Vector3, o: THREE.Vector3) => o.set(this.side, 0, -0.12).normalize();
    return this.weigh(strap(pts, 0.009, 0.0034, false, out, n));
  }
}

/**
 * The trousers built on a rig's hips and legs: `cloth` each leg's surface, `welt` the seams down their outsides.
 * Each leg is one piece skinned from the hips to its ankle.
 */
export function buildTrousers(S: Sculpt, j: Joints, cut: TrouserCut, cloth: THREE.Material, welt: THREE.Material = cloth): void {
  for (const [side, th, kn, an] of [[1, j.thighL, j.kneeL, j.ankleL], [-1, j.thighR, j.kneeR, j.ankleR]] as const) {
    const leg = new Leg(j, cut, side), chain = [j.hips, th, kn, an];
    S.skinChain(leg.surface(), cloth, j.hips, chain);
    if (heroDetail() >= 0.5) S.skinChain(leg.seam(), welt, j.hips, chain);
  }
}
