// The game's chat as a line between the player and the agent joined to his solo game (#923; from the owner: "be able
// to talk with AI agent from in-game chat (the coop chat)... route messages two way"). While the agent is connected the
// chat shows without a room (`setChatAside`, net/chat.ts): what the player says there goes to the agent's link alone,
// never over co-op's (there is no room: a room opening sends the agent away), and the agent's answers (the step `say`)
// show under its name, a line or two at most, held to the chat's own limit; a longer answer stays in the coding
// session's chat, the line saying so (`more`). It shuts with the agent, and its lines go with it.
import { CHAT } from '../data/balance';
import { chatAside, chatFrom, chatNote, cleanChat, clearChat, setChatAside } from '../net/chat';
import type { AgentStep } from './agentSteps';

/** the agent's name in the chat, and the word after an answer that goes on in the session */
export const AGENT_NAME = 'Agent';
const MORE = 'more in the session';

/** A line of the player's, as it goes to the agent: its text and when it was said (the browser's clock, ms). */
export interface HeardLine { t: 'chat'; text: string; at: number }

/** The chat opened with the agent: what the player says goes to `send`. */
export function openAgentChat(send: (line: HeardLine) => void): void {
  setChatAside({ placeholder: 'Say to the agent…', send: (text) => send({ t: 'chat', text, at: Date.now() }) });
  chatNote('An agent is joined: what you say here goes to its session');
}

/** The chat shut with the agent gone, its lines let go (a co-op room's chat starts empty). */
export function closeAgentChat(): void {
  if (!chatAside()) return;
  setChatAside(null);
  clearChat();
}

/** The step `say`: `text` shown in the chat under the agent's name (with `more`, saying the rest is in the session).
 *  Refused over the chat's limit, empty, too fast, or with the chat shut. */
export function agentSays(args: AgentStep): { said: string; more: boolean } {
  if (typeof args.text !== 'string') throw new Error('say takes a text');
  if (!chatAside()) throw new Error('the chat is shut: no agent is connected');
  const said = cleanChat(args.text);
  const length = Array.from(args.text.replace(/\s+/g, ' ').trim()).length;
  if (length > CHAT.most) {
    const why = `${length} characters: the chat holds ${CHAT.most}`;
    throw new Error(`${why}. Say a line or two, the rest in the session (--more)`);
  }
  if (!said) throw new Error('nothing to say');
  const more = args.more === true;
  if (!chatFrom(AGENT_NAME, said, more ? MORE : undefined)) throw new Error(`too fast: ${CHAT.burst} lines in ${CHAT.per} s at most`);
  return { said, more };
}
