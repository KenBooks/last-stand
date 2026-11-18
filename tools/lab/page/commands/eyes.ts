// `eyes`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { EyesOptions } from '../eyes';

/** `lab eyes`: a skill cast through the eyes, frame by frame, with its film; a two-hander seen in one hand, or a canary
 *  it missed, is a problem. */
export async function eyes(lab: Lab, command: EyesOptions): Promise<Report> {
  const { eyes: eyesRound } = await import('../eyes');
  return eyesRound(lab, command);
}
