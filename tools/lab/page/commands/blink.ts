// `blink`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { BlinkOptions } from '../blink';

/**
 * `lab blink`: the mage's blink cast as the player casts it in each scenario, and the foes it dazes; a landing off its
 * preview, past his reach or in a prop, a blow landed while he crossed, a near foe that moved while dazed and a far
 * one that stopped are problems.
 */
export async function blink(lab: Lab, command: BlinkOptions): Promise<Report> {
  const { blink: blinkRound } = await import('../blink');
  return blinkRound(lab, command);
}
