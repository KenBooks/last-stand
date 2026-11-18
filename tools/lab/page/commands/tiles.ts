// `tiles`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { TilesOptions } from '../tiles';

/** `lab tiles`: how big each repeated map's tile comes out on each surface of a biome. */
export async function tiles(lab: Lab, command: TilesOptions): Promise<Report> {
  const { tiles: tilesOf } = await import('../tiles');
  return tilesOf(lab, command);
}
