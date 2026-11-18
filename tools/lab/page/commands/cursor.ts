// `cursor`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { CursorOptions } from '../cursor';

/**
 * `lab cursor`: the cursor drawn over mouse look while Alt is held, in each close view: the view held still, the HUD
 * under it hovered, clicked and scrolled (the battle log's Pause, a hotbar slot's tooltip, the log's lines), the world
 * under it not attacked; Alt let go, mouse look again.
 */
export async function cursor(lab: Lab, command: CursorOptions): Promise<Report> {
  const { cursor: cursorRound } = await import('../cursor');
  return cursorRound(lab, command);
}
