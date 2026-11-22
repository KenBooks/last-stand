// Which kind of depth-only pipeline a device refuses, asked of the device itself. Two phones' GPUs (Adreno 8xx on
// Vulkan) refused every pipeline of the depth drawn first and said only VK_ERROR_UNKNOWN. Those are the engine's
// only pipelines whose fragment shader gives nothing out (the shadows' have no fragment shader at all, and were
// made), which is a lead and not a proof. So when one is refused, a few tiny pipelines are tried on the same
// device, each with one thing of that shader's, and with each way round it; what was made and what wasn't goes in
// the self-check's report (`said.ts`), and the next change to the shader is chosen by what the device said.
import { fault } from './said';

interface ProbeDevice {
  createShaderModule(descriptor: { label: string; code: string }): object;
  createRenderPipelineAsync(descriptor: object): Promise<object>;
}

const VERTEX = `
struct Out { @builtin(position) clip: vec4f, @location(0) uv: vec2f }
@vertex fn vs(@builtin(vertex_index) i: u32) -> Out {
  var out: Out;
  out.clip = vec4f(f32(i) - 1.0, f32(i & 1u), 0.5, 1.0);
  out.uv = out.clip.xy;
  return out;
}`;

/** each probe: its name, its fragment shader (none: the pipeline has no fragment stage), whether it has a colour target written by nothing */
const PROBES: { name: string; fragment: string | null; target?: boolean }[] = [
  { name: 'no fragment shader', fragment: null },
  { name: 'a fragment shader giving nothing out', fragment: '@fragment fn fs() {}' },
  { name: 'giving nothing out, reading what the vertex gave', fragment: '@fragment fn fs(@location(0) uv: vec2f) { let x = uv.x; }' },
  { name: 'giving nothing out, dropping pixels', fragment: '@fragment fn fs(@location(0) uv: vec2f) { if (uv.x < 0.0) { discard; } }' },
  { name: 'giving nothing out, asking which face', fragment: '@fragment fn fs(@builtin(front_facing) front: bool) { if (!front) { discard; } }' },
  {
    name: 'dropping pixels, giving a colour no target keeps',
    fragment: '@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f { if (uv.x < 0.0) { discard; } return vec4f(0.0); }',
    target: true,
  },
  {
    name: 'dropping pixels, giving its depth',
    fragment: '@fragment fn fs(@builtin(position) at: vec4f, @location(0) uv: vec2f) -> @builtin(frag_depth) f32 '
      + '{ if (uv.x < 0.0) { discard; } return at.z; }',
  },
];

/** what the last probing found, a line: a harness reads it */
export let depthProbed = '';
let asked = false;

/** One probe's pipeline tried on `device`: 'made', or 'REFUSED' and what the GPU said. */
async function tried(device: ProbeDevice, probe: (typeof PROBES)[number]): Promise<string> {
  const vertex = { module: device.createShaderModule({ label: 'depth probe', code: VERTEX }), entryPoint: 'vs' };
  const fragment = probe.fragment === null ? undefined : {
    module: device.createShaderModule({ label: 'depth probe', code: probe.fragment }),
    entryPoint: 'fs',
    targets: probe.target ? [{ format: 'rgba16float', writeMask: 0 }] : [],
  };
  const depthStencil = { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less-equal' };
  try {
    await device.createRenderPipelineAsync({ label: 'depth probe', layout: 'auto', vertex, fragment, depthStencil });
    return 'made';
  } catch (refused) {
    return `REFUSED (${String((refused as { message?: string })?.message ?? refused).split('\n')[0].slice(0, 80)})`;
  }
}

/** The probes tried on `device`, once a page (`again` for a harness), and what each came to said as a fault's line. */
export async function probeDepthOnly(gpu: object, again = false): Promise<void> {
  if (asked && !again) return;
  asked = true;
  const device = gpu as ProbeDevice;
  const lines: string[] = [];
  for (const probe of PROBES) {
    lines.push(`${probe.name}: ${await tried(device, probe).catch((thrown: unknown) => `not tried (${String(thrown).slice(0, 80)})`)}`);
  }
  depthProbed = lines.join(' | ');
  fault('depth-only pipelines tried on this device', depthProbed);
}
