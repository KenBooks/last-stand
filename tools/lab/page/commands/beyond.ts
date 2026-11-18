// `beyond`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { BeyondOptions } from '../beyond';

/** `lab beyond`: the ranger's arrows loosed over the wall at what lies beyond it, each judged where it stood. */
export async function beyond(lab: Lab, command: BeyondOptions): Promise<Report> {
  const { beyond: beyondOf } = await import('../beyond');
  return beyondOf(lab, command);
}
