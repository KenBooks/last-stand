// `parity`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { ParityOptions } from '../parity';

/** `lab parity`: the same scenes pictured as the player sees them, for comparing two renderers (`--renderers`). */
export async function parity(lab: Lab, command: ParityOptions): Promise<Report> {
  const { parity: follow } = await import('../parity');
  return follow(lab, command);
}
