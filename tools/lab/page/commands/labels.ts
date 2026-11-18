// `labels`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { LabelsOptions } from '../labels';

/** `lab labels`: a world label kept out by a full atlas; one not drawn once there's room, or a canary it missed, is a
 *  problem. */
export async function labels(lab: Lab, command: LabelsOptions): Promise<Report> {
  const { labels: follow } = await import('../labels');
  return follow(lab, command);
}
