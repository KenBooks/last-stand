// The village's grass counted as it was last drawn: what `lab village`'s checks of it share.
import type * as THREE from 'three';
import { G } from '../../../src/state';

/** The vertices the meadow's rings shade in the frame just drawn: each ring's blades listed times a blade's points. */
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
