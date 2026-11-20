// `tutorial`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { TutorialOptions } from '../tutorial';

/** `lab tutorial`: the village's tutorial walked from the notice board, each step done as its words say and pictured. */
export async function tutorial(lab: Lab, command: TutorialOptions): Promise<Report> {
  const { tutorial: walk } = await import('../tutorial');
  return walk(lab, command);
}
