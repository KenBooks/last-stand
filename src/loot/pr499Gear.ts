// PR 499's test gear (the Ascendant tier, #403). On that PR's preview the heroes wear Ascendant gear, and the stash
// holds a Magic, Rare, Epic and Legendary piece of every slot that glows, so each tier's colour, card and glow is a
// click away; and every wave's first reward is Ascendant, so a bank reveals one from the first wave on. Only on that
// PR's host, or in a dev build with `?pr499Gear`. Bound by the lines marked "PR 499" in `profile.ts` and `game/run.ts`:
// to remove it, unbind those, as with PR 423's (`pr423Gear.ts`).
import { CLASSES } from '../data/classes/index';
import { RUN } from '../data/balance';
import { saveKey } from './saveSlots';
import { makeItem, isTwoHanded } from './items';
import type { ClassDef, Item, Profile, RarityId, Slot } from '../types';

const HOST = 'pr-499.ls.wellscoped.dev';
const WORN: RarityId = 'ascendant';
const STASHED: RarityId[] = ['magic', 'rare', 'epic', 'legendary'];
const GLOWING: Slot[] = ['weapon', 'offhand', 'head', 'chest', 'hands'];
const ILVL = 10;

/** Whether this page is PR 499's preview (or a dev build asked to act as it). */
function onPr499(): boolean {
  if (typeof location === 'undefined') return false;
  if (location.hostname === HOST) return true;
  return import.meta.env.DEV && new URLSearchParams(location.search).has('pr499Gear');
}

/** Where it's noted that a class's hero in this save slot was given the gear, so it is given once. */
const givenKey = (classId: string): string => saveKey(`last-stand.pr499-gear.${classId}`);

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
export function seedPr499Gear(p: Profile, isNew: boolean): boolean {
  if (!onPr499()) return false;
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

/** A wave's `index`th reward on PR 499's preview: the first an Ascendant item, the rest as rolled (null). */
export function pr499WaveReward(index: number, cls: ClassDef, wave: number): Item | null {
  if (!onPr499() || index > 0) return null;
  return makeItem({ rarity: WORN, ilvl: wave + 1, cls });
}
