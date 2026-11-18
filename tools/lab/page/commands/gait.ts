// `gait`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { GaitOptions } from '../gait';

/**
 * `lab gait`: the hero's walk judged as a person's (the time on each foot, both and neither, the steps, the hops, the
 * hips' rise and fall, the jerks) over level ground and the steps, nothing drawn, drawn and changing direction, each
 * filmed from the side.
 */
export async function gait(lab: Lab, command: GaitOptions): Promise<Report> {
  const { gait: gaitRound } = await import('../gait');
  const report = await gaitRound(lab, command);
  return { text: report.lines.join('\n'), problems: report.problems, moments: report.moments, counts: report.counts };
}
