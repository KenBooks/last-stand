// `tooltips`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { TooltipsOptions } from '../tooltips';

/**
 * `lab tooltips`: each damage skill's tooltip held to the hits it deals the hero with modifiers of every kind: each
 * hit within a figure it states, a crit's chance the hero's, a hit over time as often as it says; and the hotbar's
 * tooltip following the hero's gear.
 */
export async function tooltips(lab: Lab, command: TooltipsOptions): Promise<Report> {
  const { tooltips: tooltipsOf } = await import('../tooltips');
  return tooltipsOf(lab, command);
}
