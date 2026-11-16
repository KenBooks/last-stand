// The house of records' numbers (the village's Chronicle, world/rooms.ts shows them): what a hero's profile keeps
// besides its bests, counted as it happens on this game for the local hero alone (its own kills, casts and bank), and
// saved with the profile (`records.chronicle`, loot/profile.ts). Nothing here has gameplay effect.
import { G } from '../state';
import { on } from '../events';
import { rungBoss } from '../data/biomes';
import { isCoop } from '../net/role';
import { mine } from './stats';
import type { ChronicleRecords, Item, Profile } from '../types';

/** A hero's chronicle as stored, made empty where it never had one (a profile from before the house was built). */
export function chronicleOf(p: Profile): ChronicleRecords {
  const c = (p.records.chronicle ??= {} as ChronicleRecords);
  c.deaths ??= 0; c.banks ??= 0; c.mostWaves ??= 0; c.longestRun ??= 0; c.mostKills ??= 0; c.mostDealt ??= 0;
  c.dealt ??= 0; c.revives ??= 0; c.coopRuns ??= 0;
  c.casts ??= {}; c.bankedBy ??= {}; c.bosses ??= {};
  return c;
}

/** Whether what the local hero does now counts: in a run that isn't the training grounds, his hero still in it. */
const counting = (): boolean => G.mode === 'run' && !!G.run && !G.run.training && G.player.inRun;

/** The local hero cast skill `impl` in a run. */
export function countCast(impl: string): void {
  if (!counting()) return;
  const casts = chronicleOf(G.profile).casts;
  casts[impl] = (casts[impl] ?? 0) + 1;
}

/** The local hero's run is over for him (`finishLocal` in run.ts): how it ended, the waves he cleared in it, how long it
 *  took (s) and what he banked. Saved with the records by the caller. */
export function recordRunEnd(kind: 'banked' | 'dead', waves: number, seconds: number, banked: readonly Item[]): void {
  const c = chronicleOf(G.profile);
  if (kind === 'dead') c.deaths++; else c.banks++;
  c.mostWaves = Math.max(c.mostWaves, waves);
  c.longestRun = Math.max(c.longestRun, Math.round(seconds));
  c.mostKills = Math.max(c.mostKills, mine.kills);
  c.mostDealt = Math.max(c.mostDealt, Math.round(mine.dealt));
  c.dealt += Math.round(mine.dealt);
  c.revives += mine.revives;
  if (isCoop()) c.coopRuns++;
  for (const item of banked) c.bankedBy[item.rarity] = (c.bankedBy[item.rarity] ?? 0) + 1;
}

// (a boss slain counts for every hero still in the run, on each game: a boss is the party's, as its drops are)
// (a pair sharing a life counts once, under its rung's boss: the twin that pays the spoils)
on('enemyKilled', (e) => {
  if (!e.boss || e.training || e.noSpoils || !counting()) return;
  const bosses = chronicleOf(G.profile).bosses, kind = rungBoss(e.type);
  bosses[kind] = (bosses[kind] ?? 0) + 1;
});

/** The skill a hero cast most in runs (its `impl`), or null. */
export function favouriteSkill(c: ChronicleRecords): { impl: string; casts: number } | null {
  let best: { impl: string; casts: number } | null = null;
  for (const [impl, casts] of Object.entries(c.casts)) if (!best || casts > best.casts) best = { impl, casts };
  return best;
}
