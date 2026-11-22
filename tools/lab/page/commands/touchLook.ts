// `touchLook`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { TouchLookOptions } from '../touchLook';

/**
 * `lab touchlook`: a finger dragged over the world in third person and through the eyes, and how far the camera
 * turned; a drag that doesn't turn it is a problem, as is a canary it missed.
 */
export async function touchLook(lab: Lab, command: TouchLookOptions): Promise<Report> {
  const measure = await import('../touchLook');
  return measure.touchLook(lab, command);
}
