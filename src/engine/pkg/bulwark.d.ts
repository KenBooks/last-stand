/* tslint:disable */
/* eslint-disable */

export class Engine {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * A material drawn by a shader of the page's, with up to 192 floats of that shader's own, its two maps and
     * (the third of `extra`) its volume.
     */
    add_custom_material(shader: number, params: Float32Array | number[], maps: Uint32Array | number[], key: number, custom: Float32Array | number[], extra: Uint32Array | number[]): number;
    add_material(params: Float32Array | number[], maps: Uint32Array | number[], key: number): number;
    add_mesh(positions: Float32Array | number[], normals: Float32Array | number[], uvs: Float32Array | number[], colors: Float32Array | number[], color_size: number, indices: Uint32Array | number[], joints: Uint16Array | number[], weights: Float32Array | number[]): number;
    /**
     * A shader of the page's: WGSL for the lit shader's two hooks (lit/*.wgsl). Its id.
     */
    add_shader(hooks: string): number;
    /**
     * A map from its RGBA bytes; 0 if they don't fit its size.
     */
    add_texture(width: number, height: number, pixels: Uint8Array | number[], srgb: boolean): number;
    /**
     * A map copied on the GPU from a picture of the page's (a canvas, an image, a bitmap), its foot at v 0 if
     * `flip`; 0 for a kind it can't take.
     */
    add_texture_from(source: any, srgb: boolean, flip: boolean): number;
    /**
     * A volume (a 3D map), a byte a cell; 0 if they don't fit its size.
     */
    add_volume(width: number, height: number, depth: number, cells: Uint8Array | number[]): number;
    /**
     * A face of a lamp's shadow drawn (`Engine::bake_lamp_face`).
     */
    bake_lamp_face(layer: number, records: number, bone_floats: number): void;
    /**
     * The still lights baked into the light cache (`Engine::bake_lights`): `bounds` the volume's low corner and
     * its high, `lights` eight floats each, the first `casters` records what stands still, `shelter` its box and
     * its walls' tops. How many cells it's made of.
     */
    bake_lights(bounds: Float32Array | number[], cell: number, lights: Float32Array | number[], casters: number, near: number, shelter: Float32Array | number[]): number;
    /**
     * Where the page writes the skinned meshes' bones, 16 floats each, with room for `floats`.
     */
    bones(floats: number): number;
    /**
     * The engine drawing to `canvas`, at the canvas's own size.
     */
    static create(canvas: HTMLCanvasElement): Promise<Engine>;
    drop_instances(id: number): void;
    /**
     * The light cache let go (`Gpu::drop_lights`).
     */
    drop_lights(): void;
    drop_material(id: number): void;
    drop_mesh(id: number): void;
    drop_texture(id: number): void;
    /**
     * Where the page writes the frame's globals (`Globals` in common.wgsl).
     */
    globals(): number;
    /**
     * Whether the next frame leaves the sun's shadow as it was last drawn: the page draws it in turns.
     */
    hold_shadow(held: boolean): void;
    /**
     * The frame's time read if it has come back, with no frame drawn (`stats` says when it has).
     */
    poll_clock(): void;
    /**
     * A material's pipeline for a kind of mesh made ahead of its first draw.
     */
    ready_material(material: number, skinned: boolean, raw: boolean): void;
    /**
     * Where the page writes the frame's records, with room for `count` of them. Growing it moves this module's
     * memory: the page takes its views of it again after each call.
     */
    records(count: number): number;
    /**
     * The frame drawn from the first `records` records and `bone_floats` floats of bones the page wrote, over
     * a screen cleared to a colour.
     */
    render(records: number, bone_floats: number, red: number, green: number, blue: number): void;
    replace_material(id: number, params: Float32Array | number[], maps: Uint32Array | number[], key: number): void;
    resize(width: number, height: number): void;
    /**
     * The bloom's passes drawn or left out, for a profile of the frame.
     */
    set_bloom(on: boolean): void;
    /**
     * The bloom at the quality level's share of the scene's pixels each way: 1, 0.5, or 0 for none.
     */
    set_bloom_share(share: number): void;
    /**
     * The scene's depth drawn ahead of its shading, or not (`Gpu::set_depth_first`).
     */
    set_depth_first(on: boolean): void;
    /**
     * The map of what shows round the screen's edges (`Gpu::set_edges_map`).
     */
    set_edges_map(texture: number): void;
    /**
     * A counted draw in the depth drawn first too, or not (`Gpu::set_fields_first`).
     */
    set_fields_first(on: boolean): void;
    /**
     * A field's instances placed by a pass ahead of its draws, or at every vertex (`Gpu::set_fields_placed`).
     */
    set_fields_placed(on: boolean): void;
    /**
     * A set of instances: each one's matrix (16 floats) and, if `tints` has them, its colour (4 floats). `id` 0
     * makes a set, another replaces that one's instances. Its id.
     */
    set_instances(id: number, matrices: Float32Array | number[], tints: Float32Array | number[]): number;
    /**
     * One baked light that's no lamp's read by a strength of its own within its reach
     * (`Gpu::set_light_of_its_own`).
     */
    set_light_of_its_own(x: number, y: number, z: number, reach: number, strength: number): void;
    /**
     * How bright the baked lights are read, out in the open and under the shelter (`Gpu::set_light_strength`).
     */
    set_light_strength(open: number, sheltered: number, apart: number): void;
    /**
     * Where the baked lights that are no lamp's reach (`Gpu::set_lights_apart`).
     */
    set_lights_apart(places: Float32Array | number[]): void;
    /**
     * The grade's look, a game's own over the frame (`Gpu::set_look`).
     */
    set_look(numbers: Float32Array | number[]): void;
    set_material_custom(id: number, custom: Float32Array | number[]): void;
    set_material_params(id: number, params: Float32Array | number[]): void;
    /**
     * A mesh's vertices written again in place; false if their count changed.
     */
    set_mesh_vertices(id: number, positions: Float32Array | number[], normals: Float32Array | number[], uvs: Float32Array | number[], colors: Float32Array | number[], color_size: number): boolean;
    /**
     * The scene drawn by the lit shaders made for the plain levels alone, or not (`Gpu::set_plain_only`).
     */
    set_plain_only(on: boolean): void;
    /**
     * The scene's samples a pixel and the sun's shadow map's side, as the page's quality level has them.
     */
    set_quality(samples: number, shadow_size: number): void;
    /**
     * The frame's sight, for the fog over what a watcher doesn't see (`Gpu::set_sight`).
     */
    set_sight(numbers: Float32Array | number[], rays: Uint16Array | number[]): void;
    /**
     * The roofs over the ground, for what stays seen over what isn't (`Gpu::set_sight_roofs`).
     */
    set_sight_roofs(texels: Uint8Array | number[], side: number): void;
    /**
     * The frame's particles, 8 floats each (where it is, how wide, its colour): those blended by their alpha,
     * and those added. Kept until set again.
     */
    set_sprites(blended: Float32Array | number[], added: Float32Array | number[]): void;
    set_volume(id: number, cells: Uint8Array | number[]): void;
    /**
     * What the last frame drew: draw calls, the shadow's draw calls, objects, things out of view, triangles, and
     * the GPU's time for its passes (ms; 0 where the browser doesn't time them), how many frames' times have
     * come back so far, and whether one is on its way (1: a frame drawn now isn't timed); the shadow's
     * triangles, the frames its map was kept, the draws at a share of the pixels, and how many times a point
     * light was left out of a ground cell it reaches; the instances its placed fields kept, and how many they
     * counted (a few frames late).
     */
    stats(): Float32Array;
}

export function start(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_engine_free: (a: number, b: number) => void;
    readonly engine_add_custom_material: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => number;
    readonly engine_add_material: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly engine_add_mesh: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number, n: number, o: number, p: number) => number;
    readonly engine_add_shader: (a: number, b: number, c: number) => number;
    readonly engine_add_texture: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly engine_add_texture_from: (a: number, b: any, c: number, d: number) => number;
    readonly engine_add_volume: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly engine_bake_lamp_face: (a: number, b: number, c: number, d: number) => void;
    readonly engine_bake_lights: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => number;
    readonly engine_bones: (a: number, b: number) => number;
    readonly engine_create: (a: any) => any;
    readonly engine_drop_instances: (a: number, b: number) => void;
    readonly engine_drop_lights: (a: number) => void;
    readonly engine_drop_material: (a: number, b: number) => void;
    readonly engine_drop_mesh: (a: number, b: number) => void;
    readonly engine_drop_texture: (a: number, b: number) => void;
    readonly engine_globals: (a: number) => number;
    readonly engine_hold_shadow: (a: number, b: number) => void;
    readonly engine_poll_clock: (a: number) => void;
    readonly engine_ready_material: (a: number, b: number, c: number, d: number) => void;
    readonly engine_records: (a: number, b: number) => number;
    readonly engine_render: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly engine_replace_material: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly engine_resize: (a: number, b: number, c: number) => void;
    readonly engine_set_bloom: (a: number, b: number) => void;
    readonly engine_set_bloom_share: (a: number, b: number) => void;
    readonly engine_set_depth_first: (a: number, b: number) => void;
    readonly engine_set_edges_map: (a: number, b: number) => void;
    readonly engine_set_fields_first: (a: number, b: number) => void;
    readonly engine_set_fields_placed: (a: number, b: number) => void;
    readonly engine_set_instances: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly engine_set_light_of_its_own: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly engine_set_light_strength: (a: number, b: number, c: number, d: number) => void;
    readonly engine_set_lights_apart: (a: number, b: number, c: number) => void;
    readonly engine_set_look: (a: number, b: number, c: number) => void;
    readonly engine_set_material_custom: (a: number, b: number, c: number, d: number) => void;
    readonly engine_set_material_params: (a: number, b: number, c: number, d: number) => void;
    readonly engine_set_mesh_vertices: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number) => number;
    readonly engine_set_plain_only: (a: number, b: number) => void;
    readonly engine_set_quality: (a: number, b: number, c: number) => void;
    readonly engine_set_sight: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly engine_set_sight_roofs: (a: number, b: number, c: number, d: number) => void;
    readonly engine_set_sprites: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly engine_set_volume: (a: number, b: number, c: number, d: number) => void;
    readonly engine_stats: (a: number, b: number) => void;
    readonly start: () => void;
    readonly __wasm_bindgen_func_elem_1754: (a: number, b: number, c: number, d: any) => void;
    readonly __wasm_bindgen_func_elem_1779: (a: number, b: number, c: any, d: any) => void;
    readonly __wasm_bindgen_func_elem_628: (a: number, b: number, c: number, d: any) => void;
    readonly __wasm_bindgen_func_elem_628_50: (a: number, b: number, c: number, d: any) => void;
    readonly __wasm_bindgen_func_elem_628_51: (a: number, b: number, c: number, d: any) => void;
    readonly __wasm_bindgen_func_elem_630: (a: number, b: number, c: any) => void;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_export3: (a: number, b: number, c: number) => void;
    readonly __wbindgen_export4: (a: number) => void;
    readonly __wbindgen_export5: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_export6: (a: number, b: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export7: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
