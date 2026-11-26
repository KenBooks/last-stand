// Damage rolls and application for both sides.
import { damageTaken, spotTaken } from '../entities/bossKit';
import type * as THREE from 'three';
import { G } from '../state';
import { NUMBER_COLORS } from '../data/balance';
import { floatText } from '../ui/floaters';
import { dealsDamage } from '../net/role';
import { countDealt } from '../game/stats';
import { landed } from './frenzy';
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
/** a headshot's more chance of a critical hit (points of a hundred): every one is (#750, the owner's choice: as the
 *  berserker's punch to the head) */
const HEADSHOT_SHARP = 100;

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

/** Roll a player's outgoing damage for a skill with the given tags, `sharp` more chance of a critical hit (points
 *  of a hundred) than his own. */
export function rollPlayerDamage(by: Player, base: number, tags: readonly string[], sharp = 0): { amount: number; crit: boolean } {
  const s = by.stats;
  let amount = base * damageScale(s, tags) * rand(DAMAGE_ROLL.low, DAMAGE_ROLL.high);
  const crit = Math.random() * 100 < s.crit + sharp;
  if (crit) amount *= 1 + s.critDmg / 100;
  return { amount, crit };
}

export interface HitOpts {
  /** the player whose skill it is (its stats, its kill, its leech) */
  by: Player;
  /** the skill the hit is from, as the battle log names it (from a dash's step, a timer or a channel's tick too, so
   *  it can't be told from what is being cast) */
  skill: SkillDef;
  /** more chance of a critical hit for this hit than his own (points of a hundred: a punch thrown well) */
  sharp?: number;
  /** it struck the foe's head (combat/strikes.ts `onHead`: an arrow, #750): always a critical hit, its number
   *  labelled a headshot */
  head?: boolean;
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
  /** where a shot struck the body (an arrow's, a bolt's point): what a boss's weak spot reads (entities/bossKit.ts
   *  `spotTaken`); a blow has none */
  at?: { x: number; y: number; z: number };
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
/** every attack the battle log names: these, and a foe's own added by its file in entities/foes/ (`declare module`) */
export interface EnemyAttacks { strike: true; slam: true; bolt: true; lava: true; burn: true }
export type EnemyAttack = keyof EnemyAttacks;

/** Who dealt a hit on a player: the foe (none: one gone before its blow landed) and its attack. */
export interface Attacker { foe: Enemy | null; attack: EnemyAttack }

/** A hit as the battle log lists it (ui/battleLog): one the local hero dealt a foe, or one he took. */
export type LoggedHit =
  | { dealt: true; skill: SkillDef; foe: Enemy; amount: number; type: DamageType; crit: boolean; kill: boolean; head: boolean }
  | { dealt: false; by: Attacker | null; type: DamageType; armor: number; r: HitResult };
let logSink: ((hit: LoggedHit) => void) | null = null;
/** Where the hits go for the battle log (null while it's off: nothing is made for it). */
export function setLogSink(fn: typeof logSink): void { logSink = fn; }

let sparSink: ((p: Player, from: THREE.Vector3 | null, foe: Enemy | null) => void) | null = null;
/** Where a harmless foe's blows at the local hero go outside a run (the village's tutorial spars by them:
 *  game/tutorial.ts). */
export function setSparSink(fn: typeof sparSink): void { sparSink = fn; }

/** A damage number over an enemy (a headshot's larger, labelled so). */
export function damageNumber(enemy: Enemy, amount: number, crit: boolean, type: DamageType, head = false): void {
  const p = enemy.pos, kind = head ? 'head' : crit ? 'crit' : 'dmg';
  floatText(p.x, enemy.height * 0.9 + 0.3, p.z, Math.round(amount), kind, NUMBER_COLORS[type]);
}

/** Hit an enemy with a skill. Returns damage dealt (0 for a partner's skill, which its own game deals). On a co-op
 *  guest the foe is a copy: the hit shows on it at once (its life, a kill) and goes to the host, which deals it. */
export function hitEnemy(enemy: Enemy, base: number, opts: HitOpts): number {
  if (!enemy.alive || enemy.invulnerable || !dealsDamage(opts.by)) return 0;
  const type: DamageType = opts.type ?? 'arcane';
  const tags = opts.tags ?? [type];
  const by = opts.by;
  // (a headshot is always a critical hit, whatever his chance)
  const { amount: rolled, crit } = rollPlayerDamage(by, base, tags, opts.head ? HEADSHOT_SHARP : opts.sharp);
  // (a marked foe takes more from everyone: the largest of the marks on it)
  // (and a boss in its weak-spot window, `taken` times as much, more where a shot struck its weak spot:
  // entities/bossKit.ts)
  const amount = (enemy.marks.length ? rolled * (1 + Math.max(...enemy.marks)) : rolled) * damageTaken(enemy)
    * spotTaken(enemy, opts.at);
  const dealt = enemy.takeDamage(amount, { type, crit, knock: opts.knock, from: opts.from, chill: opts.chill, freeze: opts.freeze, by, blow: opts.blow });
  const fling = enemy.alive ? undefined : enemy.fling ?? undefined;
  // (a duel's rival is no foe of the host's: its hits go to the hero it stands for, entities/rival.ts)
  if (!enemy.standIn) dealtSink?.(enemy, { amount: dealt, crit, type, knock: opts.knock, from: opts.from, chill: opts.chill, freeze: opts.freeze, fling });
  logSink?.({ dealt: true, skill: opts.skill, foe: enemy, amount: dealt, type, crit, kill: !enemy.alive, head: !!opts.head });
  countDealt(dealt, !enemy.alive);
  // everyone sees their own numbers (a rival's is the struck hero's own, as his game worked the hit out)
  if (!opts.unnumbered && (!opts.silent || crit) && !enemy.standIn) damageNumber(enemy, dealt, crit, type, opts.head);
  if (by.stats.leech > 0 && by.alive) by.heal(dealt * by.stats.leech / 100, true);
  // (the warrior's Frenzy: its decay waits again, and its stacks heal back their share)
  landed(by, dealt);
  return dealt;
}

/** Daze a foe for `seconds` with a player's skill (`Enemy.daze`), judged as hits are: only by its own game, which on a
 *  co-op guest shows it on the copy at once and tells the host, whose snapshots show it on every other game. */
export function dazeEnemy(enemy: Enemy, seconds: number, by: Player): void {
  if (!enemy.alive || !dealsDamage(by)) return;
  enemy.daze(seconds);
  if (!enemy.standIn) dealtSink?.(enemy, { amount: 0, crit: false, type: 'arcane', daze: seconds });
}

/** Carry a foe before a player's charge along `way` for `seconds` (`Enemy.carry`), judged as hits are: only by its
 *  own game, which on a co-op guest carries the copy at once and tells the host, whose reports show it on every other
 *  game. */
export function carryEnemy(enemy: Enemy, by: Player, way: XZ, seconds: number): void {
  if (!enemy.alive || !dealsDamage(by)) return;
  enemy.carry(by, way, seconds);
  if (!enemy.standIn) dealtSink?.(enemy, { amount: 0, crit: false, type: 'physical', carry: { seconds, way } });
}

/** Damage a player (after armor / resistance / ward), dealt `by` a foe's attack. Only its own game's: a partner's is
 *  judged where its player sees the blow (net/role). */
export function hurtPlayer(
  p: Player, amount: number, type: DamageType = 'physical', from: THREE.Vector3 | null = null, by: Attacker | null = null,
): number {
  if (!p.active || !p.local) return 0;
  // (thrown through the air: nothing lands on him till he's down, his landing hurt by what threw him once he is)
  if (p.flying) return 0;
  if (G.run?.training || by?.foe?.training) {
    if (!G.run) sparSink?.(p, from, by?.foe ?? null);
    return 0;
  }
  const s = p.stats;
  const reduce = type === 'physical' ? s.armor : s.resist;
  const r = p.takeDamage(amount * (1 - reduce / 100), type, from);
  if (r) logSink?.({ dealt: false, by, type, armor: amount * reduce / 100, r });
  return r?.taken ?? 0;
}

/** A rival's hit on the local hero in a duel (game/duel.ts), as his own game works it out: his armour or resistance,
 *  then his block and ward (`Player.takeDamage`). Null: it didn't land (he's down, or guarded). */
export function hurtByRival(p: Player, amount: number, type: DamageType, from: THREE.Vector3 | null): HitResult | null {
  if (!p.active || !p.local) return null;
  const s = p.stats;
  const reduce = type === 'physical' ? s.armor : s.resist;
  const r = p.takeDamage(amount * (1 - reduce / 100), type, from);
  if (r) logSink?.({ dealt: false, by: null, type, armor: amount * reduce / 100, r });
  return r;
}
