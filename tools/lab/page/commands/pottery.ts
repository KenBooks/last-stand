// `pottery`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { PotteryOptions } from '../pottery';
import type { Lab, Report } from '../lab';

/** The tavern's shelf pottery alone: each thing on its board, what it costs the frame, pictured. */
export async function pottery(lab: Lab, command: PotteryOptions): Promise<Report> {
  const { pottery: measure } = await import('../pottery');
  return measure(lab, command);
}
