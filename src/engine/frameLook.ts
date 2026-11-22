// The game's own look over the frame, handed to the engine's grade each frame (Bulwark's post.wgsl, `Pass.look` to
// `Pass.edges`): photo mode's exposure, contrast, saturation, colour filter, focus and bloom (core/photoLook.ts), and
// the blood round the screen's edges as the hero's Health runs low (core/bloodEdges.ts, core/lowLife.ts). Without it
// a photo was the frame as played whatever its look, and low health only drained the colour.
import type * as THREE from 'three';
import type { Core } from './core';
import type { Grade } from './globals';
import type { Maps } from './maps';

/** how many floats the engine takes of it (Bulwark's `LOOK_FLOATS`), and where each part begins */
const FLOATS = 36;
const AT = { look: 0, focus: 4, filterLo: 8, filterHi: 20, edges: 32 };

export class FrameLook {
  private readonly numbers = new Float32Array(FLOATS);
  /** the edges' map as last handed over, and its version then */
  private edges: THREE.Texture | null = null;
  private edgesVersion = -1;

  constructor(private readonly core: Core, private readonly maps: Maps) {}

  /** A matrix's three columns, each in four floats, as the engine's grade reads them. */
  private columns(matrix: THREE.Matrix3, at: number): void {
    const e = matrix.elements;
    for (let column = 0; column < 3; column++) {
      for (let row = 0; row < 3; row++) this.numbers[at + column * 4 + row] = e[column * 3 + row];
    }
  }

  /** The frame's look told, as its `grade` has it. */
  tell(grade: Grade): void {
    const n = this.numbers, look = grade.look, edges = grade.edges;
    n.fill(0);
    if (look?.on) {
      n[AT.look] = 1; n[AT.look + 1] = look.exposure; n[AT.look + 2] = look.contrast; n[AT.look + 3] = look.saturation;
      n[AT.focus] = look.filterMix; n[AT.focus + 1] = look.blur; n[AT.focus + 2] = look.focusY;
      n[AT.focus + 3] = look.focusBand;
      this.columns(look.filterLo, AT.filterLo);
      this.columns(look.filterHi, AT.filterHi);
      n[AT.edges + 2] = look.bloom;
    }
    if (edges?.mask && edges.reach > 0) {
      if (edges.mask !== this.edges || edges.mask.version !== this.edgesVersion) {
        this.edges = edges.mask;
        this.edgesVersion = edges.mask.version;
        this.core.engine.set_edges_map(this.maps.textureId(edges.mask));
        this.core.freshViews();
      }
      n[AT.edges] = edges.reach;
    }
    this.core.engine.set_look(n);
  }
}
