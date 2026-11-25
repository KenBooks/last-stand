// The village's grass counted as it was last drawn: what `lab village`'s checks of it share.
import type * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { RUST } from '../../../src/engine';

/** how many frames the engine's count of the blades it kept takes to come back from the GPU, with some to spare */
const COUNT_FRAMES = 6;

/** The vertices the meadow's rings list in the frame just drawn: each ring's blades listed times a blade's points.
 *  The engine places each blade listed and draws only those it keeps (`grassShaded` has those). */
export function grassVertices(): number {
  let vertices = 0;
  G.arena.village!.meadow.traverse((part) => {
    const mesh = part as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry as THREE.InstancedBufferGeometry;
    vertices += geometry.instanceCount * geometry.attributes.position.count;
  });
  return vertices;
}

/** The grass as the engine drew it: the blades its pass kept of those it placed. */
export interface GrassShaded {
  /** the blades drawn, and those placed */
  kept: number;
  counted: number;
  /** the vertices shaded: those listed, at the share of the blades kept */
  vertices: number;
}

/** The grass the engine shades as the frame stands, drawn `COUNT_FRAMES` frames for its count to come back (the
 *  browser let go after each: a count comes back on its own time, never within a step). Its vertices are those the
 *  rings list at the share kept: a ring of more points a blade kept as often as the others. */
export async function grassShaded(lab: Lab): Promise<GrassShaded> {
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    for (let frame = 0; frame < COUNT_FRAMES; frame++) {
      await lab.step(1);
      await window.__labClock.realFrame();
    }
  } finally {
    lab.drawing = drawing;
  }
  const kept = RUST.bridge.stats.fieldKept;
  const counted = RUST.bridge.stats.fieldCounted;
  const share = counted > 0 ? kept / counted : 0;
  return { kept, counted, vertices: Math.round(grassVertices() * share) };
}
