// `denied`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { DeniedOptions } from '../denied';

/**
 * `lab denied`: a press that casts nothing heard (#572): once while its skill cools, held, mashed no faster than its
 * throttle, short of energy; never when it casts, in free casting or for a partner's copy.
 */
export async function denied(lab: Lab, command: DeniedOptions): Promise<Report> {
  const { denied: deniedRound } = await import('../denied');
  return deniedRound(lab, command);
}
