// `tap`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { TapOptions } from '../tap';

/**
 * `lab tap`: every skill of the hero's class aimed by holding, its touch button tapped (standing, at once, walking)
 * and dragged with the other thumb on the move stick; a tap off its way or its foe, a preview that doesn't follow the
 * drag, a cast away from it and a canary missed are problems.
 */
export async function tap(lab: Lab, command: TapOptions): Promise<Report> {
  const { tap: tapRounds } = await import('../tap');
  return tapRounds(lab, command);
}
