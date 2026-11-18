// `glowCost`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { GlowCostOptions } from '../glowCost';

/** `lab glowcost`, one scene: what the worn gear's rarity glow takes of the frame, each way of having none. */
export async function glowCost(lab: Lab, command: GlowCostOptions): Promise<Report> {
  const { glowCost: glowCostRound } = await import('../glowCost');
  return glowCostRound(lab, command);
}
