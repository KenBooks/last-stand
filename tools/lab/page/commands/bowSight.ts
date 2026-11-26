// The page entry point for `lab bowsight`.
import type { Lab, Report } from '../lab';
import type { BowSightOptions } from '../bowSight';

/** Measure the sight over the training dummy and release each shot. */
export async function bowSight(lab: Lab, options: BowSightOptions): Promise<Report> {
  const { measureBowSight } = await import('../bowSight');
  return measureBowSight(lab, options);
}
