// `lab programs --limits`: what the engine's device uses of WebGPU's limits, held to what every device must give (the
// spec's defaults, which a browser hands a device that asks for nothing more). The engine asks its adapter for all its
// own limits (Bulwark's `device_on`), so on a desktop a texture, a bind group or a vertex layout past the defaults is
// made and drawn, where a phone's device, which may give no more than the defaults, refuses it and nothing is drawn
// (#470's palettes, under three, hid the hero on an S25 by a limit of the same kind). What the device used is
// recorded as it's made, by a page script of the lab's (`gpuUse` in node/gpuScripts.mjs): the textures' sizes, the
// buffers', the bind groups' and their layouts', each pipeline layout's per stage, the vertex buffers'. A feature
// beyond WebGPU's core may be missing on a device: each is said. `--canary` makes a texture one texel past the
// defaults, which must be found. (Under three this held each WebGL program's uniforms, attributes and samplers to a
// phone's least.)
import type { Report } from './lab';

/**
 * WebGPU's default limits: what every device gives (gpuweb's "Limits", the defaults column). A `min...` limit is an
 * alignment, which asked lower than this is asked of a GPU past the least.
 */
export const DEFAULT_LIMITS: Readonly<Record<string, number>> = {
  maxTextureDimension1D: 8192,
  maxTextureDimension2D: 8192,
  maxTextureDimension3D: 2048,
  maxTextureArrayLayers: 256,
  maxBindGroups: 4,
  maxBindGroupsPlusVertexBuffers: 24,
  maxBindingsPerBindGroup: 1000,
  maxDynamicUniformBuffersPerPipelineLayout: 8,
  maxDynamicStorageBuffersPerPipelineLayout: 4,
  maxSampledTexturesPerShaderStage: 16,
  maxSamplersPerShaderStage: 16,
  maxStorageBuffersPerShaderStage: 8,
  maxStorageTexturesPerShaderStage: 4,
  maxUniformBuffersPerShaderStage: 12,
  maxUniformBufferBindingSize: 65536,
  maxStorageBufferBindingSize: 134217728,
  minUniformBufferOffsetAlignment: 256,
  minStorageBufferOffsetAlignment: 256,
  maxVertexBuffers: 8,
  maxBufferSize: 268435456,
  maxVertexAttributes: 16,
  maxVertexBufferArrayStride: 2048,
  maxInterStageShaderVariables: 16,
  maxColorAttachments: 8,
  maxColorAttachmentBytesPerSample: 32,
  maxComputeWorkgroupStorageSize: 16384,
  maxComputeInvocationsPerWorkgroup: 256,
  maxComputeWorkgroupSizeX: 256,
  maxComputeWorkgroupSizeY: 256,
  maxComputeWorkgroupSizeZ: 64,
  maxComputeWorkgroupsPerDimension: 65535,
};

/** What the engine asked of its adapter (`DEVICE_ASKED`). */
export interface DeviceAsked {
  limits: Record<string, number>;
  features: string[];
}

/** The most of a limit the page's devices used, and what used it (`gpuUse` in node/gpuScripts.mjs). */
export interface LimitUsed { value: number; what: string }

/** What the page's devices have used of each limit so far, or none where the lab's page script didn't run. */
export function limitsUsed(): Record<string, LimitUsed> | undefined {
  return (window as unknown as { __labGpuUse?: Record<string, LimitUsed> }).__labGpuUse;
}

/** Whether `value` of limit `name` asks more than every device gives: past a max, under an alignment. */
function pastDefault(name: string, value: number): boolean {
  const least = DEFAULT_LIMITS[name];
  if (least === undefined) return false;
  return name.startsWith('min') ? value < least : value > least;
}

/** Each limit used past its default, as a line's words. */
function pastDefaults(used: Record<string, LimitUsed>): string[] {
  return Object.entries(used)
    .filter(([name, { value }]) => pastDefault(name, value))
    .map(([name, { value, what }]) => `${name} ${value} (every device: ${DEFAULT_LIMITS[name]}), by ${what}`);
}

/** the share of a max limit's default past which its use is said as near it */
const NEAR = 0.9;

/** Each max limit used past `NEAR` of its default and within it, as `name used/default`: one more of it on a phone
 *  and the device refuses it. */
function nearDefaults(used: Record<string, LimitUsed>): string[] {
  return Object.entries(used)
    .filter(([name, { value }]) => name.startsWith('max') && !pastDefault(name, value))
    .filter(([name, { value }]) => value >= NEAR * DEFAULT_LIMITS[name])
    .map(([name, { value, what }]) => `${name} ${value}/${DEFAULT_LIMITS[name]}, by ${what}`);
}

/** Each limit used, as `name used/default`. */
function usedText(used: Record<string, LimitUsed>): string {
  return Object.keys(DEFAULT_LIMITS)
    .filter((name) => used[name])
    .map((name) => `${name} ${used[name].value}/${DEFAULT_LIMITS[name]}`)
    .join(', ');
}

/** The canary: a texture made on `device` one texel wider than every device gives, which must be found. */
function plantTexture(device: object): void {
  const width = DEFAULT_LIMITS.maxTextureDimension2D + 1;
  const made = device as {
    createTexture(descriptor: object): { destroy(): void };
  };
  const texture = made.createTexture({
    label: 'lab programs --limits canary',
    size: [width, 1, 1],
    format: 'r8unorm',
    usage: 1,
  });
  texture.destroy();
}

/**
 * What the page's devices used of each limit held to what every device gives, with what the engine asked of its
 * adapter (its own, all it has), as lines and problems; with `canary` a texture past the defaults made on `device`,
 * which must be found.
 */
export function limitsReport(asked: DeviceAsked, device: object | null, canary: boolean): Report {
  const used = limitsUsed();
  if (!used) return { text: 'limits: no page script watched the device', problems: ['--limits: nothing watched'] };
  const past = pastDefaults(used);
  const askedPast = Object.entries(asked.limits).filter(([name, value]) => pastDefault(name, value)).length;
  const lines = [
    `the engine's devices used ${past.length} limits past what every WebGPU device gives (it asks its adapter's own: `
      + `${askedPast} past the defaults here)`,
    ...past.map((line) => `  ${line}`),
    ...nearDefaults(used).map((line) => `  near: ${line}`),
    `  used of each (most/every device's): ${usedText(used)}`,
    `  features beyond WebGPU's core: ${asked.features.join(', ') || 'none'} (each optional where a device has it)`,
  ];
  const problems = past.map((line) => `the engine uses ${line}: a phone's device may refuse it`);
  if (canary && device) {
    plantTexture(device);
    const caught = pastDefaults(limitsUsed() ?? {}).length > past.length;
    const wide = DEFAULT_LIMITS.maxTextureDimension2D + 1;
    lines.push(`  the canary: a texture ${wide} wide made (${caught ? 'caught' : 'missed'})`);
    if (!caught) problems.push('the limits\' canary: a texture past the defaults went unseen');
  }
  return { text: lines.join('\n'), problems };
}
