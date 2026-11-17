// Trading banked gear between two players (the protocol is net/trade.ts, the window ui/trade.ts): what can be put in
// an offer, an item from a partner's game made safe to keep, and the swap itself on one profile. Only the stash's
// gear is traded, never a run's bag (loot is hidden until banked) nor what the hero wears. While a trade is open its
// offered items are locked (`tradeLocked`): the stash's own moves (worn, thrown on the floor) pass them over, so an
// item can't leave the stash between the offer and the swap.
import { CLASSES } from '../data/classes/index';
import { RARITIES, SLOTS, STATS } from '../data/items';
import { RUN, TRADE } from '../data/balance';
import { basesFor, newItemId } from './items';
import type { ClassDef, Item, Profile, School, StatBlock, StatKey } from '../types';

/** the ids of the stash's items in the open trade's offer (none open: empty) */
export const tradeLocked = new Set<string>();

const SCHOOLS: School[] = ['arcane', 'fire', 'lightning', 'healing'];

/** The classes whose bases hold `item`'s (the lobby floor's rule: a class picks up only what it can wear). */
export const usersOf = (item: Item): ClassDef[] =>
  Object.values(CLASSES).filter((c) => basesFor(item.slot, c).includes(item.base));

/** Whether a hero of `classId` can use `item`. */
export const usableBy = (item: Item, classId: string): boolean => usersOf(item).some((c) => c.id === classId);

/** Why `item` of the stash can't go in an offer to a hero of `partnerClass` (null: it can). */
export function offerProblem(item: Item, partnerClass: string | null): string | null {
  if (partnerClass && !usableBy(item, partnerClass)) {
    const name = CLASSES[partnerClass]?.name ?? 'partner';
    return `A ${name} can't use it`;
  }
  return null;
}

/** An item a partner's game sent, as plain data we can keep, or null if it isn't one: its fields checked against
 *  the game's own lists (a partner's game is another's code, and nothing it sends is trusted as it comes). */
export function cleanItem(raw: unknown): Item | null {
  if (!raw || typeof raw !== 'object') return null;
  const it = raw as Record<string, unknown>;
  const text = (v: unknown, most: number) => typeof v === 'string' && v.length > 0 && v.length <= most;
  if (!text(it.id, 40) || !text(it.name, 80) || !text(it.base, 40)) return null;
  if (!SLOTS.includes(it.slot as Item['slot'])) return null;
  if (!RARITIES.some((r) => r.id === it.rarity)) return null;
  if (typeof it.ilvl !== 'number' || !Number.isFinite(it.ilvl) || it.ilvl < 0 || it.ilvl > 1000) return null;
  if (!it.stats || typeof it.stats !== 'object') return null;
  const stats: StatBlock = {};
  for (const [key, value] of Object.entries(it.stats as Record<string, unknown>)) {
    if (!Object.hasOwn(STATS, key) || typeof value !== 'number' || !Number.isFinite(value)) return null;
    stats[key as StatKey] = value;
  }
  const item: Item = {
    id: it.id as string, slot: it.slot as Item['slot'], rarity: it.rarity as Item['rarity'], ilvl: it.ilvl,
    name: it.name as string, base: it.base as string, stats,
  };
  if (it.school !== undefined) {
    if (!SCHOOLS.includes(it.school as School)) return null;
    item.school = it.school as School;
  }
  return item;
}

/** An offer as it came over the link: at most `TRADE.most` items, each one clean, no id twice (null: not one). */
export function cleanOffer(raw: unknown): Item[] | null {
  if (!Array.isArray(raw) || raw.length > TRADE.most) return null;
  const items = raw.map(cleanItem);
  if (items.some((it) => !it)) return null;
  const ids = new Set(items.map((it) => it!.id));
  return ids.size === items.length ? items as Item[] : null;
}

/** Why the swap of `give` (ids of our stash) for `get` (the partner's offer) won't do for our profile `p` (null:
 *  it will): every item given still in the stash, every one got usable by our class, and the stash's room after. */
export function swapProblem(p: Profile, give: string[], get: Item[]): string | null {
  if (!give.every((id) => p.stash.some((it) => it.id === id))) return 'An offered item is no longer in your stash';
  if (!get.every((it) => usableBy(it, p.classId))) return `Their offer holds gear a ${CLASSES[p.classId].name} can't use`;
  const after = p.stash.length - give.length + get.length;
  if (after > RUN.bagLimit) return `Your stash would hold ${after} of ${RUN.bagLimit}: make room first`;
  return null;
}

/** The swap on our profile `p`: `give` out of the stash, `get` into it (each a fresh id here, as a co-op host's gift
 *  gets one: another game's ids can clash with ours). Returns the items as they were added. The caller checked
 *  `swapProblem` before accepting, and the locks kept the stash's side of it since. */
export function applySwap(p: Profile, give: string[], get: Item[]): Item[] {
  const out = new Set(give);
  p.stash = p.stash.filter((it) => !out.has(it.id));
  const added = get.map((it) => ({ ...it, id: newItemId() }));
  p.stash.unshift(...added);
  return added;
}
