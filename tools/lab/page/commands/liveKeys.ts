// `liveKeys`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab } from '../lab';

/** `lab live keys`: a keyed move's keys as a table, each number named (core/tuning.ts). */
export async function liveKeys(_lab: Lab, command: { path: string }): Promise<string> {
  if (!window.__keyTable) throw new Error('live keys: this game has no keyed tunables');
  return window.__keyTable(command.path);
}
