// `wall`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { WallOptions } from '../wallGap';

/** `lab wall`: how near the hero walks up to the wall in each biome, at angles round the ring. */
export async function wall(lab: Lab, command: WallOptions): Promise<Report> {
  const { wallGap } = await import('../wallGap');
  return wallGap(lab, command);
}
