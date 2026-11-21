// `rustCheckHere`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { RustCheckCommand } from '../rustCheck';

/** `lab rustcheck`: what a first play of the Rust engine's preview found wrong, each held as a check. */
export async function rustCheckHere(lab: Lab, command: RustCheckCommand): Promise<Report> {
  const { rustCheck } = await import('../rustCheck');
  return rustCheck(lab, command);
}
