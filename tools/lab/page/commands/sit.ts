// `sit`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { SitOptions } from '../sit';

/** `lab sit`: an idle hero's sit on each seat, walked to, sat, asked to act; with `poses`, a sheet of each seat's
 *  sit from round him (sitPoses.ts). A joint past its range, a hip off its seat, or a canary it missed, is a
 *  problem. */
export async function sit(lab: Lab, command: SitOptions): Promise<Report> {
  if (command.poses) {
    const { sitPoses } = await import('../sitPoses');
    return sitPoses(lab, command.seats, command.fixture);
  }
  const { sit: follow } = await import('../sit');
  return follow(lab, command);
}
