// Arm IK within a body's ranges. The wrist goes to a point and the hand takes a turn, as far as a body can: of every place
// the elbow could be (a circle round the line from the shoulder to the wrist), the one where the shoulder, the forearm's
// turn and the wrist stay within their ranges and the arm keeps out of the head and trunk, nearest where the pose wanted
// the elbow and where it was last frame. What a body can't do, it doesn't: the forearm's turn and the wrist's bend stop at
// their ends, and the hand (and what it holds) turns only as far as they let it. A hand round a handle may also turn
// about it (`roll`), its wrist going round with it. A two-bone solve whose pole alone chose the elbow put it wherever
// the pole said: behind the back, up past the head, the wrist bent double round a handle.
import * as THREE from 'three';
import type { Joints } from './rig';
import { GIRDLE, GRIPPED_FLEXION, ROM_ON, capsuleDepth, clampWrist, girdlePlace, shoulderExcess, type BodyShape } from './anatomy';

const N = 24, REFINE = 7, ROLLS = 5;

export interface ArmGoal {
  /** where the wrist goes (world) */
  wrist: THREE.Vector3;
  /** the hand's turn wanted (world): the turned hand's if `vis` is given, else the hand joint's; none keeps the hand's turn on the forearm */
  hand?: THREE.Quaternion;
  /** the turned hand's turn on the hand joint (`Hand.vis`): the wrist's range is the visible hand's */
  vis?: THREE.Quaternion;
  /** where the elbow would rather point (world, a direction from the shoulder): a preference within the ranges */
  pole?: THREE.Vector3;
  /** degrees of the ranges' excess the pole is worth, from where it points to the far side of the circle (default 8) */
  keep?: number;
  /** the body, so the arm keeps out of the head and the trunk */
  body?: BodyShape;
  /** a hand round a handle along `axis` (world, through `at`) may turn about it up to `range` (rad) either way: the wrist and the hand turn round it together */
  roll?: { axis: THREE.Vector3; range: number; at: THREE.Vector3 };
  /** where the shoulder is (its parent's frame), instead of its place on the body (the rig's `userData.rest`): through the
   *  eyes, the arms' shoulders under the camera */
  shoulder?: THREE.Vector3;
  /** the shoulder girdle may move the shoulder (anatomy.ts `GIRDLE`) when no elbow keeps the arm within its ranges with it at rest */
  girdle?: boolean;
  /** the girdle set to this raise and forward turn (degrees) whatever the arm needs, as an archer's back draws the shoulder
   *  blade in at full draw */
  girdleSet?: [number, number];
  /** what each degree of the shoulder's excess costs (as `keep`'s; 3 by default): none through the eyes for an arm
   *  whose shoulder is placed under the camera, never seen (the owner: "in 1st person mode we dont care about shoulder
   *  anatomy much"), so its elbow may rise as a person's does to turn a fist palm down (weighed, a two-hander's right
   *  elbow hung tucked under its shoulder and the forearm was turned 24 degrees past its range) */
  shoulderW?: number;
  /** what each degree of the wrist's bend costs (as `keep`'s): an elbow that lines the forearm up behind the fist (a hand
   *  turned as asked whatever the ranges, `free`, otherwise took whatever bend the elbow left it, 45 to 66 degrees back) */
  wristW?: number;
  /** a hand round a handle may turn about its palm on it up to this (rad), the handle diagonal across the palm (`hold`'s slant): the hand joint, and so what it holds, keeps its turn, only the visible hand turns;
   *  or its least and most (one side of the fist would meet what's beside the handle: a bow's arrow over its shelf) */
  slant?: number | [number, number];
  /** with `roll` and `slant`: the fist stays round the handle as it slants on it, the wrist going round `roll.at`, as a
   *  hand on a handle the other hand holds does (a two-hander's lower hand: slanted about its wrist, the fist came 1.4 cm
   *  off its grip); a hand that holds what it slants carries it with it */
  slantOnHandle?: boolean;
  /** the hand's turn on the forearm eased from `rest` (the hand joint's own turn) to the one `hand` asks for, by `w`, for
   *  whichever elbow is tried: a hand coming onto a grip from riding its forearm */
  ease?: { rest: THREE.Quaternion; w: number };
  /** the farthest the elbow may move from where it was last solved (the rig's units): further, it goes that far round its
   *  circle towards where it would be, so a change of side is a swing, not a jump */
  maxMove?: number;
  /** with `roll` or `slant`: how much of the way from the last solve's turn about the handle and slant on it to the best
   *  found now they go (0..1), the best found between the few tried, not one of them: picked from those, the hand turned
   *  and slanted in steps, and as the walk moved the elbow a bow carried in the fist jumped between two or three places */
  glide?: number;
  /** the wrist's flexion range (degrees): a hand gripping a handle, a gripping wrist's (anatomy.ts `GRIPPED_FLEXION`);
   *  the open hand's by default. (Solved within the open hand's, a two-hander's lower fist flexed 50 to 75 degrees
   *  round its grip, through the eyes and out of them, where a fist can't stay closed) */
  flexion?: readonly [number, number];
  /** the hand turned as asked whatever the forearm's and the wrist's ranges (the elbow still chosen to keep them): through
   *  the eyes, the bow hand, so the bow stays as it's posed (stopped at the wrist's end, the fist turned the bow with the
   *  elbow, and a frame's other elbow coming in for a fan turned it 40 px in the view) */
  free?: boolean;
}
export interface ArmResult {
  /** degrees outside the ranges that no elbow could avoid (the hand then turned less than asked) */
  excess: number;
  /** how deep the arm is in the body (the rig's units), at best */
  depth: number;
  /** how far the hand turned about the handle (rad), with `roll` */
  roll: number;
  /** the girdle's raise and its forward turn (degrees), with `girdle` */
  girdle: [number, number];
  /** the hand's slant on its handle (rad), with `slant`: hold and seat it with this */
  slant: number;
}

const _S = new THREE.Vector3(), _W = new THREE.Vector3(), _n = new THREE.Vector3(), _u1 = new THREE.Vector3(), _u2 = new THREE.Vector3(), _E = new THREE.Vector3();
const _b = new THREE.Vector3(), _f = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _rad = new THREE.Vector3();
const _pq = new THREE.Quaternion(), _pqi = new THREE.Quaternion(), _H = new THREE.Quaternion(), _Qu = new THREE.Quaternion(), _Qf = new THREE.Quaternion(), _rel = new THREE.Quaternion(), _cl = new THREE.Quaternion(), _hx = new THREE.Quaternion();
const _m = new THREE.Matrix4(), _wa = new THREE.Vector3(), _wb = new THREE.Vector3(), _pl = new THREE.Vector3(), _ww = new THREE.Vector3(), _hw = new THREE.Quaternion(), _rq = new THREE.Quaternion(), _off = new THREE.Vector3();
const X = new THREE.Vector3(1, 0, 0);
/** where each arm's elbow was last solved (its shoulder's parent's frame), and its girdle */
const last = new WeakMap<THREE.Object3D, THREE.Vector3>(), lastG = new WeakMap<THREE.Object3D, [number, number]>(), lastS = new WeakMap<THREE.Object3D, number>();
/** and its turn about a handle (`glide` only) */
const lastR = new WeakMap<THREE.Object3D, number>();
const _wy = new THREE.Vector3();
/** how far past the best's ranges (degrees) an elbow held back by `maxMove` may go before it gives way */
const REACH_SLACK = 2;
/** where the least of a parabola through three evenly spaced costs lies, in steps from the middle one (-0.5..0.5) */
const vertex = (lo: number, mid: number, hi: number): number => { const c = lo - 2 * mid + hi; return c > 1e-9 ? Math.max(-0.5, Math.min(0.5, (lo - hi) / (2 * c))) : 0; };
const Z = new THREE.Vector3(0, 0, 1), _sz = new THREE.Quaternion(), _sa = new THREE.Vector3(), _seg = new THREE.Vector3(), _cp = new THREE.Vector3(), _ez = new THREE.Quaternion();
/** the hand's turn on the forearm `rel` eased from `g.ease.rest` as asked */
const eased = (g: ArmGoal, rel: THREE.Quaternion): THREE.Quaternion => (g.ease ? rel.copy(_ez.copy(g.ease.rest).slerp(rel, g.ease.w)) : rel);
/** the girdle's raises and forward turns tried (degrees) */
const G_ELEV = [GIRDLE.elevation[0], 0, 12, 24, GIRDLE.elevation[1]], G_PRO = [GIRDLE.protraction[0], -12, 0, 12, GIRDLE.protraction[1]];
const G_PLACES = G_ELEV.flatMap((e) => G_PRO.map((pr): [number, number] => [e, pr]));

/** Pose the arm (`left` or right) for `g`. The arm's joints are set, not their world matrices. */
export function solveArm(j: Joints, left: boolean, g: ArmGoal): ArmResult {
  const sh = left ? j.shoulderL : j.shoulderR, el = left ? j.elbowL : j.elbowR, hd = left ? j.handL : j.handR;
  const par = sh.parent!;
  par.updateWorldMatrix(true, false);
  par.getWorldQuaternion(_pq); _pqi.copy(_pq).invert();
  const L1 = j.P.upperL, L2 = j.P.foreL;
  const rest = g.shoulder ?? (sh.userData.rest as THREE.Vector3 | undefined) ?? sh.position;
  _S.copy(rest);
  const keep = g.keep ?? 8, prev = last.get(sh);
  const solids = g.body?.solids.filter((s) => s.name === 'head' || s.name === 'chest' || s.name === 'belly' || s.name === 'neck');
  // (each solid's frame, once for the whole search)
  const invs = solids?.map((s) => { s.at.updateWorldMatrix(true, false); return new THREE.Matrix4().copy(s.at.matrixWorld).invert(); }), head = solids ? solids.findIndex((s) => s.name === 'head') : -1;
  // (and a sphere round each, world: a limb clear of it needs no closer look)
  const balls = solids?.map((s) => { const k = s.at.matrixWorld.getMaxScaleOnAxis(); return { c: s.c.clone().applyMatrix4(s.at.matrixWorld), r: Math.max(s.r.x, s.r.y, s.r.z) * k, k }; });
  // the pole, in the shoulder's parent's frame (or the elbow as posed)
  if (g.pole) _pl.copy(g.pole).applyQuaternion(_pqi);
  else { el.getWorldPosition(_pl); par.worldToLocal(_pl).sub(_S); }
  // the turn about a handle: the wrist's offset from the handle's axis at no turn
  if (g.roll) _off.copy(g.wrist).sub(g.roll.at);
  // (`gNow`: the girdle's forward turn being tried: drawn back, the arm reaches further behind)
  let a = 0, r = 0, want: THREE.Quaternion | null = null, depthAt = 0, bad = 0, gNow = 0;

  /** the circle the elbow is on, for the hand turned `roll` about the handle and slanted `slant` on it */
  const setup = (roll: number, slant = 0) => {
    _ww.copy(g.wrist);
    if (g.hand) _hw.copy(g.hand);
    if (g.roll && roll) {
      _rq.setFromAxisAngle(g.roll.axis, roll);
      _ww.copy(_off).applyQuaternion(_rq).add(g.roll.at);
      if (g.hand) _hw.premultiply(_rq);
    }
    // (the slant turns the hand about its palm's normal, through the handle: the wrist goes round it)
    if (g.slantOnHandle && g.roll && g.hand && slant) _ww.sub(g.roll.at).applyAxisAngle(_sa.copy(Z).applyQuaternion(_hw), slant).add(g.roll.at);
    // everything in the shoulder's parent's frame (the rig's units)
    _W.copy(_ww); par.worldToLocal(_W);
    _n.copy(_W).sub(_S);
    const d = THREE.MathUtils.clamp(_n.length(), Math.abs(L1 - L2) + 1e-4, L1 + L2 - 1e-4);
    _n.normalize();
    a = (L1 * L1 - L2 * L2 + d * d) / (2 * d); r = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    _W.copy(_S).addScaledVector(_n, d);
    // the circle's frame: 0 towards the pole
    _u1.copy(_pl).addScaledVector(_n, -_pl.dot(_n));
    if (_u1.lengthSq() < 1e-8) _u1.set(0, -1, 0).addScaledVector(_n, -_n.y);
    _u1.normalize(); _u2.crossVectors(_n, _u1);
    want = g.hand ? _H.copy(_pqi).multiply(_hw) : null;
    if (want && slant) want.multiply(_sz.setFromAxisAngle(Z, slant));
  };

  /** whether a limb from `p` to `q` (world) of radius `rl` comes within solid `i`'s sphere */
  const near = (p: THREE.Vector3, q: THREE.Vector3, rl: number, i: number): boolean => {
    const b = balls![i];
    _seg.copy(q).sub(p);
    const t = THREE.MathUtils.clamp(_cp.copy(b.c).sub(p).dot(_seg) / Math.max(1e-9, _seg.lengthSq()), 0, 1);
    return _cp.copy(p).addScaledVector(_seg, t).distanceTo(b.c) < b.r + rl * b.k;
  };
  /** the arm with its elbow at `phi` round the circle: its upper arm's turn into _Qu, the forearm's into _Qf, the elbow at _E; its cost */
  const at = (phi: number, final = false): number => {
    _rad.copy(_u1).multiplyScalar(Math.cos(phi)).addScaledVector(_u2, Math.sin(phi));
    _E.copy(_S).addScaledVector(_n, a).addScaledVector(_rad, r);
    _b.copy(_E).sub(_S).divideScalar(L1); _f.copy(_W).sub(_E).divideScalar(L2);
    // the upper arm: its bone along -y, its hinge across (x), the forearm bending towards +z
    _y.copy(_b).negate();
    _z.copy(_f).addScaledVector(_b, -_f.dot(_b));
    if (_z.lengthSq() < 1e-8) _z.copy(_rad).negate();
    _z.normalize(); _x.crossVectors(_y, _z);
    _Qu.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
    const flex = Math.acos(THREE.MathUtils.clamp(_b.dot(_f), -1, 1));
    _Qf.copy(_Qu).multiply(_hx.setFromAxisAngle(X, -flex));
    let cost = ROM_ON ? (g.shoulderW ?? 3) * shoulderExcess(_Qu, left, gNow) : 0;
    bad = 0;
    if (want && ROM_ON) {
      eased(g, _rel.copy(_Qf).invert().multiply(want));
      cost += 2 * clampWrist(_rel, left, _cl, g.flexion);
      if (g.wristW) cost += g.wristW * Math.acos(Math.max(-1, Math.min(1, _wy.set(0, 1, 0).applyQuaternion(_rel).y))) * 57.3;
    }
    if (solids && ROM_ON) {
      // (the upper arm against the head only: at the shoulder it joins the trunk)
      _wa.copy(_S).applyMatrix4(par.matrixWorld); _wb.copy(_E).applyMatrix4(par.matrixWorld);
      let deep = near(_wa, _wb, j.P.upperR, head) ? Math.max(0, capsuleDepth(_wa, _wb, j.P.upperR, solids[head], invs![head])) : 0;
      _wa.copy(_W).applyMatrix4(par.matrixWorld);
      for (let i = 0; i < solids.length; i++) if (near(_wb, _wa, j.P.foreR, i)) deep = Math.max(deep, capsuleDepth(_wb, _wa, j.P.foreR, solids[i], invs![i]));
      if (final) depthAt = deep;
      cost += 400 * Math.max(0, deep - 0.005);
    }
    bad = cost;
    // the pole, and last frame's elbow (1 cm counts as a degree)
    cost += keep * Math.abs(phi) / Math.PI;
    if (prev) cost += 100 * _E.distanceTo(prev);
    return cost;
  };

  /** the best elbow for the circle set up: over it, `n` samples, then closer round the best */
  const search = (n: number, refine: number): [number, number] => {
    let best = 0, bestC = Infinity, step = Math.PI / n;
    // (warm: round last frame's elbow first, the whole circle only if nothing there is within the ranges)
    if (prev) {
      _rad.copy(prev).sub(_S).addScaledVector(_n, -a);
      const phi0 = Math.atan2(_rad.dot(_u2), _rad.dot(_u1)), w = Math.PI / 12;
      let worst = 0;
      for (let k = -2; k <= 2; k++) { const phi = phi0 + k * w, c = at(phi); if (c < bestC) { bestC = c; best = phi; worst = bad; } }
      if (worst > 0.5) bestC = Infinity; else step = w / 2;
    }
    if (bestC === Infinity) for (let i = 0; i < n; i++) { const phi = -Math.PI + (i + 0.5) * 2 * Math.PI / n, c = at(phi); if (c < bestC) { bestC = c; best = phi; } }
    for (let i = 0; i < refine; i++) {
      for (const phi of [best - step, best + step]) { const c = at(phi); if (c < bestC) { bestC = c; best = phi; } }
      step *= 0.5;
    }
    return [best, bestC];
  };

  const ps = lastS.get(sh);
  /** whether an arm's cost is never below nothing (no weight on it below nothing), so a choice whose own cost alone
   *  reaches the best found can't be better, and needn't be searched (a sum of floats rounded only grows as it adds) */
  const bounded = (g.shoulderW ?? 3) >= 0 && (g.wristW ?? 0) >= 0 && keep >= 0;
  /** the slant's least and most */
  const [slLo, slHi] = typeof g.slant === 'number' ? [-g.slant, g.slant] : g.slant ?? [0, 0];
  const slantIn = (x: number): number => Math.max(slLo, Math.min(slHi, x));
  /** the hand's turn about its handle and its slant on it for the shoulder where it is (the slant only if `slants`): a few, roughly; and their cost */
  const turnsFor = (slants: boolean): [number, number, number] => {
    const rolls = g.roll && ROM_ON ? Array.from({ length: ROLLS }, (_, i) => g.roll!.range * (2 * i / (ROLLS - 1) - 1)) : [0];
    // (warm: round last frame's slant; all of them when that's nowhere near)
    const sls = !(slants && g.slant && ROM_ON) ? [0] : ps ? [ps - 0.12, ps, ps + 0.12].map(slantIn) : [0, -0.5, 0.5, -1, 1].map((k) => k * (k < 0 ? -slLo : slHi));
    let roll = 0, slant = 0, bestC = Infinity, bi = 0, bk = 0;
    // (each one's cost: its arm's, and what the turn and the slant cost of themselves, a slant also its change; none when
    // nothing asks for them)
    const own = (ro: number, sl: number) => 4 * Math.abs(ro) + 4 * Math.abs(sl) + (ps !== undefined ? 8 * Math.abs(sl - ps) : 0);
    const costOf = (ro: number, sl: number) => {
      setup(ro, sl);
      return search(N / 2, 2)[1] + 4 * Math.abs(ro) + 4 * Math.abs(sl) + (ps !== undefined ? 8 * Math.abs(sl - ps) : 0);
    };
    // (one whose own cost already reaches the best isn't searched, as for the girdle's places, until gliding needs it:
    // its search depends on it alone; NaN, not yet searched)
    const cs = sls.map(() => rolls.map(() => NaN));
    // (the cheapest of themselves first: tried from one end of the rolls, few were passed over)
    const tries = sls.flatMap((sl, i) => rolls.map((ro, k) => ({ i, k, sl, ro, of: own(ro, sl) }))).sort((x, y) => x.of - y.of);
    for (const { i, k, sl, ro, of } of tries) {
      if (bounded && of >= bestC) continue;
      const c = cs[i][k] = costOf(ro, sl);
      if (c < bestC) { bestC = c; roll = ro; slant = sl; bi = i; bk = k; }
    }
    const costAt = (i: number, k: number) => (Number.isNaN(cs[i][k]) ? (cs[i][k] = costOf(rolls[k], sls[i])) : cs[i][k]);
    // (gliding, between the ones tried: where a parabola through the best and its neighbours is least)
    if (g.glide !== undefined) {
      if (bk > 0 && bk < rolls.length - 1) roll += vertex(costAt(bi, bk - 1), cs[bi][bk], costAt(bi, bk + 1)) * (rolls[1] - rolls[0]);
      if (sls.length === 3 && bi === 1) slant = slantIn(slant + vertex(costAt(0, bk), cs[1][bk], costAt(2, bk)) * (sls[2] - sls[0]) / 2);
    }
    return [roll, slant, bestC];
  };
  /** what the ranges leave over for the elbow found (degrees), the arm as `at` last left it */
  const over = (): number => ROM_ON ? shoulderExcess(_Qu, left, gNow) + (want ? clampWrist(eased(g, _rel.copy(_Qf).invert().multiply(want)), left, _cl, g.flexion) : 0) : 0;

  const pr = lastR.get(sh);
  /** the turn and slant found, gliding from the last solve's */
  const glided = ([ro, sl]: [number, number, number]): [number, number] => g.glide === undefined ? [ro, sl]
    : [pr === undefined ? ro : pr + (ro - pr) * g.glide, ps === undefined ? sl : ps + (sl - ps) * g.glide];
  let [roll, slant] = glided(turnsFor(false));
  setup(roll);
  let [best] = search(N, REFINE);
  at(best, true);
  // the slant on the handle, if the wrist needs it (or was slanted last frame, to come back)
  if (g.slant && ROM_ON && (over() > 0.5 || ps)) {
    [roll, slant] = glided(turnsFor(true));
    setup(roll, slant);
    [best] = search(N, REFINE);
    at(best, true);
  }
  // the girdle, if the arm needs it: the shoulder raised or lowered, brought forward or drawn back, the least that does
  // (and near last frame's)
  let gE = 0, gP = 0;
  const pg = lastG.get(sh);
  if (g.girdleSet && ROM_ON) {
    [gE, gP] = g.girdleSet;
    girdlePlace(rest, left, gE, gP, _S); gNow = gP;
    [roll, slant] = glided(turnsFor(!!g.slant));
    setup(roll, slant);
    [best] = search(N, REFINE);
    at(best, true);
  }
  else if (g.girdle && ROM_ON && (over() > 0.5 || depthAt > 0.01 || (pg && (pg[0] || pg[1])))) {
    let bestC = Infinity;
    // (a place whose own cost already reaches the best can't be it, and its arm isn't searched: each place searched every
    // roll and slant, most of the ranger's draw)
    // (the cheapest of themselves first, so the best is found early and the rest passed over: from the far corner, up to
    // 9.5 ms of a frame at a shot, the hero's whole `player` lap of the owner's report)
    const ownOf = (e: number, pr: number): number => 0.3 * (Math.abs(e) + Math.abs(pr)) + (pg ? 0.3 * (Math.abs(e - pg[0]) + Math.abs(pr - pg[1])) : 0);
    for (const [e, pr] of [...G_PLACES].sort((x, y) => ownOf(x[0], x[1]) - ownOf(y[0], y[1]))) {
      const lift = 0.3 * (Math.abs(e) + Math.abs(pr)), fromLast = pg ? 0.3 * (Math.abs(e - pg[0]) + Math.abs(pr - pg[1])) : 0;
      // (summed as the cost is, the arm's first: rounded, a sum only grows with what's added)
      if (bounded && lift + fromLast >= bestC) continue;
      girdlePlace(rest, left, e, pr, _S); gNow = pr;
      const c = turnsFor(!!slant)[2] + lift + fromLast;
      if (c < bestC) { bestC = c; gE = e; gP = pr; }
    }
    // (eased towards it: the girdle is slow next to the arm)
    if (pg) { gE = pg[0] + (gE - pg[0]) * 0.35; gP = pg[1] + (gP - pg[1]) * 0.35; }
    girdlePlace(rest, left, gE, gP, _S); gNow = gP;
    [roll, slant] = glided(turnsFor(!!g.slant));
    setup(roll, slant);
    [best] = search(N, REFINE);
    at(best, true);
  }
  // (no further from last frame's elbow than `maxMove`: round the circle from the nearest point to it, towards the best)
  if (g.maxMove && prev) {
    _rad.copy(prev).sub(_S).addScaledVector(_n, -a);
    const phiP = Math.atan2(_rad.dot(_u2), _rad.dot(_u1));
    if (_E.distanceTo(prev) > g.maxMove) {
      const d = Math.atan2(Math.sin(best - phiP), Math.cos(best - phiP)), ob = over();
      let lo = 0, hi = 1;
      for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; at(phiP + d * mid); if (_E.distanceTo(prev) > g.maxMove) hi = mid; else lo = mid; }
      // (further, past the cap, as far as the ranges need: held back, an elbow swinging up over the shoulder for the quiver
      // took the shoulder 200 degrees past its range)
      at(phiP + d * lo);
      if (over() > ob + REACH_SLACK) {
        let l = lo, h = 1;
        for (let i = 0; i < 12; i++) { const mid = (l + h) / 2; at(phiP + d * mid); if (over() > ob + REACH_SLACK) l = mid; else h = mid; }
        lo = h;
      }
      best = phiP + d * lo;
      at(best, true);
    }
  }
  // (not asked for, the girdle is at rest, and eases from there when it is again: kept as it last was, the shoulder jumped back to it)
  if (g.girdle || g.girdleSet) (pg ?? lastG.set(sh, [0, 0]).get(sh)!).splice(0, 2, gE, gP);
  else if (pg) pg.splice(0, 2, 0, 0);
  if (g.slant) lastS.set(sh, slant);
  if (g.glide !== undefined) lastR.set(sh, roll);
  sh.position.copy(_S);
  (prev ?? last.set(sh, new THREE.Vector3()).get(sh)!).copy(_E);
  // the joints: the upper arm on its parent, the elbow a hinge, the hand within the forearm's turn and the wrist's bend
  sh.quaternion.copy(_Qu);
  const flex = Math.acos(THREE.MathUtils.clamp(_b.dot(_f), -1, 1));
  el.quaternion.setFromAxisAngle(X, -flex);
  let excess = ROM_ON ? shoulderExcess(_Qu, left, gP) : 0;
  const vis = g.vis;
  // (the visible hand's turn on the forearm: as wanted, or as it was)
  if (want) eased(g, _rel.copy(_Qf).invert().multiply(want));
  else { _rel.copy(hd.quaternion); if (vis) _rel.multiply(vis); }
  if (ROM_ON && !g.free) excess += clampWrist(_rel, left, _rel, g.flexion);
  hd.quaternion.copy(_rel);
  // (the hand joint under the visible hand: its turn on the joint, and the slant)
  if (vis || slant) hd.quaternion.multiply(_hx.copy(vis ?? _sz.identity()).multiply(_sz.setFromAxisAngle(Z, slant)).invert());
  return { excess, depth: depthAt, roll, girdle: [gE, gP], slant };
}

/**
 * An arm the pose has placed, brought within the body's ranges: its wrist stays where the pose put it and its hand
 * keeps its turn in the world as far as the ranges let it; the elbow moves round as little as they allow. `vis`: the
 * turn the hand will be given on its joint this frame (`gripTurn` for a held weapon), none for a hand that isn't
 * turned, and a hand so turned grips what it holds: its wrist within a gripping wrist's range. (It reads the joints'
 * world matrices through their parents, so needs no update of the whole model first.)
 */
export function fitArm(j: Joints, left: boolean, vis?: THREE.Quaternion, body?: BodyShape, slant?: number): ArmResult {
  const sh = left ? j.shoulderL : j.shoulderR, el = left ? j.elbowL : j.elbowR, hd = left ? j.handL : j.handR;
  const wrist = hd.getWorldPosition(new THREE.Vector3());
  const hand = hd.getWorldQuaternion(new THREE.Quaternion());
  if (vis) hand.multiply(vis);
  const pole = el.getWorldPosition(new THREE.Vector3()).sub(sh.getWorldPosition(new THREE.Vector3()));
  return solveArm(j, left, { wrist, hand, vis, pole, body, slant, flexion: vis ? GRIPPED_FLEXION : undefined });
}
