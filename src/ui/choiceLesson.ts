// The choice after a wave taught to a new player (#347): until this browser has banked a few times, the choice stays
// unfolded with a line on what the gamble is, instead of folding down to its buttons on its own.
// Kept in local storage, across save slots and heroes: the lesson is the game's, not a hero's.

/** where the count of banks is kept */
export const LESSON_KEY = 'last-stand.banks-taught';
/** banks after which the choice goes back to its compact form */
export const BANKS_TAUGHT = 3;

/** How many times this browser has banked a run (0 where storage is refused). */
export function banksMade(): number {
  try {
    const n = Number(localStorage.getItem(LESSON_KEY));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch { return 0; }
}

/** Whether the choice is still taught: shown with its lesson, and not folding by itself. */
export const choiceTaught = (): boolean => banksMade() < BANKS_TAUGHT;

/** A run banked (not training's leaving): one bank nearer the compact choice. */
export function noteBank(): void {
  const n = banksMade();
  if (n >= BANKS_TAUGHT) return;
  try { localStorage.setItem(LESSON_KEY, String(n + 1)); } catch { /* the lesson just stays */ }
}
