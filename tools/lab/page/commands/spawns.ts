// `spawns`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { SpawnsOptions } from '../spawns';

/**
 * `lab spawns`: waves in each biome, and how every foe came in: its gate, its group's gates and the spot it rose on,
 * and the boss's walk to the hero from each gate; a gate left idle, a foe risen in a prop, a boss that never reached
 * the hero and a canary missed are problems.
 */
export async function spawns(lab: Lab, command: SpawnsOptions): Promise<Report> {
  const { spawns: spawnsRound } = await import('../spawns');
  return spawnsRound(lab, command);
}
