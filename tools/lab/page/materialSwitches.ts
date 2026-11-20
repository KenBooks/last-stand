// The materials a frame switches between, counted draw by draw as three is given them (`renderBufferDirect`). A draw
// whose material isn't the last draw's makes three set the material's uniforms again (`setProgram`'s
// `refreshMaterial`: its own values and the shadow maps' matrices, flattened each time), where a draw of the same
// material sets its object's matrices alone. In the hall of heroes that upload was a quarter of the render's work on
// the CPU (`lab perf --village --profile=setProgram`). Beside the programs switched (`programSwitches.ts`), it says
// how much of it a merge of materials could save.
import type * as THREE from 'three';
import { G } from '../../../src/state';
import { WEBGPU } from '../../../src/core/webgpu';

/** the switches counted since the renderer was first wrapped */
let switches = 0;
/** the material the last draw was given */
let last: THREE.Material | null = null;
/** the renderer wrapped, so it's wrapped once */
let wrapped: THREE.WebGLRenderer | null = null;

/** Starts counting on the renderer's draws (WebGL alone: WebGPU's draws go another way). */
function wrap(): void {
  if (WEBGPU) return;
  const renderer = G.renderer as THREE.WebGLRenderer;
  if (wrapped === renderer) return;
  const draw = renderer.renderBufferDirect.bind(renderer);
  renderer.renderBufferDirect = (camera, scene, geometry, material, object, group) => {
    if (material !== last) switches++;
    last = material;
    draw(camera, scene, geometry, material, object, group);
  };
  wrapped = renderer;
}

/** The switches counted so far, a running count to take differences of (0 on WebGPU). */
export function materialSwitches(): number {
  wrap();
  return switches;
}
