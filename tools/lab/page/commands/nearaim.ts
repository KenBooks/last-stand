// `nearaim`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { NearAimOptions } from '../nearAim';

/**
 * `lab nearaim`: a dummy stood under the crosshair near the hero in each close view: his aim's way must stay the
 * camera's (#482).
 */
export async function nearaim(lab: Lab, command: NearAimOptions): Promise<Report> {
  const { nearAim } = await import('../nearAim');
  return nearAim(lab, command);
}
