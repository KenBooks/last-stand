// `spin`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab, Report } from '../lab';
import type { SpinOptions } from '../spin';

/**
 * `lab spin`: mouse look turned one way for a long while in each close view, then the other, the browser's own jump
 * under the lock sent mid-spin: no frame may turn the view far past the spin's steady turn (#318).
 */
export async function spin(lab: Lab, command: SpinOptions): Promise<Report> {
  const { spinView } = await import('../spin');
  return spinView(lab, command);
}
