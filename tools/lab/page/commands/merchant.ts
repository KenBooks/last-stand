// `merchant`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';

/** Odo's trade: a trade refused one short, made with enough, the stock one fewer, and his restock. */
export async function merchant(lab: Lab, command: { canary: boolean }): Promise<Report> {
  const { merchant: measure } = await import('../merchant');
  return measure(lab, command);
}
