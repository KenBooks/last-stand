// PR 423's test gear (the rarity glow, #404). On that PR's preview the heroes wear Legendary gear, and the stash
// holds a Magic, Rare and Epic piece of every slot that glows, so each rarity's glow (and none on a Magic one) is a
// click away. Only on that PR's host (other PRs seed what they test themselves), or in a dev build with `?pr423Gear`.
//
// Keep this code: seeding a preview's heroes with gear may be wanted again to test other things. When asked to
// remove it, remove only its binding (the lines in `profile.ts` marked "PR 423"), not this file, and first ask the
// owner to confirm that's what they meant.
import { CLASSES } from '../data/classes/index';
import { RUN } from '../data/balance';
import { saveKey } from './saveSlots';
import { makeItem, isTwoHanded } from './items';
import type { ClassDef, Item, Profile, RarityId, Slot } from '../types';

const HOST = 'pr-423.ls.wellscoped.dev';
const WORN: RarityId = 'legendary';
const STASHED: RarityId[] = ['magic', 'rare', 'epic'];
const GLOWING: Slot[] = ['weapon', 'offhand', 'head', 'chest', 'hands'];
const ILVL = 10;

/** Whether this page is PR 423's preview (or a dev build asked to act as it). */
function onPr423(): boolean {
  if (typeof location === 'undefined') return false;
  if (location.hostname === HOST) return true;
  return import.meta.env.DEV && new URLSearchParams(location.search).has('pr423Gear');
}

/** Where it's noted that a class's hero in this save slot was given the gear, so it is given once. */
const givenKey = (classId: string): string => saveKey(`last-stand.pr423-gear.${classId}`);

function wasGiven(classId: string): boolean {
  try {
    return localStorage.getItem(givenKey(classId)) !== null;
  } catch {
    return true;
  }
}

function noteGiven(classId: string): void {
  try {
    localStorage.setItem(givenKey(classId), '1');
  } catch { /* storage unavailable */ }
}

/** The worn weapon, one-handed for a class that wears an off-hand (as its starter gear is chosen). */
function wornItem(slot: Slot, cls: ClassDef, slots: Slot[]): Item {
  let item = makeItem({ slot, rarity: WORN, ilvl: ILVL, cls });
  const wantsOneHand = slot === 'weapon' && slots.includes('offhand');
  for (let i = 0; i < 20 && wantsOneHand && isTwoHanded(item, cls); i++) {
    item = makeItem({ slot, rarity: WORN, ilvl: ILVL, cls });
  }
  return item;
}

/** Give a profile the gear: a new one always (it isn't stored yet), a stored one once. True when it did. */
export function seedPr423Gear(p: Profile, isNew: boolean): boolean {
  if (!onPr423()) return false;
  if (!isNew && wasGiven(p.classId)) return false;
  const cls = CLASSES[p.classId];
  if (!cls) return false;
  const slots = GLOWING.filter((s) => !cls.excludeSlots?.includes(s));
  for (const slot of slots) {
    const old = p.equipped[slot];
    p.equipped[slot] = wornItem(slot, cls, slots);
    if (old && p.stash.length < RUN.bagLimit) p.stash.push(old);
    for (const rarity of STASHED) {
      if (p.stash.length < RUN.bagLimit) p.stash.push(makeItem({ slot, rarity, ilvl: ILVL, cls }));
    }
  }
  noteGiven(p.classId);
  return true;
}
