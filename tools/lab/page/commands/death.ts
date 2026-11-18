// `death`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { DeathOptions } from '../death';

/**
 * `lab death`: each skill's kills followed as they fall, thrown hard and with little to spare; a body under the floor,
 * in a prop or past the wall, posed off its points or going the wrong way, and a late shader, are problems.
 */
export async function death(lab: Lab, command: DeathOptions): Promise<Report> {
  const { death: deathRound } = await import('../death');
  return deathRound(lab, command);
}
