// `lab resize`: what the window's change of size costs the page, as going full screen on a phone changes it (trace
// 476Y-88D5: the S25's window went from 751x298 to 784x354 and 832x384, its resize handler 247 ms, `fitViewport` in
// core/renderer.ts, and the next frame waited 235 ms before drawing). The window's size is played by the page (its
// `innerWidth` and `innerHeight`), the canvas's own drawing buffer resized as the game resizes it. Each resize is
// timed by the browser's own clock, the event's work and the next frame's, and what it rebuilt is counted: the
// canvas's drawing buffer, set again each way, and the render targets made at another size.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import type { Lab, Report } from './lab';
import { G } from '../../../src/state';
import { frameRect, holdScreenCanvas } from '../../../src/core/renderer';
import { bloodMask } from '../../../src/core/bloodEdges';
import { takePhoto } from '../../../src/ui/photo';
import { drawRaw } from './light';
import { timeCalls, type Timing } from './timing';

/** what `resize` takes */
export interface ResizeOptions {
  rounds: number;
  canary: boolean;
}

/** A window size, in css px. */
interface WindowSize {
  width: number;
  height: number;
}

/** What one resize cost and rebuilt. */
interface ResizeCost {
  /** the resize event's work, and the next frame's (ms, the browser's clock) */
  event: number;
  frame: number;
  /** the renderer's and the post chain's resizes (ms) */
  canvas: number;
  composer: number;
  /** the canvas's drawing buffer set again (a width or a height changed), and render targets made at another size */
  reshapes: number;
  /** of the canvas's resize, the time (ms) its width and height took to set */
  reshapeTime: number;
  targets: number;
}

/** the phone's steps into full screen, as shares of its last: 751x298, 784x354, 832x384 */
const STEPS: WindowSize[] = [{ width: 751 / 832, height: 298 / 384 }, { width: 784 / 832, height: 354 / 384 }];

/** The window's size and `screen` bounds played by the page: what the game reads as its `innerWidth`, `innerHeight` and `screen`. */
class PlayedWindow {
  private size: WindowSize = { width: window.innerWidth, height: window.innerHeight };
  private screenSize: WindowSize = { width: window.innerWidth, height: window.innerHeight };
  /** the window's and screen's own descriptors */
  private readonly own = {
    width: Object.getOwnPropertyDescriptor(window, 'innerWidth'),
    height: Object.getOwnPropertyDescriptor(window, 'innerHeight'),
    screenW: Object.getOwnPropertyDescriptor(window.screen, 'width'),
    screenH: Object.getOwnPropertyDescriptor(window.screen, 'height'),
  };

  constructor() {
    Object.defineProperty(window, 'innerWidth', { configurable: true, get: () => this.size.width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => this.size.height });
    Object.defineProperty(window.screen, 'width', { configurable: true, get: () => this.screenSize.width });
    Object.defineProperty(window.screen, 'height', { configurable: true, get: () => this.screenSize.height });
  }

  setScreen(size: WindowSize): void {
    this.screenSize = size;
  }

  /** The window at `size`, its resize event sent as the browser sends it; that event's work (ms). */
  resizeTo(size: WindowSize): number {
    this.size = size;
    const now = window.__labClock.realNow;
    const start = now();
    window.dispatchEvent(new Event('resize'));
    return now() - start;
  }

  /** The window's and screen's own sizes again. */
  restore(): void {
    if (this.own.width) Object.defineProperty(window, 'innerWidth', this.own.width);
    if (this.own.height) Object.defineProperty(window, 'innerHeight', this.own.height);
    if (this.own.screenW) Object.defineProperty(window.screen, 'width', this.own.screenW);
    else delete (window.screen as unknown as { width?: number }).width;
    if (this.own.screenH) Object.defineProperty(window.screen, 'height', this.own.screenH);
    else delete (window.screen as unknown as { height?: number }).height;
  }
}

/** Counts what the page rebuilds: the canvas's drawing buffer set again, render targets made at another size. */
class Rebuilds {
  reshapes = 0;
  /** the time (ms) the canvas's sets took */
  reshapeTime = 0;
  targets = 0;
  private readonly canvas = G.renderer.domElement;
  private readonly targetSetSize = THREE.RenderTarget.prototype.setSize;

  constructor() {
    this.watchSide('width');
    this.watchSide('height');
    const original = this.targetSetSize;
    const counts = this;
    THREE.RenderTarget.prototype.setSize = function (this: THREE.RenderTarget, width, height, depth = 1) {
      if (width !== this.width || height !== this.height || depth !== this.depth) counts.targets++;
      original.call(this, width, height, depth);
    };
  }

  /** `side` of the canvas counted each time it's set to another value (each one reallocates its drawing buffer). */
  private watchSide(side: 'width' | 'height'): void {
    const own = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, side);
    if (!own?.get || !own.set) throw new Error(`lab: resize: the canvas's ${side} has no setter`);
    const { get, set } = own;
    const counts = this;
    Object.defineProperty(this.canvas, side, {
      configurable: true,
      get(this: HTMLCanvasElement) {
        return get.call(this);
      },
      set(this: HTMLCanvasElement, value: number) {
        if (value !== get.call(this)) counts.reshapes++;
        const start = window.__labClock.realNow();
        set.call(this, value);
        counts.reshapeTime += window.__labClock.realNow() - start;
      },
    });
  }

  /** The counts since the last read, reset. */
  take(): { reshapes: number; reshapeTime: number; targets: number } {
    const taken = { reshapes: this.reshapes, reshapeTime: this.reshapeTime, targets: this.targets };
    this.reshapes = 0;
    this.reshapeTime = 0;
    this.targets = 0;
    return taken;
  }

  /** Every count's hook taken away. */
  stop(): void {
    delete (this.canvas as { width?: number }).width;
    delete (this.canvas as { height?: number }).height;
    THREE.RenderTarget.prototype.setSize = this.targetSetSize;
  }
}

/** The window's size at `share` of `full`. */
const sizeAt = (full: WindowSize, share: WindowSize): WindowSize => ({
  width: Math.round(full.width * share.width),
  height: Math.round(full.height * share.height),
});

/** One frame stepped, the browser let go after it; its time (ms, the browser's clock). */
async function timedFrame(lab: Lab): Promise<number> {
  const now = window.__labClock.realNow;
  const start = now();
  await lab.step(1);
  const took = now() - start;
  await window.__labClock.realFrame();
  return took;
}

/** One resize to `size` and the frame after it: what each cost and rebuilt. */
async function resizeOnce(lab: Lab, played: PlayedWindow, rebuilds: Rebuilds, size: WindowSize,
  timings: { canvas: Timing; composer: Timing }): Promise<ResizeCost> {
  rebuilds.take();
  timings.canvas.lap();
  timings.composer.lap();
  const event = played.resizeTo(size);
  const frame = await timedFrame(lab);
  return { event, frame, canvas: timings.canvas.lap(), composer: timings.composer.lap(), ...rebuilds.take() };
}

/** The median of `values`. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/** A resize's costs over the rounds, as a line. */
function costLine(label: string, costs: ResizeCost[]): string {
  const ms = (pick: (cost: ResizeCost) => number): string => median(costs.map(pick)).toFixed(1);
  const most = (pick: (cost: ResizeCost) => number): number => Math.max(...costs.map(pick));
  return `${label}: the event ${ms((c) => c.event)} ms, the frame after ${ms((c) => c.frame)} ms `
    + `(the canvas's resize ${ms((c) => c.canvas)}, its drawing buffer's ${ms((c) => c.reshapeTime)}, `
    + `the post chain's ${ms((c) => c.composer)}); `
    + `the drawing buffer set ${most((c) => c.reshapes)} times, ${most((c) => c.targets)} render targets resized`;
}

/** A quadrant luminance check on an RGBA bottom-up buffer or 2D top-down ImageData. */
function quadrantsLit(bytes: Uint8ClampedArray | Uint8Array, width: number, height: number): boolean {
  const halfW = Math.floor(width / 2), halfH = Math.floor(height / 2);
  let lit = 0;
  for (let q = 0; q < 4; q++) {
    const x0 = q & 1 ? halfW : 0, x1 = q & 1 ? width : halfW;
    const y0 = q & 2 ? halfH : 0, y1 = q & 2 ? height : halfH;
    let peak = 0;
    for (let y = y0; y < y1; y += 8) {
      for (let x = x0; x < x1; x += 8) {
        const k = (y * width + x) * 4;
        peak = Math.max(peak, bytes[k], bytes[k + 1], bytes[k + 2]);
      }
    }
    if (peak > 10) lit++;
  }
  return lit === 4;
}

/** Captures the PNG passed to `takePhoto()` without triggering a browser download. */
async function grabPhoto(lab: Lab): Promise<ImageBitmap> {
  const createUrl = URL.createObjectURL;
  const click = HTMLAnchorElement.prototype.click;
  const blobs = new Map<string, Blob>();
  URL.createObjectURL = (object: Blob | MediaSource): string => {
    const url = createUrl(object);
    if (object instanceof Blob) blobs.set(url, object);
    return url;
  };
  HTMLAnchorElement.prototype.click = function intercepted(this: HTMLAnchorElement): void {
    if (blobs.has(this.href)) return;
    click.call(this);
  };
  try {
    const saving = takePhoto();
    lab.drawing = true;
    await lab.step(1);
    const saved = await saving;
    return await createImageBitmap(saved.blob);
  } finally {
    lab.drawing = false;
    URL.createObjectURL = createUrl;
    HTMLAnchorElement.prototype.click = click;
    document.querySelector('#photo .ph-saved')?.classList.add('hidden');
  }
}

/** Verifies viewport crop, pixel parity, blood mask, photo crop, rotation and desktop fallback. */
async function checkScreenCanvas(lab: Lab, played: PlayedWindow, rebuilds: Rebuilds,
  full: WindowSize): Promise<{ lines: string[]; problems: string[] }> {
  const lines: string[] = [];
  const problems: string[] = [];
  const canvas = G.renderer.domElement;
  const step1 = sizeAt(full, STEPS[0]);

  holdScreenCanvas(true);
  played.resizeTo(step1);
  await lab.step(1);

  const game = document.getElementById('game');
  if (!game || getComputedStyle(game).overflow !== 'hidden') {
    problems.push(`#game container must hide overflow (got ${game ? getComputedStyle(game).overflow : 'missing'})`);
  }
  if (canvas.style.width !== `${full.width}px` || canvas.style.height !== `${full.height}px`) {
    problems.push(`step 1 canvas CSS size was ${canvas.style.width}x${canvas.style.height}, expected ${full.width}x${full.height}px`);
  }
  const pr = G.renderer.getPixelRatio();
  const fr1 = frameRect();
  const expectW1 = Math.min(canvas.width, Math.floor(step1.width * pr));
  const expectH1 = Math.min(canvas.height, Math.floor(step1.height * pr));
  if (fr1.width !== expectW1 || fr1.height !== expectH1 || fr1.bottom !== canvas.height - expectH1 || fr1.bottom <= 0) {
    problems.push(`step 1 frameRect was ${fr1.width}x${fr1.height} bottom=${fr1.bottom}, expected ${expectW1}x${expectH1} bottom=${canvas.height - expectH1}`);
  }

  // Pixel parity at identical G.time between screen-sized viewport and window-sized canvas
  const screenRaw = drawRaw(lab);
  holdScreenCanvas(false);
  const winRaw = drawRaw(lab);
  if (!screenRaw.bytes || !winRaw.bytes) {
    problems.push('pixel parity requires SDR byte readback');
  } else if (screenRaw.width !== winRaw.width || screenRaw.height !== winRaw.height) {
    problems.push(`parity size mismatch: screen ${screenRaw.width}x${screenRaw.height} vs window ${winRaw.width}x${winRaw.height}`);
  } else {
    let maxDiff = 0, diffCount = 0;
    const n = screenRaw.width * screenRaw.height;
    for (let i = 0; i < n; i++) {
      const k = i * 4;
      const d = Math.max(
        Math.abs(screenRaw.bytes[k] - winRaw.bytes[k]),
        Math.abs(screenRaw.bytes[k + 1] - winRaw.bytes[k + 1]),
        Math.abs(screenRaw.bytes[k + 2] - winRaw.bytes[k + 2]),
      );
      if (d > maxDiff) maxDiff = d;
      if (d > 2) diffCount++;
    }
    const qOk = quadrantsLit(screenRaw.bytes, screenRaw.width, screenRaw.height);
    if (!qOk) problems.push('screen-sized frame has an all-black quadrant');
    const diffShare = diffCount / Math.max(1, n);
    // GradeShader's 0.025 film-grain hash (0.025 * 255 ≈ 6.4) flips across 1-ULP vUv rounding when viewport Y shifts.
    if (maxDiff > 8 || diffShare > 0.005) problems.push(`parity diff ${(diffShare * 100).toFixed(3)}% (max channel ${maxDiff})`);
    lines.push(`step 1 parity: ${screenRaw.width}x${screenRaw.height}, max diff ${maxDiff}, diff ${(diffShare * 100).toFixed(3)}%`);
  }

  // Blood mask settled aspect on screen-sized step 1
  holdScreenCanvas(true);
  played.resizeTo(step1);
  drawRaw(lab);
  await lab.step(20);
  drawRaw(lab);
  const maskImg = bloodMask.image as { width: number; height: number };
  const maskAspect = maskImg.width / Math.max(1, maskImg.height);
  const winAspect = step1.width / Math.max(1, step1.height);
  if (Math.abs(maskAspect - winAspect) > 0.02) {
    problems.push(`bloodMask aspect ${maskAspect.toFixed(3)} did not match step 1 ${winAspect.toFixed(3)} (${maskImg.width}x${maskImg.height})`);
  }
  lines.push(`blood mask at step 1: ${maskImg.width}x${maskImg.height}`);

  // Photo crop at step 1
  const photo = await grabPhoto(lab);
  const pCanvas = document.createElement('canvas');
  pCanvas.width = photo.width; pCanvas.height = photo.height;
  const pCtx = pCanvas.getContext('2d')!;
  pCtx.drawImage(photo, 0, 0);
  const pPixels = pCtx.getImageData(0, 0, photo.width, photo.height).data;
  const photoOk = photo.width === fr1.width && photo.height === fr1.height && quadrantsLit(pPixels, photo.width, photo.height);
  if (!photoOk) problems.push(`photo crop at step 1 was ${photo.width}x${photo.height} (expected ${fr1.width}x${fr1.height}, all quadrants lit)`);
  photo.close();
  lines.push(`photo crop at step 1: ${pCanvas.width}x${pCanvas.height} (canvas ${canvas.width}x${canvas.height})`);

  // Rotation reallocates once to portrait
  const portrait: WindowSize = { width: full.height, height: full.width };
  played.setScreen(portrait);
  rebuilds.take();
  played.resizeTo(portrait);
  const rot = rebuilds.take();
  const frRot = frameRect();
  if (rot.reshapes !== 2 || canvas.width !== Math.floor(portrait.width * pr) || canvas.height !== Math.floor(portrait.height * pr) || frRot.bottom !== 0) {
    problems.push(`rotation reshapes=${rot.reshapes} canvas=${canvas.width}x${canvas.height} bottom=${frRot.bottom}`);
  }
  lines.push(`rotation to portrait: ${canvas.width}x${canvas.height}, drawing buffer set ${rot.reshapes} times`);

  // Restore landscape and verify desktop fallback resizes to window
  played.setScreen(full);
  played.resizeTo(full);
  holdScreenCanvas(null);
  played.resizeTo(step1);
  if (canvas.width !== expectW1 || canvas.height !== expectH1) {
    problems.push(`desktop fallback at step 1 was ${canvas.width}x${canvas.height}, expected ${expectW1}x${expectH1}`);
  }
  lines.push(`desktop fallback at step 1: ${canvas.width}x${canvas.height}`);
  return { lines, problems };
}

/** The window resized into full screen as the phone's was, `rounds` times, and back each time. */
export async function resize(lab: Lab, options: ResizeOptions): Promise<Report> {
  const full: WindowSize = { width: window.innerWidth, height: window.innerHeight };
  const steady: number[] = [];
  const byStep: ResizeCost[][] = STEPS.map(() => []);
  const toFull: ResizeCost[] = [];
  const problems: string[] = [];
  const drawing = lab.drawing;
  lab.drawing = true;
  const played = new PlayedWindow();
  const rebuilds = new Rebuilds();
  const timings = {
    canvas: timeCalls(G.renderer, 'setSize'),
    composer: timeCalls(EffectComposer.prototype, 'setSize'),
  };
  let extraLines: string[] = [];
  try {
    holdScreenCanvas(!options.canary);
    for (let i = 0; i < 4; i++) await timedFrame(lab);
    for (let round = 0; round < options.rounds; round++) {
      steady.push(await timedFrame(lab));
      for (const [i, step] of STEPS.entries()) {
        byStep[i].push(await resizeOnce(lab, played, rebuilds, sizeAt(full, step), timings));
      }
      toFull.push(await resizeOnce(lab, played, rebuilds, full, timings));
    }
    const groups: [string, ResizeCost[]][] = [
      ...byStep.map((costs, i): [string, ResizeCost[]] => [`step ${i + 1}`, costs]),
      ['full screen', toFull],
    ];
    for (const [label, costs] of groups) {
      const most = Math.max(...costs.map((c) => c.reshapes));
      if (most > 0) problems.push(`${label}: the drawing buffer was reallocated (${most} times)`);
    }
    if (!options.canary) {
      lab.drawing = false;
      const checked = await checkScreenCanvas(lab, played, rebuilds, full);
      extraLines = checked.lines;
      problems.push(...checked.problems);
    }
  } finally {
    timings.canvas.stop();
    timings.composer.stop();
    rebuilds.stop();
    played.restore();
    holdScreenCanvas(null);
    window.dispatchEvent(new Event('resize'));
    await lab.step(1);
    lab.drawing = drawing;
  }
  const lines = [`${full.width}x${full.height} css px at ${window.devicePixelRatio}, ${options.rounds} rounds; `
    + `a frame with no resize ${median(steady).toFixed(1)} ms`];
  for (const [i, costs] of byStep.entries()) lines.push(costLine(`step ${i + 1}`, costs));
  lines.push(costLine('full screen', toFull));
  lines.push(...extraLines);
  if (options.canary) {
    const caught = problems.some((problem) => problem.includes('drawing buffer was reallocated'));
    lines.push(`canaries: ${caught ? '1 of 1 caught' : '0 of 1 caught'}`);
    return {
      text: lines.join('\n'),
      problems: caught ? [] : ['canary: expected drawing-buffer reallocations into full screen went unseen'],
    };
  }
  return { text: lines.join('\n'), problems };
}
