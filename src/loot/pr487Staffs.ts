// PR 487's test staffs (a staff per school, #402). On that PR's preview a mage's stash holds a staff of every
// school, so each school's spell is a click away, and unequipping the staff tries the both-hands lance. Only on that
// PR's host, or in a dev build with `?pr487Staffs`. As `pr423Gear.ts`: when asked to remove it, remove only its
// binding (the lines in `profile.ts` marked "PR 487"), and first ask the owner to confirm that's what they meant.
import { CLASSES } from '../data/classes/index';
import { RUN } from '../data/balance';
import { saveKey } from './saveSlots';
import { makeItem } from './items';
import type { Profile, RarityId } from '../types';

const HOST = 'pr-487.ls.wellscoped.dev';
const RARITY: RarityId = 'rare';
const ILVL = 5;

/** Whether this page is PR 487's preview (or a dev build asked to act as it). */
function onPr487(): boolean {
  if (typeof location === 'undefined') return false;
  if (location.hostname === HOST) return true;
  return import.meta.env.DEV && new URLSearchParams(location.search).has('pr487Staffs');
}

/** Where it's noted that a class's hero in this save slot was given the staffs, so they are given once. */
const givenKey = (classId: string): string => saveKey(`last-stand.pr487-staffs.${classId}`);

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

/** Give a profile a staff of every school its class's weapons roll: a new one always (it isn't stored yet), a
 *  stored one once. True when it did. */
export function seedPr487Staffs(p: Profile, isNew: boolean): boolean {
  if (!onPr487()) return false;
  if (!isNew && wasGiven(p.classId)) return false;
  const cls = CLASSES[p.classId];
  if (!cls?.schools) return false;
  for (const school of cls.schools.roll) {
    if (p.stash.length < RUN.bagLimit) p.stash.push(makeItem({ slot: 'weapon', rarity: RARITY, ilvl: ILVL, cls, school }));
  }
  noteGiven(p.classId);
  return true;
}
