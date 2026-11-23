// The Rust engine (the plain address where WebGPU is, `?renderer=rust`; core/rendererChoice.ts): Bulwark, our own WebGPU renderer in Rust and
// WebAssembly (`pkg/`, built from the private repository VictorZakharov/bulwark), draws the game's scene on a canvas
// of its own laid over three's. The game still boots on three's WebGPU renderer, which goes on making what the
// engine doesn't yet (warm-ups, portraits, the overlays); only the frame's scene is the engine's. Loaded where the
// browser has WebGPU; where it hasn't, or the engine doesn't start, the loading screen says so (no other renderer).
import type * as THREE from 'three';
import { Bridge, TUNE, type Grade } from './bridge';
import { perfClock } from '../core/perfClock';
import { cullForEngine } from '../world/doorways';
import { AHEAD, PIPELINES, pipelinesAside } from './pipelinesAside';
import { deviceSaid, fault, keepWhatsSaid, watchFrame } from './said';

/** the frames drawn since the loading screen left */
let loadedFrames = 0;

/** How the trial went, for the lab and the console (`window.__rust`). */
export const RUST = {
  bridge: null as Bridge | null,
  tune: TUNE,
  /** the boot's parts, ms: the module fetched and compiled, the device and pipelines made, the first frame (every
   *  geometry, map and material handed over) */
  boot: { wasmMs: 0, deviceMs: 0, firstFrameMs: 0 },
  frames: 0,
  /** whether the loading screen has left (set by ui/perfHud.ts, which knows: this module can't import the page's
   *  UI, a cycle through the renderer): under it a frame may take long, handing the places over ahead */
  loaded: false,
  /** whether what the game hangs on three's render of the scene is run (the world's culling by cells, the kept
   *  shadow maps' draws): three's own work, which the engine has no use for */
  hooks: false,
  /** the last frame's render, whoever drew it (core/renderer.ts `render`), ms */
  renderMs: 0,
  failed: '',
  /** the scene's pipelines: asked for, and still compiling aside (`pipelinesAside.ts`) */
  pipelines: PIPELINES,
  /** the engine's device as it was made, for a report */
  device: deviceSaid,
  /** the next frame is written down as a tape, its maps no larger than this a side (0: none asked); and the tape */
  captureNext: 0,
  tape: null as Blob | null,
};

let canvas: HTMLCanvasElement | null = null;

let resize: ((width: number, height: number) => void) | null = null;

/**
 * The scene's MSAA samples told to the engine as the game sets them (core/renderer.ts `fitSamples`), ahead of its
 * first frame: told by that frame, the engine had made every pipeline the loading bars asked for at its own 4
 * samples, and made them all again at the level's as the lobby showed, each compiled aside with nothing waiting
 * for it and its draws left out meanwhile: on a phone the village's ground was missing as it loaded, the pale
 * sky's colour in its place (from play: "when village loads, the ground is white").
 */
export function rustSamples(samples: number): void {
  samplesWanted = samples;
  RUST.bridge?.levels.samplesAhead(samples);
}
/** the samples the game last asked for, for an engine not made yet */
let samplesWanted: number | null = null;

/** Whether the level is a plain one (`plainLit`), told to the engine as the game sets it, ahead of its first frame as
 *  the samples are: a boot at Very low made the whole lit shaders' pipelines at the warm-ups and every one again for
 *  the plain levels' as the lobby showed (`plainSet.ts`). */
export function rustPlain(lite: boolean): void {
  liteWanted = lite;
  RUST.bridge?.levels.plainAhead(lite);
}
/** whether the level the game last asked for is a plain one, for an engine not made yet */
let liteWanted: boolean | null = null;

/** whether the engine's lit shaders are being switched to the other making, the frames still drawn by the one before
 *  (Auto judges none of them: `main.ts`) */
export const rustSwitching = (): boolean => RUST.bridge?.levels.plainSwitching ?? false;

/** The engine made on a canvas of its own over `under`, three's. A failure throws: nothing else draws the game. */
export async function bootRust(under: HTMLCanvasElement): Promise<void> {
  try {
    const began = performance.now();
    const { default: init, Engine } = await import('./pkg/bulwark');
    const wasm = await init();
    const loaded = performance.now();
    canvas = document.createElement('canvas');
    canvas.id = 'rust-canvas';
    canvas.width = under.width;
    canvas.height = under.height;
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none';
    // (under three's canvas, which the engine's frames leave clear but for the world's overlays)
    under.style.position = 'relative';
    under.before(canvas);
    const made = canvas;
    keepWhatsSaid();
    const engine = await pipelinesAside(() => Engine.create(made));
    const bridge = new Bridge(engine, wasm);
    RUST.bridge = bridge;
    if (samplesWanted !== null) bridge.levels.samplesAhead(samplesWanted);
    if (liteWanted !== null) bridge.levels.plainAhead(liteWanted);
    AHEAD.prepare = (objects) => bridge.ahead.prepare(objects);
    AHEAD.bakeLamps = (casters, lamps) => bridge.bakeLamps(casters, lamps);
    resize = (width, height) => engine.resize(width, height);
    RUST.boot.wasmMs = loaded - began;
    RUST.boot.deviceMs = performance.now() - loaded;
    (window as unknown as { __rust: typeof RUST }).__rust = RUST;
  } catch (error) {
    RUST.failed = String(error);
    fault('the engine did not start', String(error));
    canvas?.remove();
    canvas = null;
    // (nothing else draws the game: the boot fails here, and the loading screen says why)
    throw new Error(`the engine did not start: ${String(error)}`);
  }
}

/**
 * The engine's frame as a canvas the size of `like` (three's, which a picture's taker measures by): for a picture
 * taken in the frame's own task, while the engine's canvas still holds it (a photo, a bug report's shot). With
 * `over`, three's canvas laid over it: the world's overlays. Null if the engine isn't drawing.
 */
export function rustFrame(like: HTMLCanvasElement, over: boolean): HTMLCanvasElement | null {
  if (!RUST.bridge || !canvas) return null;
  const out = document.createElement('canvas');
  out.width = like.width;
  out.height = like.height;
  const context = out.getContext('2d');
  if (!context) return null;
  context.drawImage(canvas, 0, 0, out.width, out.height);
  if (over) context.drawImage(like, 0, 0);
  return out;
}

/** The frame's scene drawn by the engine at `width` by `height` pixels. Nothing else draws it: with no engine
 *  (the boot throws where it doesn't start) this throws too. */
export function drawRust(scene: THREE.Scene, camera: THREE.PerspectiveCamera, time: number, width: number, height: number,
  renderer: THREE.WebGLRenderer, grade?: Grade): void {
  const bridge = RUST.bridge;
  if (!bridge || !canvas) throw new Error('drawRust: the engine has not started');
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    resize?.(width, height);
  }
  const began = perfClock.now();
  // (what the game hangs on three's render of the scene: the world's culling, the crowds' rows)
  type Hook = (renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, target: null) => void;
  if (RUST.hooks) (scene.onBeforeRender as unknown as Hook)(renderer, scene, camera, null);
  // (of those hooks the doorways' cull alone, which leaves nothing between its two halves: `world/doorways.ts`)
  const shown = !RUST.hooks && TUNE.doorways ? cullForEngine(camera) : null;
  if (RUST.captureNext) {
    RUST.tape = bridge.capture(width, height, RUST.captureNext, scene, camera, time, renderer, grade);
    RUST.captureNext = 0;
  } else {
    bridge.draw(scene, camera, time, renderer, grade);
    const budget = RUST.loaded ? TUNE.ahead : TUNE.aheadLoading;
    if (budget > 0) bridge.ahead.walk(scene, budget);
  }
  shown?.();
  if (RUST.hooks) (scene.onAfterRender as unknown as Hook)(renderer, scene, camera, null);
  if (RUST.frames++ === 0) RUST.boot.firstFrameMs = perfClock.now() - began;
  // (the frame itself checked for black a few times after the load: `said.ts`)
  if (RUST.loaded) watchFrame(canvas, ++loadedFrames);
}
