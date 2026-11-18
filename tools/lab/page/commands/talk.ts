// `talk`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';

/** A whole conversation with the library's scholar, every way a player picks, remembered across two visits. */
export async function talk(lab: Lab, command: { canary: boolean }): Promise<Report> {
  const { talk: measure } = await import('../talk');
  return measure(lab, command);
}
