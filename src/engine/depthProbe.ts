// Which kind of depth-only pipeline a device refuses, asked of the device itself. Two phones' GPUs (Adreno 8xx on
// Vulkan) refused every pipeline of the depth drawn first and said only VK_ERROR_UNKNOWN. Those are the engine's
// only pipelines whose fragment shader gives nothing out (the shadows' have no fragment shader at all, and were
// made), which is a lead and not a proof. So when one is refused, a few tiny pipelines are tried on the same
// device, each with one thing of that shader's, and with each way round it; what was made and what wasn't goes in
// the self-check's report (`said.ts`), and the next change to the shader is chosen by what the device said.
import { fault, shaderCode } from './said';

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

interface Refused {
  vertex?: { module?: { label?: string } };
  fragment?: { module?: { label?: string }; entryPoint?: string; targets?: object[] };
  multisample?: { count?: number };
}

const SIGNED = 'in: VertexOut, @builtin(front_facing) front: bool';
const SEEN_THROUGH = 'if (see_left(in.world, in.clip.xy, vec3f(0.5)) < 0.0) { discard; }';
const MAPPED = 'let sampled = textureSample(t_base, samp, in.uv); if ((m.base * in.color * sampled).a < m.emissive.w) { discard; }';
const FACED = 'if (!front) { s.normal = -s.normal; }';
const SURFACE = 'var s: Surface; s.base = m.base * in.color * textureSample(t_base, samp, in.uv); '
  + `s.normal = normalize(in.normal); ${FACED} s.roughness = m.params.x; s.metalness = m.params.y; `
  + 's.emissive = m.emissive.rgb; s.specular = 1.0; s.sun_through = 0.0; s.fog = 1.0; s.shade = 1.0;';
/**
 * The engine's own `fs_depth` (Bulwark's lit.wgsl) written again a part at a time: each its name, its signature
 * and its body. The tiny probes above were all made on the phones that refuse the real one, so what they refuse
 * is in this shader itself.
 */
const BODIES: [name: string, signed: string, body: string][] = [
  ['an empty body', SIGNED, ''],
  ['an empty body, the face not asked', 'in: VertexOut', ''],
  ['what is seen through alone', SIGNED, SEEN_THROUGH],
  ['seen through, then a return inside an if', SIGNED, `if (m.emissive.w <= 0.0) { ${SEEN_THROUGH} return; }`],
  ['its map and its alpha alone', SIGNED, MAPPED],
  ['seen through and its map, no return', SIGNED, `${SEEN_THROUGH} ${MAPPED}`],
  // (all six above were made by the phones that refuse the whole: what's left of it is the surface and its hook)
  ['a surface made, no hook run', SIGNED, `${SURFACE} if (s.base.a < m.emissive.w) { discard; }`],
  ['a surface made, the face not read', SIGNED, `${SURFACE.replace(FACED, '')} if (!surface_hook(&s, in)) { discard; }`],
  ['a surface made and its hook run', SIGNED, `${SURFACE} if (!surface_hook(&s, in)) { discard; }`],
  ['the hook run, then what is seen through', SIGNED, `${SURFACE} if (!surface_hook(&s, in)) { discard; } ${SEEN_THROUGH}`],
  // (those too were made, and the whole was still refused: what none of them held)
  ['its map written again as an alpha map', SIGNED, 'var sampled = textureSample(t_base, samp, in.uv); '
    + 'if (m.flags.w > 1.5) { sampled = vec4f(1.0, 1.0, 1.0, sampled.g); } if (sampled.a < m.emissive.w) { discard; }'],
  ['its map read inside an if', SIGNED, 'if (m.emissive.w > 0.0) { let sampled = textureSample(t_base, samp, in.uv); '
    + 'if (sampled.a < m.emissive.w) { discard; } }'],
];

/** `code`'s own `fs_depth` body, as it stands (null: the code has none). */
function ownBody(code: string): string | null {
  const from = code.indexOf('fn fs_depth(');
  const open = code.indexOf('{', from);
  const whole = depthWritten(code, '', '');
  if (from < 0 || open < 0 || !whole) return null;
  const after = whole.length - (from + 'fn fs_depth() {  }'.length);
  return code.slice(open + 1, code.length - after - 1);
}

/** `code` with its `fs_depth` given `signed` and `body` (null: the code has none). */
export function depthWritten(code: string, signed: string, body: string): string | null {
  const from = code.indexOf('fn fs_depth(');
  const open = code.indexOf('{', from);
  if (from < 0 || open < 0) return null;
  let depth = 0, to = open;
  for (; to < code.length; to++) {
    if (code[to] === '{') depth++;
    else if (code[to] === '}' && --depth === 0) break;
  }
  return `${code.slice(0, from)}fn fs_depth(${signed}) { ${body} }${code.slice(to + 1)}`;
}

/** what the last probing of a refused pipeline found, a line: a harness reads it */
export let refusedProbed = '';

/** `refused` asked for again as `changed` makes it: 'made', or 'REFUSED' and what the GPU said. */
async function again(device: ProbeDevice, refused: Refused, changed: (descriptor: Refused) => Refused): Promise<string> {
  try {
    await device.createRenderPipelineAsync({ ...changed({ ...refused }), label: 'depth probe' });
    return 'made';
  } catch (thrown) {
    return `REFUSED (${String((thrown as { message?: string })?.message ?? thrown).split('\n')[0].slice(0, 60)})`;
  }
}

/**
 * The refused pipeline itself asked for again on its device, as it was and changed a thing at a time: its fragment
 * stage left out, a colour target nothing writes, and its shader's `fs_depth` a part at a time (`BODIES`, written
 * into the shader's own code, which `said.ts` kept).
 */
async function probeRefused(device: ProbeDevice, refused: Refused): Promise<void> {
  const lines: string[] = [];
  const say = async (name: string, changed: (descriptor: Refused) => Refused): Promise<void> => {
    lines.push(`${name}: ${await again(device, refused, changed).catch((thrown: unknown) => `not tried (${String(thrown).slice(0, 60)})`)}`);
  };
  await say('as it was', (descriptor) => descriptor);
  await say('no fragment stage', (descriptor) => ({ ...descriptor, fragment: undefined }));
  await say('a colour target nothing writes', (descriptor) => ({
    ...descriptor, fragment: { ...descriptor.fragment, targets: [{ format: 'rgba16float', writeMask: 0 }] },
  }));
  const label = refused.fragment?.module?.label ?? '';
  const code = shaderCode(label);
  if (!code) lines.push(`the shader "${label}" wasn't kept`);
  // (the control: the shader's own body sent again as a new shader. Made, the refusal isn't in its text at all)
  const own = code ? ownBody(code) : null;
  for (const [name, signed, body] of code ? [['its own body, sent again', SIGNED, own ?? ''] as const, ...BODIES] : []) {
    const written = depthWritten(code!, signed, body);
    if (!written) { lines.push(`${name}: no fs_depth in "${label}"`); continue; }
    const module = device.createShaderModule({ label: 'depth probe', code: written });
    await say(name, (descriptor) => ({
      ...descriptor, vertex: { ...descriptor.vertex, module }, fragment: { ...descriptor.fragment, module },
    }));
  }
  refusedProbed = lines.join(' | ');
  fault(`the refused pipeline (${refused.multisample?.count ?? 1} samples) tried again on this device`, refusedProbed);
}

/**
 * The probes tried on `device`, once a page (`again` for a harness), and what each came to said as a fault's line;
 * then `refused`, the pipeline's own descriptor, tried again as `probeRefused` changes it.
 */
export async function probeDepthOnly(gpu: object, refused?: object, again = false): Promise<void> {
  if (asked && !again) return;
  asked = true;
  const device = gpu as ProbeDevice;
  if (refused) await probeRefused(device, refused as Refused);
  const lines: string[] = [];
  for (const probe of PROBES) {
    lines.push(`${probe.name}: ${await tried(device, probe).catch((thrown: unknown) => `not tried (${String(thrown).slice(0, 80)})`)}`);
  }
  depthProbed = lines.join(' | ');
  fault('depth-only pipelines tried on this device', depthProbed);
}
