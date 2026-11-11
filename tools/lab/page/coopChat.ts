// `lab coop`'s `chat` scenario (page/coop.ts plays it, node/coopChat.mjs judges it): the guest opens the chat with
// Enter and says a line holding markup; the host answers, and later says one longer than a message may be; the guest
// says seven in a breath (more than the burst lets through); then the guest opens the box and shuts it with Esc. Each game records the
// chat's lines as its page shows them (each line's name and text, as text), whether its box is open and whether its
// pause menu is.
import { G } from '../../../src/state';
import { isDown } from '../../../src/core/input';

/** the game's chat on the page, where the tree has it (an older one has none) */
type ChatUi = typeof import('../../../src/ui/chat');
const chatUi = Object.values(import.meta.glob<ChatUi>('../../../src/ui/chat.ts', { eager: true }))[0];
import type { Frame } from './lab';

/** A message the scenario says: who, on which frame (after it settled), and what. */
export interface Said {
  by: 'host' | 'guest'; frame: number; text: string;
  /** frames it stays typed in the open box before it's sent (none: sent as it's typed), for a picture of it */
  held?: number;
}

/** the line with markup in it, which must show as it was typed */
export const MARKUP = 'Hello <b>host</b> & <i>all</i>';
/** a line longer than a message may be (the game's `CHAT.most`, 200) */
export const LONG = 'x'.repeat(320);
/** the frames the guest opens the box on and says a line (Enter, then the line sent a few frames later) */
export const SAID: Said[] = [
  { by: 'guest', frame: 10, text: MARKUP },
  ...Array.from({ length: 7 }, (_, i): Said => ({ by: 'guest', frame: 420 + i * 4, text: `quick ${i + 1}` })),
  { by: 'host', frame: 200, text: 'Hi there', held: 25 },
  // (the host's, after the pictures of short lines: the box as small as they leave it)
  { by: 'host', frame: 380, text: LONG },
  // (long after the guest's burst, the chat quiet and faded on both: the host's line brings it back)
  { by: 'host', frame: 1110, text: 'still there?' },
];
/** the frames the guest's chat must still show (7.5 s after its last line, the burst's), be faded for quiet (11 s
 *  after it: the game's `CHAT.idle` is 10) and be back (the host's line come) */
export const QUIET = { shown: 900, faded: 1100, back: 1145 };

/** the frame the guest opens the box, presses Alt in it (and lets it go) and presses Esc in it */
export const ESC_AT = { open: 300, alt: 303, esc: 310 };
/** the frames between Enter and the line sent */
const TYPING = 3;

/** whether Alt pressed in the guest's open box reached the game, as it was pressed (null: not yet pressed) */
let altReached: boolean | null = null;

/** The chat's elements on this page (none in an older tree). */
const box = (): HTMLElement | null => document.querySelector<HTMLElement>('#chat');
const field = (): HTMLInputElement | null => document.querySelector<HTMLInputElement>('#chat .chat-input');

/** `role`'s input in `chat` at `frame` after it settled: Enter to open the box, then the line typed and sent (as
 *  Enter in the box sends it: its form's submit), and Esc pressed in the box. */
export function chatInput(role: 'host' | 'guest', frame: number): Frame {
  for (const said of SAID) {
    if (said.by !== role) continue;
    if (frame === said.frame) return { keys: ['enter'] };
    if (frame === said.frame + TYPING && field()) field()!.value = said.text;
    if (frame === said.frame + TYPING + (said.held ?? 0) && field()) field()!.form?.requestSubmit();
  }
  if (role === 'guest' && frame === ESC_AT.open) return { keys: ['enter'] };
  // (Alt pressed and let go in the open box, as a real key on its field: the game must have it held)
  // (read at once: the lab sets the held keys afresh each frame from what its frames hold)
  if (role === 'guest' && frame === ESC_AT.alt && field()) {
    field()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', code: 'AltLeft', bubbles: true, cancelable: true }));
    altReached = isDown('altleft');
    field()!.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', code: 'AltLeft', bubbles: true, cancelable: true }));
  }
  if (role === 'guest' && frame === ESC_AT.esc && field()) {
    field()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
  }
  return {};
}

/** A line as the page shows it: the name it's under (none: the game's own word) and its text. */
export interface ShownLine { name: string | null; text: string }

/** The chat as this page shows it this frame: its lines, whether its box is open, and the pause menu's state. */
export interface ChatSample { lines: ShownLine[]; open: boolean; focused: boolean; menuOpen: boolean; idle?: boolean; alt?: boolean }

export function chatNow(): ChatSample {
  const lines = [...(box()?.querySelectorAll<HTMLElement>('.chat-line') ?? [])].map((line) => {
    // (`Name: text`: the name's element holds `Name:`)
    const shown = line.querySelector('.chat-name')?.textContent ?? null;
    const text = (line.textContent ?? '').slice(shown ? shown.length + 1 : 0);
    return { name: shown ? shown.replace(/:$/, '') : null, text };
  });
  return {
    lines, open: !!box()?.classList.contains('open'), focused: document.activeElement === field(), menuOpen: G.menuOpen,
    idle: chatUi?.chatIdle?.(), alt: altReached ?? undefined,
  };
}
