// `pipelines`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { PipelinesOptions } from '../pipelines';

/**
 * `lab pipelines`: the engine's scene pipelines the boot asked for, by step and kind, against those the lobby's
 * frames drew with; a canary missed is a problem.
 */
export async function pipelines(lab: Lab, command: PipelinesOptions): Promise<Report> {
  const { pipelinesCensus } = await import('../pipelines');
  return pipelinesCensus(lab, command);
}
