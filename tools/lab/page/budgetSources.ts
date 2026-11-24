// What took a frame past the light budget (tools/lab `cast`): the frame it was worst on drawn again with each thing in
// the scene taken out in turn (page/flashSources.ts' things: an effect's mesh, a pool of particles, the foes, each
// light), and the measure read without it, then without everything the cast brought into the scene together. Light
// adds up and the grade compresses it, so a thing's own drop says what it holds up alone; the things together say how
// much of the frame is the cast's. (Glacial Nova over the shoulder was taken apart by hand, a part of its code edited
// out for each run: its ground flash took its brightest sixteenth from 163 to 140, both rings to 153, the two together
// to 118.) Its lines are page/budgetLines.ts'.
import type { Lab } from './lab';
import type { FrameCells } from './screenCells';
import { frameNow, sceneSources, type Source } from './flashSources';
import { keyOf, type Breakdown } from './budgetLines';

/** The keys of the things in the scene now: read before the press, what the cast brought in is the rest. */
export function sceneKeys(): Set<string> {
  return new Set(sceneSources().map((source) => keyOf(source.name)));
}

/** The things in `sources` taken out together, and the frame read meanwhile; all put back after. */
function readWithout(lab: Lab, sources: Source[], read: (frame: FrameCells) => number): number {
  const putBacks: (() => void)[] = [];
  try {
    for (const source of sources) putBacks.push(source.takeOut());
    return read(frameNow(lab));
  } finally {
    for (const putBack of putBacks.reverse()) putBack();
  }
}

/** `read` on the frame drawn now, whole, without each thing in the scene in turn, and without the things not in
 *  `before` together. The frame is drawn once for each; the game isn't stepped. */
export function breakdownNow(lab: Lab, read: (frame: FrameCells) => number, before: Set<string>): Breakdown {
  const whole = read(frameNow(lab));
  const sources = sceneSources();
  const without = sources.map((source) => ({ name: source.name, value: readWithout(lab, [source], read) }));
  const brought = sources.filter((source) => !before.has(keyOf(source.name)));
  const castsOwn = { value: readWithout(lab, brought, read), count: brought.length };
  return { whole, without, castsOwn };
}
