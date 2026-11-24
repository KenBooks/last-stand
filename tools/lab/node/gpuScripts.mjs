// Scripts every lab page runs first (`PAGE_SCRIPTS` in browser.mjs) that watch the page's WebGPU devices: each is
// serialized into the page, so it uses nothing from this module.

/**
 * Each WebGPU shader module's code kept by the module, for `lab programs --cost`, which compiles the engine's
 * pipelines again with their code salted: the game keeps no shader's code (the engine hands it to the device and
 * lets it go), and a module made before a command runs can't be asked for it.
 */
export function shaderCodes() {
  const device = globalThis.GPUDevice?.prototype;
  if (!device) return;
  const codes = new WeakMap();
  const make = device.createShaderModule;
  device.createShaderModule = function (descriptor) {
    const module = make.call(this, descriptor);
    if (typeof descriptor?.code === 'string') codes.set(module, descriptor.code);
    return module;
  };
  window.__labShaderCodes = codes;
}

/**
 * The most of each of WebGPU's limits the page's devices have used, by what was made on them (textures, buffers,
 * bind group layouts, pipeline layouts, bind groups, render pipelines), kept as `window.__labGpuUse`, for `lab
 * programs --limits`: a device asks its adapter's own limits (Bulwark's `device_on`), so a desktop draws what a
 * phone's device, given the defaults, refuses, and nothing said so. Each record is the most used and what used it.
 */
export function gpuUse() {
  const device = globalThis.GPUDevice?.prototype;
  if (!device) return;
  const use = {};
  window.__labGpuUse = use;
  const note = (limit, value, what) => {
    if (!(value > (use[limit]?.value ?? -1))) return;
    use[limit] = { value, what };
  };
  const stages = [['vertex', 1], ['fragment', 2], ['compute', 4]];
  /** a bind group layout's counts by kind and stage, and its entries' kinds by binding */
  const layouts = new WeakMap();
  const kindOf = (entry) => {
    if (entry.buffer) return entry.buffer.type === 'uniform' || !entry.buffer.type ? 'uniform' : 'storage';
    if (entry.sampler) return 'sampler';
    if (entry.storageTexture) return 'storage texture';
    return 'sampled texture';
  };
  const wrap = (name, after) => {
    const made = device[name];
    device[name] = function (descriptor) {
      const result = made.call(this, descriptor);
      try {
        after(descriptor ?? {}, result);
      } catch {
        // (a descriptor this doesn't read: the device's own check stands)
      }
      return result;
    };
  };
  wrap('createTexture', (descriptor) => {
    const size = Array.isArray(descriptor.size)
      ? { width: descriptor.size[0], height: descriptor.size[1] ?? 1, depthOrArrayLayers: descriptor.size[2] ?? 1 }
      : descriptor.size;
    const what = `the texture "${descriptor.label ?? ''}"`;
    const largest = Math.max(size.width ?? 1, size.height ?? 1);
    if (descriptor.dimension === '1d') note('maxTextureDimension1D', size.width, what);
    else if (descriptor.dimension === '3d') {
      note('maxTextureDimension3D', Math.max(largest, size.depthOrArrayLayers ?? 1), what);
    } else {
      note('maxTextureDimension2D', largest, what);
      note('maxTextureArrayLayers', size.depthOrArrayLayers ?? 1, what);
    }
  });
  wrap('createBuffer', (descriptor) => {
    note('maxBufferSize', descriptor.size, `the buffer "${descriptor.label ?? ''}"`);
  });
  wrap('createBindGroupLayout', (descriptor, layout) => {
    const entries = [...(descriptor.entries ?? [])];
    const counts = {};
    const kinds = new Map();
    for (const entry of entries) {
      const kind = kindOf(entry);
      kinds.set(entry.binding, kind);
      const dynamic = entry.buffer?.hasDynamicOffset ? `dynamic ${kind}` : null;
      for (const [stage, bit] of stages) {
        if (!(entry.visibility & bit)) continue;
        counts[`${kind} ${stage}`] = (counts[`${kind} ${stage}`] ?? 0) + 1;
      }
      if (dynamic) counts[dynamic] = (counts[dynamic] ?? 0) + 1;
    }
    layouts.set(layout, { counts, kinds });
    const bindings = entries.reduce((most, entry) => Math.max(most, entry.binding + 1), 0);
    note('maxBindingsPerBindGroup', bindings, `the bind group layout "${descriptor.label ?? ''}"`);
  });
  const perStage = {
    'sampled texture': 'maxSampledTexturesPerShaderStage',
    sampler: 'maxSamplersPerShaderStage',
    storage: 'maxStorageBuffersPerShaderStage',
    'storage texture': 'maxStorageTexturesPerShaderStage',
    uniform: 'maxUniformBuffersPerShaderStage',
  };
  /** each pipeline layout's count of bind groups */
  const groupCounts = new WeakMap();
  wrap('createPipelineLayout', (descriptor, made) => {
    const groups = [...(descriptor.bindGroupLayouts ?? [])];
    groupCounts.set(made, groups.length);
    const what = `the pipeline layout "${descriptor.label ?? ''}"`;
    note('maxBindGroups', groups.length, what);
    const sums = {};
    for (const group of groups) {
      for (const [key, count] of Object.entries(layouts.get(group)?.counts ?? {})) {
        sums[key] = (sums[key] ?? 0) + count;
      }
    }
    for (const [kind, limit] of Object.entries(perStage)) {
      for (const [stage] of stages) note(limit, sums[`${kind} ${stage}`] ?? 0, `${what}, its ${stage} stage`);
    }
    note('maxDynamicUniformBuffersPerPipelineLayout', sums['dynamic uniform'] ?? 0, what);
    note('maxDynamicStorageBuffersPerPipelineLayout', sums['dynamic storage'] ?? 0, what);
  });
  wrap('createBindGroup', (descriptor) => {
    const kinds = layouts.get(descriptor.layout)?.kinds;
    for (const entry of descriptor.entries ?? []) {
      const buffer = entry.resource?.buffer;
      if (!buffer) continue;
      const size = entry.resource.size ?? buffer.size - (entry.resource.offset ?? 0);
      const uniform = kinds?.get(entry.binding) === 'uniform';
      const limit = uniform ? 'maxUniformBufferBindingSize' : 'maxStorageBufferBindingSize';
      note(limit, size, `the bind group "${descriptor.label ?? ''}", its binding ${entry.binding}`);
    }
  });
  const pipeline = (descriptor) => {
    const what = `the render pipeline "${descriptor.label ?? ''}"`;
    const buffers = [...(descriptor.vertex?.buffers ?? [])].filter(Boolean);
    note('maxVertexBuffers', buffers.length, what);
    note('maxVertexAttributes', buffers.reduce((all, buffer) => all + (buffer.attributes?.length ?? 0), 0), what);
    const stride = buffers.reduce((most, buffer) => Math.max(most, buffer.arrayStride ?? 0), 0);
    note('maxVertexBufferArrayStride', stride, what);
    note('maxColorAttachments', descriptor.fragment?.targets?.length ?? 0, what);
    const groups = groupCounts.get(descriptor.layout) ?? 0;
    note('maxBindGroupsPlusVertexBuffers', groups + buffers.length, what);
  };
  wrap('createRenderPipeline', pipeline);
  wrap('createRenderPipelineAsync', pipeline);
}
