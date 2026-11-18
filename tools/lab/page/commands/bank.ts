// `bank`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';

/** A bank on Random: its wave in the save and offered by the lobby, the dice rolling where it is unlocked. */
export async function bank(lab: Lab, command: { canary: boolean }): Promise<Report> {
  const { bank: measure } = await import('../bank');
  return measure(lab, command);
}
