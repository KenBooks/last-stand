// `houses`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';

/** The village's houses walked into and out of: each room shown in the village's stead, compiling nothing. */
export async function houses(lab: Lab, command: { canary: boolean }): Promise<Report> {
  const { houses: measure } = await import('../houses');
  return measure(lab, command);
}
