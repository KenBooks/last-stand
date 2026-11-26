// `taken`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { TakenOptions } from '../taken';

/** `lab taken`: what a wave's foes deal a second to a hero standing among them, beside the healing beam's heal. */
export async function taken(lab: Lab, command: TakenOptions): Promise<Report> {
  const { taken: takenRound } = await import('../taken');
  return takenRound(lab, command);
}
