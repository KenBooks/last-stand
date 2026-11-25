// `trophies`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';

/** The house of records' trophies: an empty shield or stand at each place unbeaten, each trophy on its place beaten. */
export async function trophies(lab: Lab, command: { canary: boolean }): Promise<Report> {
  const { trophies: measure } = await import('../trophies');
  return measure(lab, command);
}
