// `log`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { LogOptions } from '../log';

/**
 * `lab log`: the battle log held to every hit the hero deals and takes as it lands: each skill's hits listed once and
 * in turn, under the skill, on the foe struck, for what it dealt, of its type; each foe's blows under its name and its
 * attack, for the life they took.
 */
export async function log(lab: Lab, command: LogOptions): Promise<Report> {
  const { log: logOf } = await import('../log');
  return logOf(lab, command);
}
