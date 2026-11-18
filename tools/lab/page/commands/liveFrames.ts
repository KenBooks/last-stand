// `liveFrames`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab } from '../lab';

/** `lab live frames`: frames run on the live session's page. */
export async function liveFrames(lab: Lab, command: { count: number }): Promise<string> {
  const { frames } = await import('../live');
  return frames(lab, command.count);
}
