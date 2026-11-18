// `liveHold`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab } from '../lab';

/** `lab live hold`: the live session's hero held getting up at a moment of his hands' stage (liveSit.ts). */
export async function liveHold(lab: Lab, command: { hands: number }): Promise<string> {
  const { hold } = await import('../liveSit');
  return hold(lab, command.hands);
}
