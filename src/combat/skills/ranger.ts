// Bow shots; damage follows the usual co-op authority checks. An arrow flies as one does: as fast as the draw sent it
// (a bow's string drives it about in proportion to how far it was drawn), on the lower ballistic arc that crosses its
// target at a man's chest, turning to follow its path, and where it ends it stays (fx/stuckArrows): in the ground, a
// wooden prop, the thicket, a tree beyond it or a foe's body, or off stone onto the floor. The wall is met where it's
// drawn (world/wall.ts): an arrow over it flies on. The ranger's
// other skills: arrowRain.ts, quarryMark.ts, strawman.ts.
import * as THREE from 'three';
import { G } from '../../state';
import { spawnProjectile, type Projectile } from '../projectiles';
import { hitEnemy } from '../damage';
import type { Blow } from '../fling';
import { addEffect } from '../../fx/effects';
import { nearGlow } from '../../core/materials';
import { burst, debris, particles, col } from '../../fx/particles';
import { sfx } from '../../core/audio';
import { groundHeight } from '../../world/arena';
import { arrowGeometry, ARROW, pullAt } from '../../entities/models/bow';
import { glintMotes, warmGlintMotes } from '../../fx/glintMotes';
import { showLaser, warmLaser, LASER_POINTS } from '../../fx/aimLaser';
import { entry, strikesBody } from '../strikes';
import { arrowMat, stickAt, stickIn, glance, floorIsStone, propIsStone, propSurface, warmStuck, SINK } from '../../fx/stuckArrows';
import { pastWall } from '../../world/edge';
import { FOUNTAIN, inBasin } from '../../world/fountain';
import { wallHit } from '../../world/wall';
import { clamp, rand } from '../../util';
import { FULL_DRAW } from '../../data/balance';
import type { Obstacle } from '../../types';
import type { Enemy } from '../../entities/enemy';
import type { Player } from '../../entities/player';
import type { InstantSkill, Needs } from './types';

export const GRAVITY = 9.81;
/** a shot goes through the point aimed at, as though it were no nearer than NEAR (m), no steeper than MAX_PITCH (rad: out
 *  of the draw's reach it falls short) and no further down than MIN_PITCH */
const NEAR = 0.5, MIN_PITCH = -0.6;
export const MAX_PITCH = 0.6;
export const FWD = new THREE.Vector3(0, 0, 1);
const _v = new THREE.Vector3(), _p = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _n = new THREE.Vector3();
export { arrowMat };
export const arrowMesh = (): THREE.Mesh => new THREE.Mesh(arrowGeometry(), arrowMat);
/** an arrow out through a gate, under its arch, is gone this far past the wall (m) */
const GATE_DEPTH = 2, GATE_TOP = 4.5;
/** an arrow's flight ends this far out whatever happens (m): past the furthest trees round the Thornwood */
export const ARROW_EDGE = 62;

/** a streak of light behind an arrow (a shaft is a few pixels from the top-down view, and a fast one is gone in two frames):
 *  two crossed strips along +z from its tail (z = -1, dark: it's added light) to its point (z = 0, bright), seen from any side */
export const streakGeo = (() => {
  const pos: number[] = [], col: number[] = [], w = 0.05;
  for (const [ax, ay] of [[1, 0], [0, 1]]) {
    const v = (sx: number, z: number) => [sx * w * ax, sx * w * ay, z];
    for (const q of [v(-1, -1), v(1, -1), v(1, 0), v(-1, -1), v(1, 0), v(-1, 0)]) { pos.push(...q); const b = q[2] === 0 ? 1 : 0; col.push(b, b, b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
})();
const streakOf = (color: number, k: number, opacity = 1) => nearGlow(new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), vertexColors: true, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
export const streakMat = streakOf(0xe6efc4, 2.2);

/** The angle above level (the lower of the two arcs) that takes an arrow at `v` from `from` through `target`, the point
 *  aimed at (`y` its height over the floor under it): the floor, a log, a foe's head, whatever was under the aim (aimed at
 *  a man's chest over the floor, a log was shot over and a shot at the floor flew on). No steeper than MAX_PITCH (out of
 *  the draw's reach it falls short) and no further down than MIN_PITCH (the pose's reach). */
export function launchPitch(from: THREE.Vector3, target: THREE.Vector3, v: number): number {
  const d = Math.max(NEAR, Math.hypot(target.x - from.x, target.z - from.z)), h = groundHeight(target.x, target.z) + target.y - from.y;
  const v2 = v * v, disc = v2 * v2 - GRAVITY * (GRAVITY * d * d + 2 * h * v2);
  return disc < 0 ? MAX_PITCH : clamp(Math.atan((v2 - Math.sqrt(disc)) / (GRAVITY * d)), MIN_PITCH, MAX_PITCH);
}

/** An arrow coming down at `tip` going `dir` at `vel`: into the ground, or off it if it's stone. */
export function intoGround(tip: THREE.Vector3, vel: THREE.Vector3): void {
  tip.y = groundHeight(tip.x, tip.z);
  if (floorIsStone(tip.x, tip.z)) glance(tip, vel, _n.set(0, 1, 0));
  else stickAt(tip, _d.copy(vel).normalize(), SINK.ground);
}

/** Whether an arrow's point at `at` is in the village fountain's water. */
export const inWater = (at: THREE.Vector3): boolean => G.arena.place === 'village' && at.y <= FOUNTAIN.water && inBasin(at.x, at.z);

/** how steep an arrow rests on the basin's floor, a share straight down: the water takes its speed and it settles leaning,
 *  all of it under the surface (standing, half of it rose out of the water and read as drawn over it, a review); how far it
 *  stays off the pedestal and the basin's wall (m), and how far its point goes into the floor */
const RESTS_AT = -0.4;
const OFF_PEDESTAL = 0.62;
const OFF_RIM = 0.1;
const INTO_BASIN = 0.02;
const _down = new THREE.Vector3();
const _floor = new THREE.Vector3();

/** An arrow into the water at `at` going `vel`: a splash, and it rests on the basin's floor there, under the water (from
 *  play, "arrow rain should cause some arrows underwater"). */
export function intoWater(at: THREE.Vector3, vel: THREE.Vector3): void {
  debris(_floor.set(at.x, FOUNTAIN.water, at.z), { count: 6, color: 0xcfe4e8, speed: 1.6, size: 0.06, life: 0.4 });
  _down.copy(vel).setY(0).normalize().multiplyScalar(Math.sqrt(1 - RESTS_AT * RESTS_AT)).setY(RESTS_AT);
  _floor.copy(at).setY(FOUNTAIN.floor);
  const out = Math.hypot(_floor.x, _floor.z) || 1;
  const kept = clamp(out, OFF_PEDESTAL, (FOUNTAIN.r - FOUNTAIN.rim) * Math.cos(Math.PI / 8) - OFF_RIM) / out;
  _floor.x *= kept;
  _floor.z *= kept;
  stickAt(_floor, _down, INTO_BASIN);
}

/** An arrow into a prop met on its circle at `at`, going `vel`: off it if it's stone, else into it (and down with it when it
 *  breaks), where it draws its surface. False if the arrow's line misses what it draws (past a log's end, between a
 *  cluster's caps): it flies on (dropped there, it lay on the floor short of the log). */
export function intoProp(o: Obstacle, at: THREE.Vector3, vel: THREE.Vector3): boolean {
  // (where it really meets the prop: met on its circle, an arrow went most of its length into a stump wider than that)
  const dir = _d.copy(vel).normalize(), hit = propSurface(o, at, dir, _n);
  if (!hit) return false;
  if (propIsStone(o)) glance(hit, vel, _n);
  else stickAt(hit, dir, SINK.prop, o);
  return true;
}

/** An arrow into a foe, struck at `at` going `vel`: it lodges in the body where it meets it, riding it until the body
 *  dissolves; if the line misses the body's surface (the foe's circle is rounder than it), aimed in at its middle. */
/** An arrow's blow on what it kills: carried on along its flight, rising or falling as it flew (one coming down from
 *  high hardly throws it at all: it drops where it stood), where it struck. */
export function arrowBlow(e: Enemy, at: THREE.Vector3, vel: THREE.Vector3, force: number): Blow {
  const flat = Math.hypot(vel.x, vel.z) || 1e-3;
  return {
    dir: { x: vel.x, z: vel.z }, lift: clamp(vel.y / flat, -0.8, 0.4) + 0.12, force: force * Math.max(0.25, flat / (vel.length() || 1)),
    at: clamp((at.y - e.obj.position.y) / e.height, 0, 1), on: { x: at.x, z: at.z },
  };
}

export function intoFoe(e: Enemy, at: THREE.Vector3, vel: THREE.Vector3): void {
  // (it rides the body as it falls, until the body dissolves)
  const dir = _d.copy(vel).normalize(), gone = () => !e.obj.parent || (!e.alive && e.model.kit.u.uDissolve.value > 0.25);
  if (stickIn(e.obj, _e.copy(at).addScaledVector(dir, -2), dir, gone)) return;
  const y = clamp(at.y, e.obj.position.y + e.height * 0.2, e.obj.position.y + e.height * 0.85);
  _v.set(e.pos.x - at.x, 0, e.pos.z - at.z);
  if (_v.lengthSq() < 1e-6) _v.set(-dir.x, 0, -dir.z);
  _v.normalize();
  stickIn(e.obj, _e.set(e.pos.x - _v.x * (e.radius + 1), y, e.pos.z - _v.z * (e.radius + 1)), _v, gone);
}

const _hit = wallHit();
/** Whether a flight's step from `a` to `b` goes out through a gate, under its arch, into the portal: it's gone. */
function throughGate(a: THREE.Vector3, b: THREE.Vector3): boolean {
  const w1 = pastWall(G.arena.biome, b.x, b.z, _n);
  if (!w1.gate || w1.by <= GATE_DEPTH || b.y > GATE_TOP) return false;
  return pastWall(G.arena.biome, a.x, a.z, _n).by <= GATE_DEPTH;
}

type BowDef = Needs<'damage' | 'missiles' | 'spread' | 'speed' | 'range'>;
/** an arrow's speed at a draw `k` (0..1 of its time) */
const arrowSpeed = (def: BowDef, k: number): number => def.speed * pullAt(k);

const _prev = new THREE.Vector3();
/** An arrow's flight each frame: falling, turning to follow its path (its vanes keep it so), into the ground point first
 *  (off it on stone), and into the wall where it's drawn (off it if it's stone, into the thicket or a tree beyond it)
 *  or out through a gate. */
function fly(proj: Projectile, dt: number): void {
  _prev.copy(proj.pos).addScaledVector(proj.vel, -dt);
  proj.vel.y -= GRAVITY * dt;
  _v.copy(proj.vel).normalize();
  proj.mesh.quaternion.setFromUnitVectors(FWD, _v);
  _p.copy(proj.pos).addScaledVector(_v, ARROW / 2);
  if (_p.y <= groundHeight(_p.x, _p.z)) { intoGround(_p, proj.vel); proj.kill(); return; }
  if (inWater(_p)) { intoWater(_p, proj.vel); proj.kill(); return; }
  _prev.addScaledVector(_v, ARROW / 2);
  if (throughGate(_prev, _p)) { proj.kill(); return; }
  if (!G.arena.wall.cast(_prev, _p, _hit)) return;
  if (_hit.stone) glance(_hit.point, proj.vel, _hit.normal);
  else stickAt(_hit.point, _v, SINK.prop);
  proj.kill();
}

/** An arrow meeting a prop: where its point crossed into the prop's circle on the step from `from`. */
function arrowProp(o: Obstacle, proj: Projectile, from: THREE.Vector3): boolean {
  const dx = proj.pos.x - from.x, dz = proj.pos.z - from.z;
  const t = Math.max(0, entry(from.x, from.z, dx, dz, o.x, o.z, o.r));
  return intoProp(o, _p.lerpVectors(from, proj.pos, t), proj.vel);
}

/** An arrow's way off the bow: heading `yaw`, `pitch` above level. */
const shotDir = (yaw: number, pitch: number): THREE.Vector3 => new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));

const warmArrows = (): THREE.Object3D[] => [arrowMesh(), ...warmStuck(), new THREE.Mesh(streakGeo, streakOf(GLINT, 1)), ...warmLaser(), ...warmGlintMotes()];

/** the aim preview's flight is stepped as the arrow's is, a frame at 60 fps (swept, as its collisions are) */
const PREVIEW_DT = 1 / 60;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Vector3(), _wn = new THREE.Vector3();
const _tip = new THREE.Vector3(), _f = new THREE.Vector3();


/**
 * The path an arrow loosed now would fly (as `fly` and the projectile's own collisions have it): from `origin` along
 * `dir` at `v`, falling, until it sticks in the ground, meets a prop it doesn't clear or the arena's edge, or (unless it
 * goes on through them) a foe. Returns its points and where it strikes (null if it only runs out).
 */
function flightPath(origin: THREE.Vector3, dir: THREE.Vector3, v: number, radius: number, level: boolean, pierce: boolean): { pts: THREE.Vector3[]; end: THREE.Vector3 | null } {
  const pts = [origin.clone()], pos = _a.copy(origin), vel = _w.copy(dir).multiplyScalar(v), passed = new Set<Obstacle>();
  while (pts.length < LASER_POINTS) {
    // (in the projectile's order: it moves, then falls, as `fly` follows its move)
    const px = pos.x, py = pos.y, pz = pos.z;
    pos.addScaledVector(vel, PREVIEW_DT);
    vel.y -= GRAVITY * PREVIEW_DT;
    const dx = pos.x - px, dz = pos.z - pz;
    // the first thing the step meets: the ground (the point half an arrow ahead), the edge, a prop, a foe
    let t = 2;
    _b.copy(vel).normalize().multiplyScalar(ARROW / 2).add(pos);
    if (_b.y <= groundHeight(_b.x, _b.z)) {
      // (where between the step's ends the point went under)
      const g0 = py + (_b.y - pos.y) - groundHeight(px, pz), g1 = _b.y - groundHeight(_b.x, _b.z);
      t = g0 > 0 ? g0 / (g0 - g1) : 0;
    }
    if (inWater(_b)) {
      const g0 = py + (_b.y - pos.y) - FOUNTAIN.water, g1 = _b.y - FOUNTAIN.water;
      t = Math.min(t, g0 > 0 ? g0 / (g0 - g1) : 0);
    }
    // (the wall where it's drawn, by the arrow's point as `fly` has it: out through a gate the path just ends)
    _c.set(px, py, pz).addScaledVector(_e.copy(vel).normalize(), ARROW / 2);
    if (throughGate(_c, _b)) return { pts, end: null };
    if (G.arena.wall.cast(_c, _b, _hit)) t = Math.min(t, _hit.t);
    const low = pos.y - radius * 0.5;
    for (const o of G.arena.obstacles) {
      if (o.h <= low || passed.has(o)) continue;
      const k = entry(px, pz, dx, dz, o.x, o.z, o.r + radius * 0.5);
      if (k < 0 || k >= t) continue;
      // (as the arrow has it: past a prop whose line misses what it draws, a log's end, between a cluster's caps)
      const c = Math.max(0, entry(px, pz, dx, dz, o.x, o.z, o.r));
      if (!propSurface(o, _c.set(px + dx * c, py + (pos.y - py) * c, pz + dz * c), _e.copy(vel).normalize(), _wn)) { passed.add(o); continue; }
      t = k;
    }
    // (a foe as the projectile strikes it: an arrow where its point meets its body, `strikesBody`)
    if (!pierce) for (const en of G.enemies) {
      if (!en.alive || en.invulnerable) continue;
      const k = level ? strikesBody(en, _c.set(px, py, pz).add(_tip.subVectors(_b, pos)), _f.copy(pos).add(_tip), radius * 0.5) : entry(px, pz, dx, dz, en.pos.x, en.pos.z, en.radius + radius);
      if (k < 0 || k >= t) continue;
      t = k;
    }
    if (t <= 1) {
      const end = new THREE.Vector3(px + dx * t, py + (pos.y - py) * t, pz + dz * t);
      pts.push(end);
      return { pts, end };
    }
    pts.push(pos.clone());
  }
  return { pts, end: null };
}

/** The aim preview of a drawn shot on the local hero's own screen: each arrow's path if it were loosed now
 *  (no weaker than the least draw, as it would leave), shown through `fx/aimLaser`. */
function previewShot(player: Player, def: BowDef, k: number, radius: number, level: boolean, pierce: boolean): void {
  if (!player.local) return;
  const origin = player.castPoint, target = player.aim, v = arrowSpeed(def, Math.max(k, def.minDraw ?? 0));
  const yaw = player.shotHeading(origin, target), pitch = launchPitch(origin, target, v);
  const paths = [];
  for (let i = 0; i < def.missiles; i++) paths.push(flightPath(origin, shotDir(yaw + (i - (def.missiles - 1) / 2) * def.spread, pitch), v, radius, level, pierce));
  showLaser(paths);
}

/** a piercing shot's tracer: its longest (m), and how long it fades once the arrow's gone (s) */
const TRACE = 14, TRACE_FADE = 0.3;
const GLINT = 0xf3dc9a;

/** how far each hero's shot was drawn last frame (its ready sound as it reaches full) */
const drawnTo = new WeakMap<Player, number>();
/**
 * Every drawn shot's arrowhead once the bow is drawn to full, the sign the shot strikes hardest (Lancewood Shot
 * harder still): motes of light drawn in onto it until it's loosed (fx/glintMotes.ts, seen in every view), and the
 * bow's ready sound as it comes to full. Nothing while it's drawn: shown then too, the light didn't say when it was
 * full. (Glow particles fade out within 3.5 m of the camera, so through the eyes they showed nothing; a star of light
 * on the head and bursts of glints as it came to full read as a bright spark.)
 */
function drawGlint(player: Player, k: number): void {
  const was = drawnTo.get(player) ?? 0;
  drawnTo.set(player, k);
  if (k < FULL_DRAW) return;
  glintMotes(player);
  if (was < FULL_DRAW && player.local) sfx.bowReady();
}

/** a drawn shot's damage drawn less than full: the square of the draw (`cast`) */
const SHORT_DRAW = 'less drawn short';

export const bowShot: InstantSkill = {
  anim: 'bow', warm: warmArrows,
  pitch: (player, def, k, target) => launchPitch(player.castPoint, target, arrowSpeed(def as BowDef, k)),
  hits(rawDef) {
    const def = rawDef as BowDef;
    const arrows = def.missiles > 1 ? `${def.missiles} arrows, ` : '';
    return [{ per: 'arrow', base: def.damage, least: 0, type: 'physical', note: `${arrows}at full draw, ${SHORT_DRAW}` }];
  },
  charging(player, def, k) {
    previewShot(player, def as BowDef, k, 0.22, true, false);
    drawGlint(player, k);
  },
  cast(player, rawDef, target, power) {
    const def = rawDef as BowDef, origin = player.castPoint, pull = pullAt(power), v = arrowSpeed(def, power);
    drawnTo.delete(player);
    // (the string gives the arrow the energy the bow stored, which goes with the square of the draw: that is its blow)
    const damage = def.damage * pull * pull, knock = (def.knock ?? 0) * pull;
    const yaw = player.shotHeading(origin, target), pitch = launchPitch(origin, target, v);
    // (a volley seen coming as one: entities/evade.ts)
    const judged = new Set<Enemy>();
    for (let i = 0; i < def.missiles; i++) {
      const dir = shotDir(yaw + (i - (def.missiles - 1) / 2) * def.spread, pitch);
      const mesh = arrowMesh(); mesh.quaternion.setFromUnitVectors(FWD, dir);
      spawnProjectile({
        pos: origin, dir, speed: v, radius: 0.22, life: 4, mesh, color: 0xd3bf8d, swept: true, level: true, point: ARROW / 2, tick: fly, edge: ARROW_EDGE, onProp: arrowProp, by: player, judged,
        onHit(enemy, proj) {
          intoFoe(enemy as Enemy, proj.pos, proj.vel);
          hitEnemy(enemy as Enemy, damage, { by: player, skill: def, tags: def.tags, type: 'physical', knock,
            from: { x: proj.pos.x - proj.vel.x, z: proj.pos.z - proj.vel.z }, blow: arrowBlow(enemy as Enemy, proj.pos, proj.vel, 0.9) });
          burst(proj.pos, { count: 6, color: 0xd3bf8d, speed: 2, life: 0.2, size: 0.07 });
          sfx.boltHit();
        },
      });
    }
    sfx.bow();
  },
};

/**
 * Lancewood Shot: drawn while held like any shot, and driven through every foe in its line, each one it passes
 * through taking less (`falloff`); loosed at full draw it strikes harder (`fullBonus`), its arrowhead glinting there
 * as every drawn shot's does. Props and walls still stop it.
 */
export const piercingShot: InstantSkill = {
  anim: 'bow', warm: warmArrows, pitch: bowShot.pitch,
  hits(rawDef) {
    const def = rawDef as BowDef & Needs<'falloff'>;
    const bonus = def.fullBonus ?? 0;
    const shares = def.falloff.map((share) => `${Math.round(share * 100)}%`).join(', ');
    const note = `at full draw (+${Math.round(bonus * 100)}%), ${SHORT_DRAW}; each foe it passes through takes less: ${shares}`;
    return [{ per: 'foe', base: def.damage * (1 + bonus), least: 0, type: 'physical', note }];
  },
  charging(player, def, k) {
    previewShot(player, def as BowDef, k, 0.24, false, true);
    drawGlint(player, k);
  },
  cast(player, rawDef, target, power) {
    const def = rawDef as BowDef & Needs<'falloff'>, origin = player.castPoint, pull = pullAt(power), v = arrowSpeed(def, power);
    const full = power >= FULL_DRAW;
    drawnTo.delete(player);
    const damage = def.damage * pull * pull * (full ? 1 + (def.fullBonus ?? 0) : 1), knock = (def.knock ?? 0) * pull;
    const dir = shotDir(player.shotHeading(origin, target), launchPitch(origin, target, v));
    const mesh = arrowMesh(); mesh.quaternion.setFromUnitVectors(FWD, dir);
    let through = 0;
    const pr = spawnProjectile({
      // (through everything on its line, short foes too: it flies near level, and over the nearest heads a line shot missed them)
      pos: origin, dir, speed: v, radius: 0.24, life: 3, mesh, color: 0xd3bf8d, swept: true, pierce: true, tick: fly, edge: ARROW_EDGE, onProp: arrowProp, by: player,
      trail: { color: GLINT, colorEnd: 0x5a4020, intensity: full ? 1.3 : 0.55, size: full ? 0.13 : 0.08, rate: full ? 90 : 40, life: 0.28 },
      onHit(enemy, proj) {
        const share = def.falloff[Math.min(through++, def.falloff.length - 1)];
        hitEnemy(enemy as Enemy, damage * share, { by: player, skill: def, tags: def.tags, type: 'physical', knock: knock * share,
          from: { x: proj.pos.x - proj.vel.x, z: proj.pos.z - proj.vel.z }, blow: arrowBlow(enemy as Enemy, proj.pos, proj.vel, full ? 1.3 : 1) });
        burst(proj.pos, { count: 8, color: 0xd3bf8d, speed: 2.4, life: 0.22, size: 0.07 });
        debris(proj.pos, { count: 3, color: 0x6a4a2a, speed: 2, size: 0.05, life: 0.5 });
        sfx.boltHit();
      },
    });
    // its line through the pack, a streak behind the arrow from the bow, fading once it's down
    const mat = streakOf(GLINT, full ? 1.6 : 0.9), trace = new THREE.Mesh(streakGeo, mat), from = origin.clone();
    trace.frustumCulled = false; G.scene.add(trace);
    let gone = 0;
    addEffect({
      update(dt) {
        if (pr.alive) {
          _d.copy(pr.pos).addScaledVector(_e.copy(pr.vel).normalize(), ARROW / 2);
          trace.position.copy(_d); trace.quaternion.setFromUnitVectors(FWD, _e);
          trace.scale.set(full ? 1.4 : 1, full ? 1.4 : 1, Math.min(TRACE, _d.distanceTo(from)));
        } else gone += dt;
        mat.opacity = 1 - gone / TRACE_FADE;
        return gone < TRACE_FADE;
      },
      dispose() { G.scene.remove(trace); mat.dispose(); },
    });
    if (full) sfx.pierce(); else sfx.bow();
  },
};
