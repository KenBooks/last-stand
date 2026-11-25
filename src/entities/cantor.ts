// The Ossuary Cantor (the Crypt's second rung's main boss, data/enemies.ts `cantor`, its numbers `CANTOR`): a towering
// skeletal priest of the ossuary, floating in rotted vestments, a bronze bell for a heart in its open ribcage. It comes
// with two Bell-Wardens as its guards (data/biomes.ts `BossRung.guards`). Built on the shared boss toolkit
// (entities/bossKit.ts); its model is models/cantor.ts.
//
// - **Warded** while either guard stands (`BossKitDef.ward`, `wardWhileGuarded`): it takes a quarter of the damage, a
//   pale shell round it. Warded rather than empowered: the heroes are told what to strike first, and the fight isn't
//   at its hardest while the arena is fullest.
// - **Grave Hands** (telegraphed): a ring of grave light under every hero, then bone hands tearing up through it. Each
//   game judges its own hero as the hands burst (enemyAI's `graveHands` fx).
// - **The Dirge** (its second phase on, telegraphed): a line of rings marching out from it to a hero, each bursting a
//   moment after the last (enemyAI's `dirge` fx); its rings never overlap.
// - **Its bell-heart** (its trick, the toolkit's weak-spot window): with the guards fallen, each cast leaves its ribs
//   open and its heart bared for `bared` s, taking double damage.
// - **Its last phase**: a dirge at every hero, and casts every `lastEvery` s.
// - **The choir's ring** (its second phase on, telegraphed): ghostly singers rise in a ring round where it stands, and
//   the ground outside the ring hurts, a tick a hero can walk in from; the ring tightens, holds, then fades. It stays
//   where it rose, and the Cantor floats to its middle and keeps there (`choirRingAt`, `rings`). One ring for every
//   game, told by enemyAI's `choirRing` fx, each game judging its own hero.
// - **Rising graves**: with each verse (grave hands, a dirge) a few gravestones push up out of the floor at spots the
//   fight's owner rolls, warned by a ring of grave light first; each an ordinary breakable prop (world/risenGraves.ts),
//   so they block paths and shots, at most `graves.most` standing, sinking back as it falls (`graveStoneAt`).
// Its warned hits and the guards' tolls never land together (`claimBeat`).
import * as THREE from 'three';
import { G } from '../state';
import { CANTOR } from '../data/foes/cantor';
import { hurtPlayer } from '../combat/damage';
import { addEffect, edgeRing, glowRing, glowTelegraph, groundFlash } from '../fx/effects';
import { rubble } from '../fx/rubble';
import { burst, debris, smokePuff } from '../fx/particles';
import { ARENA } from '../data/balance';
import { on } from '../events';
import { rand, TAU } from '../util';
import { setPropLife } from '../world/destructible';
import { clearGraves, graveAt, gravesLeft, raiseGrave, risenGraves, sinkGraves, updateGraves } from '../world/risenGraves';
import { choirSingers } from './models/choirSingers';
import { flash } from '../fx/lights';
import { addShake } from '../core/renderer';
import { cantorSounds } from '../core/sounds/cantor';
import { schedule } from '../core/timers';
import { claimBeat, openWeak, telegraphed, telegraphShare, telegraphTime, wardWhileGuarded } from './bossKit';
import { bossHooks } from './bossHooks';
import { fx, seek } from './enemyAI';
import type { Enemy } from './enemy';

const C = CANTOR;
/** its grave light, and the bone of the hands */
export const GRAVE_LIGHT = 0x5fe8a8;
const BONE = 0xd8cfb4;

/** The Cantor's behaviour, where the fight is simulated: glide to `keepAt` of its target, and cast in turn. */
export function cantorAI(e: Enemy): void {
  if (e.action) return;
  const p = e.target!;
  e.faceTo(p.pos.x, p.pos.z);
  const { dx, dz, dist } = e.toPlayer();
  if (e.cd <= 0 && cast(e)) return;
  // (its choir's ring standing: it floats to the ring's middle and keeps there, the fight brought in round it)
  const ring = rings.get(e);
  if (ring && G.time < ring.until) {
    const rx = ring.x - e.pos.x, rz = ring.z - e.pos.z, off = Math.hypot(rx, rz);
    if (off > RING_HELD) seek(e, rx, rz, off);
    else e.desired.set(0, 0, 0);
    return;
  }
  // (it keeps its distance, floating: in after a hero who backs off, away from one who presses in)
  if (dist > C.keepAt + 2) seek(e, dx, dz, dist);
  else if (dist < C.keepAt - 2) seek(e, -dx, -dz, dist, 0.6);
}

/** where the fight is simulated: each Cantor's choir's ring while it stands (its middle, and the game time it's gone) */
const rings = new WeakMap<Enemy, { x: number; z: number; until: number }>();
/** how near the ring's middle it keeps while the ring stands (m) */
const RING_HELD = 0.8;

/** A cast begun if its hits have their turn in the fight (`claimBeat`): its choir's ring when it's due, else grave
 *  hands, a dirge in turn with them from its second phase, both in its last. */
function cast(e: Enemy): boolean {
  if (choirDue(e)) return choir(e);
  const last = e.bossPhase >= 2;
  const dirge = last || (e.bossPhase >= 1 && (e.brain.casts ?? 0) % 2 === 1);
  const name = dirge ? 'dirge' : 'graveHands';
  const hitIn = telegraphTime(e, name) * telegraphShare(e, name)!;
  if (!claimBeat(hitIn, C.beat, dirge ? (C.dirge.count - 1) * C.dirge.step : 0)) { e.cd = 0.25; return false; }
  e.brain.casts = (e.brain.casts ?? 0) + 1;
  e.cd = (last ? C.lastEvery : C.every) - telegraphTime(e, name) * 0.5;
  fx('cantorChant', e.id, hitIn);
  if (dirge) dirgeAt(e, hitIn, last);
  else graveHands(e, hitIn);
  return true;
}

/** Whether its choir's ring is due: from its phase, its time come round again, none standing. */
function choirDue(e: Enemy): boolean {
  const ring = rings.get(e);
  return e.bossPhase >= C.choir.fromPhase && G.time >= (e.brain.choirAt ?? 0) && !(ring && G.time < ring.until);
}

/** Its choir's ring begun round where it stands, if its warning's end has its turn in the fight (`claimBeat`). */
function choir(e: Enemy): boolean {
  const c = C.choir;
  const hitIn = telegraphTime(e, 'choir') * telegraphShare(e, 'choir')!;
  if (!claimBeat(hitIn, C.beat)) { e.cd = 0.25; return false; }
  e.brain.choirAt = G.time + c.every;
  e.cd = (e.bossPhase >= 2 ? C.lastEvery : C.every) - telegraphTime(e, 'choir') * 0.5;
  rings.set(e, { x: e.pos.x, z: e.pos.z, until: G.time + hitIn + c.lasts + c.fade });
  fx('cantorChant', e.id, hitIn);
  fx('choirRing', e.id, e.pos.x, e.pos.z, hitIn);
  telegraphed(e, 'choir', () => bare(e));
  return true;
}

/** Grave hands under every hero standing (two heroes close together share one ring: no rings overlap). */
function graveHands(e: Enemy, hitIn: number): void {
  const spots: { x: number; z: number }[] = [];
  for (const p of G.players) {
    if (!p.active) continue;
    if (spots.some((s) => Math.hypot(s.x - p.pos.x, s.z - p.pos.z) < C.hands.radius * 2)) continue;
    spots.push({ x: p.pos.x, z: p.pos.z });
  }
  for (const s of spots) fx('graveRing', e.id, s.x, s.z, C.hands.radius, hitIn);
  raiseGraves(e, hitIn);
  telegraphed(e, 'graveHands', () => {
    for (const s of spots) fx('graveHands', e.id, s.x, s.z, e.damage);
    bare(e);
  });
}

/** A dirge marching out at its target, or at every hero standing in its last phase. */
function dirgeAt(e: Enemy, hitIn: number, every: boolean): void {
  const d = C.dirge, start = e.radius + 1.2;
  const lines = (every ? G.players.filter((p) => p.active) : [e.target!]).map((p) => Math.atan2(p.pos.x - e.pos.x, p.pos.z - e.pos.z));
  const ox = e.pos.x, oz = e.pos.z;
  for (const angle of lines) {
    for (let i = 0; i < d.count; i++) {
      const r = start + i * d.apart;
      fx('graveRing', e.id, ox + Math.sin(angle) * r, oz + Math.cos(angle) * r, d.radius, hitIn + i * d.step);
    }
  }
  raiseGraves(e, hitIn);
  telegraphed(e, 'dirge', () => {
    for (const angle of lines) fx('dirge', e.id, ox, oz, angle, e.damage);
    bare(e);
  });
}

// --- its risen graves (where the fight is simulated: the spots rolled, told to every game) ----------------

/** With a verse: `perVerse` gravestones warned for `warn` s at spots rolled here, then risen on every game. */
function raiseGraves(e: Enemy, warn: number): void {
  const g = C.graves;
  const room = Math.min(g.perVerse, gravesLeft() - coming.length);
  for (let i = 0; i < room; i++) {
    const spot = graveSpot();
    if (!spot) return;
    // (turned to face the arena's middle, give or take, and leaning a little as an old stone does)
    const yaw = Math.atan2(-spot.x, -spot.z) + rand(-0.4, 0.4);
    fx('graveStone', e.id, spot.x, spot.z, yaw, rand(-0.07, 0.07), warn);
  }
}

/** A spot a stone may rise on: off the dais, inside the wall, out of the gates' lanes, clear of every prop, stone,
 *  standing guard and coming stone by `apart` (so a hero passes between any two), and of every hero and foe. */
export function graveSpot(): { x: number; z: number } | null {
  const g = C.graves, dais = ARENA.daisHalf + 0.7 + g.radius + 0.6;
  for (let tries = 0; tries < SPOT_TRIES; tries++) {
    const a = rand(0, TAU), r = rand(g.fromMiddle, ARENA.radius - g.fromWall);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    // (the gates are on the arena's axes: their lanes are the cross through the middle)
    if (Math.min(Math.abs(x), Math.abs(z)) < g.laneHalf) continue;
    if (Math.max(Math.abs(x), Math.abs(z)) < dais) continue;
    if (G.arena.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + g.radius + g.apart)) continue;
    if (coming.some((c) => Math.hypot(c.x - x, c.z - z) < g.radius * 2 + g.apart)) continue;
    if (G.players.some((p) => p.active && Math.hypot(p.pos.x - x, p.pos.z - z) < g.fromHeroes)) continue;
    if (G.enemies.some((f) => f.alive && Math.hypot(f.pos.x - x, f.pos.z - z) < f.radius + g.radius + (f.guard ? g.apart : 0.5))) continue;
    return { x, z };
  }
  return null;
}
const SPOT_TRIES = 60;

// --- its risen graves (on every game) --------------------------------------------------------------

/** the stones warned and not yet risen, on this game */
const coming: { x: number; z: number }[] = [];
/** whether this game's stones are being stepped (an effect of their own while any stands or is coming) */
let stepping = false;

/** The stones stepped each frame while any stands or is coming: rising, sinking; all taken away with the effects. */
function stepGraves(): void {
  if (stepping) return;
  stepping = true;
  addEffect({
    update(dt) {
      updateGraves(dt);
      stepping = risenGraves.length > 0 || coming.length > 0;
      return stepping;
    },
    dispose() {
      stepping = false;
      coming.length = 0;
      clearGraves();
    },
  });
}

/**
 * A gravestone of the Cantor `id`'s (`graveStone` fx): a ring of grave light where it will rise for `warn` s, then
 * pushed up out of the floor there, turned `yaw` and leaning `lean`, a breakable prop from then (its health told to
 * every game by the `graveLife` fx). Nothing rises if the Cantor has fallen meanwhile.
 */
export function graveStoneAt(id: number, x: number, z: number, yaw: number, lean: number, warn: number): void {
  const foe = G.enemies.find((e) => e.id === id);
  const spot = { x, z };
  coming.push(spot);
  stepGraves();
  const warning = glowTelegraph({ x, z }, C.graves.radius + 0.35, warn, GRAVE_LIGHT);
  foe?.onDeath.push(() => warning.cancel());
  schedule(warn, () => {
    const i = coming.indexOf(spot);
    if (i < 0) return;
    coming.splice(i, 1);
    if (foe && !foe.alive) return;
    const grave = raiseGrave(x, z, yaw, lean, (life) => fx('graveLife', x, z, life));
    if (!grave) return;
    shoveClear(x, z);
    // (earth and stone thrown up round it as it pushes through the floor)
    debris({ x, y: 0.1, z }, { count: 10, color: 0x5a5448, speed: 4, size: 0.14, life: 0.9 });
    rubble(x, z, { count: 3, color: 0x8a8478, kind: 'stone', radius: 0.7, height: 0.4, size: 0.14, speed: 2.5, life: 1.4 });
    smokePuff({ x, y: 0.1, z }, { count: 5, color: 0x3a3830, alpha: 0.4, size: 0.7, sizeEnd: 1.9, speed: 1.3, life: 1.1 });
    addShake(0.08);
    cantorSounds.graveRise();
  });
}

/** This game's hero, and the foes it moves, shoved clear of a stone risen at (x, z): its circle pushes a body off it
 *  from then on, but none standing on its very middle, which has no way out (world/collision.ts `resolveProps`). */
function shoveClear(x: number, z: number): void {
  const r = C.graves.radius;
  const bodies = [{ pos: G.player.pos, radius: G.player.radius }, ...G.enemies.filter((foe) => foe.alive && !foe.net)];
  for (const body of bodies) {
    const dx = body.pos.x - x, dz = body.pos.z - z, d = Math.hypot(dx, dz);
    if (d >= r + body.radius) continue;
    // (on its middle: out towards the arena's middle, the way clear of the wall)
    const [ux, uz] = d > 1e-3 ? [dx / d, dz / d] : [-x / Math.hypot(x, z), -z / Math.hypot(x, z)];
    body.pos.x = x + ux * (r + body.radius);
    body.pos.z = z + uz * (r + body.radius);
  }
}

/** A risen stone's health as the fight's owner deals it (`graveLife` fx), found by where it stands. */
export function graveLifeAt(x: number, z: number, life: number): void {
  const grave = graveAt(x, z);
  if (grave) setPropLife(grave.prop, life);
}

// (its stones sink back into the floor as its wave ends, on every game)
on('waveCleared', () => sinkGraves());

// --- its choir's ring (on every game) ---------------------------------------------------------------

/** A choir's ring as this game shows it: its middle, its radius now and how long since it began (s). */
export interface RingShown { x: number; z: number; radius: number; age: number }
/** every choir's ring this game shows (`lab coop --scenarios choir` holds the two screens' alike) */
export const ringsShown: RingShown[] = [];

/**
 * The Cantor `id`'s choir's ring round (`x`, `z`) (`choirRing` fx): its singers rising round it over `warn` s, the
 * ring's edge brightening and the ground outside it lit; then for `lasts` s this game's hero is hurt each `tick` s he
 * stands outside it, the ring tightening to `least` and holding, then all of it fading. It fades at once if the
 * Cantor falls.
 */
export function choirRingAt(id: number, x: number, z: number, warn: number): void {
  const c = C.choir, foe = G.enemies.find((e) => e.id === id) ?? null;
  const floor = edgeRing({ x, z }, GRAVE_LIGHT);
  const singers = choirSingers(G.scene, c.singers);
  const shown: RingShown = { x, z, radius: c.radius, age: 0 };
  ringsShown.push(shown);
  let t = 0, tick = 0, ending = -1;
  foe?.onDeath.push(() => { if (ending < 0) ending = t; });
  cantorSounds.choir(warn, c.lasts);
  schedule(warn, () => {
    if (ending >= 0) return;
    flash({ color: GRAVE_LIGHT, intensity: 8, distance: c.radius * 1.4, life: 1.2, pos: { x, y: 2.5, z } });
    addShake(0.2);
  });
  addEffect({
    update(dt) {
      t += dt;
      const since = t - warn;
      if (ending < 0 && since >= c.lasts) ending = t;
      const fade = ending < 0 ? 0 : Math.min(1, (t - ending) / c.fade);
      const k = Math.min(1, Math.max(0, since) / c.tighten), ease = k * k * (3 - 2 * k);
      const radius = c.radius + (c.least - c.radius) * ease;
      shown.radius = radius;
      shown.age = t;
      // (its warning: the singers rising and the edge breathing slowly, the ground outside lit more as it comes;
      // then the edge whole and the ground outside lit, till it fades)
      const rising = Math.min(1, t / warn);
      const edge = (since < 0 ? 0.45 + 0.35 * rising + 0.15 * Math.sin(t * 5) : 1) * (1 - fade);
      const outside = (since < 0 ? 0.35 * rising : 1) * (1 - fade);
      floor.set(radius, edge, outside);
      singers.pose(x, z, radius + SINGERS_OUT, ending < 0 ? rising : 1 - fade, 1 - fade, t);
      if (since >= 0 && ending < 0) {
        tick -= dt;
        if (tick <= 0) {
          tick += c.tick;
          hurtOutside(foe, x, z, radius);
        }
      }
      return fade < 1;
    },
    dispose() {
      floor.dispose();
      singers.dispose();
      ringsShown.splice(ringsShown.indexOf(shown), 1);
    },
  });
}
/** how far out past the ring's edge its singers stand (m) */
const SINGERS_OUT = 0.9;

/** This game's hero hurt if he stands outside the choir's ring round (`x`, `z`) of `radius` m. */
function hurtOutside(foe: Enemy | null, x: number, z: number, radius: number): void {
  const p = G.player;
  if (!foe || !p.active || Math.hypot(p.pos.x - x, p.pos.z - z) <= radius) return;
  hurtPlayer(p, foe.damage * C.choir.hurt, 'vitality', new THREE.Vector3(p.pos.x, 0, p.pos.z), { foe, attack: 'choir' });
}

/** Its ribs opened after a cast, its bell-heart bared, once its guards have fallen. */
function bare(e: Enemy): void {
  if (!e.warded) openWeak(e, C.bared);
}

// --- what every game plays (enemyAI's fx) ---------------------------------------------------------

/** The Cantor's chant over a cast's warning (`cantorChant` fx). Its raised arms are its model's. */
export function cantorChanted(warn: number): void {
  cantorSounds.chant(warn);
}

/** Bone hands tearing up through the floor at (`x`, `z`), `radius` m: this game's hero hurt `hurt` of `damage` if he
 *  stands in them (and isn't in a leap: he's over them). */
function handsAt(id: number, x: number, z: number, radius: number, hurt: number, damage: number, loud = true): void {
  const foe = G.enemies.find((e) => e.id === id) ?? null;
  const p = G.player;
  if (p.active && !p.airborne && Math.hypot(p.pos.x - x, p.pos.z - z) < radius + p.radius) {
    hurtPlayer(p, damage * hurt, 'vitality', new THREE.Vector3(x, 0, z), { foe, attack: 'hands' });
  }
  rubble(x, z, { count: 5, color: BONE, kind: 'stone', radius: radius * 0.7, height: 1.4, size: 0.22, speed: 3.5, life: 1.6 });
  burst(new THREE.Vector3(x, 0.4, z), { count: 18, color: GRAVE_LIGHT, speed: 3.2, life: 0.7, size: 0.3 });
  glowRing({ x, z }, { color: GRAVE_LIGHT, intensity: 1.6, from: 0.3, to: radius * 1.25, life: 0.5 });
  groundFlash({ x, z }, { color: GRAVE_LIGHT, intensity: 1.2, radius: radius * 1.4, life: 0.5 });
  smokePuff({ x, y: 0, z }, { count: 5, color: 0x2a2a22, alpha: 0.35, size: 0.8, sizeEnd: 2, speed: 1.6, life: 0.9 });
  if (loud) cantorSounds.hands();
}

/** A grave hands' or a dirge's warning at (`x`, `z`), `radius` m, for `dur` s (`graveRing` fx): a soft ring of grave
 *  light breathing and filling in, gone if the Cantor dies or is dazed first (fx/effects.ts `glowTelegraph`: from
 *  Victor, "Too much geometry in effects", where the shared warning is a ring and a disc with hard edges). */
export function graveRingAt(id: number, x: number, z: number, radius: number, dur: number): void {
  const warning = glowTelegraph({ x, z }, radius, dur, GRAVE_LIGHT);
  const foe = G.enemies.find((e) => e.id === id);
  foe?.onDeath.push(() => warning.cancel());
  foe?.onDazed.push(() => warning.cancel());
}

/** Grave hands bursting at (`x`, `z`) (`graveHands` fx), one light and a shake for the cast. */
export function graveHandsAt(id: number, x: number, z: number, damage: number): void {
  handsAt(id, x, z, C.hands.radius, C.hands.hurt, damage);
  flash({ color: GRAVE_LIGHT, intensity: 10, distance: 9, life: 0.7, pos: { x, y: 1.2, z } });
  addShake(0.25);
}

/** A dirge from (`ox`, `oz`) along `angle` (`dirge` fx): its rings burst in turn, `step` s apart, each as its own ring's
 *  warning ends on every game. */
export function dirgeFrom(id: number, ox: number, oz: number, angle: number, damage: number): void {
  const d = C.dirge, foe = G.enemies.find((e) => e.id === id);
  const start = (foe?.radius ?? 2.4) + 1.2;
  for (let i = 0; i < d.count; i++) {
    const r = start + i * d.apart, x = ox + Math.sin(angle) * r, z = oz + Math.cos(angle) * r;
    schedule(i * d.step, () => handsAt(id, x, z, d.radius, d.hurt, damage, i % 2 === 0));
  }
  addShake(0.3);
}

/** a mist's puff seeping from its hem each this many seconds, and how far round its middle (m) */
const MIST_EVERY = 0.22, MIST_R = 1.7;
const mistDue = new WeakMap<Enemy, number>();

/** On every game: a grave mist seeping from its hem as it floats, its tatters trailing into it (pooled smoke). */
function seep(e: Enemy, dt: number): void {
  if (!e.alive || e.spawning > 0) return;
  const due = (mistDue.get(e) ?? 0) - dt;
  if (due > 0) { mistDue.set(e, due); return; }
  mistDue.set(e, due + MIST_EVERY);
  const a = Math.random() * Math.PI * 2;
  smokePuff({ x: e.pos.x + Math.sin(a) * MIST_R, y: 0.15, z: e.pos.z + Math.cos(a) * MIST_R },
    { count: 1, color: 0x2c4a3c, alpha: 0.16, size: 1.1, sizeEnd: 2.6, speed: 0.35, rise: 0.25, life: 2.4 });
}

// --- its phases (entities/bossKit.ts) ------------------------------------------------------

bossHooks('cantor', {
  enter(e, phase) {
    // (each phase's first cast comes soon: the change is heard)
    e.cd = Math.min(e.cd, phase >= 2 ? 0.8 : 1.4);
  },
  cue(e) {
    cantorSounds.wail();
    addShake(0.45);
    glowRing(e.pos, { color: GRAVE_LIGHT, intensity: 1.1, from: 1, to: 10, life: 1.1 });
  },
  frame(e, dt) {
    wardWhileGuarded(e);
    seep(e, dt);
    // (its stones sink back into the floor as it falls, on every game)
    if (!sinksAtDeath.has(e)) {
      sinksAtDeath.add(e);
      e.onDeath.push(() => sinkGraves());
    }
  },
});
/** the Cantors whose fall sinks the stones */
const sinksAtDeath = new WeakSet<Enemy>();
