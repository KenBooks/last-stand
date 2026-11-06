// tools/lab scenecost: what each kind of work in the scene pass takes of the GPU, at a quality level's settings and
// the screen's own pixels (the resolution is never what's cut: what each pixel costs is). The scene pass alone is
// drawn, with each part taken out and put back in turns (`gpuTurns.ts`), so a run's load falls on both sides: the
// point lights, their shadows, the sun's shadow, the environment, the lit shading against a plain colour, what's
// see-through or cut out, the particles, the hero. A laptop's integrated GPU spent 86% of its frame on the scene pass
// at 2864x1536 (10 frames a second on Medium): this says what of it a level could do without. Its canary draws the
// scene twice, which must read as more.
import * as THREE from 'three';
import type { Lab, Report } from './lab';
import { G } from '../../../src/state';
import * as renderer from '../../../src/core/renderer';
import { useQuality } from '../../../src/core/quality';
import { QUALITY, type QualityLevel } from '../../../src/data/quality';
import type { BiomeId } from '../../../src/data/biomes';
import { standIn } from './light';
import { costInTurns, type TurnsCost } from './gpuTurns';

export interface SceneCostOptions {
  biome: BiomeId;
  view: renderer.ViewMode;
  level: QualityLevel;
  /** the rounds of turns, each with a side's renders */
  rounds: number;
  /** draw the scene twice: it must read as more */
  canary: boolean;
  /** each see-through or cut-out mesh timed alone too, the costliest listed */
  each: boolean;
}

/** the costliest see-through meshes `--each` lists */
const EACH_LISTED = 8;
/** `--each`'s rounds a mesh (fewer than the parts': there are dozens) */
const EACH_ROUNDS = 3;

/** A part of the scene pass's work, put in (`on`) or taken out. */
interface Part {
  name: string;
  change: (on: boolean) => void;
}

/** a side's renders in a turn */
const TURN_RENDERS = 6;
/** the canary's scene drawn twice must take this many times the scene once, at least */
const CANARY_LEAST = 1.6;

/** Every object under the scene that `wanted` picks, shown now. */
function shownWhere(wanted: (object: THREE.Object3D) => boolean): THREE.Object3D[] {
  const found: THREE.Object3D[] = [];
  G.scene.traverseVisible((object) => {
    if (wanted(object)) found.push(object);
  });
  return found;
}

/** A part that shows or hides `objects`. */
function shownPart(name: string, objects: THREE.Object3D[]): Part {
  return {
    name: `${name} (${objects.length})`,
    change: (on) => {
      for (const object of objects) object.visible = on;
    },
  };
}

/** A part that lets `lights` cast their shadows or not. */
function castingPart(name: string, lights: THREE.Light[]): Part {
  return {
    name: `${name} (${lights.length})`,
    change: (on) => {
      for (const light of lights) light.castShadow = on;
    },
  };
}

/** The materials of a mesh, as a list. */
function materialsOf(mesh: THREE.Mesh): THREE.Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

/** Whether a mesh draws see-through or cut out (blended, or alpha tested). */
function seeThrough(object: THREE.Object3D): boolean {
  const mesh = object as THREE.Mesh;
  if (!mesh.isMesh) return false;
  return materialsOf(mesh).some((material) => material.transparent || material.alphaTest > 0);
}

/** The scene's parts to time, as they stand now. */
function partsOfScene(): Part[] {
  const points = shownWhere((object) => (object as THREE.PointLight).isPointLight) as THREE.PointLight[];
  const sun = shownWhere((object) => (object as THREE.DirectionalLight).isDirectionalLight) as THREE.Light[];
  const plain = new THREE.MeshBasicMaterial({ color: 0x808080 });
  const environment = G.scene.environment;
  return [
    shownPart('the point lights', points),
    castingPart('the point lights\' shadows', points.filter((light) => light.castShadow)),
    castingPart('the sun\'s shadow', sun.filter((light) => light.castShadow)),
    {
      name: 'the environment',
      change: (on) => {
        G.scene.environment = on ? environment : null;
      },
    },
    {
      name: 'the lit shading, against a plain colour',
      change: (on) => {
        G.scene.overrideMaterial = on ? null : plain;
      },
    },
    shownPart('what\'s see-through or cut out', shownWhere(seeThrough)),
    shownPart('the particles', shownWhere((object) => (object as THREE.Points).isPoints)),
    shownPart('the hero', [G.player.obj]),
  ];
}

/** The scene pass drawn alone into the scene's target, `times` times. */
function drawScene(times: () => number): () => void {
  return () => {
    const gl = G.renderer;
    gl.setRenderTarget(renderer.sceneTarget());
    for (let draw = 0; draw < times(); draw++) gl.render(G.scene, G.camera);
    gl.setRenderTarget(null);
  };
}

/** A part's line: the scene with it and without, what it takes and its share. */
function partLine(part: Part, cost: TurnsCost): string {
  const takes = cost.on - cost.off;
  const share = cost.on > 0 ? (100 * takes) / cost.on : 0;
  return `  ${part.name}: ${takes.toFixed(2)} ms, ${share.toFixed(0)}% (the scene ${cost.on.toFixed(2)} with it, `
    + `${cost.off.toFixed(2)} without)`;
}

/** What a mesh is, for a line: its name and its parents', its material, its instances and triangles. */
function describe(mesh: THREE.Mesh): string {
  const names: string[] = [];
  for (let object: THREE.Object3D | null = mesh; object && object !== G.scene; object = object.parent) {
    if (object.name) names.unshift(object.name);
  }
  const material = materialsOf(mesh)[0];
  const instances = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1;
  const index = mesh.geometry.index;
  const triangles = (index ? index.count : mesh.geometry.attributes.position.count) / 3;
  const cut = material.alphaTest > 0 ? `cut at ${material.alphaTest}` : 'blended';
  return `${names.join('/') || mesh.type}: ${material.type}, ${cut}, ${instances} x ${triangles} triangles`;
}

/** Each see-through or cut-out mesh timed alone, the costliest `EACH_LISTED` as lines. */
async function eachSeeThrough(draw: () => void, renders: number): Promise<string[]> {
  const costs: { line: string; takes: number }[] = [];
  for (const object of shownWhere(seeThrough)) {
    const part = { ...shownPart('', [object]), name: describe(object as THREE.Mesh) };
    const cost = await costInTurns(G.renderer, part.change, draw, { rounds: EACH_ROUNDS, renders });
    if (cost) costs.push({ line: partLine(part, cost), takes: cost.on - cost.off });
  }
  costs.sort((a, b) => b.takes - a.takes);
  const costliest = costs.slice(0, EACH_LISTED).map((cost) => `  ${cost.line}`);
  return ['  the costliest see-through or cut-out meshes, each alone:', ...costliest];
}

/** The level's settings, the scene rendering every pixel of the screen. */
function atFullPixels(level: QualityLevel): string {
  useQuality(level);
  renderer.setRenderQuality({ ...QUALITY[level], pixels: Infinity });
  const size = renderer.sceneSize(new THREE.Vector2());
  return `the scene ${size.x}x${size.y} (${(size.x * size.y / 1e6).toFixed(2)} Mpx), ${QUALITY[level].label}'s other `
    + 'settings';
}

/** `lab scenecost`, one scenario: what each part of the scene pass takes of the GPU. */
export async function sceneCost(lab: Lab, command: SceneCostOptions): Promise<Report> {
  const { biome, view, level } = command;
  const name = `${biome} ${view}`;
  const settings = atFullPixels(level);
  await standIn(lab, { biome, view, facing: 0 });
  const drawing = lab.drawing;
  lab.drawing = true;
  const turns = { rounds: command.rounds, renders: TURN_RENDERS };
  try {
    let times = 1;
    const draw = drawScene(() => times);
    const lines = [`${name}: ${settings}`];
    const problems: string[] = [];
    for (const part of partsOfScene()) {
      const cost = await costInTurns(G.renderer, part.change, draw, turns);
      if (!cost) return { text: `${name}: untimed (the browser has no GPU timer)`, problems: [] };
      lines.push(partLine(part, cost));
    }
    if (command.each) lines.push(...await eachSeeThrough(draw, TURN_RENDERS));
    if (command.canary) {
      const twice = await costInTurns(G.renderer, (on) => { times = on ? 2 : 1; }, draw, turns);
      const read = twice ? twice.on / twice.off : 0;
      lines.push(`  canary: the scene drawn twice read ${read.toFixed(2)} times once`);
      if (read < CANARY_LEAST) problems.push(`${name}: canary: the scene drawn twice went unseen`);
    }
    return { text: lines.join('\n'), problems };
  } finally {
    lab.drawing = drawing;
  }
}
