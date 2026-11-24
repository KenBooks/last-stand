// Who in a room is away from the game (#847: "Add an AFK label above the player's name tag when they switch tabs or
// are inactive in the game"). This game's player is away while its page is hidden (another tab, the window
// minimised or covered) or no key, click, touch or mouse move has come for `IDLE_MS`; it says so in its state
// (`StateMsg.afk`). A partner is away while its state says so, or while none has come from it for `QUIET_MS`: a
// hidden page draws no frames and sends nothing, so its last word may never come. Shown over the name tag
// (`updateNameTags` in ui/coop.ts).
import type { Player } from '../entities/player';

/** no input for this long and the player is away (ms) */
const IDLE_MS = 60_000;
/** no state from a partner for this long and it's away (ms): its reports come many times a second */
const QUIET_MS = 3_000;

let lastInput = performance.now();
/** the lab's canary (`lab coop --scenarios afk --canary`): this game's state never says it's away */
let quiet = false;
const heard = new WeakMap<Player, { afk: boolean; at: number }>();

/** Every kind of input keeps this game's player here. Called once, as the game boots. */
export function watchInput(): void {
  const here = (): void => noteInput();
  for (const type of ['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart']) {
    window.addEventListener(type, here, { capture: true, passive: true });
  }
  document.addEventListener('visibilitychange', here);
}

/** This game's player gave input now (a key, a click, a touch, the mouse moved). */
export function noteInput(): void { lastInput = performance.now(); }

/** The lab's canary: this game's state never says it's away while `hold`. */
export function holdAwayWord(hold: boolean): void { quiet = hold; }

/** Whether this game's state says it's away (as `awayHere`, but held silent by the lab's canary). */
export const awayToSay = (): boolean => !quiet && awayHere();

/** Whether this game's player is away now: its page hidden, or no input for `IDLE_MS`. */
export function awayHere(now = performance.now()): boolean {
  return document.hidden || now - lastInput > IDLE_MS;
}

/** A partner's state came, saying whether it's away. */
export function heardFrom(p: Player, afk: boolean, now = performance.now()): void {
  heard.set(p, { afk, at: now });
}

/** Whether player `p` is away: this game's by its own page, a partner's by its word or its silence. */
export function isAway(p: Player, now = performance.now()): boolean {
  if (p.local) return awayHere(now);
  const word = heard.get(p);
  return !!word && (word.afk || now - word.at > QUIET_MS);
}
