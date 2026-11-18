// `compiles`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { CompilesOptions } from '../compiles';

/** `lab compiles`: a prop of every kind broken in each biome, every program compiled meanwhile a problem. */
export async function compiles(lab: Lab, command: CompilesOptions): Promise<Report> {
  const { compiles: compilesOf } = await import('../compiles');
  return compilesOf(lab, command);
}
