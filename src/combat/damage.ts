// Damage rolls and application for both sides.
import type * as THREE from 'three';
import { G } from '../state';
import { NUMBER_COLORS } from '../data/balance';
import { floatText } from '../ui/floaters';
import { dealsDamage } from '../net/role';
import { countDealt } from '../game/stats';
import { rand } from '../util';
import type { Enemy } from '../entities/enemy';
import type { HitResult, Player } from '../entities/player';
import type { DamageType, DerivedStats, SkillDef, XZ } from '../types';
import type { Blow, Fling } from './fling';

const ELEMENTAL = new Set(['cold', 'fire', 'lightning']);

/** Damage types by number, as co-op's messages carry them. */
export const DAMAGE_TYPES: DamageType[] = ['arcane', 'cold', 'fire', 'lightning', 'physical', 'vitality'];

/** A hit's spread about its damage: rolled between these shares of it. */
export const DAMAGE_ROLL = { low: 0.9, high: 1.1 };

/** What a player's modifiers add to a hit with these tags (%): all damage, and arcane's or elemental's where its tags
 *  are (a skill's tooltip spells them out, `ui/skillDamage.ts`). */
export function damageBonuses(s: DerivedStats, tags: readonly string[]): { all: number; arcane: number; elemental: number } {
  return {
    all: s.damagePct,
    arcane: tags.includes('arcane') ? s.arcanePct : 0,
    elemental: tags.some((t) => ELEMENTAL.has(t)) ? s.elementalPct : 0,
  };
}

/** The share a player's modifiers make a hit with these tags of its base, before its roll and a crit. */
export function damageScale(s: DerivedStats, tags: readonly string[]): number {
  const b = damageBonuses(s, tags);
  return 1 + (b.all + b.arcane + b.elemental) / 100;
}

/** Roll a player's outgoing damage for a skill with the given tags. */
export function rollPlayerDamage(by: Player, base: number, tags: readonly string[]): { amount: number; crit: boolean } {
  const s = by.stats;
  let amount = base * damageScale(s, tags) * rand(DAMAGE_ROLL.low, DAMAGE_ROLL.high);
  const crit = Math.random() * 100 < s.crit;
  if (crit) amount *= 1 + s.critDmg / 100;
  return { amount, crit };
}

export interface HitOpts {
  /** the player whose skill it is (its stats, its kill, its leech) */
  by: Player;
  /** the skill the hit is from, as the battle log names it (from a dash's step, a timer or a channel's tick too, so
   *  it can't be told from what is being cast) */
  skill: SkillDef;
  tags?: readonly string[];
  type?: DamageType;
  knock?: number;
  from?: XZ;
  chill?: number;
  freeze?: number;
  /** suppress the damage number (crits are still shown) */
  silent?: boolean;
  /** no number at all, a crit's neither: whoever deals it shows its sum itself (a burn's bites, a second's at a time) */
  unnumbered?: boolean;
  /** how the blow drives what it kills (combat/fling.ts): away from `from` (or the player) when not given */
  blow?: Blow;
}

/** What the local player dealt a foe, with its effects, as co-op reports it to the host (set by net/sync). */
export interface DealtHit {
  amount: number; crit: boolean; type: DamageType; knock?: number; from?: XZ; chill?: number; freeze?: number; daze?: number;
  /** set alight for this long (s), which deals nothing itself (`igniteEnemy`, combat/burn.ts) */
  burn?: number;
  /** a charge's carry: how long (s) and its way (`carryEnemy`) */
  carry?: { seconds: number; way: XZ };
  /** a kill's throw */
  fling?: Fling;
  /** it got out of the hero's attack (entities/evade.ts): how (`EVADE_HOW`), and where to for a blink */
  evade?: { how: number; x: number; z: number };
}
let dealtSink: ((enemy: Enemy, hit: DealtHit) => void) | null = null;
export function setDealtSink(fn: typeof dealtSink): void { dealtSink = fn; }
/** What the local player did to a foe, told to the host where it's a co-op guest's copy (`evades`, entities/evade.ts). */
export function tellHost(enemy: Enemy, hit: DealtHit): void { dealtSink?.(enemy, hit); }

/** How a foe's attack came at a player, as the battle log names it. */
export type EnemyAttack = 'strike' | 'slam' | 'bolt' | 'lava' | 'burn';

/** Who dealt a hit on a player: the foe (none: one gone before its blow landed) and its attack. */
export interface Attacker { foe: Enemy | null; attack: EnemyAttack }

/** A hit as the battle log lists it (ui/battleLog): one the local hero dealt a foe, or one he took. */
export type LoggedHit =
  | { dealt: true; skill: SkillDef; foe: Enemy; amount: number; type: DamageType; crit: boolean; kill: boolean }
  | { dealt: false; by: Attacker | null; type: DamageType; armor: number; r: HitResult };
let logSink: ((hit: LoggedHit) => void) | null = null;
/** Where the hits go for the battle log (null while it's off: nothing is made for it). */
export function setLogSink(fn: typeof logSink): void { logSink = fn; }

/** A damage number over an enemy. */
export function damageNumber(enemy: Enemy, amount: number, crit: boolean, type: DamageType): void {
  const p = enemy.pos;
  floatText(p.x, enemy.height * 0.9 + 0.3, p.z, Math.round(amount), crit ? 'crit' : 'dmg', NUMBER_COLORS[type]);
}

/** Hit an enemy with a skill. Returns damage dealt (0 for a partner's skill, which its own game deals). On a co-op
 *  guest the foe is a copy: the hit shows on it at once (its life, a kill) and goes to the host, which deals it. */
export function hitEnemy(enemy: Enemy, base: number, opts: HitOpts): number {
  if (!enemy.alive || enemy.invulnerable || !dealsDamage(opts.by)) return 0;
  const type: DamageType = opts.type ?? 'arcane';
  const tags = opts.tags ?? [type];
  const by = opts.by;
  const { amount: rolled, crit } = rollPlayerDamage(by, base, tags);
  // (a marked foe takes more from everyone: the largest of the marks on it)
  const amount = enemy.marks.length ? rolled * (1 + Math.max(...enemy.marks)) : rolled;
  const dealt = enemy.takeDamage(amount, { type, crit, knock: opts.knock, from: opts.from, chill: opts.chill, freeze: opts.freeze, by, blow: opts.blow });
  const fling = enemy.alive ? undefined : enemy.fling ?? undefined;
  dealtSink?.(enemy, { amount: dealt, crit, type, knock: opts.knock, from: opts.from, chill: opts.chill, freeze: opts.freeze, fling });
  logSink?.({ dealt: true, skill: opts.skill, foe: enemy, amount: dealt, type, crit, kill: !enemy.alive });
  countDealt(dealt, !enemy.alive);
  // everyone sees their own numbers
  if (!opts.unnumbered && (!opts.silent || crit)) damageNumber(enemy, dealt, crit, type);
  if (by.stats.leech > 0 && by.alive) by.heal(dealt * by.stats.leech / 100, true);
  return dealt;
}

/** Daze a foe for `seconds` with a player's skill (`Enemy.daze`), judged as hits are: only by its own game, which on a
 *  co-op guest shows it on the copy at once and tells the host, whose snapshots show it on every other game. */
export function dazeEnemy(enemy: Enemy, seconds: number, by: Player): void {
  if (!enemy.alive || !dealsDamage(by)) return;
  enemy.daze(seconds);
  dealtSink?.(enemy, { amount: 0, crit: false, type: 'arcane', daze: seconds });
}

/** Carry a foe before a player's charge along `way` for `seconds` (`Enemy.carry`), judged as hits are: only by its
 *  own game, which on a co-op guest carries the copy at once and tells the host, whose reports show it on every other
 *  game. */
export function carryEnemy(enemy: Enemy, by: Player, way: XZ, seconds: number): void {
  if (!enemy.alive || !dealsDamage(by)) return;
  enemy.carry(by, way, seconds);
  dealtSink?.(enemy, { amount: 0, crit: false, type: 'physical', carry: { seconds, way } });
}

/** Damage a player (after armor / resistance / ward), dealt `by` a foe's attack. Only its own game's: a partner's is
 *  judged where its player sees the blow (net/role). */
export function hurtPlayer(
  p: Player, amount: number, type: DamageType = 'physical', from: THREE.Vector3 | null = null, by: Attacker | null = null,
): number {
  if (!p.active || !p.local || G.run?.training || by?.foe?.training) return 0;
  const s = p.stats;
  const reduce = type === 'physical' ? s.armor : s.resist;
  const r = p.takeDamage(amount * (1 - reduce / 100), type, from);
  if (r) logSink?.({ dealt: false, by, type, armor: amount * reduce / 100, r });
  return r?.taken ?? 0;
}
