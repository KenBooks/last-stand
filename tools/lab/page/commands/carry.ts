// `carry`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Fixture, Report } from '../lab';

export interface CarryCommand {
  fixture: Fixture;
  canary?: boolean;
  /** list every frame with a clip */
  frames?: boolean;
}

/** `lab carry`: the carried bow against the body; a canary it missed is a problem. */
export async function carry(lab: Lab, command: CarryCommand): Promise<Report> {
  const { carry: carryRound, describeCarry } = await import('../carry');
  const setup = await lab.setup({ ...command.fixture, nocked: true });
  const report = await carryRound(lab, { canary: command.canary, frames: command.frames });
  const problems: string[] = [];
  if (report.canary && report.canary[0] < report.canary[1]) {
    problems.push(`the canary was caught on ${report.canary[0]} of ${report.canary[1]} planted frames`);
  }
  return { text: `${JSON.stringify(setup)}\n${describeCarry(report)}`, problems };
}
