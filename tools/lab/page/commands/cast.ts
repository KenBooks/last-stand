// `cast`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { CastOptions } from '../cast';

/**
 * `lab cast`: a skill cast as the player casts it in one biome and view, every frame of its effect drawn and read
 * back: its light against the budget, its flashes and the shaders compiled late.
 */
export async function cast(lab: Lab, command: CastOptions): Promise<Report> {
  const { cast: castRound } = await import('../cast');
  return castRound(lab, command);
}
