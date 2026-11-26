// The Rootmother's burrow (entities/rootmother.ts; her numbers `ROOTMOTHER.burrow`; from Kenneth: "instead of moving
// slowly, it teleports, just going underground, roots going into the ground, and then it appears near you. It should
// look like it actually going underground"). She never moves above ground: she goes under, travels under the floor
// and rises again near the hero she goes for.
//
// - Where the fight is simulated (the host's), she burrows when that hero has been `far` m or more off for `farFor`
//   s, or between two sets of her attacks once `every` s have passed since she last rose; never with her heart open
//   or her cage standing. The spot she'll rise on is chosen then (`riseSpot`): `ring` m from him, clear of the props,
//   the wall and every hero. One `burrow` fx tells every game where from, where to and how long under.
// - Every game plays it alike from that fx (`burrowAt`), on its own clock: her roots driven down into the soil, her
//   body after them `depth` m under the floor (the floor hides what's under it: no fade, no scale, nothing compiled),
//   the soil heaving and cracking round her and a mound left that settles; a ridge of soil heaving along her way under
//   the floor, cracks left behind it; the earth bulging and cracking where she'll rise (her cage's warning's amber
//   cracks) for `warn` s; then her roots bursting out, thrust out and gripping, her body rising after them. Her model
//   reads its pose from `root.userData.bury` (models/rootmother.ts); no hit meets her and nothing holds a hero off her
//   from half under till she rises (`Enemy.invulnerable`, `Enemy.buried`).
// - The host moves her only while she's wholly under, at `speed`; a guest's copy follows the host's reports, under
//   the floor too by then.
import * as THREE from 'three';
import { G } from '../state';
import { ROOTMOTHER } from '../data/foes/rootmother';
import { ARENA } from '../data/balance';
import { addEffect, crackDecal, decal, driftGlow } from '../fx/effects';
import { debris, smokePuff } from '../fx/particles';
import { addShake } from '../core/renderer';
import { rootSounds } from '../core/sounds/rootmother';
import { groundHeight } from '../world/ground';
import { inObstacle } from '../world/collision';
import { pastWall } from '../world/edge';
import { fx } from './enemyAI';
import { CAGE } from './rootCage';
import { placeLump, type BurrowPool } from './models/rootBurrow';
import { CAGE_NO_SIZE } from './models/rootCage';
import type { Enemy } from './enemy';
import type { Player } from './player';

const B = ROOTMOTHER.burrow;
/** her earth's colour, and her cage's warning's amber cracks */
const EARTH = 0x2a2418, AMBER = 0xff9a38;
/** the mounds (their radii, m): heaped where she sank, `wide` round and `high`; bulging where she'll rise up to
 *  `bulge` high through the warning, `torn` round as she comes up through it; each settling down into the floor over
 *  `settle` s after (a heap a share of its size, as drawn as a flat disc it read as a hole); the ridge's size over her
 *  way (m: across, up, along) */
const MOUND = { wide: 2.4, high: 1.1, settle: 2.5, bulge: 0.8, torn: 2.8 };
const RIDGE = new THREE.Vector3(0.9, 0.55, 1.8);
/** what shows her way from above: a soft glow under the ridge (m round, strength), the dust off it (s between puffs,
 *  its colour) and how bright its cracks glow behind it */
const RIDGE_GLOW = { radius: 2.2, intensity: 0.7, dustEvery: 0.1, cracks: 0.55 };
const DUST = 0x8a7656;
/** how many spots round the hero `riseSpot` tries, at each of three distances across `ring` */
const TRIES = 24;

const foeOf = (id: number): Enemy | null => G.enemies.find((e) => e.id === id) ?? null;
const ease = (k: number): number => k * k * (3 - 2 * k);
const clamp01 = (k: number): number => Math.min(1, Math.max(0, k));
const UP = new THREE.Vector3(0, 1, 0);
const _at = new THREE.Vector3(), _q = new THREE.Quaternion(), _size = new THREE.Vector3(), _n = new THREE.Vector3();

/** A burrow as every game plays it: where she went under and where she rises, when it began (G.time) and how long she
 *  travels under the floor (s); for the lab, when its warning began and she began to rise (G.time, -1 not yet), and
 *  the hero she went for and where he stood as it was chosen (the host's alone). */
export interface BurrowLog {
  id: number; fromX: number; fromZ: number; toX: number; toZ: number; startedAt: number; travel: number;
  warnedAt: number; riseAt: number; roseAt: number; slot: number; heroX: number; heroZ: number;
}
/** the last burrows played on this game, newest last (the lab reads them) */
export const BURROW_LOG: BurrowLog[] = [];
/** the lab's canaries: a move above ground (`slide`: she sets off the moment she begins), a rise with no warning
 *  (`unwarned`), a rise on the hero (`onHero`) */
export const BURROW_CANARY = { slide: false, unwarned: false, onHero: false };

/** The burrow's times from its start (s): her sink, her travel, the warning, her rise. */
function stages(travel: number): { sink: number; under: number; warned: number; rose: number } {
  const sink = B.sink, warn = BURROW_CANARY.unwarned ? 0 : B.warn;
  return { sink, under: sink + travel, warned: sink + travel + warn, rose: sink + travel + warn + B.rise };
}

// --- where the fight is simulated ---------------------------------------------------------------------------

/** Where simulated, every frame: the hero she goes for counted as far off, her wait counted down; a burrow under way
 *  moves her while she's wholly under. True while she's burrowing (she does nothing else meanwhile). */
export function tickBurrow(e: Enemy, dt: number): boolean {
  const b = e.brain;
  b.burrowT = (b.burrowT ?? B.first) - dt;
  const p = e.target;
  b.farT = p && Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z) >= B.far ? (b.farT ?? 0) + dt : 0;
  const log = ownLog(e);
  if (!log) return false;
  const s = stages(log.travel), t = G.time - log.startedAt;
  if (t >= s.rose) {
    b.burrowing = 0;
    b.burrowT = B.every;
    b.farT = 0;
    return false;
  }
  // (under the floor alone she moves: wholly under at the end of her sink, there by the end of her travel)
  const from = BURROW_CANARY.slide ? 0 : s.sink;
  const k = clamp01((t - from) / (s.under - from));
  e.pos.x = log.fromX + (log.toX - log.fromX) * k;
  e.pos.z = log.fromZ + (log.toZ - log.fromZ) * k;
  e.vel.set(0, 0, 0);
  e.desired.set(0, 0, 0);
  e.faceTo(log.toX, log.toZ);
  return true;
}

/** This boss's burrow under way, as the host began it, or null. */
function ownLog(e: Enemy): BurrowLog | null {
  if (!e.brain.burrowing) return null;
  for (let i = BURROW_LOG.length - 1; i >= 0; i--) if (BURROW_LOG[i].id === e.id) return BURROW_LOG[i];
  return null;
}

/** Where simulated, between her attacks (`setDone`: a set of them just ended): her burrow begun if it's due and a spot
 *  near the hero she goes for is clear. True as it begins. */
export function burrowDue(e: Enemy, setDone: boolean): boolean {
  const b = e.brain, p = e.target;
  if (!p || b.burrowing || e.weak > 0 || CAGE) return false;
  if (!((b.farT ?? 0) >= B.farFor || (setDone && (b.burrowT ?? B.first) <= 0))) return false;
  const to = riseSpot(e, p);
  if (!to) return false;
  const travel = Math.max(B.least, Math.hypot(to.x - e.pos.x, to.z - e.pos.z) / B.speed);
  b.burrowing = 1;
  fx('burrow', e.id, e.pos.x, e.pos.z, to.x, to.z, travel);
  const log = BURROW_LOG[BURROW_LOG.length - 1];
  if (log && log.id === e.id) {
    log.slot = p.slot;
    log.heroX = p.pos.x;
    log.heroZ = p.pos.z;
  }
  e.cd = stages(travel).rose + 0.4;
  return true;
}

/** Whether she may rise at (x, z): inside the arena and off its wall, clear of every prop and every hero (`clear` m
 *  past her radius and theirs). */
export function clearSpot(e: Enemy, x: number, z: number): boolean {
  if (Math.hypot(x, z) > ARENA.radius - e.radius - B.clear) return false;
  if (pastWall(G.arena.biome, x, z, _n).by > -(e.radius + B.clear)) return false;
  if (inObstacle({ x, z }, e.radius + B.clear)) return false;
  return G.players.every((q) => !q.active || Math.hypot(q.pos.x - x, q.pos.z - z) > e.radius + q.radius + B.clear);
}

/** A clear spot `ring` m from hero `p` (middle to middle), tried round him from a random way at three distances, the
 *  nearest of the ring first; null where none is. */
export function riseSpot(e: Enemy, p: Player): { x: number; z: number } | null {
  if (BURROW_CANARY.onHero) return { x: p.pos.x, z: p.pos.z };
  const [near, far] = B.ring, from = Math.random() * Math.PI * 2;
  for (const d of [near, (near + far) / 2, far]) {
    for (let i = 0; i < TRIES; i++) {
      const a = from + (i / TRIES) * Math.PI * 2;
      const x = p.pos.x + Math.sin(a) * d, z = p.pos.z + Math.cos(a) * d;
      if (clearSpot(e, x, z)) return { x, z };
    }
  }
  return null;
}

// --- on every game ----------------------------------------------------------------------------------------------

/** Her burrow from (fx, fz) to (tx, tz), `travel` s under the floor (`burrow` fx), played on this game: her roots and
 *  body going under, the soil heaving and the mound settling, the ridge travelling, the warning, her rise. */
export function burrowAt(id: number, fx0: number, fz0: number, tx: number, tz: number, travel: number): void {
  const foe = foeOf(id);
  const pool = foe?.model.root.userData.burrow as BurrowPool | undefined;
  const bury = foe?.model.root.userData.bury as { dive: number; depth: number } | undefined;
  if (!foe || !pool || !bury) return;
  const log: BurrowLog = {
    id, fromX: fx0, fromZ: fz0, toX: tx, toZ: tz, startedAt: G.time, travel,
    warnedAt: -1, riseAt: -1, roseAt: -1, slot: -1, heroX: 0, heroZ: 0,
  };
  BURROW_LOG.push(log);
  if (BURROW_LOG.length > 8) BURROW_LOG.shift();
  const s = stages(travel);
  const way = new THREE.Vector3(tx - fx0, 0, tz - fz0);
  const length = way.length() || 1;
  way.divideScalar(length);
  const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), way);
  heave(fx0, fz0, 1.4);
  rootSounds.groan(B.sink);
  rootSounds.crack(B.sink);
  addShake(0.25);
  let t = 0, crackedTo = 0, puff = 0, dust = 0, warned = false, risen = false, glowing = false;
  addEffect({
    update(dt) {
      t += dt;
      if (!foe.alive) { end(); return false; }
      // her roots driven down first, her body after them; then, rising, her roots bursting out first, her body after
      const sinking = clamp01(t / (B.sink * B.roots));
      const sunk = ease(clamp01((t - B.sink * B.roots * 0.5) / (B.sink * (1 - B.roots * 0.5))));
      const r = t - s.warned;
      const out = clamp01(r / (B.rise * B.roots)), up = ease(clamp01((r - B.rise * B.roots * 0.6) / (B.rise * (1 - B.roots * 0.6))));
      if (r < 0) {
        bury.dive = sinking;
        bury.depth = B.depth * sunk;
      } else {
        // (thrust out past rest as they burst and spread, then easing back as they grip)
        bury.dive = 1 - 2 * Math.sin(out * Math.PI * 0.5) + Math.max(0, out - 0.5) * 2 * Math.min(1, up * 1.2);
        bury.depth = B.depth * (1 - up);
      }
      // (no hit meets her from half under till her crown breaks the floor as she rises, `shows` m up, her roots bursting
      // out before it; no one is held off her body meanwhile)
      foe.invulnerable = t >= B.sink * B.hidden && (r < 0 || bury.depth > B.depth - B.shows);
      foe.buried = foe.invulnerable;
      // the mound where she went under: heaved up as she sinks, settling after
      const sankK = clamp01(t / B.sink), settle = clamp01((t - B.sink) / MOUND.settle);
      _size.set(MOUND.wide * sankK, MOUND.high * Math.sin(sankK * Math.PI * 0.5), MOUND.wide * sankK);
      lump(pool.sank, fx0, fz0, _size, settle, settle >= 1 && t > s.under);
      if (t < B.sink && (puff += dt) > 0.08) {
        puff = 0;
        heave(fx0, fz0, 0.35);
      }
      // the ridge over her way while she travels, cracks left behind it
      if (t >= s.sink && t < s.under) {
        const k = (t - s.sink) / travel;
        const x = fx0 + (tx - fx0) * k, z = fz0 + (tz - fz0) * k;
        // (seen from above, a mound of dark soil on dark ground hardly shows: a soft warm glow travels under the ridge
        // with it, dust thrown up off it, and its cracks glow faintly behind it; all soft light and particles)
        if (!glowing) {
          glowing = true;
          const along = (at: number, out: THREE.Vector3): boolean => {
            const j = clamp01(at / travel);
            out.set(fx0 + (tx - fx0) * j, 0, fz0 + (tz - fz0) * j);
            return at < travel;
          };
          driftGlow(along, RIDGE_GLOW.radius, travel, { color: AMBER, intensity: RIDGE_GLOW.intensity });
        }
        if ((dust += dt) > RIDGE_GLOW.dustEvery) {
          dust = 0;
          smokePuff(_at.set(x, groundHeight(x, z) + 0.2, z),
            { count: 2, color: DUST, alpha: 0.45, size: 0.7, sizeEnd: 1.8, speed: 1.2, life: 0.9 });
        }
        _size.copy(RIDGE).multiplyScalar(Math.min(1, (t - s.sink) * 4, (s.under - t) * 4));
        placeLump(pool.ridge, _at.set(x, groundHeight(x, z) - RIDGE.y * 0.35, z), turn, _size);
        while (crackedTo < k * length) {
          const cx = fx0 + way.x * crackedTo, cz = fz0 + way.z * crackedTo;
          crackDecal({ x: cx, z: cz }, { size: 1.6, color: AMBER, intensity: RIDGE_GLOW.cracks, life: 2.2 });
          debris(_at.set(cx, groundHeight(cx, cz), cz), { count: 3, speed: 2, size: 0.14, life: 0.7 });
          crackedTo += 1.1;
        }
      } else pool.ridge.scale.setScalar(CAGE_NO_SIZE);
      // the warning where she'll rise: the earth bulging and cracking, as her cage warns
      if (t >= s.under && !warned) {
        warned = true;
        log.warnedAt = G.time;
        warnAt(tx, tz, s.warned - s.under);
      }
      const bulge = clamp01((t - s.under) / Math.max(0.01, s.warned - s.under));
      const torn = clamp01(r / B.rise), settled = clamp01((r - B.rise) / MOUND.settle);
      if (t >= s.under) {
        const wide = MOUND.wide * (0.5 + 0.5 * bulge) + (MOUND.torn - MOUND.wide) * torn;
        _size.set(wide, MOUND.bulge * bulge * (1 - 0.4 * torn), wide);
        lump(pool.rises, tx, tz, _size, settled, settled >= 1);
      }
      if (r >= 0 && !risen) {
        risen = true;
        log.riseAt = G.time;
        heave(tx, tz, 2);
        rootSounds.roots();
        rootSounds.crack(B.rise);
        addShake(0.45);
        decal({ x: tx, z: tz }, { size: MOUND.torn * 1.4, life: 6, opacity: 0.55 });
      }
      if (r >= B.rise && log.roseAt < 0) {
        log.roseAt = G.time;
        bury.dive = 0;
        bury.depth = 0;
        foe.invulnerable = false;
        foe.buried = false;
      }
      return !(r >= B.rise && settled >= 1);
    },
    dispose: end,
  });

  /** Her burrow cut short (her death, the fight cleared): her body and roots as they stand, the soil put away. */
  function end(): void {
    if (bury && foe) {
      bury.dive = 0;
      bury.depth = 0;
      foe.invulnerable = false;
      foe.buried = false;
    }
    for (const m of [pool!.sank, pool!.rises, pool!.ridge]) m.scale.setScalar(CAGE_NO_SIZE);
  }
}

/** The pooled lump `m` at (x, z), sized `size`, its middle a quarter of its height under the floor and `settled` of
 *  its height more as it settles into it; put away once `done`. */
function lump(m: THREE.Mesh, x: number, z: number, size: THREE.Vector3, settled: number, done: boolean): void {
  if (done) { m.scale.setScalar(CAGE_NO_SIZE); return; }
  _q.setFromAxisAngle(UP, 0);
  placeLump(m, _at.set(x, groundHeight(x, z) - size.y * (0.25 + settled), z), _q, size);
}

/** Soil heaved up round (x, z), `much` of a full heave: clods thrown, dust rising. */
function heave(x: number, z: number, much: number): void {
  for (let k = 0; k < 3; k++) {
    const a = Math.random() * Math.PI * 2, d = MOUND.wide * (0.4 + Math.random() * 0.6);
    const px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d;
    _at.set(px, groundHeight(px, pz), pz);
    debris(_at, { count: Math.round(5 * much), speed: 3.5, size: 0.18, life: 0.9 });
    smokePuff(_at, { count: Math.max(1, Math.round(much)), color: EARTH, alpha: 0.45, size: 1, sizeEnd: 2.6, speed: 1, life: 1.2 });
  }
}

/** The earth bulging and cracking at (x, z) for `warn` s, where she'll rise: her cage's warning's amber cracks round
 *  her trunk's reach, clods stirring, the earth's crack heard. */
function warnAt(x: number, z: number, warn: number): void {
  if (warn <= 0) return;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2, d = MOUND.wide * 0.55;
    crackDecal({ x: x + Math.sin(a) * d, z: z + Math.cos(a) * d }, { size: 1.6, color: AMBER, intensity: 1.1, life: warn + 0.4 });
  }
  crackDecal({ x, z }, { size: 2.4, color: AMBER, intensity: 1.1, life: warn + 0.4 });
  rootSounds.crack(warn);
  let t = 0, next = 0;
  addEffect({
    update(dt) {
      t += dt;
      if (t >= next) {
        next += 0.1;
        const a = Math.random() * Math.PI * 2, d = MOUND.wide * Math.random() * 0.7;
        const px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d;
        debris(_at.set(px, groundHeight(px, pz), pz), { count: 2, speed: 1.6, size: 0.12, life: 0.6 });
      }
      return t < warn;
    },
  });
}
