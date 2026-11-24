// `programs`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { ProgramsOptions } from '../programs';

/** `lab programs`: the engine's scene pipelines, by kind and what sets them apart, those never drawn. */
export async function programs(lab: Lab, command: ProgramsOptions): Promise<Report> {
  const { programs: programsOf } = await import('../programs');
  return programsOf(lab, command);
}
