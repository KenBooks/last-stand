// `haze`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { HazeOptions } from '../haze';

/** `lab haze`: through the eyes, what the hero's held weapons' light takes from the frame round them; a haze and a
 *  canary missed are problems. */
export async function haze(lab: Lab, command: HazeOptions): Promise<Report> {
  const { haze: hazeRound } = await import('../haze');
  return hazeRound(lab, command);
}
