// `rush`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { RushOptions } from '../rush';

/**
 * `lab rush`: Bull Rush cast through sets of foes (on its line, at its sides, killed, an elite and a boss), each
 * followed until it's still; a foe never met, left standing, carried inside the hero or ending behind or beside him,
 * a living foe left unthrown and an elite or a boss thrown are problems.
 */
export async function rush(lab: Lab, command: RushOptions): Promise<Report> {
  const { rush: rushRound } = await import('../rush');
  return rushRound(lab, command);
}
