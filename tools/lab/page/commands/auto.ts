// `auto`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { AutoOptions } from '../autoQuality';

/**
 * `lab auto`: Auto quality's walk down from High on a slow device, fed a GPU-bound device's frame times: each step and
 * the time until the device holds its target.
 */
export async function auto(_lab: Lab, command: AutoOptions): Promise<Report> {
  const { autoQuality } = await import('../autoQuality');
  return autoQuality(command);
}
