// The village's merchant (loot/merchant.ts trades, ui/merchant.ts shows it): what gear is worth to him, his cut, and
// how his stock is made and when it changes. Gear for gear, no gold, and nothing above epic either way.
import type { RarityId } from '../types';

/** The rarities he deals in, both ways: he sells none above epic and takes none (from the owner and the maintainer:
 *  "Remove, just up to epic", "I don't think we should give legendary or ascendant at all"). */
export type TradedRarity = 'common' | 'magic' | 'rare' | 'epic';
export const TRADED: readonly TradedRarity[] = ['common', 'magic', 'rare', 'epic'];

/**
 * What a piece of gear is worth by its rarity, in the cheapest common's (a common of item level 1 is 1). Taken from how
 * often each drops (`LOOT.rarityWeights` in data/waves.ts), rounded so each rung is a few of the one below: a magic 2
 * commons, a rare a little over 2 magics, an epic about 4.5 rares. A run's gear below epic is worth 65 for every epic it
 * drops at wave 1, 34 on a run to wave 4, 24.5 to wave 6, 18.5 to wave 10 (`npm run lab -- merchant` works it out from
 * the drop rates): an epic asking 25 (its 20 and the cut) is never a faster road to epics than playing where he sells
 * them (`STOCKED_FROM`), and it's 25 commons of its level at most, 6 rares, far under the stash's 60.
 */
export const RARITY_VALUE: Record<TradedRarity, number> = { common: 1, magic: 2, rare: 4.5, epic: 20 };

/** How much more a piece is worth for each item level over the first (its stats grow about a tenth a level). */
export const VALUE_PER_LEVEL = 0.1;

/** The merchant's cut: what he asks is his piece's worth times this, so trading down and back up loses a fifth. */
export const CUT = 1.25;

/**
 * The best wave a hero must have reached for him to sell each rarity: before it, a run's gear below that rarity is worth
 * more than he asks for each piece of it the run drops, and buying would beat playing for it (a rare asks 5.6; a run to
 * wave 4 drops 6.3 of commons and magics for each rare, one to wave 5 4.8; an epic asks 25, a run to wave 5 drops 26.3
 * of gear below epic for each epic, one to wave 6 24.5). A rarity not stocked yet comes as the best one that is.
 */
export const STOCKED_FROM: Record<TradedRarity, number> = { common: 1, magic: 1, rare: 5, epic: 6 };

/** His stock: the rarities of its pieces, each of a slot of its own the hero's class wears, at the item level of the
 *  best wave the hero has reached, give or take one. */
export const STOCK_RARITIES: readonly TradedRarity[] = ['magic', 'rare', 'rare', 'epic', 'epic'];

/**
 * He restocks once every this many runs begun (`records.runs`): tied to play, so waiting doesn't refresh him and a
 * stock can be looked at again after a reload; a new hero meets a stock at once. What's left of the old stock goes.
 */
export const RESTOCK_RUNS = 3;
