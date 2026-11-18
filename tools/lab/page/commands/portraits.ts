// `portraits`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';

/** Optional portrait requests, picker selection and clearing. */
export async function portraits(lab: Lab, command: import('../portraits').PortraitOptions): Promise<Report> {
  const { portraits: measure } = await import('../portraits');
  return measure(lab, command);
}
