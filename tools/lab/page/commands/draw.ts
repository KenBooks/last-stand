// `draw`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { DrawOptions } from '../draw';

/**
 * `lab draw`: each of the hero's drawn shots drawn to full and held there, the glint round its arrowhead counted every
 * frame; motes missing as it's drawn, a glint missing or gone held at full, and one with nothing drawn are problems.
 */
export async function draw(lab: Lab, command: DrawOptions): Promise<Report> {
  const { draw: drawRound } = await import('../draw');
  return drawRound(lab, command);
}
