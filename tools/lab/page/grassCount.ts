// The village's grass counted as it was last drawn: what `lab village`'s checks of it share.
import type * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { RUST } from '../../../src/engine';

/** the fewest frames drawn before the engine's count of the blades it kept is read: it comes back from the GPU a few
 *  frames late */
const COUNT_FRAMES = 6;
/** the readings in a row that must agree for the count to stand: under the suite's eight sessions it came back later
 *  than six frames, and High read 527k vertices over the shoulder, then 635k once the switches had passed */
const STEADY_READS = 3;
/** the most frames drawn waiting for it */
const MOST_FRAMES = 60;

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

/** The engine's count of the blades it kept and placed, as last read back. */
function countRead(): { kept: number; counted: number } {
  const stats = RUST.bridge?.stats;
  if (!stats) throw new Error('lab: grass: no engine drawing the frame (RUST.bridge)');
  return { kept: stats.fieldKept, counted: stats.fieldCounted };
}

/** The grass the engine shades as the frame stands, drawn until its count has come back and held `STEADY_READS`
 *  frames in a row (the browser let go after each: a count comes back on its own time, never within a step). Its
 *  vertices are those the rings list at the share kept: a ring of more points a blade kept as often as the others. */
export async function grassShaded(lab: Lab): Promise<GrassShaded> {
  const drawing = lab.drawing;
  lab.drawing = true;
  let read = countRead();
  try {
    let same = 0;
    for (let frame = 0; frame < MOST_FRAMES; frame++) {
      await lab.step(1);
      await window.__labClock.realFrame();
      const now = countRead();
      const held = now.kept === read.kept && now.counted === read.counted;
      same = held ? same + 1 : 0;
      read = now;
      if (frame + 1 >= COUNT_FRAMES && same >= STEADY_READS) break;
    }
  } finally {
    lab.drawing = drawing;
  }
  const share = read.counted > 0 ? read.kept / read.counted : 0;
  return { ...read, vertices: Math.round(grassVertices() * share) };
}
