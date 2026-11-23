// `lab rust --parts`: the frame's time on the GPU by its parts, as the engine times them within one frame
// (src/perf/gpuParts.ts, Bulwark's gpu/parts.rs): the lines a player's profile carries, where the hero stands.
import { render } from '../../../src/core/renderer';
import { gpuParts, gpuPartsLines } from '../../../src/perf/gpuParts';

/** The browser's next frame, by its own clock (the lab's page clock stands still within a frame). */
function browserFrame(): Promise<void> {
  return (window as unknown as { __labClock: { realFrame: () => Promise<void> } }).__labClock.realFrame();
}

/** The parts' lines, against the frame as it is (`whole`, ms on the GPU); a line saying so where they can't be read. */
export async function partsSaid(whole: number): Promise<string[]> {
  const found = await gpuParts(render, browserFrame);
  if (!found) return ['  the frame by its parts: not timed (the browser gives the engine no timestamps)'];
  return gpuPartsLines(found, whole).map((line) => `  ${line}`);
}
