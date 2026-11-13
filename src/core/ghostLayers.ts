// The count of ghosts lying over each pixel (core/seeThrough.ts `countGhosts`, `LAYERS_SHARE_GLSL`): what thins by
// blending, drawn again before the scene into a target of the scene's size, one a ghost, so where a roof, a gable and a
// wall lie one over another before the hero each keeps less, and all of them hide him as one does (the owner's choice,
// "Fewer layers thin less", where they overlap alone). WebGL's alone: on WebGPU nothing is counted, as it was.
import * as THREE from 'three';
import { GHOST_COUNT, GHOSTS_MOST, ghostsCounted } from './seeThrough';
import { GHOST_COUNT_LAYER } from './layers';

/** the count, a step of 1 / `GHOSTS_MOST` a ghost, made as it's first drawn */
let target: THREE.WebGLRenderTarget | null = null;
/** whether the count holds anything: cleared once when it's no longer drawn */
let holdsAny = false;
/** whether a harness has nothing counted, as it was */
let countHeld = false;
const black = new THREE.Color(0, 0, 0);
const kept = new THREE.Color();

/** For a harness (tools/lab): nothing counted, each ghost kept as one alone is, as it was. */
export function holdGhostsUncounted(held: boolean): void {
  countHeld = held;
}

/** For a harness (tools/lab): the ghosts counted over the scene's pixel at `column`, `row` (from its bottom left)
 *  in the last frame, read back. */
export function ghostsAt(gl: THREE.WebGLRenderer, column: number, row: number): number {
  if (!target || !holdsAny) return 0;
  const pixel = new Uint8Array(4);
  gl.readRenderTargetPixels(target, column, row, 1, 1, pixel);
  return Math.round((pixel[0] / 255) * GHOSTS_MOST);
}

/** The count's target at `width` by `height`, made or sized again. */
function countTarget(width: number, height: number): THREE.WebGLRenderTarget {
  if (!target) {
    target = new THREE.WebGLRenderTarget(width, height, { depthBuffer: false, generateMipmaps: false });
    target.texture.minFilter = THREE.NearestFilter;
    target.texture.magFilter = THREE.NearestFilter;
    GHOST_COUNT.tGhostLayers.value = target.texture;
  } else if (target.width !== width || target.height !== height) {
    target.setSize(width, height);
  }
  GHOST_COUNT.uGhostTexel.value.set(1 / width, 1 / height);
  return target;
}

/** The target cleared to none, with `gl`'s clear colour kept. */
function clearCount(gl: THREE.WebGLRenderer, into: THREE.WebGLRenderTarget): void {
  gl.getClearColor(kept);
  const alpha = gl.getClearAlpha();
  gl.setRenderTarget(into);
  gl.setClearColor(black, 0);
  gl.clear(true, false, false);
  gl.setClearColor(kept, alpha);
}

/**
 * The ghosts over each pixel counted for the frame `camera` is about to draw of `scene`, at the scene target's
 * `width` by `height`, while `wanted` (what blends is thinned only from above and over the shoulder, in the village).
 * Leaves `gl`'s target for the caller to set.
 */
export function countGhostLayers(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, width: number,
  height: number, wanted: boolean): void {
  const counting = wanted && !countHeld && ghostsCounted();
  if (!counting && !holdsAny) return;
  const into = countTarget(width, height);
  clearCount(gl, into);
  holdsAny = counting;
  if (!counting) return;
  const mask = camera.layers.mask;
  const { autoClear } = gl;
  const shadows = gl.shadowMap.autoUpdate;
  const background = scene.background;
  camera.layers.set(GHOST_COUNT_LAYER);
  gl.autoClear = false;
  gl.shadowMap.autoUpdate = false;
  scene.background = null;
  try {
    gl.render(scene, camera);
  } finally {
    camera.layers.mask = mask;
    gl.autoClear = autoClear;
    gl.shadowMap.autoUpdate = shadows;
    scene.background = background;
  }
}
