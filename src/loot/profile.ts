// Persistent profiles, one per class and save slot: equipment, stash and records (localStorage).
// Classes share nothing, so each has its own loot and starting waves.
import { CLASSES, CLASS_IDS, DEFAULT_CLASS } from '../data/classes/index';
import { RUN } from '../data/balance';
import { readCookie, writeCookie, removeCookie } from '../core/cookies';
import { saveKey, saveSlot } from './saveSlots';
import { cloudTouched } from './cloud';
import { makeItem, byValue, isTwoHanded, fitsOffhand } from './items';
import { seedPr423Gear } from './pr423Gear'; // PR 423's test gear: to remove, unbind these lines only (pr423Gear.ts says why)
import { seedPr499Gear } from './pr499Gear'; // PR 499's test gear: to remove, unbind these lines only
import type { Item, Profile, Slot } from '../types';

const KEY = (classId: string, slot?: number) => saveKey(`last-stand.profile.${classId}.v1`, slot);
/** the single profile from before there were classes to choose from: the mage's (in slot 1) */
const LEGACY = 'last-stand.profile.v1';
const CLASS_COOKIE = 'last-stand-class';

function fresh(classId: string): Profile {
  const cls = CLASSES[classId];
  const equipped: Profile['equipped'] = {};
  for (const g of cls.starterGear) {
    // Prefer a one-handed starter only when the class also starts with an off-hand.
    let it = makeItem({ ...g, cls });
    for (let i = 0; i < 20 && cls.starterGear.some((s) => s.slot === 'offhand') && isTwoHanded(it, cls); i++) it = makeItem({ ...g, cls });
    equipped[g.slot] = it;
  }
  const p: Profile = {
    classId: cls.id,
    equipped,
    stash: [],
    records: { bestWave: 0, bestBanked: {}, bestReached: {}, runs: 0, banked: 0, bestScore: 0, kills: 0, time: 0 },
  };
  seedPr423Gear(p, true); // PR 423's test gear
  seedPr499Gear(p, true); // PR 499's test gear
  return p;
}

function read(key: string): Profile | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  const p = JSON.parse(raw);
  if (!p || !p.equipped || !Array.isArray(p.stash)) return null;
  p.records.bestBanked ??= {}; // older profiles: bestWave counts deaths too, so start over
  p.records.bestReached ??= { ...p.records.bestBanked }; // only banked waves have a known biome in old saves
  return p;
}

export function loadProfile(classId: string): Profile {
  try {
    const p = read(KEY(classId));
    if (p) {
      const loaded = { ...p, classId };
      if (seedPr423Gear(loaded, false)) saveProfile(loaded); // PR 423's test gear
      if (seedPr499Gear(loaded, false)) saveProfile(loaded); // PR 499's test gear
      return loaded;
    }
    if (classId === 'mage' && saveSlot() === 1) {
      const old = read(LEGACY);
      if (old) {
        old.classId = classId;
        saveProfile(old);
        localStorage.removeItem(LEGACY);
        return old;
      }
    }
  } catch { /* storage unavailable or corrupt: start fresh */ }
  return fresh(classId);
}

export function saveProfile(p: Profile): void {
  p.saved = Date.now();
  try { localStorage.setItem(KEY(p.classId), JSON.stringify(p)); } catch { /* ignore */ }
  if (saveSlot() === 1) cloudTouched();
}

/** A class's profile in a save slot as stored, without touching it (null: never played there). */
export function peekProfile(classId: string, slot: number): Profile | null {
  try {
    return read(KEY(classId, slot)) ?? (classId === 'mage' && slot === 1 ? read(LEGACY) : null);
  } catch { return null; }
}

/** Erase a save slot's heroes (every class) and the class it was on. */
export function eraseProfiles(slot: number): void {
  try {
    for (const id of CLASS_IDS) localStorage.removeItem(KEY(id, slot));
    if (slot === 1) localStorage.removeItem(LEGACY);
  } catch { /* storage unavailable */ }
  removeCookie(saveKey(CLASS_COOKIE, slot));
}

/** Start the class over (the other classes keep theirs). */
export function resetProfile(classId: string): Profile {
  const p = fresh(classId);
  saveProfile(p);
  return p;
}

/** The class picked last time in the lobby, in the save slot in use (cookie). */
export function savedClass(fallback = DEFAULT_CLASS): string {
  const id = readCookie(saveKey(CLASS_COOKIE));
  return id && Object.hasOwn(CLASSES, id) ? id : fallback;
}

/** Whether a hero was ever chosen or played in the save slot in use (a first visit has neither: it opens on the hero
 *  selection screen; a player from before it had played the mage without ever choosing). */
export const hasSavedClass = (): boolean =>
  readCookie(saveKey(CLASS_COOKIE)) !== null || CLASS_IDS.some((id) => peekProfile(id, saveSlot()) !== null);

export function saveClass(classId: string): void { writeCookie(saveKey(CLASS_COOKIE), classId); }

/** The slots an item can go in: its own, and the off-hand for a one-handed weapon of a class that dual-wields. */
export function slotsFor(p: Profile, item: Item): Slot[] {
  return fitsOffhand(item, CLASSES[p.classId]) ? ['weapon', 'offhand'] : [item.slot];
}

// Move an item from the stash into a slot (swapping out the current one). Without a slot, it goes in
// its own, except a one-handed weapon fills an empty off-hand next to another one-hander
export function equipFromStash(p: Profile, itemId: string, to?: Slot): void {
  const idx = p.stash.findIndex((i) => i.id === itemId);
  if (idx < 0) return;
  const item = p.stash[idx];
  const cls = CLASSES[p.classId];
  const main = p.equipped.weapon;
  const slot = to ?? (fitsOffhand(item, cls) && main && !isTwoHanded(main, cls) && !p.equipped.offhand ? 'offhand' : item.slot);
  if (!slotsFor(p, item).includes(slot)) return;
  const prev = p.equipped[slot];
  // a two-handed weapon and an off-hand don't go together: the other one goes to the stash
  const clash = slot === 'weapon' && isTwoHanded(item, cls) ? 'offhand' : slot === 'offhand' && isTwoHanded(main, cls) ? 'weapon' : null;
  const bumped = clash ? p.equipped[clash] : undefined;
  if (bumped && p.stash.length + (prev ? 1 : 0) > RUN.bagLimit) return;
  p.stash.splice(idx, 1);
  if (prev) p.stash.splice(idx, 0, prev);
  if (bumped) { delete p.equipped[clash!]; p.stash.unshift(bumped); }
  p.equipped[slot] = item;
  saveProfile(p);
}

export function unequip(p: Profile, slot: Slot): void {
  const it = p.equipped[slot];
  if (!it || p.stash.length >= RUN.bagLimit) return;
  delete p.equipped[slot];
  p.stash.unshift(it);
  saveProfile(p);
}

/** Take an item out of the stash (to throw it on the lobby floor). */
export function discard(p: Profile, itemId: string): Item | undefined {
  const it = p.stash.find((i) => i.id === itemId);
  p.stash = p.stash.filter((i) => i !== it);
  saveProfile(p);
  return it;
}

export function discardEquipped(p: Profile, slot: Slot): Item | undefined {
  const it = p.equipped[slot];
  delete p.equipped[slot];
  saveProfile(p);
  return it;
}

/** An item picked up off the lobby floor; false when the stash is full. */
export function addToStash(p: Profile, item: Item): boolean {
  if (p.stash.length >= RUN.bagLimit) return false;
  p.stash.unshift(item);
  saveProfile(p);
  return true;
}

// When the stash would overflow, the least valuable items of stash and loot together
// go, so new loot pushes out weaker stash items and is only discarded when nothing in
// the stash is weaker (on a tie the stash item stays).
export function bankItems(p: Profile, items: Item[]): { lost: Item[]; replaced: Item[] } {
  const keep = new Set([...p.stash, ...items].sort(byValue).slice(0, RUN.bagLimit));
  const replaced = p.stash.filter((i) => !keep.has(i));
  const kept = items.filter((i) => keep.has(i)).sort(byValue);
  p.stash = p.stash.filter((i) => keep.has(i)).concat(kept);
  p.records.banked += kept.length;
  saveProfile(p);
  return { lost: items.filter((i) => !keep.has(i)), replaced };
}
