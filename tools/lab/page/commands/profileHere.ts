// `profileHere`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { ProfileCommand } from '../profile';

/** `lab profile`, one place: the game's own profiler, each part of the frame timed in turns by the browser's clock. */
export async function profileHere(lab: Lab, command: ProfileCommand): Promise<Report> {
  const { profileHere: profileRound } = await import('../profile');
  return profileRound(lab, command);
}
