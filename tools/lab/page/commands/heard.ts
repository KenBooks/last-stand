// `heard`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { HeardOptions } from '../heard';

/**
 * `lab heard`: each skill's key held as a player holds it and every sound the game asks for caught, when from the
 * press; a skill that plays nothing, a held sound never stopped and a sound it's known to play missing are problems.
 */
export async function heard(lab: Lab, command: HeardOptions): Promise<Report> {
  const { heard: heardOf } = await import('../heard');
  return heardOf(lab, command);
}
