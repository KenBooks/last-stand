// `neck`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { NeckOptions } from '../neck';

/** `lab neck`: each hero's neck read up lines round it and pictured close; a fault past its limit, or a canary it
 *  missed, is a problem. */
export async function neck(lab: Lab, command: NeckOptions): Promise<Report> {
  const { neck: read } = await import('../neck');
  return read(lab, command);
}
