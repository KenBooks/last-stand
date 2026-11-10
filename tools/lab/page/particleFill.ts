// The pixels the particles cover in a frame (tools/lab): each live particle of the game's two pools as its shader
// draws it, a disc `aSize * uScale / depth` pixels across (its `gl_PointSize`, at most the GPU's largest point) in the
// scene's target, every layer counted. That is the fill a phone's GPU pays for them, which a desktop's GPU times don't
// show. The scale is the game's own (`uScale`, as the pool's material has it this frame): sized by the canvas's height
// while drawn into a scene of fewer pixels, #243's phone's particles were 3 times as wide as meant, 9 times the fill.
import * as THREE from 'three';
import { G } from '../../../src/state';
import { particles } from '../../../src/fx/particles';
import * as renderer from '../../../src/core/renderer';
import { WEBGPU } from '../../../src/core/webgpu';

type Pool = typeof particles.glow;

const _at = new THREE.Vector3();
const _onScreen = new THREE.Vector3();

/** The GPU's largest point, px: none on WebGPU, whose particles are quads of the same size (`fx/particleNodes.ts`). */
function largestPoint(): number {
  if (WEBGPU) return Infinity;
  const gl = G.renderer.getContext();
  const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array;
  return range[1];
}

/** The pixels `pool`'s live points cover in a target `height` px high, those whose disc is in view, every layer. */
function poolFill(pool: Pool, largest: number, height: number): number {
  const scale = pool.mat.uniforms.uScale.value as number;
  const camera = G.camera;
  let fill = 0;
  for (let i = 0; i < pool.count; i++) {
    _at.fromArray(pool.pos, i * 3).applyMatrix4(camera.matrixWorldInverse);
    const depth = -_at.z;
    if (depth <= camera.near) continue;
    const across = Math.min(largest, (pool.size[i] * scale) / depth);
    // (in view: its middle within the view, widened by the disc's half, as a share of the view's height)
    _onScreen.copy(_at).applyMatrix4(camera.projectionMatrix);
    const reach = across / height;
    if (Math.abs(_onScreen.x) > 1 + reach * 2 || Math.abs(_onScreen.y) > 1 + reach * 2) continue;
    fill += Math.PI * (across / 2) ** 2;
  }
  return fill;
}

/** The pixels the particles cover this frame, every layer, and the scene's pixels they're drawn into. */
export function particleFill(): { fill: number; pixels: number } {
  const target = renderer.sceneTarget();
  const largest = largestPoint();
  const fill = poolFill(particles.glow, largest, target.height) + poolFill(particles.smoke, largest, target.height);
  return { fill, pixels: target.width * target.height };
}
