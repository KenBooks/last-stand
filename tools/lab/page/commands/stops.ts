// `stops`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { StopsOptions } from '../stops';

/**
 * `lab stops`: the hero coming to a stop from a run, judged as a person stops (the steps once still, a foot put out
 * and drawn back, a foot off the body's level), on level ground and by the dais's edge.
 */
export async function stops(lab: Lab, command: StopsOptions): Promise<Report> {
  const { stops: stopsRound } = await import('../stops');
  const report = await stopsRound(lab, command);
  return { text: report.lines.join('\n'), problems: [] };
}
