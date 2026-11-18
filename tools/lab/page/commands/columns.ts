// `columns`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { ColumnsOptions } from '../columns';

/** `lab columns`: the crypt's broken columns roll after roll: no open edge, no cliff across a break. */
export async function columns(lab: Lab, command: ColumnsOptions): Promise<Report> {
  const { columnsCheck } = await import('../columns');
  return columnsCheck(lab, command);
}
