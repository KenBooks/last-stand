// `lab scholar`: Brother Hollis's forearms in his robe's sleeves (`src/entities/models/scholar.ts` `dressBells`,
// `FORE_SLEEVE`, `sleevesFall`). From play: "the arm/hand is outside of sleeve": his hand raised, holding a book up, the
// wide bell hung below and apart from his forearm, the forearm and its white undersleeve running out beside the cloth.
// Read here, each frame: each forearm leaves its sleeve through the sleeve's mouth.

import * as THREE from 'three';
import type { Scholar } from '../../../src/entities/models/scholar';

/** how far from its mouth's middle a forearm may cross the mouth (a share of the mouth's radius): inside its ring, with
 *  the arm's own thickness to spare */
export const MOUTH_MOST = 0.75;

/** each side's forearm's sleeve as drawn now (sat or standing, whichever shows) */
function sleevesShown(s: Scholar): { side: string; sleeve: THREE.Mesh; elbow: THREE.Object3D; hand: THREE.Object3D }[] {
  const out: { side: string; sleeve: THREE.Mesh; elbow: THREE.Object3D; hand: THREE.Object3D }[] = [];
  for (const side of ['L', 'R'] as const) {
    const elbow = s.root.getObjectByName(`scholar elbow${side}`)!, hand = s.root.getObjectByName(`scholar hand${side}`)!;
    const sleeve = elbow.children.find((m) => /^scholar bell( standing)?$/.test(m.name) && m.visible) as THREE.Mesh | undefined;
    if (sleeve) out.push({ side: side === 'L' ? 'left' : 'right', sleeve, elbow, hand });
  }
  return out;
}

/**
 * Each forearm against its sleeve's mouth: where the line from its elbow to its wrist crosses the plane of the mouth (its
 * lathe's first ring, `sleeve`'s `rim`), how far that is from the ring's middle as a share of its radius (0 at its
 * middle, 1 on the ring, more outside it). The worst of the two, and which; with `tip`, each sleeve tipped down by that
 * much more about its elbow for the reading (a canary: the wide bell's hang, as it was).
 */
export function mouthRead(s: Scholar, tip = 0): { off: number; side: string } {
  s.root.updateMatrixWorld(true);
  let off = 0, side = '';
  const ring: THREE.Vector3[] = [], centre = new THREE.Vector3(), elbowAt = new THREE.Vector3(), wristAt = new THREE.Vector3();
  for (const arm of sleevesShown(s)) {
    const was = arm.sleeve.quaternion.clone();
    if (tip) { arm.sleeve.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), tip)); arm.sleeve.updateMatrixWorld(true); }
    const lathe = arm.sleeve.geometry as THREE.LatheGeometry, rows = lathe.parameters.points.length, sides = lathe.parameters.segments;
    const pos = arm.sleeve.geometry.attributes.position;
    ring.length = 0;
    centre.set(0, 0, 0);
    for (let k = 0; k < sides; k++) {
      const p = new THREE.Vector3().fromBufferAttribute(pos, k * rows).applyMatrix4(arm.sleeve.matrixWorld);
      ring.push(p);
      centre.add(p);
    }
    centre.divideScalar(ring.length);
    const radius = ring.reduce((sum, p) => sum + p.distanceTo(centre), 0) / ring.length;
    // (the mouth's plane: through its middle, square to the way down its sleeve)
    const normal = new THREE.Vector3(0, -1, 0).transformDirection(arm.sleeve.matrixWorld);
    arm.elbow.getWorldPosition(elbowAt);
    arm.hand.getWorldPosition(wristAt);
    const way = wristAt.clone().sub(elbowAt), across = way.dot(normal);
    if (tip) { arm.sleeve.quaternion.copy(was); arm.sleeve.updateMatrixWorld(true); }
    if (Math.abs(across) < 1e-6) continue;
    const t = centre.clone().sub(elbowAt).dot(normal) / across;
    const at = elbowAt.clone().addScaledVector(way, t);
    const share = at.distanceTo(centre) / radius;
    if (share > off) { off = share; side = arm.side; }
  }
  return { off, side };
}

/** how far out through its forearm's sleeve his undersleeve's linen may show above the sleeve's cuff (m), and how far
 *  above the mouth the cuff is (m: the linen shows inside the mouth, at the wrist) */
export const LINEN_OUT_MOST = 0.002;
const CUFF = 0.03;

/** how far a point (in a lathe sleeve's own frame) lies outside its cloth at its height (m, 0 inside or off its ends) */
function outsideOf(lathe: THREE.Mesh, q: THREE.Vector3): number {
  const geo = lathe.geometry as THREE.LatheGeometry, rows = geo.parameters.points.length, sides = geo.parameters.segments;
  const at = geo.attributes.position;
  let j = -1;
  for (let k = 0; k + 1 < rows; k++) if (q.y >= at.getY(k) && q.y <= at.getY(k + 1)) { j = k; break; }
  if (j < 0) return 0;
  const f = (q.y - at.getY(j)) / (at.getY(j + 1) - at.getY(j));
  const ring: THREE.Vector2[] = [];
  for (let i = 0; i <= sides; i++) {
    const a = i * rows + j, b = a + 1;
    ring.push(new THREE.Vector2(at.getX(a) + (at.getX(b) - at.getX(a)) * f, at.getZ(a) + (at.getZ(b) - at.getZ(a)) * f));
  }
  let inside = false, near = Infinity;
  const p = new THREE.Vector2(q.x, q.z), d = new THREE.Vector2(), foot = new THREE.Vector2();
  for (let i = 0; i < sides; i++) {
    const a = ring[i], b = ring[i + 1];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < a.x + ((p.y - a.y) / (b.y - a.y)) * (b.x - a.x)) inside = !inside;
    d.subVectors(b, a);
    const u = Math.max(0, Math.min(1, p.clone().sub(a).dot(d) / d.lengthSq()));
    near = Math.min(near, foot.copy(a).addScaledVector(d, u).distanceTo(p));
  }
  return inside ? 0 : near;
}

/** How far his undersleeve's linen comes out through his forearm's sleeve above its cuff (m), at the worst, and which:
 *  its points read in the sleeve's own frame against its rings; `at` how far above the mouth the worst is (m). From play: "the arm/hand is outside of sleeve", the white
 *  undersleeve running out beside the cloth. */
export function linenOut(s: Scholar): { out: number; side: string; at: number } {
  s.root.updateMatrixWorld(true);
  let out = 0, side = '', at = 0;
  const q = new THREE.Vector3(), m = new THREE.Matrix4();
  for (const arm of sleevesShown(s)) {
    const linen = arm.elbow.children.find((o) => o.name === 'scholar undersleeve') as THREE.Mesh | undefined;
    if (!linen) continue;
    const mouth = (arm.sleeve.geometry as THREE.LatheGeometry).parameters.points[0].y;
    m.copy(arm.sleeve.matrixWorld).invert().multiply(linen.matrixWorld);
    const pos = linen.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 2) {
      q.fromBufferAttribute(pos, i).applyMatrix4(m);
      if (q.y < mouth + CUFF) continue;
      const d = outsideOf(arm.sleeve, q);
      if (d > out) { out = d; side = arm.side; at = q.y - mouth; }
    }
  }
  return { out, side, at };
}
