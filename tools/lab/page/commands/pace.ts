// `pace`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { PaceOptions } from '../pace';

/**
 * `lab pace`: the hero walked on a screen whose browser times its frames on another screen's ticks, and moved from a
 * 144 Hz screen to it: a shown frame's step must keep the steady pace (#552).
 */
export async function pace(lab: Lab, command: PaceOptions): Promise<Report> {
  const { paceFrames } = await import('../pace');
  return paceFrames(lab, command);
}
