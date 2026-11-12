// The colour a player's hero wears (data/heroColours.ts): the player's own pick, kept once for whoever plays on this
// browser whatever class or save slot (as the name tag is), worn solo and asked for in a room. In a room the host's
// game hands each player a colour no one else there wears: the pick if it's free, else (or with none picked) one of
// the free ones at random, so two joiners can't end up in one colour.
import { HERO_COLOURS, heroColour, type HeroColourId } from '../data/heroColours.ts';

/** where the pick is kept (local storage) */
const KEY = 'last-stand.colour.v1';

/** the colour the room's host gave the local player (null: not in a room) */
let roomColour: HeroColourId | null = null;

/** The colour picked, kept from last time (null: none picked). */
export function savedColour(): HeroColourId | null {
  try {
    return heroColour(localStorage.getItem(KEY))?.id ?? null;
  } catch {
    return null;
  }
}

/** Keeps the pick for next time (null: none, a room gives one at random). */
export function saveColour(id: HeroColourId | null): void {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    // (storage off: picked again next time)
  }
}

/** The colour the local player wears: the room's, else the pick (null: the hero's own). */
export const ownColour = (): HeroColourId | null => roomColour ?? savedColour();

/** The colour the room gave the local player (null as it leaves). */
export function setRoomColour(id: HeroColourId | null): void {
  roomColour = id;
}

/** A colour a string names, or null. */
export const colourOf = (v: unknown): HeroColourId | null => (typeof v === 'string' ? heroColour(v)?.id ?? null : null);

/**
 * The colour for a player who asked for `wanted` (null: none) in a room where `taken` are worn: `wanted` if no one
 * wears it, else one no one wears, at random (`random` in [0, 1)).
 */
export function freeColour(
  taken: Iterable<HeroColourId | null>, wanted: HeroColourId | null, random = Math.random(),
): HeroColourId {
  const worn = new Set(taken);
  if (wanted && !worn.has(wanted)) return wanted;
  const free = HERO_COLOURS.filter((c) => !worn.has(c.id));
  const from = free.length ? free : HERO_COLOURS;
  return from[Math.floor(random * from.length) % from.length].id;
}

/** A live change never takes someone else's colour; losing a simultaneous request keeps the current one. */
export function changedColour(taken: Iterable<HeroColourId | null>, wanted: HeroColourId | null, current: HeroColourId): HeroColourId {
  const worn = new Set(taken);
  return wanted && worn.has(wanted) ? current : freeColour(worn, wanted);
}

export interface RoomColour { slot: number; col: HeroColourId }

/** Only a complete, unique host allocation is applied; malformed snapshots leave the current colours intact. */
export function roomColoursOf(value: unknown, maxPlayers: number): Map<number, HeroColourId> | null {
  if (!Array.isArray(value) || !value.length || value.length > maxPlayers) return null;
  const colours = new Map<number, HeroColourId>(), used = new Set<HeroColourId>();
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') return null;
    const { slot, col } = entry as Record<string, unknown>;
    const colour = colourOf(col);
    if (!Number.isInteger(slot) || (slot as number) < 0 || (slot as number) >= maxPlayers
      || !colour || colours.has(slot as number) || used.has(colour)) return null;
    colours.set(slot as number, colour);
    used.add(colour);
  }
  return colours.has(0) ? colours : null;
}
