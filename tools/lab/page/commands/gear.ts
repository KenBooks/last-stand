// `gear`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { GearOptions } from '../gear';

/** `lab gear`: full sets rolled for every class at each tier, and what they give; a class out of order is a problem. */
export async function gear(_lab: Lab, command: GearOptions): Promise<Report> {
  const { gear: gearRound } = await import('../gear');
  return gearRound(command);
}
