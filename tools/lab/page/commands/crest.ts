// `crest`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { CrestOptions } from '../crest';

/**
 * `lab crest`: the village's crest blown away, its first blow on the context the boot made at its start, a blow at
 * High by the wind and one at Very low faded; anything else, or a canary missed, is a problem.
 */
export async function crest(lab: Lab, command: CrestOptions): Promise<Report> {
  const { crestBlows } = await import('../crest');
  return crestBlows(lab, command);
}
