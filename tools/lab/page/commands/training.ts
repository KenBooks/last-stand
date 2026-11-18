// `training`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';

/** Training grounds: saved reached waves, harmless projections, no rewards, repeat and leave. */
export async function training(lab: Lab, command: { canary: boolean }): Promise<Report> {
  const { training: measure } = await import('../training');
  return measure(lab, command);
}
