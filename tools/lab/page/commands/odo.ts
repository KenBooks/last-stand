// `odo`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';

/** Odo's day in his shop: greeting the hero walking in, back to work, each task at its heart, a glance; his feet, arms
 *  and hands, programs and cost. */
export async function odo(lab: Lab, command: { canary: boolean }): Promise<Report> {
  const { odo: measure } = await import('../odo');
  return measure(lab, command);
}
