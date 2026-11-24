// A tall leather riding boot (the ranger's): its foot sculpted over a last (a rounded heel counter, the instep falling to
// a broad ball and a toe box lifted at its tip) on a welted sole with a stacked heel, its shaft up the shin to below the
// knee, bending with the ankle and creased where it bends, a cuff turned down at its top, and buckled straps round it.
import * as THREE from 'three';
import { Sculpt, lathe } from './shapes';
import { belt, buckle, lod } from './armor';
import { curve, type Keys } from './motion';
import { clamp, lerp, mulberry } from '../../util';

export interface BootMats { leather: THREE.Material; sole: THREE.Material; strap: THREE.Material; metal: THREE.Material }

/** the floor in the ankle's frame (the rig's `groundFeet` keeps the ankle that far above it) */
const FLOOR = -0.07;
/** the foot from the heel's back to the toe's tip (the ankle's frame, z forward), and along it (0 the heel, 1 the toe)
 *  its half-width, the sole's top and the upper's top */
const HEEL = -0.075, TOE = 0.235;
const HALF_W: Keys = [[0, 0.032], [0.1, 0.038], [0.3, 0.044], [0.55, 0.057], [0.7, 0.06], [0.86, 0.056], [0.95, 0.045], [1, 0.024]];
const BASE: Keys = [[0, FLOOR + 0.03], [0.3, FLOOR + 0.028], [0.42, FLOOR + 0.017], [0.85, FLOOR + 0.015], [1, FLOOR + 0.024]];
const TOP: Keys = [[0, 0.045], [0.22, 0.055], [0.36, 0.055], [0.5, 0.042], [0.64, 0.02], [0.78, 0.0], [0.9, -0.013], [1, -0.022]];
/** the shaft (the knee's frame): its radius down the shin, from under the cuff to inside the foot, and how much deeper than
 *  wide it is (round the calf) */
const SHAFT: [number, number][] = [[0.044, -0.45], [0.045, -0.42], [0.048, -0.37], [0.054, -0.3], [0.063, -0.22], [0.068, -0.15], [0.07, -0.09], [0.071, -0.07]];
const DEEP = 1.15;
/** the shaft's radius at y (the knee's frame) */
const shaftR = (y: number) => { for (let i = 1; i < SHAFT.length; i++) if (y <= SHAFT[i][1]) { const [r0, y0] = SHAFT[i - 1], [r1, y1] = SHAFT[i]; return lerp(r0, r1, clamp((y - y0) / (y1 - y0), 0, 1)); } return SHAFT[SHAFT.length - 1][0]; };

/** the boot's foot: a sphere's surface laid over the last, its poles at the heel and the toe, flat underneath (the
 *  tavern's keeper's too, models/keeper.ts) */
export function foot(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, lod(28, 12), lod(24, 10)), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), t = (1 - y) / 2, rho = Math.sqrt(Math.max(0, 1 - y * y));
    const a = Math.atan2(z, x), cx = Math.cos(a), cy = Math.sin(a), cap = rho ** 0.3;
    // (squarer than round across, flat where it meets the sole, and at the heel and the toe coming down onto it)
    const X = Math.sign(cx) * Math.abs(cx) ** 0.7, up = cy >= 0 ? 0.5 + 0.5 * cy ** 0.8 : 0.5 - 0.5 * Math.abs(cy) ** 0.25;
    const b = curve(BASE, t), top = curve(TOP, t);
    p.setXYZ(i, X * curve(HALF_W, t) * cap, b + up * (top - b) * cap, lerp(HEEL, TOE, t));
  }
  g.computeVertexNormals();
  return g;
}

/** the sole's outline round the foot, `out` past the upper (the welt), from `t0` to `t1` of the way along it */
export function sole(out: number, t0: number, t1: number, depth: number): THREE.BufferGeometry {
  const s = new THREE.Shape(), N = 14, at = (k: number) => lerp(t0, t1, k / N);
  const w = (t: number) => curve(HALF_W, t) + out, z = (t: number) => lerp(HEEL - out * 0.6, TOE + out * 0.6, t);
  // (round at the heel and the toe: the ends' points drawn in)
  const end = (k: number) => k === 0 || (k === N && t1 === 1) ? 0.6 : 1;
  s.moveTo(-w(at(0)) * end(0), z(at(0)));
  for (let k = 1; k <= N; k++) s.lineTo(-w(at(k)) * end(k), z(at(k)));
  for (let k = N; k >= 0; k--) s.lineTo(w(at(k)) * end(k), z(at(k)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1, curveSegments: 4 });
  // (the shape's y is the foot's z; extruded down from its top)
  return g.rotateX(Math.PI / 2).translate(0, FLOOR + depth + 0.002, 0);
}

/** the shaft, creased round the ankle where it bends (wavy folds, deepest in front over the instep) and a little uneven */
function shaft(seed: number): THREE.BufferGeometry {
  const rnd = mulberry(seed), ph = [rnd() * 6, rnd() * 6, rnd() * 6], g = lathe(SHAFT.slice(0, -1), lod(28, 12)), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(x, z);
    const env = Math.exp(-(((y + 0.38) / 0.05) ** 2)), slump = Math.exp(-(((y + 0.28) / 0.06) ** 2)), front = 0.45 + 0.55 * Math.max(0, Math.cos(a));
    const fold = Math.sin((y + 0.37) / 0.016 * Math.PI + 0.9 * Math.sin(2 * a + ph[0]) + 0.5 * Math.sin(5 * a + ph[1]));
    const sag = Math.sin((y + 0.28) / 0.024 * Math.PI + 1.4 * Math.sin(3 * a + ph[1]) + 0.7 * Math.sin(7 * a + ph[2]));
    const k = 1 + 0.1 * env * front * Math.sign(fold) * Math.abs(fold) ** 0.6 + 0.04 * slump * sag + 0.012 * Math.sin(3 * a + ph[2] + y * 20);
    p.setXYZ(i, x * k, y, z * k * DEEP);
  }
  g.computeVertexNormals();
  return g;
}

/** the cuff: the shaft's top turned down over itself, its fold a rounded lip, its edge a little wavy */
function cuff(seed: number): THREE.BufferGeometry {
  const rnd = mulberry(seed), ph = rnd() * 6;
  const g = lathe([[0.074, -0.135], [0.078, -0.125], [0.081, -0.095], [0.084, -0.06], [0.083, -0.049], [0.078, -0.042], [0.072, -0.045], [0.07, -0.06], [0.07, -0.085]], lod(28, 12)), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(x, z);
    const k = 1 + 0.03 * Math.sin(4 * a + ph) * clamp((-0.075 - y) / 0.06, 0, 1) + 0.012 * Math.sin(7 * a + ph * 2);
    p.setXYZ(i, x * k, y + (0.006 * Math.sin(3 * a + ph) + 0.003 * Math.sin(8 * a + ph * 3)) * clamp((-0.105 - y) / 0.03, 0, 1), z * k * DEEP);
  }
  g.computeVertexNormals();
  return g;
}

/** a strap round the boot with its buckle on the outer side (`side`: +1 the left boot, whose outer side is +x) */
function strap(S: Sculpt, m: BootMats, j: THREE.Object3D, rx: number, rz: number, y: number, tilt: number, side: number, c: [number, number, number] = [0, 0, 0]): void {
  S.add(belt(rx, rz, y, 0.025, 0.006, tilt, lod(28, 12)), m.strap, j, c);
  // (the buckle on the outer side, its frame standing on the strap, the tongue's end past it)
  const by = y, bx = side * (rx + 0.004);
  S.add(buckle(0.026, 0.032, 0.005), m.metal, j, [c[0] + bx, c[1] + by, c[2]], [0, side * Math.PI / 2, 0]);
  S.add(new THREE.BoxGeometry(0.005, 0.021, 0.035), m.strap, j, [c[0] + side * (rx + 0.004), c[1] + by, c[2] - 0.026]);
}

/** One boot on a leg: the foot on its ankle, the shaft and cuff on its knee (the shaft's foot skinned to the ankle).
 *  `side` +1 the left leg. */
export function buildBoot(S: Sculpt, m: BootMats, knee: THREE.Object3D, ankle: THREE.Object3D, side: number): void {
  const seed = side > 0 ? 11 : 23;
  S.skin(shaft(seed), m.leather, knee, ankle, 0.35, 0.42);
  S.add(cuff(seed + 1), m.leather, knee);
  for (const y of [-0.15, -0.27]) strap(S, m, knee, shaftR(y) + 0.004, (shaftR(y) + 0.004) * DEEP, y, 0, side);
  S.add(foot(), m.leather, ankle);
  // the welted sole and the heel stacked under it
  S.add(sole(0.005, 0, 1, 0.012), m.sole, ankle);
  S.add(sole(0.002, 0, 0.3, 0.026), m.sole, ankle);
  // the ankle strap, over the instep and round above the heel
  strap(S, m, ankle, 0.05, 0.068, 0.004, -0.02, side, [0, 0, -0.008]);
}
