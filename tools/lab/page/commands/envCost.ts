// `envCost`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { EnvCostOptions } from '../envCost';

/** `lab envcost`, one scenario: what the environment's lookups take of the frame on the GPU, with it and without in
 *  turns; a canary missed is a problem. */
export async function envCost(lab: Lab, command: EnvCostOptions): Promise<Report> {
  const { envCost: envCostRound } = await import('../envCost');
  return envCostRound(lab, command);
}
