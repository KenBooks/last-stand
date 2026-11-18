// `practice`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { PracticeOptions } from '../practice';

/**
 * `lab practice`: each skill with a cooldown cast twice in the lobby's ways (shown, stowed, folded) and in runs
 * started from them; free casting where the lobby shows and a run's costs and cooldowns elsewhere, or a problem.
 */
export async function practice(lab: Lab, command: PracticeOptions): Promise<Report> {
  const { practice: practiceRound } = await import('../practice');
  return practiceRound(lab, command);
}
