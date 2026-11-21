// `longPress`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { LongPressOptions } from '../longPress';

/**
 * `lab longpress`: a finger held on each touch control, in the village's training yard and in a run; a long press
 * left to the browser (its own menu over the game), a control draggable, calling out or with text to select, and a
 * canary missed are problems.
 */
export async function longPress(lab: Lab, command: LongPressOptions): Promise<Report> {
  const { longPress: holdEach } = await import('../longPress');
  return holdEach(lab, command);
}
