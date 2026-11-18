// `liveMocap`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab } from '../lab';
import type { LiveMocap } from '../mocap';

/** `lab live mocap`: a pose read from a motion capture, set on the live session's hero (mocap.ts). */
export async function liveMocap(lab: Lab, command: LiveMocap): Promise<unknown> {
  const { mocap } = await import('../mocap');
  return mocap(lab, command);
}
