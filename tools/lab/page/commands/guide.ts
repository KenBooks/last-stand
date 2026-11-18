// `guide`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { GuideOptions } from '../guideOpen';

/** `lab guide`: the guide's first opening and a walk through every page, each frame and the page's long tasks timed
 *  by the browser's clock; a moment past its limit, a program the game's renderer linked, a picture never made, or a
 *  canary missed, is a problem. */
export async function guide(lab: Lab, command: GuideOptions): Promise<Report> {
  const { guideOpen: follow } = await import('../guideOpen');
  return follow(lab, command);
}
