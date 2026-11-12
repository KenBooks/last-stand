// Spent arrows: every arrow that came down stays where it ended until the arena shows another biome (`clearSpent`: they
// all go), its wave is won (they dissolve as a killed foe's body does: `dissolveSpent`); when there are too many (STUCK_MAX), the oldest fade out too:
// standing in the ground or a prop, riding a foe's body (on the joint it struck, until the body dissolves or the prop breaks, when they drop), or loose, glancing off stone and
// tumbling to lie on the floor. Two instanced meshes hold them: the whole arrow within NEAR of the camera, the plain
// one (`arrowLite`, 18 triangles to its 301) beyond. Only the moving ones (riding, falling, fading) are written each
// frame. Purely visual: every game keeps its own, from the arrows it sees.
import * as THREE from 'three';
import { G } from '../state';
import { addEffect } from './effects';
import { arrowGeometry, arrowLite, ARROW } from '../entities/models/bow';
import { hullHit } from '../entities/models/hulls';
import { groundHeight } from '../world/arena';
import { BIOMES } from '../data/biomes';
import { sfx } from '../core/audio';
import { col, particles } from './particles';
import { clamp, rand } from '../util';
import { on } from '../events';
import { createKit } from '../core/materials';
import type { Obstacle } from '../types';

/** how many spent arrows stay; past that the oldest fade out over FADE s (shrinking into their buried point) */
export const STUCK_MAX = 1000;
const FADE = 1.1;
/** room for the ones fading out (a volley past the cap): beyond it the oldest fading one goes at once */
const HEADROOM = 200;
/** the whole arrow is drawn within this of the camera (m; the plain one past it, and back past NEAR + 1) */
const NEAR = 6;
/** how deep an arrow goes in: the ground, wood, a body (m) */
export const SINK = { ground: 0.16, prop: 0.12, body: 0.1 };
/** a falling arrow this far past what bounds the floor (m) came over the wall, and isn't kept in the arena; one
 *  inside is kept this far off it (its shaft's breadth) */
const OVER_WALL = 0.5;
const SHAFT = 0.05;
const GRAVITY = 9.81;
/** an arrow glancing off stone keeps a share of its speed that grows with the speed (a slow one hardly hops, a fast one
 *  skitters): GLANCE of it at GLANCE_V and over, and of that, along the stone all of it and off it GLANCE_UP of it */
const GLANCE = 0.12, GLANCE_V = 60, GLANCE_UP = 0.3;
/** a loose arrow's bounce off the floor, a prop or the wall: of its speed into it, BOUNCE at BOUNCE_V and over (less as it
 *  slows), and along the floor FRICTION; its spin's loss, and the speed it lies still at */
const BOUNCE = 0.3, BOUNCE_V = 6, FRICTION = 0.5, SPIN_KEEP = 0.6, SETTLE_V = 0.8;
/** the share of `speed` a bounce gives back, `k` at `full` and over, less in proportion below */
const restitution = (k: number, full: number, speed: number): number => k * Math.min(1, speed / full);
/** a lying arrow's middle above the floor (its shaft's radius and the vanes holding it up a little) */
const LIE_H = 0.012;
const FWD = new THREE.Vector3(0, 0, 1);
const DISSOLVE_COLOR = col(0x7dffd0, 1.8), DISSOLVE_END = col(0x356a58, 0.2);

type Mode = 'fixed' | 'body' | 'loose';
interface Spent {
  mode: Mode;
  /** its middle and turn in the world (riding: its middle as last drawn), and the point it shrinks into */
  p: THREE.Vector3; q: THREE.Quaternion; tip: THREE.Vector3;
  /** riding: the object it's in and its place in that object's frame, and when it lets go */
  on?: THREE.Object3D; local?: THREE.Matrix4; gone?: () => boolean;
  /** standing in a prop: the prop's circle (it drops when the prop breaks) */
  prop?: Obstacle;
  /** loose: velocity and spin (an axis scaled by rad/s) */
  v?: THREE.Vector3; w?: THREE.Vector3;
  /** fading out: s since it began (-1: not) */
  fade: number;
  /** next rising mote while it dissolves (s into the fade) */
  moteAt: number;
  /** which mesh draws it (0 the plain one, 1 the whole arrow) and its slot there */
  lod: 0 | 1;
  slot: number;
}

/** the plain arrows' mesh and the whole ones', and what each slot of each draws */
let meshes: [THREE.InstancedMesh, THREE.InstancedMesh] | null = null;
const lists: [Spent[], Spent[]] = [[], []];
/** oldest first, not yet fading */
const order: Spent[] = [];
/** the ones written every frame */
const moving = new Set<Spent>();
const _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _d = new THREE.Vector3(), _n = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);
/** how far either way along an arrow's line a prop's surface is looked for from where it met the prop's circle (m) */
const PROP_REACH = 1.5;
const total = (): number => lists[0].length + lists[1].length;

/** every arrow's material, in flight and spent (double-sided: an arrow's feathers are single sheets) */
export const arrowMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.1, side: THREE.DoubleSide });

/** the spent arrows' material: the arrow's, on the material kit, so they dissolve as a killed foe's body does (its noise,
 *  its glowing edge in the kit's colour: entities/corpse.ts), all of them at once by the kit's one uniform */
const kit = createKit();
const spentMat = kit.std({ vertexColors: true, roughness: 0.75, metalness: 0.1, side: THREE.DoubleSide });
/** how long they take to dissolve (s: a foe's body's, corpse.ts `FADE`) */
const DISSOLVE = 1.1;
/** s since they began to dissolve (-1: they aren't), and when the next motes rise off the near ones */
let dissolving = -1;
let dissolveMoteAt = 0;

export function warmStuck(): THREE.Object3D[] {
  return [arrowGeometry(), arrowLite()].flatMap((g) => [arrowMat, spentMat].map((mat) => {
    const m = new THREE.InstancedMesh(g, mat, 1);
    m.count = 1;
    return m;
  }));
}

function start(): void {
  const ms = meshes = [arrowLite(), arrowGeometry()].map((g, i) => {
    const m = new THREE.InstancedMesh(g, spentMat, STUCK_MAX + HEADROOM);
    m.count = 0; m.frustumCulled = false; m.name = i ? 'spent arrows' : 'spent arrows (plain)';
    // (the profiler's part of them, perf/sceneParts.ts: 1,000 of them in the forest's top view, the most kept, read
    // nothing of a phone's 8.5 ms frame at Very low, `lab profile --device phone --level verylow --arrows 1000`)
    m.userData.spentArrows = true;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    G.scene.add(m);
    return m;
  }) as unknown as [THREE.InstancedMesh, THREE.InstancedMesh];
  addEffect({
    update: step,
    dispose() { for (const m of ms) { G.scene.remove(m); m.dispose(); } meshes = null; lists[0].length = lists[1].length = 0; order.length = 0; moving.clear(); },
  });
}

/** whether it's drawn whole (near the camera, with a metre's give either way so it doesn't flicker between the two) */
const nearCam = (s: Spent, now: 0 | 1): 0 | 1 => (s.p.distanceToSquared(G.camera.position) < (now ? (NEAR + 1) ** 2 : NEAR ** 2) ? 1 : 0);

function add(a: Omit<Spent, 'slot' | 'fade' | 'moteAt' | 'lod'>): Spent {
  if (!meshes) start();
  const s = a as Spent;
  s.fade = -1;
  s.moteAt = -1;
  // past the cap the oldest start to fade; with no room left even for those, the oldest fading one goes now
  if (order.length >= STUCK_MAX) fadeOut(order[0]);
  if (total() >= STUCK_MAX + HEADROOM) {
    let o: Spent | null = null;
    for (const x of moving) if (x.fade >= 0 && (!o || x.fade > o.fade)) o = x;
    remove(o ?? order[0]);
  }
  place(s, nearCam(s, 0));
  order.push(s);
  if (s.mode !== 'fixed') moving.add(s);
  write(s);
  return s;
}

/** Into a mesh's list (its last slot). */
function place(s: Spent, lod: 0 | 1): void {
  s.lod = lod; s.slot = lists[lod].length;
  lists[lod].push(s);
  meshes![lod].count = lists[lod].length;
}

/** Out of its mesh's list: the last one there takes its slot. */
function unplace(s: Spent): void {
  const l = lists[s.lod], last = l.pop()!;
  if (last !== s) { l[s.slot] = last; last.slot = s.slot; write(last); }
  meshes![s.lod].count = l.length;
}

function fadeOut(s: Spent): void {
  const i = order.indexOf(s);
  if (i >= 0) order.splice(i, 1);
  s.fade = 0;
  s.moteAt = rand(0.03, 0.16);
  moving.add(s);
}

function remove(s: Spent): void {
  unplace(s);
  moving.delete(s);
  const i = order.indexOf(s);
  if (i >= 0) order.splice(i, 1);
}

function write(s: Spent): void {
  if (s.mode === 'body') {
    _m.multiplyMatrices(s.on!.matrixWorld, s.local!);
    s.p.setFromMatrixPosition(_m);
    if (s.fade >= 0) { _m.decompose(s.p, s.q, _s); s.tip.copy(s.p).addScaledVector(_d.copy(FWD).applyQuaternion(s.q), ARROW / 2); }
  }
  if (s.mode !== 'body' || s.fade >= 0) {
    const f = s.fade >= 0 ? clamp(s.fade / FADE, 0, 1) : 0;
    const k = 1 - f * f * (3 - 2 * f);
    _p.copy(s.p).sub(s.tip).multiplyScalar(k).add(s.tip);
    _m.compose(_p, s.q, _s.setScalar(k));
  }
  const m = meshes![s.lod], at = m.instanceMatrix, from = s.slot * 16, was = at.array as Float32Array, now = _m.elements;
  // (one riding a body that stands still hasn't moved: sent anyway, the whole of both meshes' matrices went up every frame
  // an arrow was in a dummy, 140 KB, and on WebGPU each new version refreshes their draws in full)
  let same = true;
  for (let i = 0; i < 16 && same; i++) same = was[from + i] === Math.fround(now[i]);
  if (same) return;
  m.setMatrixAt(s.slot, _m);
  // (the slots written this frame as one range: the renderers let go of it as they send it)
  const range = at.updateRanges[0];
  if (range) {
    const end = Math.max(range.start + range.count, from + 16);
    range.start = Math.min(range.start, from);
    range.count = end - range.start;
  } else at.addUpdateRange(from, 16);
  at.needsUpdate = true;
}

function step(dt: number): boolean {
  if (dissolving >= 0) {
    dissolving += dt;
    kit.u.uDissolve.value = Math.min(1, dissolving / DISSOLVE);
    if (dissolving >= DISSOLVE) clearSpent();
    else if (dissolving >= dissolveMoteAt) {
      // (motes off the whole arrows near the camera alone, as a foe's body gives them: a thousand far off would be noise)
      for (const s of lists[1]) if (Math.random() < 0.5) dissolveMote(s);
      dissolveMoteAt += 0.12 + rand(0, 0.05);
    }
  }
  for (const s of [...moving]) {
    if (s.fade >= 0 && (s.fade += dt) >= FADE) { remove(s); continue; }
    if (s.mode === 'body' && s.gone!()) release(s);
    else if (s.mode === 'loose') fall(s, dt);
    write(s);
    if (s.fade >= 0 && s.fade >= s.moteAt) {
      dissolveMote(s);
      s.moteAt += 0.12 + rand(0, 0.05);
    }
  }
  // the whole arrow near the camera, the plain one further off
  for (const l of lists) for (let i = l.length - 1; i >= 0; i--) {
    const s = l[i], want = nearCam(s, s.lod);
    if (want !== s.lod) { unplace(s); place(s, want); write(s); }
  }
  // a prop that broke drops what stood in it
  for (const s of order) if (s.prop && s.mode === 'fixed' && s.prop.prop?.broken) { s.prop = undefined; loosen(s, _d.set(0, 0, 0)); }
  return total() > 0;
}

/** A bright mote lifts off the arrow as its body dissolves. */
function dissolveMote(s: Spent): void {
  const at = _p.copy(s.p).addScaledVector(_d.copy(FWD).applyQuaternion(s.q), rand(-ARROW / 2, ARROW / 2));
  particles.glow.spawn({
    x: at.x + rand(-0.035, 0.035), y: at.y + rand(-0.025, 0.025), z: at.z + rand(-0.035, 0.035),
    vx: rand(-0.18, 0.18), vy: rand(0.35, 0.85), vz: rand(-0.18, 0.18),
    life: rand(0.35, 0.7), size: rand(0.045, 0.085), sizeEnd: 0,
    color: DISSOLVE_COLOR, colorEnd: DISSOLVE_END, drag: 0.6,
  });
}

/** An arrow riding a body lets go: it falls from where it was. */
function release(s: Spent): void {
  _m.multiplyMatrices(s.on!.matrixWorld, s.local!);
  _m.decompose(s.p, s.q, _s);
  s.on = s.local = s.gone = undefined;
  loosen(s, _d.set(rand(-0.5, 0.5), rand(0, 0.8), rand(-0.5, 0.5)));
}

function loosen(s: Spent, v: THREE.Vector3): void {
  s.mode = 'loose';
  s.v = v.clone();
  s.w = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(3, 8));
  moving.add(s);
}

/** A loose arrow's flight: falling and tumbling, glancing off props and the wall, bouncing on the floor until it lies still. */
function fall(s: Spent, dt: number): void {
  const v = s.v!, w = s.w!;
  v.y -= GRAVITY * dt;
  s.p.addScaledVector(v, dt);
  const wl = w.length();
  if (wl > 1e-4) s.q.premultiply(_q.setFromAxisAngle(_d.copy(w).divideScalar(wl), wl * dt));
  // (off a prop it falls against: out of its circle, its speed into it turned back)
  for (const o of G.arena.obstacles) {
    if (o.h < s.p.y) continue;
    const dx = s.p.x - o.x, dz = s.p.z - o.z, d = Math.hypot(dx, dz);
    if (d >= o.r || d < 1e-6) continue;
    const nx = dx / d, nz = dz / d, vn = v.x * nx + v.z * nz;
    s.p.x = o.x + nx * o.r; s.p.z = o.z + nz * o.r;
    if (vn < 0) { const e = restitution(BOUNCE, BOUNCE_V, -vn); v.x -= (1 + e) * vn * nx; v.z -= (1 + e) * vn * nz; }
  }
  // (and off the wall as it's drawn, a gate's portal too: what falls in the arena stays there, kept off the thicket's
  // rocks as off its bushes; what glanced off something past the wall, over it, falls where it is)
  if (Math.hypot(s.p.x, s.p.z) < G.arena.wall.reachAt(s.p.x, s.p.z) + OVER_WALL) {
    const x = s.p.x, z = s.p.z;
    G.arena.wall.keepIn(s.p, SHAFT);
    const push = _n.set(s.p.x - x, 0, s.p.z - z).length();
    const vn = push > 1e-6 ? v.dot(_n.divideScalar(push)) : 0;
    if (vn < 0) v.addScaledVector(_n, -(1 + restitution(BOUNCE, BOUNCE_V, -vn)) * vn);
  }
  const g = groundHeight(s.p.x, s.p.z) + LIE_H;
  if (s.p.y > g) return;
  s.p.y = g;
  if (Math.hypot(v.x, v.y, v.z) < SETTLE_V) {
    // lying along the floor the way it points, rolled a little onto its vanes
    _d.copy(FWD).applyQuaternion(s.q).setY(0);
    if (_d.lengthSq() < 1e-6) _d.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    s.q.setFromUnitVectors(FWD, _d.normalize()).multiply(_q.setFromAxisAngle(FWD, rand(-0.6, 0.6)));
    s.tip.copy(s.p);
    s.mode = 'fixed'; s.v = s.w = undefined;
    moving.delete(s);
    return;
  }
  v.y = -v.y * restitution(BOUNCE, BOUNCE_V, -v.y); v.x *= FRICTION; v.z *= FRICTION;
  w.multiplyScalar(SPIN_KEEP);
}

/** An arrow into the ground or a prop: its point at `tip` going `dir` (unit), sunk `sink`; it drops if `prop` breaks. */
export function stickAt(tip: THREE.Vector3, dir: THREE.Vector3, sink: number, prop?: Obstacle): void {
  const q = new THREE.Quaternion().setFromUnitVectors(FWD, dir), at = tip.clone().addScaledVector(dir, sink);
  add({ mode: 'fixed', p: at.clone().addScaledVector(dir, -ARROW / 2), q, tip: at, prop });
}

/** An arrow glancing off stone at `at`, which faces `normal`: it springs off with what's left of `vel` and tumbles down. */
export function glance(at: THREE.Vector3, vel: THREE.Vector3, normal: THREE.Vector3): void {
  const vn = vel.dot(normal), e = restitution(GLANCE, GLANCE_V, vel.length());
  const v = vel.clone().addScaledVector(normal, -vn).multiplyScalar(e).addScaledVector(normal, Math.abs(vn) * e * GLANCE_UP);
  // (scattered a little: stone isn't flat)
  v.x += rand(-1, 1) * 0.15 * v.length(); v.z += rand(-1, 1) * 0.15 * v.length();
  const dir = vel.clone().normalize();
  const s = add({ mode: 'loose', p: at.clone().addScaledVector(dir, -ARROW / 2).addScaledVector(normal, 0.03), q: new THREE.Quaternion().setFromUnitVectors(FWD, dir), tip: at.clone() });
  s.v = v;
  s.w = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(8, 18));
  sfx.ricochet();
}

const ray = new THREE.Raycaster(), _hits: THREE.Intersection[] = [];
const shown = (o: THREE.Object3D): boolean => { for (let e: THREE.Object3D | null = o; e; e = e.parent) if (!e.visible) return false; return true; };
/** what an arrow can lodge in: a solid, opaque mesh (not a glow, an aura or a see-through effect) */
function solid(o: THREE.Object3D): boolean {
  const m = o as THREE.Mesh;
  if (!m.isMesh || o.userData.noStick) return false;
  const mt = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.Material;
  return mt.blending === THREE.NormalBlending && !(mt.transparent && mt.opacity < 0.9) && shown(o);
}
/** The nearest solid surface the ray meets on `root`'s rigid meshes (each on the joint it moves with). The skinned ones,
 *  which bend across the joints, are left out: a ray costs 1 to 9 ms against them, every vertex moved by its bones first,
 *  to the rigid ones' tenth of a millisecond. */
function cast(root: THREE.Object3D, by: THREE.Raycaster = ray): THREE.Intersection | null {
  _hits.length = 0;
  root.traverse((o) => { if (!(o as THREE.SkinnedMesh).isSkinnedMesh && solid(o)) (o as THREE.Mesh).raycast(by, _hits); });
  let best: THREE.Intersection | null = null;
  for (const h of _hits) if (!best || h.distance < best.distance) best = h;
  return best;
}

/** The nearest solid surface `by` meets on a body (`root`): its rigid meshes as they're drawn, its skinned ones by a box
 *  a bone (models/hulls.ts): the aim as it's drawn. */
export function castSolid(root: THREE.Object3D, by: THREE.Raycaster): THREE.Intersection | null {
  _hits.length = 0;
  root.traverse((o) => {
    if (!solid(o)) return;
    if (!(o as THREE.SkinnedMesh).isSkinnedMesh) { (o as THREE.Mesh).raycast(by, _hits); return; }
    const h = hullHit(o as THREE.SkinnedMesh, by);
    if (h) _hits.push(h);
  });
  let best: THREE.Intersection | null = null;
  for (const h of _hits) if (!best || h.distance < best.distance) best = h;
  return best;
}

/**
 * An arrow into a body (`root`, a foe's model): cast along `dir` from `from` (a point before it), it lodges where it
 * meets the first solid surface, riding the piece it struck (on its joint), until `gone` says the body has let go.
 * Returns whether it found the body.
 */
export function stickIn(root: THREE.Object3D, from: THREE.Vector3, dir: THREE.Vector3, gone: () => boolean): boolean {
  ray.set(from, dir); ray.far = 3;
  const hit = cast(root);
  if (!hit) return false;
  const on = hit.object;
  const tip = hit.point.clone().addScaledVector(dir, SINK.body);
  const q = new THREE.Quaternion().setFromUnitVectors(FWD, dir), p = tip.clone().addScaledVector(dir, -ARROW / 2);
  on.updateWorldMatrix(true, false);
  const local = new THREE.Matrix4().copy(on.matrixWorld).invert().multiply(_m.compose(p, q, ONE));
  add({ mode: 'body', p, q, tip, on, local, gone });
  return true;
}

/**
 * Where an arrow meeting a prop at `at` (on its rough circle) going `dir` really meets it: the first surface of what the
 * prop draws along the arrow's line through `at`, and the face's normal there (into `normal`). Null if the line misses
 * what it draws (the circle is rounder than the prop): it's met where the circle has it.
 */
export function propSurface(o: Obstacle, at: THREE.Vector3, dir: THREE.Vector3, normal: THREE.Vector3): THREE.Vector3 | null {
  if (!o.prop) return null;
  ray.set(_p.copy(at).addScaledVector(dir, -PROP_REACH), dir); ray.far = PROP_REACH * 2;
  _hits.length = 0;
  o.prop.raycast(ray, _hits);
  let best: THREE.Intersection | null = null;
  for (const h of _hits) if (!best || h.distance < best.distance) best = h;
  if (!best) return null;
  if (best.face) normal.copy(best.face.normal).transformDirection(best.object.matrixWorld); else normal.copy(dir).negate();
  // (a face seen from behind, a double-sided card: turned to face the arrow)
  if (normal.dot(dir) > 0) normal.negate();
  return best.point.clone();
}

/** What the floor is made of under a point: the dais is stone, the rest is the biome's. */
export const floorIsStone = (x: number, z: number): boolean => groundHeight(x, z) > 0 || BIOMES[G.arena.biome].surface.floor === 'stone';
/** What a prop is made of: stone unless it's wood, a cap or embers (which an arrow goes into). */
export const propIsStone = (o: Obstacle): boolean => (o.prop?.kind ?? 'stone') === 'stone';

/** The spent arrows by what they're doing (standing in the ground or a prop, riding a body, falling, fading) and how many are drawn whole, for the probes. */
export function spentStats(): { all: number; fixed: number; inProp: number; body: number; loose: number; fading: number; near: number } {
  const n = { all: total(), fixed: 0, inProp: 0, body: 0, loose: 0, fading: 0, near: lists[1].length };
  for (const s of [...lists[0], ...lists[1]]) {
    if (s.fade >= 0) n.fading++;
    else if (s.mode === 'fixed') { n.fixed++; if (s.prop) n.inProp++; }
    else n[s.mode]++;
  }
  return n;
}

/** The old floor and props aren't there after a biome switch, so remove their arrows immediately. */
export function clearSpent(): void {
  for (const l of lists) for (const s of [...l]) remove(s);
  dissolving = -1;
  kit.u.uDissolve.value = 0;
}
on('biomeChanged', clearSpent);

/** Every spent arrow dissolving, as a killed foe's body does, and then gone (one shot meanwhile dissolves with them). */
export function dissolveSpent(): void {
  if (!total() || dissolving >= 0) return;
  dissolving = 0;
  dissolveMoteAt = rand(0.03, 0.16);
}
// As the wave is won, and again as the next starts (what was shot between them): every game hears both, the host's and
// each guest's (game/run.ts, net/sync.ts), at every quality level.
on('waveCleared', dissolveSpent);
on('waveStarted', dissolveSpent);

/** Every spent arrow's middle and its point (for the probes: where they lie against the floor, the props and the wall). */
export const spentPoints = (): { p: THREE.Vector3; tip: THREE.Vector3; mode: Mode; fading: boolean; on?: THREE.Object3D }[] =>
  [...lists[0], ...lists[1]].map((s) => ({ p: s.p, tip: s.tip, mode: s.mode, fading: s.fade >= 0, on: s.on }));

