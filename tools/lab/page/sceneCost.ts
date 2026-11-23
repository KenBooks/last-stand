// tools/lab scenecost: what each kind of work in the frame takes of the GPU, at a quality level's settings and the
// screen's own pixels (the resolution is never what's cut: what each pixel costs is). The frame is drawn by the
// engine with each part taken out and put back in turns (`gpuTurns.ts`, timed by the engine's own clock), so a run's
// load falls on both sides. Its parts are the engine's (`frameParts` in src/perf/sceneParts.ts, the profile's: the
// point lights, the lamps, the sun's shadow, the lit shading against a plain colour, the bloom, the depth drawn
// first...) and what's shown or hidden (the particles, the hero, the grass, what's cut out or blended). A laptop's
// integrated GPU spent 86% of its frame on the scene at 2864x1536 (10 frames a second on Medium): this says what of
// it a level could do without. Its canary draws the frame twice, which must read as more. In the lobby's village its
// own parts too: its largest parts and the hall's heroes. It timed three's scene pass by WebGL's timer queries, with
// three's lights, shadows and materials switched, before the engine alone drew the game.
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
import { drawnWhole } from './gpuTurns';
import { frameParts, materialsOf, seeThrough, shownPart, shownWhere, type ScenePart } from '../../../src/perf/sceneParts';
import { inVillage, VILLAGE_SPOT } from './draws';
import { holdHour } from '../../../src/game/clock';

export interface SceneCostOptions {
  /** a biome, or the lobby's village */
  biome: BiomeId | 'village';
  /** in the village, where he stands (the square by default) and the way he faces (the hall by default) */
  at?: [number, number];
  facing?: number;
  /** in the village, the hour it's lit for */
  hour?: number;
  /** in the village, `--tune`'s values, set before the set-up (`meadowOrder.order=1`) */
  tune?: Record<string, number[]>;
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


/** the costliest see-through meshes `--each` lists */
const EACH_LISTED = 8;
/** `--each`'s rounds a mesh (fewer than the parts': there are dozens) */
const EACH_ROUNDS = 3;

/** A part of the frame's work, put in (`on`) or taken out, and put back as it was found. */
type Part = ScenePart;

/** a side's renders in a turn */
const TURN_RENDERS = 6;
/** the canary's scene drawn twice must take this many times the scene once, at least */
const CANARY_LEAST = 1.6;


/** the village's parts timed alone, the most triangles first */
const VILLAGE_PARTS = 10;
/** frames stepped in the village before it's timed: what it shows for where he stands (the hall's heroes, its
 *  room, the meadow) is set by its frames */
const VILLAGE_SETTLE = 30;

/** The village's group in the scene. */
const villageGroup = (): THREE.Object3D | undefined => G.scene.children.find((child) => child.name === 'village');

/** The name a mesh of the village goes under: its outermost named part below the village's group, else its own. */
function villagePartOf(mesh: THREE.Object3D, village: THREE.Object3D): string {
  let named = mesh.name;
  for (let at = mesh.parent; at && at !== village; at = at.parent) if (at.name) named = at.name;
  return named || 'loose meshes';
}

/** The village's shown meshes by its parts, the parts of the most triangles first (`VILLAGE_PARTS` of them). */
function villageMeshParts(): Part[] {
  const village = villageGroup();
  if (!village) return [];
  const parts = new Map<string, THREE.Mesh[]>();
  village.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const name = villagePartOf(mesh, village);
    parts.set(name, [...(parts.get(name) ?? []), mesh]);
  });
  const trianglesIn = (meshes: THREE.Mesh[]): number => meshes.reduce((sum, mesh) => sum + drawnTriangles(mesh), 0);
  return [...parts]
    .sort((a, b) => trianglesIn(b[1]) - trianglesIn(a[1]))
    .slice(0, VILLAGE_PARTS)
    .map(([name, meshes]) => ({
      ...shownPart('', meshes),
      name: `  ${name} (${meshes.length} meshes, ${Math.round(trianglesIn(meshes))} triangles)`,
    }));
}

/** A mesh's triangles as drawn: an instanced mesh's each instance, a geometry's draw range. */
function drawnTriangles(mesh: THREE.Mesh): number {
  const geometry = mesh.geometry as THREE.BufferGeometry & { instanceCount?: number };
  const whole = (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
  const ranged = Math.min(whole, geometry.drawRange.count / 3);
  const instanced = mesh as THREE.InstancedMesh;
  const instances = instanced.isInstancedMesh ? instanced.count : geometry.instanceCount ?? 1;
  return ranged * (Number.isFinite(instances) ? instances : 1);
}

/** The village's own parts: the hall's heroes standing on its dais, its largest parts (its lamps are the engine's
 *  parts: `frameParts`). */
function villageParts(): Part[] {
  const heroes = G.scene.children.filter((child) => /^hero /.test(child.name) && child !== G.player.obj
    && child.visible);
  return [
    shownPart('the hall\'s heroes on its dais', heroes),
    { name: 'the village\'s largest parts, each alone:', change: () => {} },
    ...villageMeshParts(),
  ];
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
    const cost = await costInTurns(part.change, draw, { rounds: EACH_ROUNDS, renders });
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

/** A part that lets the hero cast his shadows or not (the engine casts what `castShadow` says, each piece from its
 *  fewer triangles: `casterGeometry` in models/farDetail.ts). */
function heroShadowsPart(meshes: THREE.Mesh[]): Part {
  const cast = meshes.map((mesh) => mesh.castShadow);
  return {
    name: `the shadows he casts (${cast.filter(Boolean).length} meshes)`,
    change: (on) => {
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
    const cost = await costInTurns(part.change, draw, turns);
    if (cost) lines.push(`  ${partLine(part, cost)}`);
  }
  const nothing = await costInTurns(() => {}, draw, turns);
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

/**
 * `--frame`: the level's MSAA against none, as the game sets it (`setRenderQuality`: the engine's frame takes its
 * samples from the scene's, `sceneSamples`, every frame; told the engine alone, the next frame put them back and the
 * MSAA read nothing), each way's pipelines made by its first frame and waited for (`drawnWhole`), as lines. HDR's
 * output, timed here under three, is the page's own copy, which the engine's frame doesn't draw.
 */
async function msaaLines(level: QualityLevel, draw: () => void, turns: { rounds: number; renders: number }):
  Promise<string[]> {
  const preset = { ...QUALITY[level], pixels: Infinity };
  const samples = renderer.sceneSamples();
  if (samples < 2) return [`  ${preset.label} draws no MSAA on this screen`];
  // (WebGPU draws 1 or 4 samples a pixel: the engine draws 2 as 1, src/engine/STATE.md)
  if (samples < 4) return [`  ${preset.label}'s MSAA, ${samples} samples a pixel: drawn as one by the engine`];
  try {
    const cost = await costInTurns((on) => renderer.setRenderQuality({ ...preset, msaa: on ? preset.msaa : 0 }), draw,
      turns);
    if (!cost) return [];
    return [partLine({ name: `${preset.label}'s MSAA, ${samples} samples a pixel, against none`, change: () => {} },
      cost)];
  } finally {
    renderer.setRenderQuality(preset);
    await drawnWhole(draw);
  }
}

/** The level's settings, the scene rendering every pixel of the screen. */
function atFullPixels(level: QualityLevel): string {
  useQuality(level);
  renderer.setRenderQuality({ ...QUALITY[level], pixels: Infinity });
  const size = renderer.sceneSize(new THREE.Vector2());
  return `the scene ${size.x}x${size.y} (${(size.x * size.y / 1e6).toFixed(2)} Mpx), ${QUALITY[level].label}'s other `
    + 'settings';
}

/** The hero in the village where `command` stands him, at its hour, in its view, settled. */
async function standInVillage(lab: Lab, command: SceneCostOptions): Promise<void> {
  const facing = command.facing ?? Math.PI;
  await lab.setup({ view: command.view, facing, tune: command.tune });
  if (command.hour !== undefined) holdHour(command.hour);
  await inVillage(lab, command.at ?? VILLAGE_SPOT, facing);
  await lab.step(VILLAGE_SETTLE);
}

/** `lab scenecost`, one scenario: what each part of the scene pass takes of the GPU. */
export async function sceneCost(lab: Lab, command: SceneCostOptions): Promise<Report> {
  const { biome, view, level } = command;
  const name = `${biome} ${view}`;
  const settings = atFullPixels(level);
  const village = biome === 'village';
  if (village) await standInVillage(lab, command);
  else await standIn(lab, { biome, view, facing: 0 });
  if (command.rarity) lab.glowAs(command.rarity);
  const drawing = lab.drawing;
  lab.drawing = true;
  const turns = { rounds: command.rounds, renders: TURN_RENDERS };
  try {
    const draw = (): void => renderer.render();
    const lines = [`${name}: ${settings}`];
    const problems: string[] = [];
    for (const part of [...frameParts(), ...(village ? villageParts() : [])]) {
      // (a heading alone: nothing to time)
      if (part.name.endsWith(':')) {
        lines.push(`  ${part.name}`);
        continue;
      }
      try {
        const cost = await costInTurns(part.change, draw, turns);
        if (!cost) return { text: `${name}: untimed (the engine has no GPU timestamps here)`, problems: [] };
        lines.push(partLine(part, cost));
      } finally {
        part.restore?.();
      }
    }
    if (command.each) lines.push(...await eachSeeThrough(draw, TURN_RENDERS));
    if (command.hero) {
      const hero = await eachOfHero(draw, TURN_RENDERS);
      lines.push(...hero.lines);
      problems.push(...hero.problems);
    }
    if (command.frame) lines.push(...await msaaLines(level, draw, turns));
    if (command.canary) {
      const twice = await costInTurns(() => {}, draw, turns, (on) => (on ? 2 : 1));
      const read = twice ? twice.on / twice.off : 0;
      lines.push(`  canary: the frame drawn twice read ${read.toFixed(2)} times once`);
      if (read < CANARY_LEAST) problems.push(`${name}: canary: the frame drawn twice went unseen`);
    }
    return { text: lines.join('\n'), problems };
  } finally {
    lab.drawing = drawing;
  }
}
