// `hallNear`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { HallNearOptions } from '../hallNear';

/** `lab hallnear`: the other heroes' warm-up as he nears the village's hall, cold, frames held or not. */
export async function hallNear(lab: Lab, command: HallNearOptions): Promise<Report> {
  const { hallNear: measure } = await import('../hallNear');
  return measure(lab, command);
}
