// `staffs`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { StaffsOptions } from '../staffs';

/**
 * `lab staffs`: the mage's staffs by school (a tap of the lightning staff against a full charge, the fire staff's
 * burn, whom the healing beam lands on and its heal a frame) and a held skill's charge mark at the aim.
 */
export async function staffs(lab: Lab, command: StaffsOptions): Promise<Report> {
  const { staffs: staffsRound } = await import('../staffs');
  return staffsRound(lab, command);
}
