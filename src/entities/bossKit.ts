// The shared boss toolkit: what a boss's fight is made of beyond its own look and its own attacks, so a new boss is
// mostly data (`EnemyDef.bossKit`) and its model. Class-agnostic, and for a boss that never moves as much as one that
// walks.
//
// - **Phases** by the share of its life left (`BossKitDef.phases`): entered in order where the fight is simulated (the
//   host's game in co-op) as its life falls past each, every one passed through entered (a blow that takes it from 70%
//   to 20% enters the second and the third), and told to every game through enemyAI's `fx('bossPhase')`: its banner,
//   its cue (`BossHooks.cue`), `Enemy.bossPhase` set. Its own gameplay of the phase (`BossHooks.enter`, `exit`) runs
//   where it's simulated alone.
// - **Telegraphed attacks** (`telegraphed`, `BossKitDef.attacks`): an action of its own name whose hit lands as its
//   warning ends, the model told the share (`ActionState.hit`, from the data, so a guest's copy has it too) to show it
//   coming (a glow, a wind-up, a creak), and a ring on the floor where it will land where the attack has one.
// - **Weak-spot windows** (`openWeak`, `BossKitDef.weak`): a time it takes `taken` times the damage from every hero's
//   hit (`damageTaken`, read by combat/damage `hitEnemy` as its marks are), told to every game; shown by its aura
//   turning the window's colour and swelling at a beat a second (no faster: the root's flash rule), and by its model
//   through `AnimState.boss.weak`.
// - **A shared life** (data/biomes.ts `BossWave.twin`, `EnemyDef.shares`): two bosses rising together, each given the
//   pair's whole life, a hit on either taking it from both (`shareHit`), each counting what it took (`Enemy.taken`); a
//   killing blow fells both, the second paying no spoils (`Enemy.noSpoils`), so the pair pays once.
// - **Warned hits kept apart** (`claimBeat`): a fight's warned hits never land together (the Twins' slam and skulls).
// - **Encounters** (data/biomes.ts `BossRung.guards`): a main boss with lesser bosses as its guards (`Enemy.guard`, at
//   their `EnemyDef.asGuard` life and damage), warded while any stands (`wardWhileGuarded`, `BossKitDef.ward`: it takes
//   `taken` times the damage, told to every game).
import { G } from '../state';
import { fx } from './enemyAI';
import type { Enemy } from './enemy';
import type { BossLook } from '../types';
import { emit } from '../events';
import { hooksOf } from './bossHooks';

export { bossHooks, type BossHooks } from './bossHooks';

/** The phase `share` of its life puts a boss of `e`'s kind in: the last whose `below` it's under (the first's is 1). */
export function phaseAt(e: Enemy, share: number): number {
  const phases = e.def.bossKit?.phases ?? [];
  let n = 0;
  for (let i = 1; i < phases.length; i++) if (share < phases[i].below) n = i;
  return n;
}

/** Where the fight is simulated, after a hit of `amount` it lived through: its own `hurt`, and every phase it has
 *  passed into, entered in turn. */
export function checkPhase(e: Enemy, amount = 0): void {
  if (!e.def.bossKit || e.net || !e.alive) return;
  if (amount > 0) hooksOf(e.type)?.hurt?.(e, amount);
  // (its hurt may have felled it: the Twins' collapse at half)
  if (!e.alive) return;
  // (an encounter's guard keeps its first phase: no banner, no cue, nothing harder of its own)
  const to = e.guard ? 0 : phaseAt(e, e.life / e.maxLife);
  while (e.bossPhase < to) fx('bossPhase', e.id, e.bossPhase + 1);
}

/** Phase `phase` begun on this game (enemyAI's `bossPhase` fx): set, its hooks run, its banner shown. */
export function phaseBegun(e: Enemy, phase: number): void {
  if (phase <= e.bossPhase) return;
  const was = e.bossPhase, hooks = hooksOf(e.type);
  e.bossPhase = phase;
  if (!e.net) {
    hooks?.exit?.(e, was);
    hooks?.enter?.(e, phase);
  }
  hooks?.cue?.(e, phase);
  emit('bossPhase', e, phase);
}

/** The share of a telegraphed attack `name` its hit lands at (its warning over its whole), or null for none. */
export function telegraphShare(e: Enemy, name: string): number | null {
  const a = e.def.bossKit?.attacks?.[name];
  return a ? a.warn / Math.max(0.01, a.warn + a.recover) : null;
}

/** The whole time of telegraphed attack `name` (its warning and recovery, s). */
export function telegraphTime(e: Enemy, name: string): number {
  const a = e.def.bossKit!.attacks![name];
  return a.warn + a.recover;
}

/** A ring on the floor where a telegraphed attack lands, for its warning's time (gone with it if the boss dies or is
 *  dazed first). */
export interface TelegraphRing { x: number; z: number; radius: number; color: number }

/**
 * Telegraphed attack `name` begun (its `TelegraphDef`): `hit` run as its warning ends, `more` at their own shares of
 * the action, its ring on the floor meanwhile where it has one. Its model shows the warning by the action's name and
 * share (`ActionState.hit`).
 */
export function telegraphed(e: Enemy, name: string, hit: () => void, ring?: TelegraphRing, more: [number, () => void][] = []): void {
  const share = telegraphShare(e, name);
  if (share === null) throw new Error(`${e.type} has no telegraphed attack "${name}"`);
  const dur = telegraphTime(e, name);
  if (ring) fx('tele', e.id, ring.x, ring.z, ring.radius, dur * share, ring.color);
  e.startAction(name, dur, [[share, hit], ...more]);
}

/** Where the fight is simulated: a weak-spot window opened for `seconds`, told to every game. */
export function openWeak(e: Enemy, seconds: number): void {
  if (e.net || !e.def.bossKit?.weak) return;
  fx('bossWeak', e.id, seconds);
}

/** How many times its damage a foe takes from a hero's hit now: warded by its guards, the ward's; else its weak-spot
 *  window's; else 1. */
export const damageTaken = (e: Enemy): number =>
  e.warded ? e.def.bossKit?.ward?.taken ?? 1 : e.weak > 0 ? e.def.bossKit?.weak?.taken ?? 1 : 1;

/** Where simulated: an encounter's main boss warded while any of its guards stands, let go as the last falls, told to
 *  every game (enemyAI's `bossWard` fx). */
export function wardWhileGuarded(e: Enemy): void {
  if (e.net || !e.def.bossKit?.ward) return;
  const guarded = G.enemies.some((x) => x.alive && x.guard);
  if (guarded !== e.warded) fx('bossWard', e.id, guarded ? 1 : 0);
}

/** When the fight's warned hits still to come land (G.time, from and to), across every boss in it (`claimBeat`):
 *  every one, not the last alone, as a belt skull's blast is claimed seconds ahead and a volley after it lands first;
 *  and the last taken (the lab's encounter check reads it, `beatTaken`). */
const beats: { from: number; to: number }[] = [];
const beat = { from: -Infinity, to: -Infinity };

/** Every warned hit still to come forgotten: the clock turned back (the lab's set-ups), where they'd hold off a new
 *  fight's for as long as the old one had left. */
export function forgetBeats(): void {
  beats.length = 0;
}

/**
 * Where simulated: may a boss start a warned attack whose hits land from `hitIn` s on over `span` s, no other boss's
 * landing within `gap` s of them? Taken if so (the next must keep clear of it). An encounter's bosses hit in turn,
 * never two at once: a toll's stun chained into grave hands no one could step out of; the Twins' slam, skulls and belt
 * skulls never land together.
 */
export function claimBeat(hitIn: number, gap: number, span = 0): boolean {
  const from = G.time + hitIn, to = from + span;
  for (let i = beats.length - 1; i >= 0; i--) if (beats[i].to + gap < G.time) beats.splice(i, 1);
  if (beats.some((b) => from < b.to + gap && to > b.from - gap)) return false;
  beats.push({ from, to });
  beat.from = from;
  beat.to = to;
  return true;
}

/** The fight's warned hits as taken (the lab's encounter check reads them). */
export const beatTaken = (): Readonly<typeof beat> => beat;

/** How much larger `e`'s aura is drawn than a ring for its band to lie where a ring's does (a soft halo's, enemy.ts). */
const auraReach = (e: Enemy): number => (e.aura?.userData.reach as number | undefined) ?? 1;

/** How many times its damage a hit struck at `at` (an arrow's or a bolt's point, none for a blow) takes from its weak
 *  spot (`WeakSpotDef`): its `taken` through its window where it struck the spot on the boss's front, else 1. */
export function spotTaken(e: Enemy, at?: { x: number; y: number; z: number }): number {
  const spot = e.def.bossKit?.weak?.spot;
  if (!spot || !at || e.weak <= 0) return 1;
  const dx = at.x - e.pos.x, dz = at.z - e.pos.z;
  // (in the boss's own frame: ahead along its facing, across it, and its height over its feet)
  const ahead = dx * Math.sin(e.facing) + dz * Math.cos(e.facing), across = dx * Math.cos(e.facing) - dz * Math.sin(e.facing);
  const up = at.y - e.obj.position.y;
  return ahead > 0 && Math.abs(across) <= spot.wide && Math.abs(up - spot.y) <= spot.high ? spot.taken : 1;
}

/** A boss's aura through its weak-spot window: the window's colour, swelling once a second; its own colour after. */
export function weakLooks(e: Enemy): void {
  const kit = e.def.bossKit?.weak;
  if (!kit || !e.auraMat || !e.aura) return;
  // (warded: the ward's colour, steady and close in; it takes little then)
  if (e.warded && e.def.bossKit?.ward) {
    // (a soft halo now, its whole width lit: dimmer than the ring it was, or it read as a solid band)
    e.auraMat.color.setHex(e.def.bossKit.ward.edge).multiplyScalar(0.75);
    e.aura.scale.setScalar(e.radius * 1.35 * auraReach(e));
    return;
  }
  const on = e.weak > 0, beat = on ? 0.5 + 0.5 * Math.sin(G.time * Math.PI * 2) : 0;
  // (an encounter's guard: its ring at rest fainter and tighter, the encounter's boss its main one)
  const rest = e.guard ? 0.9 : 1.6;
  e.auraMat.color.setHex(on ? kit.edge : e.auraColor ?? 0x9a40ff).multiplyScalar(on ? 1.6 + beat * 1.4 : rest);
  e.aura.scale.setScalar(e.radius * (on ? 1.9 + beat * 0.35 : e.guard ? 1.25 : 1.6) * auraReach(e));
}

/** Each frame a boss lives, on every game: its own `frame` (`BossHooks.frame`). */
export function bossFrame(e: Enemy, dt: number): void {
  hooksOf(e.type)?.frame?.(e, dt);
}

/** The boss sharing `e`'s life (`EnemyDef.shares`), while it stands. */
export const partnerOf = (e: Enemy): Enemy | null =>
  (e.def.shares ? G.enemies.find((x) => x.alive && x.type === e.def.shares) ?? null : null);

/** On every game, as a hit of `amount` takes `e`'s life (before its death is decided): its partner's life made its own,
 *  the hit counted against it, its last unhit time kept; a killing blow fells the partner too, which pays nothing. */
export function shareHit(e: Enemy, amount: number): void {
  const p = partnerOf(e);
  if (!p) return;
  e.taken += amount;
  e.brain.hitAt = G.time;
  p.life = Math.max(0, e.life);
  if (e.life <= 0) { p.noSpoils = true; p.die(); }
}

/** What a boss's model is told of its fight this frame (`AnimState.boss`). */
export function bossLook(e: Enemy): BossLook | undefined {
  return e.def.bossKit ? { phase: e.bossPhase, weak: e.weak, warded: e.warded } : undefined;
}
