// `lab rust`: the Rust engine's frame (`src/engine`, Bulwark) where the hero stands, pictured and timed: the walk of
// the scene and the engine's own work by the browser's clock, the GPU's time by the engine's timestamps, its draw
// calls, objects and triangles, what it couldn't draw by its kind, and its boot. three's figures for the same stand
// come from a tree on main (`lab passes --renderer webgpu`, `lab draws`).
import type * as THREE from 'three';
import type { Lab, Report } from './lab';
import type { BiomeId } from '../../../src/data/biomes';
import type { ViewMode } from '../../../src/core/renderer';
import { G } from '../../../src/state';
import { perfClock } from '../../../src/core/perfClock';
import { RUST } from '../../../src/engine';
import type { FrameStats } from '../../../src/engine/bridge';
import { standAt } from './draws';
import { foesAt } from './death';
import { crowdPlaces } from './crowd';

export interface RustCommand {
  biome: BiomeId;
  view: ViewMode;
  at?: [number, number];
  frames: number;
  /** foes stood before the hero (not in the village) */
  foes: number;
  village: boolean;
  hour?: number;
}

/** what's read of each frame, and averaged */
const TIMED: (keyof FrameStats)[] = [
  'walkMs', 'engineMs', 'gpuMs', 'records', 'draws', 'shadowDraws', 'objects', 'culled', 'triangles',
];

const median = (values: number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

export async function rustEngine(lab: Lab, command: RustCommand): Promise<Report> {
  const bridge = RUST.bridge;
  if (!bridge) {
    const why = RUST.failed || 'the page was not booted on it (--renderer rust)';
    return { text: `the Rust engine isn't running: ${why}`, problems: ['the Rust engine isn\'t running'], moments: [] };
  }
  await standAt(lab, command);
  if (command.foes > 0 && !command.village) {
    const spots: THREE.Vector3[] = crowdPlaces(command.foes, G.player.pos, G.player.facing);
    await foesAt(lab, spots, spots.map(() => 1));
  }
  const clock = (window as unknown as { __labClock: { realNow: () => number } }).__labClock;
  const pageClock = perfClock.now;
  perfClock.now = clock.realNow;
  const drawing = lab.drawing;
  lab.drawing = true;
  const read = new Map<keyof FrameStats, number[]>(TIMED.map((name) => [name, []]));
  const renders: number[] = [];
  const handedOver = { meshes: 0, textures: 0, materials: 0 };
  try {
    // (what's first met here is handed over before the frames timed)
    await lab.step(10);
    for (let frame = 0; frame < command.frames; frame++) {
      await lab.step(1);
      for (const name of TIMED) read.get(name)!.push(bridge.stats[name]);
      renders.push(RUST.renderMs);
      handedOver.meshes += bridge.stats.newMeshes;
      handedOver.textures += bridge.stats.newTextures;
      handedOver.materials += bridge.stats.newMaterials;
    }
  } finally {
    perfClock.now = pageClock;
    lab.drawing = drawing;
  }
  const pictured = await lab.screen('the Rust engine\'s frame');
  const of = (name: keyof FrameStats): number => median(read.get(name)!);
  const skipped = [...bridge.skipped].sort((a, b) => b[1] - a[1]).map(([kind, count]) => `${kind} ${count}`);
  const where = command.village ? 'the village' : `${G.arena.biome}${command.foes ? `, ${command.foes} foes` : ''}`;
  const canvas = document.getElementById('rust-canvas') as HTMLCanvasElement;
  const { boot, bridge: { held } } = { boot: RUST.boot, bridge };
  const lines = [
    `${where} ${command.view}, ${canvas.width}x${canvas.height} drawn, medians of ${command.frames} frames`,
    `  the render: ${median(renders).toFixed(2)} ms on the CPU (the scene walked ${of('walkMs').toFixed(2)}, `
      + `the engine ${of('engineMs').toFixed(2)}); the GPU ${of('gpuMs').toFixed(2)} ms (shadow and scene passes)`,
    `  ${of('records')} records from the page, ${of('culled')} things out of view, ${of('objects')} objects drawn `
      + `in ${of('draws')} draw calls (+${of('shadowDraws')} for the sun's shadow), ${of('triangles')} triangles`,
    `  held: ${held.meshes} meshes, ${held.textures} maps, ${held.materials} materials, ${held.sets} instance sets; `
      + `handed over while timed: ${handedOver.meshes} meshes, ${handedOver.textures} maps, ${handedOver.materials} materials`,
    `  not drawn (a frame): ${skipped.join(', ') || 'nothing'}`,
    `  the engine's boot: the module ${boot.wasmMs.toFixed(0)} ms, the device and pipelines ${boot.deviceMs.toFixed(0)} ms, `
      + `its first frame ${boot.firstFrameMs.toFixed(0)} ms`,
  ];
  const problems: string[] = [];
  if (!(of('draws') > 0)) problems.push('the engine drew nothing');
  return { text: lines.join('\n'), problems, moments: [pictured] };
}
