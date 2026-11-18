// `fire`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { FireOptions } from '../fire';

/**
 * `lab fire`, one biome: its fire read from beside it with its own light and without, and pictured beside it, from
 * above and in the game's views; a fire drawing nothing, standing still or blown out white, a strobe on the screen and
 * a canary missed are problems.
 */
export async function fire(lab: Lab, command: FireOptions): Promise<Report> {
  const { fire: fireRound } = await import('../fire');
  return fireRound(lab, command);
}
