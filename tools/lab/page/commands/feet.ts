// `feet`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { FeetOptions } from '../feet';

/**
 * `lab feet`: the hero's feet against the ground round the dais's edges and on level ground, the worst moments
 * pictured; a canary it missed is a problem.
 */
export async function feet(lab: Lab, command: FeetOptions): Promise<Report> {
  const { feet: feetRound, missedCanaries } = await import('../feet');
  const report = await feetRound(lab, command);
  return { text: report.lines.join('\n'), problems: missedCanaries(report), moments: report.moments };
}
