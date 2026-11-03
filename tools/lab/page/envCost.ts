// tools/lab envcost: what the environment's lookups take of the GPU, the frame drawn with the scene's environment and
// without it in turns (`gpuTurns.ts`), the hero standing in a biome and a view. Every lit standard material looks
// its environment up twice a pixel (its diffuse light and its reflection), so the lookup's own cost is in every lit
// pixel: three r187 swapped its packed atlas (`textureCubeUV`, a face picked and up to four fetches a lookup) for a
// cube map's one `textureLod`, and the frame's GPU time fell by about as much as runs apart differed. With `--ab` each
// side is timed against itself, under one load. Its canary draws the frame twice with the environment, which must
// read as more.
import * as THREE from 'three';
import type { Lab, Report } from './lab';
import { G } from '../../../src/state';
import * as renderer from '../../../src/core/renderer';
import type { BiomeId } from '../../../src/data/biomes';
import { standIn } from './light';
import { costInTurns, type Turns, type TurnsCost } from './gpuTurns';

export interface EnvCostOptions {
  biome: BiomeId;
  view: renderer.ViewMode;
  /** the rounds of turns, each with a side's renders */
  rounds: number;
  /** draw the frame twice with the environment: it must read as more */
  canary: boolean;
}

/** a side's renders in a turn */
const TURN_RENDERS = 6;
/** the canary's frame drawn twice must take this many times the frame without the environment, at least */
const CANARY_LEAST = 1.6;

/** The lit materials in view that take the scene's environment (no map of their own), counted once each. */
function takingEnvironment(): number {
  const taking = new Set<THREE.Material>();
  G.scene.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      const lit = material as THREE.MeshStandardMaterial;
      if (lit.isMeshStandardMaterial && !lit.envMap) taking.add(material);
    }
  });
  return taking.size;
}

/** The frame timed with the scene's environment (`on`) and without, `draws` renders each time it's drawn. */
function timedWith(environment: THREE.Texture, rounds: number, draws: number): Promise<TurnsCost | null> {
  const change = (on: boolean) => {
    G.scene.environment = on ? environment : null;
  };
  const draw = () => {
    for (let render = 0; render < draws; render++) renderer.render();
  };
  const turns: Turns = { rounds, renders: TURN_RENDERS };
  return costInTurns(G.renderer, change, draw, turns);
}

/** The line of a cost: the frame with the environment and without, and the difference. */
function costLine(name: string, cost: TurnsCost): string {
  return `${name}: the frame ${cost.on.toFixed(2)} ms on the GPU with the environment, ${cost.off.toFixed(2)} without: `
    + `its lookups ${(cost.on - cost.off).toFixed(2)} ms (the median of ${cost.renders} renders each, in turns)`;
}

/** `lab envcost`, one scenario: what the environment's lookups take of the frame on the GPU. */
export async function envCost(lab: Lab, command: EnvCostOptions): Promise<Report> {
  const { biome, view } = command;
  const name = `${biome} ${view}`;
  await standIn(lab, { biome, view, facing: 0 });
  const environment = G.scene.environment;
  if (!environment) return { text: `${name}: no environment`, problems: [`${name}: the scene has no environment`] };
  const taking = takingEnvironment();
  if (!taking) return { text: `${name}: nothing lit`, problems: [`${name}: no lit material takes the environment`] };
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    const cost = await timedWith(environment, command.rounds, 1);
    if (!cost) return { text: `${name}: untimed (the browser has no GPU timer)`, problems: [] };
    const lines = [`${costLine(name, cost)}; ${taking} lit materials take it`];
    const problems: string[] = [];
    if (command.canary) {
      const twice = await timedWith(environment, command.rounds, 2);
      const read = twice ? twice.on / cost.off : 0;
      lines.push(`  canary: the frame drawn twice with it read ${read.toFixed(2)} times the frame without`);
      if (read < CANARY_LEAST) problems.push(`${name}: canary: the frame drawn twice went unseen`);
    }
    return { text: lines.join('\n'), problems };
  } finally {
    lab.drawing = drawing;
  }
}
