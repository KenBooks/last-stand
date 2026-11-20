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
import { timeCalls, type Timing } from './timing';

/** what `resize` takes */
export interface ResizeOptions {
  rounds: number;
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

/** The window's size played by the page: what the game reads as its `innerWidth` and `innerHeight`. */
class PlayedWindow {
  private size: WindowSize = { width: window.innerWidth, height: window.innerHeight };
  /** the window's own accessors (a global's attributes are its own properties, not its prototype's) */
  private readonly own = {
    width: Object.getOwnPropertyDescriptor(window, 'innerWidth'),
    height: Object.getOwnPropertyDescriptor(window, 'innerHeight'),
  };

  constructor() {
    Object.defineProperty(window, 'innerWidth', { configurable: true, get: () => this.size.width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => this.size.height });
  }

  /** The window at `size`, its resize event sent as the browser sends it; that event's work (ms). */
  resizeTo(size: WindowSize): number {
    this.size = size;
    const now = window.__labClock.realNow;
    const start = now();
    window.dispatchEvent(new Event('resize'));
    return now() - start;
  }

  /** The window's own size again. */
  restore(): void {
    if (this.own.width) Object.defineProperty(window, 'innerWidth', this.own.width);
    if (this.own.height) Object.defineProperty(window, 'innerHeight', this.own.height);
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

/** The window resized into full screen as the phone's was, `rounds` times, and back each time. */
export async function resize(lab: Lab, options: ResizeOptions): Promise<Report> {
  const full: WindowSize = { width: window.innerWidth, height: window.innerHeight };
  const steady: number[] = [];
  const byStep: ResizeCost[][] = STEPS.map(() => []);
  const toFull: ResizeCost[] = [];
  const drawing = lab.drawing;
  lab.drawing = true;
  const played = new PlayedWindow();
  const rebuilds = new Rebuilds();
  const timings = {
    canvas: timeCalls(G.renderer, 'setSize'),
    composer: timeCalls(EffectComposer.prototype, 'setSize'),
  };
  try {
    for (let i = 0; i < 4; i++) await timedFrame(lab);
    for (let round = 0; round < options.rounds; round++) {
      steady.push(await timedFrame(lab));
      for (const [i, step] of STEPS.entries()) {
        byStep[i].push(await resizeOnce(lab, played, rebuilds, sizeAt(full, step), timings));
      }
      toFull.push(await resizeOnce(lab, played, rebuilds, full, timings));
    }
  } finally {
    timings.canvas.stop();
    timings.composer.stop();
    rebuilds.stop();
    played.restore();
    window.dispatchEvent(new Event('resize'));
    await lab.step(1);
    lab.drawing = drawing;
  }
  const lines = [`${full.width}x${full.height} css px at ${window.devicePixelRatio}, ${options.rounds} rounds; `
    + `a frame with no resize ${median(steady).toFixed(1)} ms`];
  for (const [i, costs] of byStep.entries()) lines.push(costLine(`step ${i + 1}`, costs));
  lines.push(costLine('full screen', toFull));
  return { text: lines.join('\n'), problems: [] };
}
