// `sceneCost`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { SceneCostOptions } from '../sceneCost';

/** `lab scenecost`, one scenario: what each part of the scene pass takes of the GPU, at the screen's pixels. */
export async function sceneCost(lab: Lab, command: SceneCostOptions): Promise<Report> {
  const { sceneCost: sceneCostRound } = await import('../sceneCost');
  return sceneCostRound(lab, command);
}
