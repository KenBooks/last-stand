// `wind`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { WindOptions } from '../wind';

/**
 * `lab wind`: the loading screen's exit as it hands over to the lobby logo: the particles' picture as they rest in the
 * logo's place against the logo once the exit is done; pixels apart past the limit, or a canary missed, are problems.
 */
export async function wind(lab: Lab, command: WindOptions): Promise<Report> {
  const { windHandoff } = await import('../wind');
  return windHandoff(lab, command);
}
