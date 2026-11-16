// The village's merchant (loot/merchant.ts trades, ui/merchant.ts shows it): what gear is worth to him, his cut, and
// how his stock is made and when it changes. Gear for gear, no gold.
import type { RarityId } from '../types';

/**
 * What a piece of gear is worth by its rarity, in the cheapest common's (a common of item level 1 is 1). Taken from how
 * often each drops (`LOOT.rarityWeights` in data/waves.ts): at wave 1 the weights are common 50, magic 30, rare 10,
 * epic 2, so an epic drops about once for every 24 commons; legendaries come from wave 4 (about 3 epics to one there)
 * and ascendants from wave 8 (about 7 legendaries to one at their first waves). Rounded so each rung is a few of the
 * one below: magic 2 commons, rare a little over 2 magics, epic 3.5 rares, legendary 3 epics, ascendant 7 legendaries.
 * An epic at 16 makes the owner's example hold with the cut: 20 of the cheapest commons for an epic of the same level.
 */
export const RARITY_VALUE: Record<RarityId, number> = {
  common: 1, magic: 2, rare: 4.5, epic: 16, legendary: 50, ascendant: 350,
};

/** How much more a piece is worth for each item level over the first (its stats grow about a tenth a level). */
export const VALUE_PER_LEVEL = 0.1;

/** The merchant's cut: what he asks is his piece's worth times this, so trading down and back up loses a quarter
 *  (from the owner: "make sure its fair", and the merchant mustn't be a way to farm upgrades for free). */
export const CUT = 1.25;

/** His stock: the rarities of its pieces (the last one a legendary at `LEGENDARY_CHANCE`, else an epic), each of a slot
 *  of its own the hero's class wears, at the item level of the best wave the hero has reached, give or take one. */
export const STOCK_RARITIES: readonly RarityId[] = ['magic', 'rare', 'rare', 'epic', 'epic'];
export const LEGENDARY_CHANCE = 0.35;

/**
 * He restocks once every this many runs begun (`records.runs`): tied to play, so waiting doesn't refresh him and a
 * stock can be looked at again after a reload; a new hero meets a stock at once. What's left of the old stock goes.
 */
export const RESTOCK_RUNS = 3;
