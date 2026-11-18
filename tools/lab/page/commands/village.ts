// `village`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { VillageOptions } from '../village';

/** `lab village`: the lobby's village as a player walks it: its objects, the yard, its bounds, the stair, the
 *  training, its hours. */
export async function village(lab: Lab, command: VillageOptions): Promise<Report> {
  const { village: villageOf } = await import('../village');
  return villageOf(lab, command);
}
