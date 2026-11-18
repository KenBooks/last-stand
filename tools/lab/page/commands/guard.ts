// `guard`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';

/** Held shield interrupted by attacks: input, combat window, restoration, touch and both views. */
export async function guard(lab: Lab, command: import('../guard').GuardOptions): Promise<Report> {
  const { guard: measure } = await import('../guard');
  return measure(lab, command);
}
