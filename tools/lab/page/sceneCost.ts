// tools/lab scenecost: what each kind of work in the scene pass takes of the GPU, at a quality level's settings and
// the screen's own pixels (the resolution is never what's cut: what each pixel costs is). The scene pass alone is
// drawn, with each part taken out and put back in turns (`gpuTurns.ts`), so a run's load falls on both sides: the
// point lights (and their lighting where they reach), their shadows, the sun's shadow, the environment, the lit
// shading against a plain colour, what's see-through or cut out, the particles, the hero. A laptop's integrated GPU
// spent 86% of its frame on the scene pass at 2864x1536 (10 frames a second on Medium): this says what of it a level
// could do without. Its canary draws the scene twice, which must read as more.
import * as THREE from 'three';
import type { Lab, Report } from './lab';
import { G } from '../../../src/state';
import * as renderer from '../../../src/core/renderer';
import { useQuality } from '../../../src/core/quality';
import { QUALITY, type QualityLevel } from '../../../src/data/quality';
import type { BiomeId } from '../../../src/data/biomes';
import type { RarityId } from '../../../src/types';
import { standIn } from './light';
import { costInTurns, sure, type TurnsCost } from './gpuTurns';
import { castingAsOne } from '../../../src/entities/models/castAsOne';
import { lightBounds } from '../../../src/core/lightBounds';
import { frameCostInTurns, type FrameCost } from './frameTurns';
import { hdrOutput } from './hdrOutput';

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
  /** the hero's parts timed alone too: his head, hands, cloth, the rest of him and the shadows he casts */
  hero: boolean;
  /** the whole frame timed by the browser's clock too, with HDR's output and the level's MSAA and without */
  frame: boolean;
  /** every item he wears of this rarity (Rare and up glow: the glow of his gear, a part of `--hero`'s) */
  rarity?: RarityId;
}

/** `--frame`'s turns: rounds of frames a side */
const FRAME_TURNS = { rounds: 4, frames: 8 };

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

/** A part that passes a point light out of reach over on its packed bounds, or on three's own values as before
 *  (`core/lightBounds.ts`): what the bounds save, so its time reads below nothing where they do. */
function boundsPart(): Part {
  const kept = lightBounds.packed;
  return {
    name: 'the point lights passed over on their packed bounds',
    change: (on) => {
      lightBounds.packed = on ? kept : false;
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

/** the reach a point light is given out of reach of everything (m): a pixel's loop then skips its lighting */
const OUT_OF_REACH = 0.001;

/**
 * A part that puts `lights` out of reach of every pixel or gives them back their reach: the same programs either way
 * (hidden, the lights' count and so the programs change), so it's what their lighting costs where they reach, apart
 * from the loop's own cost over them; the most a shorter reach can save.
 */
function reachingPart(name: string, lights: THREE.PointLight[]): Part {
  const reaches = lights.map((light) => light.distance);
  return {
    name: `${name} (${lights.length})`,
    change: (on) => {
      lights.forEach((light, index) => {
        light.distance = on ? reaches[index] : OUT_OF_REACH;
      });
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
    reachingPart('the point lights where they reach', points.filter((light) => light.intensity > 0)),
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
    boundsPart(),
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
  const share = cost.on > 0 ? (100 * cost.takes) / cost.on : 0;
  // (a cost no larger than twice its own error says nothing: said, so it isn't read as a saving or a cost)
  const told = sure(cost) ? '' : ', within the noise';
  return `  ${part.name}: ${cost.takes.toFixed(2)} ms \u00b1${cost.error.toFixed(2)}, ${share.toFixed(0)}%${told} `
    + `(the scene ${cost.on.toFixed(2)} with it, ${cost.off.toFixed(2)} without)`;
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

/** `--hero`'s rounds a part: more than the scene's parts', as a part of the hero is a small share of the frame */
const HERO_ROUNDS = 24;
/** the most a change of nothing may read (ms), told from nothing or not: over it the clock is seeing things */
const NOTHING_MOST = 0.15;

/** A mesh's triangles. */
function trianglesOf(mesh: THREE.Mesh): number {
  const index = mesh.geometry.index;
  return (index ? index.count : mesh.geometry.attributes.position.count) / 3;
}

/** The hero's meshes shown now. */
function heroMeshes(): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  G.player.model.root.traverseVisible((object) => {
    if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh);
  });
  return meshes;
}

/** Whether `mesh` hangs under an object `wanted` picks. */
function under(mesh: THREE.Object3D, wanted: (object: THREE.Object3D) => boolean): boolean {
  for (let at: THREE.Object3D | null = mesh; at; at = at.parent) if (wanted(at)) return true;
  return false;
}

/** A part of the hero's meshes, named with its meshes and triangles. */
function heroPart(name: string, meshes: THREE.Mesh[]): Part {
  const triangles = Math.round(meshes.reduce((sum, mesh) => sum + trianglesOf(mesh), 0));
  return { ...shownPart('', meshes), name: `${name} (${meshes.length} meshes, ${triangles} triangles)` };
}

/**
 * A part that lets the hero cast his shadows or not. His pieces' casting is switched with his shadow cast as one
 * let go for the turn (`castingAsOne`): switched alone, the one shadow was merged again at every turn (a piece that
 * casts no more is one hidden), and the merge was what the clock read, 1.9 ms for shadows that take a tenth of it.
 */
function heroShadowsPart(meshes: THREE.Mesh[]): Part {
  const cast = meshes.map((mesh) => mesh.castShadow);
  const asOne = castingAsOne.on;
  return {
    name: `the shadows he casts (${cast.filter(Boolean).length} meshes)`,
    change: (on) => {
      castingAsOne.on = on ? asOne : false;
      meshes.forEach((mesh, index) => {
        mesh.castShadow = on ? cast[index] : false;
      });
    },
  };
}

/** the most of the rest of the hero's materials `--hero` times alone, those drawing the most triangles first: all of
 *  them (his cost was in none of the eight drawing the most) */
const HERO_MATERIALS = 40;

/** What a material is, for a line: its kind, colour, side, and what it's drawn with. */
function looksLike(material: THREE.Material): string {
  const standard = material as THREE.MeshStandardMaterial;
  const colour = standard.color ? `#${standard.color.getHexString()}` : '';
  const maps = standard.map ? ' mapped' : '';
  const side = ['', ' inside out', ' both sides'][material.side] ?? '';
  const seen = material.transparent ? ' see-through' : '';
  return `${material.name || material.type} ${colour}${maps}${side}${seen}`.trim();
}

/** `meshes` by the material each draws in, as parts, those of the most triangles first (`HERO_MATERIALS` of them). */
function byMaterial(meshes: THREE.Mesh[]): Part[] {
  const alike = new Map<THREE.Material, THREE.Mesh[]>();
  for (const mesh of meshes) {
    const material = materialsOf(mesh)[0];
    alike.set(material, [...(alike.get(material) ?? []), mesh]);
  }
  const trianglesIn = (group: THREE.Mesh[]): number => group.reduce((sum, mesh) => sum + trianglesOf(mesh), 0);
  return [...alike]
    .sort((a, b) => trianglesIn(b[1]) - trianglesIn(a[1]))
    .slice(0, HERO_MATERIALS)
    .map(([material, group]) => heroPart(`  in ${looksLike(material)}`, group));
}

/** A kit material's own glow colour (`kitLooks.aura` in src/core/materials.ts), where it has one. */
type Glowing = THREE.Material & { kitLooks?: { aura?: { value: THREE.Color } } };

/** The glows of `meshes`' worn items, each its rarity's colour (black: none, the pattern skipped). */
function glowsOf(meshes: THREE.Mesh[]): THREE.Color[] {
  const glows = new Set<THREE.Color>();
  for (const mesh of meshes) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials as Glowing[]) {
      const glow = material.kitLooks?.aura?.value;
      if (glow && (glow.r > 0 || glow.g > 0 || glow.b > 0)) glows.add(glow);
    }
  }
  return [...glows];
}

/**
 * His gear's glow in its rarity's colour (`ITEM_GLOW`): each glowing material's colour put to black, so its lit shader
 * skips the pattern (`dot(uAura, uAura) > 0.0`), the same program either way. What a glow costs where it's drawn.
 */
function glowPart(meshes: THREE.Mesh[]): Part {
  const glows = glowsOf(meshes);
  const kept = glows.map((glow) => glow.clone());
  return {
    name: `the glow of his gear (${glows.length} materials)`,
    change: (on) => glows.forEach((glow, index) => (on ? glow.copy(kept[index]) : glow.setRGB(0, 0, 0))),
  };
}

/** The hero's parts: his head, his hands, his cloth (what moves as cloth: its shape changes), the rest of him, that
 *  rest by its materials, the glow of his gear, and the shadows he casts. */
function heroParts(): Part[] {
  const meshes = heroMeshes();
  const head = G.player.model.joints?.head;
  const isHand = (mesh: THREE.Mesh): boolean => under(mesh, (object) => Boolean(object.userData.drawnHand));
  const isHead = (mesh: THREE.Mesh): boolean => under(mesh, (object) => object === head);
  const isCloth = (mesh: THREE.Mesh): boolean => {
    const position = mesh.geometry.attributes.position as THREE.BufferAttribute;
    return position.usage !== THREE.StaticDrawUsage;
  };
  const hands = meshes.filter(isHand);
  const heads = meshes.filter((mesh) => !isHand(mesh) && isHead(mesh));
  const cloth = meshes.filter((mesh) => !isHand(mesh) && !isHead(mesh) && isCloth(mesh));
  const rest = meshes.filter((mesh) => !hands.includes(mesh) && !heads.includes(mesh) && !cloth.includes(mesh));
  return [
    heroPart('his head', heads),
    heroPart('his hands', hands),
    heroPart('his cloth', cloth),
    heroPart('the rest of him', rest),
    ...byMaterial(rest),
    glowPart(meshes),
    heroShadowsPart(meshes),
  ];
}

/**
 * The hero's parts, each timed alone over `HERO_ROUNDS` rounds, and a change of nothing timed the same way: what it
 * reads is the measure's own noise, and over `NOTHING_MOST` it's a problem. A hero is a small share of the screen
 * and a large one of the scene's triangles, most of them smaller than a pixel from the top view.
 */
async function eachOfHero(draw: () => void, renders: number): Promise<{ lines: string[]; problems: string[] }> {
  const turns = { rounds: HERO_ROUNDS, renders };
  const lines = ['  the hero\'s parts, each alone:'];
  for (const part of heroParts()) {
    const cost = await costInTurns(G.renderer, part.change, draw, turns);
    if (cost) lines.push(`  ${partLine(part, cost)}`);
  }
  const nothing = await costInTurns(G.renderer, () => {}, draw, turns);
  const problems: string[] = [];
  if (nothing) {
    const unchanged: Part = { name: 'nothing changed (the measure\'s own noise)', change: () => {} };
    lines.push(`  ${partLine(unchanged, nothing)}`);
    // (told from nothing, and more than a hair: a wide error alone says the run was rough, as each row does)
    if (sure(nothing) && Math.abs(nothing.takes) > NOTHING_MOST) {
      problems.push(`a change of nothing read ${nothing.takes.toFixed(2)} ms: over ${NOTHING_MOST}, so the parts' `
        + 'times are not to be believed (another program on the GPU, or its clock unsteady)');
    }
  }
  return { lines, problems };
}

/** A whole frame part's line: the frame with it and without (by the browser's clock), what it takes and its share. */
function frameLine(name: string, cost: FrameCost): string {
  const takes = cost.on - cost.off;
  const share = cost.on > 0 ? (100 * takes) / cost.on : 0;
  return `  ${name}: ${takes.toFixed(1)} ms, ${share.toFixed(0)}% (the frame ${cost.on.toFixed(1)} with it, `
    + `${cost.off.toFixed(1)} without, the median of ${cost.frames} each)`;
}

/** Waits for the GPU to finish the frame: WebGL's commands, then the HDR output's WebGPU queue. */
async function gpuFinished(): Promise<void> {
  G.renderer.getContext().finish();
  const hdr = await hdrOutput();
  await hdr?.hdrDevice()?.queue.onSubmittedWorkDone();
}

/** The scene target's MSAA set to `samples` (made again at its next use). */
function sampleScene(samples: number): void {
  const target = renderer.sceneTarget();
  if (target.samples === samples) return;
  target.samples = samples;
  target.dispose();
}

/** The frame's canary: the frame drawn twice must read `CANARY_LEAST` times once, or the clock saw nothing. */
async function frameCanary(name: string, lines: string[], problems: string[]): Promise<void> {
  let twice = false;
  const draw = () => {
    renderer.render();
    if (twice) renderer.render();
  };
  const cost = await frameCostInTurns((on) => { twice = on; }, draw, gpuFinished, FRAME_TURNS);
  const read = cost.on / cost.off;
  lines.push(`    canary: the frame drawn twice read ${read.toFixed(2)} times once`);
  if (read < CANARY_LEAST) problems.push(`${name}: canary: the whole frame drawn twice went unseen`);
}

/** The whole frame timed with HDR's output and without, and with `level`'s MSAA and without, as lines. */
async function frameParts(level: QualityLevel): Promise<string[]> {
  const lines = ['  the whole frame, by the browser\'s clock (the GPU waited for):'];
  const draw = () => renderer.render();
  const hdr = await hdrOutput();
  if (hdr) {
    const cost = await frameCostInTurns((on) => hdr.forceHdr(on), draw, gpuFinished, FRAME_TURNS);
    const shown = hdr.hdrStatus();
    lines.push(frameLine(`  HDR's output (${shown === 'on' ? 'shown' : `not shown: ${shown}`})`, cost));
    await hdr.forceHdr(null);
  }
  const samples = QUALITY[level].msaa;
  if (samples > 0) {
    const kept = renderer.sceneTarget().samples;
    const cost = await frameCostInTurns((on) => sampleScene(on ? samples : 0), draw, gpuFinished, FRAME_TURNS);
    sampleScene(kept);
    lines.push(frameLine(`  ${QUALITY[level].label}'s MSAA, ${samples} samples a pixel, against none`, cost));
  }
  lines.push(`  (the scene's MSAA on this screen: ${renderer.sceneTarget().samples} samples)`);
  return lines;
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
  if (command.rarity) lab.glowAs(command.rarity);
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
    if (command.hero) {
      const hero = await eachOfHero(draw, TURN_RENDERS);
      lines.push(...hero.lines);
      problems.push(...hero.problems);
    }
    if (command.frame) lines.push(...await frameParts(level));
    if (command.frame && command.canary) await frameCanary(name, lines, problems);
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
