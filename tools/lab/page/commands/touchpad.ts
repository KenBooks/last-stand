// `touchpad`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { TouchPadOptions } from '../touchPad';

/**
 * `lab touchpad`: a grid of fingers put down over the screen in a run: every point of the move area that isn't a
 * button must start the move stick, and a canary's clear sheet over part of it must be caught.
 */
export async function touchpad(lab: Lab, command: TouchPadOptions): Promise<Report> {
  const { touchPad } = await import('../touchPad');
  return touchPad(lab, command);
}
