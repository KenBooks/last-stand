// `turnaround`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { TurnaroundOptions } from '../turnaround';

/** `lab turnaround`: the hero standing, pictured in the studio from a sheet's sides beside its panels; a hero not
 *  drawn, or a canary it missed, is a problem. */
export async function turnaround(lab: Lab, command: TurnaroundOptions): Promise<Report> {
  const { turnaround: picture } = await import('../turnaround');
  return picture(lab, command);
}
