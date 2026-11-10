// Co-op text chat on the page (net/chat.ts holds the lines): Enter opens a box to type in (Enter sends, Esc shuts it,
// as does a click away), on touch the chat button by the pause and scores buttons. The lines show in the bottom left
// corner, each a few seconds before it fades (a few at once); with the box open, all those kept, to scroll back
// through. A line is a page element placed once (none moves with the world, so none is drawn over the frame: the
// root's rule is for what follows the world), its fade the compositor's opacity alone.
import { G } from '../state';
import { CHAT } from '../data/balance';
import { wasPressed } from '../core/input';
import { sfx } from '../core/audio';
import { isCoop } from '../net/role';
import { chatLines, chatNote, onChatLine, say, type ChatLine } from '../net/chat';
import { nameOf } from './coop';
import { heroColour } from '../data/heroColours';
import { isTouch } from './touch';

let root: HTMLElement | null = null;
let log: HTMLElement;
let form: HTMLFormElement;
let field: HTMLInputElement;
let button: HTMLButtonElement;
/** the box is open to type in */
let open = false;
/** when something last happened in the chat (s, the page's clock): a line came, the box opened or was typed in */
let lastActive = -Infinity;
const now = (): number => performance.now() / 1000;

/** A player's name in the chat in the colour they picked, the one their hero wears (in a room the host hands each
 *  one out: `net/heroColour.ts`; from play, "colour should be the colour that you chose, that's the chat (username)
 *  colour"), lit a little to read over the dark panel; with none, the party's blue (_chat.scss). */
function nameColour(line: ChatLine): string | null {
  const swatch = heroColour(line.by?.colour)?.swatch;
  return swatch ? `color-mix(in srgb, ${swatch} 72%, #fff)` : null;
}

/** The chat's elements, made once (outside the HUD: it shows in the lobby too). */
function make(): void {
  if (root) return;
  root = document.createElement('div');
  root.id = 'chat';
  root.className = 'hidden';
  root.innerHTML = '<div class="chat-log" role="log" aria-live="polite" aria-label="Chat"></div>'
    + '<form class="chat-form" autocomplete="off"><input class="chat-input" type="text" enterkeyhint="send" '
    + `maxlength="${CHAT.most}" aria-label="Say to the party" placeholder="Say to the party…">`
    // (its Enter key drawn on it: Enter sends)
    + '<button type="submit" class="chat-send" aria-label="Send (Enter)">Send <span class="chat-enter" aria-hidden="true">⏎</span></button></form>';
  document.body.appendChild(root);
  log = root.querySelector('.chat-log')!;
  form = root.querySelector('.chat-form')!;
  field = root.querySelector('.chat-input')!;
  root.style.setProperty('--chat-fade', `${CHAT.fade}s`);
  // (a press on Send mustn't take the field's focus first: its blur would shut the box under the press)
  root.querySelector('.chat-send')!.addEventListener('pointerdown', (e) => e.preventDefault());
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    send();
  });
  field.addEventListener('keydown', (e) => {
    // (the game's keys aren't the box's: Esc shuts it, and pauses nothing)
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); shut(); }
  });
  field.addEventListener('blur', () => { if (open) shut(); });
  field.addEventListener('input', () => { lastActive = now(); });
  button = document.createElement('button');
  button.id = 'btn-chat';
  button.className = 'hidden';
  button.setAttribute('aria-label', 'Chat');
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-4 4v-4H4z"/></svg>';
  // (pressed, the field keeps its focus: the phone's keyboard stays up)
  button.addEventListener('pointerdown', (e) => e.preventDefault());
  button.addEventListener('click', () => { sfx.click(); if (open) shut(); else show(); });
  document.body.appendChild(button);
  onChatLine(lineCame);
  for (const line of chatLines) lineCame(line);
}

/** A line as it comes: added at the foot (its fade begun), the oldest let go past those kept; null clears them all. */
function lineCame(line: ChatLine | null): void {
  if (!root) return;
  if (!line) { log.replaceChildren(); return; }
  const el = document.createElement('div');
  el.className = line.by ? 'chat-line' : 'chat-line note';
  if (line.by) {
    // (`Name: text`, the name in its player's colour)
    const who = document.createElement('span');
    who.className = 'chat-name';
    who.textContent = `${nameOf(line.by)}:`;
    const colour = nameColour(line);
    if (colour) who.style.color = colour;
    el.append(who, ' ');
  }
  // (text alone: a message is never markup)
  el.append(line.text);
  log.appendChild(el);
  while (log.childElementCount > CHAT.keep) log.firstElementChild!.remove();
  if (open) log.scrollTop = log.scrollHeight;
  lastActive = now();
  if (line.by && !line.by.local) sfx.chat();
}

/** The box opened to type in, the lines kept all shown. */
function show(): void {
  if (!root || open) return;
  open = true;
  lastActive = now();
  root.classList.add('open');
  log.scrollTop = log.scrollHeight;
  field.focus();
}

/** The box shut, what was typed kept for next time. */
function shut(): void {
  if (!root || !open) return;
  open = false;
  root.classList.remove('open');
  if (document.activeElement === field) field.blur();
}

/** What's typed said to the party, and the box shut (left open, saying it too fast). */
function send(): void {
  const said = say(G.player, field.value);
  if (said === 'tooFast') { chatNote('Too fast: wait a moment'); return; }
  field.value = '';
  shut();
}

/** Whether the box is open (the game's keys aren't the player's while it is). */
export const chatOpen = (): boolean => open;

/**
 * Every frame: the chat shown in a room (`allowed`: a run or the lobby, no menu, hall or saves over it), Enter opening
 * the box, the touch button shown on touch; out of a room or with something over it, all of it hidden and shut.
 */
export function updateChat(allowed: boolean): void {
  make();
  const inRoom = isCoop();
  const can = inRoom && allowed;
  root!.classList.toggle('hidden', !can);
  root!.classList.toggle('touch', isTouch());
  button.classList.toggle('hidden', !(can && isTouch()));
  button.classList.toggle('on', open);
  if (!can) { shut(); return; }
  if (!open && wasPressed('enter')) show();
  // (quiet for `CHAT.idle` s, no line come and nothing typed: the open box shuts, what was typed kept, and the lines
  // fade together; the next line, or the box opened, brings them back)
  const quiet = now() - lastActive > CHAT.idle;
  if (quiet && open) shut();
  root!.classList.toggle('idle', quiet);
}

/** Whether the chat's lines are faded for quiet (tools/lab's co-op judges it). */
export const chatIdle = (): boolean => !!root?.classList.contains('idle');
