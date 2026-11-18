// `evade`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { EvadeOptions } from '../evade';

/**
 * `lab evade`: the shooters getting out of the hero's attacks, tried from in front of them, behind them and at a
 * ducked foe's feet; an evaded share off a half from in front, a try struck after it evaded or missed without it, a
 * blink gone wrong, and any evade from behind are problems.
 */
export async function evade(lab: Lab, command: EvadeOptions): Promise<Report> {
  const { evade: evadeRound } = await import('../evade');
  return evadeRound(lab, command);
}
