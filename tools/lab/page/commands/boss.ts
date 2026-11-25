// `boss`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { BossOptions } from '../boss';

/**
 * `lab boss`: the bosses' fights: each battleground's boss waves sending the boss its ladder and its exceptions give,
 * a boss standing its ground as the hero walks into it, the Ossuary Cantor's encounter and its guards, and the time
 * each boss takes.
 */
export async function boss(lab: Lab, command: BossOptions): Promise<Report> {
  const { boss: bossRound } = await import('../boss');
  return bossRound(lab, command);
}
