// Where the meadow's grass is drawn, as points in the world (tools/lab's `village --only grassNotThroughProps`): the
// grass alone drawn through the game's camera, by its own programs (its blades placed, bent, cut and held under what
// stands over them as each frame draws them), into a target with a depth of its own, its depth read back and each
// drawn pixel put back into the world. Read so, a measure meets the grass as drawn, wide cards and far sheets and all,
// not the map that holds it down: read by the map alone, a check passed while short tips stood out of a seat log's top
// from above (#679, "Not fixed").
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';

/** the layer the grass is drawn on alone (one under the pick's: nothing of the game's is on it) */
const GRASS_LAYER = 30;

/** A pass that copies a depth texture's depth into a float target's red. */
function depthCopy(depth: THREE.DepthTexture): { scene: THREE.Scene; camera: THREE.OrthographicCamera; material: THREE.ShaderMaterial } {
  const material = new THREE.ShaderMaterial({
    uniforms: { uDepth: { value: depth } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform sampler2D uDepth; varying vec2 vUv; void main() { gl_FragColor = vec4(texture2D(uDepth, vUv).r, 0.0, 0.0, 1.0); }',
    depthTest: false,
    depthWrite: false,
  });
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  return { scene, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), material };
}

/**
 * The world points the grass is drawn at through `camera`, a pixel each of an `across` by `down` target (the grass
 * alone: nothing hides it, so what stands behind a prop is read too, and kept out by the measure by where it is).
 */
export function grassDrawnAt(lab: Lab, camera: THREE.PerspectiveCamera, across: number, down: number): THREE.Vector3[] {
  const renderer = G.renderer;
  const meadow = G.arena.village!.meadow;
  const meshes: THREE.Mesh[] = [];
  meadow.traverse((object) => {
    if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh);
  });
  const onLayer = meshes.map((mesh) => mesh.layers.isEnabled(GRASS_LAYER));
  const depth = new THREE.DepthTexture(across, down, THREE.FloatType);
  const target = new THREE.WebGLRenderTarget(across, down, { depthTexture: depth });
  const read = new THREE.WebGLRenderTarget(across, down, { type: THREE.FloatType });
  const copy = depthCopy(depth);
  const layers = camera.layers.mask;
  const background = G.scene.background;
  const shadows = renderer.shadowMap.autoUpdate;
  const before = renderer.getRenderTarget();
  const drawing = lab.drawing;
  const pixels = new Float32Array(across * down * 4);
  try {
    lab.drawing = true;
    for (const mesh of meshes) mesh.layers.enable(GRASS_LAYER);
    camera.layers.set(GRASS_LAYER);
    G.scene.background = null;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(G.scene, camera);
    renderer.setRenderTarget(read);
    renderer.render(copy.scene, copy.camera);
    renderer.readRenderTargetPixels(read, 0, 0, across, down, pixels);
  } finally {
    lab.drawing = drawing;
    meshes.forEach((mesh, k) => {
      if (!onLayer[k]) mesh.layers.disable(GRASS_LAYER);
    });
    camera.layers.mask = layers;
    G.scene.background = background;
    renderer.shadowMap.autoUpdate = shadows;
    renderer.setRenderTarget(before);
    target.dispose();
    read.dispose();
    depth.dispose();
    copy.material.dispose();
  }
  return pointsOf(pixels, camera, across, down);
}

/** Each drawn pixel's point in the world (a depth under 1: the far plane is nothing drawn). */
function pointsOf(pixels: Float32Array, camera: THREE.PerspectiveCamera, across: number, down: number): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  camera.updateMatrixWorld();
  for (let row = 0; row < down; row++) {
    for (let column = 0; column < across; column++) {
      const depth = pixels[(row * across + column) * 4];
      if (depth >= 1) continue;
      const x = ((column + 0.5) / across) * 2 - 1;
      const y = ((row + 0.5) / down) * 2 - 1;
      points.push(new THREE.Vector3(x, y, depth * 2 - 1).unproject(camera));
    }
  }
  return points;
}
