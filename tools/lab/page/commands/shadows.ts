// `shadows`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { ShadowsOptions } from '../shadows';

/** `lab shadows`: the hero's shadow cast as one against his pieces cast alone, frame by frame: no pixel apart. */
export async function shadows(lab: Lab, command: ShadowsOptions): Promise<Report> {
  const { shadowsCheck } = await import('../shadows');
  return shadowsCheck(lab, command);
}
