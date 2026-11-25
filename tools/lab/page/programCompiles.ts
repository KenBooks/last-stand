// `lab programs`' compiles: what the browser compiles of the engine's pipelines, each a shader module's entry point
// with its constants. Pipelines of one module and entry that differ by their states alone (culling, the depth's
// test, blending, samples) come back from what the browser keeps of the first in a millisecond or two; an entry
// point of another module, or the same with another constant (the layers' `LAYER_PART`), is compiled whole again,
// 0.3 to 0.5 s of the GPU's process for the engine's lit shader (`lab programs --cost`, both readings). A module a
// look was 24 of the lit shader's compiles at a first visit, most of its 25 s; the looks are one module now
// (Bulwark's `join_shaders`, `Materials.joinLooks`), and this count is what holds them so.
import * as THREE from 'three';
import type { Lab, Report } from './lab';
import { G } from '../../../src/state';
import { AHEAD, PIPELINES_ASKED, type PipelineAsked } from '../../../src/engine/pipelinesAside';
import { RUST } from '../../../src/engine';
import { rustLook } from '../../../src/engine/custom';

/** the most fragment stages the lab's boot may compile whole: 13 with the looks joined (the lit shader's three, the
 *  world's looks' and the effects' two each, the flames, the embers' two, the meadow's blades, the particles' two),
 *  33 with a module a look. A look given a module of its own is two more */
export const FRAGMENTS_MOST = 16;

/** A shader stage of a descriptor, as this reads it. */
interface Stage { module?: { label?: string }; entryPoint?: string; constants?: Record<string, number> }
/** A descriptor, as this reads it. */
interface Descriptor { vertex?: Stage; fragment?: Stage }

/** the module's label of a shader of the page's, or of several joined, with its id after it (Bulwark's `add_shader`,
 *  `join_shaders`) */
const HOOKED = /^lit(?: with hooks|, looks joined) (\d+)$/;

/** A module's label with the game's name for its shader, where it has one (a look's, an effect's). */
function moduleName(label: string, names: ReadonlyMap<number, string>): string {
  const id = HOOKED.exec(label)?.[1];
  const name = id === undefined ? undefined : names.get(Number(id));
  return name ? `${label} (${name})` : label;
}

/** A stage compiled, as the browser keys it: its module, entry point and constants. */
function compiledOf(stage: Stage | undefined, names: ReadonlyMap<number, string>): string | undefined {
  if (!stage) return undefined;
  const constants = Object.entries(stage.constants ?? {}).map(([name, value]) => `${name}=${value}`).join(',');
  const label = moduleName(stage.module?.label ?? '?', names);
  return `${label}.${stage.entryPoint ?? '?'}${constants ? ` [${constants}]` : ''}`;
}

/** The stages `asked` compiles, each once, as the browser keys them: its fragment stages (the lit shader's weight)
 *  and its vertex stages. */
export function compiles(asked: readonly PipelineAsked[]): { fragments: string[]; vertices: string[] } {
  const names = RUST.bridge?.shaderNames() ?? new Map<number, string>();
  const fragments = new Set<string>();
  const vertices = new Set<string>();
  for (const pipeline of asked) {
    const descriptor = pipeline.descriptor as Descriptor;
    const fragment = compiledOf(descriptor.fragment, names);
    const vertex = compiledOf(descriptor.vertex, names);
    if (fragment) fragments.add(fragment);
    if (vertex) vertices.add(vertex);
  }
  return { fragments: [...fragments].sort(), vertices: [...vertices].sort() };
}

/** The compiles as lines (how many, and each fragment stage), held to `FRAGMENTS_MOST`. */
export function compilesReport(asked: readonly PipelineAsked[]): Report {
  const { fragments, vertices } = compiles(asked);
  const lines = [
    `compiled whole: ${fragments.length} fragment stages and ${vertices.length} vertex stages (a module's entry with `
      + 'its constants each; its pipelines\' other states come back from the first)',
    ...fragments.map((fragment) => `    ${fragment}`),
  ];
  const over = fragments.length > FRAGMENTS_MOST;
  const problems = over ? [`${fragments.length} fragment stages compiled whole, over ${FRAGMENTS_MOST}`] : [];
  return { text: lines.join('\n'), problems, counts: { 'fragment compiles': fragments.length } };
}

/** a look's hooks that paint it a flat colour */
const CANARY_HOOKS = /* wgsl */ `
fn vertex_hook(v: ptr<function, Vertex>, instance: u32) {}
fn surface_hook(s: ptr<function, Surface>, in: VertexOut) -> bool {
  (*s).base = vec4f(1.0, 0.0, 1.0, 1.0);
  return true;
}
`;

/** The compiles' canary: a box of a look whose shader isn't listed (`RUST_SHADERS`), so a module of its own,
 *  handed to the engine: the count must find its fragment stage among those compiled whole. */
export function compilesCanary(_lab: Lab): Report {
  const before = compiles(PIPELINES_ASKED).fragments.length;
  const material = rustLook(new THREE.MeshStandardMaterial(), {
    shader: { name: `lab canary ${Date.now()}`, hooks: CANARY_HOOKS },
    numbers: () => {},
  });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), material);
  box.position.copy(G.player.pos).setY(0.5);
  try {
    AHEAD.prepare?.([box]);
  } finally {
    box.geometry.dispose();
    material.dispose();
  }
  const after = compiles(PIPELINES_ASKED).fragments.length;
  const caught = after > before;
  const text = `the compiles' canary: a look of its own's box handed over, ${before} fragment stages to ${after} `
    + `(${caught ? 'caught' : 'missed'})`;
  return { text, problems: caught ? [] : ['the compiles\' canary: a look\'s own module went uncounted'] };
}
