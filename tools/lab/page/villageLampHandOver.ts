// `lab village`'s lamp hand-over: what the frames draw as the hero comes to other lamps by night. From play, "FPS is
// not stable, even on high end hardware", and #593: under three a hand-over of the casting lights drew both lamps'
// cubes whole in one frame, twelve faces of the village, 142 to 167 draws and 3.5M triangles on Very low. Under the
// engine every lamp's map of what stands still is drawn once, a lamp a frame, and the movers are drawn by the lamps
// nearest them each frame into faces of their own (`engine/lampShadows.ts`): walking to other lamps draws no still
// lamp's faces again, and his shadow by his new lamps is drawn. Then the frame as the walk left the lamps' maps
// against all drawn again at that moment. `canary` asks for every lamp's map again as he arrives: its faces must be
// counted.
import { G } from '../../../src/state';
import type { Lab } from './lab';
import { holdHour } from '../../../src/game/clock';
import { askLampsAgain, busiestFrame, leftAgainstDrawnAgain, standAt, type Drawn } from './villageSunStep';
import type { LightsChecked } from './villageLights';

/** the hour the lamps cast at */
const MIDNIGHT = 0;
/** the frames given for the lamps' maps to be drawn and his shadows to settle by the lamps nearest him */
const SETTLE = 90;
/** the frames watched after he's stood by other lamps */
const WATCHED = 90;
/** how far from a lamp's foot he stands (m) */
const OFF = 1.5;
/** the most of the frame that may differ between the lamps' maps as the walk left them and all drawn again */
const MOST_CHANGED = 0.002;

/** A stand beside the street lamp `index`. */
function besideLamp(index: number): [number, number] {
  const lamp = G.arena.village.lanterns[index];
  return [lamp.x + OFF, lamp.z];
}

/** The street lamp furthest from the lamp `from`: by it, neither of the two nearest lamps is one of `from`'s. */
function furthestLamp(from: number): number {
  const lamps = G.arena.village.lanterns;
  let furthest = from;
  for (let index = 0; index < lamps.length; index++) {
    if (lamps[index].distanceTo(lamps[from]) > lamps[furthest].distanceTo(lamps[from])) furthest = index;
  }
  return furthest;
}

/** The sum of `of` over `frames`. */
const sumOf = (frames: Drawn[], of: (frame: Drawn) => number): number =>
  frames.reduce((sum, frame) => sum + of(frame), 0);

/** He's come to other lamps: no frame draws a still lamp's faces again, and his shadow by them is drawn. */
export async function lampHandOverByFaces(lab: Lab, canary: boolean): Promise<LightsChecked> {
  holdHour(MIDNIGHT);
  try {
    standAt(besideLamp(0));
    await lab.step(SETTLE);
    standAt(besideLamp(furthestLamp(0)));
    if (canary) askLampsAgain();
    const frames: Drawn[] = [];
    const busiest = await busiestFrame(lab, WATCHED, frames);
    const still = sumOf(frames, (frame) => frame.still);
    const movers = sumOf(frames, (frame) => frame.movers);
    const changed = leftAgainstDrawnAgain(lab);
    const line = `he came to other lamps at midnight: ${still} faces of the lamps' maps of what stands still drawn `
      + `over ${frames.length} frames, ${movers} of his shadow by them; the most a frame drew ${busiest.scene} draws in the `
      + `scene and ${Math.round(busiest.triangles / 1000)}k triangles; after it the frame against all drawn again `
      + `${(changed * 100).toFixed(2)}% changed`;
    if (canary) return { lines: [line], problems: [], caught: still > 0, moments: [] };
    const problems: string[] = [];
    if (movers === 0) problems.push(`${line}: his shadow by his new lamps never drawn (the measure's own)`);
    if (still > 0) problems.push(`${line}: the lamps' maps of what stands still drawn again`);
    if (changed > MOST_CHANGED) problems.push(`${line}: over ${(MOST_CHANGED * 100).toFixed(2)}%`);
    return { lines: [line], problems, caught: null, moments: [] };
  } finally {
    holdHour(null);
    await lab.step(SETTLE);
  }
}
