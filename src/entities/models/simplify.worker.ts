// The heroes' geometries' fewer triangles made off the page (`shadowDetail.ts`): a piece's simplification is one call
// of 1 to 15 ms (a hero's hair, 32k triangles, the longest), which no slice of a frame could cut, and on the page the
// lobby's first seconds held frames 12 to 16 ms for it (`npm run lab -- lobbystart`).
import { MeshoptSimplifier } from 'three/addons/libs/meshopt_simplifier.module.js';
import { simplifiedIndex, type Detail } from './simplifyIndex';

/** A geometry to simplify: its id on the page, its index and positions (copies, handed over), and what to keep. */
export interface SimplifyAsked {
  id: number;
  index: Uint32Array;
  positions: Float32Array;
  detail: Detail;
}

/** A geometry's fewer triangles, or null where it gives up too few. */
export interface SimplifyMade {
  id: number;
  fewer: Uint32Array | null;
}

const ready = MeshoptSimplifier.ready;

self.onmessage = async (event: MessageEvent<SimplifyAsked>) => {
  await ready;
  const { id, index, positions, detail } = event.data;
  const fewer = simplifiedIndex(MeshoptSimplifier, index, positions, detail);
  const made: SimplifyMade = { id, fewer };
  (self as unknown as Worker).postMessage(made, fewer ? [fewer.buffer] : []);
};
