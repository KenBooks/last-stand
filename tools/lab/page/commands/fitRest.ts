// `fitRest`, which a command's work calls by name on the page (side.command: page/commands/AGENTS.md).
import type { Lab } from '../lab';
import type { Fit, FitOptions } from '../fitRest';

/** `lab match --fit`: a rest's tunable values fitted to a reference's marks. */
export async function fitRest(lab: Lab, command: FitOptions): Promise<Fit> {
  const { fitRest: fit } = await import('../fitRest');
  return fit(lab, command);
}
