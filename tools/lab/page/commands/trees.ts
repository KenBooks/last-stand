// `trees`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { TreesOptions } from '../trees';

/** `lab trees`: every tree in the play area a wooden prop an arrow stands in; none left after a biome switch. */
export async function trees(lab: Lab, command: TreesOptions): Promise<Report> {
  const { trees: treesOf } = await import('../trees');
  return treesOf(lab, command);
}
