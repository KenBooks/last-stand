// `draws`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { DrawsOptions } from '../draws';

/** `lab draws`: one frame's draw calls with the crowd standing, by the geometry each drew, the most first. */
export async function draws(lab: Lab, command: DrawsOptions): Promise<Report> {
  const { draws: drawsOf } = await import('../draws');
  return drawsOf(lab, command);
}
