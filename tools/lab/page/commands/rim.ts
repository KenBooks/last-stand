// `rim`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { RimOptions } from '../wallRim';

/** `lab rim`: the hero walked round each biome's wall pressed into it, each way: its jumps and stuck stops. */
export async function rim(lab: Lab, command: RimOptions): Promise<Report> {
  const { wallRim } = await import('../wallRim');
  return wallRim(lab, command);
}
