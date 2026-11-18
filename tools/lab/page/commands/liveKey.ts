// `liveKey`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab } from '../lab';

/** `lab live key`: some of a keyed move's key's numbers set by name, and the keys as they are then (core/tuning.ts). */
export async function liveKey(
  _lab: Lab, command: { path: string; row: number; set: Record<string, number> },
): Promise<string> {
  if (!window.__tuneKey || !window.__keyTable) throw new Error('live key: this game has no keyed tunables');
  window.__tuneKey(command.path, command.row, command.set);
  return window.__keyTable(command.path);
}
