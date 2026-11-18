// `winding`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { WindingOptions } from '../winding';

/** `lab winding`: which way every model's and biome's faces point. */
export async function winding(lab: Lab, command: WindingOptions): Promise<Report> {
  const { winding: windingOf } = await import('../winding');
  return windingOf(lab, command);
}
