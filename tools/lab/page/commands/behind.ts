// `behind`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { BehindOptions } from '../behind';

/** `lab behind`: the heroes built behind the lobby a piece a frame; a frame's building past its limit, a hero built
 *  as the hall opens or one is chosen, or a canary missed, is a problem. */
export async function behind(lab: Lab, command: BehindOptions): Promise<Report> {
  const { heroesBehind: follow } = await import('../behind');
  return follow(lab, command);
}
