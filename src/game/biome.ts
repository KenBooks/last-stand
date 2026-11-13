// The lobby's biome choice (cookie): a biome, or Random, which rolls a biome for every run, and the waves a run may
// start at there: each battleground keeps its own best (`records.bestBanked`, the training grounds' `bestReached`).
import { G } from '../state';
import { BIOME_IDS, type BiomeId, type BiomeSetting } from '../data/biomes';
import { readCookie, writeCookie } from '../core/cookies';
import { pick } from '../util';
import type { Profile } from '../types';

const COOKIE = 'last-stand-biome';
let setting: BiomeSetting = 'random';

const isBiome = (v: string | null): v is BiomeId => BIOME_IDS.includes(v as BiomeId);

/** Show the saved biome (a random one on Random) once the arena is built. */
export function initBiome(): void {
  const saved = readCookie(COOKIE);
  setting = saved === 'random' || isBiome(saved) ? saved : 'random';
  G.arena.setBiome(setting === 'random' ? pick(BIOME_IDS) : setting);
}

export const biomeSetting = (): BiomeSetting => setting;

/** Choosing a biome in the lobby switches to it right away; Random keeps the current one until the run starts. */
export function setBiomeSetting(s: BiomeSetting): void {
  setting = s;
  writeCookie(COOKIE, s);
  if (s !== 'random') G.arena.setBiome(s);
}

/** A hero's best wave in each battleground: `records.bestBanked`, or the training grounds' `bestReached`. */
export type Bests = Profile['records']['bestBanked'];

/** The last wave a run may start at in `biome` (the first, where none was banked). */
const lastStart = (bests: Bests, biome: BiomeId): number => Math.max(1, bests[biome] ?? 0);

/**
 * The last wave a run may start at on `s`. On Random it is the furthest of any battleground's, so the wave just
 * banked is always offered: as the least of them (the waves banked in every battleground), a bank in one
 * battleground left the picker where the other's best stood, at wave 1 until both had been banked in, and the dice
 * choosing the battleground made it look like a save lost now and then (#558, from play: "after banking the wave
 * you banked on does not always save").
 */
export const bestStart = (bests: Bests, s: BiomeSetting): number =>
  s === 'random' ? Math.max(...BIOME_IDS.map((id) => lastStart(bests, id))) : lastStart(bests, s);

/** The battlegrounds Random may roll for a run starting at `wave`: those it was unlocked in (the first wave: all). */
export const randomPool = (bests: Bests, wave: number): BiomeId[] => {
  const pool = BIOME_IDS.filter((id) => wave <= lastStart(bests, id));
  return pool.length ? pool : BIOME_IDS;
};

/** At the start of a run at `wave`: Random rolls the biome for it, among those the wave is unlocked in. */
export function rollBiome(bests: Bests, wave: number): void {
  if (setting === 'random') G.arena.setBiome(pick(randomPool(bests, wave)));
}

/** Back to the lobby's own choice (after a co-op host's): the chosen biome, or Random's current one. */
export function showBiomeSetting(): void {
  if (setting !== 'random') G.arena.setBiome(setting);
}
