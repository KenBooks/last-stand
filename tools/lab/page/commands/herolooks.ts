// `herolooks`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';

/**
 * `lab herolooks`: each class's looks made by the workers, built, drawn and pictured, the hair colours on the hair,
 * brows and beard, and a look kept; a head sculpted on the page, a program compiled, a part missing, a colour that
 * misses one of them or a look not kept, or a canary it missed, is a problem.
 */
export async function herolooks(lab: Lab, command: import('../heroLooks').HeroLooksOptions): Promise<Report> {
  const { heroLooks } = await import('../heroLooks');
  return heroLooks(lab, command);
}
