// `light`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { LightOptions } from '../light';

/**
 * `lab light`, one scenario: the frame drawn as the player sees it standing in a biome and a view, and how bright it
 * is as a share of the screen's white; a canary it missed is a problem.
 */
export async function light(lab: Lab, command: LightOptions): Promise<Report> {
  const { light: lightRound } = await import('../light');
  return lightRound(lab, command);
}
