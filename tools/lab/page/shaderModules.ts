// `lab naga`: every shader module the page's WebGPU devices made, with the constants each pipeline made of it was
// given, for the Node side to check as Firefox's WebGPU takes each stage (tools/lab/naga, its naga). Chrome compiles
// WGSL with Tint, so a module naga refuses draws in every page the lab boots: the meadow blades' was refused in
// Firefox at every level and the village drawn without its grass (report V1T3-G00X, #938). Kept by the lab's page
// script (`shaderCodes` in node/gpuScripts.mjs) from before the game's first module.
import type { Lab } from './lab';
import { moduleName } from './programCompiles';
import { RUST } from '../../../src/engine';

/** A module as the page script keeps it. */
interface Kept {
  label: string;
  code: string;
  constants: Set<string>;
}

/** A module as `lab naga` checks it: its label (the labels of every module with its code), its WGSL, and each set
 *  of constants a pipeline gave it (`NAME=value,...`; empty, none given). */
export interface ShaderModuleMade {
  label: string;
  code: string;
  sets: string[];
}

/** What the page made: each module once by its code, and how many were made in all. */
export interface ShaderModulesMade {
  modules: ShaderModuleMade[];
  made: number;
}

/** the frames drawn first, so what the lobby's frame asks for is made */
const FRAMES = 30;

/** The modules the page script kept, none where it ran too late or isn't in this tree's lab. */
function kept(): Kept[] {
  return (window as unknown as { __labShaderModules?: Kept[] }).__labShaderModules ?? [];
}

/** `modules` with those of one code joined: their labels listed once each, their constants' sets together. */
function byCode(modules: readonly Kept[], names: ReadonlyMap<number, string>): ShaderModuleMade[] {
  const joined = new Map<string, { labels: Set<string>; sets: Set<string> }>();
  for (const module of modules) {
    let entry = joined.get(module.code);
    if (!entry) {
      entry = { labels: new Set(), sets: new Set() };
      joined.set(module.code, entry);
    }
    entry.labels.add(moduleName(module.label || 'unlabelled', names));
    for (const set of module.constants) entry.sets.add(set);
  }
  return [...joined].map(([code, entry]) => ({
    label: [...entry.labels].join(' / '),
    code,
    sets: [...entry.sets].sort(),
  }));
}

/** Every shader module the page made by now, the lobby drawn first. */
export async function shaderModulesMade(lab: Lab): Promise<ShaderModulesMade> {
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    await lab.step(FRAMES);
  } finally {
    lab.drawing = drawing;
  }
  const modules = kept();
  const names = RUST.bridge?.shaderNames() ?? new Map<number, string>();
  return { modules: byCode(modules, names), made: modules.length };
}
