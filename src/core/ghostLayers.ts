// The count of ghosts lying over each pixel (core/seeThrough.ts `countGhosts`, `LAYERS_SHARE_GLSL`) was drawn by the
// WebGL renderer alone: nothing is counted now, each ghost kept as one alone is. What's left is what the lab's village
// checks still ask of it.
import type * as THREE from 'three';

/** For a harness (tools/lab): nothing counted, as it is whatever is asked. */
export function holdGhostsUncounted(_held: boolean): void {}

/** For a harness (tools/lab): the ghosts counted over the scene's pixel at `column`, `row` in the last frame: none. */
export function ghostsAt(_gl: THREE.WebGLRenderer, _column: number, _row: number): number {
  return 0;
}
