// Optional portraits: a player's preference per class, independent of hero/save-slot progress.
import type { Player } from '../entities/player';

export const PORTRAIT_CLASSES = ['mage', 'warrior', 'ranger'] as const;
// One coordinated row per class, with new IDs so the original source catalog stays intact.
export const PORTRAIT_COLORS = ['Blue', 'Red', 'Green', 'Purple', 'Ochre'] as const;
const idsByClass = new Map<string, string[]>(PORTRAIT_CLASSES.map((classId) => [classId,
  PORTRAIT_COLORS.map((_, index) => `${classId}-${index + 11}`),
]));
const chosen = new Map<string, string | null>();
const remote = new WeakMap<Player, string | null>();
const keyFor = (classId: string): string => `last-stand.portrait.${classId}.v1`;

/** Only packaged portrait IDs are allowed; a peer can never supply an image URL or another class's art. */
export function portraitId(value: unknown, classId: string): string | null {
  return typeof value === 'string' && portraitIds(classId).includes(value) ? value : null;
}

/** The enabled male portraits for a supported class; a future class defaults to no portrait. */
export function portraitIds(classId: string): string[] {
  return idsByClass.get(classId) ?? [];
}

/** Read once per class, tolerating blocked storage or an obsolete/corrupt saved choice. */
export function savedPortrait(classId: string): string | null {
  if (!chosen.has(classId)) {
    let id: string | null = null;
    try { id = portraitId(localStorage.getItem(keyFor(classId)), classId); } catch { /* optional preference */ }
    chosen.set(classId, id);
  }
  return chosen.get(classId) ?? null;
}

/** Keep a valid choice, or explicitly choose none. A storage failure still lets the current session use it. */
export function savePortrait(classId: string, value: unknown): boolean {
  const id = portraitId(value, classId);
  if (value !== null && !id) return false;
  chosen.set(classId, id);
  try {
    if (id) localStorage.setItem(keyFor(classId), id);
    else localStorage.removeItem(keyFor(classId));
  } catch { /* optional preference */ }
  return true;
}

/** The local preference or a partner's validated choice, never a portrait from another class. */
export function portraitOf(player: Player): string | null {
  return player.local ? savedPortrait(player.cls.id) : remote.get(player) ?? null;
}

/** Accept a partner's choice; return whether the lobby needs refreshing. Invalid state is ignored. */
export function receivePortrait(player: Player, value: unknown): boolean {
  const id = portraitId(value, player.cls.id);
  if ((value !== null && !id) || portraitOf(player) === id) return false;
  remote.set(player, id);
  return true;
}
