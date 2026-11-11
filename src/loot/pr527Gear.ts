// PR 527's test gear (the warrior's sounds in every weapon style). On that PR's preview the warrior's stash holds a
// great weapon of each kind (Greatsword, Greataxe, Maul: two-handed) and two one-handed weapons (one for each hand:
// dual wield), so every style's skills and their sounds are a click away; from the owner's review of #527, "I could
// not test dual wield and two handed, because you forgot to seed them for this PR". Only on that PR's host, or in a
// dev build with `?pr527Gear`. Bound by the lines marked "PR 527" in `profile.ts`: to remove it, unbind those, as with
// PR 423's (`pr423Gear.ts`).
import { CLASSES } from '../data/classes/index';
import { RUN } from '../data/balance';
import { saveKey } from './saveSlots';
import { makeItem, isTwoHanded } from './items';
import type { ClassDef, Item, Profile } from '../types';

const HOST = 'pr-527.ls.wellscoped.dev';
/** the class it's for, and how many one-handed weapons (a pair: one for each hand) */
const CLASS = 'warrior';
const ONE_HANDED = 2;
const ILVL = 10;
/** how many rolls a weapon of the kind wanted is looked for in (bases are drawn at random) */
const TRIES = 200;

/** Whether this page is PR 527's preview (or a dev build asked to act as it). */
function onPr527(): boolean {
  if (typeof location === 'undefined') return false;
  if (location.hostname === HOST) return true;
  return import.meta.env.DEV && new URLSearchParams(location.search).has('pr527Gear');
}

/** Where it's noted that the warrior in this save slot was given the gear, so it is given once. */
const givenKey = (classId: string): string => saveKey(`last-stand.pr527-gear.${classId}`);

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

/** A Rare weapon that `fits` (its base drawn again until it does), or null if none came in `TRIES` rolls. */
function weapon(cls: ClassDef, fits: (item: Item) => boolean): Item | null {
  for (let i = 0; i < TRIES; i++) {
    const item = makeItem({ slot: 'weapon', rarity: 'rare', ilvl: ILVL, cls });
    if (fits(item)) return item;
  }
  return null;
}

/** Give the warrior's profile the weapons: a new one always (it isn't stored yet), a stored one once. True when it
 *  did. */
export function seedPr527Gear(p: Profile, isNew: boolean): boolean {
  if (!onPr527() || p.classId !== CLASS) return false;
  if (!isNew && wasGiven(p.classId)) return false;
  const cls = CLASSES[p.classId];
  if (!cls) return false;
  const wanted: Item[] = [];
  for (const base of cls.twoHanded ?? []) {
    const great = weapon(cls, (item) => item.base === base);
    if (great) wanted.push(great);
  }
  for (let i = 0; i < ONE_HANDED; i++) {
    const one = weapon(cls, (item) => !isTwoHanded(item, cls));
    if (one) wanted.push(one);
  }
  for (const item of wanted) if (p.stash.length < RUN.bagLimit) p.stash.push(item);
  noteGiven(p.classId);
  return true;
}
