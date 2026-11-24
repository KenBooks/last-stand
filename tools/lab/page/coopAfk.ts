// `lab coop`'s `afk` scenario (page/coop.ts plays it, node/coopAfk.mjs judges it; #847): the guest's page is hidden
// for a while, as a player switching to another tab hides it, and shown again. On the host's screen the guest's name
// tag must say AFK over the name meanwhile, and not before or after; on the guest's own its tag says it too. Read off
// the tag as drawn: its art's height, a line taller while it says AFK. The canary keeps the guest's state from ever
// saying it's away (`holdAwayWord`), which the host's screen must then miss.
import { G } from '../../../src/state';
import { holdAwayWord, noteInput } from '../../../src/net/afk';
import { nameTagLabels } from '../../../src/ui/coop';
import type { Frame } from './lab';

/** the frames (after the scenario settled) the guest's page is hidden from and shown again at */
export const AFK_HIDDEN_AT = 60;
export const AFK_SHOWN_AT = 240;

/** what each game's page samples of the name tags in `afk`: the height of each player's, local and partner */
export interface AfkSample { mine: number; partner: number }

let hidden = false;
const shownDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');

/** The page hidden (or shown again) as the browser hides it: `document.hidden` and its event. */
function hidePage(hide: boolean): void {
  if (hide === hidden) return;
  hidden = hide;
  if (hide) Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
  else if (shownDescriptor) delete (document as { hidden?: boolean }).hidden;
  document.dispatchEvent(new Event('visibilitychange'));
}

/** A player at the keyboard: input noted each frame (the lab's input reaches the game, not the page's events, and a
 *  minute of the lab's clock without any would count as idle, net/afk.ts `IDLE_MS`). */
function atTheKeyboard(): void {
  noteInput();
}

/** The host's input in `afk`: no keys, a player at the keyboard. */
export function afkHostInput(): Frame {
  atTheKeyboard();
  return {};
}

/** The guest's input in `afk`: no keys, a player at the keyboard, its page hidden from `AFK_HIDDEN_AT` to
 *  `AFK_SHOWN_AT`. */
export function afkGuestInput(frame: number): Frame {
  atTheKeyboard();
  hidePage(frame >= AFK_HIDDEN_AT && frame < AFK_SHOWN_AT);
  return {};
}

/** The height of each player's name tag as drawn on this page (0 for none shown). */
export function afkNow(): AfkSample {
  const tags = nameTagLabels();
  const height = (local: boolean): number => {
    const tag = tags.find(({ player }) => player.local === local && G.players.includes(player));
    return tag ? tag.label.size.h : 0;
  };
  return { mine: height(true), partner: height(false) };
}

/** The canary's (`--canary`): this page's state never says it's away, or says so again (`quiet` false). */
export function afkQuiet(quiet: boolean): void {
  holdAwayWord(quiet);
}
