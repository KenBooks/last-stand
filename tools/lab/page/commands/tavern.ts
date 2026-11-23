// `tavern`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';

/** The tavern's keeper and his ale: his tasks, his mugs, the drink standing still, and the drink through the eyes. */
export async function tavern(lab: Lab, command: { canary: boolean }): Promise<Report> {
  const { tavern: measure } = await import('../tavern');
  return measure(lab, command);
}
