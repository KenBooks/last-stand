// `liveStart`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Fixture } from '../lab';

/** `lab live start`: the live session's page set up (live.ts). */
export async function liveStart(lab: Lab, fixture: Fixture): Promise<Record<string, unknown>> {
  const { start } = await import('../live');
  return start(lab, fixture);
}
