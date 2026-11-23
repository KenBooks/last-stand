// What draws the game: our Rust engine (`src/engine`, Bulwark), on WebGPU, and nothing else. There is no other
// renderer to fall back to: a browser without WebGPU, or one whose GPU refuses the engine, is told so on the loading
// screen (`ui/loading.ts`). three.js's WebGPURenderer stays as the engine's host: it makes what the engine doesn't
// draw yet (the world's labels and the outline on a canvas over the engine's, the portraits).

/** Whether this browser offers WebGPU at all (an adapter may still refuse: the engine's boot says). */
export function hasWebGpu(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator && !!navigator.gpu;
}

/** What the page runs. Constants now, read where code of the renderers before the engine is still being taken out. */
export const RUNNING: { webgpu: boolean; rust: boolean; webgpuOnGl: boolean; meshlets: boolean; lightsEach: boolean } = {
  /** three's WebGPURenderer is the page's host */
  webgpu: true,
  /** the frame's scene is drawn by the engine */
  rust: true,
  /** three's WebGL 2 backend: never */
  webgpuOnGl: false,
  /** three's GPU-driven meshlets: never */
  meshlets: false,
  /** three's point lights written out in full: never */
  lightsEach: false,
};
