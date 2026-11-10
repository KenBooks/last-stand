// `lab programs --limits`: what each of the boot's programs asks of a GPU, against the least a phone's must give.
// A desktop GPU lets a shader have four times the uniforms a phone's does, so a program too big for a phone compiles,
// links and draws here, passes every picture, and draws nothing there: the heroes' palette materials added six
// tables of 16 rows to a lit shader that already held 20 point lights, and on an Adreno 830 the hero was his hair and
// his shadow (#470, reverted). So each program's uniforms are counted by the stage that reads them, with its
// attributes and its samplers, and held to WebGL 2's guaranteed minimums (or to a device's own, `--limits`).
import { G } from '../../../src/state';
import type { Report } from './lab';

/** What a program asks for: the uniform vectors each stage reads, its vertex attributes and its samplers. */
export interface ProgramAsks {
  name: string;
  fragmentVectors: number;
  vertexVectors: number;
  attributes: number;
  samplers: number;
}

/** The most a GPU gives of each. */
export interface GpuLimits {
  fragmentVectors: number;
  vertexVectors: number;
  attributes: number;
  samplers: number;
}

/** the least any WebGL 2 device gives (OpenGL ES 3.0's minimums): what a phone may be held to */
export const LEAST_LIMITS: GpuLimits = { fragmentVectors: 224, vertexVectors: 256, attributes: 16, samplers: 16 };

/** how many of the largest programs are listed */
const LISTED = 6;

/** The uniform vectors one value of `type` takes (a matrix a vector a column; a sampler none). */
function vectorsOf(gl: WebGL2RenderingContext, type: number): number {
  if (type === gl.FLOAT_MAT4) return 4;
  if (type === gl.FLOAT_MAT3) return 3;
  if (type === gl.FLOAT_MAT2) return 2;
  const plain = [gl.FLOAT, gl.FLOAT_VEC2, gl.FLOAT_VEC3, gl.FLOAT_VEC4, gl.INT, gl.INT_VEC2, gl.INT_VEC3, gl.INT_VEC4,
    gl.UNSIGNED_INT, gl.BOOL, gl.BOOL_VEC2, gl.BOOL_VEC3, gl.BOOL_VEC4];
  return (plain as number[]).includes(type) ? 1 : 0;
}

/** A uniform's own name: `pointLights[3].color` is `pointLights`'s. */
const rootOf = (name: string): string => name.split(/[.[]/)[0];

/** Whether `source` names `root` as a word. */
const reads = (source: string, root: string): boolean => new RegExp(`\\b${root}\\b`).test(source);

/** What the GL program `program` asks for, as the context reports its active uniforms and attributes. */
export function asksOf(gl: WebGL2RenderingContext, program: WebGLProgram, name: string): ProgramAsks {
  const sources = { vertex: '', fragment: '' };
  for (const shader of gl.getAttachedShaders(program) ?? []) {
    const fragment = gl.getShaderParameter(shader, gl.SHADER_TYPE) === gl.FRAGMENT_SHADER;
    sources[fragment ? 'fragment' : 'vertex'] = gl.getShaderSource(shader) ?? '';
  }
  const asks: ProgramAsks = { name, fragmentVectors: 0, vertexVectors: 0, attributes: 0, samplers: 0 };
  const uniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let at = 0; at < uniforms; at++) {
    const uniform = gl.getActiveUniform(program, at);
    if (!uniform) continue;
    const vectors = vectorsOf(gl, uniform.type) * uniform.size;
    if (vectors === 0) {
      asks.samplers += uniform.size;
      continue;
    }
    const root = rootOf(uniform.name);
    if (reads(sources.fragment, root)) asks.fragmentVectors += vectors;
    if (reads(sources.vertex, root)) asks.vertexVectors += vectors;
  }
  asks.attributes = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES) as number;
  return asks;
}

/** What this GPU gives, for the report's first line. */
function limitsHere(gl: WebGL2RenderingContext): GpuLimits {
  return {
    fragmentVectors: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) as number,
    vertexVectors: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS) as number,
    attributes: gl.getParameter(gl.MAX_VERTEX_ATTRIBS) as number,
    samplers: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) as number,
  };
}

const LIMIT_NAMES: [keyof GpuLimits, string][] = [
  ['fragmentVectors', 'fragment uniform vectors'], ['vertexVectors', 'vertex uniform vectors'],
  ['attributes', 'vertex attributes'], ['samplers', 'samplers'],
];

/** What of `asks` is over `limits`, in words. */
export function overLimits(asks: ProgramAsks, limits: GpuLimits): string[] {
  return LIMIT_NAMES.filter(([key]) => asks[key] > limits[key])
    .map(([key, said]) => `${asks[key]} ${said} (a phone's least: ${limits[key]})`);
}

/**
 * Every program the renderer holds against `limits`: the largest listed, a problem each one over. With a canary, a
 * program asking for one more fragment vector than the limit is judged too, which must be found over.
 */
export function limitsReport(limits: GpuLimits, canary: boolean): Report {
  const gl = G.renderer.getContext() as WebGL2RenderingContext;
  const held = (G.renderer.info.programs ?? []) as unknown as { program: WebGLProgram; name: string }[];
  const all = held.map((entry) => asksOf(gl, entry.program, entry.name || 'an unnamed material'));
  const here = limitsHere(gl);
  const lines = [
    `what the programs ask of a GPU (${all.length}), held to ${limits.fragmentVectors} fragment and `
      + `${limits.vertexVectors} vertex uniform vectors, ${limits.attributes} attributes, ${limits.samplers} samplers `
      + `(this GPU's: ${here.fragmentVectors}, ${here.vertexVectors}, ${here.attributes}, ${here.samplers}):`,
  ];
  const largest = [...all].sort((a, b) => b.fragmentVectors - a.fragmentVectors).slice(0, LISTED);
  for (const asks of largest) {
    lines.push(`  ${asks.name}: ${asks.fragmentVectors} fragment, ${asks.vertexVectors} vertex, `
      + `${asks.attributes} attributes, ${asks.samplers} samplers`);
  }
  const problems = all.flatMap((asks) => overLimits(asks, limits).map((over) => `program ${asks.name} asks for ${over}`));
  if (canary) {
    const planted = { ...largest[0], name: 'the canary', fragmentVectors: limits.fragmentVectors + 1 };
    const caught = overLimits(planted, limits).length > 0;
    lines.push(`  canary, a program one fragment vector over: ${caught ? 'found over' : 'went unseen'}`);
    if (!caught) problems.push('the canary\'s program over the limit went unseen');
  }
  return { text: lines.join('\n'), problems };
}
