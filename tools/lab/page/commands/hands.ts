// `hands`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { HandsOptions } from '../hands';

/** `lab hands`: the hero's hand pictured alone; a canary it missed is a problem. */
export async function hands(lab: Lab, command: HandsOptions): Promise<Report> {
  const { hands: picture } = await import('../hands');
  return picture(lab, command);
}
