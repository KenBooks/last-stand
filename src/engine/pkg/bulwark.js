/* @ts-self-types="./bulwark.d.ts" */

export class Engine {
    static __wrap(ptr) {
        const obj = Object.create(Engine.prototype);
        obj.__wbg_ptr = ptr;
        EngineFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        EngineFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_engine_free(ptr, 0);
    }
    /**
     * A material drawn by a shader of the page's, with up to 192 floats of that shader's own, its two maps and
     * (the third of `extra`) its volume.
     * @param {number} shader
     * @param {Float32Array | number[]} params
     * @param {Uint32Array | number[]} maps
     * @param {number} key
     * @param {Float32Array | number[]} custom
     * @param {Uint32Array | number[]} extra
     * @returns {number}
     */
    add_custom_material(shader, params, maps, key, custom, extra) {
        const val5 = +shader;
        const val6 = +key;
        let ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3;
        try {
            ptr0 = passArrayF32ToWasm0(params, wasm.__wbindgen_export);
            len0 = WASM_VECTOR_LEN;
            ptr1 = passArray32ToWasm0(maps, wasm.__wbindgen_export);
            len1 = WASM_VECTOR_LEN;
            ptr2 = passArrayF32ToWasm0(custom, wasm.__wbindgen_export);
            len2 = WASM_VECTOR_LEN;
            ptr3 = passArray32ToWasm0(extra, wasm.__wbindgen_export);
            len3 = WASM_VECTOR_LEN;
        } catch (e) {
            if (ptr3) { wasm.__wbindgen_export3(ptr3, len3 * 4, 4); }
            if (ptr2) { wasm.__wbindgen_export3(ptr2, len2 * 4, 4); }
            if (ptr1) { wasm.__wbindgen_export3(ptr1, len1 * 4, 4); }
            if (ptr0) { wasm.__wbindgen_export3(ptr0, len0 * 4, 4); }
            throw e;
        }
        const ret = wasm.engine_add_custom_material(this.__wbg_ptr, val5, ptr0, len0, ptr1, len1, val6, ptr2, len2, ptr3, len3);
        return ret >>> 0;
    }
    /**
     * @param {Float32Array | number[]} params
     * @param {Uint32Array | number[]} maps
     * @param {number} key
     * @returns {number}
     */
    add_material(params, maps, key) {
        const val3 = +key;
        let ptr0, len0, ptr1, len1;
        try {
            ptr0 = passArrayF32ToWasm0(params, wasm.__wbindgen_export);
            len0 = WASM_VECTOR_LEN;
            ptr1 = passArray32ToWasm0(maps, wasm.__wbindgen_export);
            len1 = WASM_VECTOR_LEN;
        } catch (e) {
            if (ptr1) { wasm.__wbindgen_export3(ptr1, len1 * 4, 4); }
            if (ptr0) { wasm.__wbindgen_export3(ptr0, len0 * 4, 4); }
            throw e;
        }
        const ret = wasm.engine_add_material(this.__wbg_ptr, ptr0, len0, ptr1, len1, val3);
        return ret >>> 0;
    }
    /**
     * @param {Float32Array | number[]} positions
     * @param {Float32Array | number[]} normals
     * @param {Float32Array | number[]} uvs
     * @param {Float32Array | number[]} colors
     * @param {number} color_size
     * @param {Uint32Array | number[]} indices
     * @param {Uint16Array | number[]} joints
     * @param {Float32Array | number[]} weights
     * @returns {number}
     */
    add_mesh(positions, normals, uvs, colors, color_size, indices, joints, weights) {
        const val8 = +color_size;
        let ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, ptr5, len5, ptr6, len6;
        try {
            ptr0 = passArrayF32ToWasm0(positions, wasm.__wbindgen_export);
            len0 = WASM_VECTOR_LEN;
            ptr1 = passArrayF32ToWasm0(normals, wasm.__wbindgen_export);
            len1 = WASM_VECTOR_LEN;
            ptr2 = passArrayF32ToWasm0(uvs, wasm.__wbindgen_export);
            len2 = WASM_VECTOR_LEN;
            ptr3 = passArrayF32ToWasm0(colors, wasm.__wbindgen_export);
            len3 = WASM_VECTOR_LEN;
            ptr4 = passArray32ToWasm0(indices, wasm.__wbindgen_export);
            len4 = WASM_VECTOR_LEN;
            ptr5 = passArray16ToWasm0(joints, wasm.__wbindgen_export);
            len5 = WASM_VECTOR_LEN;
            ptr6 = passArrayF32ToWasm0(weights, wasm.__wbindgen_export);
            len6 = WASM_VECTOR_LEN;
        } catch (e) {
            if (ptr6) { wasm.__wbindgen_export3(ptr6, len6 * 4, 4); }
            if (ptr5) { wasm.__wbindgen_export3(ptr5, len5 * 2, 2); }
            if (ptr4) { wasm.__wbindgen_export3(ptr4, len4 * 4, 4); }
            if (ptr3) { wasm.__wbindgen_export3(ptr3, len3 * 4, 4); }
            if (ptr2) { wasm.__wbindgen_export3(ptr2, len2 * 4, 4); }
            if (ptr1) { wasm.__wbindgen_export3(ptr1, len1 * 4, 4); }
            if (ptr0) { wasm.__wbindgen_export3(ptr0, len0 * 4, 4); }
            throw e;
        }
        const ret = wasm.engine_add_mesh(this.__wbg_ptr, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, val8, ptr4, len4, ptr5, len5, ptr6, len6);
        return ret >>> 0;
    }
    /**
     * A shader of the page's: WGSL for the lit shader's two hooks (lit.wgsl). Its id.
     * @param {string} hooks
     * @returns {number}
     */
    add_shader(hooks) {
        const ptr0 = passStringToWasm0(hooks, wasm.__wbindgen_export, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.engine_add_shader(this.__wbg_ptr, ptr0, len0);
        return ret >>> 0;
    }
    /**
     * A map from its RGBA bytes; 0 if they don't fit its size.
     * @param {number} width
     * @param {number} height
     * @param {Uint8Array | number[]} pixels
     * @param {boolean} srgb
     * @returns {number}
     */
    add_texture(width, height, pixels, srgb) {
        const val2 = +width;
        const val3 = +height;
        const val4 = +srgb;
        const ptr0 = passArray8ToWasm0(pixels, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.engine_add_texture(this.__wbg_ptr, val2, val3, ptr0, len0, val4);
        return ret >>> 0;
    }
    /**
     * A map copied on the GPU from a picture of the page's (a canvas, an image, a bitmap), its foot at v 0 if
     * `flip`; 0 for a kind it can't take.
     * @param {any} source
     * @param {boolean} srgb
     * @param {boolean} flip
     * @returns {number}
     */
    add_texture_from(source, srgb, flip) {
        const ret = wasm.engine_add_texture_from(this.__wbg_ptr, source, srgb, flip);
        return ret >>> 0;
    }
    /**
     * A volume (a 3D map), a byte a cell; 0 if they don't fit its size.
     * @param {number} width
     * @param {number} height
     * @param {number} depth
     * @param {Uint8Array | number[]} cells
     * @returns {number}
     */
    add_volume(width, height, depth, cells) {
        const val2 = +width;
        const val3 = +height;
        const val4 = +depth;
        const ptr0 = passArray8ToWasm0(cells, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.engine_add_volume(this.__wbg_ptr, val2, val3, val4, ptr0, len0);
        return ret >>> 0;
    }
    /**
     * A face of a lamp's shadow drawn (`Engine::bake_lamp_face`).
     * @param {number} layer
     * @param {number} records
     * @param {number} bone_floats
     */
    bake_lamp_face(layer, records, bone_floats) {
        wasm.engine_bake_lamp_face(this.__wbg_ptr, layer, records, bone_floats);
    }
    /**
     * The still lights baked into the light cache (`Engine::bake_lights`): `bounds` the volume's low corner and
     * its high, `lights` eight floats each, the first `casters` records what stands still, `shelter` its box and
     * its walls' tops. How many cells it's made of.
     * @param {Float32Array | number[]} bounds
     * @param {number} cell
     * @param {Float32Array | number[]} lights
     * @param {number} casters
     * @param {number} near
     * @param {Float32Array | number[]} shelter
     * @returns {number}
     */
    bake_lights(bounds, cell, lights, casters, near, shelter) {
        const val4 = +cell;
        const val5 = +casters;
        const val6 = +near;
        let ptr0, len0, ptr1, len1, ptr2, len2;
        try {
            ptr0 = passArrayF32ToWasm0(bounds, wasm.__wbindgen_export);
            len0 = WASM_VECTOR_LEN;
            ptr1 = passArrayF32ToWasm0(lights, wasm.__wbindgen_export);
            len1 = WASM_VECTOR_LEN;
            ptr2 = passArrayF32ToWasm0(shelter, wasm.__wbindgen_export);
            len2 = WASM_VECTOR_LEN;
        } catch (e) {
            if (ptr2) { wasm.__wbindgen_export3(ptr2, len2 * 4, 4); }
            if (ptr1) { wasm.__wbindgen_export3(ptr1, len1 * 4, 4); }
            if (ptr0) { wasm.__wbindgen_export3(ptr0, len0 * 4, 4); }
            throw e;
        }
        const ret = wasm.engine_bake_lights(this.__wbg_ptr, ptr0, len0, val4, ptr1, len1, val5, val6, ptr2, len2);
        return ret;
    }
    /**
     * Where the page writes the skinned meshes' bones, 16 floats each, with room for `floats`.
     * @param {number} floats
     * @returns {number}
     */
    bones(floats) {
        const ret = wasm.engine_bones(this.__wbg_ptr, floats);
        return ret >>> 0;
    }
    /**
     * The engine drawing to `canvas`, at the canvas's own size.
     * @param {HTMLCanvasElement} canvas
     * @returns {Promise<Engine>}
     */
    static create(canvas) {
        const ret = wasm.engine_create(canvas);
        return ret;
    }
    /**
     * @param {number} id
     */
    drop_instances(id) {
        wasm.engine_drop_instances(this.__wbg_ptr, id);
    }
    /**
     * The light cache let go (`Gpu::drop_lights`).
     */
    drop_lights() {
        wasm.engine_drop_lights(this.__wbg_ptr);
    }
    /**
     * @param {number} id
     */
    drop_material(id) {
        wasm.engine_drop_material(this.__wbg_ptr, id);
    }
    /**
     * @param {number} id
     */
    drop_mesh(id) {
        wasm.engine_drop_mesh(this.__wbg_ptr, id);
    }
    /**
     * @param {number} id
     */
    drop_texture(id) {
        wasm.engine_drop_texture(this.__wbg_ptr, id);
    }
    /**
     * Where the page writes the frame's globals (`Globals` in common.wgsl).
     * @returns {number}
     */
    globals() {
        const ret = wasm.engine_globals(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Whether the next frame leaves the sun's shadow as it was last drawn: the page draws it in turns.
     * @param {boolean} held
     */
    hold_shadow(held) {
        wasm.engine_hold_shadow(this.__wbg_ptr, held);
    }
    /**
     * The frame's time read if it has come back, with no frame drawn (`stats` says when it has).
     */
    poll_clock() {
        wasm.engine_poll_clock(this.__wbg_ptr);
    }
    /**
     * A material's pipeline for a kind of mesh made ahead of its first draw.
     * @param {number} material
     * @param {boolean} skinned
     * @param {boolean} raw
     */
    ready_material(material, skinned, raw) {
        wasm.engine_ready_material(this.__wbg_ptr, material, skinned, raw);
    }
    /**
     * Where the page writes the frame's records, with room for `count` of them. Growing it moves this module's
     * memory: the page takes its views of it again after each call.
     * @param {number} count
     * @returns {number}
     */
    records(count) {
        const ret = wasm.engine_records(this.__wbg_ptr, count);
        return ret >>> 0;
    }
    /**
     * The frame drawn from the first `records` records and `bone_floats` floats of bones the page wrote, over
     * a screen cleared to a colour.
     * @param {number} records
     * @param {number} bone_floats
     * @param {number} red
     * @param {number} green
     * @param {number} blue
     */
    render(records, bone_floats, red, green, blue) {
        wasm.engine_render(this.__wbg_ptr, records, bone_floats, red, green, blue);
    }
    /**
     * @param {number} id
     * @param {Float32Array | number[]} params
     * @param {Uint32Array | number[]} maps
     * @param {number} key
     */
    replace_material(id, params, maps, key) {
        const val3 = +id;
        const val4 = +key;
        let ptr0, len0, ptr1, len1;
        try {
            ptr0 = passArrayF32ToWasm0(params, wasm.__wbindgen_export);
            len0 = WASM_VECTOR_LEN;
            ptr1 = passArray32ToWasm0(maps, wasm.__wbindgen_export);
            len1 = WASM_VECTOR_LEN;
        } catch (e) {
            if (ptr1) { wasm.__wbindgen_export3(ptr1, len1 * 4, 4); }
            if (ptr0) { wasm.__wbindgen_export3(ptr0, len0 * 4, 4); }
            throw e;
        }
        wasm.engine_replace_material(this.__wbg_ptr, val3, ptr0, len0, ptr1, len1, val4);
    }
    /**
     * @param {number} width
     * @param {number} height
     */
    resize(width, height) {
        wasm.engine_resize(this.__wbg_ptr, width, height);
    }
    /**
     * The bloom's passes drawn or left out, for a profile of the frame.
     * @param {boolean} on
     */
    set_bloom(on) {
        wasm.engine_set_bloom(this.__wbg_ptr, on);
    }
    /**
     * The bloom at the quality level's share of the scene's pixels each way: 1, 0.5, or 0 for none.
     * @param {number} share
     */
    set_bloom_share(share) {
        wasm.engine_set_bloom_share(this.__wbg_ptr, share);
    }
    /**
     * The scene's depth drawn ahead of its shading, or not (`Gpu::set_depth_first`).
     * @param {boolean} on
     */
    set_depth_first(on) {
        wasm.engine_set_depth_first(this.__wbg_ptr, on);
    }
    /**
     * A counted draw in the depth drawn first too, or not (`Gpu::set_fields_first`).
     * @param {boolean} on
     */
    set_fields_first(on) {
        wasm.engine_set_fields_first(this.__wbg_ptr, on);
    }
    /**
     * A set of instances: each one's matrix (16 floats) and, if `tints` has them, its colour (4 floats). `id` 0
     * makes a set, another replaces that one's instances. Its id.
     * @param {number} id
     * @param {Float32Array | number[]} matrices
     * @param {Float32Array | number[]} tints
     * @returns {number}
     */
    set_instances(id, matrices, tints) {
        const val3 = +id;
        let ptr0, len0, ptr1, len1;
        try {
            ptr0 = passArrayF32ToWasm0(matrices, wasm.__wbindgen_export);
            len0 = WASM_VECTOR_LEN;
            ptr1 = passArrayF32ToWasm0(tints, wasm.__wbindgen_export);
            len1 = WASM_VECTOR_LEN;
        } catch (e) {
            if (ptr1) { wasm.__wbindgen_export3(ptr1, len1 * 4, 4); }
            if (ptr0) { wasm.__wbindgen_export3(ptr0, len0 * 4, 4); }
            throw e;
        }
        const ret = wasm.engine_set_instances(this.__wbg_ptr, val3, ptr0, len0, ptr1, len1);
        return ret >>> 0;
    }
    /**
     * One baked light that's no lamp's read by a strength of its own within its reach
     * (`Gpu::set_light_of_its_own`).
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {number} reach
     * @param {number} strength
     */
    set_light_of_its_own(x, y, z, reach, strength) {
        wasm.engine_set_light_of_its_own(this.__wbg_ptr, x, y, z, reach, strength);
    }
    /**
     * How bright the baked lights are read, out in the open and under the shelter (`Gpu::set_light_strength`).
     * @param {number} open
     * @param {number} sheltered
     * @param {number} apart
     */
    set_light_strength(open, sheltered, apart) {
        wasm.engine_set_light_strength(this.__wbg_ptr, open, sheltered, apart);
    }
    /**
     * Where the baked lights that are no lamp's reach (`Gpu::set_lights_apart`).
     * @param {Float32Array | number[]} places
     */
    set_lights_apart(places) {
        const ptr0 = passArrayF32ToWasm0(places, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        wasm.engine_set_lights_apart(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * @param {number} id
     * @param {Float32Array | number[]} custom
     */
    set_material_custom(id, custom) {
        const val2 = +id;
        const ptr0 = passArrayF32ToWasm0(custom, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        wasm.engine_set_material_custom(this.__wbg_ptr, val2, ptr0, len0);
    }
    /**
     * @param {number} id
     * @param {Float32Array | number[]} params
     */
    set_material_params(id, params) {
        const val2 = +id;
        const ptr0 = passArrayF32ToWasm0(params, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        wasm.engine_set_material_params(this.__wbg_ptr, val2, ptr0, len0);
    }
    /**
     * A mesh's vertices written again in place; false if their count changed.
     * @param {number} id
     * @param {Float32Array | number[]} positions
     * @param {Float32Array | number[]} normals
     * @param {Float32Array | number[]} uvs
     * @param {Float32Array | number[]} colors
     * @param {number} color_size
     * @returns {boolean}
     */
    set_mesh_vertices(id, positions, normals, uvs, colors, color_size) {
        const val5 = +id;
        const val6 = +color_size;
        let ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3;
        try {
            ptr0 = passArrayF32ToWasm0(positions, wasm.__wbindgen_export);
            len0 = WASM_VECTOR_LEN;
            ptr1 = passArrayF32ToWasm0(normals, wasm.__wbindgen_export);
            len1 = WASM_VECTOR_LEN;
            ptr2 = passArrayF32ToWasm0(uvs, wasm.__wbindgen_export);
            len2 = WASM_VECTOR_LEN;
            ptr3 = passArrayF32ToWasm0(colors, wasm.__wbindgen_export);
            len3 = WASM_VECTOR_LEN;
        } catch (e) {
            if (ptr3) { wasm.__wbindgen_export3(ptr3, len3 * 4, 4); }
            if (ptr2) { wasm.__wbindgen_export3(ptr2, len2 * 4, 4); }
            if (ptr1) { wasm.__wbindgen_export3(ptr1, len1 * 4, 4); }
            if (ptr0) { wasm.__wbindgen_export3(ptr0, len0 * 4, 4); }
            throw e;
        }
        const ret = wasm.engine_set_mesh_vertices(this.__wbg_ptr, val5, ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, val6);
        return ret !== 0;
    }
    /**
     * The scene's samples a pixel and the sun's shadow map's side, as the page's quality level has them.
     * @param {number} samples
     * @param {number} shadow_size
     */
    set_quality(samples, shadow_size) {
        wasm.engine_set_quality(this.__wbg_ptr, samples, shadow_size);
    }
    /**
     * The frame's sight, for the fog over what a watcher doesn't see (`Gpu::set_sight`).
     * @param {Float32Array | number[]} numbers
     * @param {Uint16Array | number[]} rays
     */
    set_sight(numbers, rays) {
        let ptr0, len0, ptr1, len1;
        try {
            ptr0 = passArrayF32ToWasm0(numbers, wasm.__wbindgen_export);
            len0 = WASM_VECTOR_LEN;
            ptr1 = passArray16ToWasm0(rays, wasm.__wbindgen_export);
            len1 = WASM_VECTOR_LEN;
        } catch (e) {
            if (ptr1) { wasm.__wbindgen_export3(ptr1, len1 * 2, 2); }
            if (ptr0) { wasm.__wbindgen_export3(ptr0, len0 * 4, 4); }
            throw e;
        }
        wasm.engine_set_sight(this.__wbg_ptr, ptr0, len0, ptr1, len1);
    }
    /**
     * The roofs over the ground, for what stays seen over what isn't (`Gpu::set_sight_roofs`).
     * @param {Uint8Array | number[]} texels
     * @param {number} side
     */
    set_sight_roofs(texels, side) {
        const val2 = +side;
        const ptr0 = passArray8ToWasm0(texels, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        wasm.engine_set_sight_roofs(this.__wbg_ptr, ptr0, len0, val2);
    }
    /**
     * The frame's particles, 8 floats each (where it is, how wide, its colour): those blended by their alpha,
     * and those added. Kept until set again.
     * @param {Float32Array | number[]} blended
     * @param {Float32Array | number[]} added
     */
    set_sprites(blended, added) {
        let ptr0, len0, ptr1, len1;
        try {
            ptr0 = passArrayF32ToWasm0(blended, wasm.__wbindgen_export);
            len0 = WASM_VECTOR_LEN;
            ptr1 = passArrayF32ToWasm0(added, wasm.__wbindgen_export);
            len1 = WASM_VECTOR_LEN;
        } catch (e) {
            if (ptr1) { wasm.__wbindgen_export3(ptr1, len1 * 4, 4); }
            if (ptr0) { wasm.__wbindgen_export3(ptr0, len0 * 4, 4); }
            throw e;
        }
        wasm.engine_set_sprites(this.__wbg_ptr, ptr0, len0, ptr1, len1);
    }
    /**
     * @param {number} id
     * @param {Uint8Array | number[]} cells
     */
    set_volume(id, cells) {
        const val2 = +id;
        const ptr0 = passArray8ToWasm0(cells, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        wasm.engine_set_volume(this.__wbg_ptr, val2, ptr0, len0);
    }
    /**
     * What the last frame drew: draw calls, the shadow's draw calls, objects, things out of view, triangles, and
     * the GPU's time for its passes (ms; 0 where the browser doesn't time them), how many frames' times have
     * come back so far, and whether one is on its way (1: a frame drawn now isn't timed); the shadow's
     * triangles, the frames its map was kept, the draws at a share of the pixels, and how many times a point
     * light was left out of a ground cell it reaches.
     * @returns {Float32Array}
     */
    stats() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16) >>> 0;
            wasm.engine_stats(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayF32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export3(r0, r1 * 4, 4);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}
if (Symbol.dispose) Engine.prototype[Symbol.dispose] = Engine.prototype.free;

export function start() {
    wasm.start();
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_208446807d0d1e30: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_Window_41838cbcc08822b5: function(arg0) {
            const ret = arg0.Window;
            return ret;
        },
        __wbg_WorkerGlobalScope_448e3830f27a30fd: function(arg0) {
            const ret = arg0.WorkerGlobalScope;
            return ret;
        },
        __wbg___wbindgen_debug_string_f249a2a76caa9a55: function(arg0, arg1) {
            const ret = debugString(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_is_function_741ff2bb612836f5: function(arg0) {
            const ret = typeof(arg0) === 'function';
            return ret;
        },
        __wbg___wbindgen_is_null_c22311b1cc228e3a: function(arg0) {
            const ret = arg0 === null;
            return ret;
        },
        __wbg___wbindgen_is_string_fc456fee5d3317de: function(arg0) {
            const ret = typeof(arg0) === 'string';
            return ret;
        },
        __wbg___wbindgen_is_undefined_be5b34249ff1fc15: function(arg0) {
            const ret = arg0 === undefined;
            return ret;
        },
        __wbg___wbindgen_string_get_7ce8eee7fd327545: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'string' ? obj : undefined;
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_throw_4c88d8bf264fd984: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg__wbg_cb_unref_09736879a3f67559: function(arg0) {
            arg0._wbg_cb_unref();
        },
        __wbg_beginComputePass_b3bb1a69e6a70bde: function(arg0, arg1) {
            const ret = arg0.beginComputePass(arg1);
            return ret;
        },
        __wbg_beginRenderPass_ac30593a03c9a74e: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.beginRenderPass(arg1);
            return ret;
        }, arguments); },
        __wbg_call_a410eb4b59ed5965: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.call(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_configure_2f4cbe7746e5aa81: function() { return handleError(function (arg0, arg1) {
            arg0.configure(arg1);
        }, arguments); },
        __wbg_copyBufferToBuffer_2c8a5726f948b97e: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5) {
            arg0.copyBufferToBuffer(arg1, arg2, arg3, arg4, arg5);
        }, arguments); },
        __wbg_copyBufferToBuffer_d8141ff7d5df2685: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
            arg0.copyBufferToBuffer(arg1, arg2, arg3, arg4);
        }, arguments); },
        __wbg_copyExternalImageToTexture_46bd889cd83d3bc2: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            arg0.copyExternalImageToTexture(arg1, arg2, arg3);
        }, arguments); },
        __wbg_copyTextureToTexture_aa278b6e539310a3: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            arg0.copyTextureToTexture(arg1, arg2, arg3);
        }, arguments); },
        __wbg_createBindGroupLayout_03a20e72b41b406e: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.createBindGroupLayout(arg1);
            return ret;
        }, arguments); },
        __wbg_createBindGroup_ec4dc4d9e46e1104: function(arg0, arg1) {
            const ret = arg0.createBindGroup(arg1);
            return ret;
        },
        __wbg_createBuffer_baa81dab839b6c5c: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.createBuffer(arg1);
            return ret;
        }, arguments); },
        __wbg_createCommandEncoder_a5136f45baaba888: function(arg0, arg1) {
            const ret = arg0.createCommandEncoder(arg1);
            return ret;
        },
        __wbg_createComputePipeline_6a05383609fddac6: function(arg0, arg1) {
            const ret = arg0.createComputePipeline(arg1);
            return ret;
        },
        __wbg_createPipelineLayout_a955ff1e35a63634: function(arg0, arg1) {
            const ret = arg0.createPipelineLayout(arg1);
            return ret;
        },
        __wbg_createQuerySet_b68dbafb01930a3a: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.createQuerySet(arg1);
            return ret;
        }, arguments); },
        __wbg_createRenderPipeline_f31fc336274aaab2: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.createRenderPipeline(arg1);
            return ret;
        }, arguments); },
        __wbg_createSampler_2fe8901be471a83a: function(arg0, arg1) {
            const ret = arg0.createSampler(arg1);
            return ret;
        },
        __wbg_createShaderModule_f540847678b68e08: function(arg0, arg1) {
            const ret = arg0.createShaderModule(arg1);
            return ret;
        },
        __wbg_createTexture_5e2361f396945928: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.createTexture(arg1);
            return ret;
        }, arguments); },
        __wbg_createView_e495f88700d28104: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.createView(arg1);
            return ret;
        }, arguments); },
        __wbg_dispatchWorkgroupsIndirect_30ab1138724a2c32: function(arg0, arg1, arg2) {
            arg0.dispatchWorkgroupsIndirect(arg1, arg2);
        },
        __wbg_dispatchWorkgroups_74a6ec8812ef9f3b: function(arg0, arg1, arg2, arg3) {
            arg0.dispatchWorkgroups(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0);
        },
        __wbg_document_3b5c3071b43e97ee: function(arg0) {
            const ret = arg0.document;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_drawIndexed_8bcec1419f35c7a6: function(arg0, arg1, arg2, arg3, arg4, arg5) {
            arg0.drawIndexed(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0, arg4, arg5 >>> 0);
        },
        __wbg_drawIndirect_193e39a1dda3a6c4: function(arg0, arg1, arg2) {
            arg0.drawIndirect(arg1, arg2);
        },
        __wbg_draw_977efcdcd4b12838: function(arg0, arg1, arg2, arg3, arg4) {
            arg0.draw(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0, arg4 >>> 0);
        },
        __wbg_end_23ba48463344fbc0: function(arg0) {
            arg0.end();
        },
        __wbg_end_3bbedaa037606029: function(arg0) {
            arg0.end();
        },
        __wbg_engine_new: function(arg0) {
            const ret = Engine.__wrap(arg0);
            return ret;
        },
        __wbg_error_2fa67a9496f77475: function(arg0) {
            const ret = arg0.error;
            return ret;
        },
        __wbg_error_757e9472f8410341: function(arg0, arg1) {
            let deferred0_0;
            let deferred0_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                console.error(getStringFromWasm0(arg0, arg1));
            } finally {
                wasm.__wbindgen_export3(deferred0_0, deferred0_1, 1);
            }
        },
        __wbg_error_d1fc0193610e0e39: function(arg0) {
            console.error(arg0);
        },
        __wbg_features_29757024dfb82d0d: function(arg0) {
            const ret = arg0.features;
            return ret;
        },
        __wbg_features_b650c8412d082ef1: function(arg0) {
            const ret = arg0.features;
            return ret;
        },
        __wbg_finish_49529a046631ad9a: function(arg0) {
            const ret = arg0.finish();
            return ret;
        },
        __wbg_finish_678df663961386ff: function(arg0, arg1) {
            const ret = arg0.finish(arg1);
            return ret;
        },
        __wbg_getBindGroupLayout_d3b4ef65364c02e1: function(arg0, arg1) {
            const ret = arg0.getBindGroupLayout(arg1 >>> 0);
            return ret;
        },
        __wbg_getContext_1938edb9a972f63d: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.getContext(getStringFromWasm0(arg1, arg2));
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        }, arguments); },
        __wbg_getContext_d93f904b714852ae: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.getContext(getStringFromWasm0(arg1, arg2));
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        }, arguments); },
        __wbg_getCurrentTexture_e9d52aabce56f3fb: function() { return handleError(function (arg0) {
            const ret = arg0.getCurrentTexture();
            return ret;
        }, arguments); },
        __wbg_getMappedRange_fd3092e276caa831: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.getMappedRange(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_getPreferredCanvasFormat_f775f4ebe1768892: function(arg0) {
            const ret = arg0.getPreferredCanvasFormat();
            return (__wbindgen_enum_GpuTextureFormat.indexOf(ret) + 1 || 102) - 1;
        },
        __wbg_get_0c55869fe53c7d14: function(arg0, arg1) {
            const ret = arg0[arg1 >>> 0];
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_gpu_aa311a9494720027: function(arg0) {
            const ret = arg0.gpu;
            return ret;
        },
        __wbg_has_47b8eb16db92789a: function(arg0, arg1, arg2) {
            const ret = arg0.has(getStringFromWasm0(arg1, arg2));
            return ret;
        },
        __wbg_height_a587c99454238459: function(arg0) {
            const ret = arg0.height;
            return ret;
        },
        __wbg_height_a6466ebf29036658: function(arg0) {
            const ret = arg0.height;
            return ret;
        },
        __wbg_height_ac6f1c3f49c13fe2: function(arg0) {
            const ret = arg0.height;
            return ret;
        },
        __wbg_instanceof_GpuOutOfMemoryError_72d4f143d9ec20cb: function(arg0) {
            let result;
            try {
                result = arg0 instanceof GPUOutOfMemoryError;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_GpuValidationError_cdb716bc3a7ed585: function(arg0) {
            let result;
            try {
                result = arg0 instanceof GPUValidationError;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_HtmlCanvasElement_89f280683e987b9e: function(arg0) {
            let result;
            try {
                result = arg0 instanceof HTMLCanvasElement;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_HtmlImageElement_f22acd64d72ae23a: function(arg0) {
            let result;
            try {
                result = arg0 instanceof HTMLImageElement;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_ImageBitmap_536fdba57df2c6ac: function(arg0) {
            let result;
            try {
                result = arg0 instanceof ImageBitmap;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_OffscreenCanvas_fcf6ec01367f54ec: function(arg0) {
            let result;
            try {
                result = arg0 instanceof OffscreenCanvas;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Window_5cf453f5639aa1a2: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Window;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_label_b4e9fa173fb30ad5: function(arg0, arg1) {
            const ret = arg1.label;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        },
        __wbg_length_186163212ffe79c3: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_limits_7f838192fdb36f0a: function(arg0) {
            const ret = arg0.limits;
            return ret;
        },
        __wbg_mapAsync_84aeaa5780c9b8c7: function(arg0, arg1, arg2, arg3) {
            const ret = arg0.mapAsync(arg1 >>> 0, arg2, arg3);
            return ret;
        },
        __wbg_maxBindGroupsPlusVertexBuffers_5a483d2af94e57bc: function(arg0) {
            const ret = arg0.maxBindGroupsPlusVertexBuffers;
            return ret;
        },
        __wbg_maxBindGroups_8280e3693e832071: function(arg0) {
            const ret = arg0.maxBindGroups;
            return ret;
        },
        __wbg_maxBindingsPerBindGroup_872ae44e536b19a5: function(arg0) {
            const ret = arg0.maxBindingsPerBindGroup;
            return ret;
        },
        __wbg_maxBufferSize_9dae4d9428e42f10: function(arg0) {
            const ret = arg0.maxBufferSize;
            return ret;
        },
        __wbg_maxColorAttachmentBytesPerSample_12d8884108587e97: function(arg0) {
            const ret = arg0.maxColorAttachmentBytesPerSample;
            return ret;
        },
        __wbg_maxColorAttachments_deb9217288cb10c6: function(arg0) {
            const ret = arg0.maxColorAttachments;
            return ret;
        },
        __wbg_maxComputeInvocationsPerWorkgroup_c4b13a829ed0b259: function(arg0) {
            const ret = arg0.maxComputeInvocationsPerWorkgroup;
            return ret;
        },
        __wbg_maxComputeWorkgroupSizeX_91c35c8e026d4b2e: function(arg0) {
            const ret = arg0.maxComputeWorkgroupSizeX;
            return ret;
        },
        __wbg_maxComputeWorkgroupSizeY_961e4fb0ccb8e424: function(arg0) {
            const ret = arg0.maxComputeWorkgroupSizeY;
            return ret;
        },
        __wbg_maxComputeWorkgroupSizeZ_62c453c3b2746fe1: function(arg0) {
            const ret = arg0.maxComputeWorkgroupSizeZ;
            return ret;
        },
        __wbg_maxComputeWorkgroupStorageSize_dcf9113c2281aa6c: function(arg0) {
            const ret = arg0.maxComputeWorkgroupStorageSize;
            return ret;
        },
        __wbg_maxComputeWorkgroupsPerDimension_c8e2df553b22565e: function(arg0) {
            const ret = arg0.maxComputeWorkgroupsPerDimension;
            return ret;
        },
        __wbg_maxDynamicStorageBuffersPerPipelineLayout_43810e253385b7f5: function(arg0) {
            const ret = arg0.maxDynamicStorageBuffersPerPipelineLayout;
            return ret;
        },
        __wbg_maxDynamicUniformBuffersPerPipelineLayout_e160bf315957a3a1: function(arg0) {
            const ret = arg0.maxDynamicUniformBuffersPerPipelineLayout;
            return ret;
        },
        __wbg_maxInterStageShaderVariables_62a6f8974aa80170: function(arg0) {
            const ret = arg0.maxInterStageShaderVariables;
            return ret;
        },
        __wbg_maxSampledTexturesPerShaderStage_45931d0d0e425368: function(arg0) {
            const ret = arg0.maxSampledTexturesPerShaderStage;
            return ret;
        },
        __wbg_maxSamplersPerShaderStage_fd87b1b55a1bce03: function(arg0) {
            const ret = arg0.maxSamplersPerShaderStage;
            return ret;
        },
        __wbg_maxStorageBufferBindingSize_bec702c6fccfd8d5: function(arg0) {
            const ret = arg0.maxStorageBufferBindingSize;
            return ret;
        },
        __wbg_maxStorageBuffersPerShaderStage_36af4d1cf6b73e49: function(arg0) {
            const ret = arg0.maxStorageBuffersPerShaderStage;
            return ret;
        },
        __wbg_maxStorageTexturesPerShaderStage_bf0523882733deac: function(arg0) {
            const ret = arg0.maxStorageTexturesPerShaderStage;
            return ret;
        },
        __wbg_maxTextureArrayLayers_7c675fa8f48e7e97: function(arg0) {
            const ret = arg0.maxTextureArrayLayers;
            return ret;
        },
        __wbg_maxTextureDimension1D_bb69683afe97bf80: function(arg0) {
            const ret = arg0.maxTextureDimension1D;
            return ret;
        },
        __wbg_maxTextureDimension2D_cee54c433bf3b9c1: function(arg0) {
            const ret = arg0.maxTextureDimension2D;
            return ret;
        },
        __wbg_maxTextureDimension3D_ae26b58b1450c99a: function(arg0) {
            const ret = arg0.maxTextureDimension3D;
            return ret;
        },
        __wbg_maxUniformBufferBindingSize_00f780f64f0dd7c4: function(arg0) {
            const ret = arg0.maxUniformBufferBindingSize;
            return ret;
        },
        __wbg_maxUniformBuffersPerShaderStage_2c2054e9d96df7ad: function(arg0) {
            const ret = arg0.maxUniformBuffersPerShaderStage;
            return ret;
        },
        __wbg_maxVertexAttributes_425aa710b80da882: function(arg0) {
            const ret = arg0.maxVertexAttributes;
            return ret;
        },
        __wbg_maxVertexBufferArrayStride_8f0c56e46eba7c97: function(arg0) {
            const ret = arg0.maxVertexBufferArrayStride;
            return ret;
        },
        __wbg_maxVertexBuffers_473f2615aa5963dd: function(arg0) {
            const ret = arg0.maxVertexBuffers;
            return ret;
        },
        __wbg_message_bb4d389df9355dd2: function(arg0, arg1) {
            const ret = arg1.message;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        },
        __wbg_minStorageBufferOffsetAlignment_f9ce2fe03a21a2e4: function(arg0) {
            const ret = arg0.minStorageBufferOffsetAlignment;
            return ret;
        },
        __wbg_minUniformBufferOffsetAlignment_bca4b75f696bbf11: function(arg0) {
            const ret = arg0.minUniformBufferOffsetAlignment;
            return ret;
        },
        __wbg_naturalHeight_fb7d27a9642e796c: function(arg0) {
            const ret = arg0.naturalHeight;
            return ret;
        },
        __wbg_naturalWidth_c3b5a9ac32cd185e: function(arg0) {
            const ret = arg0.naturalWidth;
            return ret;
        },
        __wbg_navigator_9641ab32fa612dd1: function(arg0) {
            const ret = arg0.navigator;
            return ret;
        },
        __wbg_navigator_c17f443a6fe5d38d: function(arg0) {
            const ret = arg0.navigator;
            return ret;
        },
        __wbg_new_2bfd0f45e60518b1: function() { return handleError(function (arg0, arg1) {
            const ret = new OffscreenCanvas(arg0 >>> 0, arg1 >>> 0);
            return ret;
        }, arguments); },
        __wbg_new_bb74001155cb8ca8: function() {
            const ret = new Error();
            return ret;
        },
        __wbg_new_cd4348290afae586: function() {
            const ret = new Object();
            return ret;
        },
        __wbg_new_typed_6b60b99917da27d6: function() {
            const ret = new Object();
            return ret;
        },
        __wbg_new_typed_e09da9dae6ee5935: function(arg0, arg1) {
            try {
                var state0 = {a: arg0, b: arg1};
                var cb0 = (arg0, arg1) => {
                    const a = state0.a;
                    state0.a = 0;
                    try {
                        return __wasm_bindgen_func_elem_1748(a, state0.b, arg0, arg1);
                    } finally {
                        state0.a = a;
                    }
                };
                const ret = new Promise(cb0);
                return ret;
            } finally {
                state0.a = 0;
            }
        },
        __wbg_new_with_byte_offset_and_length_3cd32055a417f095: function(arg0, arg1, arg2) {
            const ret = new Uint8Array(arg0, arg1 >>> 0, arg2 >>> 0);
            return ret;
        },
        __wbg_onSubmittedWorkDone_f62945abb48d8a84: function(arg0) {
            const ret = arg0.onSubmittedWorkDone();
            return ret;
        },
        __wbg_prototypesetcall_13162965d1fe7aa3: function(arg0, arg1, arg2) {
            Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
        },
        __wbg_querySelectorAll_6c1bd81d448fb480: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.querySelectorAll(getStringFromWasm0(arg1, arg2));
            return ret;
        }, arguments); },
        __wbg_queueMicrotask_1e8503a8a690f0a3: function(arg0) {
            const ret = arg0.queueMicrotask;
            return ret;
        },
        __wbg_queueMicrotask_4a1a4d8dd332373b: function(arg0) {
            queueMicrotask(arg0);
        },
        __wbg_queue_41b76331de876d9d: function(arg0) {
            const ret = arg0.queue;
            return ret;
        },
        __wbg_requestAdapter_b725cba92e32c4ce: function(arg0, arg1) {
            const ret = arg0.requestAdapter(arg1);
            return ret;
        },
        __wbg_requestDevice_45bc1149c3b98eaf: function(arg0, arg1) {
            const ret = arg0.requestDevice(arg1);
            return ret;
        },
        __wbg_resolveQuerySet_3eb16017fd6ef873: function(arg0, arg1, arg2, arg3, arg4, arg5) {
            arg0.resolveQuerySet(arg1, arg2 >>> 0, arg3 >>> 0, arg4, arg5 >>> 0);
        },
        __wbg_resolve_dbf78ab4942478b0: function(arg0) {
            const ret = Promise.resolve(arg0);
            return ret;
        },
        __wbg_setBindGroup_09aa10258bd4dc11: function(arg0, arg1, arg2) {
            arg0.setBindGroup(arg1 >>> 0, arg2);
        },
        __wbg_setBindGroup_0e4a7b8b254673b9: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
            arg0.setBindGroup(arg1 >>> 0, arg2, getArrayU32FromWasm0(arg3, arg4), arg5, arg6 >>> 0);
        }, arguments); },
        __wbg_setBindGroup_1a145239764ea257: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
            arg0.setBindGroup(arg1 >>> 0, arg2, getArrayU32FromWasm0(arg3, arg4), arg5, arg6 >>> 0);
        }, arguments); },
        __wbg_setBindGroup_c3a39fd8d0149600: function(arg0, arg1, arg2) {
            arg0.setBindGroup(arg1 >>> 0, arg2);
        },
        __wbg_setIndexBuffer_1872a074063dc4d2: function(arg0, arg1, arg2, arg3, arg4) {
            arg0.setIndexBuffer(arg1, __wbindgen_enum_GpuIndexFormat[arg2], arg3, arg4);
        },
        __wbg_setPipeline_1368374122476dc8: function(arg0, arg1) {
            arg0.setPipeline(arg1);
        },
        __wbg_setPipeline_823fe7d48236b840: function(arg0, arg1) {
            arg0.setPipeline(arg1);
        },
        __wbg_setScissorRect_5b13089a95f2dadd: function(arg0, arg1, arg2, arg3, arg4) {
            arg0.setScissorRect(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0, arg4 >>> 0);
        },
        __wbg_setVertexBuffer_6cb9f5432f1462e2: function(arg0, arg1, arg2, arg3, arg4) {
            arg0.setVertexBuffer(arg1 >>> 0, arg2, arg3, arg4);
        },
        __wbg_setVertexBuffer_ff00b7e9bfd9257d: function(arg0, arg1, arg2, arg3) {
            arg0.setVertexBuffer(arg1 >>> 0, arg2, arg3);
        },
        __wbg_set_118fefd528ab0a79: function(arg0, arg1, arg2) {
            arg0.set(arg1, arg2 >>> 0);
        },
        __wbg_set_2793479888329cb6: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = Reflect.set(arg0, arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_set_a_b8a7f56fa358e664: function(arg0, arg1) {
            arg0.a = arg1;
        },
        __wbg_set_access_46b3e62b6a30d608: function(arg0, arg1) {
            arg0.access = __wbindgen_enum_GpuStorageTextureAccess[arg1];
        },
        __wbg_set_address_mode_u_f67593eba8917d58: function(arg0, arg1) {
            arg0.addressModeU = __wbindgen_enum_GpuAddressMode[arg1];
        },
        __wbg_set_address_mode_v_8366e992c3ec2680: function(arg0, arg1) {
            arg0.addressModeV = __wbindgen_enum_GpuAddressMode[arg1];
        },
        __wbg_set_address_mode_w_53ae7ff9fc27d31b: function(arg0, arg1) {
            arg0.addressModeW = __wbindgen_enum_GpuAddressMode[arg1];
        },
        __wbg_set_alpha_041ea339c691473c: function(arg0, arg1) {
            arg0.alpha = arg1;
        },
        __wbg_set_alpha_mode_edf7c742eee7ac74: function(arg0, arg1) {
            arg0.alphaMode = __wbindgen_enum_GpuCanvasAlphaMode[arg1];
        },
        __wbg_set_alpha_to_coverage_enabled_66b16e2395f2145a: function(arg0, arg1) {
            arg0.alphaToCoverageEnabled = arg1 !== 0;
        },
        __wbg_set_array_layer_count_f652f75c2d85d00b: function(arg0, arg1) {
            arg0.arrayLayerCount = arg1 >>> 0;
        },
        __wbg_set_array_stride_f64_d4a555ef4287a90a: function(arg0, arg1) {
            arg0.arrayStride = arg1;
        },
        __wbg_set_aspect_0820f36ab69e69c7: function(arg0, arg1) {
            arg0.aspect = __wbindgen_enum_GpuTextureAspect[arg1];
        },
        __wbg_set_aspect_4eaf6e4f871485aa: function(arg0, arg1) {
            arg0.aspect = __wbindgen_enum_GpuTextureAspect[arg1];
        },
        __wbg_set_aspect_6d1e8e6bdf0ac1a6: function(arg0, arg1) {
            arg0.aspect = __wbindgen_enum_GpuTextureAspect[arg1];
        },
        __wbg_set_attributes_6753fa3eefb33349: function(arg0, arg1, arg2) {
            arg0.attributes = getArrayJsValueViewFromWasm0(arg1, arg2);
        },
        __wbg_set_b_1f0c9c5f62003b93: function(arg0, arg1) {
            arg0.b = arg1;
        },
        __wbg_set_base_array_layer_766baefe617e7450: function(arg0, arg1) {
            arg0.baseArrayLayer = arg1 >>> 0;
        },
        __wbg_set_base_mip_level_6c4e57453fe07edf: function(arg0, arg1) {
            arg0.baseMipLevel = arg1 >>> 0;
        },
        __wbg_set_beginning_of_pass_write_index_bda54c444871cf36: function(arg0, arg1) {
            arg0.beginningOfPassWriteIndex = arg1 >>> 0;
        },
        __wbg_set_beginning_of_pass_write_index_ce26d46a975d94e3: function(arg0, arg1) {
            arg0.beginningOfPassWriteIndex = arg1 >>> 0;
        },
        __wbg_set_bind_group_layouts_78efad321b8db306: function(arg0, arg1, arg2) {
            arg0.bindGroupLayouts = getArrayJsValueViewFromWasm0(arg1, arg2);
        },
        __wbg_set_binding_49121810d92bb656: function(arg0, arg1) {
            arg0.binding = arg1 >>> 0;
        },
        __wbg_set_binding_921af47b178839b7: function(arg0, arg1) {
            arg0.binding = arg1 >>> 0;
        },
        __wbg_set_blend_9b68fe4192551c11: function(arg0, arg1) {
            arg0.blend = arg1;
        },
        __wbg_set_buffer_e254d16772ccdf1f: function(arg0, arg1) {
            arg0.buffer = arg1;
        },
        __wbg_set_buffer_f0412de54dad59a0: function(arg0, arg1) {
            arg0.buffer = arg1;
        },
        __wbg_set_buffers_4bae4e561a9fa5bc: function(arg0, arg1, arg2) {
            arg0.buffers = getArrayJsValueViewFromWasm0(arg1, arg2);
        },
        __wbg_set_bytes_per_row_2edc74cba6ac1b69: function(arg0, arg1) {
            arg0.bytesPerRow = arg1 >>> 0;
        },
        __wbg_set_clear_value_gpu_color_dict_b12131c44b7f5a0b: function(arg0, arg1) {
            arg0.clearValue = arg1;
        },
        __wbg_set_code_71b4a924b594417d: function(arg0, arg1, arg2) {
            arg0.code = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_color_173beb3f62e0fe38: function(arg0, arg1) {
            arg0.color = arg1;
        },
        __wbg_set_color_attachments_bb683d934e2d6222: function(arg0, arg1, arg2) {
            arg0.colorAttachments = getArrayJsValueViewFromWasm0(arg1, arg2);
        },
        __wbg_set_compare_1f37d6bc9b4479b5: function(arg0, arg1) {
            arg0.compare = __wbindgen_enum_GpuCompareFunction[arg1];
        },
        __wbg_set_compare_9f209c2a21e5f8cc: function(arg0, arg1) {
            arg0.compare = __wbindgen_enum_GpuCompareFunction[arg1];
        },
        __wbg_set_compute_6328b3ac805fa957: function(arg0, arg1) {
            arg0.compute = arg1;
        },
        __wbg_set_count_02820c919f8591db: function(arg0, arg1) {
            arg0.count = arg1 >>> 0;
        },
        __wbg_set_count_c31ce44133f5b28b: function(arg0, arg1) {
            arg0.count = arg1 >>> 0;
        },
        __wbg_set_cull_mode_2571e6256445d311: function(arg0, arg1) {
            arg0.cullMode = __wbindgen_enum_GpuCullMode[arg1];
        },
        __wbg_set_depth_bias_9ff79c074fab3395: function(arg0, arg1) {
            arg0.depthBias = arg1;
        },
        __wbg_set_depth_bias_clamp_b9dfc0449214a137: function(arg0, arg1) {
            arg0.depthBiasClamp = arg1;
        },
        __wbg_set_depth_bias_slope_scale_bacfbadca941fcf5: function(arg0, arg1) {
            arg0.depthBiasSlopeScale = arg1;
        },
        __wbg_set_depth_clear_value_bbfc087b5b4b6d06: function(arg0, arg1) {
            arg0.depthClearValue = arg1;
        },
        __wbg_set_depth_compare_706f99d5a7658960: function(arg0, arg1) {
            arg0.depthCompare = __wbindgen_enum_GpuCompareFunction[arg1];
        },
        __wbg_set_depth_fail_op_8cc03f38206b087f: function(arg0, arg1) {
            arg0.depthFailOp = __wbindgen_enum_GpuStencilOperation[arg1];
        },
        __wbg_set_depth_load_op_96d40a8e26164544: function(arg0, arg1) {
            arg0.depthLoadOp = __wbindgen_enum_GpuLoadOp[arg1];
        },
        __wbg_set_depth_or_array_layers_41d9bf5003084813: function(arg0, arg1) {
            arg0.depthOrArrayLayers = arg1 >>> 0;
        },
        __wbg_set_depth_read_only_8be6458323119975: function(arg0, arg1) {
            arg0.depthReadOnly = arg1 !== 0;
        },
        __wbg_set_depth_stencil_attachment_7a083fe21730d473: function(arg0, arg1) {
            arg0.depthStencilAttachment = arg1;
        },
        __wbg_set_depth_stencil_f138ba545e6cc4d4: function(arg0, arg1) {
            arg0.depthStencil = arg1;
        },
        __wbg_set_depth_store_op_3e7ee4bf89cda835: function(arg0, arg1) {
            arg0.depthStoreOp = __wbindgen_enum_GpuStoreOp[arg1];
        },
        __wbg_set_depth_write_enabled_c1ad58fe7207ef11: function(arg0, arg1) {
            arg0.depthWriteEnabled = arg1 !== 0;
        },
        __wbg_set_device_2b7e0e4f69784351: function(arg0, arg1) {
            arg0.device = arg1;
        },
        __wbg_set_dimension_536f245d466cca10: function(arg0, arg1) {
            arg0.dimension = __wbindgen_enum_GpuTextureDimension[arg1];
        },
        __wbg_set_dimension_91e724d498a35c9a: function(arg0, arg1) {
            arg0.dimension = __wbindgen_enum_GpuTextureViewDimension[arg1];
        },
        __wbg_set_dst_factor_9789f02ad2a0c61e: function(arg0, arg1) {
            arg0.dstFactor = __wbindgen_enum_GpuBlendFactor[arg1];
        },
        __wbg_set_end_of_pass_write_index_4b0931cfb0c1f44c: function(arg0, arg1) {
            arg0.endOfPassWriteIndex = arg1 >>> 0;
        },
        __wbg_set_end_of_pass_write_index_bd996c6cc50b794b: function(arg0, arg1) {
            arg0.endOfPassWriteIndex = arg1 >>> 0;
        },
        __wbg_set_entries_02ae66da25c9ddae: function(arg0, arg1, arg2) {
            arg0.entries = getArrayJsValueViewFromWasm0(arg1, arg2);
        },
        __wbg_set_entries_8036374af27741dc: function(arg0, arg1, arg2) {
            arg0.entries = getArrayJsValueViewFromWasm0(arg1, arg2);
        },
        __wbg_set_entry_point_79bb4d8fb01c97ec: function(arg0, arg1, arg2) {
            arg0.entryPoint = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_entry_point_89ecd5ddd9c56d5c: function(arg0, arg1, arg2) {
            arg0.entryPoint = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_entry_point_b4eb7d2dd59b5c76: function(arg0, arg1, arg2) {
            arg0.entryPoint = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_external_texture_34c43368e77cc844: function(arg0, arg1) {
            arg0.externalTexture = arg1;
        },
        __wbg_set_fail_op_e901d7b520ae0e15: function(arg0, arg1) {
            arg0.failOp = __wbindgen_enum_GpuStencilOperation[arg1];
        },
        __wbg_set_flip_y_8ec15ff942bd5faf: function(arg0, arg1) {
            arg0.flipY = arg1 !== 0;
        },
        __wbg_set_format_1d70746424721ed1: function(arg0, arg1) {
            arg0.format = __wbindgen_enum_GpuTextureFormat[arg1];
        },
        __wbg_set_format_594ffafc6477f59d: function(arg0, arg1) {
            arg0.format = __wbindgen_enum_GpuTextureFormat[arg1];
        },
        __wbg_set_format_781ab1cf2f8f2465: function(arg0, arg1) {
            arg0.format = __wbindgen_enum_GpuVertexFormat[arg1];
        },
        __wbg_set_format_8003fc2174c14359: function(arg0, arg1) {
            arg0.format = __wbindgen_enum_GpuTextureFormat[arg1];
        },
        __wbg_set_format_c1603ca98ab9cb13: function(arg0, arg1) {
            arg0.format = __wbindgen_enum_GpuTextureFormat[arg1];
        },
        __wbg_set_format_cdccd8422de3c885: function(arg0, arg1) {
            arg0.format = __wbindgen_enum_GpuTextureFormat[arg1];
        },
        __wbg_set_format_df8baca64e04f5ef: function(arg0, arg1) {
            arg0.format = __wbindgen_enum_GpuTextureFormat[arg1];
        },
        __wbg_set_fragment_3635fd557dbd99bc: function(arg0, arg1) {
            arg0.fragment = arg1;
        },
        __wbg_set_front_face_13105806890daab7: function(arg0, arg1) {
            arg0.frontFace = __wbindgen_enum_GpuFrontFace[arg1];
        },
        __wbg_set_g_9d2890d6fb93dba4: function(arg0, arg1) {
            arg0.g = arg1;
        },
        __wbg_set_has_dynamic_offset_0086bc7faede16d1: function(arg0, arg1) {
            arg0.hasDynamicOffset = arg1 !== 0;
        },
        __wbg_set_height_546367a98b9ab695: function(arg0, arg1) {
            arg0.height = arg1 >>> 0;
        },
        __wbg_set_height_ae0610d318c3428c: function(arg0, arg1) {
            arg0.height = arg1 >>> 0;
        },
        __wbg_set_height_ae24c2f7d580ae0a: function(arg0, arg1) {
            arg0.height = arg1 >>> 0;
        },
        __wbg_set_label_0b78f43973577425: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_16858d210dffe9ff: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_1d7c053bc726e08f: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_1e431973068c0ea4: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_2d3e4456ff9a120a: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_39038ba992db5f45: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_5e1a79b630ee9fa3: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_89172d31c03b3375: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_a71d5f5c41bed969: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_d133ac18919ae10f: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_dcaa5d479cbb5311: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_dcb16ec336a5420d: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_e9f1af9890ad68b6: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_ea59541fa72ee985: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_ef8bfd8864e594a4: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_f9171cd5c971dbf2: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_layout_6b757fab7265d0f7: function(arg0, arg1) {
            arg0.layout = arg1;
        },
        __wbg_set_layout_905339a584186697: function(arg0, arg1) {
            arg0.layout = arg1;
        },
        __wbg_set_layout_bfddc4788acb0736: function(arg0, arg1) {
            arg0.layout = arg1;
        },
        __wbg_set_layout_gpu_auto_layout_mode_0e86cf27fd7c9e0c: function(arg0, arg1) {
            arg0.layout = __wbindgen_enum_GpuAutoLayoutMode[arg1];
        },
        __wbg_set_layout_gpu_auto_layout_mode_89827b74212f80b4: function(arg0, arg1) {
            arg0.layout = __wbindgen_enum_GpuAutoLayoutMode[arg1];
        },
        __wbg_set_load_op_9a24b40a8df7115b: function(arg0, arg1) {
            arg0.loadOp = __wbindgen_enum_GpuLoadOp[arg1];
        },
        __wbg_set_lod_max_clamp_c1935a38a79d7f3b: function(arg0, arg1) {
            arg0.lodMaxClamp = arg1;
        },
        __wbg_set_lod_min_clamp_27d01e7c2938fe09: function(arg0, arg1) {
            arg0.lodMinClamp = arg1;
        },
        __wbg_set_mag_filter_657599d734cdc0d9: function(arg0, arg1) {
            arg0.magFilter = __wbindgen_enum_GpuFilterMode[arg1];
        },
        __wbg_set_mapped_at_creation_a4cd55019116b792: function(arg0, arg1) {
            arg0.mappedAtCreation = arg1 !== 0;
        },
        __wbg_set_mask_7a39674fcbc00286: function(arg0, arg1) {
            arg0.mask = arg1 >>> 0;
        },
        __wbg_set_max_anisotropy_b05f95dcdfdae8bb: function(arg0, arg1) {
            arg0.maxAnisotropy = arg1;
        },
        __wbg_set_min_binding_size_f64_2458ad9bffad7ea7: function(arg0, arg1) {
            arg0.minBindingSize = arg1;
        },
        __wbg_set_min_filter_93e33f778b66ecb0: function(arg0, arg1) {
            arg0.minFilter = __wbindgen_enum_GpuFilterMode[arg1];
        },
        __wbg_set_mip_level_132cb1a8de4434d4: function(arg0, arg1) {
            arg0.mipLevel = arg1 >>> 0;
        },
        __wbg_set_mip_level_count_19560e4f63320832: function(arg0, arg1) {
            arg0.mipLevelCount = arg1 >>> 0;
        },
        __wbg_set_mip_level_count_ef313d3a441aa51e: function(arg0, arg1) {
            arg0.mipLevelCount = arg1 >>> 0;
        },
        __wbg_set_mip_level_dbdf4ee3ba07c689: function(arg0, arg1) {
            arg0.mipLevel = arg1 >>> 0;
        },
        __wbg_set_mipmap_filter_aacb60d49a794ef5: function(arg0, arg1) {
            arg0.mipmapFilter = __wbindgen_enum_GpuMipmapFilterMode[arg1];
        },
        __wbg_set_mode_73d9eb9243253108: function(arg0, arg1) {
            arg0.mode = __wbindgen_enum_GpuCanvasToneMappingMode[arg1];
        },
        __wbg_set_module_85e1d5368a2b9422: function(arg0, arg1) {
            arg0.module = arg1;
        },
        __wbg_set_module_bffb3e27ccc03d8d: function(arg0, arg1) {
            arg0.module = arg1;
        },
        __wbg_set_module_c746beebaa6ede01: function(arg0, arg1) {
            arg0.module = arg1;
        },
        __wbg_set_multisample_7471ab77b8e5a567: function(arg0, arg1) {
            arg0.multisample = arg1;
        },
        __wbg_set_multisampled_d385dcc24cbcdac9: function(arg0, arg1) {
            arg0.multisampled = arg1 !== 0;
        },
        __wbg_set_offset_f64_106ac70d42ed0b22: function(arg0, arg1) {
            arg0.offset = arg1;
        },
        __wbg_set_offset_f64_b1157147188cb175: function(arg0, arg1) {
            arg0.offset = arg1;
        },
        __wbg_set_offset_f64_f65aa794a52b87dc: function(arg0, arg1) {
            arg0.offset = arg1;
        },
        __wbg_set_onuncapturederror_1a772a1feba5ec1d: function(arg0, arg1) {
            arg0.onuncapturederror = arg1;
        },
        __wbg_set_operation_b82c9485304b393c: function(arg0, arg1) {
            arg0.operation = __wbindgen_enum_GpuBlendOperation[arg1];
        },
        __wbg_set_origin_gpu_origin_2d_dict_caec97b0c0ec6404: function(arg0, arg1) {
            arg0.origin = arg1;
        },
        __wbg_set_origin_gpu_origin_3d_dict_9daf983462369d1b: function(arg0, arg1) {
            arg0.origin = arg1;
        },
        __wbg_set_origin_gpu_origin_3d_dict_c2b5dc3bd3763139: function(arg0, arg1) {
            arg0.origin = arg1;
        },
        __wbg_set_pass_op_3b1d192c54b1a827: function(arg0, arg1) {
            arg0.passOp = __wbindgen_enum_GpuStencilOperation[arg1];
        },
        __wbg_set_power_preference_06107ba643e66249: function(arg0, arg1) {
            arg0.powerPreference = __wbindgen_enum_GpuPowerPreference[arg1];
        },
        __wbg_set_premultiplied_alpha_3898c3af6b1e9647: function(arg0, arg1) {
            arg0.premultipliedAlpha = arg1 !== 0;
        },
        __wbg_set_primitive_14377cb8cbd23584: function(arg0, arg1) {
            arg0.primitive = arg1;
        },
        __wbg_set_query_set_a1af7e0b244eb437: function(arg0, arg1) {
            arg0.querySet = arg1;
        },
        __wbg_set_query_set_da20f7d5b37c78e1: function(arg0, arg1) {
            arg0.querySet = arg1;
        },
        __wbg_set_r_473d4bd5f6ddbe44: function(arg0, arg1) {
            arg0.r = arg1;
        },
        __wbg_set_required_features_ef8aeb4d5f909e03: function(arg0, arg1, arg2) {
            arg0.requiredFeatures = getArrayJsValueViewFromWasm0(arg1, arg2);
        },
        __wbg_set_required_limits_a80a53fd4744ccb2: function(arg0, arg1) {
            arg0.requiredLimits = arg1;
        },
        __wbg_set_resolve_target_gpu_texture_view_6c8f66cd96330a45: function(arg0, arg1) {
            arg0.resolveTarget = arg1;
        },
        __wbg_set_resource_d37005b6a3d3375f: function(arg0, arg1) {
            arg0.resource = arg1;
        },
        __wbg_set_resource_gpu_buffer_binding_8e9be21bc9a45330: function(arg0, arg1) {
            arg0.resource = arg1;
        },
        __wbg_set_resource_gpu_texture_view_e3bf3810e7168d2b: function(arg0, arg1) {
            arg0.resource = arg1;
        },
        __wbg_set_rows_per_image_e9f4da51b05f4ee1: function(arg0, arg1) {
            arg0.rowsPerImage = arg1 >>> 0;
        },
        __wbg_set_sample_count_a4d54cf5bcf23914: function(arg0, arg1) {
            arg0.sampleCount = arg1 >>> 0;
        },
        __wbg_set_sample_type_660a4d77497517e2: function(arg0, arg1) {
            arg0.sampleType = __wbindgen_enum_GpuTextureSampleType[arg1];
        },
        __wbg_set_sampler_35b5b2e68532815b: function(arg0, arg1) {
            arg0.sampler = arg1;
        },
        __wbg_set_shader_location_e0fdb186c91ac5df: function(arg0, arg1) {
            arg0.shaderLocation = arg1 >>> 0;
        },
        __wbg_set_size_f64_04b949f2af8176ba: function(arg0, arg1) {
            arg0.size = arg1;
        },
        __wbg_set_size_f64_2418f77508fb05d7: function(arg0, arg1) {
            arg0.size = arg1;
        },
        __wbg_set_size_gpu_extent_3d_dict_7180918365da46d5: function(arg0, arg1) {
            arg0.size = arg1;
        },
        __wbg_set_source_b59a95b00843da17: function(arg0, arg1) {
            arg0.source = arg1;
        },
        __wbg_set_source_html_canvas_element_4f26d64b4546af95: function(arg0, arg1) {
            arg0.source = arg1;
        },
        __wbg_set_source_html_image_element_03aa0983cb0c34d2: function(arg0, arg1) {
            arg0.source = arg1;
        },
        __wbg_set_source_html_video_element_bf9ebfd8636f5c5e: function(arg0, arg1) {
            arg0.source = arg1;
        },
        __wbg_set_source_image_data_0e1d7f66bd0ad53d: function(arg0, arg1) {
            arg0.source = arg1;
        },
        __wbg_set_source_offscreen_canvas_83935447a290cc1a: function(arg0, arg1) {
            arg0.source = arg1;
        },
        __wbg_set_source_video_frame_a3865463cefb847b: function(arg0, arg1) {
            arg0.source = arg1;
        },
        __wbg_set_src_factor_e72cbac8c7084adc: function(arg0, arg1) {
            arg0.srcFactor = __wbindgen_enum_GpuBlendFactor[arg1];
        },
        __wbg_set_stencil_back_4df76dba55137aa9: function(arg0, arg1) {
            arg0.stencilBack = arg1;
        },
        __wbg_set_stencil_clear_value_686c18ee265a672c: function(arg0, arg1) {
            arg0.stencilClearValue = arg1 >>> 0;
        },
        __wbg_set_stencil_front_ec8c0eedf46d4973: function(arg0, arg1) {
            arg0.stencilFront = arg1;
        },
        __wbg_set_stencil_load_op_1bce6d97f680eda7: function(arg0, arg1) {
            arg0.stencilLoadOp = __wbindgen_enum_GpuLoadOp[arg1];
        },
        __wbg_set_stencil_read_mask_1f242f58d95e02e1: function(arg0, arg1) {
            arg0.stencilReadMask = arg1 >>> 0;
        },
        __wbg_set_stencil_read_only_50c3a3b3cbdc83c1: function(arg0, arg1) {
            arg0.stencilReadOnly = arg1 !== 0;
        },
        __wbg_set_stencil_store_op_9703f525bc5e8e0c: function(arg0, arg1) {
            arg0.stencilStoreOp = __wbindgen_enum_GpuStoreOp[arg1];
        },
        __wbg_set_stencil_write_mask_463f4b6208354e15: function(arg0, arg1) {
            arg0.stencilWriteMask = arg1 >>> 0;
        },
        __wbg_set_step_mode_c10a50b921560088: function(arg0, arg1) {
            arg0.stepMode = __wbindgen_enum_GpuVertexStepMode[arg1];
        },
        __wbg_set_storage_texture_c2ed1f3eb327112e: function(arg0, arg1) {
            arg0.storageTexture = arg1;
        },
        __wbg_set_store_op_e3edba4d13e36cbf: function(arg0, arg1) {
            arg0.storeOp = __wbindgen_enum_GpuStoreOp[arg1];
        },
        __wbg_set_strip_index_format_a7cb0b950f8653f8: function(arg0, arg1) {
            arg0.stripIndexFormat = __wbindgen_enum_GpuIndexFormat[arg1];
        },
        __wbg_set_targets_b24b23a20f1c7f7f: function(arg0, arg1, arg2) {
            arg0.targets = getArrayJsValueViewFromWasm0(arg1, arg2);
        },
        __wbg_set_texture_39ac35f54ef4c3ba: function(arg0, arg1) {
            arg0.texture = arg1;
        },
        __wbg_set_texture_8279b13f49532ba2: function(arg0, arg1) {
            arg0.texture = arg1;
        },
        __wbg_set_texture_c89ca659682f2fd6: function(arg0, arg1) {
            arg0.texture = arg1;
        },
        __wbg_set_timestamp_writes_90e77f617d9af260: function(arg0, arg1) {
            arg0.timestampWrites = arg1;
        },
        __wbg_set_timestamp_writes_9fd1c7b5cb0a6a5c: function(arg0, arg1) {
            arg0.timestampWrites = arg1;
        },
        __wbg_set_tone_mapping_92c0666fef742c68: function(arg0, arg1) {
            arg0.toneMapping = arg1;
        },
        __wbg_set_topology_ed2942658d3771ab: function(arg0, arg1) {
            arg0.topology = __wbindgen_enum_GpuPrimitiveTopology[arg1];
        },
        __wbg_set_type_4f916b69d83408df: function(arg0, arg1) {
            arg0.type = __wbindgen_enum_GpuQueryType[arg1];
        },
        __wbg_set_type_6cc967b44400577b: function(arg0, arg1) {
            arg0.type = __wbindgen_enum_GpuSamplerBindingType[arg1];
        },
        __wbg_set_type_dd6c71bc279b420e: function(arg0, arg1) {
            arg0.type = __wbindgen_enum_GpuBufferBindingType[arg1];
        },
        __wbg_set_unclipped_depth_f24953dc0eb8c84c: function(arg0, arg1) {
            arg0.unclippedDepth = arg1 !== 0;
        },
        __wbg_set_usage_1d663151adcb7f1a: function(arg0, arg1) {
            arg0.usage = arg1 >>> 0;
        },
        __wbg_set_usage_63cd5e88050b26e8: function(arg0, arg1) {
            arg0.usage = arg1 >>> 0;
        },
        __wbg_set_usage_6c4bd5f209a0579c: function(arg0, arg1) {
            arg0.usage = arg1 >>> 0;
        },
        __wbg_set_usage_a65753b69e218ec9: function(arg0, arg1) {
            arg0.usage = arg1 >>> 0;
        },
        __wbg_set_vertex_b8cfd3671e5edfbb: function(arg0, arg1) {
            arg0.vertex = arg1;
        },
        __wbg_set_view_dimension_ce6e77a9eb67aa53: function(arg0, arg1) {
            arg0.viewDimension = __wbindgen_enum_GpuTextureViewDimension[arg1];
        },
        __wbg_set_view_dimension_d5c87d8c6f1266b5: function(arg0, arg1) {
            arg0.viewDimension = __wbindgen_enum_GpuTextureViewDimension[arg1];
        },
        __wbg_set_view_formats_8b40d61be4d5be29: function(arg0, arg1, arg2) {
            arg0.viewFormats = getArrayJsValueViewFromWasm0(arg1, arg2);
        },
        __wbg_set_view_formats_ea87e3d240842107: function(arg0, arg1, arg2) {
            arg0.viewFormats = getArrayJsValueViewFromWasm0(arg1, arg2);
        },
        __wbg_set_view_gpu_texture_view_bf636cc659953b65: function(arg0, arg1) {
            arg0.view = arg1;
        },
        __wbg_set_view_gpu_texture_view_d53664457085e78b: function(arg0, arg1) {
            arg0.view = arg1;
        },
        __wbg_set_visibility_f68d6576737b8b45: function(arg0, arg1) {
            arg0.visibility = arg1 >>> 0;
        },
        __wbg_set_width_5f89a551b5472887: function(arg0, arg1) {
            arg0.width = arg1 >>> 0;
        },
        __wbg_set_width_eb3001e1dcabb909: function(arg0, arg1) {
            arg0.width = arg1 >>> 0;
        },
        __wbg_set_width_fc76d04c0309b403: function(arg0, arg1) {
            arg0.width = arg1 >>> 0;
        },
        __wbg_set_write_mask_51378295d978a0f8: function(arg0, arg1) {
            arg0.writeMask = arg1 >>> 0;
        },
        __wbg_set_x_aa58610e8a2b3347: function(arg0, arg1) {
            arg0.x = arg1 >>> 0;
        },
        __wbg_set_x_c3ba1f5cf2cec3b7: function(arg0, arg1) {
            arg0.x = arg1 >>> 0;
        },
        __wbg_set_y_6a3e943d5ad07e0d: function(arg0, arg1) {
            arg0.y = arg1 >>> 0;
        },
        __wbg_set_y_d8105826fde6f243: function(arg0, arg1) {
            arg0.y = arg1 >>> 0;
        },
        __wbg_set_z_dc1a88e5f0e1508d: function(arg0, arg1) {
            arg0.z = arg1 >>> 0;
        },
        __wbg_stack_575c4e0918581b9c: function(arg0, arg1) {
            const ret = arg1.stack;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        },
        __wbg_static_accessor_GLOBAL_THIS_003ee833af9699fc: function() {
            const ret = typeof globalThis === 'undefined' ? undefined : globalThis;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_GLOBAL_e4293fb22cbe77da: function() {
            const ret = typeof global === 'undefined' ? undefined : global;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_SELF_53bb20457401453d: function() {
            const ret = typeof self === 'undefined' ? undefined : self;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_WINDOW_b5e0810bfecb7feb: function() {
            const ret = typeof window === 'undefined' ? undefined : window;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_submit_c4379e221512d3fa: function(arg0, arg1, arg2) {
            arg0.submit(getArrayJsValueViewFromWasm0(arg1, arg2));
        },
        __wbg_then_656f253a5dd7d8ea: function(arg0, arg1, arg2) {
            const ret = arg0.then(arg1, arg2);
            return ret;
        },
        __wbg_then_e3f7f2d365708be8: function(arg0, arg1) {
            const ret = arg0.then(arg1);
            return ret;
        },
        __wbg_unconfigure_7ca436ff70c0bcc3: function(arg0) {
            arg0.unconfigure();
        },
        __wbg_unmap_073211b910c6a369: function(arg0) {
            arg0.unmap();
        },
        __wbg_valueOf_2ad4a09774ac959e: function(arg0) {
            const ret = arg0.valueOf();
            return ret;
        },
        __wbg_width_000813f5f73b7341: function(arg0) {
            const ret = arg0.width;
            return ret;
        },
        __wbg_width_babc5dc7654771b1: function(arg0) {
            const ret = arg0.width;
            return ret;
        },
        __wbg_width_f84552448726a9a9: function(arg0) {
            const ret = arg0.width;
            return ret;
        },
        __wbg_writeBuffer_dbc00ede89a23b5e: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
            arg0.writeBuffer(arg1, arg2, getArrayU8FromWasm0(arg3, arg4), arg5, arg6);
        }, arguments); },
        __wbg_writeTexture_ddcddb10ef4a4155: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5) {
            arg0.writeTexture(arg1, getArrayU8FromWasm0(arg2, arg3), arg4, arg5);
        }, arguments); },
        __wbindgen_generic_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [Externref], shim_idx: 92, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, __wasm_bindgen_func_elem_1723);
            return ret;
        },
        __wbindgen_generic_0000000000000002: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("GPUDevice")], shim_idx: 31, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, __wasm_bindgen_func_elem_598);
            return ret;
        },
        __wbindgen_generic_0000000000000003: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("GPUUncapturedErrorEvent")], shim_idx: 35, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, __wasm_bindgen_func_elem_600);
            return ret;
        },
        __wbindgen_generic_0000000000000004: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("any")], shim_idx: 31, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, __wasm_bindgen_func_elem_598_46);
            return ret;
        },
        __wbindgen_generic_0000000000000005: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("undefined")], shim_idx: 31, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, __wasm_bindgen_func_elem_598_47);
            return ret;
        },
        __wbindgen_generic_0000000000000006: function(arg0) {
            // Cast intrinsic for `F64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_generic_0000000000000007: function(arg0, arg1) {
            // Cast intrinsic for `Ref(Slice(U8)) -> NamedExternref("Uint8Array")`.
            const ret = getArrayU8FromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_generic_0000000000000008: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            table.set(0, undefined);
            table.set(1024, undefined);
            table.set(1025, null);
            table.set(1026, true);
            table.set(1027, false);
        },
    };
    return {
        __proto__: null,
        "./bulwark_bg.js": import0,
    };
}

function __wasm_bindgen_func_elem_600(arg0, arg1, arg2) {
    wasm.__wasm_bindgen_func_elem_600(arg0, arg1, arg2);
}

function __wasm_bindgen_func_elem_1748(arg0, arg1, arg2, arg3) {
    wasm.__wasm_bindgen_func_elem_1748(arg0, arg1, arg2, arg3);
}

function __wasm_bindgen_func_elem_1723(arg0, arg1, arg2) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16) >>> 0;
        wasm.__wasm_bindgen_func_elem_1723(retptr, arg0, arg1, arg2);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        if (r1) {
            throw takeFromExternrefTable0(r0);
        }
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

function __wasm_bindgen_func_elem_598(arg0, arg1, arg2) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16) >>> 0;
        wasm.__wasm_bindgen_func_elem_598(retptr, arg0, arg1, arg2);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        if (r1) {
            throw takeFromExternrefTable0(r0);
        }
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

function __wasm_bindgen_func_elem_598_46(arg0, arg1, arg2) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16) >>> 0;
        wasm.__wasm_bindgen_func_elem_598_46(retptr, arg0, arg1, arg2);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        if (r1) {
            throw takeFromExternrefTable0(r0);
        }
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

function __wasm_bindgen_func_elem_598_47(arg0, arg1, arg2) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16) >>> 0;
        wasm.__wasm_bindgen_func_elem_598_47(retptr, arg0, arg1, arg2);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        if (r1) {
            throw takeFromExternrefTable0(r0);
        }
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}


const __wbindgen_enum_GpuAddressMode = ["clamp-to-edge", "repeat", "mirror-repeat"];


const __wbindgen_enum_GpuAutoLayoutMode = ["auto"];


const __wbindgen_enum_GpuBlendFactor = ["zero", "one", "src", "one-minus-src", "src-alpha", "one-minus-src-alpha", "dst", "one-minus-dst", "dst-alpha", "one-minus-dst-alpha", "src-alpha-saturated", "constant", "one-minus-constant", "src1", "one-minus-src1", "src1-alpha", "one-minus-src1-alpha"];


const __wbindgen_enum_GpuBlendOperation = ["add", "subtract", "reverse-subtract", "min", "max"];


const __wbindgen_enum_GpuBufferBindingType = ["uniform", "storage", "read-only-storage"];


const __wbindgen_enum_GpuCanvasAlphaMode = ["opaque", "premultiplied"];


const __wbindgen_enum_GpuCanvasToneMappingMode = ["standard", "extended"];


const __wbindgen_enum_GpuCompareFunction = ["never", "less", "equal", "less-equal", "greater", "not-equal", "greater-equal", "always"];


const __wbindgen_enum_GpuCullMode = ["none", "front", "back"];


const __wbindgen_enum_GpuFilterMode = ["nearest", "linear"];


const __wbindgen_enum_GpuFrontFace = ["ccw", "cw"];


const __wbindgen_enum_GpuIndexFormat = ["uint16", "uint32"];


const __wbindgen_enum_GpuLoadOp = ["load", "clear"];


const __wbindgen_enum_GpuMipmapFilterMode = ["nearest", "linear"];


const __wbindgen_enum_GpuPowerPreference = ["low-power", "high-performance"];


const __wbindgen_enum_GpuPrimitiveTopology = ["point-list", "line-list", "line-strip", "triangle-list", "triangle-strip"];


const __wbindgen_enum_GpuQueryType = ["occlusion", "timestamp"];


const __wbindgen_enum_GpuSamplerBindingType = ["filtering", "non-filtering", "comparison"];


const __wbindgen_enum_GpuStencilOperation = ["keep", "zero", "replace", "invert", "increment-clamp", "decrement-clamp", "increment-wrap", "decrement-wrap"];


const __wbindgen_enum_GpuStorageTextureAccess = ["write-only", "read-only", "read-write"];


const __wbindgen_enum_GpuStoreOp = ["store", "discard"];


const __wbindgen_enum_GpuTextureAspect = ["all", "stencil-only", "depth-only"];


const __wbindgen_enum_GpuTextureDimension = ["1d", "2d", "3d"];


const __wbindgen_enum_GpuTextureFormat = ["r8unorm", "r8snorm", "r8uint", "r8sint", "r16unorm", "r16snorm", "r16uint", "r16sint", "r16float", "rg8unorm", "rg8snorm", "rg8uint", "rg8sint", "r32uint", "r32sint", "r32float", "rg16unorm", "rg16snorm", "rg16uint", "rg16sint", "rg16float", "rgba8unorm", "rgba8unorm-srgb", "rgba8snorm", "rgba8uint", "rgba8sint", "bgra8unorm", "bgra8unorm-srgb", "rgb9e5ufloat", "rgb10a2uint", "rgb10a2unorm", "rg11b10ufloat", "rg32uint", "rg32sint", "rg32float", "rgba16unorm", "rgba16snorm", "rgba16uint", "rgba16sint", "rgba16float", "rgba32uint", "rgba32sint", "rgba32float", "stencil8", "depth16unorm", "depth24plus", "depth24plus-stencil8", "depth32float", "depth32float-stencil8", "bc1-rgba-unorm", "bc1-rgba-unorm-srgb", "bc2-rgba-unorm", "bc2-rgba-unorm-srgb", "bc3-rgba-unorm", "bc3-rgba-unorm-srgb", "bc4-r-unorm", "bc4-r-snorm", "bc5-rg-unorm", "bc5-rg-snorm", "bc6h-rgb-ufloat", "bc6h-rgb-float", "bc7-rgba-unorm", "bc7-rgba-unorm-srgb", "etc2-rgb8unorm", "etc2-rgb8unorm-srgb", "etc2-rgb8a1unorm", "etc2-rgb8a1unorm-srgb", "etc2-rgba8unorm", "etc2-rgba8unorm-srgb", "eac-r11unorm", "eac-r11snorm", "eac-rg11unorm", "eac-rg11snorm", "astc-4x4-unorm", "astc-4x4-unorm-srgb", "astc-5x4-unorm", "astc-5x4-unorm-srgb", "astc-5x5-unorm", "astc-5x5-unorm-srgb", "astc-6x5-unorm", "astc-6x5-unorm-srgb", "astc-6x6-unorm", "astc-6x6-unorm-srgb", "astc-8x5-unorm", "astc-8x5-unorm-srgb", "astc-8x6-unorm", "astc-8x6-unorm-srgb", "astc-8x8-unorm", "astc-8x8-unorm-srgb", "astc-10x5-unorm", "astc-10x5-unorm-srgb", "astc-10x6-unorm", "astc-10x6-unorm-srgb", "astc-10x8-unorm", "astc-10x8-unorm-srgb", "astc-10x10-unorm", "astc-10x10-unorm-srgb", "astc-12x10-unorm", "astc-12x10-unorm-srgb", "astc-12x12-unorm", "astc-12x12-unorm-srgb"];


const __wbindgen_enum_GpuTextureSampleType = ["float", "unfilterable-float", "depth", "sint", "uint"];


const __wbindgen_enum_GpuTextureViewDimension = ["1d", "2d", "2d-array", "cube", "cube-array", "3d"];


const __wbindgen_enum_GpuVertexFormat = ["uint8", "uint8x2", "uint8x4", "sint8", "sint8x2", "sint8x4", "unorm8", "unorm8x2", "unorm8x4", "snorm8", "snorm8x2", "snorm8x4", "uint16", "uint16x2", "uint16x4", "sint16", "sint16x2", "sint16x4", "unorm16", "unorm16x2", "unorm16x4", "snorm16", "snorm16x2", "snorm16x4", "float16", "float16x2", "float16x4", "float32", "float32x2", "float32x3", "float32x4", "uint32", "uint32x2", "uint32x3", "uint32x4", "sint32", "sint32x2", "sint32x3", "sint32x4", "unorm10-10-10-2", "unorm8x4-bgra"];


const __wbindgen_enum_GpuVertexStepMode = ["vertex", "instance"];
const EngineFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_engine_free(ptr, 1));

function addToExternrefTable0(obj) {
    const idx = wasm.__wbindgen_export5();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

const CLOSURE_DTORS = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(state => wasm.__wbindgen_export6(state.a, state.b));

function debugString(val) {
    switch (typeof val) {
        // primitive types
        case 'number':
        case 'boolean':
        case 'undefined':
        return `${val}`;
        case 'string':
        return JSON.stringify(val);
        case 'bigint':
        return `${val}n`;
        case 'symbol':
        return val.description !== undefined
            ? `Symbol(${val.description})`
            : 'Symbol';
        case 'function':
        return typeof val.name === 'string' && val.name !== ''
            ? `Function(${val.name})`
            : 'Function';
        case 'object': {
            if (val === null) {
                return 'null';
            }
            // objects
            if (Array.isArray(val)) {
                return '[' + Array.from(val, debugString).join(', ') + ']';
            }
            // errors
            if (val instanceof Error) {
                return `${val.name}: ${val.message}\n${val.stack}`;
            }

            const toStringOutput = toString.call(val);
            // Test for built-in
            const className = /\[object ([^\]]+)\]/.exec(toStringOutput)?.[1];

            // Failed to match the standard '[object ClassName]'
            if (className === undefined) {
                return toStringOutput;
            }
            if (className === 'Object') {
                // we're a user defined class or Object
                // JSON.stringify avoids problems with cycles, and is generally much
                // easier than looping through ownProperties of `val`.
                try {
                    return 'Object(' + JSON.stringify(val) + ')';
                } catch (_) {
                    return 'Object';
                }
            }
            // TODO we could test for more things here, like `Set`s and `Map`s.
            return className;
        }
        // Per MDN: 'This list of values is exhaustive.'
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/typeof#description
    }
}

function getArrayF32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayJsValueViewFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    const mem = getDataViewMemory0();
    const result = [];
    for (let i = ptr; i < ptr + 4 * len; i += 4) {
        result.push(wasm.__wbindgen_externrefs.get(mem.getUint32(i, true)));
    }
    return result;
}

function getArrayU32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let cachedUint16ArrayMemory0 = null;
function getUint16ArrayMemory0() {
    if (cachedUint16ArrayMemory0 === null || cachedUint16ArrayMemory0.byteLength === 0) {
        cachedUint16ArrayMemory0 = new Uint16Array(wasm.memory.buffer);
    }
    return cachedUint16ArrayMemory0;
}

let cachedUint32ArrayMemory0 = null;
function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_export4(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function makeMutClosure(arg0, arg1, f) {
    const state = { a: arg0, b: arg1, cnt: 1 };
    const real = (...args) => {

        // First up with a closure we increment the internal reference
        // count. This ensures that the Rust closure environment won't
        // be deallocated while we're invoking it.
        state.cnt++;
        const a = state.a;
        state.a = 0;
        try {
            return f(a, state.b, ...args);
        } finally {
            state.a = a;
            real._wbg_cb_unref();
        }
    };
    real._wbg_cb_unref = () => {
        if (--state.cnt === 0) {
            wasm.__wbindgen_export6(state.a, state.b);
            state.a = 0;
            CLOSURE_DTORS.unregister(state);
        }
    };
    CLOSURE_DTORS.register(real, state, state);
    return real;
}

function passArray16ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 2, 2) >>> 0;
    getUint16ArrayMemory0().set(arg, ptr / 2);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArray32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getUint32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayF32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getFloat32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__wbindgen_export7(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(bytes) {
    numBytesDecoded += bytes.length;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true });
        cachedTextDecoder.decode();
        numBytesDecoded = bytes.length;
    }
    return cachedTextDecoder.decode(bytes);
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedFloat32ArrayMemory0 = null;
    cachedUint16ArrayMemory0 = null;
    cachedUint32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

let __wbg_init_promise;
async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;
    if (__wbg_init_promise === undefined) {
        __wbg_init_promise = __wbg_init_once(module_or_path);
        __wbg_init_promise.catch(() => { __wbg_init_promise = undefined; });
    }
    return __wbg_init_promise;
}

async function __wbg_init_once(module_or_path) {

    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('bulwark_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
