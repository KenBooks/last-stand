// `hall`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { HallOptions } from '../hallMoves';

/** `lab hall`: the hero in focus in the hall of heroes through his showcase and after it; a point that jerked, or a
 *  canary it missed, is a problem. */
export async function hall(
  lab: Lab, command: HallOptions & { glow?: boolean; pictures?: boolean; lobby?: boolean },
): Promise<Report> {
  if (command.glow) {
    const { hallGlow } = await import('../hallGlow');
    return hallGlow(lab, { pictures: command.pictures !== false, canary: command.canary, lobby: command.lobby });
  }
  const { hallMoves } = await import('../hallMoves');
  return hallMoves(lab, command);
}
