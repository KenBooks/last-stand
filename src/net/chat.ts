// Co-op text chat (#394): a player's messages to the party, in the lobby and in a run. A message has no gameplay
// effect, so every game sends its own straight to every other (`ctl` `chat`, net/session.ts) and shows the others' as
// they come (ui/chat.ts draws them). Every message is cleaned (no control characters, its spaces one, at most
// `CHAT.most` characters) and held to `CHAT.burst` a player within `CHAT.per` s, by the game that sends it and again
// by every game that hears it: a partner's game is another's code, and nothing it sends is trusted as it comes.
import { CHAT } from '../data/balance';
import type { Player } from '../entities/player';

/** A line of the chat: who wrote it (none: the game's own word), what, and when it came (s, the page's clock). */
export interface ChatLine { by: Player | null; text: string; at: number }

/** the lines kept, oldest first */
export const chatLines: ChatLine[] = [];

let sendChat: (text: string) => void = () => {};
/** How a message of ours goes to the party (set by net/session.ts while a room is open). */
export function setChatNet(send: ((text: string) => void) | null): void { sendChat = send ?? (() => {}); }

const listeners: ((line: ChatLine | null) => void)[] = [];
/** Runs `fn` with each line as it comes (ui/chat.ts shows it), and with null as they're all cleared. */
export function onChatLine(fn: (line: ChatLine | null) => void): void { listeners.push(fn); }

/** each player's messages' times (s), within `CHAT.per`: our own under `null` */
const sent = new Map<Player | null, number[]>();
const now = (): number => performance.now() / 1000;

/** Whether `by` may say another now (and if so it's counted): at most `CHAT.burst` within `CHAT.per` s. */
function allowed(by: Player | null): boolean {
  const t = now(), times = (sent.get(by) ?? []).filter((at) => t - at < CHAT.per);
  if (times.length >= CHAT.burst) {
    sent.set(by, times);
    return false;
  }
  times.push(t);
  sent.set(by, times);
  return true;
}

/** A message as it's shown: no control or format characters (a line break, a bidi override), its spaces one,
 *  trimmed, at most `CHAT.most` characters (whole ones: an emoji isn't cut in half). */
export function cleanChat(text: string): string {
  const flat = text.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ').replace(/\s+/g, ' ').trim();
  return Array.from(flat).slice(0, CHAT.most).join('').trim();
}

function add(line: ChatLine): void {
  chatLines.push(line);
  if (chatLines.length > CHAT.keep) chatLines.splice(0, chatLines.length - CHAT.keep);
  for (const fn of listeners) fn(line);
}

/** What saying `text` now does: 'sent', 'empty' (nothing left once cleaned) or 'tooFast' (over the burst). */
export type ChatSent = 'sent' | 'empty' | 'tooFast';

/** The local player says `text` to the party: shown here and sent, unless it's empty or too fast. */
export function say(me: Player, text: string): ChatSent {
  const clean = cleanChat(text);
  if (!clean) return 'empty';
  if (!allowed(null)) return 'tooFast';
  add({ by: me, text: clean, at: now() });
  sendChat(clean);
  return 'sent';
}

/** A partner's message, as its game sent it (`m.text`: checked, cleaned and held to the burst again here). */
export function chatHeard(by: Player, m: Record<string, unknown>): void {
  if (typeof m.text !== 'string' || m.text.length > CHAT.most * 8) return;
  const clean = cleanChat(m.text);
  if (!clean || !allowed(by)) return;
  add({ by, text: clean, at: now() });
}

/** The game's own word in the chat (a partner joined or left). */
export function chatNote(text: string): void { add({ by: null, text, at: now() }); }

/** Every line gone (a room left). */
export function clearChat(): void {
  chatLines.length = 0;
  sent.clear();
  for (const fn of listeners) fn(null);
}
