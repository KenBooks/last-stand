// `swing`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { SwingOptions } from '../swing';

/** `lab swing`: the key of a swing through the eyes that holds a pose chosen in the view, what of the pose it can't
 *  hold, and where its keys put the arm; a canary it missed is a problem. */
export async function swing(lab: Lab, command: SwingOptions): Promise<Report> {
  const { swing: swingKeyed } = await import('../swing');
  return swingKeyed(lab, command);
}
