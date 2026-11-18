// `shots`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { ShotsOptions } from '../shots';

/** `lab shots`: the hero's basic attack loosed over each biome's boss and the foes round it, in each view; a shot
 *  that strikes other than the first foe on its line is a problem. */
export async function shots(lab: Lab, command: ShotsOptions): Promise<Report> {
  const { shots: shotsRound } = await import('../shots');
  return shotsRound(lab, command);
}
