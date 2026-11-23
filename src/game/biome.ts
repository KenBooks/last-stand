// The waves a run may start at in a battleground: each keeps its own best (`records.bestBanked`, the training
// grounds' `bestReached`). A battleground is chosen by its portal in the village (the ghost's card picks one too).
import type { BiomeId } from '../data/biomes';
import type { Profile } from '../types';

/** A hero's best wave in each battleground: `records.bestBanked`, or the training grounds' `bestReached`. */
export type Bests = Profile['records']['bestBanked'];

/** The last wave a run may start at in `biome` (the first, where none was banked). */
export const bestStart = (bests: Bests, biome: BiomeId): number => Math.max(1, bests[biome] ?? 0);
