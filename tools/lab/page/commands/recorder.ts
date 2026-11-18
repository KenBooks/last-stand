// `recorder`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { RecorderOptions } from '../recorder';

/** `lab recorder`: what the always-on performance recorder costs a frame in a fight, against its budget, and the
 *  trace a send would pack of it, read back; a cost over the budget, a trace without stages or casts, or a canary
 *  unseen, are problems. */
export async function recorder(lab: Lab, command: RecorderOptions): Promise<Report> {
  const { recorderCost } = await import('../recorder');
  return recorderCost(lab, command);
}
