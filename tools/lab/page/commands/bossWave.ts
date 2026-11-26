// `bossWave`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { BossWaveOptions } from '../bossWave';

/** Bosses readied at their wave: loaded and warmed under the bar at Continue, none compiled late as they rise. */
export async function bossWave(lab: Lab, command: BossWaveOptions): Promise<Report> {
  const { bossWave: measure } = await import('../bossWave');
  return measure(lab, command);
}
