// `seals`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { SealsOptions } from '../seals';

/**
 * `lab seals`: the village's walls sealed again, each timed by the browser's clock, what each bounds before and
 * after as a digest; bounds that change, or a canary missed, are problems.
 */
export async function seals(lab: Lab, command: SealsOptions): Promise<Report> {
  const { sealsTimed } = await import('../seals');
  return sealsTimed(lab, command);
}
