// `ui`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { UiOptions } from '../ui';

/**
 * `lab ui`: the game's UI in its states (the lobby, a tooltip, the run's HUD with the world's labels, the choice after
 * a wave, the pause menu), each pictured whole with its boxes as shares of the window.
 */
export async function ui(lab: Lab, command: UiOptions): Promise<Report> {
  const { ui: uiRound } = await import('../ui');
  return uiRound(lab, command);
}
