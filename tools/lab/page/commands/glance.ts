// `glance`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { GlanceOptions } from '../glance';

/** `lab glance`: the hero's casual look round as he stands idle; a glance out of a neck's range, too fast, jerking,
 *  in a loop, as he moves or attacks, through the eyes or before the hall's showcase, or a canary it missed, is a
 *  problem. */
export async function glance(lab: Lab, command: GlanceOptions): Promise<Report> {
  const { glance: follow } = await import('../glance');
  return follow(lab, command);
}
