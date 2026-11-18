// A body's ranges of motion, and the hero rig's joints measured the way a clinician measures them (degrees), so a pose
// or an IK solution can be checked against what a body can do. The ranges are the usual adult norms (AAOS). The rig's
// rest pose is standing with the arms hanging, the palms facing back (the forearms turned fully over): a joint's rest
// frame lines up with its parent's, its bone along -Y, +X the character's left, +Z forward.
import * as THREE from 'three';
import type { Joints } from './rig';

/** `?rom=0` lets the joints go past their ranges again (the IK and the pose as they were), for A/B comparison */
export const ROM_ON = typeof location === 'undefined' || !/[?&]rom=0/.test(location.search);
const DEG = 180 / Math.PI;
const Y = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion(), _p = new THREE.Quaternion(), _t = new THREE.Quaternion(), _sw = new THREE.Quaternion(), _v = new THREE.Vector3();
const clamp1 = (x: number) => Math.max(-1, Math.min(1, x));
/** an angle (degrees) into -180..180 */
const wrap = (a: number) => a - 360 * Math.round(a / 360);

/** `q` = swing · twist, the twist about the unit `axis` (`q`'s own frame, applied first): its signed angle (rad); `swing` gets the rest */
export function twistAngle(q: THREE.Quaternion, axis: THREE.Vector3, swing?: THREE.Quaternion): number {
  const d = q.x * axis.x + q.y * axis.y + q.z * axis.z;
  _t.set(axis.x * d, axis.y * d, axis.z * d, q.w);
  if (_t.lengthSq() < 1e-12) _t.identity(); else _t.normalize();
  if (_t.w < 0) _t.set(-_t.x, -_t.y, -_t.z, -_t.w);
  if (swing) swing.copy(q).multiply(_p.copy(_t).invert());
  return 2 * Math.atan2(_t.x * axis.x + _t.y * axis.y + _t.z * axis.z, _t.w);
}

/** a swing (an axis across Y) as its rotations about X and Z (rad) */
function swingXZ(s: THREE.Quaternion): [number, number] {
  const w = s.w < 0 ? -s.w : s.w, k = s.w < 0 ? -1 : 1, half = Math.acos(Math.min(1, w)), sin = Math.sin(half);
  if (sin < 1e-9) return [0, 0];
  const a = 2 * half / sin;
  return [s.x * k * a, s.z * k * a];
}

/**
 * Each range (degrees): `[min, max]`. Signs: flexion, abduction, external rotation, pronation, radial deviation,
 * dorsiflexion and inversion positive; a twist or a side bend either way.
 */
export const ROM = {
  'shoulder.elevation': [0, 180], 'shoulder.rotation': [-80, 90],
  'elbow.flexion': [-10, 155], 'elbow.varus': [-15, 15],
  'forearm.pronation': [-90, 90],
  'wrist.flexion': [-70, 80], 'wrist.radial': [-30, 20],
  'hip.flexion': [-30, 125], 'hip.abduction': [-30, 45], 'hip.rotation': [-45, 45],
  'knee.flexion': [-5, 150], 'knee.twist': [-30, 30], 'knee.varus': [-10, 10],
  'ankle.dorsiflexion': [-50, 40], 'ankle.inversion': [-20, 35], 'ankle.twist': [-30, 30],
  'spine.flexion': [-30, 80], 'spine.side': [-35, 35], 'spine.rotation': [-50, 50],
  'neck.flexion': [-60, 50], 'neck.side': [-45, 45], 'neck.rotation': [-80, 80],
} as const;
export type RangeName = keyof typeof ROM;

/**
 * How high the upper arm can rise (degrees from hanging) by the plane it rises in (degrees: 0 out to the side, 90
 * forward, -90 back, 180 in across the body). Straight back it stops at 60; 45 behind the side it rises only to about
 * level (the shoulder's horizontal abduction); forward and to the side it goes overhead; in front across the chest it
 * reaches level 45 past the middle, and across the body low.
 */
const REACH: [number, number][] = [[-180, 30], [-90, 60], [-50, 100], [-35, 150], [-20, 180], [110, 180], [135, 140], [160, 60], [180, 30]];
export function elevationLimit(plane: number): number {
  for (let i = 1; i < REACH.length; i++) {
    const [a, la] = REACH[i - 1], [b, lb] = REACH[i];
    if (plane <= b) return la + (lb - la) * (plane - a) / (b - a);
  }
  return REACH[REACH.length - 1][1];
}

/** the upper arm (its turn on the chest, `q`): how high it is raised, in which plane, and its turn about itself (degrees) */
export function shoulderAngles(q: THREE.Quaternion, left: boolean): { elevation: number; plane: number; rotation: number; behind: number } {
  const d = _v.set(0, -1, 0).applyQuaternion(q);
  const lat = left ? d.x : -d.x;
  const tw = twistAngle(q, Y) * DEG;
  return { elevation: Math.acos(clamp1(-d.y)) * DEG, plane: Math.atan2(d.z, lat) * DEG, rotation: left ? tw : -tw, behind: Math.asin(Math.max(0, -d.z)) * DEG };
}

/** the upper arm's turn about itself (degrees): its range, wider outwards as it rises overhead (raised past level the arm turns out to clear the shoulder's roof) */
export function rotationRange(elevation: number): [number, number] {
  const [rmin, rmax] = ROM['shoulder.rotation'];
  return [rmin, rmax + 45 * Math.max(0, Math.min(1, (elevation - 90) / 90))];
}

/**
 * How far (degrees) the upper arm turned `q` on the chest is outside a shoulder's range: 0 inside. `protract`: the
 * girdle's forward turn (anatomy's `GIRDLE`); drawn back, the shoulder blade carries the socket round towards the
 * spine, and the arm reaches that much further behind the body (an archer's draw elbow, `RETRACT_REACH`).
 */
export function shoulderExcess(q: THREE.Quaternion, left: boolean, protract = 0): number {
  const a = shoulderAngles(q, left), [rmin, rmax] = rotationRange(a.elevation);
  // (near straight up the plane is meaningless)
  const lim = a.elevation > 165 ? 185 : elevationLimit(a.plane + RETRACT_REACH * Math.max(0, -protract));
  return Math.max(0, a.elevation - lim) + Math.max(0, rmin - a.rotation, a.rotation - rmax);
}

/** every angle of the body, by name (`shoulderL.elevation`...) */
export type BodyAngles = Record<string, number>;

const rel = (a: THREE.Object3D, b: THREE.Object3D, out: THREE.Quaternion) => out.copy(a.getWorldQuaternion(_p).invert()).multiply(b.getWorldQuaternion(_sw));

/**
 * Measure the body: each joint's angles against its parent (the arm against the chest, the head against the chest,
 * the chest against the pelvis...). `hands` are the posed hands' turned nodes when a model turns them (`Hand.vis`).
 * Call with the world matrices up to date.
 */
export function measureBody(j: Joints, hands?: { L?: THREE.Object3D; R?: THREE.Object3D }): BodyAngles {
  const out: BodyAngles = {};
  const q = new THREE.Quaternion(), s = new THREE.Quaternion();
  for (const side of ['L', 'R'] as const) {
    const left = side === 'L', sh = j[`shoulder${side}`], el = j[`elbow${side}`], hand = hands?.[side] ?? j[`hand${side}`];
    const th = j[`thigh${side}`], kn = j[`knee${side}`], an = j[`ankle${side}`];
    const a = shoulderAngles(rel(j.chest, sh, q), left);
    out[`shoulder${side}.elevation`] = a.elevation; out[`shoulder${side}.plane`] = a.plane; out[`shoulder${side}.rotation`] = a.rotation; out[`shoulder${side}.behind`] = a.behind;
    out[`shoulder${side}.excess`] = shoulderExcess(q, left);
    // the elbow: a hinge (its turn about the forearm is the forearm's)
    const te = twistAngle(rel(sh, el, q), Y, s);
    const [ex, ez] = swingXZ(s);
    out[`elbow${side}.flexion`] = -ex * DEG; out[`elbow${side}.varus`] = (left ? ez : -ez) * DEG;
    // the forearm turns over above the wrist, the wrist bends in the turned frame (q = twist · swing)
    rel(el, hand, q);
    const th0 = twistAngle(_q.copy(q).invert(), Y, s);
    const tw = wrap((te - th0) * DEG);
    out[`forearm${side}.pronation`] = wrap(left ? 90 - tw : 90 + tw);
    // (the swing in the hand's frame: q = twist · swing, so swing = twist⁻¹ q)
    s.setFromAxisAngle(Y, th0).multiply(q);
    const [wx, wz] = swingXZ(s);
    out[`wrist${side}.flexion`] = wx * DEG; out[`wrist${side}.radial`] = (left ? -wz : wz) * DEG;
    // the hip: the thigh against the pelvis
    rel(j.hips, th, q);
    const d = _v.set(0, -1, 0).applyQuaternion(q);
    out[`hip${side}.flexion`] = Math.atan2(d.z, -d.y) * DEG; out[`hip${side}.abduction`] = Math.asin(clamp1(left ? d.x : -d.x)) * DEG;
    const tt = twistAngle(q, Y) * DEG;
    out[`hip${side}.rotation`] = left ? -tt : tt;
    const tk = twistAngle(rel(th, kn, q), Y, s) * DEG, [kx, kz] = swingXZ(s);
    out[`knee${side}.flexion`] = kx * DEG; out[`knee${side}.twist`] = tk; out[`knee${side}.varus`] = (left ? kz : -kz) * DEG;
    const ta = twistAngle(rel(kn, an, q), Y, s) * DEG, [ax, az] = swingXZ(s);
    out[`ankle${side}.dorsiflexion`] = -ax * DEG; out[`ankle${side}.inversion`] = (left ? -az : az) * DEG; out[`ankle${side}.twist`] = ta;
  }
  for (const [name, a, b] of [['spine', j.hips, j.chest], ['neck', j.chest, j.head]] as const) {
    const t = twistAngle(rel(a, b, q), Y, s) * DEG, [x, z] = swingXZ(s);
    out[`${name}.flexion`] = x * DEG; out[`${name}.side`] = z * DEG; out[`${name}.rotation`] = t;
  }
  return out;
}

/**
 * The shoulder girdle: the collarbone turning about the top of the breastbone carries the shoulder joint up and down
 * (elevation; a shrug) and forward and back round the chest (protraction; back is retraction, the shoulder blade drawn
 * to the spine), degrees. The rig's shoulder joint is fixed on the chest, its turn the arm's on the chest, so the
 * girdle only moves where that joint is (`girdlePlace`): an arm keeps its meaning, and a model's shoulder seams and
 * colliders stay put unless an arm needs the girdle.
 */
export const GIRDLE = { elevation: [-10, 35], protraction: [-25, 30] } as const;
/** the share of the girdle's backward turn by which the arm reaches further behind the body (degrees per degree) */
const RETRACT_REACH = 0.6;
/** the top of the breastbone, from the shoulder joint at rest (the rig's units, the right side's x mirrored) */
const SC = new THREE.Vector3(0.025, -0.02, 0.05);
/** where the shoulder joint at rest `rest` (its parent's frame) is with the girdle raised `elev` and brought forward `protract` (degrees), into `out` */
export function girdlePlace(rest: THREE.Vector3, left: boolean, elev: number, protract: number, out: THREE.Vector3): THREE.Vector3 {
  const s = left ? 1 : -1;
  _sv.set(s * SC.x, rest.y + SC.y, rest.z + SC.z);
  out.copy(rest).sub(_sv).applyAxisAngle(_gz, s * elev / DEG).applyAxisAngle(Y, -s * protract / DEG);
  return out.add(_sv);
}
const _gz = new THREE.Vector3(0, 0, 1);

/** one angle outside its range */
export interface Breach { name: string; value: number; min: number; max: number; by: number }

/** the angles of `a` outside their ranges, the worst first (the shoulder's raise by its plane, as `shoulderX.excess`) */
export function breaches(a: BodyAngles, tolerance = 0): Breach[] {
  const out: Breach[] = [];
  for (const [name, value] of Object.entries(a)) {
    if (name.endsWith('.excess')) { if (value > tolerance) out.push({ name, value, min: 0, max: 0, by: value }); continue; }
    const key = name.replace(/[LR]\./, '.') as RangeName, r = ROM[key];
    // (the shoulder's raise and turn are judged together, as its excess)
    if (!r || key === 'shoulder.elevation' || key === 'shoulder.rotation') continue;
    const by = Math.max(r[0] - value, value - r[1]);
    if (by > tolerance) out.push({ name, value, min: r[0], max: r[1], by });
  }
  return out.sort((x, y) => y.by - x.by);
}

// --- the body against itself ----------------------------------------------------------------------------------

/** a solid of the body: an ellipsoid on a joint (its centre and half-axes in the joint's frame, the rig's units) */
export interface Solid { name: string; at: THREE.Object3D; c: THREE.Vector3; r: THREE.Vector3 }
/** a limb: a capsule from a point on one joint to a point on another (each in its joint's frame), its radius */
export interface Limb { name: string; a: THREE.Object3D; pa: THREE.Vector3; b: THREE.Object3D; pb: THREE.Vector3; r: number }
/** `legs`: how much the arms' IK keeps them out of the thighs too (0 to 1: sat on the floor, set by the hero each
 *  frame as he goes down). `legCapsules` uses the warrior's fuller thigh and a hanging elbow in that solve. */
export interface BodyShape { solids: Solid[]; limbs: Limb[]; pairs: [Limb, Solid][]; legs?: number; legCapsules?: boolean }

/**
 * The body's solids (the head from its skin, the chest, belly and neck from the rig's proportions) and the arms as
 * limbs, with the pairs that must not pass into each other: each forearm and hand against the head, neck, chest and
 * belly, each upper arm against the head. `hands` are the posed hands' turned nodes (`Hand.vis`).
 */
export function bodyShape(j: Joints, hands?: { L?: THREE.Object3D; R?: THREE.Object3D }): BodyShape {
  const P = j.P, V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const solids: Solid[] = [
    { name: 'chest', at: j.chest, c: V(0, P.torsoL * 0.12, 0), r: V(P.chestW, P.torsoL * 0.42, P.chestD) },
    { name: 'belly', at: j.spine, c: V(0, P.torsoL * 0.2, 0), r: V(P.waistW, P.torsoL * 0.35, P.chestD * 0.9) },
    { name: 'neck', at: j.neck, c: V(0, P.neckL * 0.45, 0), r: V(P.headR * 0.42, P.neckL * 0.75, P.headR * 0.42) },
    // (the thighs, past the knee and the hip: an ellipsoid the thigh's length tapered to nothing at the knee, and the
    // forearm crossing the knee's side went through it unseen)
    { name: 'thighL', at: j.thighL, c: V(0, -P.thighL * 0.5, 0), r: V(P.thighR * 1.1, P.thighL * 0.75, P.thighR * 1.1) },
    { name: 'thighR', at: j.thighR, c: V(0, -P.thighL * 0.5, 0), r: V(P.thighR * 1.1, P.thighL * 0.75, P.thighR * 1.1) },
  ];
  // the head: its skin's box in the head joint's frame (a little inside it, an ellipsoid fitted in a box)
  const face = j.head.getObjectByName('face') as THREE.Mesh | undefined;
  if (face) {
    j.root.updateMatrixWorld(true);
    face.geometry.computeBoundingBox();
    const m = new THREE.Matrix4().copy(j.head.matrixWorld).invert().multiply(face.matrixWorld), box = new THREE.Box3().copy(face.geometry.boundingBox!).applyMatrix4(m);
    solids.push({ name: 'head', at: j.head, c: box.getCenter(new THREE.Vector3()), r: box.getSize(new THREE.Vector3()).multiplyScalar(0.5 * 0.97) });
  } else solids.push({ name: 'head', at: j.head, c: V(0, P.headR, 0), r: V(P.headR * 0.8, P.headR, P.headR * 0.9) });
  const limbs: Limb[] = [], pairs: [Limb, Solid][] = [];
  const by = (n: string) => solids.find((s) => s.name === n)!;
  for (const side of ['L', 'R'] as const) {
    const sh = j[`shoulder${side}`], el = j[`elbow${side}`], hd = hands?.[side] ?? j[`hand${side}`];
    const upper = { name: `upper arm ${side}`, a: sh, pa: V(0, -P.upperR, 0), b: el, pb: V(0, 0, 0), r: P.upperR };
    const fore = { name: `forearm ${side}`, a: el, pa: V(0, 0, 0), b: j[`hand${side}`], pb: V(0, 0, 0), r: P.foreR };
    const hand = { name: `hand ${side}`, a: hd, pa: V(0, -0.03, 0), b: hd, pb: V(0, -0.12, 0), r: 0.04 };
    limbs.push(upper, fore, hand);
    pairs.push([upper, by('head')]);
    for (const s of ['head', 'neck', 'chest', 'belly']) { pairs.push([fore, by(s)], [hand, by(s)]); }
  }
  return { solids, limbs, pairs };
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _m = new THREE.Matrix4();
/** one limb in a solid: how deep (the rig's units), and where along the limb (0..1) */
export interface Overlap { limb: string; solid: string; depth: number; along: number }

/** each limb passing into a solid it must not, deeper than `tolerance` (the rig's units); world matrices up to date */
export function overlaps(shape: BodyShape, tolerance = 0): Overlap[] {
  const out: Overlap[] = [];
  for (const [l, s] of shape.pairs) {
    _m.copy(s.at.matrixWorld).invert();
    _a.copy(l.pa).applyMatrix4(l.a.matrixWorld).applyMatrix4(_m);
    _b.copy(l.pb).applyMatrix4(l.b.matrixWorld).applyMatrix4(_m);
    let best = -Infinity, at = 0;
    for (let i = 0; i <= 8; i++) {
      _c.lerpVectors(_a, _b, i / 8).sub(s.c);
      const len = _c.length(), k = Math.hypot(_c.x / s.r.x, _c.y / s.r.y, _c.z / s.r.z);
      // (the sphere round this point of the limb against the solid, along the line from its centre)
      const d = k < 1e-6 ? l.r + Math.min(s.r.x, s.r.y, s.r.z) : l.r - len * (1 - 1 / k);
      if (d > best) { best = d; at = i / 8; }
    }
    if (best > tolerance) out.push({ limb: l.name, solid: s.name, depth: best, along: at });
  }
  return out.sort((x, y) => y.depth - x.depth);
}

// --- keeping a joint in range -----------------------------------------------------------------------------------

const _sv = new THREE.Vector3(), _tq = new THREE.Quaternion();
/**
 * The foot's turn on the shin (`q`, the ankle's own rotation) brought within the ankle's range, in place: its twist
 * about the shin, its lift (dorsiflexion: to 40 degrees with the body's weight on it, 20 in the air) and its roll
 * (inversion), or its lift alone. True if it had to be.
 */
export function clampAnkle(q: THREE.Quaternion, left: boolean, loaded: boolean, liftOnly = false): boolean {
  if (!ROM_ON) return false;
  const tw = twistAngle(q, Y, _sw) * DEG, [x, z] = swingXZ(_sw);
  const dorsi = -x * DEG, inv = (left ? -z : z) * DEG;
  const [t0, t1] = ROM['ankle.twist'], [d0, d1] = ROM['ankle.dorsiflexion'], [i0, i1] = ROM['ankle.inversion'];
  const dMax = loaded ? d1 : 20;
  // (`liftOnly`: only the lift, the foot's twist and roll as they are)
  const tw2 = liftOnly ? tw : Math.max(t0, Math.min(t1, tw)), dorsi2 = Math.max(d0, Math.min(dMax, dorsi)), inv2 = liftOnly ? inv : Math.max(i0, Math.min(i1, inv));
  if (tw2 === tw && dorsi2 === dorsi && inv2 === inv) return false;
  _sv.set(-dorsi2 / DEG, 0, (left ? -inv2 : inv2) / DEG);
  const a = _sv.length();
  if (a < 1e-9) _sw.identity(); else _sw.setFromAxisAngle(_sv.multiplyScalar(1 / a), a);
  q.copy(_sw).multiply(_tq.setFromAxisAngle(Y, tw2 / DEG));
  return true;
}

/** Holds an ankle's roll (its inversion) within its range, its twist and lift as they are: a planted foot under a
 *  shin leaning out further than an ankle rolls lies on its edge (laid flat, the ankle read 57 degrees as a running
 *  reversal landed a foot under a leg splayed out). True if it changed. */
export function clampAnkleRoll(q: THREE.Quaternion, left: boolean): boolean {
  if (!ROM_ON) return false;
  const tw = twistAngle(q, Y, _sw), [x, z] = swingXZ(_sw);
  const inv = (left ? -z : z) * DEG, [i0, i1] = ROM['ankle.inversion'];
  const inv2 = Math.max(i0, Math.min(i1, inv));
  if (inv2 === inv) return false;
  _sv.set(x, 0, (left ? -inv2 : inv2) / DEG);
  const a = _sv.length();
  if (a < 1e-9) _sw.identity();
  else _sw.setFromAxisAngle(_sv.multiplyScalar(1 / a), a);
  q.copy(_sw).multiply(_tq.setFromAxisAngle(Y, tw));
  return true;
}

const _da = new THREE.Vector3(), _db = new THREE.Vector3(), _dc = new THREE.Vector3(), _dm = new THREE.Matrix4();
/** how deep (the rig's units) a capsule from `a` to `b` (world) of radius `r` passes into `s`; negative clear of it. `inv`: `s`'s joint's inverse world matrix, if already at hand */
export function capsuleDepth(a: THREE.Vector3, b: THREE.Vector3, r: number, s: Solid, inv?: THREE.Matrix4): number {
  const m = inv ?? _dm.copy(s.at.matrixWorld).invert();
  _da.copy(a).applyMatrix4(m); _db.copy(b).applyMatrix4(m);
  let best = -Infinity;
  for (let i = 0; i <= 4; i++) {
    _dc.lerpVectors(_da, _db, i / 4).sub(s.c);
    const len = _dc.length(), k = Math.hypot(_dc.x / s.r.x, _dc.y / s.r.y, _dc.z / s.r.z);
    best = Math.max(best, k < 1e-6 ? r + Math.min(s.r.x, s.r.y, s.r.z) : r - len * (1 - 1 / k));
  }
  return best;
}

/** the forearm's turn and the wrist's bend for the hand turned `q` on the forearm (q = twist · swing), degrees */
export function wristAngles(q: THREE.Quaternion, left: boolean): { pronation: number; flexion: number; radial: number; twist: number } {
  const th0 = twistAngle(_q.copy(q).invert(), Y, _sw);
  _sw.setFromAxisAngle(Y, th0).multiply(q);
  const [x, z] = swingXZ(_sw), tw = -th0 * DEG;
  return { pronation: wrap(left ? 90 - tw : 90 + tw), flexion: x * DEG, radial: (left ? -z : z) * DEG, twist: tw };
}

/**
 * The wrist's flexion with a weapon gripped hard in its fist (degrees): flexed far, the fingers' long flexors go slack
 * and the fist can't stay closed on its handle (people grip hardest with the wrist about 35 degrees back), so it works
 * from cocked back to a little flexed. (Only the empty hand's 80 held, a fist hung 96 degrees off its forearm.)
 */
export const GRIPPED_FLEXION = [-70, 30] as const;

/** the hand turned on its forearm (twist · swing) with the forearm's turn and the wrist's bend each within range (its
 *  flexion within `flexion`; each `inside` degrees short of its ends), into `out`; the degrees it was outside them */
export function clampWrist(q: THREE.Quaternion, left: boolean, out: THREE.Quaternion, flexion: readonly [number, number] = ROM['wrist.flexion'], inside = 0): number {
  const w = wristAngles(q, left);
  const [p0, p1] = ROM['forearm.pronation'].map((end, i) => end + (i ? -inside : inside));
  const [f0, f1] = flexion.map((end, i) => end + (i ? -inside : inside));
  const [r0, r1] = ROM['wrist.radial'].map((end, i) => end + (i ? -inside : inside));
  const p = Math.max(p0, Math.min(p1, w.pronation)), f = Math.max(f0, Math.min(f1, w.flexion)), r = Math.max(r0, Math.min(r1, w.radial));
  const by = Math.abs(p - w.pronation) + Math.abs(f - w.flexion) + Math.abs(r - w.radial);
  if (!by) { out.copy(q); return 0; }
  wristTurn(p, f, r, left, out);
  return by;
}

/** the hand's turn on its forearm (twist · swing) with the forearm turned over `pronation` and the wrist bent `flexion`
 *  and `radial` (degrees, as `wristAngles` reads them), into `out` */
export function wristTurn(pronation: number, flexion: number, radial: number, left: boolean, out: THREE.Quaternion): THREE.Quaternion {
  // (the forearm's twist from the pronation, and the swing from the wrist's two bends)
  const tw = (left ? 90 - pronation : pronation - 90) / DEG;
  _sv.set(flexion / DEG, 0, (left ? -radial : radial) / DEG);
  const a = _sv.length();
  if (a < 1e-9) _sw.identity(); else _sw.setFromAxisAngle(_sv.multiplyScalar(1 / a), a);
  return out.setFromAxisAngle(Y, tw).multiply(_sw);
}

// --- the dev builds' watch ------------------------------------------------------------------------------------

/** a hand joint's hand as it's drawn (`Hand.vis`, which `hold` turns on the joint), or the joint */
export const drawnHand = (h: THREE.Object3D) => h.children.find((c) => c.userData.drawnHand) ?? h;
const reported = new Set<string>();
/** Dev builds: every angle and action told of afresh from here on (the lab, as each command begins: a page runs many,
 *  and a later one heard nothing of a joint an earlier one had taken past its range) */
export const forgetReported = (): void => reported.clear();
/** Dev builds: tell the console of each joint the body takes past its range (by more than `tol` degrees), once per angle and action */
export function watchBody(j: Joints, action: string, tol = 5): void {
  j.root.updateMatrixWorld(true);
  for (const b of breaches(measureBody(j, { L: drawnHand(j.handL), R: drawnHand(j.handR) }), tol)) {
    const key = `${b.name} ${action}`;
    if (reported.has(key)) continue;
    reported.add(key);
    // (a foot: how high its ankle is, the rig's units)
    const foot = b.name.startsWith('ankle') ? `, its ankle ${j.root.worldToLocal(j[b.name.slice(0, 6) as 'ankleL'].getWorldPosition(new THREE.Vector3())).y.toFixed(2)} up` : '';
    console.warn(`anatomy: ${b.name} ${b.value.toFixed(0)} deg, outside ${b.min}..${b.max}, during ${action}${foot} (models/anatomy.ts)`);
  }
}
