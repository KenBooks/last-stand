// `held`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { HeldOptions } from '../held';

/**
 * `lab held`: each of the hero's held skills held over a foe ready and through its cooldown, its preview read as it's
 * drawn (Quarry Mark's outline in every view); a preview missing, in the wrong look or off its countdown, a release
 * that cast when it mustn't or didn't when it must, and an outline off its foe are problems.
 */
export async function held(lab: Lab, command: HeldOptions): Promise<Report> {
  const { held: heldRound } = await import('../held');
  return heldRound(lab, command);
}
