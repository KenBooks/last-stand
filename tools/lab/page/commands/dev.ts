// `dev`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';

/** Preview-only developer controls, their layout and recovery paths. */
export async function dev(lab: Lab, command: { canary: boolean }): Promise<Report> {
  const { devMode } = await import('../devMode');
  return devMode(lab, command);
}
