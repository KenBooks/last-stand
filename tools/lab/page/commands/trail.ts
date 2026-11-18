// `trail`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { TrailOptions } from '../trail';

/**
 * `lab trail`: each strike cast in each view, its trail's pixels against where the weapons swept; pixels away from
 * it, a blow with no trail, its newest end off the blade, a trail while they're still and a canary missed are
 * problems.
 */
export async function trail(lab: Lab, command: TrailOptions): Promise<Report> {
  const { trail: trailRounds } = await import('../trail');
  return trailRounds(lab, command);
}
