// `headshots`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { HeadshotsOptions } from '../headshots';

/** `lab headshots`: each foe's head and chest shot with each of the ranger's aimed shots; a head shot that isn't a
 *  headshot, a chest shot that is, and a miss are problems. */
export async function headshots(lab: Lab, command: HeadshotsOptions): Promise<Report> {
  const { headshots: headshotsRound } = await import('../headshots');
  return headshotsRound(lab, command);
}
