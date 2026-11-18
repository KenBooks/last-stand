// `heropick`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { HeroPickOptions } from '../heroPick';

/**
 * `lab heropick`: a first visit's hero picked on the hero selection screen by a tap and by the mouse: each must land
 * in the lobby with no run started, the click after it reaching nothing of the lobby.
 */
export async function heropick(lab: Lab, command: HeroPickOptions): Promise<Report> {
  const { heroPick } = await import('../heroPick');
  return heroPick(lab, command);
}
