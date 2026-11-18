// `crowd`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { CrowdOptions } from '../crowd';

/**
 * `lab crowd`: a crowd of foes killed at once at each CPU slowdown and frame rate, each frame timed by the browser's
 * clock and the bodies' part of it; the bodies past their budget at the slowest CPU, or a canary unseen, are problems.
 */
export async function crowd(lab: Lab, command: CrowdOptions): Promise<Report> {
  const { crowd: crowdRound } = await import('../crowd');
  return crowdRound(lab, command);
}
