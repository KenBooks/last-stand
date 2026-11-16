// What a run drops, worked out from the game's own drop rates (`LOOT` and `WAVES` in src/data/waves.ts, a biome's pool
// and its foes' costs), against what the merchant asks (`src/data/merchant.ts`): for each rarity he sells, the worth of
// the run's gear below it for each piece of it the run drops. Where that's more than he asks, trading the run's lesser
// gear for it would be a faster road to it than playing. Expected values, solo, no dice: the same every run.
import { BIOMES, type BiomeId } from '../../../src/data/biomes';
import { ENEMIES } from '../../../src/data/enemies';
import { LOOT, WAVES } from '../../../src/data/waves';
import { CUT, RARITY_VALUE, TRADED, type TradedRarity } from '../../../src/data/merchant';

/** How many of each rarity a stretch of play drops, in `RARITIES`' order (common to ascendant). */
export type Drops = number[];

/** One drop's chances of each rarity, at `wave` with a reward bonus of `bonus`, as `rollRarity` rolls it. */
function chances(wave: number, bonus: number): number[] {
  const weights = LOOT.rarityWeights(wave, bonus);
  const total = weights.reduce((sum, w) => sum + w, 0);
  return weights.map((w) => w / total);
}

/** `count` drops at `wave` and `bonus` added into `into`. */
function addDrops(into: Drops, count: number, wave: number, bonus: number): void {
  chances(wave, bonus).forEach((chance, i) => {
    into[i] += count * chance;
  });
}

/** What wave `wave` of `biome` drops on average: its foes' kills (heroes' more often and better), its clear's reward,
 *  and a boss wave's boss, as `game/run.ts` rolls them. */
export function waveDrops(biome: BiomeId, wave: number): Drops {
  const drops: Drops = [0, 0, 0, 0, 0, 0];
  const pool = BIOMES[biome].pool(wave);
  const weightOf = pool.reduce((sum, [, w]) => sum + w, 0);
  const boss = wave % WAVES.bossEvery === 0;
  const budget = WAVES.budget(wave) * (boss ? 0.55 : 1);
  const meanCost = pool.reduce((sum, [type, w]) => sum + ENEMIES[type].cost * w, 0) / weightOf;
  for (const [type, w] of pool) {
    const foes = (budget / meanCost) * (w / weightOf);
    const heroShare = WAVES.heroChance(wave) * (ENEMIES[type].ai === 'slam' ? 0.5 : 0.25);
    addDrops(drops, foes * heroShare * LOOT.heroDropChance, wave, 0.4);
    addDrops(drops, foes * (1 - heroShare) * LOOT.killDropChance, wave, 0);
  }
  addDrops(drops, LOOT.waveRewards(wave), wave, LOOT.waveRewardBonus(wave));
  if (boss) addDrops(drops, LOOT.bossDrops, wave + 1, 0.8);
  return drops;
}

/** What a run from wave 1 to `last` drops on average. */
export function runDrops(biome: BiomeId, last: number): Drops {
  const drops: Drops = [0, 0, 0, 0, 0, 0];
  for (let wave = 1; wave <= last; wave++) {
    waveDrops(biome, wave).forEach((count, i) => {
      drops[i] += count;
    });
  }
  return drops;
}

/** For `rarity`, from what a run dropped: the worth of its gear below that rarity for each piece of it, against what
 *  the merchant asks for one (both at one item level). */
export interface RoadTo {
  rarity: TradedRarity;
  lesserPerPiece: number;
  asks: number;
}

/** The road to `rarity` from `drops`: playing for it against trading the rest for it. */
export function roadTo(rarity: TradedRarity, drops: Drops): RoadTo {
  const rank = TRADED.indexOf(rarity);
  const lesser = TRADED.slice(0, rank).reduce((sum, r, i) => sum + drops[i] * RARITY_VALUE[r], 0);
  return { rarity, lesserPerPiece: lesser / drops[rank], asks: RARITY_VALUE[rarity] * CUT };
}
