// `poses`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { PosesOptions } from '../poses';

/** `lab poses`: the hero's pose a move at a time as digests, and what his animation took a frame; a canary missed is a
 *  problem. */
export async function poses(lab: Lab, command: PosesOptions): Promise<Report> {
  const { poses: follow } = await import('../poses');
  return follow(lab, command);
}
