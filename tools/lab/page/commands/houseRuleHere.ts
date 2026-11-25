// `houseRuleHere`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';

/** What `lab houserule` asks: the views whose name holds `only` (all of them when empty). */
export interface HouseRuleCommand {
  only: string;
}

/** `lab houserule`: a house from above held to the three rules of what thins, a view a line. */
export async function houseRuleHere(lab: Lab, command: HouseRuleCommand): Promise<Report> {
  const { houseRule } = await import('../rustHouseRule');
  const [checks, moments] = await houseRule(lab, command.only);
  const problems = checks.flatMap((check) => check.problems);
  const held = checks.length - problems.length;
  const head = `a house from above, by the three rules: ${held} of ${checks.length} views hold`;
  return { text: [head, ...checks.map((check) => check.line)].join('\n'), problems, moments };
}
