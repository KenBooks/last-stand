// A material's own look under the Rust engine: the WGSL it brings for the engine's lit shader (its two hooks,
// `vertex_hook` and `surface_hook`: the engine's lit.wgsl), the numbers and maps that shader reads, and what the
// bridge does for its meshes. A material with a look is drawn by it; one moved or cut by three's nodes and with no
// look isn't drawn (`Bridge.skipped`). Each look's shader is in `looks/`, beside the game's code it ports.
import type * as THREE from 'three';

/** how many floats a shader has to itself (`m.c`, 48 vec4s: `CUSTOM_FLOATS` in the engine's gpu.rs) */
export const LOOK_FLOATS = 192;

/** A shader for the engine's lit one: its name (one module a name) and its hooks' WGSL. */
export interface RustShader { name: string; hooks: string }

export interface RustLook {
  shader: RustShader;
  /** the shader's numbers (`m.c`), written each frame its material is drawn in */
  numbers(out: Float32Array): void;
  /** the shader's two maps (`t_extra0`, `t_extra1`) */
  maps?: readonly (THREE.Texture | null)[];
  /** the shader's volume (`t_volume`, read by `samp_clamp`), as it is now: a 3D map of a byte a cell */
  volume?: () => THREE.Data3DTexture;
  /** the attribute its meshes hand over as their vertices' positions (the meadow's blades: `bv`) */
  position?: string;
  /** its meshes' `onBeforeRender` is run before each is recorded (it lists what's drawn, sets the numbers) */
  before?: boolean;
}

const looks = new WeakMap<THREE.Material, RustLook>();

/** `material` drawn by `look` under the Rust engine. */
export function rustLook<M extends THREE.Material>(material: M, look: RustLook): M {
  looks.set(material, look);
  return material;
}

export const lookOf = (material: THREE.Material): RustLook | undefined => looks.get(material);
