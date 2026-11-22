// A frame's light as the canvas shows it, read back right after it was drawn (tools/lab `cast`): over the whole frame
// and by cells of a grid over it. Its brightness is a pixel's as stored, 0 to 255 by Rec. 709's weights on the
// encoded channels (the budget for an effect's light was taken that way from the owner's screenshots); its light, for
// the flashes, is the relative luminance a screen shows (gamma 2.2), a share of white. An SDR canvas only: the lab
// draws in SDR unless a command puts HDR on. Every second pixel each way is summed, over the fine grid's cells on the
// GPU (page/gridSums.ts); each cell of the coarse grid is a block of fine ones.
import { G } from '../../../src/state';
import { frameRect } from '../../../src/core/renderer';
import { gridSums, sumGrid, type Grid, type Summing } from './gridSums';

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
/** the most pixels a fine cell may sum: its brightness held in 32 bits */
const MOST_IN_CELL = Math.floor(2 ** 32 / (255 * BRIGHTNESS_UNIT));

/** The fine grid a canvas is summed over, and the cell each fine cell lies in. */
interface Layout {
  grid: Grid;
  /** each fine cell's cell, row by row from the top left */
  cellOf: Int32Array;
  /** each fine cell's pixels summed */
  counts: Int32Array;
}

/** the layout of the canvas, made again when its size changes */
let layout: (Layout & { width: number; height: number }) | null = null;
/** whether the sums made on the GPU have been checked against the whole canvas read back, on this page */
let sumsChecked = false;

/** The canvas's pixels as last drawn, bottom row first, and its size. */
function readCanvas(): { pixels: Uint8Array; width: number; height: number } {
  const gl = G.renderer.getContext();
  G.renderer.setRenderTarget(null);
  const { left, bottom, width, height } = frameRect();
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(left, bottom, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return { pixels, width, height };
}

/** For each of `count` pixels picked `SAMPLE_STEP` apart along a side `size` long, the band of `bands` it falls in. */
function bandsAlong(count: number, size: number, bands: number, fromEnd: boolean): Int32Array {
  return Int32Array.from({ length: count }, (_, index) => {
    const at = index * SAMPLE_STEP;
    return Math.min(bands - 1, Math.floor((fromEnd ? size - 1 - at : at) / size * bands));
  });
}

/** Each of `bandCount` bands' picked pixels as a `[from, to)` pair, from the band each pixel falls in. */
function spansOf(bands: Int32Array, bandCount: number): Int32Array {
  const spans = new Int32Array(bandCount * 2).fill(-1);
  bands.forEach((band, index) => {
    if (spans[band * 2] < 0) spans[band * 2] = index;
    else if (spans[band * 2 + 1] !== index) throw new Error("lab: screenCells: a fine cell's pixels apart");
    spans[band * 2 + 1] = index + 1;
  });
  if (spans.includes(-1)) throw new Error('lab: screenCells: a fine cell with no pixel');
  return spans;
}

/** For each fine band of `fineSpans`, the coarse band its every pixel falls in (`coarse`, by pixel). */
function coarseOf(fineSpans: Int32Array, coarse: Int32Array): Int32Array {
  return Int32Array.from({ length: fineSpans.length / 2 }, (_, fine) => {
    const band = coarse[fineSpans[fine * 2]];
    for (let index = fineSpans[fine * 2]; index < fineSpans[fine * 2 + 1]; index++) {
      if (coarse[index] !== band) throw new Error('lab: screenCells: a fine cell across two cells');
    }
    return band;
  });
}

/** The layout of a canvas `width` by `height`. */
function layoutOf(width: number, height: number): Layout {
  if (layout && layout.width === width && layout.height === height) return layout;
  const across = Math.ceil(width / SAMPLE_STEP);
  const down = Math.ceil(height / SAMPLE_STEP);
  // (the canvas reads from its bottom row up)
  const columnSpans = spansOf(bandsAlong(across, width, FINE_ACROSS, false), FINE_ACROSS);
  const rowSpans = spansOf(bandsAlong(down, height, FINE_DOWN, true), FINE_DOWN);
  const cellColumns = coarseOf(columnSpans, bandsAlong(across, width, CELLS, false));
  const cellRows = coarseOf(rowSpans, bandsAlong(down, height, CELLS, true));
  const cellOf = new Int32Array(FINE_ACROSS * FINE_DOWN);
  const counts = new Int32Array(FINE_ACROSS * FINE_DOWN);
  for (let row = 0; row < FINE_DOWN; row++) {
    for (let column = 0; column < FINE_ACROSS; column++) {
      const fine = row * FINE_ACROSS + column;
      const rows = rowSpans[row * 2 + 1] - rowSpans[row * 2];
      cellOf[fine] = cellRows[row] * CELLS + cellColumns[column];
      counts[fine] = rows * (columnSpans[column * 2 + 1] - columnSpans[column * 2]);
      if (counts[fine] > MOST_IN_CELL) throw new Error('lab: screenCells: a fine cell too big to sum in 32 bits');
    }
  }
  const grid: Grid = {
    across: FINE_ACROSS,
    down: FINE_DOWN,
    step: SAMPLE_STEP,
    columnSpans,
    rowSpans,
    weights: WEIGHTS,
    brightFrom: BRIGHT * BRIGHTNESS_UNIT,
    lights: LIGHTS,
  };
  layout = { grid, cellOf, counts, width, height };
  return layout;
}

/** One fine cell's sums (`gridSums`' four) of `pixels`, the canvas read back `width` wide, added into `sums`. */
function addCell(sums: Uint32Array, at: number, grid: Grid, cell: { row: number; column: number },
  pixels: Uint8Array, width: number): void {
  const [redWeight, greenWeight, blueWeight] = grid.weights;
  for (let row = grid.rowSpans[cell.row * 2]; row < grid.rowSpans[cell.row * 2 + 1]; row++) {
    for (let column = grid.columnSpans[cell.column * 2]; column < grid.columnSpans[cell.column * 2 + 1]; column++) {
      const pixel = (row * grid.step * width + column * grid.step) * 4;
      const red = pixels[pixel];
      const green = pixels[pixel + 1];
      const blue = pixels[pixel + 2];
      const brightness = redWeight * red + greenWeight * green + blueWeight * blue;
      sums[at] += brightness;
      sums[at + 1] += grid.lights[red] + grid.lights[256 + green] + grid.lights[512 + blue];
      if (brightness >= grid.brightFrom) sums[at + 2]++;
    }
  }
}

/** Throws unless `sums`, made on the GPU, are those of the whole canvas read back, summed here. */
function checkSums(sums: Uint32Array, grid: Grid): void {
  const { pixels, width } = readCanvas();
  const readBack = new Uint32Array(sums.length);
  for (let row = 0; row < grid.down; row++) {
    for (let column = 0; column < grid.across; column++) {
      addCell(readBack, (row * grid.across + column) * 4, grid, { row, column }, pixels, width);
    }
  }
  const apart = readBack.findIndex((sum, index) => sum !== sums[index]);
  if (apart < 0) return;
  const cell = apart >> 2;
  const gpu = sums.slice(cell * 4, cell * 4 + 3).join(', ');
  const cpu = readBack.slice(cell * 4, cell * 4 + 3).join(', ');
  throw new Error(`lab: the sums made on the GPU differ from the canvas's at fine cell ${cell}: ${gpu}, not ${cpu}`);
}

/** Throws if the canvas is HDR: its frames are read in SDR. */
function checkSdr(): void {
  const gl = G.renderer.getContext() as WebGL2RenderingContext & { drawingBufferFormat?: number };
  if (gl.drawingBufferFormat === gl.RGBA16F) {
    throw new Error('lab: cast: the canvas is HDR; its frames are read in SDR');
  }
}

/** The layout of the canvas as it is, checked to be SDR. */
function canvasLayout(): Layout {
  checkSdr();
  const gl = G.renderer.getContext();
  return layoutOf(gl.drawingBufferWidth, gl.drawingBufferHeight);
}

/** The frame's light from its fine cells' sums over `own`. */
function cellsOf(sums: Uint32Array, own: Layout): FrameCells {
  const cellCount = CELLS * CELLS;
  const brightness = new Float64Array(cellCount);
  const lights = new Float64Array(cellCount);
  const cellCounts = new Float64Array(cellCount);
  const fineMeans = new Float32Array(FINE_ACROSS * FINE_DOWN);
  let bright = 0;
  for (let fine = 0; fine < fineMeans.length; fine++) {
    const cell = own.cellOf[fine];
    brightness[cell] += sums[fine * 4];
    lights[cell] += sums[fine * 4 + 1];
    bright += sums[fine * 4 + 2];
    cellCounts[cell] += own.counts[fine];
    fineMeans[fine] = sums[fine * 4] / BRIGHTNESS_UNIT / own.counts[fine];
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

/** The frame last drawn, as its light. Read it in the frame it was drawn in: the canvas is cleared after. */
export function frameCells(): FrameCells {
  const own = canvasLayout();
  const sums = gridSums(sumGrid(own.grid));
  if (!sumsChecked) checkSums(sums, own.grid);
  sumsChecked = true;
  return cellsOf(sums, own);
}

/** a frame's sums are read once this many frames after it have been sent */
const READ_BEHIND = 2;

/**
 * Frames' light read without waiting for the GPU (`sumGrid`): each frame summed as it was drawn (`take`), and read
 * back once the next has been sent, its work on the CPU done while the GPU finishes the one before. The light comes
 * out as `frameCells` gives it; the first frame a page reads is read at once, its sums checked against the whole
 * canvas's.
 */
export class FrameReader {
  private readonly pending: { summing: Summing; layout: Layout }[] = [];
  private readonly read: FrameCells[] = [];

  /** The frame last drawn, summed to be read; the frames summed before it read. */
  take(): void {
    if (!sumsChecked) {
      this.readPending();
      this.read.push(frameCells());
      return;
    }
    const own = canvasLayout();
    this.pending.push({ summing: sumGrid(own.grid), layout: own });
    this.readPending(READ_BEHIND);
  }

  /** Every frame taken, as its light, in turn. */
  frames(): FrameCells[] {
    this.readPending();
    return this.read;
  }

  /** The frames summed read, all but the last `keep`. */
  private readPending(keep = 0): void {
    for (const { summing, layout: own } of this.pending.splice(0, Math.max(0, this.pending.length - keep))) {
      this.read.push(cellsOf(gridSums(summing), own));
    }
  }
}

/** A cell's place in the grid as words (`top left`, `second row, third`...). */
export function cellName(cell: number): string {
  const row = Math.floor(cell / CELLS);
  const column = cell % CELLS;
  return `row ${row + 1} of ${CELLS} from the top, column ${column + 1} from the left`;
}
