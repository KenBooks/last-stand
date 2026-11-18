// `seams`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { SeamsOptions } from '../seams';

/** `lab seams`: the hero's sewn seams as he stands, walks, attacks and casts; a seam open between its pieces, or a
 *  canary it missed, is a problem. */
export async function seams(lab: Lab, command: SeamsOptions): Promise<Report> {
  const { seams: follow } = await import('../seams');
  return follow(lab, command);
}
