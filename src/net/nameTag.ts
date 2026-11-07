// A player's name tag in co-op: the player's own, not a hero's (kept once for whoever plays on this browser, whatever
// class or save slot), asked for when a room is opened or joined, and unique within a room (the host's game decides:
// a guest whose tag is taken there is asked for another before it gets in). Solo play never asks for one.

/** where the tag is kept (local storage) */
const KEY = 'last-stand.name.v1';
/** a tag's most characters: it has to fit a partner's frame and the label over a head */
export const TAG_MAX = 16;
/** what a tag may hold: letters of any script, digits, spaces, and a few marks */
const ALLOWED = /^[\p{L}\p{N} ._'-]+$/u;

/** A tag as typed, tidied: trimmed, its runs of spaces one, cut to `TAG_MAX`. */
export const cleanTag = (typed: string): string =>
  typed.normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, TAG_MAX).trim();

/** Why a (cleaned) tag can't be used, or null when it can. */
export function tagProblem(tag: string): string | null {
  if (!tag) return 'Enter a name tag first: it is how the others in the room see you.';
  if (!ALLOWED.test(tag)) return 'A name tag may hold letters, digits, spaces and . _ \' - only.';
  return null;
}

/** Whether two tags are the same to the players reading them (case and accents aside). */
export const sameTag = (a: string, b: string): boolean =>
  a.localeCompare(b, undefined, { sensitivity: 'base' }) === 0;

/** The tag kept from last time ('' if none). */
export function savedTag(): string {
  try {
    return cleanTag(localStorage.getItem(KEY) ?? '');
  } catch {
    return '';
  }
}

/** Keeps the tag for next time. */
export function saveTag(tag: string): void {
  try {
    localStorage.setItem(KEY, tag);
  } catch {
    // (storage off: asked again next time)
  }
}
