// The Bell-Warden (the Crypt's second boss, data/enemies.ts `bellwarden`, its numbers `BELL_WARDEN`): a cracked bronze
// bell on a wooden yoke borne by four chained ghouls, shuffling after the heroes and tolling. Built on the shared boss
// toolkit (entities/bossKit.ts): its phases, its telegraphed tolls, its chains as breakable parts and the bell's drop as
// its weak-spot window. Its model is models/bellWarden.ts.
//
// - **Toll** (a telegraphed attack: the bell swung back, glowing and creaking, for its warning): a ring of sound rolls
//   out from it over the floor; a hero it reaches is stunned and hurt, unless his shield is raised towards it, he's in
//   a dash or a leap, or the ring has rolled past `stunsTo`, faded. Every `raiseEvery` tolls Hollow Husks rise round
//   the arena. Each game judges its own hero as its own ring reaches him (enemyAI's `toll` fx).
// - **The chains**: each bearer's, struck from its side (`BossKitDef.parts`); all four broken, the bell drops and lies
//   `down` s, taking double damage, then the bearers rise and the chains are whole again.
// - **Phase 2**: a double toll (a fast ring, then a slow one), and bronze shards break off as it's hit, lying on the
//   floor a while, hurting whoever stands on them (enemyAI's `shard` fx).
// - **Its ghosts** (models/bellGhosts.ts) seize a hero who comes too near one as it swoops low: carried up and out
//   from the bell and dropped for damage (`BELL_WARDEN.grab`), each game its own hero as its screen shows them.
// - **Phase 3**: the bearers kneel; it stands where it is and tolls every `lastEvery` s.
// - **As an encounter's guard** (`Enemy.guard`, data/enemies.ts `asGuard` and `BELL_WARDEN.guard`): a lesser bell,
//   about half its height, its ring shorter and softer, its stun short, one ghost that seizes no one, no phases (from
//   play, two whole Bell-Wardens beside the Cantor were "too big (almost like main boss)"), and it stands where it
//   rose, tolling from there (from play: "They stay stationary"), raising a few of the dead round its frame now
//   and then while it stands (`raiseInTurn`; "make sure they spawn mobs once in a while").
import * as THREE from 'three';
import { G } from '../state';
import { BELL_WARDEN } from '../data/foes/bellwarden';
import { CANTOR } from '../data/foes/cantor';
import { WAVES } from '../data/waves';
import { ARENA, BLOCK, partyScale } from '../data/balance';
import { hurtPlayer } from '../combat/damage';
import { addEffect, soundRing, lavaPool, shockwave } from '../fx/effects';
import { rubble } from '../fx/rubble';
import { burst, debris, smokePuff } from '../fx/particles';
import { flash } from '../fx/lights';
import { addShake } from '../core/renderer';
import { sfx } from '../core/audio';
import { bellSounds } from '../core/sounds/bellWarden';
import { inObstacle, resolveWorld } from '../world/collision';
import type { GhostsSeen } from './models/bellGhosts';
import { rand, randInt } from '../util';
import { schedule } from '../core/timers';

const angleOff = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
import { spawnEnemy } from './spawner';
import { claimBeat, openWeak, restoreParts, telegraphShare, telegraphed, telegraphTime } from './bossKit';
import { bossHooks } from './bossHooks';
import { chase, fx } from './enemyAI';
import type { Enemy } from './enemy';

const B = BELL_WARDEN;
/** the pale light of the toll, and the bronze of its shards */
const TOLL_COLOR = 0xd8e4ff, BRONZE = 0x9a6a32;
/** where the bell hangs over its feet (m, its model's scale): its shards leave from there */
const BELL_Y = 3.4;

/** The Bell-Warden's AI, where the fight is simulated: tolls when its cooldown allows, shuffling after its target
 *  between them (in its last phase it stands); with its chains broken it lies still until its window is over. */
export function bellWardenAI(e: Enemy): void {
  const b = e.brain;
  if (e.guard) raiseInTurn(e);
  if (b.down) {
    e.desired.set(0, 0, 0);
    if (e.weak <= 0) rise(e);
    return;
  }
  if (e.action) return;
  const p = e.target!;
  // (a guard standing where it rose never turns: its toll rings out all round it)
  if (!(e.guard && e.def.asGuard?.stands)) e.faceTo(p.pos.x, p.pos.z);
  const last = e.bossPhase >= 2;
  if (e.cd <= 0) {
    // (in an encounter, its toll waits its turn: no two bosses' warned hits land together)
    const name = e.bossPhase >= 1 ? 'doubleToll' : 'toll';
    if (!claimBeat(telegraphTime(e, name) * telegraphShare(e, name)!, CANTOR.beat)) { e.cd = 0.25; return; }
    toll(e);
    // (its last phase tolls every `lastEvery` s, start to start)
    e.cd = last ? Math.max(0.2, B.lastEvery - telegraphTime(e, 'doubleToll')) : e.def.cooldown * rand(0.9, 1.1);
    return;
  }
  // (a guard stands where it rose)
  if (last || (e.guard && e.def.asGuard?.stands)) return;
  // (up to its reach, no nearer: it shuffles, it doesn't press)
  if (e.toPlayer().dist > e.def.range + p.radius) chase(e);
}

/** A toll begun: a single one in the first phase, a double after (its fast ring, then its slow). */
function toll(e: Enemy): void {
  const double = e.bossPhase >= 1;
  const name = double ? 'doubleToll' : 'toll';
  fx('bellSwing', e.id, telegraphTime(e, name) * 0.5);
  telegraphed(e, name, () => {
    fx('toll', e.id, e.pos.x, e.pos.z, double ? 1 : 0, e.damage);
    e.brain.tolls = (e.brain.tolls ?? 0) + 1;
    // (a guard raises none: its Cantor's choir is the encounter's crowd)
    if (!e.guard && e.brain.tolls % B.raiseEvery === 0) raiseHusks(e);
  });
}

/** Hollow Husks risen round the arena, away from the heroes, while the arena isn't already full. */
function raiseHusks(e: Enemy): void {
  if (G.enemies.filter((x) => x.alive).length >= B.aliveMost) return;
  const n = randInt(B.raise[0], B.raise[1]);
  for (let i = 0; i < n; i++) {
    const at = spotRound();
    if (!at) continue;
    spawnEnemy((e.def.summon ?? 'husk') as never, at, { wave: G.run?.wave ?? 1, lifeMult: partyScale(G.run?.party ?? 1).life, training: e.training });
  }
}

/** the dead each standing guard has raised */
const raisedBy = new WeakMap<Enemy, Enemy[]>();

/** A standing guard's dead: a few raised round its frame every `BELL_WARDEN.guard.raise.every` s while it stands (its
 *  AI runs only while it does, and only where the fight is simulated: each is a foe the host reports), at most
 *  `ownMost` of its own up and none past the wave's alive limit (`WAVES.maxAlive`). */
function raiseInTurn(e: Enemy): void {
  const r = B.guard.raise, b = e.brain;
  b.raiseAt ??= G.time + r.first;
  if (G.time < b.raiseAt) return;
  b.raiseAt = G.time + rand(r.every[0], r.every[1]);
  const standing = (raisedBy.get(e) ?? []).filter((x) => x.alive);
  const alive = G.enemies.filter((x) => x.alive).length;
  const most = WAVES.maxAlive(G.run?.wave ?? 1, G.run?.party ?? 0);
  const n = Math.min(randInt(r.count[0], r.count[1]), r.ownMost - standing.length, most - alive);
  for (let i = 0; i < n; i++) {
    const at = spotNear(e, r.near);
    if (!at) continue;
    standing.push(spawnEnemy((e.def.summon ?? 'husk') as never, at, { wave: G.run?.wave ?? 1, lifeMult: partyScale(G.run?.party ?? 1).life, training: e.training }));
  }
  raisedBy.set(e, standing);
}

/** A spot `near` m out from a foe's body, in the arena, clear of props and 3 m from every hero, or null after a few
 *  tries. */
function spotNear(e: Enemy, near: [number, number]): THREE.Vector3 | null {
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2, r = e.radius + rand(near[0], near[1]);
    const at = new THREE.Vector3(e.pos.x + Math.cos(a) * r, 0, e.pos.z + Math.sin(a) * r);
    if (Math.hypot(at.x, at.z) > ARENA.radius - 2 || inObstacle(at, 0.7)) continue;
    if (G.players.some((p) => p.active && Math.hypot(p.pos.x - at.x, p.pos.z - at.z) < 3)) continue;
    return at;
  }
  return null;
}

/** A spot in the arena clear of props and 5 m from every hero, or null after a few tries. */
function spotRound(): THREE.Vector3 | null {
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2, r = rand(6, ARENA.radius - 3);
    const at = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
    if (inObstacle(at, 0.7)) continue;
    if (G.players.some((p) => p.active && Math.hypot(p.pos.x - at.x, p.pos.z - at.z) < 5)) continue;
    return at;
  }
  return null;
}

/** The bell up again: its weak-spot window over, the bearers rise and the chains are whole. */
function rise(e: Enemy): void {
  e.brain.down = 0;
  restoreParts(e);
  e.cd = Math.max(e.cd, 1.2);
}

/** Where the fight is simulated: a hero's hit, from the second phase, may break a shard off the bell. */
function shardOff(e: Enemy): void {
  const b = e.brain, s = B.shards;
  if (e.bossPhase < 1 || G.time - (b.shardAt ?? -99) < s.every || Math.random() > s.chance) return;
  b.shardAt = G.time;
  const a = Math.random() * Math.PI * 2, r = e.radius + rand(s.throw[0], s.throw[1]);
  const tx = e.pos.x + Math.sin(a) * r, tz = e.pos.z + Math.cos(a) * r;
  fx('shard', e.id, e.pos.x, e.pos.z, tx, tz, e.damage);
}

// --- what every game plays (enemyAI's fx) ---------------------------------------------------------

/** The bell swung back before a toll (`bellSwing` fx): its creak over the warning. Its glow is its model's. */
export function bellSwung(warn: number): void {
  bellSounds.creak(warn);
}

/**
 * A toll from (`x`, `z`) (`toll` fx): its ring (a double toll's fast ring and its slow one after), heard and seen, a
 * pooled light once, and this game's hero judged as each ring's front reaches him: stunned and hurt `hurt` of
 * `damage`, unless his shield is raised towards it, he's dashing or leaping, or it has rolled past `stunsTo`.
 */
export function tollAt(id: number, x: number, z: number, double: number, damage: number): void {
  const foe = G.enemies.find((e) => e.id === id) ?? null, lesser = !!foe?.guard, gd = B.guard;
  // (a guard's lesser bell: a shorter, softer ring, a short stun; its light, shake and sound `soft` of a whole one's)
  const t = lesser ? { ...B.toll, reach: gd.reach, stunsTo: gd.stunsTo, stun: gd.stun, hurt: gd.hurt } : B.toll;
  const soft = lesser ? gd.soft : 1, size = foe ? foe.height / foe.model.height : 1;
  const rings: { speed: number; delay: number; heavy: number }[] = double
    ? [{ speed: t.fast, delay: 0, heavy: 0.6 }, { speed: t.slow, delay: t.slowAfter, heavy: 1 }]
    : [{ speed: t.speed, delay: 0, heavy: 1 }];
  const pos = { x, z };
  for (const ring of rings) {
    let judged = false;
    soundRing(pos, {
      color: TOLL_COLOR, speed: ring.speed, reach: t.reach, from: 1.5 * size, delay: ring.delay, intensity: (0.9 + 0.5 * ring.heavy) * (lesser ? 0.6 : 1),
      onStep: (r0, r1) => {
        const p = G.player;
        if (judged || !p.active) return;
        const d = Math.hypot(p.pos.x - x, p.pos.z - z);
        if (d + p.radius < r0 || d - p.radius > r1) return;
        judged = true;
        if (r1 > t.stunsTo || p.airborne) return;
        const facing = angleOff(Math.atan2(x - p.pos.x, z - p.pos.z), p.facing) < BLOCK.arc;
        hurtPlayer(p, damage * t.hurt * (0.6 + 0.4 * ring.heavy), 'physical', new THREE.Vector3(x, 0, z), { foe, attack: 'toll' });
        if (p.shieldRaised && facing) return;
        p.stunAfterGrace(t.stun);
      },
    });
  }
  const pitch = lesser ? gd.pitch : 1;
  bellSounds.toll((double ? 0.6 : 1) * soft, pitch);
  if (double) schedule(t.slowAfter, () => bellSounds.toll(soft, pitch));
  // (one light a toll, soft and slow: nothing large flashes faster than about 1.5 times a second)
  flash({ color: TOLL_COLOR, intensity: 18 * soft, distance: 14 * size, life: 0.9, pos: { x, y: BELL_Y * size, z } });
  addShake(0.35 * soft);
  smokePuff({ x, y: 0, z }, { count: lesser ? 4 : 8, color: 0x2a2620, alpha: 0.3, size: 1.2 * size, sizeEnd: 3.2 * size, speed: 3, life: 1.1 });
}

/**
 * A shard broken off the bell (`shard` fx), thrown from over (`ox`, `oz`) to lie at (`tx`, `tz`): bronze pieces and a
 * glow where they lie, hurting this game's hero `hurt` of `damage` every `tick` s he stands within `radius` m of it,
 * for `lies` s.
 */
export function shardAt(ox: number, oz: number, tx: number, tz: number, damage: number, id: number): void {
  const s = B.shards, foe = G.enemies.find((e) => e.id === id) ?? null;
  bellSounds.shard();
  debris({ x: ox, y: BELL_Y, z: oz }, { count: 6, color: BRONZE, speed: 5, size: 0.12, life: 0.6 });
  rubble(tx, tz, { count: 6, color: BRONZE, kind: 'stone', radius: s.radius * 0.6, height: 1.2, size: 0.32, speed: 1.5, life: s.lies });
  lavaPool({ x: tx, z: tz }, s.radius, s.lies, 0xe0a050);
  let t = 0, next = 0.25;
  addEffect({
    update(dt: number) {
      t += dt;
      const p = G.player;
      if (t >= next) {
        next += s.tick;
        if (p.active && Math.hypot(p.pos.x - tx, p.pos.z - tz) < s.radius + p.radius) {
          hurtPlayer(p, damage * s.hurt, 'physical', new THREE.Vector3(tx, 0, tz), { foe, attack: 'shard' });
        }
      }
      return t < s.lies;
    },
  });
}

/** The bell dropped, its chains all broken (`bellDown` fx): bronze into the earth, dust, a shake. */
export function bellDropped(x: number, z: number): void {
  bellSounds.drop();
  addShake(0.7);
  shockwave({ x, z }, { color: 0xffd27a, intensity: 1.6, from: 1, to: 5, life: 0.6 });
  debris({ x, y: 0.3, z }, { count: 24, speed: 6 });
  smokePuff({ x, y: 0, z }, { count: 14, color: 0x2a2620, size: 1.4, sizeEnd: 3.6, speed: 3 });
}

// --- its ghosts seizing a hero (every game its own hero, as its screen shows the ghosts) -----------------------

/** A hero being carried off by a ghost: which, where from and to, how long it's been, and the bell he was seized by. */
interface Seized { ghost: number; from: THREE.Vector3; to: THREE.Vector3; t: number; foe: Enemy }
/** this game's hero's seizing, if he's being carried; each Bell-Warden's ghosts' rests (s); his grace after a drop */
let seized: Seized | null = null;
const rests = new WeakMap<Enemy, number[]>();
let graceUntil = -Infinity;
const _ghost = new THREE.Vector3(), _held = new THREE.Vector3();

/**
 * Each frame on every game: a ghost of the bell seizes this game's hero if he's come within its reach as it swoops low,
 * carries him up and out from the bell and drops him, hurting him as he lands (`BELL_WARDEN.grab`). Judged as this
 * game shows the ghosts, as each game judges its own hero's hits: no message carries it. A partner's copy isn't shown
 * carried (its game's reports place it on the ground).
 */
function haunt(e: Enemy, dt: number): void {
  const ghosts = e.model.root.userData.ghosts as GhostsSeen | undefined;
  if (!ghosts) return;
  const rest = rests.get(e) ?? Array.from({ length: ghosts.most }, () => 0);
  rests.set(e, rest);
  for (let i = 0; i < rest.length; i++) rest[i] = Math.max(0, rest[i] - dt);
  // (a bell cleared away without dying, a run left, lets go of the hero it carried)
  if (seized && !G.enemies.includes(seized.foe)) { G.player.lift = 0; seized = null; }
  if (seized?.foe === e) { carry(seized, ghosts, dt); return; }
  const p = G.player, g = B.grab;
  // (a guard's ghost seizes no one: its lesser bell's is only seen)
  if (seized || e.guard || !p.active || p.seized || p.stunned || p.dash || G.time < graceUntil || e.training) return;
  for (let i = 0; i < ghosts.most; i++) {
    if (rest[i] > 0 || !ghosts.freeAt(i, _ghost)) continue;
    const over = _ghost.y - p.obj.position.y;
    if (over > g.under || Math.hypot(_ghost.x - p.pos.x, _ghost.z - p.pos.z) > g.reach) continue;
    if (!p.seize(g.carry + g.fall)) return;
    rest[i] = g.every;
    seized = { ghost: i, from: p.pos.clone(), to: dropSpot(e, p.pos), t: 0, foe: e };
    e.onDeath.push(() => letGoOf(e));
    bellSounds.grab();
    return;
  }
}

/** Where a hero seized at `at` is dropped: `away` m on out from the bell, inside the arena and clear of the props. */
function dropSpot(e: Enemy, at: THREE.Vector3): THREE.Vector3 {
  const out = new THREE.Vector3(at.x - e.pos.x, 0, at.z - e.pos.z);
  if (out.lengthSq() < 1e-6) out.set(0, 0, 1);
  out.normalize().multiplyScalar(B.grab.away).add(at);
  const r = Math.hypot(out.x, out.z), most = ARENA.radius - 1.5;
  if (r > most) out.multiplyScalar(most / r);
  out.y = 0;
  resolveWorld(out, G.player.radius);
  return out;
}

/** A seized hero carried on by `dt`: up and out under his ghost, then let fall, hurt as he lands. */
function carry(s: Seized, ghosts: GhostsSeen, dt: number): void {
  const p = G.player, g = B.grab;
  s.t += dt;
  if (!p.active) { letGoOf(s.foe); return; }
  const k = Math.min(1, s.t / g.carry), ease = k * k * (3 - 2 * k);
  p.pos.lerpVectors(s.from, s.to, ease);
  p.vel.set(0, 0, 0);
  if (s.t < g.carry) {
    p.lift = g.rise * Math.sin(k * Math.PI / 2);
    // (the ghost over him, holding him by the shoulders)
    ghosts.hold(s.ghost, _held.set(p.pos.x, p.obj.position.y + p.lift + 1.75, p.pos.z));
    return;
  }
  ghosts.hold(s.ghost, null);
  const f = Math.min(1, (s.t - g.carry) / g.fall);
  p.lift = g.rise * (1 - f * f);
  if (f < 1) return;
  // (landed: hurt, a thud, dust; not seized again for a while)
  hurtPlayer(p, s.foe.damage * g.hurt, 'physical', new THREE.Vector3(p.pos.x, 0, p.pos.z), { foe: s.foe, attack: 'grab' });
  smokePuff({ x: p.pos.x, y: 0, z: p.pos.z }, { count: 8, color: 0x2a2620, alpha: 0.4, size: 0.6, sizeEnd: 1.8, life: 0.8, speed: 1.6 });
  addShake(0.25);
  sfx.bodyFall(1);
  letGoOf(s.foe);
  graceUntil = G.time + g.grace;
}

/** The seized hero let go (landed, the bell dead, he fell): on the ground again, his ghost free. */
function letGoOf(e: Enemy): void {
  if (seized?.foe !== e) return;
  (e.model.root.userData.ghosts as GhostsSeen | undefined)?.hold(seized.ghost, null);
  G.player.lift = 0;
  seized = null;
}

// --- its phases and parts (entities/bossKit.ts) ------------------------------------------------------

bossHooks('bellwarden', {
  enter(e, phase) {
    // (each phase's first toll comes soon: the change is heard)
    e.cd = Math.min(e.cd, phase >= 2 ? 0.6 : 1.5);
    if (phase >= 2) e.desired.set(0, 0, 0);
  },
  cue(e, phase) {
    bellSounds.shard();
    bellSounds.chain();
    addShake(0.4);
    shockwave(e.pos, { color: phase >= 2 ? 0xffd27a : TOLL_COLOR, intensity: 1.8, from: 1, to: 9, life: 0.9 });
  },
  broke(e, part) {
    bellSounds.chain();
    const a = e.facing + (e.def.bossKit!.parts!.angles[part] ?? 0), r = e.radius * 0.85;
    burst(new THREE.Vector3(e.pos.x + Math.sin(a) * r, 2.6, e.pos.z + Math.cos(a) * r), { count: 18, color: 0xffd27a, speed: 5, life: 0.5, size: 0.18 });
  },
  allBroken(e) {
    e.cancelAction();
    e.brain.down = 1;
    openWeak(e, B.down);
    fx('bellDown', e.pos.x, e.pos.z);
  },
  hurt(e) {
    shardOff(e);
  },
  frame(e, dt) {
    haunt(e, dt);
  },
});
