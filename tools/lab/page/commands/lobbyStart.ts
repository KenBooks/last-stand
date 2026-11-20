// `lobbyStart`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { LobbyStartOptions } from '../lobbyStart';

/** `lab lobbystart`: a return's lobby from its reveal, each frame's work and what runs behind it timed; a frame
 *  holding more than its budget behind the lobby, or a canary missed, is a problem. */
export async function lobbyStart(lab: Lab, command: LobbyStartOptions): Promise<Report> {
  const { lobbyStart: measure } = await import('../lobbyStart');
  return measure(lab, command);
}
