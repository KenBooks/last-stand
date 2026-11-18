// `throws`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { ThrowsOptions } from '../throws';

/**
 * `lab throws`: what the slamming foes throw at a hero too far off to slam, a case a throw: the Brute's lava where he
 * stood, its ring and its burns, stepped off and up close; the Hulk's vine holding him, stepped aside and dashed out
 * of. A chunk landing off where he stood or its ring, a hurt he stepped off, a throw up close, a hold off its time or
 * walked out of, a catch he stepped aside from, and a dash that left him held are problems.
 */
export async function throws(lab: Lab, command: ThrowsOptions): Promise<Report> {
  const { throws: throwsRound } = await import('../throws');
  return throwsRound(lab, command);
}
