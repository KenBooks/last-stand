// The developer mode's gear: any base of any slot at any rarity, worn or put in the stash, a whole kit at a rarity, the
// stash filled with every base, and each weapon style a class can hold (two-handed, two one-handers, one with an
// off-hand). Everything goes through the profile as the lobby's own moves do, so it's saved as theirs is: on a
// preview or the dev server, whose saves are their own host's, never production's.
import { G } from '../state';
import { CLASSES } from '../data/classes/index';
import { RUN } from '../data/balance';
import { SLOTS } from '../data/items';
import { basesFor, isTwoHanded, makeItem } from '../loot/items';
import { equipFromStash, saveProfile } from '../loot/profile';
import type { ClassDef, Item, RarityId, Slot } from '../types';

/** the item level the dev's gear rolls at: a late run's, so its stats read as a late run's do */
export const DEV_ILVL = 30;

export const classOf = (): ClassDef => CLASSES[G.profile.classId];
/** The slots the hero in play wears. */
export const slotsOf = (cls: ClassDef): Slot[] => SLOTS.filter((s) => !cls.excludeSlots?.includes(s));

const item = (slot: Slot, base: string, rarity: RarityId, cls: ClassDef): Item => makeItem({ slot, base, rarity, ilvl: DEV_ILVL, cls });

/** `it` worn in `slot`, what was there going to the stash (or, with the stash full, dropped). */
function wear(it: Item, slot: Slot = it.slot): void {
  const p = G.profile;
  if (p.stash.length >= RUN.bagLimit) p.stash.pop();
  p.stash.unshift(it);
  equipFromStash(p, it.id, slot);
}

/** A new piece of `base` at `rarity` worn in its slot (`offhand`: a one-hander in the off-hand). */
export function wearNew(slot: Slot, base: string, rarity: RarityId, offhand = false): void {
  wear(item(slot, base, rarity, classOf()), offhand ? 'offhand' : slot);
}

/** A new piece of `base` at `rarity` in the stash; false when it's full. */
export function stashNew(slot: Slot, base: string, rarity: RarityId): boolean {
  const p = G.profile;
  if (p.stash.length >= RUN.bagLimit) return false;
  p.stash.unshift(item(slot, base, rarity, classOf()));
  saveProfile(p);
  return true;
}

/** Every slot worn anew at `rarity`, the weapon's style kept (a two-hander stays one, an off-hand's kind stays). */
export function wearKit(rarity: RarityId): void {
  const p = G.profile, cls = classOf();
  for (const slot of slotsOf(cls)) {
    const now = p.equipped[slot];
    if (slot === 'offhand' && isTwoHanded(p.equipped.weapon, cls)) continue;
    const base = now?.base ?? basesFor(slot, cls)[0]!;
    wear(item(now?.slot ?? slot, base, rarity, cls), slot);
  }
}

/** The stash filled with every base of every slot at `rarity`, as far as it holds; how many went in. */
export function stashEveryBase(rarity: RarityId): number {
  const cls = classOf();
  let n = 0;
  for (const slot of slotsOf(cls)) for (const base of basesFor(slot, cls)) if (stashNew(slot, base, rarity)) n++;
  return n;
}

/** A way of holding weapons a class has: its name and the gear it's put on with. */
export interface WeaponStyle { name: string; wear: (rarity: RarityId) => void }

/** The class's weapon styles: a two-hander, two one-handers, a one-hander with an off-hand (each where it has one). */
export function weaponStyles(cls: ClassDef): WeaponStyle[] {
  const weapons = basesFor('weapon', cls);
  const twoHanders = weapons.filter((b) => cls.twoHanded?.includes(b));
  const oneHanders = weapons.filter((b) => !cls.twoHanded?.includes(b));
  const offhands = cls.excludeSlots?.includes('offhand') ? [] : basesFor('offhand', cls);
  const styles: WeaponStyle[] = [];
  if (twoHanders.length) styles.push({ name: 'Two-handed', wear: (r) => wearNew('weapon', twoHanders[0]!, r) });
  if (cls.dualWield && oneHanders.length) {
    styles.push({ name: 'Dual wield', wear: (r) => { wearNew('weapon', oneHanders[0]!, r); wearNew('weapon', oneHanders[1] ?? oneHanders[0]!, r, true); } });
  }
  if (oneHanders.length && offhands.length) {
    styles.push({ name: `One-hand + ${offhands[0]}`, wear: (r) => { wearNew('weapon', oneHanders[0]!, r); wearNew('offhand', offhands[0]!, r); } });
  }
  return styles;
}

/** The stash emptied. */
export function emptyStash(): void {
  G.profile.stash = [];
  saveProfile(G.profile);
}
