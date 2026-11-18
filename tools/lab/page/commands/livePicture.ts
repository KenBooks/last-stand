// `livePicture`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab } from '../lab';
import type { LivePicture, LivePictured } from '../live';

/** `lab live picture`: the live session's page pictured. */
export async function livePicture(lab: Lab, command: LivePicture): Promise<LivePictured> {
  const { picture } = await import('../live');
  return picture(lab, command);
}
