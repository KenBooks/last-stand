// The run set up for a probe (node/side.mjs `probe`): the lab's own set-up, checked (page/lab.ts `Lab.setup`).
import type { Lab, Fixture } from '../lab';

/** `lab probe`'s set-up before a probe module runs (a probe may set up again as it likes). */
export function setup(lab: Lab, fixture: Fixture): Promise<Record<string, unknown>> {
  return lab.setup(fixture);
}
