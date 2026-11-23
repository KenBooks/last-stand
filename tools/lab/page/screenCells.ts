// A frame's light as the canvas shows it, read back right after it was drawn (tools/lab `cast`): over the whole frame
// and by cells of a grid over it. Its brightness is a pixel's as stored, 0 to 255 by Rec. 709's weights on the
// encoded channels (the budget for an effect's light was taken that way from the owner's screenshots); its light, for
// the flashes, is the relative luminance a screen shows (gamma 2.2), a share of white. Every second pixel each way is
// summed over the fine grid's cells; each cell of the coarse grid is a block of fine ones.
//
// The frame is read off the engine's canvas in the task that drew it (`webGpuPixels`) and summed here. It was summed
// on the GPU by a WebGL program of the lab's own beside three's, read back a frame later: the engine alone draws the
// game, three's renderer has no WebGL context, and `cast` stopped at its first frame ("gl.readPixels is not a
// function"). Whole numbers, as before: the sums are exact.
import { frameRect } from '../../../src/core/renderer';
import { webGpuPixels } from './pixels';

/** the cells across and down the frame: each a sixteenth of it, about the area a flash is judged over */
export const CELLS = 4;
/** a pixel this bright or more, as stored, counts as bright */
const BRIGHT = 200;
/** the pixels read each way: every this many */
const SAMPLE_STEP = 2;
/** a finer grid's cells across and down the frame, about 30 pixels each on a 1920 by 1080 screen: a patch that pops
 *  for a frame or two shows in it (page/blinks.ts) */
export const FINE_ACROSS = 64, FINE_DOWN = 36;

/** A frame's light: the whole frame's and each cell's, the cells row by row from the top left. */
export interface FrameCells {
  /** the mean brightness as stored, 0 to 255 */
  mean: number;
  /** each cell's mean brightness as stored */
  cellMeans: number[];
  /** each cell's mean light, a share of white */
  cellLights: number[];
  /** the share of the pixels at least `BRIGHT` */
  brightShare: number;
  /** each fine cell's mean brightness as stored (`FINE_ACROSS` by `FINE_DOWN`, row by row from the top left) */
  fineMeans: Float32Array;
}

/** an encoded channel's light (gamma 2.2), by its stored value */
const LIGHT_OF = Float32Array.from({ length: 256 }, (_, value) => (value / 255) ** 2.2);
/** a pixel's brightness is summed in ten thousandths, each channel's stored value times its Rec. 709 weight in
 *  them, so exactly */
const BRIGHTNESS_UNIT = 10000;
/** a pixel's light is summed in millionths of white */
const LIGHT_UNIT = 1e6;
/** Rec. 709's weights in `BRIGHTNESS_UNIT`s: red's, green's and blue's */
const WEIGHTS: [number, number, number] = [2126, 7152, 722];
/** a channel's light times its weight in `LIGHT_UNIT`s, by its stored value: red's 256, green's, then blue's */
const LIGHTS = Uint32Array.from({ length: 3 * 256 }, (_, index) => {
  const weight = WEIGHTS[Math.floor(index / 256)] / BRIGHTNESS_UNIT;
  return Math.round(weight * LIGHT_OF[index % 256] * LIGHT_UNIT);
});
/** a pixel's brightness in `BRIGHTNESS_UNIT`s from which it counts as bright */
const BRIGHT_FROM = BRIGHT * BRIGHTNESS_UNIT;

/** The fine grid a frame is summed over, for a frame of one size. */
interface Layout {
  width: number;
  height: number;
  /** each picked column's fine column, from the left */
  fineColumns: Int32Array;
  /** each picked row's fine row, from the top */
  fineRows: Int32Array;
  /** each fine cell's cell, row by row from the top left */
  cellOf: Int32Array;
  /** each fine cell's pixels summed */
  counts: Int32Array;
}

/** the layout of the frame, made again when its size changes */
let layout: Layout | null = null;

/** For each of `count` pixels picked `SAMPLE_STEP` apart along a side `size` long, the band of `bands` it falls in. */
function bandsAlong(count: number, size: number, bands: number): Int32Array {
  const bandOf = (index: number): number => Math.min(bands - 1, Math.floor(index * SAMPLE_STEP / size * bands));
  return Int32Array.from({ length: count }, (_, index) => bandOf(index));
}

/** For each fine band of `fine`, the coarse band its every pixel falls in (`coarse`, by pixel); throws if one has
 *  no pixel or lies across two. */
function coarseOf(fine: Int32Array, coarse: Int32Array, fineCount: number): Int32Array {
  const bands = new Int32Array(fineCount).fill(-1);
  fine.forEach((band, index) => {
    if (bands[band] < 0) bands[band] = coarse[index];
    else if (bands[band] !== coarse[index]) throw new Error('lab: screenCells: a fine cell across two cells');
  });
  if (bands.includes(-1)) throw new Error('lab: screenCells: a fine cell with no pixel');
  return bands;
}

/** How many of `bands`' picked pixels fall in each of `count` bands. */
function countsOf(bands: Int32Array, count: number): Int32Array {
  const counts = new Int32Array(count);
  for (const band of bands) counts[band]++;
  return counts;
}

/** The layout of a frame `width` by `height`. */
function layoutOf(width: number, height: number): Layout {
  if (layout && layout.width === width && layout.height === height) return layout;
  const across = Math.ceil(width / SAMPLE_STEP);
  const down = Math.ceil(height / SAMPLE_STEP);
  const fineColumns = bandsAlong(across, width, FINE_ACROSS);
  const fineRows = bandsAlong(down, height, FINE_DOWN);
  const cellColumns = coarseOf(fineColumns, bandsAlong(across, width, CELLS), FINE_ACROSS);
  const cellRows = coarseOf(fineRows, bandsAlong(down, height, CELLS), FINE_DOWN);
  const columnCounts = countsOf(fineColumns, FINE_ACROSS);
  const rowCounts = countsOf(fineRows, FINE_DOWN);
  const cellOf = new Int32Array(FINE_ACROSS * FINE_DOWN);
  const counts = new Int32Array(FINE_ACROSS * FINE_DOWN);
  for (let row = 0; row < FINE_DOWN; row++) {
    for (let column = 0; column < FINE_ACROSS; column++) {
      const fine = row * FINE_ACROSS + column;
      cellOf[fine] = cellRows[row] * CELLS + cellColumns[column];
      counts[fine] = rowCounts[row] * columnCounts[column];
    }
  }
  layout = { width, height, fineColumns, fineRows, cellOf, counts };
  return layout;
}

/** Each fine cell's sums of `pixels` (rows from the top), three a cell: its brightness, its light and its bright
 *  pixels. */
function sumsOf(pixels: Uint8ClampedArray, own: Layout): Float64Array {
  const sums = new Float64Array(FINE_ACROSS * FINE_DOWN * 3);
  for (let row = 0; row < own.fineRows.length; row++) {
    const rowStart = row * SAMPLE_STEP * own.width;
    const fineRow = own.fineRows[row] * FINE_ACROSS;
    for (let column = 0; column < own.fineColumns.length; column++) {
      const pixel = (rowStart + column * SAMPLE_STEP) * 4;
      const red = pixels[pixel];
      const green = pixels[pixel + 1];
      const blue = pixels[pixel + 2];
      const brightness = WEIGHTS[0] * red + WEIGHTS[1] * green + WEIGHTS[2] * blue;
      const at = (fineRow + own.fineColumns[column]) * 3;
      sums[at] += brightness;
      sums[at + 1] += LIGHTS[red] + LIGHTS[256 + green] + LIGHTS[512 + blue];
      if (brightness >= BRIGHT_FROM) sums[at + 2]++;
    }
  }
  return sums;
}

/** The frame's light from its fine cells' sums over `own`. */
function cellsOf(sums: Float64Array, own: Layout): FrameCells {
  const cellCount = CELLS * CELLS;
  const brightness = new Float64Array(cellCount);
  const lights = new Float64Array(cellCount);
  const cellCounts = new Float64Array(cellCount);
  const fineMeans = new Float32Array(FINE_ACROSS * FINE_DOWN);
  let bright = 0;
  for (let fine = 0; fine < fineMeans.length; fine++) {
    const cell = own.cellOf[fine];
    brightness[cell] += sums[fine * 3];
    lights[cell] += sums[fine * 3 + 1];
    bright += sums[fine * 3 + 2];
    cellCounts[cell] += own.counts[fine];
    fineMeans[fine] = sums[fine * 3] / BRIGHTNESS_UNIT / own.counts[fine];
  }
  const summed = cellCounts.reduce((total, count) => total + count, 0);
  return {
    mean: brightness.reduce((total, sum) => total + sum, 0) / BRIGHTNESS_UNIT / summed,
    cellMeans: Array.from(brightness, (sum, cell) => sum / BRIGHTNESS_UNIT / cellCounts[cell]),
    cellLights: Array.from(lights, (light, cell) => light / LIGHT_UNIT / cellCounts[cell]),
    brightShare: bright / summed,
    fineMeans,
  };
}

/** The frame last drawn, as its light. Read it in the task it was drawn in: the canvas is cleared after. */
export function frameCells(): FrameCells {
  const frame = frameRect();
  const picture = webGpuPixels({ left: frame.left, top: frame.top, width: frame.width, height: frame.height });
  const own = layoutOf(picture.width, picture.height);
  return cellsOf(sumsOf(picture.data, own), own);
}

/** Frames' light, each read as it was drawn (`take`) and handed back in turn (`frames`). */
export class FrameReader {
  private readonly read: FrameCells[] = [];

  /** The frame last drawn, read. */
  take(): void {
    this.read.push(frameCells());
  }

  /** Every frame taken, as its light, in turn. */
  frames(): FrameCells[] {
    return this.read;
  }
}

/** A cell's place in the grid as words (`top left`, `second row, third`...). */
export function cellName(cell: number): string {
  const row = Math.floor(cell / CELLS);
  const column = cell % CELLS;
  return `row ${row + 1} of ${CELLS} from the top, column ${column + 1} from the left`;
}
