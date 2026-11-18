// `bowprop`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { BowPropOptions } from '../bowProp';

/**
 * `lab bowprop`: the ranger drawing at a prop he stands against, in each biome against each kind of prop: the arrow,
 * the bow's tip and the hero must never turn back frame after frame (#317).
 */
export async function bowprop(lab: Lab, command: BowPropOptions): Promise<Report> {
  const { bowProp } = await import('../bowProp');
  return bowProp(lab, command);
}
