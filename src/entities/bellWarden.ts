// The Bell-Warden (data/foes/bellwarden.ts, its numbers `BELL_WARDEN`): the Ossuary Cantor's guard, two of them on the
// Crypt's wave 10 (`BossRung.guards`), never a boss of its own. A lesser cracked bronze bell floating in the air, held
// up by its ghost (from Victor: "make a floating bell"), hovering where it rose and tolling from there (from play: "They
// stay stationary"). Its toll is a telegraphed attack of the boss toolkit's (entities/bossKit.ts); its model is
// models/bellWarden.ts.
//
// - **Toll** (the bell swung back, glowing and creaking, for its warning): a short ring of sound rolls out from it over
//   the floor; a hero it reaches close by is stunned briefly and hurt, unless his shield is raised towards it or he's
//   in a dash or a leap. Each game judges its own hero as its own ring reaches him (enemyAI's `toll` fx). It waits its
//   turn in the encounter (`claimBeat`): no two bosses' warned hits land together.
// - **Its ghost** (models/bellGhosts.ts) dives at a hero who comes near the bell (`dive`): it rises over him shrieking,
//   then swoops at where he stood, and seizes him if he's still there: carried up and out from the bell and dropped for
//   damage, each game its own hero as its screen shows the ghost (from play: "ghosts should be more likely to grabbing
//   you when coming near the bell").
// - **Its dead**: a few raised round it every so often while it stands (`raiseInTurn`; from play, "make sure they spawn
//   mobs once in a while").
import * as THREE from 'three';
import { G } from '../state';
import { BELL_WARDEN } from '../data/foes/bellwarden';
import { CANTOR } from '../data/foes/cantor';
import { WAVES } from '../data/waves';
import { ARENA, BLOCK, partyScale } from '../data/balance';
import { hurtPlayer } from '../combat/damage';
import { soundRing } from '../fx/effects';
import { smokePuff } from '../fx/particles';
import { flash } from '../fx/lights';
import { addShake } from '../core/renderer';
import { sfx } from '../core/audio';
import { bellSounds } from '../core/sounds/bellWarden';
import { inObstacle, resolveWorld } from '../world/collision';
import type { GhostsSeen } from './models/bellGhosts';
import { rand, randInt } from '../util';
import { spawnEnemy } from './spawner';
import { claimBeat, telegraphShare, telegraphed, telegraphTime } from './bossKit';
import { bossHooks } from './bossHooks';
import { fx } from './enemyAI';
import type { Enemy } from './enemy';

const B = BELL_WARDEN;
/** the pale light of the toll */
const TOLL_COLOR = 0xd8e4ff;
/** how high its bell's middle floats at its full size (m, its model's scale): its toll's light leaves from there */
const BELL_Y = 3.2;

const angleOff = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/** The Bell-Warden's AI, where the fight is simulated: it raises its dead in turn, and tolls when its cooldown and the
 *  encounter's beat allow. It never moves or turns: its toll rings out all round it. */
export function bellWardenAI(e: Enemy): void {
  raiseInTurn(e);
  if (e.action || e.cd > 0) return;
  // (in an encounter, its toll waits its turn: no two bosses' warned hits land together)
  if (!claimBeat(telegraphTime(e, 'toll') * telegraphShare(e, 'toll')!, CANTOR.beat)) {
    e.cd = 0.25;
    return;
  }
  fx('bellSwing', e.id, telegraphTime(e, 'toll') * 0.5);
  telegraphed(e, 'toll', () => fx('toll', e.id, e.pos.x, e.pos.z, e.damage));
  e.cd = e.def.cooldown * rand(0.9, 1.1);
}

/** the dead each bell has raised */
const raisedBy = new WeakMap<Enemy, Enemy[]>();

/** Its dead: a few raised round it every `BELL_WARDEN.raise.every` s while it stands (its AI runs only while it does,
 *  and only where the fight is simulated: each is a foe the host reports), at most `ownMost` of its own up and none
 *  past the wave's alive limit (`WAVES.maxAlive`). */
function raiseInTurn(e: Enemy): void {
  const r = B.raise, b = e.brain;
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

// --- what every game plays (enemyAI's fx) ---------------------------------------------------------

/** The bell swung back before a toll (`bellSwing` fx): its creak over the warning. Its glow is its model's. */
export function bellSwung(warn: number): void {
  bellSounds.creak(warn);
}

/**
 * A toll from (`x`, `z`) (`toll` fx): its ring, heard and seen, a pooled light once, and this game's hero judged as the
 * ring's front reaches him: stunned and hurt `hurt` of `damage`, unless his shield is raised towards it, he's dashing
 * or leaping, or it has rolled past `stunsTo`.
 */
export function tollAt(id: number, x: number, z: number, damage: number): void {
  const t = B.toll, foe = G.enemies.find((e) => e.id === id) ?? null;
  const size = foe ? foe.height / foe.model.height : 1;
  const pos = { x, z };
  let judged = false;
  soundRing(pos, {
    color: TOLL_COLOR, speed: t.speed, reach: t.reach, from: 1.5 * size, intensity: 0.84,
    onStep: (r0, r1) => {
      const p = G.player;
      if (judged || !p.active) return;
      const d = Math.hypot(p.pos.x - x, p.pos.z - z);
      if (d + p.radius < r0 || d - p.radius > r1) return;
      judged = true;
      if (r1 > t.stunsTo || p.airborne) return;
      const facing = angleOff(Math.atan2(x - p.pos.x, z - p.pos.z), p.facing) < BLOCK.arc;
      hurtPlayer(p, damage * t.hurt, 'physical', new THREE.Vector3(x, 0, z), { foe, attack: 'toll' });
      if (p.shieldRaised && facing) return;
      p.stunAfterGrace(t.stun);
    },
  });
  bellSounds.toll(t.soft, t.pitch);
  // (one light a toll, soft and slow: nothing large flashes faster than about 1.5 times a second)
  flash({ color: TOLL_COLOR, intensity: 18 * t.soft, distance: 14 * size, life: 0.9, pos: { x, y: BELL_Y * size, z } });
  addShake(0.35 * t.soft);
  smokePuff({ x, y: 0, z }, { count: 4, color: 0x2a2620, alpha: 0.3, size: 1.2 * size, sizeEnd: 3.2 * size, speed: 3, life: 1.1 });
}

// --- its ghost seizing a hero (every game its own hero, as its screen shows the ghost) -----------------------

/** A hero being carried off by a ghost: which, where from and to, how long it's been, and the bell he was seized by. */
interface Seized { ghost: number; from: THREE.Vector3; to: THREE.Vector3; t: number; foe: Enemy }
/** this game's hero's seizing, if he's being carried; each bell's ghost's rest (s); his grace after a drop */
let seized: Seized | null = null;
const rests = new WeakMap<Enemy, number[]>();
let graceUntil = -Infinity;
const _ghost = new THREE.Vector3(), _held = new THREE.Vector3();

/**
 * Each frame on every game: the bell's ghost dives at this game's hero, or carries him, as this game shows the ghost,
 * as each game judges its own hero's hits: no message carries it. A partner's copy isn't shown carried (its game's
 * reports place it on the ground).
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
  // (a grace further off than a whole one is from a clock set back since: the lab's set-ups start the game's anew)
  if (graceUntil - G.time > B.carry.grace) graceUntil = -Infinity;
  dive(e, ghosts, rest, dt);
}

/** A ghost's dive at this game's hero: rising over him as it shrieks, then swooping at where he stood. */
interface Dive { ghost: number; t: number; from: THREE.Vector3; spot: THREE.Vector3 | null }
const dives = new WeakMap<Enemy, Dive>();

/**
 * Its ghost (`BELL_WARDEN.dive`): a hero come within `near` m of the bell is dived at. The ghost rises over him
 * shrieking for `warn` s, following him, then swoops at where he stands; if he's still within `catch` m of that spot as
 * it comes down, it seizes him.
 */
function dive(e: Enemy, ghosts: GhostsSeen, rest: number[], dt: number): void {
  const p = G.player, g = B.dive;
  const free = !seized && p.active && !p.seized && !p.stunned && G.time >= graceUntil && !e.training;
  let d = dives.get(e);
  if (!d) {
    if (!free || rest[0] > 0 || !ghosts.freeAt(0, _ghost)) return;
    if (Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z) > g.near + e.radius) return;
    d = { ghost: 0, t: 0, from: _ghost.clone(), spot: null };
    dives.set(e, d);
    bellSounds.shriek();
  }
  d.t += dt;
  // (a hero gone, down or seized by another meanwhile: the ghost breaks off)
  if (!free) { endDive(e, d, ghosts, rest); return; }
  if (d.t < g.warn) {
    // (up over him from where it was, following him, its shriek the warning)
    const k = d.t / g.warn, ease = k * k * (3 - 2 * k);
    _held.set(p.pos.x, p.obj.position.y + g.over, p.pos.z);
    ghosts.hold(d.ghost, _held.lerpVectors(d.from, _held, ease));
    return;
  }
  // (then down at where he stood as it turned to swoop)
  d.spot ??= new THREE.Vector3(p.pos.x, p.obj.position.y, p.pos.z);
  const k = Math.min(1, (d.t - g.warn) / g.swoop);
  _held.set(d.spot.x, d.spot.y + g.over + (g.low - g.over) * k * k, d.spot.z);
  ghosts.hold(d.ghost, _held);
  if (k < 1) return;
  const caught = !p.dash && !p.airborne && Math.hypot(p.pos.x - d.spot.x, p.pos.z - d.spot.z) <= g.catch;
  endDive(e, d, ghosts, rest);
  if (!caught || !p.seize(B.carry.carry + B.carry.fall)) return;
  seized = { ghost: d.ghost, from: p.pos.clone(), to: dropSpot(e, p.pos), t: 0, foe: e };
  e.onDeath.push(() => letGoOf(e));
  bellSounds.grab();
}

/** A ghost's dive over: let go, and resting. */
function endDive(e: Enemy, d: Dive, ghosts: GhostsSeen, rest: number[]): void {
  ghosts.hold(d.ghost, null);
  dives.delete(e);
  rest[d.ghost] = B.dive.every;
}

/** Where a hero seized at `at` is dropped: `away` m on out from the bell, inside the arena and clear of the props. */
function dropSpot(e: Enemy, at: THREE.Vector3): THREE.Vector3 {
  const out = new THREE.Vector3(at.x - e.pos.x, 0, at.z - e.pos.z);
  if (out.lengthSq() < 1e-6) out.set(0, 0, 1);
  out.normalize().multiplyScalar(B.carry.away).add(at);
  const r = Math.hypot(out.x, out.z), most = ARENA.radius - 1.5;
  if (r > most) out.multiplyScalar(most / r);
  out.y = 0;
  resolveWorld(out, G.player.radius);
  return out;
}

/** A seized hero carried on by `dt`: up and out under his ghost, then let fall, hurt as he lands. */
function carry(s: Seized, ghosts: GhostsSeen, dt: number): void {
  const p = G.player, g = B.carry;
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

// (each frame on every game: its ghost, from the toolkit's frame hook)
bossHooks('bellwarden', {
  frame(e, dt) {
    haunt(e, dt);
  },
});
