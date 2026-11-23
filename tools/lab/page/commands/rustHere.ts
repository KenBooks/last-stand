// `rustHere`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { RustCommand } from '../rustEngine';

/** `lab rust`, one place: the Rust engine's frame, pictured and timed. */
export async function rustHere(lab: Lab, command: RustCommand): Promise<Report> {
  const { rustEngine } = await import('../rustEngine');
  return rustEngine(lab, command);
}
