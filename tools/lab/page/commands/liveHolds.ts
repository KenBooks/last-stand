// `liveHolds`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab } from '../lab';
import type { LivePicture } from '../live';

/** `lab live holds`: the live session's hero held getting up at moments, pictured at each (liveSit.ts). */
export async function liveHolds(lab: Lab, command: { moments: number[]; picture: LivePicture }): Promise<unknown> {
  const { holds } = await import('../liveSit');
  return holds(lab, command.moments, command.picture);
}
