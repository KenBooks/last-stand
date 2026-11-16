// The village's merchant: what gear is worth to him (data/merchant.ts), his stock kept in the hero's profile (one a class
// and save slot, as everything of a hero is), restocked every few runs, and a trade: gear from the stash for one piece
// of his stock, worth at least what he asks. Only banked gear is in the stash, so nothing unbanked is ever traded.
import { CLASSES } from '../data/classes/index';
import { SLOTS } from '../data/items';
import { CUT, LEGENDARY_CHANCE, RARITY_VALUE, RESTOCK_RUNS, STOCK_RARITIES, VALUE_PER_LEVEL } from '../data/merchant';
import { makeItem } from './items';
import { saveProfile } from './profile';
import { randInt } from '../util';
import type { Item, Profile, Slot } from '../types';

/** What `item` is worth to the merchant, in the cheapest common's. */
export const worth = (item: Item): number => RARITY_VALUE[item.rarity] * (1 + VALUE_PER_LEVEL * Math.max(0, item.ilvl - 1));

/** What he asks for a piece of his stock: its worth and his cut. */
export const price = (item: Item): number => worth(item) * CUT;

/** The item level his stock comes at: the best wave the hero has reached in any battleground. */
const stockLevel = (p: Profile): number => Math.max(1, ...Object.values(p.records.bestReached).map((w) => w ?? 1));

/** A fresh stock for `p`'s class: a piece of each of `STOCK_RARITIES`, each of a slot of its own. */
function freshStock(p: Profile): Item[] {
  const cls = CLASSES[p.classId];
  const slots: Slot[] = SLOTS.filter((s) => !cls.excludeSlots?.includes(s));
  // (shuffled, then dealt one each: as many pieces as slots at most)
  for (let i = slots.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  const level = stockLevel(p);
  return STOCK_RARITIES.slice(0, slots.length).map((rarity, i) => {
    const r = i === STOCK_RARITIES.length - 1 && Math.random() < LEGENDARY_CHANCE ? 'legendary' : rarity;
    return makeItem({ slot: slots[i], rarity: r, ilvl: level + randInt(0, 1), cls });
  });
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

/** `ids` from the stash offered for his piece `wanted`. */
export function offer(p: Profile, wanted: Item, ids: readonly string[]): Offer {
  const given = p.stash.filter((it) => ids.includes(it.id));
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
