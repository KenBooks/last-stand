// `form`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { FormOptions } from '../form';

/**
 * `lab form`: the hero's run against a runner's, with each way he holds his weapons: the stride's timing, each joint's
 * curve over the stride, stick figures of it over a runner's and the hero pictured at eight points of it; a canary it
 * missed, or a run held up, is a problem.
 */
export async function form(lab: Lab, command: FormOptions): Promise<Report> {
  const { form: formRound } = await import('../form');
  const report = await formRound(lab, command);
  return { text: report.lines.join('\n'), problems: report.problems, moments: report.moments };
}
