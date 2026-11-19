// `boss`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { BossOptions } from '../boss';

/**
 * `lab boss`: the bosses' fights: each battleground's boss waves sending the boss its ladder and its exceptions give,
 * the Bell-Warden's phases at their shares, its toll stunning a hero near it and not one far off or behind a raised
 * shield, its chains dropping the bell for its window, no program compiled in its fight, and the time each boss takes.
 */
export async function boss(lab: Lab, command: BossOptions): Promise<Report> {
  const { boss: bossRound } = await import('../boss');
  return bossRound(lab, command);
}
