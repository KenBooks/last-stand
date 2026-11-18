// `range`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { RangeOptions } from '../range';

/**
 * `lab range`: every joint of the hero against a body's ranges, frame by frame, over standing, walking, attacking and
 * reversals, the worst moments pictured; a canary it missed is a problem.
 */
export async function range(lab: Lab, command: RangeOptions): Promise<Report> {
  const { range: rangeRound, missedRangeCanary, lettingGo, bladeAcross, slowPose } = await import('../range');
  const report = await rangeRound(lab, command);
  // (an arm held at its stops is said, not failed, until the poses every hero is pinned in are fixed: #307)
  const problems = [...missedRangeCanary(report), ...lettingGo(report), ...bladeAcross(report), ...slowPose(report)];
  return { text: report.lines.join('\n'), problems, moments: report.moments };
}
