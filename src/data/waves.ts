// Wave composition rules. A wave is built from a point budget spent on the
// biome's enemy pool unlocked at that wave (data/biomes.ts); boss waves add its boss.

export const WAVES = {
  budget: (w: number) => 9 + w * 3.2,
  groups: (w: number) => Math.min(5, 2 + Math.floor(w / 3)),   // spawn bursts per wave
  groupInterval: 5.5,                                    // seconds between bursts
  // the most foes standing at once; a party's early waves allow more (`PARTY.alive`), never past the crowd's cap
  maxAlive: (w: number, party = 0) => Math.min(38, 14 + w * 2 + party),
  bossEvery: 5,
  // the boss comes after the wave's first group, as that group would reach the players, give or take this (s): first
  // in, a ranger could bring it down before the rest of the wave came
  bossJitter: 5,
  heroChance: (w: number) => (w < 3 ? 0 : Math.min(0.45, 0.12 + w * 0.03)),
};

// Loot rules per wave.
export const LOOT = {
  // rarity weights by wave: [common, magic, rare, epic, legendary]
  rarityWeights: (w: number, bonus = 0): number[] => [
    Math.max(4, 55 - w * 5 - bonus * 20),
    30,
    8 + w * 2.2 + bonus * 10,
    1 + w * 1.1 + bonus * 6,
    Math.max(0, (w - 3) * 0.55) + bonus * 3,
  ],
  killDropChance: 0.05,
  heroDropChance: 0.65,
  bossDrops: 3,
  waveRewards: (w: number) => 2 + Math.floor(w / 2),            // items dropped when a wave is cleared
  waveRewardBonus: (w: number) => Math.min(1, w * 0.06),        // rarity bonus for wave-clear drops
};
