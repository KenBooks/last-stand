// `resize`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { ResizeOptions } from '../resize';

/** `lab resize`: what the window's change of size costs, as going full screen on a phone changes it. */
export async function resize(lab: Lab, command: ResizeOptions): Promise<Report> {
  const { resize: measure } = await import('../resize');
  return measure(lab, command);
}
