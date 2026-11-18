// `roomwarm`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';

/** A warm-up of each kind drawn in the village's stead with the hero in a house's room: the room alone shown after. */
export async function roomwarm(lab: Lab, command: { canary: boolean }): Promise<Report> {
  const { roomWarm: measure } = await import('../roomWarm');
  return measure(lab, command);
}
