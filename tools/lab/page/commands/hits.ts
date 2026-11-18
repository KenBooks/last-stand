// `hits`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { HitsOptions } from '../hits';

/**
 * `lab hits`: each skill's blows as they land on foes stood where it strikes, their times and the gaps between them;
 * striking nothing, a gap past `--apart` and blows no quicker than `--than`'s are problems.
 */
export async function hits(lab: Lab, command: HitsOptions): Promise<Report> {
  const { hits: hitsOf } = await import('../hits');
  return hitsOf(lab, command);
}
