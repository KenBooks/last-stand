// `liveInspect`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab } from '../lab';
import type { LiveInspect } from '../live';

/** `lab live inspect`: the live session's scene listed. */
export async function liveInspect(lab: Lab, command: LiveInspect): Promise<string> {
  const { inspect } = await import('../live');
  return inspect(lab, command);
}
