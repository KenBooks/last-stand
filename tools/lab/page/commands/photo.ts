// `photo`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { PhotoOptions } from '../photo';

/** `lab photo`: photo mode used as a player uses it in the village and both battlegrounds; the page's UI or the
 *  world's overlays shown, the game going on, a look that compiled, a photo not saved as it should be, or a canary
 *  missed, is a problem. */
export async function photo(lab: Lab, command: PhotoOptions): Promise<Report> {
  const { photo: follow } = await import('../photo');
  return follow(lab, command);
}
