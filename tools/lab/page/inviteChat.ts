// `lab invite`'s side of a page for the chat with the agent (tools/lab/node/inviteChat.mjs, src/dev/agentChat.ts):
// the game's chat read as it shows, and worked as the player works it, by the keyboard (Enter for the game, a line
// typed, its form sent) and by touch (a finger's tap turning touch mode on, the chat button, Send).
import { chatLines, chatNote } from '../../../src/net/chat';
import { session } from '../../../src/net/session';
import { G } from '../../../src/state';
import { isTouch } from '../../../src/ui/touch';
import type { Lab } from './lab';

/** A line as the chat shows it: its kind (`chat-line`, `aside` the agent's, `note` the game's), name, text and tag. */
export interface ShownLine { kind: string; name: string; text: string; tag: string }

/** What the page shows of the chat. */
export interface ChatState {
  /** the chat shown, its box open, its prompt; the touch button shown, and touch mode on */
  shown: boolean; open: boolean; prompt: string; button: boolean; touch: boolean;
  /** the lines shown, oldest first, and those the chat keeps */
  lines: ShownLine[]; kept: number;
  /** the co-op session: 'off' in a solo game, where nothing goes over co-op's link */
  session: string;
  /** why the chat may be hidden: the game's menu up, the field focused */
  menuOpen: boolean; focused: boolean;
}

const shown = (element: Element | null): boolean => Boolean(element && !element.classList.contains('hidden'));

/** One line as the page shows it. */
function shownLine(element: Element): ShownLine {
  const name = element.querySelector('.chat-name')?.textContent ?? '';
  const tag = element.querySelector('.chat-tag')?.textContent ?? '';
  const whole = element.textContent ?? '';
  const text = whole.slice(name.length, whole.length - tag.length).trim();
  return { kind: element.className, name, text, tag: tag.trim() };
}

/** What the page shows now. */
export function chatState(): ChatState {
  const root = document.querySelector('#chat');
  const field = document.querySelector<HTMLInputElement>('#chat .chat-input');
  return {
    shown: shown(root),
    open: Boolean(root?.classList.contains('open')),
    prompt: field?.placeholder ?? '',
    button: shown(document.querySelector('#btn-chat')),
    touch: isTouch(),
    lines: [...document.querySelectorAll('#chat .chat-line')].map(shownLine),
    kept: chatLines.length,
    session: session.status,
    menuOpen: G.menuOpen,
    focused: Boolean(field && document.activeElement === field),
  };
}

/** The middle of the element `selector` names (css px), or throws. */
function middleOf(selector: string): { x: number; y: number } {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`invite chat: no ${selector}`);
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

/** The open box's line sent as Enter in it sends it: its form's submit (the lab's Enter, from the DevTools protocol,
 *  carries no text, so the browser never submits on it; `lab coop`'s chat sends so too). */
export function chatSubmit(): void {
  const form = document.querySelector<HTMLFormElement>('#chat .chat-form');
  if (!form) throw new Error('invite chat: no chat form');
  form.requestSubmit();
}

/** Enter pressed for the game, as the lab's frames hold keys (it sets them afresh each frame): the box opened. */
export async function chatOpenByKey(lab: Lab): Promise<void> {
  await lab.step(1, () => ({ keys: ['enter'] }));
  await lab.step(1);
}

/** `text` put in the focused field, as a keyboard or a paste puts it. */
export async function chatType(lab: Lab, { text }: { text: string }): Promise<void> {
  await lab.type(text);
}

/** A finger's tap on the badge's label (touch mode on: it follows the last pointer used), or a mouse's click there
 *  (touch mode off again). The label does nothing of its own. */
export async function chatPointer(lab: Lab, { touch }: { touch: boolean }): Promise<void> {
  const at = middleOf('#dev-agent-badge span');
  if (touch) await lab.tap(at);
  else await lab.click(at);
}

/** A finger's tap on the chat's touch button, or on its Send. */
export async function chatTap(lab: Lab, { what }: { what: 'button' | 'send' }): Promise<void> {
  await lab.tap(middleOf(what === 'button' ? '#btn-chat' : '#chat .chat-send'));
}

/** The canary's answer: a line of the game's own word, not under the agent's name. */
export function chatCanaryNote(_lab: Lab, { text }: { text: string }): void {
  chatNote(text);
}
