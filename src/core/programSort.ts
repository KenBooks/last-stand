// The opaque draws sorted by program before material, for the CPU. three sorts them by material (its id, the order
// materials were made in), and many materials share a program (a kit's lit materials, each its own colour): in the
// village's frame it switched program 80 to 180 times between some 50, and each switch sets every uniform the program
// reads that the material's don't (the camera's, the lights', the fog's) again, the largest part of the render on the
// CPU (`lab perf --village --profile`, its "programs switched"). Sorted by program the draws of a program are drawn
// one after another, a material's still together. On the GPU it was within the noise (`core/AGENTS.md`'s point
// lights), which is why it's for the CPU. WebGL's alone.
import * as THREE from 'three';

/** A render list's item, as three's opaque sort reads it (three r187's `painterSortStable`). */
interface Item {
  groupOrder: number;
  renderOrder: number;
  material: THREE.Material;
  materialVariant: number;
  z: number;
  id: number;
}

/** Sorts `renderer`'s opaque draws by their program before their material. */
export function opaqueByProgram(renderer: THREE.WebGLRenderer): void {
  const programOf = (material: THREE.Material): number => {
    const made = renderer.properties.get(material) as { currentProgram?: { id: number } };
    return made.currentProgram?.id ?? 0;
  };
  const byProgram = (a: Item, b: Item): number => {
    if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
    if (a.renderOrder !== b.renderOrder) return a.renderOrder - b.renderOrder;
    if (a.material !== b.material) {
      const apart = programOf(a.material) - programOf(b.material);
      if (apart !== 0) return apart;
      return a.material.id - b.material.id;
    }
    if (a.materialVariant !== b.materialVariant) return a.materialVariant - b.materialVariant;
    if (a.z !== b.z) return a.z - b.z;
    return a.id - b.id;
  };
  renderer.setOpaqueSort(byProgram as never);
}
