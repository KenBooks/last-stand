// `weapons`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { WeaponsOptions } from '../weapons';

/** `lab weapons`: each weapon pictured alone; a canary it missed is a problem. */
export async function weapons(lab: Lab, command: WeaponsOptions): Promise<Report> {
  const { weapons: picture } = await import('../weapons');
  return picture(lab, command);
}
