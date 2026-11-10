// A save slot's whole content as plain data (cloud saves, #504): every key a slot keeps, read, written, moved and
// erased as one. A hero's part is his class's entries (profile, loadouts per weapon style, stash filter, a preview's
// test-gear marks), the slot's own is the class last played. Values stay as stored (strings), so a move or an upload
// changes nothing in them. Names are given as slot 1's (the keys from before there were slots); `saveKey` makes
// another slot's.
import { CLASS_IDS } from '../data/classes/index';
import { readCookie, writeCookie, removeCookie } from '../core/cookies';
import { saveKey } from './saveSlots';
import type { WeaponStyle } from '../types';

const STYLES: (WeaponStyle | null)[] = [null, 'shield', 'twoHanded', 'dual', 'oneHanded'];
/** the class last played in the slot */
export const CLASS_ENTRY = 'last-stand-class';
/** slot 1's keys from before classes: the mage's (read as his, dropped as his are written) */
const LEGACY: Record<string, string> = {
  'last-stand.profile.mage.v1': 'last-stand.profile.v1',
  'last-stand.stash-filter.mage.v1': 'last-stand.stash-filter.v1',
};

interface Entry { name: string; cookie: boolean }

/** Every entry a class's hero keeps in a slot. */
export function heroEntries(classId: string): Entry[] {
  return [
    { name: `last-stand.profile.${classId}.v1`, cookie: false },
    { name: `last-stand.stash-filter.${classId}.v1`, cookie: false },
    { name: `last-stand.pr423-gear.${classId}`, cookie: false },
    { name: `last-stand.pr499-gear.${classId}`, cookie: false },
    ...STYLES.map((style) => ({ name: `last-stand-loadout-${classId}${style ? '-' + style : ''}`, cookie: true })),
  ];
}

const slotEntries = (): Entry[] => [...CLASS_IDS.flatMap(heroEntries), { name: CLASS_ENTRY, cookie: true }];

/** entry name (slot 1's) -> its value as stored */
export type Entries = Record<string, string>;

function read(entry: Entry, slot: number): string | null {
  const name = saveKey(entry.name, slot);
  try {
    if (entry.cookie) return readCookie(name);
    return localStorage.getItem(name) ?? (slot === 1 && LEGACY[entry.name] ? localStorage.getItem(LEGACY[entry.name]) : null);
  } catch { return null; }
}

function write(entry: Entry, slot: number, value: string | null): void {
  const name = saveKey(entry.name, slot);
  try {
    if (entry.cookie) {
      if (value === null) removeCookie(name);
      else writeCookie(name, value);
      return;
    }
    if (value === null) localStorage.removeItem(name);
    else localStorage.setItem(name, value);
    if (slot === 1 && LEGACY[entry.name]) localStorage.removeItem(LEGACY[entry.name]);
  } catch { /* storage unavailable or full: the slot keeps what it had */ }
}

/** What a set of entries holds in `slot`. */
function readAll(entries: Entry[], slot: number): Entries {
  const out: Entries = {};
  for (const entry of entries) {
    const value = read(entry, slot);
    if (value !== null) out[entry.name] = value;
  }
  return out;
}

/** A hero's entries in `slot` ({} if he never played there). */
export const readHero = (classId: string, slot: number): Entries => readAll(heroEntries(classId), slot);

/** A hero's entries written to `slot` as given: any of his not given are removed. */
export function writeHero(classId: string, slot: number, entries: Entries): void {
  for (const entry of heroEntries(classId)) write(entry, slot, entries[entry.name] ?? null);
}

/** Whether a hero ever played in `slot` (his profile is kept). */
export const heroIn = (classId: string, slot: number): boolean => read(heroEntries(classId)[0], slot) !== null;

/** Whether `slot` holds nothing: a fresh start. */
export const slotEmpty = (slot: number): boolean => !CLASS_IDS.some((id) => heroIn(id, slot));

/** A whole slot. */
export const readSlot = (slot: number): Entries => readAll(slotEntries(), slot);

/** A whole slot written as given: every entry not given is removed. */
export function writeSlot(slot: number, entries: Entries): void {
  for (const entry of slotEntries()) write(entry, slot, entries[entry.name] ?? null);
}

/** Slots rearranged at once: `order[i]` is the slot whose content goes to slot i + 1 (0: left empty). Each is read
 *  before any is written, so a shift never reads what it just wrote. */
export function rearrangeSlots(order: number[]): void {
  const contents = order.map((from) => (from ? readSlot(from) : {}));
  contents.forEach((entries, i) => writeSlot(i + 1, entries));
}
