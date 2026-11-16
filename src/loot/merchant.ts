// The village's merchant: what gear is worth to him (data/merchant.ts), his stock kept in the hero's profile (one a class
// and save slot, as everything of a hero is), restocked every few runs, and a trade: gear from the stash for one piece
// of his stock, worth at least what he asks. Only banked gear is in the stash, so nothing unbanked is ever traded, and
// nothing above epic is (`TRADED`).
import { CLASSES } from '../data/classes/index';
import { SLOTS } from '../data/items';
import {
  CUT, RARITY_VALUE, RESTOCK_RUNS, STOCK_RARITIES, STOCKED_FROM, TRADED, VALUE_PER_LEVEL, type TradedRarity,
} from '../data/merchant';
import { makeItem } from './items';
import { saveProfile } from './profile';
import { randInt } from '../util';
import type { Item, Profile, Slot } from '../types';

/** Whether he deals in `item`'s rarity (none above epic). */
export const takes = (item: Item): boolean => (TRADED as readonly string[]).includes(item.rarity);

/** What `item` is worth to the merchant, in the cheapest common's (nothing, for what he doesn't take). */
export const worth = (item: Item): number => (takes(item) ? RARITY_VALUE[item.rarity as TradedRarity] : 0)
  * (1 + VALUE_PER_LEVEL * Math.max(0, item.ilvl - 1));

/** What he asks for a piece of his stock: its worth and his cut. */
export const price = (item: Item): number => worth(item) * CUT;

/** The item level his stock comes at: the best wave the hero has reached in any battleground. */
const stockLevel = (p: Profile): number => Math.max(1, ...Object.values(p.records.bestReached).map((w) => w ?? 1));

/** `rarity`, or the best rarity below it he sells at `level` (`STOCKED_FROM`). */
export function stockedAs(rarity: TradedRarity, level: number): TradedRarity {
  const best = TRADED.filter((r) => STOCKED_FROM[r] <= level && TRADED.indexOf(r) <= TRADED.indexOf(rarity));
  return best[best.length - 1] ?? 'common';
}

/** A fresh stock for `p`'s class: a piece of each of `STOCK_RARITIES` he sells at its level, each of a slot of its own. */
function freshStock(p: Profile): Item[] {
  const cls = CLASSES[p.classId];
  const slots: Slot[] = SLOTS.filter((s) => !cls.excludeSlots?.includes(s));
  // (shuffled, then dealt one each: as many pieces as slots at most)
  for (let i = slots.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  const level = stockLevel(p);
  return STOCK_RARITIES.slice(0, slots.length).map((rarity, i) =>
    makeItem({ slot: slots[i], rarity: stockedAs(rarity, level), ilvl: level + randInt(0, 1), cls }));
}

/** How many runs until he restocks (0: he restocks now). */
export function runsToRestock(p: Profile): number {
  const at = p.merchant?.restockedAt ?? -Infinity;
  return Math.max(0, at + RESTOCK_RUNS - p.records.runs);
}

/** His stock for `p` as it stands, restocked (and saved) first if it's due or he has none yet. */
export function stockOf(p: Profile): Item[] {
  if (!p.merchant || runsToRestock(p) === 0) {
    p.merchant = { stock: freshStock(p), restockedAt: p.records.runs };
    saveProfile(p);
  }
  return p.merchant.stock;
}

/** What a trade offers: the pieces given (from the stash), their worth against what he asks, and whether it's enough. */
export interface Offer { given: Item[]; worth: number; price: number; enough: boolean }

/** `ids` from the stash offered for his piece `wanted` (what he doesn't take counts for nothing and isn't given). */
export function offer(p: Profile, wanted: Item, ids: readonly string[]): Offer {
  const given = p.stash.filter((it) => ids.includes(it.id) && takes(it));
  const total = given.reduce((sum, it) => sum + worth(it), 0);
  const asked = price(wanted);
  // (a hair under in the floating point still counts: the pieces' worths are rounded as they're shown)
  return { given, worth: total, price: asked, enough: given.length > 0 && total >= asked - 1e-6 };
}

/** The trade made: the pieces given leave the stash for good (the merchant keeps them), his piece joins it and leaves
 *  his stock; saved. False (nothing changed) when what's given isn't worth what he asks or isn't all in the stash. */
export function trade(p: Profile, wantedId: string, ids: readonly string[]): boolean {
  const stock = stockOf(p);
  const wanted = stock.find((it) => it.id === wantedId);
  if (!wanted) return false;
  const o = offer(p, wanted, ids);
  if (!o.enough || o.given.length !== new Set(ids).size) return false;
  p.stash = p.stash.filter((it) => !ids.includes(it.id));
  p.stash.unshift(wanted);
  p.merchant!.stock = stock.filter((it) => it !== wanted);
  saveProfile(p);
  return true;
}

/**
 * The fewest pieces of the stash worth what he asks for `wanted`, little over it: of the pieces of a lower rarity than
 * his (a player's own epic is never offered for him), the best taken first until they're enough, as few as any can be;
 * then the last one taken swapped for the smallest piece left that's still enough, and any piece dropped that isn't
 * needed, the smallest first. A stash worth too little gives all it has of them. Equipped gear is never in the stash.
 */
export function fewestFor(p: Profile, wanted: Item): string[] {
  const rank = (it: Item): number => TRADED.indexOf(it.rarity as TradedRarity);
  const pieces = p.stash.filter((it) => takes(it) && rank(it) < rank(wanted)).sort((a, b) => worth(b) - worth(a));
  const asked = price(wanted) - 1e-6;
  const total = (items: Item[]): number => items.reduce((sum, it) => sum + worth(it), 0);
  const picked: Item[] = [];
  for (const it of pieces) {
    if (total(picked) >= asked) break;
    picked.push(it);
  }
  if (total(picked) < asked) return picked.map((it) => it.id);
  // (the last one swapped for the smallest piece left that still pays: pieces run best first, so the last that fits)
  const rest = total(picked.slice(0, -1));
  const swap = pieces.filter((it) => !picked.includes(it) && rest + worth(it) >= asked).pop();
  if (swap && worth(swap) < worth(picked[picked.length - 1])) picked[picked.length - 1] = swap;
  for (const it of [...picked].sort((a, b) => worth(a) - worth(b))) {
    if (total(picked) - worth(it) >= asked) picked.splice(picked.indexOf(it), 1);
  }
  return picked.map((it) => it.id);
}
