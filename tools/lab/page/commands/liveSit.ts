// `liveSit`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Fixture } from '../lab';

/** `lab live sit`: the live session's hero sat on a seat (liveSit.ts). */
export async function liveSit(lab: Lab, command: { seat: string; fixture: Fixture }): Promise<string> {
  const { sit } = await import('../liveSit');
  return sit(lab, command.seat, command.fixture);
}
