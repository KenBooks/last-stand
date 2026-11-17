// Frenzy: the warrior's with both hands empty (#400). His fists' blows build it a stack at a time (each skill says how
// much, `SkillDef.frenzy`), and each stack makes him quicker and hungrier but easier to hurt (`FRENZY` in
// data/balance.ts): his attacks the quicker (`Player.haste`), a share of what he deals healed back (`landed`, from
// `hitEnemy`), and more of every blow taken (`Player.takeDamage`). It decays a stack at a time once no hit of his has
// landed for a while, unless a skill holding it is held (Rampage) or Unchained runs; Wrath spends it all. His own game
// keeps it, as it judges his hits; the partners' are told how many stacks he has with his state, for its look.
import { G } from '../state';
import { FRENZY } from '../data/balance';
import type { Player } from '../entities/player';

/** The most stacks he may have now: more under Unchained. */
export const frenzyCap = (p: Player): number => (unchained(p) ? FRENZY.unchained : FRENZY.cap);

/** Whether Unchained runs for him: no decay, a higher cap. */
export const unchained = (p: Player): boolean => p.unchainedUntil > G.time;

/** `n` stacks built (his own game's; a partner's copy shows what its reports say). */
export function gainFrenzy(p: Player, n: number): void {
  if (!p.local || n <= 0) return;
  p.frenzy = Math.min(frenzyCap(p), p.frenzy + n);
}

/** Every stack spent (Wrath): how many there were. Damage taken goes back to normal with them. */
export function spendFrenzy(p: Player): number {
  const had = p.frenzy;
  if (p.local) p.frenzy = 0;
  return had;
}

/** A hit of his landed for `dealt`: the decay's wait starts again, and his stacks heal back their share of it. */
export function landed(p: Player, dealt: number): void {
  if (!p.local || dealt <= 0) return;
  p.frenzyAt = G.time;
  p.frenzyDecay = 0;
  if (p.frenzy > 0 && p.alive) p.heal(dealt * p.frenzy * FRENZY.leech / 100, true);
}

/** The decay over `dt`: once no hit has landed for `FRENZY.wait` s, a stack every `FRENZY.every` s, unless a skill
 *  holding it is held or Unchained runs (each restarts the wait as it ends: what it held isn't lost at once). */
export function tickFrenzy(p: Player, dt: number): void {
  if (!p.local) return;
  // (past the cap: Unchained ended over a higher stack, which falls back to the cap at once)
  p.frenzy = Math.min(p.frenzy, frenzyCap(p));
  if (p.frenzy <= 0) { p.frenzyDecay = 0; return; }
  if (unchained(p) || p.channel?.skill.def.frenzyHolds) { p.frenzyAt = G.time; p.frenzyDecay = 0; return; }
  if (G.time - p.frenzyAt < FRENZY.wait) return;
  p.frenzyDecay += dt;
  while (p.frenzyDecay >= FRENZY.every && p.frenzy > 0) { p.frenzyDecay -= FRENZY.every; p.frenzy--; }
}
