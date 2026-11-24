// tools/lab perf --parts: what the frame's biggest parts take of the GPU, drawn and hidden in turns (`flameCost` in
// fireCost.ts: the machine's load drifts, and two runs apart read two loads): the draws with the most triangles, those
// spread widest (a ground of few triangles fills the screen), and the meadow and the fountain each whole. From play,
// "low fps at night": the GPU at 12 ms of the frame, the phases' lines telling only scene and shadow. Its canary times
// the meadow drawn four times over, which must read as more than it does once. The hero is first turned all round: the
// report's GPU was 12 ms one way and 6 another, so the parts are timed turned the dearest way.
import * as THREE from 'three';
import { G } from '../../../src/state';
import * as renderer from '../../../src/core/renderer';
import { lampsHeldOut, lampShadowsOn, setLampShadows } from '../../../src/core/lamps';
import { qualityLevel } from '../../../src/core/quality';
import { QUALITY } from '../../../src/data/quality';
import { TUNE } from '../../../src/engine/globals';
import { canaryCost, flameCost, turnCost } from './fireCost';
import { medianOf, timedRenders } from './gpuTurns';
import type { Lab } from './lab';
import { cpuCost, cpuLines, type CpuPart } from './renderCpu';

/** how many of the draws with the most triangles are timed, and how many of those spread widest */
const BY_TRIANGLES = 6;
const BY_REACH = 6;
/** the groups timed whole */
const RINGS = ['meadow grass 1', 'meadow grass 2', 'meadow grass 3', 'meadow grass 4', 'meadow grass 5'];
const WHOLE = ['meadow', ...RINGS, 'fountain'];

/** the ways he's turned (a turn's share each), the frames he's given to settle, and the renders timed each way */
const TURNS = 8;
const SETTLE = 20;
const TURN_RENDERS = 16;

/** The hero turned each way, the GPU's time of the frame (ms) that way; left turned the dearest. */
async function dearestWay(lab: Lab, lines: string[]): Promise<void> {
  let dearest = 0;
  let most = -Infinity;
  const read: string[] = [];
  const turnTo = async (turn: number): Promise<void> => {
    const facing = (turn / TURNS) * Math.PI * 2;
    G.player.facing = facing;
    renderer.faceCamera(facing);
    await lab.step(SETTLE);
  };
  for (let turn = 0; turn < TURNS; turn++) {
    await turnTo(turn);
    const took = medianOf(await timedRenders(() => renderer.render(), TURN_RENDERS));
    read.push(`${((turn * 360) / TURNS).toFixed(0)}: ${took.toFixed(1)}`);
    if (took > most) {
      most = took;
      dearest = turn;
    }
  }
  lines.push(`the GPU's frame turned each way (degrees: ms): ${read.join(', ')}`);
  await turnTo(dearest);
}

/** What's timed: its name and the meshes hidden together. */
interface Part {
  name: string;
  meshes: THREE.Mesh[];
}

/** How many triangles `mesh` draws, every instance counted. */
function trianglesOf(mesh: THREE.Mesh): number {
  const geometry = mesh.geometry as THREE.InstancedBufferGeometry;
  const corners = geometry.index ? geometry.index.count : geometry.attributes.position?.count ?? 0;
  const instanced = mesh as THREE.InstancedMesh;
  const instances = instanced.isInstancedMesh ? instanced.count : geometry.instanceCount ?? 1;
  return (corners / 3) * (Number.isFinite(instances) ? instances : 1);
}

/** How far `mesh` spreads (m): its bounding sphere's radius. */
function reachOf(mesh: THREE.Mesh): number {
  if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
  return mesh.geometry.boundingSphere?.radius ?? 0;
}

/** A mesh's name: its own or its parent's, and what it's drawn in. */
function nameOf(mesh: THREE.Mesh): string {
  const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
  const colour = material.color ? `#${material.color.getHexString()}` : '';
  const name = mesh.name || mesh.parent?.name || 'unnamed';
  const thousands = (trianglesOf(mesh) / 1000).toFixed(0);
  return `${name} (${thousands}k, ${reachOf(mesh).toFixed(0)} m, ${material.type} ${colour})`;
}

/** Whether `mesh` stands under the group called `name`. */
function under(mesh: THREE.Object3D, name: string): boolean {
  for (let at: THREE.Object3D | null = mesh; at; at = at.parent) {
    if (at.name === name) return true;
  }
  return false;
}

/** a mesh's reach from which it's taken for the sky's dome (m), left drawn with all else hidden */
const SKY = 200;

/** The meshes shown that hold nothing under them. */
function shownMeshes(): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  G.scene.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && mesh.children.length === 0) meshes.push(mesh);
  });
  return meshes;
}

/** What's timed: the meshes shown alone, as hiding what holds a light would compile every lit program again. */
function partsShown(): Part[] {
  const meshes = shownMeshes();
  const whole = WHOLE.map((name) => ({ name, meshes: meshes.filter((mesh) => under(mesh, name)) }));
  const rest = meshes.filter((mesh) => !WHOLE.some((name) => under(mesh, name)));
  const top = (score: (mesh: THREE.Mesh) => number, count: number): THREE.Mesh[] => [...rest]
    .sort((a, b) => score(b) - score(a))
    .slice(0, count);
  const singles = new Set([...top(trianglesOf, BY_TRIANGLES), ...top(reachOf, BY_REACH)]);
  return [...whole, ...[...singles].map((mesh) => ({ name: nameOf(mesh), meshes: [mesh] }))];
}

/** What's switched in turns: a way the frame is drawn, on as the game has it and off. */
interface Switch {
  name: string;
  turn: (on: boolean) => void;
}

/** A switch of the engine's (`TUNE`), on as the game has it and off at `off`. */
function engineSwitch(field: 'depthFirst' | 'nearFirst' | 'shadows' | 'shadowTurns', off: number):
  (on: boolean) => void {
  const own = TUNE[field];
  return (on) => {
    TUNE[field] = on ? own : off;
  };
}

/** The ways of drawing the frame that cost by the pixel, which hiding a mesh can't tell. */
function switches(): Switch[] {
  const preset = QUALITY[qualityLevel()];
  const shadows = lampShadowsOn();
  return [
    { name: 'MSAA (off: none)', turn: (on) => renderer.setRenderQuality(on ? preset : { ...preset, msaa: 0 }) },
    { name: 'MSAA (off: 4)', turn: (on) => renderer.setRenderQuality(on ? preset : { ...preset, msaa: 4 }) },
    { name: 'the lamps\' still shadows', turn: (on) => setLampShadows(on && shadows) },
    { name: 'the lamps\' list, all of it', turn: (on) => lampsHeldOut(!on) },
    { name: 'the depth drawn first (off: in one pass)', turn: engineSwitch('depthFirst', 0) },
    { name: 'what the camera stands in drawn last (off: in its turn)', turn: engineSwitch('nearFirst', 0) },
    { name: 'the moon or sun\'s shadow', turn: engineSwitch('shadows', 0) },
    { name: 'its map kept between turns (off: drawn every frame)', turn: engineSwitch('shadowTurns', 0) },
  ];
}

/** Each switch's time on the GPU, on and off in turns. */
async function switchCosts(draw: () => void): Promise<string[]> {
  const lines = ['what each way of drawing takes (the frame with it, and without):'];
  for (const { name, turn } of switches()) {
    const cost = await turnCost(turn, draw);
    if (!cost) continue;
    const took = cost.apart.toFixed(2);
    lines.push(`  ${took} ms: ${name}, the frame ${cost.shown.toFixed(2)} with it, ${cost.hidden.toFixed(2)} without`);
  }
  return lines;
}

/** The heroes standing about the scene other than the player's own (the hall's, on its dais). */
function standingHeroes(): THREE.Object3D[] {
  return G.scene.children.filter((o) => o !== G.player.obj && o.visible && o.name.startsWith('hero '));
}

/** `objects` shown or hidden. */
const shownAll = (objects: THREE.Object3D[]) => (on: boolean): void => {
  for (const object of objects) object.visible = on;
};

/** The hero's meshes that cast a shadow, cast or not. */
function heroShadows(): (on: boolean) => void {
  const casters: THREE.Object3D[] = [];
  G.player.obj.traverse((o) => { if (o.castShadow) casters.push(o); });
  return (on) => { for (const caster of casters) caster.castShadow = on; };
}

/** What the frame's parts take of the render's CPU, and its canary: the render done twice must read about a render
 *  more than once. */
function cpuParts(draw: () => void): { lines: string[]; problems: string[] } {
  const parts: CpuPart[] = [
    { name: 'the heroes standing about (the hall of heroes\' dais)', show: shownAll(standingHeroes()) },
    { name: 'the hero', show: shownAll([G.player.obj]) },
    { name: 'the hero\'s shadows', show: heroShadows() },
  ];
  const lines = cpuLines(parts, draw);
  let twice = false;
  const drawn = (): void => {
    draw();
    if (twice) draw();
  };
  const canary = cpuCost({ name: 'canary', show: (on) => { twice = on; } }, drawn);
  const once = canary.hidden;
  const over = canary.shown - canary.hidden;
  lines.push(`  canary: the render done twice ${over.toFixed(2)} ms more, a render ${once.toFixed(2)}`);
  const problems = over < once * 0.6 ? [`canary missed: the render done twice read ${over.toFixed(2)} ms more`] : [];
  return { lines, problems };
}

/** Each part's time on the GPU as it's drawn and hidden, and its canary's problems. */
export async function partCosts(lab: Lab, canary: boolean): Promise<{ lines: string[]; problems: string[] }> {
  const draw = (): void => renderer.render();
  const lines: string[] = [];
  await dearestWay(lab, lines);
  lines.push(...await switchCosts(draw));
  lines.push('what the biggest parts take of the GPU that way (the frame drawn with each, and without):');
  const problems: string[] = [];
  const cpu = cpuParts(draw);
  lines.push(...cpu.lines);
  problems.push(...cpu.problems);
  const parts = partsShown();
  const allButSky = shownMeshes().filter((mesh) => reachOf(mesh) < SKY);
  const everything: Part = { name: 'everything but the sky', meshes: allButSky };
  for (const { name, meshes } of [everything, ...parts]) {
    const cost = await flameCost(meshes, draw);
    if (!cost) {
      lines.push(`  ${name}: untimed (the browser has no timer)`);
      continue;
    }
    const took = cost.apart.toFixed(2);
    lines.push(`  ${took} ms: ${name}, the frame ${cost.shown.toFixed(2)} with it, ${cost.hidden.toFixed(2)} without`);
  }
  if (canary) {
    const { meshes } = parts[0];
    const once = await flameCost(meshes, draw);
    const over = await canaryCost(meshes, draw);
    if (once && over !== null) {
      const single = once.shown - once.hidden;
      lines.push(`  canary: ${parts[0].name} once ${single.toFixed(2)} ms, four times over ${over.toFixed(2)}`);
      if (over <= single) problems.push(`canary missed: drawn four times over it read ${over.toFixed(2)} ms`);
    }
  }
  return { lines, problems };
}
