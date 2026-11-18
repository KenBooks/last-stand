// `health`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { HealthOptions } from '../health';

/**
 * `lab health`, one scenario: the hero's Health held at shares of his most, the frame at each with the low-health look
 * and without it; blood in the middle of the view, a look above where it starts, one that drains or covers less at a
 * lower Health, and a canary missed are problems.
 */
export async function health(lab: Lab, command: HealthOptions): Promise<Report> {
  const { health: healthRound } = await import('../health');
  return healthRound(lab, command);
}
