// Which renderer draws the game: WebGL, unless this page's address asks for WebGPU, a trial not yet as fast. The pause
// menu opens it at its own address and nothing is kept, so the game's plain address always loads WebGL. Read as the
// page loads (the renderer is made once, before anything is built): `?renderer=`, `&meshlets=1`, `&lights=each`.

/** a renderer the pause menu offers */
export type RendererKind = 'webgl' | 'webgpu';

/** what the address says of the renderer */
const ADDRESS_PARAMS = ['renderer', 'meshlets', 'lights'];

const params = new URLSearchParams(location.search);

/** the renderer this page runs: the address's (`webgpu`, `webgpu-gl` its WebGL 2 backend), else WebGL */
const asked = params.get('renderer');
export const RUNNING = {
  /** three's WebGPURenderer draws it */
  webgpu: asked === 'webgpu' || asked === 'webgpu-gl',
  /** on WebGPURenderer's WebGL 2 backend */
  webgpuOnGl: asked === 'webgpu-gl',
  /** three's GPU-driven meshlets */
  meshlets: params.get('meshlets') === '1',
  /** the point lights written out in full (three's own, to compare) */
  lightsEach: params.get('lights') === 'each',
};

/** This page's address on `kind`, its other parameters kept: WebGPU's with its meshlets, the fastest way it has run. */
export function addressOn(kind: RendererKind): string {
  const url = new URL(location.href);
  for (const name of ADDRESS_PARAMS) url.searchParams.delete(name);
  if (kind === 'webgpu') {
    url.searchParams.set('renderer', 'webgpu');
    url.searchParams.set('meshlets', '1');
  }
  return url.href;
}
