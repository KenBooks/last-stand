// `coat`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { CoatOptions } from '../coat';

/** `lab coat`: the hero's skirts as he stands at idle, frame by frame; a point that jerked, or a canary it missed, is a
 *  problem. */
export async function coat(lab: Lab, command: CoatOptions): Promise<Report> {
  const { coat: follow } = await import('../coat');
  return follow(lab, command);
}
