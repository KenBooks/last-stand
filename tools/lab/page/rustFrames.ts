// What `lab rustcheck`'s checks share of a frame stepped: how long it took by the browser's clock, and how much
// three's own renderer drew in it under the engine.
import type { Lab } from './lab';
import { G } from '../../../src/state';

/** the most draws three's own renderer may make a frame under the engine: the overlays over the frame, not a scene */
export const THREE_DRAWS_MOST = 40;

/** three's own draws in the frame just drawn (the overlays' alone, under the engine). */
function threeDraws(): number {
  const info = G.renderer.info.render as unknown as { drawCalls?: number; calls: number };
  return info.drawCalls ?? info.calls;
}

/** The next `frames` frames stepped: the longest by the browser's clock (ms), and the most draws three made in one. */
export async function frames(lab: Lab, count: number): Promise<{ longest: number; three: number }> {
  const clock = (window as unknown as { __labClock: { realNow: () => number } }).__labClock;
  let longest = 0;
  let three = 0;
  for (let frame = 0; frame < count; frame++) {
    const began = clock.realNow();
    await lab.step(1);
    longest = Math.max(longest, clock.realNow() - began);
    three = Math.max(three, threeDraws());
  }
  return { longest, three };
}
