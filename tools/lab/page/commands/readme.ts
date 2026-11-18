// `readme`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { ReadmeOptions } from '../readmeShots';

/** `lab readme`: the README's pictures, each a moment of the game posed and pictured as the player sees it. */
export async function readme(lab: Lab, command: ReadmeOptions): Promise<Report> {
  const { readme: readmeShots } = await import('../readmeShots');
  return readmeShots(lab, command);
}
