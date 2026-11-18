// `scholar`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { ScholarOptions } from '../scholar';

/** The library's scholar: his loop posed through with no snap, his glance and his eye while talked to, pictured. */
export async function scholar(lab: Lab, command: ScholarOptions): Promise<Report> {
  const { scholar: measure } = await import('../scholar');
  return measure(lab, command);
}
