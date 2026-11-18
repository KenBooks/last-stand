// `twins`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { TwinsOptions } from '../twins';

/**
 * `lab twins`: the Ossuary Twins: the Crypt's 15th wave and every 20th after sending them (the Colossus on its other
 * boss waves), both risen within their chain's reach; one life between them, the chain snapping past its reach, the
 * collapse at half and a mend a stun breaks; no program compiled in their fight; pictures of it and of each alone.
 */
export async function twins(lab: Lab, command: TwinsOptions): Promise<Report> {
  const { twins: twinsRound } = await import('../twins');
  return twinsRound(lab, command);
}
