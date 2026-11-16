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
// - **Breakable parts** (`BossKitDef.parts`): pieces of it with a life of their own, each struck by a hero's hits from
//   its side, broken one at a time (`BossHooks.broke`, every one broken `allBroken`) and made whole again
//   (`restoreParts`), each told to every game (`Enemy.broken`, a bit a part, which its model shows).
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
  const to = phaseAt(e, e.life / e.maxLife);
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

/** How many times its damage a foe takes from a hero's hit now: its weak-spot window's, else 1. */
export const damageTaken = (e: Enemy): number => (e.weak > 0 ? e.def.bossKit?.weak?.taken ?? 1 : 1);

/** A boss's aura through its weak-spot window: the window's colour, swelling once a second; its own colour after. */
export function weakLooks(e: Enemy): void {
  const kit = e.def.bossKit?.weak;
  if (!kit || !e.auraMat || !e.aura) return;
  const on = e.weak > 0, beat = on ? 0.5 + 0.5 * Math.sin(G.time * Math.PI * 2) : 0;
  e.auraMat.color.setHex(on ? kit.edge : e.auraColor ?? 0x9a40ff).multiplyScalar(on ? 1.6 + beat * 1.4 : 1.6);
  e.aura.scale.setScalar(e.radius * (on ? 1.9 + beat * 0.35 : 1.6));
}

/** How many breakable parts `e` has. */
const partsOf = (e: Enemy): number => e.def.bossKit?.parts?.angles.length ?? 0;

/** Where simulated: a hero's hit of `amount` from `from` taken by the part on that side, which breaks at none left. */
export function partHit(e: Enemy, from: { x: number; z: number }, amount: number): void {
  const parts = e.def.bossKit?.parts;
  if (!parts || e.net) return;
  const way = Math.atan2(from.x - e.pos.x, from.z - e.pos.z) - e.facing;
  let best = -1, bestOff = Infinity;
  parts.angles.forEach((a, i) => {
    if (e.broken & (1 << i)) return;
    const off = Math.abs(Math.atan2(Math.sin(way - a), Math.cos(way - a)));
    if (off < bestOff) { bestOff = off; best = i; }
  });
  if (best < 0) return;
  e.partLife[best] ??= parts.life * e.maxLife;
  e.partLife[best] -= amount * parts.share;
  if (e.partLife[best] <= 0) fx('bossPart', e.id, best, 1);
}

/** Part `part` broken (`on` 1) or whole again (0) on this game (enemyAI's `bossPart` fx). */
export function partChanged(e: Enemy, part: number, on: number): void {
  const bit = 1 << part;
  if (on) {
    if (e.broken & bit) return;
    e.broken |= bit;
    hooksOf(e.type)?.broke?.(e, part);
    if (!e.net && e.broken === (1 << partsOf(e)) - 1) hooksOf(e.type)?.allBroken?.(e);
  } else {
    e.broken &= ~bit;
    if (!e.net) e.partLife[part] = (e.def.bossKit?.parts?.life ?? 0) * e.maxLife;
  }
}

/** Where simulated: every part made whole again, told to every game. */
export function restoreParts(e: Enemy): void {
  if (e.net) return;
  for (let i = 0; i < partsOf(e); i++) if (e.broken & (1 << i)) fx('bossPart', e.id, i, 0);
}

/** What a boss's model is told of its fight this frame (`AnimState.boss`). */
export function bossLook(e: Enemy): BossLook | undefined {
  return e.def.bossKit ? { phase: e.bossPhase, weak: e.weak, broken: e.broken } : undefined;
}
