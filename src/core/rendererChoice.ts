// What draws the game: our Rust engine (`src/engine`, Bulwark), on WebGPU, and nothing else. There is no other
// renderer to fall back to: a browser without WebGPU, or one whose GPU refuses the engine, is told so on the loading
// screen (`ui/loading.ts`). three.js's WebGPURenderer stays as the engine's host: it makes what the engine doesn't
// draw yet (the world's labels and the outline on a canvas over the engine's, the portraits).

/** Whether this browser offers WebGPU at all (an adapter may still refuse: the engine's boot says). */
export function hasWebGpu(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator && !!navigator.gpu;
}
