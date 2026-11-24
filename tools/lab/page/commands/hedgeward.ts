// `hedgeward`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { HedgewardOptions } from '../hedgeward';

/**
 * `lab hedgeward`: the ranger's wall held and let go: placed where aimed, square across his line to it; a boss's bolts
 * through it stopped by it; a melee foe beyond it going round it, never striking him through it; his arrows breaking
 * it; gone at its time and at none of its life; his own arrow flying over it at a foe beyond. Each falling short is a
 * problem.
 */
export async function hedgeward(lab: Lab, command: HedgewardOptions): Promise<Report> {
  const { hedgeward: hedgewardRound } = await import('../hedgeward');
  return hedgewardRound(lab, command);
}
