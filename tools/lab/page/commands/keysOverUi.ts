// `keysOverUi`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { KeysOverUiOptions } from '../keysOverUi';

/**
 * `lab overui`: each skill key pressed in a fight with the pointer over the page's UI; a keyboard key that casts
 * nothing is a problem, as is a mouse button that casts, or a canary it missed.
 */
export async function keysOverUi(lab: Lab, command: KeysOverUiOptions): Promise<Report> {
  const measure = await import('../keysOverUi');
  return measure.keysOverUi(lab, command);
}
