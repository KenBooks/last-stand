// The page entry point for `lab dummyhit`.
import type { Lab, Report } from '../lab';
import type { DummyHitOptions } from '../dummyHit';

/** Measure the village dummy as each attack lands. */
export async function dummyHit(lab: Lab, options: DummyHitOptions): Promise<Report> {
  const { measureDummyHit } = await import('../dummyHit');
  return measureDummyHit(lab, options);
}
