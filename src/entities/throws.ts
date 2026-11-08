// What the slamming foes throw at a hero too far off to slam (`EnemyDef.throws`; the owner's words: "lava giants in
// crypt should throw lava chunks at player's location, at ballistic trajectory, if far from player --- and large tree
// enemies in forest throw a vine that sprawls on ground, ignoring obstacles in a straight line, that makes player bound
// to the ground for 1.5sec").
// - The Cinder Brute's lava chunk flies on a ballistic arc to where the hero stood as it left the hand, its landing
//   marked on the floor while it flies (he dodges it by stepping off), bursts there and leaves a pool that burns.
// - The Barkhide Hulk's vine creeps out along the floor in a line, through every prop, at about a bolt's speed: a hero
//   any of it reaches, as it comes or as he steps on it while it lies there, is held to the ground (`Player.root`),
//   coils erupting from the floor under him; he dodges it by stepping out of its way as it comes and keeping off it,
//   and a dash or a blink tears him free. An arrow that meets it low over the floor cuts it, in one hit: it withers
//   at once and lets go of whoever it holds (from play: "arrows should kill the Hulk's rooting vine in one hit"; the
//   ranger has no dash). Every game flies every hero's arrows, so each cuts it as its own screen shows the arrow.
// Both are played through `fx` (enemyAI.ts), so every co-op game plays them the same from the same numbers, and each
// judges its own hero alone: hurt where `hurtPlayer` allows, rooted by its own game. A partner's copy is shown held
// as this game sees the vine reach it.
import * as THREE from 'three';
import { G } from '../state';
import { ENEMIES, type EnemyId } from '../data/enemies';
import { hurtPlayer, type Attacker } from '../combat/damage';
import { addEffect, telegraph, lavaPool, shockwave } from '../fx/effects';
import { riftBolt, riftBoltTick, riftBoltImpact } from '../fx/riftBolts';
import { groundVine, coils, type Vine } from '../fx/vine';
import { burst, debris, smokePuff } from '../fx/particles';
import { flash } from '../fx/lights';
import { addShake } from '../core/renderer';
import { sfx } from '../core/audio';
import { groundHeight } from '../world/ground';
import type { Enemy } from './enemy';
import type { Player } from './player';
import type { ThrowDef } from '../types';

/** the chunk's fall (m/s²): heavier than the world's, so its arc reads as a throw and not a float */
const FALL = 22;
/** the chunk's look: its lava, smoke and size (m) */
const LAVA = { color: 0xff6a2a, smoke: 0x1a1210, ring: 0xff6a20, size: 0.42 };
/** the vine's bark and sap, and how long it lies and withers once grown (s) */
const VINE = { bark: 0x3d4d23, sap: 0x9cff3a, lies: 1.5, withers: 0.5 };
/** what an arrow must come within of a vine to cut it: across its line (m), and over the floor (m) */
export const VINE_CUT = { reach: 0.35, high: 0.6 };
/** how fast a cut vine withers (s) */
const CUT_WITHERS = 0.25;
/** how fast the coils wind up a held hero and fall from him (s), and how high they reach (m) */
const COILS = { wind: 0.4, fall: 0.3, high: 0.95 };
/** how often a pool burns a hero standing in it (s) */
const BURN_EVERY = 0.5;

/** A throw in the air or on the floor, kept for the lab (`lab throws`) until the next ones push it out. */
export interface Thrown {
  what: ThrowDef['what'];
  /** game time it was thrown */
  at: number;
  /** where it was aimed (lava: where it lands; vine: its line's end) */
  to: { x: number; z: number };
  /** lava: the ring marking its landing (its group placed there), and where it came down */
  ring?: THREE.Object3D;
  landed?: { x: number; z: number; t: number };
  /** the chunk's mesh (lava) or the vine's */
  mesh: THREE.Object3D;
  /** the players' slots it hurt or held, and when */
  struck: { slot: number; t: number }[];
}
/** the latest throws, the newest last */
export const THROWN: Thrown[] = [];
const keep = (t: Thrown): Thrown => {
  THROWN.push(t);
  if (THROWN.length > 16) THROWN.shift();
  return t;
};

/** A vine on the floor, for an arrow to cut (`cutVineAlong`). */
interface LyingVine {
  ox: number;
  oz: number;
  dx: number;
  dz: number;
  /** how far it has crept (m) */
  grown(): number;
  /** cut where an arrow met it */
  cut(at: THREE.Vector3): void;
}
const lying = new Set<LyingVine>();

/** The closest points of segments a→b and c→d on the floor: each one's share along it, and how far apart they are. */
function closestOnFloor(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, ex: number, ez: number):
  { s: number; t: number; apart: number } {
  const ux = bx - ax, uz = bz - az, vx = ex - cx, vz = ez - cz, wx = ax - cx, wz = az - cz;
  const a = ux * ux + uz * uz, b = ux * vx + uz * vz, c = vx * vx + vz * vz, d = ux * wx + uz * wz, e = vx * wx + vz * wz;
  const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
  const den = a * c - b * b;
  let s = a < 1e-9 ? 0 : den > 1e-9 ? clamp01((b * e - c * d) / den) : 0;
  let t = c < 1e-9 ? 0 : (b * s + e) / c;
  if (t < 0 || t > 1) {
    t = clamp01(t);
    s = a < 1e-9 ? 0 : clamp01((b * t - d) / a);
  }
  const apart = Math.hypot(ax + ux * s - (cx + vx * t), az + uz * s - (cz + vz * t));
  return { s, t, apart };
}

/**
 * An arrow's step from `from` to `to` meeting a vine low over the floor: the vine cut there (withering at once and
 * letting go of whoever it holds). Returns whether it met one.
 */
export function cutVineAlong(from: THREE.Vector3, to: THREE.Vector3): boolean {
  for (const v of lying) {
    const length = v.grown();
    if (length <= 0) continue;
    const ex = v.ox + v.dx * length, ez = v.oz + v.dz * length;
    const near = closestOnFloor(from.x, from.z, to.x, to.z, v.ox, v.oz, ex, ez);
    // (where the step comes nearest it across the floor, and where the step ends: shot along the vine, the step lies
    // over it all the way, and its nearest point may be its high end)
    const end = closestOnFloor(to.x, to.z, to.x, to.z, v.ox, v.oz, ex, ez);
    for (const [s, apart] of [[near.s, near.apart], [1, end.apart]]) {
      if (apart > VINE_CUT.reach) continue;
      const at = from.clone().lerp(to, s);
      if (at.y - groundHeight(at.x, at.z) > VINE_CUT.high) continue;
      v.cut(at);
      return true;
    }
  }
  return false;
}

const throwOf = (id: number): { foe: Enemy | null; def: ThrowDef | undefined } => {
  const foe = G.enemies.find((e) => e.id === id) ?? null;
  return { foe, def: foe?.def.throws };
};

/** Where enemy `e` lets go of a throw: its throwing hand, or over its shoulder. */
export function releaseFrom(e: Enemy, out: THREE.Vector3): THREE.Vector3 {
  const hand = e.model.joints?.handR;
  if (hand) return hand.getWorldPosition(out);
  return out.set(e.pos.x, e.height * 0.9, e.pos.z);
}

/** How long a chunk thrown `d` m flies (s). */
export const lavaFlight = (def: ThrowDef, d: number): number => (def.flight?.[0] ?? 0.9) + (def.flight?.[1] ?? 0.03) * d;

/**
 * A chunk of lava from (ox, oy, oz) to land at (tx, tz) after `flight` s, thrown by foe `kind` (its `throws`) dealing
 * `damage` (`id`: the thrower, named in the battle log).
 */
export function lavaChunk(id: number, kind: EnemyId, ox: number, oy: number, oz: number, tx: number, tz: number,
  flight: number, damage: number): void {
  const def = ENEMIES[kind].throws;
  if (!def) return;
  const [splash, share] = def.splash ?? [1.8, 0.75];
  const ty = groundHeight(tx, tz);
  const vel = new THREE.Vector3((tx - ox) / flight, (ty - oy + 0.5 * FALL * flight * flight) / flight, (tz - oz) / flight);
  const pos = new THREE.Vector3(ox, oy, oz);
  const mesh = riftBolt('magma', LAVA.color, LAVA.size);
  mesh.name = 'lava chunk';
  mesh.position.copy(pos);
  G.scene.add(mesh);
  const ring = telegraph({ x: tx, z: tz }, splash, flight, LAVA.ring);
  const thrown = keep({ what: 'lava', at: G.time, to: { x: tx, z: tz }, ring: ring.group, mesh, struck: [] });
  const by: Attacker = { foe: throwOf(id).foe, attack: 'lava' };
  const acc = { t: 0, a: 0 };
  let t = 0;
  sfx.swing();
  addEffect({
    update(dt) {
      t = Math.min(flight, t + dt);
      pos.set(ox + vel.x * t, oy + vel.y * t - 0.5 * FALL * t * t, oz + vel.z * t);
      mesh.position.copy(pos);
      const v = new THREE.Vector3(vel.x, vel.y - FALL * t, vel.z);
      riftBoltTick('magma', mesh, pos, v, LAVA.color, LAVA.smoke, dt, acc);
      if (t < flight) return true;
      thrown.landed = { x: pos.x, z: pos.z, t: G.time };
      land(pos, splash, damage * share, by, thrown);
      lavaBurns(def, pos, damage, by, thrown);
      return false;
    },
    dispose() { mesh.removeFromParent(); },
  });
}

/** The chunk bursting where it came down: whoever stands in its splash is hurt, each by its own game. */
function land(pos: THREE.Vector3, splash: number, damage: number, by: Attacker, thrown: Thrown): void {
  riftBoltImpact('magma', pos, LAVA.color, LAVA.smoke, LAVA.size);
  shockwave(pos, { color: LAVA.color, intensity: 2.2, from: 0.3, to: splash * 1.1, life: 0.4 });
  debris(pos, { count: 12, speed: splash * 2 });
  flash({ color: LAVA.color, intensity: 30, distance: splash * 4, life: 0.3, pos: { x: pos.x, y: pos.y + 1, z: pos.z } });
  addShake(0.25);
  sfx.crumble();
  const p = G.player;
  if (p.active && Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z) < splash + p.radius) {
    hurtPlayer(p, damage, 'fire', pos, by);
    thrown.struck.push({ slot: p.slot, t: G.time });
  }
}

/** The pool a chunk leaves, burning whoever stands in it every `BURN_EVERY` s. */
function lavaBurns(def: ThrowDef, at: THREE.Vector3, damage: number, by: Attacker, thrown: Thrown): void {
  const [radius, life, perSecond] = def.pool ?? [1.5, 2.5, 0.3];
  const pos = at.clone();
  pos.y = groundHeight(pos.x, pos.z);
  lavaPool(pos, radius, life, LAVA.color);
  const burn: Attacker = { foe: by.foe, attack: 'burn' };
  let t = 0, next = BURN_EVERY, embers = 0;
  addEffect({
    update(dt) {
      t += dt;
      embers += dt;
      if (embers > 0.15) {
        embers = 0;
        burst(new THREE.Vector3(pos.x + (Math.random() - 0.5) * radius, pos.y + 0.1, pos.z + (Math.random() - 0.5) * radius),
          { count: 2, color: LAVA.color, speed: 1.2, life: 0.6, size: 0.12 });
      }
      if (t >= next) {
        next += BURN_EVERY;
        const p = G.player;
        if (p.active && Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z) < radius + p.radius * 0.5) {
          hurtPlayer(p, damage * perSecond * BURN_EVERY, 'fire', pos, burn);
          thrown.struck.push({ slot: p.slot, t: G.time });
        }
      }
      return t < life;
    },
  });
}

/**
 * A vine from (ox, oz) along `angle` (as a facing: atan2(dx, dz)) for `length` m, sent by foe `kind` (its `throws`):
 * it creeps out to its end, then lies a moment and withers; a hero any of it reaches until it withers (as it comes,
 * or stepping onto it) is held to the ground, once a vine.
 */
export function vineAt(kind: EnemyId, ox: number, oz: number, angle: number, length: number): void {
  const def = ENEMIES[kind].throws;
  if (!def) return;
  const [speed, reach, hold] = def.creep ?? [13, 0.6, 1.5];
  const dx = Math.sin(angle), dz = Math.cos(angle);
  const vine = groundVine(ox, oz, dx, dz, length, VINE.bark, VINE.sap);
  G.scene.add(vine.mesh);
  const thrown = keep({ what: 'vine', at: G.time, to: { x: ox + dx * length, z: oz + dz * length }, mesh: vine.mesh, struck: [] });
  const caught = new Set<Player>();
  let t = 0, held = 0, debrisT = 0, cutAt = -1;
  const onFloor: LyingVine = {
    ox, oz, dx, dz,
    grown: () => (cutAt < 0 ? vine.grow : 0),
    cut(at) {
      cutAt = t;
      lying.delete(onFloor);
      // (each game lets its own hero go: a partner's copy's coils fall as `cutAt` says)
      for (const p of caught) if (p.local) p.letGo();
      burst(at.clone().setY(groundHeight(at.x, at.z) + 0.15), { count: 14, color: VINE.sap, speed: 3, life: 0.45, size: 0.15 });
      debris(at, { count: 6, speed: 2 });
      sfx.thud();
    },
  };
  lying.add(onFloor);
  sfx.rush();
  addEffect({
    update(dt) {
      t += dt;
      vine.grow = Math.min(length, t * speed);
      debrisT += dt;
      if (vine.grow < length && debrisT > 0.05) {
        debrisT = 0;
        const x = ox + dx * vine.grow, z = oz + dz * vine.grow;
        smokePuff(new THREE.Vector3(x, groundHeight(x, z), z), { count: 1, color: 0x2a2418, size: 0.4, sizeEnd: 1, speed: 0.6, life: 0.5 });
      }
      for (const p of G.players) {
        if (caught.has(p) || !p.active || vine.wither > 0 || cutAt >= 0) continue;
        const rx = p.pos.x - ox, rz = p.pos.z - oz;
        const along = rx * dx + rz * dz, off = Math.abs(rx * dz - rz * dx);
        // anywhere along what it has laid, its head reaching a little ahead of it
        if (along < -p.radius || along > vine.grow + reach || off > reach + p.radius) continue;
        if (p.local ? !p.root(hold) : !!p.dash) continue;
        caught.add(p);
        held = Math.max(held, t + hold);
        thrown.struck.push({ slot: p.slot, t: G.time });
        coilRound(p, hold, () => cutAt >= 0);
      }
      const grown = length / speed, ends = cutAt >= 0 ? cutAt : Math.max(grown + VINE.lies, held);
      vine.wither = Math.min(1, Math.max(0, (t - ends) / (cutAt >= 0 ? CUT_WITHERS : VINE.withers)));
      vine.update(G.time);
      if (vine.wither >= 1) lying.delete(onFloor);
      return vine.wither < 1;
    },
    dispose() { lying.delete(onFloor); vine.dispose(); },
  });
}

/** The coils round a hero the vine caught: erupting from the floor under him in a burst of earth and winding up his
 *  legs, kept at his feet, and fallen off as he's let go (his own game's hold, which a dash ends; a partner's copy's
 *  by the time it holds), or the vine is `cut`. */
function coilRound(p: Player, hold: number, cut: () => boolean): void {
  const c: Vine = coils(COILS.high, VINE.bark, VINE.sap);
  G.scene.add(c.mesh);
  const until = G.time + hold;
  let t = 0, off = -1;
  sfx.thud();
  const feet = new THREE.Vector3(p.pos.x, groundHeight(p.pos.x, p.pos.z), p.pos.z);
  debris(feet, { count: 10, speed: 2.5 });
  smokePuff(feet, { count: 4, color: 0x2a2418, size: 0.5, sizeEnd: 1.4, speed: 0.8, life: 0.6 });
  addEffect({
    update(dt) {
      t += dt;
      c.mesh.position.set(p.pos.x, groundHeight(p.pos.x, p.pos.z), p.pos.z);
      c.grow = c.length * Math.min(1, t / COILS.wind);
      const holding = !cut() && (p.local ? p.rooted : G.time < until && !p.dash && p.active);
      if (!holding && off < 0) {
        off = t;
        burst(new THREE.Vector3(p.pos.x, c.mesh.position.y + 0.3, p.pos.z), { count: 10, color: VINE.sap, speed: 3, life: 0.4, size: 0.15 });
      }
      c.wither = off < 0 ? 0 : Math.min(1, (t - off) / COILS.fall);
      c.update(G.time);
      return c.wither < 1;
    },
    dispose() { c.dispose(); },
  });
}
