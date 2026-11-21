/* tslint:disable */
/* eslint-disable */

export class Engine {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * A material drawn by a shader of the page's, with up to 192 floats of that shader's own and its two maps.
     */
    add_custom_material(shader: number, params: Float32Array | number[], maps: Uint32Array | number[], key: number, custom: Float32Array | number[], extra: Uint32Array | number[]): number;
    add_material(params: Float32Array | number[], maps: Uint32Array | number[], key: number): number;
    add_mesh(positions: Float32Array | number[], normals: Float32Array | number[], uvs: Float32Array | number[], colors: Float32Array | number[], color_size: number, indices: Uint32Array | number[], joints: Uint16Array | number[], weights: Float32Array | number[]): number;
    /**
     * A shader of the page's: WGSL for the lit shader's two hooks (lit.wgsl). Its id.
     */
    add_shader(hooks: string): number;
    /**
     * A map from its RGBA bytes; 0 if they don't fit its size.
     */
    add_texture(width: number, height: number, pixels: Uint8Array | number[], srgb: boolean): number;
    /**
     * Where the page writes the skinned meshes' bones, 16 floats each, with room for `floats`.
     */
    bones(floats: number): number;
    /**
     * The engine drawing to `canvas`, at the canvas's own size.
     */
    static create(canvas: HTMLCanvasElement): Promise<Engine>;
    drop_instances(id: number): void;
    drop_material(id: number): void;
    drop_mesh(id: number): void;
    drop_texture(id: number): void;
    /**
     * Where the page writes the frame's globals (`Globals` in common.wgsl).
     */
    globals(): number;
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
     * A set of instances: each one's matrix (16 floats) and, if `tints` has them, its colour (4 floats). `id` 0
     * makes a set, another replaces that one's instances. Its id.
     */
    set_instances(id: number, matrices: Float32Array | number[], tints: Float32Array | number[]): number;
    set_material_custom(id: number, custom: Float32Array | number[]): void;
    set_material_params(id: number, params: Float32Array | number[]): void;
    /**
     * The frame's particles, 8 floats each (where it is, how wide, its colour): those blended by their alpha,
     * and those added. Kept until set again.
     */
    set_sprites(blended: Float32Array | number[], added: Float32Array | number[]): void;
    /**
     * What the last frame drew: draw calls, the shadow's draw calls, objects, things out of view, triangles, and
     * the GPU's time for its passes (ms; 0 where the browser doesn't time them).
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
    readonly engine_bones: (a: number, b: number) => number;
    readonly engine_create: (a: any) => any;
    readonly engine_drop_instances: (a: number, b: number) => void;
    readonly engine_drop_material: (a: number, b: number) => void;
    readonly engine_drop_mesh: (a: number, b: number) => void;
    readonly engine_drop_texture: (a: number, b: number) => void;
    readonly engine_globals: (a: number) => number;
    readonly engine_records: (a: number, b: number) => number;
    readonly engine_render: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly engine_replace_material: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly engine_resize: (a: number, b: number, c: number) => void;
    readonly engine_set_instances: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly engine_set_material_custom: (a: number, b: number, c: number, d: number) => void;
    readonly engine_set_material_params: (a: number, b: number, c: number, d: number) => void;
    readonly engine_set_sprites: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly engine_stats: (a: number, b: number) => void;
    readonly start: () => void;
    readonly __wasm_bindgen_func_elem_1546: (a: number, b: number, c: number, d: any) => void;
    readonly __wasm_bindgen_func_elem_1571: (a: number, b: number, c: any, d: any) => void;
    readonly __wasm_bindgen_func_elem_458: (a: number, b: number, c: number, d: any) => void;
    readonly __wasm_bindgen_func_elem_458_25: (a: number, b: number, c: number, d: any) => void;
    readonly __wasm_bindgen_func_elem_458_26: (a: number, b: number, c: number, d: any) => void;
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
