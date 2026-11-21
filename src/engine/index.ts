// The Rust engine's trial (`?renderer=rust`, core/rendererChoice.ts): Bulwark, our own WebGPU renderer in Rust and
// WebAssembly (`pkg/`, built from the private repository VictorZakharov/bulwark), draws the game's scene on a canvas
// of its own laid over three's. The game still boots on three's WebGPU renderer, which goes on making what the
// engine doesn't yet (warm-ups, portraits, the overlays); only the frame's scene is the engine's. An experiment:
// nothing of it is loaded unless the address asks.
import type * as THREE from 'three';
import { Bridge, TUNE } from './bridge';
import { perfClock } from '../core/perfClock';

/** How the trial went, for the lab and the console (`window.__rust`). */
export const RUST = {
  /** false hands the frame back to three, to compare on the same page */
  on: true,
  bridge: null as Bridge | null,
  tune: TUNE,
  /** the boot's parts, ms: the module fetched and compiled, the device and pipelines made, the first frame (every
   *  geometry, map and material handed over) */
  boot: { wasmMs: 0, deviceMs: 0, firstFrameMs: 0 },
  frames: 0,
  /** whether what the game hangs on three's render of the scene is run (the world's culling by cells, the kept
   *  shadow maps' draws): three's own work, which the engine has no use for */
  hooks: false,
  /** the last frame's render, whoever drew it (core/renderer.ts `render`), ms */
  renderMs: 0,
  failed: '',
};

let canvas: HTMLCanvasElement | null = null;
let resize: ((width: number, height: number) => void) | null = null;

/** The engine made on a canvas of its own over `under`, three's. A failure leaves three drawing. */
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
    const engine = await Engine.create(canvas);
    RUST.bridge = new Bridge(engine, wasm);
    resize = (width, height) => engine.resize(width, height);
    RUST.boot.wasmMs = loaded - began;
    RUST.boot.deviceMs = performance.now() - loaded;
    (window as unknown as { __rust: typeof RUST }).__rust = RUST;
  } catch (error) {
    RUST.failed = String(error);
    console.error('The Rust engine did not start; three draws the game.', error);
    canvas?.remove();
    canvas = null;
  }
}

/** The frame's scene drawn by the engine at `width` by `height` pixels; false if three is to draw it. */
export function drawRust(scene: THREE.Scene, camera: THREE.PerspectiveCamera, time: number, width: number, height: number,
  renderer: THREE.WebGLRenderer): boolean {
  const bridge = RUST.bridge;
  if (!bridge || !canvas) return false;
  if (!RUST.on) return false;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    resize?.(width, height);
  }
  const began = perfClock.now();
  // (what the game hangs on three's render of the scene: the world's culling, the crowds' rows)
  type Hook = (renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, target: null) => void;
  if (RUST.hooks) (scene.onBeforeRender as unknown as Hook)(renderer, scene, camera, null);
  bridge.draw(scene, camera, time, renderer);
  if (RUST.hooks) (scene.onAfterRender as unknown as Hook)(renderer, scene, camera, null);
  if (RUST.frames++ === 0) RUST.boot.firstFrameMs = perfClock.now() - began;
  return true;
}
