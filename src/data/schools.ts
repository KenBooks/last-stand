// The schools of magic a weapon can be attuned to (the mage's staffs, #402): a staff's school sets the spell the
// staff itself casts, and shows as the colour of its crystal, of its light and of its icon's gem.
import type { School } from '../types';

export interface SchoolInfo {
  name: string;
  /** its crystal's colour, its light's and its icon's gem's */
  color: number;
}

// (arcane's is Splintering Bolt's, the crystal's since #197; lightning's deep enough not to bloom to white, as the
// warrior's crescent's, and apart from the frost spells' pale blue)
export const SCHOOLS: Record<School, SchoolInfo> = {
  arcane: { name: 'Arcane', color: 0xff4fd8 },
  fire: { name: 'Fire', color: 0xffc23a },
  lightning: { name: 'Lightning', color: 0x4aa8ff },
  healing: { name: 'Healing', color: 0xff3a48 },
};

/** A school's colour as CSS. */
export const schoolCss = (school: School): string => '#' + SCHOOLS[school].color.toString(16).padStart(6, '0');
