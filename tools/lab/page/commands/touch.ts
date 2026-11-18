// `touch`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { TouchOptions } from '../touchStick';

/**
 * `lab touch`: the touch controls' move stick pushed by a finger near and far past its edge, and the hero's speed;
 * a push further out that gives less is a problem, as is a canary it missed.
 */
export async function touch(lab: Lab, command: TouchOptions): Promise<Report> {
  const { touchStick } = await import('../touchStick');
  return touchStick(lab, command);
}
