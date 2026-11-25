// A material's own look under the Rust engine: the WGSL it brings for the engine's lit shader (its two hooks,
// `vertex_hook` and `surface_hook`: the engine's lit.wgsl), the numbers and maps that shader reads, and what the
// bridge does for its meshes. A material with a look is drawn by it; one moved or cut by three's nodes and with no
// look isn't drawn (`Bridge.skipped`). Each look's shader is in `looks/`, beside the game's code it ports.
import type * as THREE from 'three';
import type { SeeThrough } from '../core/seeThrough';

/** how many floats a shader has to itself (`m.c`, 48 vec4s: `CUSTOM_FLOATS` in the engine's gpu.rs) */
export const LOOK_FLOATS = 192;

/** A shader for the engine's lit one: its name (one module a name) and its hooks' WGSL. `group`: which of the
 *  engine's modules of looks joined draws it (`RUST_SHADERS`), the world's looks by default: the skills' effects
 *  are joined apart, so their weight is never in the shading of the world's pixels, nor the world's in theirs. */
export interface RustShader { name: string; hooks: string; group?: 'effects' }

/** Every look's shader the game has, as its module makes it (`rustShader`): handed to the engine as it starts and
 *  joined into one of its modules (`Materials.joinLooks`, Bulwark's `join_shaders`). A browser compiles each module
 *  whole: one a look was the engine's whole lit shader compiled again for each, 0.3 to 0.5 s of the GPU's process
 *  apiece, the most of a first visit's 25 s of compiles (`lab programs --cost`), while the page drew nothing. */
export const RUST_SHADERS: RustShader[] = [];

/** `shader`, known to the engine ahead of any material drawn by it (`RUST_SHADERS`). A shader made only as a
 *  material is met is drawn by a module of its own. */
export function rustShader(shader: RustShader): RustShader {
  RUST_SHADERS.push(shader);
  return shader;
}

export interface RustLook {
  shader: RustShader;
  /** the shader's numbers (`m.c`), written each frame its material is drawn in */
  numbers(out: Float32Array): void;
  /** the shader's maps: two read in either stage (`t_extra0`, `t_extra1`), two more as it's shaded (`t_extra2`,
   *  `t_extra3`) */
  maps?: readonly (THREE.Texture | null)[];
  /** the shader's volume (`t_volume`, read by `samp_clamp`), as it is now: a 3D map of a byte a cell */
  volume?: () => THREE.Data3DTexture;
  /** the attribute its meshes hand over as their vertices' positions (the meadow's blades: `bv`) */
  position?: string;
  /** its vertices stay where the mesh has them, so its meshes cast the sun's shadow as any (not one that places
   *  or moves them: the shadow's pass knows nothing of a hook) */
  casts?: boolean;
  /** how many of its numbers tell two of its materials apart: with it, materials that look alike share one of the
   *  engine's, and their meshes one draw call (each foe's pieces have materials of their own) */
  shared?: number;
  /** with `shared`: how many of its numbers it reads in all. Those past `shared` are the same for every material
   *  sharing one of the engine's (its clocks, the glow's shape and strength), and are sent as they move */
  numbersUsed?: number;
  /** whether anything its material shows by has changed since this was last asked (its numbers, its colour,
   *  its glow): with it, a material that hasn't is drawn as it was, not described again (a fight's foes are a
   *  thousand materials a frame) */
  moved?(): boolean;
  /** its meshes' `onBeforeRender` is run before each is recorded (it lists what's drawn, sets the numbers) */
  before?: boolean;
  /** its draw's list, as it is this frame: floats its vertex hook reads by `bones[(*v).list + row]`, 16 a row
   *  (a field's tiles, any number of them: its numbers hold 80 at most). For a mesh that isn't skinned */
  list?(): Float32Array;
  /** what it fades with, where that's seen through (core/seeThrough.ts `seeValue`): a glow or a veil over a prop
   *  fades out by its alpha as the prop dissolves, not left burning in the air */
  fades?: SeeThrough;
}

const looks = new WeakMap<THREE.Material, RustLook>();

/** `material` drawn by `look` under the Rust engine. */
export function rustLook<M extends THREE.Material>(material: M, look: RustLook): M {
  looks.set(material, look);
  return material;
}

export const lookOf = (material: THREE.Material): RustLook | undefined => looks.get(material);
