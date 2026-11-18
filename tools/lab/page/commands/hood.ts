// `hood`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { HoodOptions } from '../hood';

/** `lab hood`: the mage's hood against its reference, its outline and its shape on the head; a size outside the
 *  reference's, a sway past its limit, or a canary it missed, is a problem. */
export async function hood(lab: Lab, command: HoodOptions): Promise<Report> {
  const { hood: read } = await import('../hood');
  return read(lab, command);
}
