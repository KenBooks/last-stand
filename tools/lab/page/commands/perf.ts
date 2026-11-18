// `perf`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { PerfOptions } from '../perf';

/**
 * `lab perf`: skills cast in turn with the foes coming, every frame timed as the game's performance report times it
 * (the frame, the update by stage, the render, the GPU by pass), each phase apart; a cast never made, a shader
 * compiled as it's timed, or a canary unseen, are problems.
 */
export async function perf(lab: Lab, command: PerfOptions): Promise<Report> {
  const { perf: perfOf } = await import('../perf');
  return perfOf(lab, command);
}
