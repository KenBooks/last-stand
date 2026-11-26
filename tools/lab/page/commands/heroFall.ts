// The page entry point for `lab herofall`.
import type { Lab, Report } from '../lab';
import type { HeroFallOptions } from '../heroFall';

/** Follow the hero's real death transition and measure his animated model. */
export async function heroFall(lab: Lab, options: HeroFallOptions): Promise<Report> {
  const { measureHeroFall } = await import('../heroFall');
  return measureHeroFall(lab, options);
}
