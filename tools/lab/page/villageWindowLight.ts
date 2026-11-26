// `lab village --only windowsLightTheHall`: the hall's windows light its inside by the sky through them, by day and by
// night (from play, "windows are not real windows, they dont let light through": the sun came in through them at a
// few hours alone, as thin slivers, and the hall was lit by an even share of the sky wherever its windows were).
// Stood in the hall's middle, over the shoulder turned to the dais and from above, at mid-morning, noon and midnight:
// the frame with the sky through the windows (`rust.openingSky`) against the frame without it, at one moment. The
// share of the frame they brighten, and the light they add pictured alone beside the frame as played. `canary` holds
// the windows' sky off in both frames.
import * as THREE from 'three';
import type { Lab, Pictured, Tile } from './lab';
import { G } from '../../../src/state';
import { RUST } from '../../../src/engine';
import { holdHour } from '../../../src/game/clock';
import { faceCamera, viewMode, type ViewMode } from '../../../src/core/renderer';
import { TERRACE } from '../../../src/data/village';
import { drawFrame, type Canvas } from './light';
import { canvasOf } from './pixels';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** where he stands (the hall's middle) and the way he faces (the dais) */
const STAND = new THREE.Vector3(TERRACE.x, TERRACE.high, -24);
const FACING = Math.PI;
const SETTLE = 60;
/** the hours read, and the views */
const HOURS = [10, 13, 0];
const VIEWS: ViewMode[] = ['third', 'top'];
/** how much a pixel must brighten to count as lit by the windows (of white), and the least share of the frame they
 *  must brighten by day and by night */
const BRIGHTENED = 2 / 255;
const LEAST_BY_DAY = 0.15;
const LEAST_BY_NIGHT = 0.05;
/** how much brighter the windows' light alone is pictured */
const PICTURED_GAIN = 8;

/** One reading: an hour and a view, the share of the frame the windows brighten, and their light alone pictured. */
interface Reading { hour: number; view: ViewMode; share: number; alone: Tile }

/** The share of the pixels `through` is brighter than `none` by at least `BRIGHTENED`. */
function brightenedShare(through: Canvas, none: Canvas): number {
  let brightened = 0;
  for (let i = 0; i < through.pixels.length; i += 4) {
    const added = (through.pixels[i] + through.pixels[i + 1] + through.pixels[i + 2]
      - none.pixels[i] - none.pixels[i + 1] - none.pixels[i + 2]) / 3;
    if (added >= BRIGHTENED) brightened++;
  }
  return brightened / (through.pixels.length / 4);
}

/** The light `through` adds over `none` pictured, brightened, the canvas's rows turned top down. */
function addedPicture(through: Canvas, none: Canvas, view: string): Tile {
  const { width, height } = through;
  const image = new ImageData(width, height);
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const from = ((height - 1 - row) * width + column) * 4;
      const to = (row * width + column) * 4;
      for (let part = 0; part < 3; part++) {
        const added = Math.max(0, through.pixels[from + part] - none.pixels[from + part]);
        image.data[to + part] = Math.min(255, added * PICTURED_GAIN * 255);
      }
      image.data[to + 3] = 255;
    }
  }
  const canvas = canvasOf(image);
  return { view, png: canvas.toDataURL('image/png'), width, height };
}

/** The frame with the windows' sky and without it, at one moment (both without, with `canary`), the hero hidden. */
function withAndWithout(lab: Lab, canary: boolean): [Canvas, Canvas] {
  const strength = RUST.tune.openingSky;
  G.player.obj.visible = false;
  try {
    if (canary) RUST.tune.openingSky = 0;
    const through = drawFrame(lab);
    RUST.tune.openingSky = 0;
    return [through, drawFrame(lab)];
  } finally {
    RUST.tune.openingSky = strength;
    G.player.obj.visible = true;
  }
}

/** The hero stood in the hall's middle in `view`, turned to the dais, at `hour`, let settle. */
async function standIn(lab: Lab, view: ViewMode, hour: number): Promise<void> {
  holdHour(hour);
  await viewBy(lab, view);
  G.player.walkTo = null;
  G.player.place(STAND, FACING);
  faceCamera(FACING);
  await lab.step(SETTLE);
}

/** The least share the windows must brighten at `hour`. */
const leastAt = (hour: number): number => (hour >= 6 && hour <= 18 ? LEAST_BY_DAY : LEAST_BY_NIGHT);

/** The hall's windows light its inside by the sky, by day and by night, in each view. */
export async function windowsLightTheHall(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const kept = viewMode();
  const turns = RUST.tune.shadowTurns;
  // (the sun's map drawn every frame read: kept between turns, two frames of one moment differ by it)
  RUST.tune.shadowTurns = 0;
  const readings: Reading[] = [];
  const moments: Pictured[] = [];
  try {
    for (const hour of HOURS) {
      for (const view of VIEWS) {
        await standIn(lab, view, hour);
        const [through, none] = withAndWithout(lab, canary);
        const share = brightenedShare(through, none);
        readings.push({ hour, view, share, alone: addedPicture(through, none, `${view}, the windows' light alone`) });
        if (canary) continue;
        G.player.obj.visible = false;
        try {
          moments.push(await lab.screen(`the hall at ${hour} h, ${view}`, []));
        } finally {
          G.player.obj.visible = true;
        }
      }
    }
  } finally {
    RUST.tune.shadowTurns = turns;
    holdHour(null);
    await viewBy(lab, kept);
  }
  const said = (reading: Reading): string => `${reading.hour} h ${reading.view} ${(reading.share * 100).toFixed(1)}%`;
  const lines = [`the hall's windows brighten its frame by the sky: ${readings.map(said).join(', ')}`
    + ` (at least ${LEAST_BY_DAY * 100}% by day, ${LEAST_BY_NIGHT * 100}% by night)`];
  const dark = readings.filter((reading) => reading.share < leastAt(reading.hour));
  if (canary) return { lines, problems: [], caught: dark.length === readings.length, moments: [] };
  const problems = dark.map((reading) => `the hall's windows let too little of the sky in: ${said(reading)}`);
  for (const reading of readings) {
    moments.push({ label: `${reading.hour} h, ${PICTURED_GAIN} times`, notes: [], tiles: [reading.alone] });
  }
  return { lines, problems, caught: null, moments };
}
