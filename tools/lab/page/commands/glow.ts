// `glow`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { GlowOptions } from '../itemGlow';

/** `lab glow`: each worn item's glow in its rarity's colour, against the frame without it; a glow unseen, too bright,
 *  flat, in another hue, on a Magic item, still or quick, a program compiled and a canary missed are problems. */
export async function glow(lab: Lab, command: GlowOptions): Promise<Report> {
  const { itemGlow } = await import('../itemGlow');
  return itemGlow(lab, command);
}
